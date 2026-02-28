/**
 * Agent Tool 公共服务接口
 *
 * 为外部 Tool 提供统一的运行时服务接口，包括：
 * - 主题状态（themeState）
 * - 国际化服务（i18n）
 * - 工作区服务（workspace）
 * - 本地 IPC 接口（文件操作等）
 *
 * 注意：内部 Tool 可以直接导入这些服务，此接口主要用于外部 Tool 扩展。
 */

import { themeState } from '../themes'
import { useWorkspace } from '../../stores/workspace'
import { useActiveDocument } from '../../composables/useActiveDocument'
import { isElectronEnv } from '../event-bus'
import messageBridge from '../../bridge/message-bridge'

/**
 * 主题服务接口
 */
export interface ThemeService {
  /**
   * 获取当前主题
   */
  getCurrentTheme(): {
    type: 'light' | 'dark'
    background: string
    background2nd: string
    textColor: string
    textColor2: string
    [key: string]: any
  }

  /**
   * 监听主题变化
   * @param callback 主题变化回调
   * @returns 取消监听的函数
   */
  onThemeChange(callback: (theme: any) => void): () => void
}

/**
 * 国际化服务接口
 */
export interface I18nService {
  /**
   * 获取当前语言代码
   */
  getCurrentLocale(): string

  /**
   * 翻译文本
   * @param key 翻译键（支持嵌套，如 'agent.tool.status.running'）
   * @param params 参数对象（用于插值，如 { count: 5 }）
   * @returns 翻译后的文本
   */
  t(key: string, params?: Record<string, any>): string

  /**
   * 监听语言变化
   * @param callback 语言变化回调
   * @returns 取消监听的函数
   */
  onLocaleChange(callback: (locale: string) => void): () => void
}

/**
 * 工作区服务接口
 */
export interface WorkspaceService {
  /**
   * 获取当前活动文档
   */
  getActiveDocument(): {
    id: string
    path: string
    format: 'md' | 'tex'
    markdown: string
    tex: string
    meta: any
    outline: any
  } | null

  /**
   * 获取所有标签页
   */
  getTabs(): Array<{
    id: string
    title: string
    path: string
    format: 'md' | 'tex'
  }>

  /**
   * 获取当前打开的文档 Tab 列表（仅 kind === 'file' | 'new'，不含系统/工具 Tab）
   */
  getDocumentTabs(): Array<{
    id: string
    title: string
    path: string
    format: string
  }>

  /**
   * 获取工作区轻量级文件列表（用于系统上下文注入，限制深度与条数）
   * @param options maxDepth 最大递归深度，maxEntries 最大条目数
   */
  getWorkspaceFileList(options?: {
    maxDepth?: number
    maxEntries?: number
  }): Promise<Array<{ path: string; isDirectory: boolean }>>

  /**
   * 获取当前活动标签页 ID
   */
  getActiveTabId(): string | null

  /**
   * 监听文档变化
   * @param callback 文档变化回调
   * @returns 取消监听的函数
   */
  onDocumentChange(callback: (document: any) => void): () => void

  /**
   * 获取当前所有工作区根目录（文件夹工作区）
   * 如果用户未打开任何工作区，则返回空数组
   */
  getWorkspaceRoots(): string[]

  /**
   * 列出指定目录下的文件和子目录（非递归）
   * @param dirPath 目录路径
   */
  listDirectory(
    dirPath: string
  ): Promise<Array<{ name: string; path: string; isDirectory: boolean }>>

  /**
   * 在指定目录下创建文件
   */
  createFile(parentPath: string, fileName: string, content?: string): Promise<string>

  /**
   * 在指定目录下创建子目录
   */
  createDirectory(parentPath: string, folderName: string): Promise<string>

  /**
   * 删除文件或文件夹
   */
  deletePath(targetPath: string): Promise<void>

  /**
   * 重命名文件或文件夹
   */
  renamePath(oldPath: string, newName: string): Promise<string>

  /**
   * 复制文件或文件夹
   */
  copyPath(sourcePath: string, targetPath: string): Promise<void>

  /**
   * 移动文件或文件夹
   */
  movePath(sourcePath: string, targetPath: string): Promise<void>
}

/**
 * IPC 服务接口
 */
export interface IpcService {
  /**
   * 打开文件对话框
   * @param options 对话框选项
   * @returns 选中的文件路径（如果取消则返回 null）
   */
  showOpenDialog(options?: {
    title?: string
    defaultPath?: string
    filters?: Array<{ name: string; extensions: string[] }>
    properties?: Array<'openFile' | 'openDirectory' | 'multiSelections'>
  }): Promise<string | string[] | null>

  /**
   * 打开保存文件对话框
   * @param options 对话框选项
   * @returns 保存的文件路径（如果取消则返回 null）
   */
  showSaveDialog(options?: {
    title?: string
    defaultPath?: string
    filters?: Array<{ name: string; extensions: string[] }>
  }): Promise<string | null>

  /**
   * 打开文件夹（在系统文件管理器中）
   * @param path 文件夹路径
   */
  openFolder(path: string): Promise<void>

  /**
   * 打开文件（使用系统默认应用）
   * @param path 文件路径
   */
  openFile(path: string): Promise<void>

  /**
   * 读取文件内容
   * @param filePath 文件路径
   * @returns 文件内容（UTF-8）
   */
  readFile(filePath: string): Promise<string>

  /**
   * 写入文件内容
   * @param filePath 文件路径
   * @param content 文件内容
   */
  writeFile(filePath: string, content: string): Promise<void>

  /**
   * 检查文件是否存在
   * @param filePath 文件路径
   * @returns 是否存在
   */
  fileExists(filePath: string): Promise<boolean>

  /**
   * 获取文件所在目录路径
   * @param filePath 文件路径
   * @returns 目录路径
   */
  getDirectoryPath(filePath: string): Promise<string>
}

/**
 * Agent Tool 服务管理器
 * 提供统一的运行时服务接口
 */
class AgentToolServices {
  private static instance: AgentToolServices

  private themeService: ThemeService
  private i18nService: I18nService
  private workspaceService: WorkspaceService
  private ipcService: IpcService

  private constructor() {
    this.themeService = this.createThemeService()
    this.i18nService = this.createI18nService()
    this.workspaceService = this.createWorkspaceService()
    this.ipcService = this.createIpcService()
  }

  static getInstance(): AgentToolServices {
    if (!AgentToolServices.instance) {
      AgentToolServices.instance = new AgentToolServices()
    }
    return AgentToolServices.instance
  }

  /**
   * 获取主题服务
   */
  getThemeService(): ThemeService {
    return this.themeService
  }

  /**
   * 获取国际化服务
   */
  getI18nService(): I18nService {
    return this.i18nService
  }

  /**
   * 获取工作区服务
   */
  getWorkspaceService(): WorkspaceService {
    return this.workspaceService
  }

  /**
   * 获取 IPC 服务
   */
  getIpcService(): IpcService {
    return this.ipcService
  }

  /**
   * 创建主题服务
   */
  private createThemeService(): ThemeService {
    return {
      getCurrentTheme: () => {
        return { ...themeState.currentTheme }
      },

      onThemeChange: (callback) => {
        // 使用 Vue 的 watch 监听 themeState 变化
        // 注意：这需要在 Vue 组件中使用，外部 Tool 可以通过轮询或事件总线实现
        const unwatch = (themeState as any).__watch?.(callback)
        return unwatch || (() => {})
      }
    }
  }

  /**
   * 创建国际化服务
   */
  private createI18nService(): I18nService {
    // 动态导入 i18n，避免循环依赖
    let currentLocale = 'zh_cn'
    let i18nInstance: any = null

    // 延迟初始化 i18n
    const initI18n = () => {
      if (!i18nInstance && typeof window !== 'undefined') {
        try {
          // 尝试从全局获取 i18n 实例（如果应用已初始化）
          const app = (window as any).__VUE_APP__
          if (
            app &&
            app.config &&
            app.config.globalProperties &&
            app.config.globalProperties.$i18n
          ) {
            i18nInstance = app.config.globalProperties.$i18n
            currentLocale = i18nInstance.locale.value || 'zh_cn'
          }
        } catch (error) {
          console.warn('无法初始化 i18n 服务:', error)
        }
      }
      return i18nInstance
    }

    return {
      getCurrentLocale: () => {
        initI18n()
        return currentLocale
      },

      t: (key: string, params?: Record<string, any>) => {
        initI18n()
        if (!i18nInstance) {
          // 如果 i18n 未初始化，返回 key
          return key
        }
        try {
          return i18nInstance.global.t(key, params || {})
        } catch (error) {
          console.warn(`翻译键 "${key}" 不存在`, error)
          return key
        }
      },

      onLocaleChange: (callback) => {
        // 监听 i18n 语言变化
        // 注意：这需要在 Vue 组件中使用，外部 Tool 可以通过轮询或事件总线实现
        return () => {}
      }
    }
  }

  /**
   * 创建工作区服务
   */
  private createWorkspaceService(): WorkspaceService {
    const workspace = useWorkspace()
    const { activeDocument } = useActiveDocument()

    const listDir = async (dirPath: string) => {
      if (!isElectronEnv() || !messageBridge.getIpc()) return []
      const entries = (await messageBridge.invoke('read-directory', dirPath)) as Array<{
        name: string
        path: string
        isDirectory: boolean
      }>
      return entries
    }

    return {
      getActiveDocument: () => {
        const doc = activeDocument.value
        if (!doc) return null

        return {
          id: doc.id,
          path: doc.path,
          format: doc.format,
          markdown: doc.markdown || '',
          tex: doc.tex || '',
          meta: doc.meta || {},
          outline: doc.outline || {}
        }
      },

      getTabs: () => {
        return workspace.tabs.map((tab) => ({
          id: tab.id,
          title: tab.title,
          path: tab.path,
          format: tab.format
        }))
      },

      getDocumentTabs: () => {
        return workspace.tabs
          .filter((tab) => tab.kind === 'file' || tab.kind === 'new')
          .map((tab) => ({
            id: tab.id,
            title: tab.title,
            path: tab.path,
            format: tab.format || 'md'
          }))
      },

      getWorkspaceFileList: async (options = {}) => {
        const { maxDepth = 2, maxEntries = 200 } = options
        let roots: string[] = []
        try {
          const saved = localStorage.getItem('workspaceFolders')
          if (saved) {
            const arr = JSON.parse(saved)
            roots = Array.isArray(arr) ? arr.filter((p: unknown) => typeof p === 'string' && p.length > 0) : []
          }
        } catch {
          // ignore
        }
        if (roots.length === 0) return []
        const exclude = new Set(['.git', 'node_modules', '.metadoc'])
        const result: Array<{ path: string; isDirectory: boolean }> = []
        const queue: Array<{ path: string; depth: number }> = roots.map((r) => ({ path: r, depth: 0 }))
        while (queue.length > 0 && result.length < maxEntries) {
          const { path: dirPath, depth } = queue.shift()!
          if (depth >= maxDepth) continue
          try {
            const entries = await listDir(dirPath)
            for (const e of entries) {
              if (result.length >= maxEntries) break
              if (exclude.has(e.name)) continue
              result.push({ path: e.path, isDirectory: e.isDirectory })
              if (e.isDirectory && depth + 1 < maxDepth) {
                queue.push({ path: e.path, depth: depth + 1 })
              }
            }
          } catch {
            // ignore single directory errors
          }
        }
        return result
      },

      getActiveTabId: () => {
        return workspace.activeTabId || null
      },

      onDocumentChange: (callback) => {
        // 监听文档变化
        // 注意：这需要在 Vue 组件中使用，外部 Tool 可以通过轮询或事件总线实现
        return () => {}
      },

      getWorkspaceRoots: () => {
        try {
          const saved = localStorage.getItem('workspaceFolders')
          if (!saved) return []
          const arr = JSON.parse(saved)
          if (!Array.isArray(arr)) return []
          return arr.filter((p) => typeof p === 'string' && p.length > 0)
        } catch {
          return []
        }
      },

      listDirectory: async (dirPath: string) => {
        if (!isElectronEnv() || !messageBridge.getIpc()) {
          throw new Error('IPC Renderer 未初始化，此功能仅在 Electron 环境中可用')
        }
        const entries = (await messageBridge.invoke(
          'read-directory',
          dirPath
        )) as Array<{ name: string; path: string; isDirectory: boolean }>
        return entries
      },

      createFile: async (parentPath: string, fileName: string, content?: string) => {
        if (!isElectronEnv() || !messageBridge.getIpc()) {
          throw new Error('IPC Renderer 未初始化，此功能仅在 Electron 环境中可用')
        }
        const newPath = (await messageBridge.invoke('create-file', {
          parentPath,
          fileName,
          content: content ?? ''
        })) as string
        return newPath
      },

      createDirectory: async (parentPath: string, folderName: string) => {
        if (!isElectronEnv() || !messageBridge.getIpc()) {
          throw new Error('IPC Renderer 未初始化，此功能仅在 Electron 环境中可用')
        }
        const newPath = (await messageBridge.invoke('create-directory', {
          parentPath,
          folderName
        })) as string
        return newPath
      },

      deletePath: async (targetPath: string) => {
        if (!isElectronEnv() || !messageBridge.getIpc()) {
          throw new Error('IPC Renderer 未初始化，此功能仅在 Electron 环境中可用')
        }
        await messageBridge.invoke('delete-file-or-folder', targetPath)
      },

      renamePath: async (oldPath: string, newName: string) => {
        if (!isElectronEnv() || !messageBridge.getIpc()) {
          throw new Error('IPC Renderer 未初始化，此功能仅在 Electron 环境中可用')
        }
        const newPath = (await messageBridge.invoke('rename-file-or-folder', {
          oldPath,
          newName
        })) as string
        return newPath
      },

      copyPath: async (sourcePath: string, targetPath: string) => {
        if (!isElectronEnv() || !messageBridge.getIpc()) {
          throw new Error('IPC Renderer 未初始化，此功能仅在 Electron 环境中可用')
        }
        await messageBridge.invoke('copy-file-or-folder', { sourcePath, targetPath })
      },

      movePath: async (sourcePath: string, targetPath: string) => {
        if (!isElectronEnv() || !messageBridge.getIpc()) {
          throw new Error('IPC Renderer 未初始化，此功能仅在 Electron 环境中可用')
        }
        await messageBridge.invoke('move-file-or-folder', { sourcePath, targetPath })
      }
    }
  }

  /**
   * 创建 IPC 服务
   */
  private createIpcService(): IpcService {
    return {
      showOpenDialog: async (options = {}) => {
        if (!messageBridge.getIpc()) {
          throw new Error('IPC Renderer 未初始化，此功能仅在 Electron 环境中可用')
        }

        try {
          const result = await messageBridge.invoke('show-open-dialog', {
            title: options.title || '选择文件',
            defaultPath: options.defaultPath,
            filters: options.filters || [{ name: 'All Files', extensions: ['*'] }],
            properties: options.properties || ['openFile']
          })

          if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
            return null
          }

          return options.properties?.includes('multiSelections')
            ? result.filePaths
            : result.filePaths[0]
        } catch (error) {
          console.error('打开文件对话框失败:', error)
          // 如果接口不存在，返回 null 而不是抛出错误，以便外部 Tool 可以优雅处理
          if (error instanceof Error && error.message.includes('No handler registered')) {
            console.warn('show-open-dialog IPC handler 未实现，请在主进程中添加对应的 handler')
            return null
          }
          throw error
        }
      },

      showSaveDialog: async (options = {}) => {
        if (!messageBridge.getIpc()) {
          throw new Error('IPC Renderer 未初始化，此功能仅在 Electron 环境中可用')
        }

        try {
          const result = await messageBridge.invoke('show-save-dialog', {
            title: options.title || '保存文件',
            defaultPath: options.defaultPath,
            filters: options.filters || [{ name: 'All Files', extensions: ['*'] }]
          })

          if (result.canceled || !result.filePath) {
            return null
          }

          return result.filePath
        } catch (error) {
          console.error('保存文件对话框失败:', error)
          // 如果接口不存在，返回 null 而不是抛出错误，以便外部 Tool 可以优雅处理
          if (error instanceof Error && error.message.includes('No handler registered')) {
            console.warn('show-save-dialog IPC handler 未实现，请在主进程中添加对应的 handler')
            return null
          }
          throw error
        }
      },

      openFolder: async (path: string) => {
        if (!messageBridge.getIpc()) {
          throw new Error('IPC Renderer 未初始化，此功能仅在 Electron 环境中可用')
        }

        try {
          await messageBridge.invoke('open-folder', path)
        } catch (error) {
          console.error('打开文件夹失败:', error)
          // 如果接口不存在，静默失败，以便外部 Tool 可以优雅处理
          if (error instanceof Error && error.message.includes('No handler registered')) {
            console.warn('open-folder IPC handler 未实现，请在主进程中添加对应的 handler')
            return
          }
          throw error
        }
      },

      openFile: async (path: string) => {
        if (!messageBridge.getIpc()) {
          throw new Error('IPC Renderer 未初始化，此功能仅在 Electron 环境中可用')
        }

        try {
          await messageBridge.invoke('open-file', path)
        } catch (error) {
          console.error('打开文件失败:', error)
          // 如果接口不存在，静默失败，以便外部 Tool 可以优雅处理
          if (error instanceof Error && error.message.includes('No handler registered')) {
            console.warn('open-file IPC handler 未实现，请在主进程中添加对应的 handler')
            return
          }
          throw error
        }
      },

      readFile: async (filePath: string) => {
        if (!messageBridge.getIpc()) {
          throw new Error('IPC Renderer 未初始化')
        }

        try {
          return await messageBridge.invoke('read-file-content', filePath)
        } catch (error) {
          console.error('读取文件失败:', error)
          throw error
        }
      },

      writeFile: async (filePath: string, content: string) => {
        if (!messageBridge.getIpc()) {
          throw new Error('IPC Renderer 未初始化，此功能仅在 Electron 环境中可用')
        }

        try {
          await messageBridge.invoke('write-file-content', { filePath, content })
        } catch (error) {
          console.error('写入文件失败:', error)
          // 如果接口不存在，抛出错误
          if (error instanceof Error && error.message.includes('No handler registered')) {
            console.warn('write-file-content IPC handler 未实现，请在主进程中添加对应的 handler')
            throw new Error('write-file-content IPC handler 未实现')
          }
          throw error
        }
      },

      fileExists: async (filePath: string) => {
        if (!messageBridge.getIpc()) {
          throw new Error('IPC Renderer 未初始化，此功能仅在 Electron 环境中可用')
        }

        try {
          return await messageBridge.invoke('file-exists', filePath)
        } catch (error) {
          console.error('检查文件是否存在失败:', error)
          // 如果接口不存在，返回 false
          if (error instanceof Error && error.message.includes('No handler registered')) {
            console.warn('file-exists IPC handler 未实现，请在主进程中添加对应的 handler')
            return false
          }
          return false
        }
      },

      getDirectoryPath: async (filePath: string) => {
        if (!messageBridge.getIpc()) {
          throw new Error('IPC Renderer 未初始化')
        }

        try {
          return await messageBridge.invoke('get-directory-path', filePath)
        } catch (error) {
          console.error('获取目录路径失败:', error)
          throw error
        }
      }
    }
  }
}

/**
 * 导出单例实例
 */
export const agentToolServices = AgentToolServices.getInstance()

/**
 * 便捷导出函数
 */
export const getThemeService = () => agentToolServices.getThemeService()
export const getI18nService = () => agentToolServices.getI18nService()
export const getWorkspaceService = () => agentToolServices.getWorkspaceService()
export const getIpcService = () => agentToolServices.getIpcService()
