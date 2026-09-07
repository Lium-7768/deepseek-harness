import { app, BrowserWindow, ipcMain, Menu, MenuItem, nativeImage, Tray } from 'electron'
import { dirname, join } from 'node:path'
import QRCode from 'qrcode'
import { fileURLToPath } from 'node:url'
import { MobileDeviceRegistry, MobileGateway, type MobileGatewayStatus } from '@deepseek-ai/dsh-mobile-gateway'
import {
  DshRuntime,
  type DshRuntimeLifecycleStatus,
  type DshRuntimeOptions,
  type DshRuntimeStatus,
} from './dsh-runtime.ts'
import { loadDeviceSnapshots, saveDeviceSnapshots } from './mobile-device-store.ts'

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
let mainWindow: BrowserWindow | undefined
let controlWindow: BrowserWindow | undefined
let tray: Tray | undefined
let runtime: DshRuntime | undefined
let mobileGateway: MobileGateway | undefined
let mobileGatewayStatus: MobileGatewayStatus | undefined
const DEFAULT_MOBILE_GATEWAY_PORT = 61_297
let deviceRegistry: MobileDeviceRegistry | undefined
let quitting = false

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    focusMainWindow()
  })
  void app
    .whenReady()
    .then(startDesktop)
    .catch((error: unknown) => {
      console.error('The desktop application could not start.', error)
      showRuntimeFailure(error)
    })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', (event) => {
  if (quitting) return
  event.preventDefault()
  quitting = true
  void disposeRuntime().finally(() => {
    app.quit()
  })
})

async function startDesktop(): Promise<void> {
  registerIpcHandlers()
  createTray()
  installApplicationMenu()
  deviceRegistry = new MobileDeviceRegistry(await loadDeviceSnapshots(deviceStorePath()))
  runtime = new DshRuntime(resolveDesktopRuntimeOptions())
  runtime.onStatus((status) => {
    broadcastRuntimeStatus(status)
    updateTray(status)
    if (status.state === 'error') showRuntimeFailure(status.message)
  })
  createMainWindow()
  const running = await runtime.start()
  mobileGateway = new MobileGateway({ dshUrl: running.url, devices: deviceRegistry, port: mobileGatewayPort() })
  mobileGatewayStatus = await mobileGateway.start()
  loadRuntimePage(running)
}

function registerIpcHandlers(): void {
  ipcMain.handle('dsh-desktop:runtime-status', () => requireRuntime().status())
  ipcMain.handle('dsh-desktop:mobile-gateway', () => requireMobileGatewayStatus())
  ipcMain.handle('dsh-desktop:restart-runtime', () => restartRuntime())
  ipcMain.handle('dsh-desktop:pair-device', async (_event, label: unknown) => pairDevice(label))
  ipcMain.handle('dsh-desktop:create-pairing', async (_event, label: unknown) => createPairing(label))
  ipcMain.handle('dsh-desktop:paired-devices', () => requireMobileGateway().pairedDevices())
  ipcMain.handle('dsh-desktop:revoke-device', async (_event, deviceId: unknown) => revokeDevice(deviceId))
}

async function restartRuntime(): Promise<void> {
  const ownedRuntime = requireRuntime()
  await ownedRuntime.stop()
  const running = await ownedRuntime.start()
  loadRuntimePage(running)
}

async function createPairing(label: unknown): Promise<{ qrDataUrl: string; expiresAt: string }> {
  if (typeof label !== 'string') throw new Error('A paired device label is required.')
  const offer = requireMobileGateway().createPairing(label)
  const pairingPayload = JSON.stringify({
    version: 1,
    gatewayUrl: mobileGatewayPublicUrl(),
    pairingId: offer.pairingId,
    pairingSecret: offer.pairingSecret,
    expiresAt: offer.expiresAt,
  })
  return { qrDataUrl: await QRCode.toDataURL(pairingPayload, { errorCorrectionLevel: 'M', margin: 1, width: 280 }), expiresAt: offer.expiresAt }
}

async function pairDevice(label: unknown): Promise<{ gatewayUrl: string; deviceId: string; accessToken: string }> {
  if (typeof label !== 'string') throw new Error('A paired device label is required.')
  const credential = requireMobileGateway().pairDevice(label)
  await persistDevices()
  return { gatewayUrl: mobileGatewayPublicUrl(), ...credential }
}

async function revokeDevice(deviceId: unknown): Promise<boolean> {
  if (typeof deviceId !== 'string') throw new Error('A device id is required.')
  const revoked = requireMobileGateway().revokeDevice(deviceId)
  if (revoked) await persistDevices()
  return revoked
}

function createMainWindow(): void {
  const window = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'DeepSeek Harness',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(moduleDirectory, '../preload/index.cjs'),
    },
  })
  mainWindow = window
  window.once('ready-to-show', () => {
    window.show()
  })
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = undefined
  })
}

function loadRuntimePage(status: DshRuntimeStatus): void {
  const window = mainWindow
  if (window === undefined || window.isDestroyed()) createMainWindow()
  const target = mainWindow
  if (target === undefined) return
  void target.loadURL(status.url).catch((error: unknown) => {
    showRuntimeFailure(error)
  })
}

function installApplicationMenu(): void {
  const menu = Menu.getApplicationMenu() ?? Menu.buildFromTemplate([])
  menu.insert(
    1,
    new MenuItem({
      label: 'Mobile',
      submenu: [{ label: 'Mobile devices…', click: () => {
        showControlWindow()
      } }],
    }),
  )
  Menu.setApplicationMenu(menu)
}

function showRuntimeFailure(error: unknown): void {
  if (quitting) return
  if (mainWindow === undefined || mainWindow.isDestroyed()) createMainWindow()
  const window = mainWindow
  if (window === undefined) return
  const message = error instanceof Error ? error.message : String(error)
  void window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(runtimeFailurePage(message))}`)
}

function focusMainWindow(): void {
  if (mainWindow === undefined || mainWindow.isDestroyed()) {
    createMainWindow()
    const current = runtime?.status()
    if (current?.state === 'running') loadRuntimePage(current)
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function createTray(): void {
  tray = new Tray(nativeImage.createFromPath(join(process.resourcesPath, 'electron.icns')))
  tray.setToolTip('DeepSeek Harness')
  updateTray({ state: 'stopped' })
}

function updateTray(status: DshRuntimeLifecycleStatus): void {
  const menu = Menu.buildFromTemplate([
    { label: `DSH: ${status.state}`, enabled: false },
    { label: 'Open DeepSeek Harness', click: focusMainWindow },
    { label: 'Mobile devices…', click: showControlWindow },
    { type: 'separator' },
    { label: 'Quit', click: () => {
      app.quit()
    } },
  ])
  tray?.setContextMenu(menu)
  tray?.setToolTip(status.state === 'running' ? 'DeepSeek Harness is running' : `DeepSeek Harness: ${status.state}`)
}

function showControlWindow(): void {
  if (controlWindow !== undefined && !controlWindow.isDestroyed()) {
    controlWindow.show()
    controlWindow.focus()
    return
  }
  const window = new BrowserWindow({
    width: 620,
    height: 720,
    title: 'Mobile devices',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(moduleDirectory, '../preload/index.cjs'),
    },
  })
  controlWindow = window
  window.on('closed', () => {
    if (controlWindow === window) controlWindow = undefined
  })
  void window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(controlPage())}`)
}

function broadcastRuntimeStatus(status: DshRuntimeLifecycleStatus): void {
  for (const window of [mainWindow, controlWindow]) {
    if (window !== undefined && !window.isDestroyed()) window.webContents.send('dsh-desktop:runtime-status', status)
  }
}

function requireRuntime(): DshRuntime {
  if (runtime === undefined) throw new Error('The local DSH runtime is not available.')
  return runtime
}

function requireMobileGateway(): MobileGateway {
  if (mobileGateway === undefined) throw new Error('The local Mobile Gateway is not available.')
  return mobileGateway
}

function requireMobileGatewayStatus(): MobileGatewayStatus {
  if (mobileGatewayStatus === undefined) throw new Error('The local Mobile Gateway is not available.')
  return mobileGatewayStatus
}

async function persistDevices(): Promise<void> {
  const registry = deviceRegistry
  if (registry === undefined) throw new Error('The mobile device registry is not available.')
  await saveDeviceSnapshots(deviceStorePath(), registry.snapshot())
}

function deviceStorePath(): string {
  return join(app.getPath('userData'), 'mobile-devices.json')
}

function mobileGatewayPort(): number {
  const configured = Number(process.env.DSH_MOBILE_GATEWAY_PORT)
  return Number.isInteger(configured) && configured >= 1 && configured <= 65_535
    ? configured
    : DEFAULT_MOBILE_GATEWAY_PORT
}

function mobileGatewayPublicUrl(): string {
  return process.env.DSH_MOBILE_GATEWAY_PUBLIC_URL ?? requireMobileGatewayStatus().url
}

function resolveDesktopRuntimeOptions(): DshRuntimeOptions {
  const cwd = resolveDesktopWorkingDirectory()
  if (app.isPackaged)
    return {
      command: process.execPath,
      commandArgs: [
        '--expose-internals',
        join(process.resourcesPath, 'dsh-runtime', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
      ],
      environment: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    }
  if (cwd === undefined || process.env.DSH_DESKTOP_COMMAND !== undefined) return cwd === undefined ? {} : { cwd }
  return {
    command: process.execPath,
    commandArgs: ['--expose-internals', '--import', 'tsx/esm', join(cwd, 'apps/cli/src/bin.ts')],
    cwd,
    environment: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  }
}

function resolveDesktopWorkingDirectory(): string | undefined {
  if (app.isPackaged) return undefined
  return process.env.DSH_DESKTOP_CWD ?? join(app.getAppPath(), '../..')
}

async function disposeRuntime(): Promise<void> {
  const gateway = mobileGateway
  mobileGateway = undefined
  mobileGatewayStatus = undefined
  await gateway?.stop()
  const ownedRuntime = runtime
  runtime = undefined
  await ownedRuntime?.stop()
  tray?.destroy()
  tray = undefined
}

function runtimeFailurePage(_message: string): string {
  return '<!doctype html><html><body style="font-family:-apple-system,sans-serif;padding:40px"><h1>DeepSeek Harness could not start</h1><p>The local runtime stopped or could not be reached.</p><button id="restart">Restart local runtime</button><script>document.getElementById("restart").addEventListener("click",()=>void window.dshDesktop.restartRuntime())</script></body></html>'
}

function controlPage(): string {
  return '<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,sans-serif;margin:32px;line-height:1.45;color:#171717}input,button{font:inherit;padding:8px}input{width:100%;box-sizing:border-box;margin:8px 0}button{cursor:pointer}#pairing{align-items:center;background:#f4f4f5;border-radius:12px;display:flex;flex-direction:column;gap:10px;margin-top:16px;padding:18px;text-align:center}#qr{background:#fff;border-radius:8px;display:block;height:280px;width:280px}#pairing p{margin:0;max-width:360px}li{margin:10px 0;display:flex;gap:8px;align-items:center}li span{flex:1}.muted{color:#666}</style></head><body><h1>Mobile devices</h1><p id="runtime">Checking runtime…</p><form id="pair"><label>Device name<input id="label" required maxlength="120" value="My phone"></label><button>Show pairing QR code</button></form><section id="pairing" hidden><img id="qr" alt="Scan this QR code in DeepSeek Harness mobile"><strong>Scan this code in the mobile app</strong><p id="expiry" class="muted"></p><p class="muted">The code is valid for five minutes and can be used only once. The desktop does not display or retain the long-lived mobile access token.</p></section><h2>Paired devices</h2><ul id="devices"></ul><script>const api=window.dshDesktop;const runtime=document.getElementById("runtime");const pairing=document.getElementById("pairing");const qr=document.getElementById("qr");const expiry=document.getElementById("expiry");const devices=document.getElementById("devices");async function refresh(){const status=await api.runtimeStatus();runtime.textContent="DSH status: "+status.state;const records=await api.pairedDevices();devices.replaceChildren(...records.map(device=>{const item=document.createElement("li");const text=document.createElement("span");text.textContent=device.label+" — paired "+device.createdAt+(device.revokedAt?" — revoked":"");const revoke=document.createElement("button");revoke.textContent=device.revokedAt?"Revoked":"Revoke";revoke.disabled=Boolean(device.revokedAt);revoke.addEventListener("click",async()=>{await api.revokeDevice(device.deviceId);await refresh()});item.append(text,revoke);return item}))}document.getElementById("pair").addEventListener("submit",async event=>{event.preventDefault();const label=document.getElementById("label").value;const result=await api.createPairing(label);qr.src=result.qrDataUrl;expiry.textContent="Expires at "+new Date(result.expiresAt).toLocaleTimeString();pairing.hidden=false});api.onRuntimeStatus(status=>{runtime.textContent="DSH status: "+status.state});void refresh()</script></body></html>'
}
