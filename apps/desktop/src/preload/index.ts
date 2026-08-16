import { contextBridge, ipcRenderer } from 'electron'

export type DesktopRuntimeStatus = { state: 'starting'; url: string } | { state: 'running'; url: string; pid: number } | { state: 'stopped' } | { state: 'error'; message: string }

export interface DesktopMobileGatewayInfo {
  url: string
}

export interface DesktopMobileDevice {
  deviceId: string
  label: string
  createdAt: string
  revokedAt?: string
}

export interface DesktopPairingCredential {
  gatewayUrl: string
  deviceId: string
  accessToken: string
}

contextBridge.exposeInMainWorld('dshDesktop', {
  runtimeStatus: (): Promise<DesktopRuntimeStatus> => ipcRenderer.invoke('dsh-desktop:runtime-status'),
  mobileGateway: (): Promise<DesktopMobileGatewayInfo> => ipcRenderer.invoke('dsh-desktop:mobile-gateway'),
  restartRuntime: (): Promise<void> => ipcRenderer.invoke('dsh-desktop:restart-runtime'),
  pairDevice: (label: string): Promise<DesktopPairingCredential> => ipcRenderer.invoke('dsh-desktop:pair-device', label),
  pairedDevices: (): Promise<readonly DesktopMobileDevice[]> => ipcRenderer.invoke('dsh-desktop:paired-devices'),
  revokeDevice: (deviceId: string): Promise<boolean> => ipcRenderer.invoke('dsh-desktop:revoke-device', deviceId),
  onRuntimeStatus: (listener: (status: DesktopRuntimeStatus) => void): (() => void) => {
    const channel = 'dsh-desktop:runtime-status'
    const receiver = (_event: Electron.IpcRendererEvent, status: DesktopRuntimeStatus): void => listener(status)
    ipcRenderer.on(channel, receiver)
    return () => ipcRenderer.removeListener(channel, receiver)
  },
})
