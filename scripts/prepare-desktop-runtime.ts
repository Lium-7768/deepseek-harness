/** Prepare a self-contained DSH runtime for the packaged desktop application. */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { cp, mkdir, readFile, rename, rm } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'

interface PackageManifest { dependencies?: Record<string, string> }

const root = resolve(import.meta.dirname, '..')
const staging = join(root, 'apps/desktop/.runtime')
const sourceModules = join(root, 'apps/desktop-runtime/node_modules')

/** Create a portable production dependency directory for electron-builder. */
async function main(): Promise<void> {
  await rm(staging, { recursive: true, force: true })
  await run('pnpm', ['--filter', '@deepseek-ai/dsh-desktop-runtime', 'deploy', '--legacy', '--prod', '--config.node-linker=hoisted', '--config.auto-install-peers=false', '--config.link-workspace-packages=true', staging])
  const manifest = JSON.parse(await readFile(join(staging, 'package.json'), 'utf8')) as PackageManifest
  for (const name of Object.keys(manifest.dependencies ?? {}).sort()) {
    const destination = join(staging, 'node_modules', name)
    if (!existsSync(destination)) await copyModule(join(sourceModules, name), destination)
  }
  await materializeVendorModule('cosmokit')
  await materializeVendorModule('schemastery')
  const modules = join(staging, 'node_modules')
  const cli = join(modules, '@deepseek-ai/dsh/lib/bin.js')
  if (!existsSync(cli)) throw new Error('desktop runtime CLI is missing')
  await rename(modules, join(staging, 'modules'))
  console.log('desktop runtime staged at ' + staging)
}

/** Copy a package while using the staged flat node_modules directory for dependencies. */
async function copyModule(source: string, destination: string): Promise<void> {
  if (!existsSync(source)) throw new Error('desktop runtime dependency is missing: ' + source)
  const nested = join(source, 'node_modules')
  await mkdir(dirname(destination), { recursive: true })
  await cp(source, destination, { recursive: true, dereference: true, filter: path => path !== nested && !path.startsWith(nested + sep) })
}

/** Copy a vendored module whose workspace override is otherwise an external link. */
async function materializeVendorModule(name: string): Promise<void> {
  const destination = join(staging, 'node_modules/@deepseek-ai', name)
  await rm(destination, { recursive: true, force: true })
  await copyModule(join(root, 'vendor', name), destination)
}

/** Run a command and reject when it exits unsuccessfully. */
function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit' })
    child.once('error', rejectRun)
    child.once('exit', code => code === 0 ? resolveRun() : rejectRun(new Error(command + ' exited with code ' + String(code))))
  })
}

await main()
