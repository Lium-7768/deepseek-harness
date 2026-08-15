import { app, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { MobileGateway, type MobileGatewayStatus } from '@deepseek-ai/dsh-mobile-gateway'
import { DshRuntime, type DshRuntimeStatus } from './dsh-runtime.ts'

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
let mainWindow: BrowserWindow | undefined
let runtime: DshRuntime | undefined
let runtimeStatus: DshRuntimeStatus | undefined
let mobileGateway: MobileGateway | undefined
let mobileGatewayStatus: MobileGatewayStatus | undefined
let quitting = false

void app.whenReady().then(async () => {
  runtime = new DshRuntime(resolveDesktopRuntimeOptions())
  runtimeStatus = await runtime.start()
  mobileGateway = new MobileGateway({ dshUrl: runtimeStatus.url })
  mobileGatewayStatus = await mobileGateway.start()
  createMainWindow(runtimeStatus.url)

  ipcMain.handle('dsh-desktop:runtime', () => requireRuntimeStatus())
  ipcMain.handle('dsh-desktop:mobile-gateway', () => requireMobileGatewayStatus())
  ipcMain.handle('dsh-desktop:reload', () => mainWindow?.reload())
  app.on('activate', () => {
    if (mainWindow === undefined || mainWindow.isDestroyed()) createMainWindow(requireRuntimeStatus().url)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', (event) => {
  if (quitting) return
  event.preventDefault()
  quitting = true
  void disposeRuntime().finally(() => app.quit())
})

function createMainWindow(url: string): void {
  const window = new BrowserWindow({
    width: 1_360,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'DeepSeek Harness',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(moduleDirectory, '../preload/index.js'),
    },
  })
  mainWindow = window
  window.once('ready-to-show', () => window.show())
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = undefined
  })
  void window.loadURL(url).catch(error => showStartupFailure(window, error))
}

function resolveDesktopRuntimeOptions(): ConstructorParameters<typeof DshRuntime>[0] {
  const cwd = resolveDesktopWorkingDirectory()
  if (app.isPackaged || cwd === undefined || process.env.DSH_DESKTOP_COMMAND !== undefined) return { cwd }
  return {
    command: process.execPath,
    commandArgs: ['--import', 'tsx/esm', join(cwd, 'apps/cli/src/bin.ts')],
    cwd,
    environment: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  }
}

function resolveDesktopWorkingDirectory(): string | undefined {
  if (app.isPackaged) return undefined
  return process.env.DSH_DESKTOP_CWD ?? resolve(app.getAppPath(), '../..')
}

function requireRuntimeStatus(): DshRuntimeStatus {
  if (runtimeStatus === undefined) throw new Error('The local DSH runtime is not available.')
  return runtimeStatus
}

function requireMobileGatewayStatus(): MobileGatewayStatus {
  if (mobileGatewayStatus === undefined) throw new Error('The local Mobile Gateway is not available.')
  return mobileGatewayStatus
}

async function disposeRuntime(): Promise<void> {
  const ownedGateway = mobileGateway
  mobileGateway = undefined
  mobileGatewayStatus = undefined
  await ownedGateway?.stop()
  const ownedRuntime = runtime
  runtime = undefined
  runtimeStatus = undefined
  await ownedRuntime?.stop()
}

function showStartupFailure(window: BrowserWindow, error: unknown): Promise<void> {
  const description = error instanceof Error ? error.message : String(error)
  const document = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:40px"><h1>DeepSeek Harness could not open</h1><p>${escapeHtml(description)}</p><p>Install the <code>dsh</code> command or set <code>DSH_DESKTOP_COMMAND</code> before launching the desktop app.</p></body></html>`
  return window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(document)}`)
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character)
}
