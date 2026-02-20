/**
 * 主进程 IPC 桥：统一 IPC 通道注册入口
 * 当前实现委托给 Electron ipcMain，未来迁移到 Web 时只需替换此模块实现
 */

import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'

export type InvokeHandler = (
  event: IpcMainInvokeEvent,
  ...args: any[]
) => Promise<unknown> | unknown

export type OnHandler = (event: IpcMainEvent, ...args: any[]) => void

export const ipcBridge = {
  registerHandle(channel: string, handler: InvokeHandler): void {
    ipcMain.handle(channel, handler as any)
  },

  registerOn(channel: string, handler: OnHandler): void {
    ipcMain.on(channel, handler as any)
  },

  registerOnce(channel: string, handler: OnHandler): void {
    ipcMain.once(channel, handler as any)
  },

  removeListener(channel: string, handler: (...args: any[]) => void): void {
    ipcMain.removeListener(channel, handler as any)
  }
}

export default ipcBridge
