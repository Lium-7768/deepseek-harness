import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createServer } from 'node:net'

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_STARTUP_TIMEOUT_MS = 20_000
const LOOPBACK_ENVIRONMENT_KEYS = ['APPDATA', 'COMSPEC', 'ELECTRON_RUN_AS_NODE', 'HOME', 'LANG', 'LC_ALL', 'LOCALAPPDATA', 'PATH', 'SHELL', 'SystemRoot', 'TEMP', 'TMPDIR', 'USER', 'USERPROFILE'] as const

/** A ready local DSH Web runtime. */
export interface DshRuntimeStatus {
  state: 'running'
  url: string
  pid: number
}

/** A renderer-safe DSH lifecycle state. */
export type DshRuntimeLifecycleStatus = DshRuntimeStatus | { state: 'starting'; url: string } | { state: 'stopped' } | { state: 'error'; message: string }

/** Receives DSH lifecycle status updates. */
export type DshRuntimeStatusListener = (status: DshRuntimeLifecycleStatus) => void

/** Launch configuration for the local DSH process. */
export interface DshRuntimeOptions {
  command?: string
  commandArgs?: readonly string[]
  cwd?: string
  environment?: NodeJS.ProcessEnv
  host?: string
  port?: number
  startupTimeoutMs?: number
}

/** Owns one loopback-only DSH Web child process for the Electron application. */
export class DshRuntime {
  #child: ChildProcessWithoutNullStreams | undefined
  #status: DshRuntimeLifecycleStatus = { state: 'stopped' }
  #listeners = new Set<DshRuntimeStatusListener>()
  #port: number | undefined
  readonly #options: DshRuntimeOptions

  /** @param options - Launch configuration for the local DSH process. */
  constructor(options: DshRuntimeOptions = {}) {
    this.#options = options
  }

  /** Returns the latest renderer-safe lifecycle state. */
  status(): DshRuntimeLifecycleStatus {
    return this.#status
  }

  /** Registers a lifecycle listener and returns its removal callback. */
  onStatus(listener: DshRuntimeStatusListener): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  /** Starts DSH and resolves after its loopback Web endpoint responds. */
  async start(): Promise<DshRuntimeStatus> {
    if (this.#status.state === 'running') return this.#status
    if (this.#status.state === 'starting') throw new Error('DSH is already starting.')
    const host = this.#options.host ?? DEFAULT_HOST
    if (host !== DEFAULT_HOST && host !== 'localhost') throw new Error('The desktop runtime only permits a loopback DSH listener.')
    const port = this.#port ?? this.#options.port ?? await reserveLoopbackPort()
    this.#port = port
    const url = `http://${host}:${port}`
    this.#publish({ state: 'starting', url })
    const command = this.#options.command ?? process.env.DSH_DESKTOP_COMMAND ?? 'dsh'
    const commandArgs = this.#options.commandArgs ?? parseCommandArgs(process.env.DSH_DESKTOP_COMMAND_ARGS)
    const child = spawn(command, [...commandArgs, 'web', '--host', host, '--port', String(port)], {
      cwd: this.#options.cwd,
      env: createChildEnvironment(this.#options.environment ?? process.env),
      stdio: 'pipe',
      windowsHide: true,
    })
    this.#child = child
    try {
      await waitForHttpReady(url, child, this.#options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS)
      if (child.pid === undefined) throw new Error('DSH exited before the desktop application could record its process id.')
      const status: DshRuntimeStatus = { state: 'running', url, pid: child.pid }
      this.#publish(status)
      this.#watchChild(child)
      return status
    } catch (error) {
      await terminateChild(child)
      if (this.#child === child) this.#child = undefined
      this.#publish({ state: 'error', message: errorMessage(error) })
      throw error
    }
  }

  /** Stops the child process and waits until it has exited. */
  async stop(): Promise<void> {
    const child = this.#child
    this.#child = undefined
    if (child !== undefined) await terminateChild(child)
    this.#publish({ state: 'stopped' })
  }

  #watchChild(child: ChildProcessWithoutNullStreams): void {
    child.once('error', error => this.#recordFailure(child, errorMessage(error)))
    child.once('exit', (code, signal) => {
      const message = signal === null
        ? `DSH stopped unexpectedly with exit code ${code ?? 'unknown'}.`
        : `DSH stopped unexpectedly after receiving ${signal}.`
      this.#recordFailure(child, message)
    })
  }

  #recordFailure(child: ChildProcessWithoutNullStreams, message: string): void {
    if (this.#child !== child) return
    this.#child = undefined
    this.#publish({ state: 'error', message })
  }

  #publish(status: DshRuntimeLifecycleStatus): void {
    this.#status = status
    for (const listener of this.#listeners) {
      try {
        listener(status)
      } catch (error) {
        console.error('A DSH runtime status listener failed.', error)
      }
    }
  }
}

/** Returns only operating-system values required by the DSH child process. */
function createChildEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(LOOPBACK_ENVIRONMENT_KEYS.flatMap(key => source[key] === undefined ? [] : [[key, source[key]]]))
}

/** Parses an optional JSON array supplied for an installed DSH command wrapper. */
function parseCommandArgs(value: string | undefined): readonly string[] {
  if (value === undefined || value.trim() === '') return []
  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed) || parsed.some(argument => typeof argument !== 'string')) throw new Error('DSH_DESKTOP_COMMAND_ARGS must be a JSON array of strings.')
  return parsed
}

async function reserveLoopbackPort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, DEFAULT_HOST, () => resolve())
  })
  const address = server.address()
  await new Promise<void>((resolve, reject) => server.close(error => error === undefined ? resolve() : reject(error)))
  if (address === null || typeof address === 'string') throw new Error('The operating system did not return a loopback port.')
  return address.port
}

async function waitForHttpReady(url: string, child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastFailure = 'no response received'
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`DSH exited before opening ${url}.`)
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) })
      if (response.ok) return
      lastFailure = `received HTTP ${response.status}`
    } catch (error) {
      lastFailure = errorMessage(error)
    }
    await delay(200)
  }
  throw new Error(`Timed out waiting for DSH at ${url}: ${lastFailure}.`)
}

async function terminateChild(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  const exited = onceExit(child)
  child.kill('SIGTERM')
  const graceful = await Promise.race([exited.then(() => true), delay(5_000).then(() => false)])
  if (!graceful && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL')
    await exited
  }
}

function onceExit(child: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise(resolve => child.once('exit', () => resolve()))
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
