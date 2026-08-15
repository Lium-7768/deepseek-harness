import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createServer } from 'node:net'

export interface DshRuntimeOptions {
  command?: string
  commandArgs?: readonly string[]
  cwd?: string
  environment?: NodeJS.ProcessEnv
  host?: string
  port?: number
  startupTimeoutMs?: number
}

export interface DshRuntimeStatus {
  url: string
  pid: number
}

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_STARTUP_TIMEOUT_MS = 20_000
const LOOPBACK_ENVIRONMENT_KEYS = [
  'APPDATA', 'COMSPEC', 'ELECTRON_RUN_AS_NODE', 'HOME', 'LANG', 'LC_ALL', 'LOCALAPPDATA', 'PATH', 'SHELL', 'SystemRoot', 'TEMP', 'TMPDIR', 'USER', 'USERPROFILE',
] as const

/** Owns one loopback-only DSH Web child process for the Electron application. */
export class DshRuntime {
  #child: ChildProcessWithoutNullStreams | undefined
  #status: DshRuntimeStatus | undefined
  readonly #options: DshRuntimeOptions

  /** @param options - Launch configuration for the local DSH process. */
  constructor(options: DshRuntimeOptions = {}) {
    this.#options = options
  }

  /** Starts DSH once and resolves after its loopback Web endpoint responds. */
  async start(): Promise<DshRuntimeStatus> {
    if (this.#status !== undefined) return this.#status
    const host = this.#options.host ?? DEFAULT_HOST
    if (host !== DEFAULT_HOST && host !== 'localhost') throw new Error('The desktop runtime only permits a loopback DSH listener.')
    const port = this.#options.port ?? await reserveLoopbackPort()
    const command = this.#options.command ?? process.env.DSH_DESKTOP_COMMAND ?? 'dsh'
    const commandArgs = this.#options.commandArgs ?? parseCommandArgs(process.env.DSH_DESKTOP_COMMAND_ARGS)
    const child = spawn(command, [...commandArgs, 'web', '--host', host, '--port', String(port)], {
      cwd: this.#options.cwd,
      env: createChildEnvironment(this.#options.environment ?? process.env),
      stdio: 'pipe',
      windowsHide: true,
    })
    this.#child = child
    const url = `http://${host}:${port}`
    try {
      await waitForHttpReady(url, child, this.#options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS)
    } catch (error) {
      await this.stop()
      throw error
    }
    if (child.pid === undefined) {
      await this.stop()
      throw new Error('DSH exited before the desktop application could record its process id.')
    }
    const status = { url, pid: child.pid }
    this.#status = status
    return status
  }

  /** Stops the child process and waits until it has exited. */
  async stop(): Promise<void> {
    const child = this.#child
    this.#child = undefined
    this.#status = undefined
    if (child === undefined || child.exitCode !== null || child.signalCode !== null) return
    const exited = onceExit(child)
    child.kill('SIGTERM')
    const graceful = await Promise.race([exited.then(() => true), delay(5_000).then(() => false)])
    if (!graceful && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL')
      await exited
    }
  }
}

/** Returns only the operating-system values required by the DSH child process. */
export function createChildEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(LOOPBACK_ENVIRONMENT_KEYS.flatMap(key => source[key] === undefined ? [] : [[key, source[key]]]))
}

/** Parses an optional JSON array supplied for an installed DSH command wrapper. */
export function parseCommandArgs(value: string | undefined): readonly string[] {
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
      lastFailure = error instanceof Error ? error.message : String(error)
    }
    await delay(200)
  }
  throw new Error(`Timed out waiting for DSH at ${url}: ${lastFailure}.`)
}

function onceExit(child: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise(resolve => child.once('exit', () => resolve()))
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}
