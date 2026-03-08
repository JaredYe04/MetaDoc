import { BrowserWindow } from 'electron'

export type ServiceName = 'express' | 'rag'
export type ServiceState = 'idle' | 'loading' | 'ready' | 'error'

export interface ServiceStatusInfo {
  state: ServiceState
  error?: string
}

export type ServiceStatusMap = Record<ServiceName, ServiceStatusInfo>

const statusMap: ServiceStatusMap = {
  express: { state: 'idle' },
  rag: { state: 'idle' }
}

const cloneStatus = (): ServiceStatusMap => ({
  express: { ...statusMap.express },
  rag: { ...statusMap.rag }
})

const broadcastStatus = (): void => {
  const snapshot = cloneStatus()
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send('service-status-updated', snapshot)
    }
  })
}

export const updateServiceStatus = (
  service: ServiceName,
  state: ServiceState,
  error?: string
): void => {
  statusMap[service] = { state, error }
  broadcastStatus()
}

export const getServiceStatus = (): ServiceStatusMap => cloneStatus()

export const broadcastServiceStatus = (): void => {
  broadcastStatus()
}
