/**
 * 消息桥：统一渲染进程与主进程的通信入口
 * 当前实现委托给 Electron ipcRenderer 或 localIpcRenderer（无 Electron 时）
 * 未来迁移到 Web 时只需替换此模块实现，业务代码不变
 */

import localIpcRenderer from '../utils/web-adapter/local-ipc-renderer'

export type IpcLike = {
  invoke?: (channel: string, ...args: any[]) => Promise<any>
  send: (channel: string, ...args: any[]) => void
  on: (channel: string, listener: (...args: any[]) => void) => void
  once?: (channel: string, listener: (...args: any[]) => void) => void
  removeListener?: (channel: string, listener: (...args: any[]) => void) => void
}

function getIpc(): IpcLike | null {
  const win = typeof window !== 'undefined' ? (window as any) : undefined
  if (win?.electron?.ipcRenderer) {
    return win.electron.ipcRenderer as IpcLike
  }
  return localIpcRenderer as IpcLike
}

/** 获取当前 IPC 实例（供需要直接访问的场景使用） */
export function getMessageIpc(): IpcLike | null {
  return getIpc()
}

/** 调用主进程 handle，返回 Promise */
export async function invoke(channel: string, ...args: any[]): Promise<any> {
  const ipc = getIpc()
  if (!ipc?.invoke) {
    return Promise.reject(new Error(`[message-bridge] IPC 不可用，无法 invoke: ${channel}`))
  }
  return ipc.invoke(channel, ...args)
}

/** 向主进程发送消息（无返回值） */
export function send(channel: string, ...args: any[]): void {
  const ipc = getIpc()
  if (!ipc?.send) {
    if (typeof console !== 'undefined') {
      console.warn('[message-bridge] IPC 不可用，无法 send:', channel)
    }
    return
  }
  ipc.send(channel, ...args)
}

/** 监听主进程发来的消息 */
export function on(channel: string, listener: (...args: any[]) => void): void {
  const ipc = getIpc()
  if (!ipc?.on) {
    if (typeof console !== 'undefined') {
      console.warn('[message-bridge] IPC 不可用，无法 on:', channel)
    }
    return
  }
  ipc.on(channel, listener)
}

/** 监听主进程发来的消息（仅一次） */
export function once(channel: string, listener: (...args: any[]) => void): void {
  const ipc = getIpc()
  if (ipc?.once) {
    ipc.once(channel, listener)
  } else if (ipc?.on) {
    const wrapper = (...args: any[]) => {
      ipc.removeListener?.(channel, wrapper)
      listener(...args)
    }
    ipc.on(channel, wrapper)
  }
}

/** 移除监听器 */
export function removeListener(channel: string, listener: (...args: any[]) => void): void {
  const ipc = getIpc()
  if (ipc?.removeListener) {
    ipc.removeListener(channel, listener)
  }
}

const messageBridge = {
  getIpc: getMessageIpc,
  invoke,
  send,
  on,
  once,
  removeListener
}

export default messageBridge
