/**
 * 文件系统操作执行器
 * 负责串行执行操作计划，提供进度反馈和错误处理
 */

import type { FSOpPlan, FSOpStep, URI } from './fs-models'
import { URIUtils } from './fs-models'
import { createRendererLogger } from '../logger'

const logger = createRendererLogger('FSExecutor')

/**
 * 执行进度回调
 */
export interface ExecutionProgress {
  current: number
  total: number
  step: FSOpStep
  description?: string
}

export type ProgressCallback = (progress: ExecutionProgress) => void

/**
 * 执行结果
 */
export interface ExecutionResult {
  success: boolean
  executedSteps: number
  totalSteps: number
  errors?: Array<{ step: FSOpStep; error: Error }>
  createdURIs?: URI[] // 操作后创建的新 URI（用于选中）
}

/**
 * 文件系统操作执行器
 */
export class FSExecutor {
  private ipcRenderer: any
  private abortController: AbortController | null = null

  constructor(ipcRenderer: any) {
    this.ipcRenderer = ipcRenderer
  }

  /**
   * 执行操作计划
   */
  async execute(
    plan: FSOpPlan,
    onProgress?: ProgressCallback
  ): Promise<ExecutionResult> {
    this.abortController = new AbortController()
    const { steps } = plan
    const result: ExecutionResult = {
      success: true,
      executedSteps: 0,
      totalSteps: steps.length,
      errors: [],
      createdURIs: []
    }

    try {
      for (let i = 0; i < steps.length; i++) {
        // 检查是否已取消
        if (this.abortController.signal.aborted) {
          logger.info('操作已取消')
          result.success = false
          break
        }

        const step = steps[i]
        
        // 报告进度
        if (onProgress) {
          onProgress({
            current: i + 1,
            total: steps.length,
            step,
            description: this.getStepDescription(step)
          })
        }

        try {
          await this.executeStep(step)
          result.executedSteps++
          
          // 记录创建的新 URI（用于后续选中）
          if (step.to) {
            result.createdURIs?.push(step.to)
          }
        } catch (error) {
          logger.error(`执行步骤失败:`, { step, error })
          result.success = false
          result.errors?.push({
            step,
            error: error instanceof Error ? error : new Error(String(error))
          })
          
          // 根据策略决定是否继续执行
          // 这里我们选择继续执行，但记录错误
          // 可以根据需要改为遇到错误就停止
        }
      }
    } catch (error) {
      logger.error('执行计划失败:', error)
      result.success = false
      if (result.errors && result.errors.length === 0) {
        result.errors = [{
          step: steps[0] || { type: 'delete', target: '' as URI },
          error: error instanceof Error ? error : new Error(String(error))
        }]
      }
    } finally {
      this.abortController = null
    }

    return result
  }

  /**
   * 取消执行
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort()
    }
  }

  /**
   * 执行单个步骤
   */
  private async executeStep(step: FSOpStep): Promise<void> {
    switch (step.type) {
      case 'copy':
        if (!step.from || !step.to) {
          throw new Error('复制操作缺少源路径或目标路径')
        }
        await this.copyFileOrFolder(step.from, step.to)
        break

      case 'move':
        if (!step.from || !step.to) {
          throw new Error('移动操作缺少源路径或目标路径')
        }
        await this.moveFileOrFolder(step.from, step.to)
        break

      case 'delete':
        if (!step.target) {
          throw new Error('删除操作缺少目标路径')
        }
        await this.deleteFileOrFolder(step.target)
        break

      default:
        throw new Error(`未知的操作类型: ${(step as any).type}`)
    }
  }

  /**
   * 复制文件或文件夹
   */
  private async copyFileOrFolder(sourceURI: URI, targetURI: URI): Promise<void> {
    const sourcePath = URIUtils.uriToPath(sourceURI)
    const targetPath = URIUtils.uriToPath(targetURI)

    // 检查源是否存在
    const sourceExists = await this.checkPathExists(sourcePath)
    if (!sourceExists) {
      throw new Error(`源路径不存在: ${sourcePath}`)
    }

    // 检查目标是否已存在（如果存在，应该由 Planner 处理冲突）
    const targetExists = await this.checkPathExists(targetPath)
    if (targetExists) {
      // 如果 Planner 选择了 overwrite，这里需要先删除
      // 但为了安全，我们让 Planner 确保目标不存在
      throw new Error(`目标路径已存在: ${targetPath}`)
    }

    // 确保目标目录存在
    const targetDir = URIUtils.dirname(targetURI)
    const targetDirPath = URIUtils.uriToPath(targetDir)
    const targetDirExists = await this.checkPathExists(targetDirPath)
    if (!targetDirExists) {
      // 创建目标目录
      await this.createDirectory(targetDirPath)
    }

    // 执行复制
    await this.ipcRenderer.invoke('copy-file-or-folder', {
      sourcePath,
      targetPath
    })
  }

  /**
   * 移动文件或文件夹
   */
  private async moveFileOrFolder(sourceURI: URI, targetURI: URI): Promise<void> {
    const sourcePath = URIUtils.uriToPath(sourceURI)
    const targetPath = URIUtils.uriToPath(targetURI)

    // 检查源是否存在
    const sourceExists = await this.checkPathExists(sourcePath)
    if (!sourceExists) {
      throw new Error(`源路径不存在: ${sourcePath}`)
    }

    // 检查目标是否已存在
    const targetExists = await this.checkPathExists(targetPath)
    if (targetExists) {
      throw new Error(`目标路径已存在: ${targetPath}`)
    }

    // 确保目标目录存在
    const targetDir = URIUtils.dirname(targetURI)
    const targetDirPath = URIUtils.uriToPath(targetDir)
    const targetDirExists = await this.checkPathExists(targetDirPath)
    if (!targetDirExists) {
      await this.createDirectory(targetDirPath)
    }

    // 执行移动
    await this.ipcRenderer.invoke('move-file-or-folder', {
      sourcePath,
      targetPath
    })
  }

  /**
   * 删除文件或文件夹
   */
  private async deleteFileOrFolder(targetURI: URI): Promise<void> {
    const targetPath = URIUtils.uriToPath(targetURI)

    // 检查目标是否存在
    const targetExists = await this.checkPathExists(targetPath)
    if (!targetExists) {
      // 如果已经不存在，认为删除成功（幂等性）
      logger.warn(`目标路径不存在，跳过删除: ${targetPath}`)
      return
    }

    // 执行删除（主进程会先尝试移到回收站，失败则直接删除）
    await this.ipcRenderer.invoke('delete-file-or-folder', targetPath)
  }

  /**
   * 创建目录
   */
  private async createDirectory(dirPath: string): Promise<void> {
    // 递归创建目录
    // 这里我们使用 IPC 调用，但主进程的 create-directory 已经支持递归
    // 为了简化，我们直接调用 IPC
    const parentPath = this.getDirname(dirPath)
    const dirName = this.getBasename(dirPath)
    
    await this.ipcRenderer.invoke('create-directory', {
      parentPath,
      folderName: dirName
    })
  }

  /**
   * 获取步骤描述
   */
  private getStepDescription(step: FSOpStep): string {
    switch (step.type) {
      case 'copy':
        return `复制 ${URIUtils.basename(step.from!)}`
      case 'move':
        return `移动 ${URIUtils.basename(step.from!)}`
      case 'delete':
        return `删除 ${URIUtils.basename(step.target!)}`
      default:
        return '执行操作'
    }
  }

  /**
   * IPC 辅助方法
   */
  private async checkPathExists(path: string): Promise<boolean> {
    try {
      return await this.ipcRenderer.invoke('check-path-exists', path) as boolean
    } catch (err) {
      logger.error('检查路径是否存在失败:', err)
      return false
    }
  }

  /**
   * 路径工具（简化版，避免循环依赖）
   */
  private getDirname(filePath: string): string {
    const parts = filePath.replace(/\\/g, '/').split('/').filter(Boolean)
    if (parts.length <= 1) return ''
    return parts.slice(0, -1).join('/')
  }

  private getBasename(filePath: string): string {
    const parts = filePath.replace(/\\/g, '/').split('/').filter(Boolean)
    return parts.length > 0 ? parts[parts.length - 1] : ''
  }
}

