import { contextBridge, ipcRenderer } from 'electron'

export interface DesktopRuntimeInfo {
  url: string
  pid: number
}

export interface DesktopMobileGatewayInfo {
  url: string
}

contextBridge.exposeInMainWorld('dshDesktop', {
  runtime: (): Promise<DesktopRuntimeInfo> => ipcRenderer.invoke('dsh-desktop:runtime'),
  mobileGateway: (): Promise<DesktopMobileGatewayInfo> => ipcRenderer.invoke('dsh-desktop:mobile-gateway'),
  reload: (): Promise<void> => ipcRenderer.invoke('dsh-desktop:reload'),
})
