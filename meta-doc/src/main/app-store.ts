/**
 * 应用级 electron-store 单例，供 main-calls 与 Steam 同步等模块共享，避免多实例争用同一配置文件。
 */
import Store from 'electron-store'

export const appStore = new Store()
