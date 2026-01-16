/**
 * 文件系统操作计划生成器
 * 负责将用户操作意图转换为可执行的操作计划
 */

import type { URI, FSOpPlan, FSOpStep, ClipboardPayload, ConflictResolution } from './fs-models'
import { URIUtils } from './fs-models'
import { createRendererLogger } from '../logger'

const logger = createRendererLogger('FSPlanner')

/**
 * 计划生成器配置
 */
export interface PlannerConfig {
  conflictResolution?: ConflictResolution
  recursive?: boolean
}

/**
 * 文件系统操作计划生成器
 */
export class FSPlanner {
  private ipcRenderer: any

  constructor(ipcRenderer: any) {
    this.ipcRenderer = ipcRenderer
  }

  /**
   * 生成粘贴操作计划
   */
  async createPastePlan(
    payload: ClipboardPayload,
    targetDirURI: URI,
    config: PlannerConfig = {}
  ): Promise<FSOpPlan> {
    const { sources, type } = payload
    const steps: FSOpStep[] = []
    const conflictResolution = config.conflictResolution || 'rename'

    // 验证目标目录
    const targetDirPath = URIUtils.uriToPath(targetDirURI)
    const targetExists = await this.checkPathExists(targetDirPath)
    if (!targetExists) {
      throw new Error(`目标目录不存在: ${targetDirPath}`)
    }

    const isTargetDir = await this.checkPathIsDirectory(targetDirPath)
    if (!isTargetDir) {
      throw new Error(`目标路径不是目录: ${targetDirPath}`)
    }

    // 为每个源生成操作步骤
    for (const sourceURI of sources) {
      const sourcePath = URIUtils.uriToPath(sourceURI)
      
      // 检查源是否存在
      const sourceExists = await this.checkPathExists(sourcePath)
      if (!sourceExists) {
        logger.warn(`源路径不存在，跳过: ${sourcePath}`)
        continue
      }

      // 检查非法操作：不能将目录移动到自己的子目录中
      if (type === 'move' || type === 'cut') {
        if (URIUtils.isSubPath(sourceURI, targetDirURI)) {
          throw new Error(`不能将目录移动到自己的子目录中: ${sourcePath}`)
        }
      }

      const sourceName = URIUtils.basename(sourceURI)
      const isSourceDir = await this.checkPathIsDirectory(sourcePath)

      if (isSourceDir) {
        // 递归处理目录
        await this.expandDirectoryOperation(
          sourceURI,
          targetDirURI,
          type,
          conflictResolution,
          steps
        )
      } else {
        // 处理单个文件
        const targetURI = await this.resolveTargetURI(
          targetDirURI,
          sourceName,
          conflictResolution
        )

        if (type === 'cut' || type === 'move') {
          steps.push({
            type: 'move',
            from: sourceURI,
            to: targetURI
          })
        } else {
          steps.push({
            type: 'copy',
            from: sourceURI,
            to: targetURI
          })
        }
      }
    }

    return {
      steps,
      metadata: {
        description: `${type === 'cut' ? '移动' : '复制'} ${sources.length} 项到 ${URIUtils.basename(targetDirURI)}`
      }
    }
  }

  /**
   * 生成删除操作计划
   */
  async createDeletePlan(
    uris: URI[],
    config: PlannerConfig = {}
  ): Promise<FSOpPlan> {
    // 去重和折叠：如果父目录在列表中，忽略子节点
    const normalizedURIs = this.normalizeDeleteTargets(uris)
    
    const steps: FSOpStep[] = []
    
    for (const uri of normalizedURIs) {
      const path = URIUtils.uriToPath(uri)
      const exists = await this.checkPathExists(path)
      if (!exists) {
        logger.warn(`路径不存在，跳过删除: ${path}`)
        continue
      }

      steps.push({
        type: 'delete',
        target: uri
      })
    }

    return {
      steps,
      metadata: {
        description: `删除 ${normalizedURIs.length} 项`
      }
    }
  }

  /**
   * 生成重命名操作计划
   */
  async createRenamePlan(
    uri: URI,
    newName: string,
    config: PlannerConfig = {}
  ): Promise<FSOpPlan> {
    const oldPath = URIUtils.uriToPath(uri)
    const dirURI = URIUtils.dirname(uri)
    const newURI = URIUtils.join(dirURI, newName)
    const newPath = URIUtils.uriToPath(newURI)

    // 检查新名称是否已存在
    const exists = await this.checkPathExists(newPath)
    if (exists) {
      throw new Error(`目标文件或文件夹已存在: ${newName}`)
    }

    return {
      steps: [
        {
          type: 'move',
          from: uri,
          to: newURI
        }
      ],
      metadata: {
        description: `重命名为 ${newName}`
      }
    }
  }

  /**
   * 递归展开目录操作（复制或移动目录）
   */
  private async expandDirectoryOperation(
    sourceDirURI: URI,
    targetDirURI: URI,
    operationType: 'copy' | 'cut' | 'move',
    conflictResolution: ConflictResolution,
    steps: FSOpStep[],
    visited: Set<URI> = new Set()
  ): Promise<void> {
    // 防止循环引用
    if (visited.has(sourceDirURI)) {
      return
    }
    visited.add(sourceDirURI)

    const sourcePath = URIUtils.uriToPath(sourceDirURI)
    const sourceName = URIUtils.basename(sourceDirURI)
    
    // 创建目标目录 URI
    const targetSubDirURI = await this.resolveTargetURI(
      targetDirURI,
      sourceName,
      conflictResolution
    )

    // 如果是移动操作，直接移动整个目录（更高效）
    if (operationType === 'move' || operationType === 'cut') {
      steps.push({
        type: 'move',
        from: sourceDirURI,
        to: targetSubDirURI
      })
      // 移动操作不需要递归处理子项，因为整个目录一起移动
      return
    }

    // 复制操作：需要递归复制所有内容
    const entries = await this.readDirectory(sourcePath)

    // 递归处理子项
    for (const entry of entries) {
      const childURI = URIUtils.join(sourceDirURI, entry.name)

      if (entry.isDirectory) {
        // 递归处理子目录
        await this.expandDirectoryOperation(
          childURI,
          targetSubDirURI,
          operationType,
          conflictResolution,
          steps,
          visited
        )
      } else {
        // 处理文件
        const targetFileURI = URIUtils.join(targetSubDirURI, entry.name)
        steps.push({
          type: 'copy',
          from: childURI,
          to: targetFileURI
        })
      }
    }
  }

  /**
   * 解析目标 URI（处理冲突）
   */
  private async resolveTargetURI(
    targetDirURI: URI,
    sourceName: string,
    conflictResolution: ConflictResolution
  ): Promise<URI> {
    let targetURI = URIUtils.join(targetDirURI, sourceName)
    let targetPath = URIUtils.uriToPath(targetURI)

    if (conflictResolution === 'skip') {
      // 如果存在则跳过（由调用方处理）
      return targetURI
    }

    if (conflictResolution === 'overwrite') {
      // 直接覆盖
      return targetURI
    }

    // rename 策略：如果存在则添加序号
    if (conflictResolution === 'rename') {
      let counter = 1
      while (await this.checkPathExists(targetPath)) {
        const ext = this.getExtension(sourceName)
        const baseName = ext ? sourceName.slice(0, -ext.length) : sourceName
        const newName = ext 
          ? `${baseName} (${counter})${ext}`
          : `${baseName} (${counter})`
        targetURI = URIUtils.join(targetDirURI, newName)
        targetPath = URIUtils.uriToPath(targetURI)
        counter++
      }
    }

    return targetURI
  }

  /**
   * 规范化删除目标（去除子节点，如果父节点在列表中）
   */
  private normalizeDeleteTargets(uris: URI[]): URI[] {
    const sorted = [...uris].sort((a, b) => {
      const pathA = URIUtils.uriToPath(a)
      const pathB = URIUtils.uriToPath(b)
      return pathA.length - pathB.length
    })

    const result: URI[] = []
    
    for (const uri of sorted) {
      // 检查是否已经是某个已包含路径的子路径
      const isSubPath = result.some(parentURI => 
        URIUtils.isSubPath(parentURI, uri)
      )
      
      if (!isSubPath) {
        result.push(uri)
      }
    }

    return result
  }

  /**
   * 获取文件扩展名
   */
  private getExtension(fileName: string): string {
    const lastDot = fileName.lastIndexOf('.')
    return lastDot > 0 ? fileName.slice(lastDot) : ''
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

  private async checkPathIsDirectory(path: string): Promise<boolean> {
    try {
      // 读取目录，如果成功则是目录
      await this.ipcRenderer.invoke('read-directory', path)
      return true
    } catch (err) {
      return false
    }
  }

  private async readDirectory(path: string): Promise<Array<{ name: string; isDirectory: boolean }>> {
    try {
      const entries = await this.ipcRenderer.invoke('read-directory', path) as Array<{
        name: string
        path: string
        isDirectory: boolean
      }>
      return entries.map(e => ({
        name: e.name,
        isDirectory: e.isDirectory
      }))
    } catch (err) {
      logger.error('读取目录失败:', err)
      return []
    }
  }
}

