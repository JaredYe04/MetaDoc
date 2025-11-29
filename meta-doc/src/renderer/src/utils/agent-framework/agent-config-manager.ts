/**
 * Agent配置（AgentConfig）管理器
 * 负责AgentConfig的CRUD操作和持久化
 */

import type { AgentConfig, SerializedEntity } from '../../types/agent-framework'
import type { LocalizedText } from '../../types/agent-tool'
import { createRendererLogger } from '../logger'
import { toolCollectionManager } from './tool-collection-manager'

/**
 * Agent配置管理器类
 */
class AgentConfigManager {
  private configs: Map<string, AgentConfig> = new Map()
  private readonly STORAGE_KEY = 'agent-configs'
  private logger: ReturnType<typeof createRendererLogger> | null = null

  constructor() {
    // 延迟初始化logger，避免循环依赖
    this.loadFromStorage()
  }

  /**
   * 获取logger（懒加载）
   */
  private getLogger() {
    if (!this.logger) {
      this.logger = createRendererLogger('AgentConfigManager')
    }
    return this.logger
  }

  /**
   * 创建Agent配置
   */
  createConfig(
    name: string | LocalizedText,
    description: string | LocalizedText,
    toolCollectionIds: string[] = []
  ): AgentConfig {
    // 转换为LocalizedText格式
    const nameText: LocalizedText = typeof name === 'string' 
      ? { 'zh_cn': { name }, 'en_us': { name } }
      : name
    const descText: LocalizedText = typeof description === 'string'
      ? { 'zh_cn': { description }, 'en_us': { description } }
      : description
    const id = `agent-config-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const now = Date.now()

    const config: AgentConfig = {
      entityType: 'agent-config',
      id,
      name: nameText,
      description: descText,
      version: '1.0.0',
      createdAt: now,
      updatedAt: now,
      toolCollectionIds,
      enabled: true,
      tags: []
    }

    this.configs.set(id, config)
    this.saveToStorage()
    this.getLogger().info(`Agent配置已创建: ${id}`)
    return config
  }

  /**
   * 获取Agent配置
   */
  getConfig(id: string): AgentConfig | undefined {
    return this.configs.get(id)
  }

  /**
   * 获取所有Agent配置
   */
  getAllConfigs(): AgentConfig[] {
    return Array.from(this.configs.values())
  }

  /**
   * 获取启用的Agent配置
   */
  getEnabledConfigs(): AgentConfig[] {
    return Array.from(this.configs.values()).filter(c => c.enabled !== false)
  }

  /**
   * 根据场景获取Agent配置
   */
  getConfigsByScenario(scenario: AgentConfig['scenario']): AgentConfig[] {
    return Array.from(this.configs.values()).filter(
      c => c.scenario === scenario && c.enabled !== false
    )
  }

  /**
   * 更新Agent配置
   */
  updateConfig(id: string, updates: Partial<AgentConfig>): void {
    const config = this.configs.get(id)
    if (!config) {
      throw new Error(`Agent配置 ${id} 未找到`)
    }

    const updated: AgentConfig = {
      ...config,
      ...updates,
      id, // 不允许修改ID
      entityType: 'agent-config', // 不允许修改类型
      updatedAt: Date.now()
    }

    this.configs.set(id, updated)
    this.saveToStorage()
    this.getLogger().info(`Agent配置已更新: ${id}`)
  }

  /**
   * 删除Agent配置
   */
  deleteConfig(id: string): void {
    if (!this.configs.has(id)) {
      throw new Error(`Agent配置 ${id} 未找到`)
    }

    // 检查是否是默认配置
    if (id === 'default-agent-config') {
      throw new Error('不能删除默认Agent配置')
    }

    this.configs.delete(id)
    this.saveToStorage()
    this.getLogger().info(`Agent配置已删除: ${id}`)
  }

  /**
   * 初始化默认Agent配置
   */
  initializeDefaultAgentConfig(defaultToolCollectionId: string, additionalToolCollectionIds: string[] = []): void {
    const defaultId = 'default-agent-config'
    
    // 合并所有工具集ID
    const allToolCollectionIds = [defaultToolCollectionId, ...additionalToolCollectionIds].filter(Boolean)
    
    // 检查是否已存在
    if (this.configs.has(defaultId)) {
      // 更新工具集列表
      const existingConfig = this.configs.get(defaultId)!
      const existingIds = existingConfig.toolCollectionIds || []
      // 合并现有的和新的工具集ID，去重
      const mergedIds = Array.from(new Set([...existingIds, ...allToolCollectionIds]))
      this.updateConfig(defaultId, {
        toolCollectionIds: mergedIds,
        name: {
          'zh_cn': { name: '默认Agent配置' },
          'en_us': { name: 'Default Agent Config' }
        },
        description: {
          'zh_cn': { description: 'MetaDoc默认Agent配置。MetaDoc是一个专业的AI写作助手，高效地使用所含的AI工具，为用户生成图文并茂、内容充实丰富的、专业的、多领域的文章。该配置定义了MetaDoc的核心职责和工作方式，包括理解用户需求、检索知识、生成可视化内容、优化文档结构、确保内容质量等能力。' },
          'en_us': { description: 'Default MetaDoc Agent config. MetaDoc is a professional AI writing assistant that efficiently uses AI tools to generate well-illustrated, rich, professional, multi-domain articles for users. This config defines MetaDoc\'s core responsibilities and working methods, including understanding user needs, retrieving knowledge, generating visualizations, optimizing document structure, and ensuring content quality.' }
        },
        llmConfig: {
          systemPrompt: `你是MetaDoc，一个专业的AI写作助手。你的核心职责是高效地使用所含的AI工具，为用户生成图文并茂、内容充实丰富的、专业的、多领域的文章。

## ⚠️ 重要工作流程

在开始任何任务之前，**必须先使用 \`todolist-planning\` 工具进行需求分析和任务规划**。这是必须遵循的标准流程：

1. **需求分析与规划阶段**（必需）：
   - 首先调用 \`todolist-planning\` 工具，分析用户需求，将任务分解为多个可执行的子任务
   - 仔细分析返回的任务列表，理解每个步骤的要求和依赖关系
   - 根据任务列表制定详细的执行计划

2. **执行阶段**：
   - 按照任务列表逐步执行每个子任务
   - 在执行过程中，根据需要调用其他工具（检索知识、生成图表、编辑文档等）
   - 完成一个任务后，继续下一个任务

3. **完成阶段**：
   - 检查是否所有任务都已完成
   - 进行最终的检查和优化

**标准工作流程示例**：
\`\`\`
用户请求 → 调用todolist-planning分析需求 → 获取任务列表 → 逐步执行任务 → 完成
\`\`\`

## 你的核心能力

1. **需求分析与规划**：**首先使用todolist-planning工具**分析用户需求，将复杂任务分解为可执行的子任务，制定清晰的执行计划。
   - 可以使用简化的输入格式：直接传入任务标题的字符串列表，如 \`{"items": ["任务1", "任务2", "任务3"]}\`
   - 或使用混合列表：部分任务是字符串，部分任务包含额外信息（tags、dependencies等）
   - 大多数字段都是可选的，只有title是必需的

2. **理解用户需求**：仔细分析用户的写作需求，理解文章的主题、目标读者、写作风格等要求。

3. **知识检索与整合**：使用RAG工具检索相关知识库中的信息，整合多源信息，确保文章内容的准确性和丰富性。

4. **可视化内容生成**：使用图表生成工具创建各类可视化内容（流程图、统计图、示意图等），使文章更加直观易懂。
   - **重要**：生成图表后，必须使用 \`edit\` 工具将返回的 \`url\`（图片URL）插入到文档中，而不是插入图表代码
   - **格式区分**：
     - Markdown文档：使用 \`svg\` 或 \`png\` 格式，插入语法：\`![描述](图片URL)\`
     - LaTeX文档：**必须使用 \`pdf\` 格式**，插入语法：\`\\includegraphics[width=0.8\\textwidth]{图片URL}\`

5. **文档定位与编辑**：使用编辑工具修改文档内容。
   - **定位插入位置**：在插入内容之前，需要确定正确的插入位置。可以使用以下方法：
     - **推荐使用 \`grep\` 工具**：搜索关键词，根据匹配位置和上下文确定插入点（轻量级，可频繁调用，高效）
       - **模糊搜索推荐**：如果不记得确切关键词，使用 \`fuzzy: true\` 启用模糊搜索，类似搜索引擎，能找到相似内容
       - 模糊搜索示例：\`{"pattern": "关键词", "fuzzy": true, "similarityThreshold": 0.7}\`
     - **可选使用 \`outline-tree\` 工具**：获取文档大纲结构，分析内容分布（适合需要了解整体结构时）
     - **绝对不要**总是从行1列1插入，这是严重错误
   - 确定位置后，使用 \`edit\` 工具的 \`insert\` 操作在确定的位置插入内容

6. **文档结构优化**：使用编辑工具优化文档结构，确保文章逻辑清晰、层次分明、易于阅读。

7. **内容质量保障**：使用校对工具检查并修正文章中的错误，确保内容的专业性、准确性和可读性。

8. **专业文章生成**：最终生成结构清晰、内容丰富、专业可靠、图文并茂的高质量文章。

## 工作原则

- **先规划后执行**：**必须**先使用todolist-planning工具进行需求分析和任务规划，然后按计划执行（可以使用简化的字符串列表格式，如 \`{"items": ["任务1", "任务2"]}\`）
- **定位后插入**：插入内容前，需要定位位置，**推荐使用grep工具**（轻量级、可频繁调用、高效）或outline-tree工具，不要总是从行1列1插入
- **频繁使用grep工具**：grep是高效的查询工具，可以频繁调用以快速定位内容和了解上下文
- **模糊搜索推荐**：当不记得确切关键词时，使用grep的模糊搜索模式（\`fuzzy: true\`），类似搜索引擎，能灵活找到相似内容
- **正确插入图表**：生成图表后，插入图片URL而不是代码，注意Markdown和LaTeX格式的差异
- **专业性**：始终保持专业、准确、严谨的态度
- **用户导向**：以用户需求为中心，提供符合用户期望的内容
- **工具协同**：高效组合使用各种AI工具，发挥各自优势
- **质量优先**：确保最终输出的文章质量达到专业标准
- **友好沟通**：与用户保持友好、清晰的沟通，及时反馈进度和问题

## 常见错误避免

1. ❌ **不先规划就执行**：必须先使用todolist-planning工具进行规划（可以使用简化的字符串列表格式）
2. ❌ **总是从行1列1插入**：必须先定位位置，推荐使用grep工具搜索关键词确定位置
3. ❌ **插入图表代码而不是URL**：必须插入图片URL，不是图表代码
4. ❌ **LaTeX文档使用svg/png格式**：LaTeX文档必须使用pdf格式

请始终遵循以上原则和流程，为用户提供高质量的写作服务。`,
          injectTimestamp: true
        },
        maxToolCalls: null // 无限制
      })
      return
    }

    // 创建默认Agent配置
    const defaultConfig: AgentConfig = {
      entityType: 'agent-config',
      id: defaultId,
      name: {
        'zh_cn': { name: '默认Agent配置' },
        'en_us': { name: 'Default Agent Config' }
      },
      description: {
        'zh_cn': { description: 'MetaDoc默认Agent配置。MetaDoc是一个专业的AI写作助手，高效地使用所含的AI工具，为用户生成图文并茂、内容充实丰富的、专业的、多领域的文章。该配置定义了MetaDoc的核心职责和工作方式，包括理解用户需求、检索知识、生成可视化内容、优化文档结构、确保内容质量等能力。' },
        'en_us': { description: 'Default MetaDoc Agent config. MetaDoc is a professional AI writing assistant that efficiently uses AI tools to generate well-illustrated, rich, professional, multi-domain articles for users. This config defines MetaDoc\'s core responsibilities and working methods, including understanding user needs, retrieving knowledge, generating visualizations, optimizing document structure, and ensuring content quality.' }
      },
      version: '1.0.0',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      toolCollectionIds: allToolCollectionIds,
      enabled: true,
      tags: ['default', 'built-in'],
      maxToolCalls: null, // 无限制（null表示无限制）
      llmConfig: {
        systemPrompt: `你是MetaDoc，一个专业的AI写作助手。你的核心职责是高效地使用所含的AI工具，为用户生成图文并茂、内容充实丰富的、专业的、多领域的文章。

## ⚠️ 重要工作流程

在开始任何任务之前，**必须先使用 \`todolist-planning\` 工具进行需求分析和任务规划**。这是必须遵循的标准流程：

1. **需求分析与规划阶段**（必需）：
   - 首先调用 \`todolist-planning\` 工具，分析用户需求，将任务分解为多个可执行的子任务
   - 仔细分析返回的任务列表，理解每个步骤的要求和依赖关系
   - 根据任务列表制定详细的执行计划

2. **执行阶段**：
   - 按照任务列表逐步执行每个子任务
   - 在执行过程中，根据需要调用其他工具（检索知识、生成图表、编辑文档等）
   - 完成一个任务后，继续下一个任务

3. **完成阶段**：
   - 检查是否所有任务都已完成
   - 进行最终的检查和优化

**标准工作流程示例**：
\`\`\`
用户请求 → 调用todolist-planning分析需求 → 获取任务列表 → 逐步执行任务 → 完成
\`\`\`

## 你的核心能力

1. **需求分析与规划**：**首先使用todolist-planning工具**分析用户需求，将复杂任务分解为可执行的子任务，制定清晰的执行计划。
   - 可以使用简化的输入格式：直接传入任务标题的字符串列表，如 \`{"items": ["任务1", "任务2", "任务3"]}\`
   - 或使用混合列表：部分任务是字符串，部分任务包含额外信息（tags、dependencies等）
   - 大多数字段都是可选的，只有title是必需的

2. **理解用户需求**：仔细分析用户的写作需求，理解文章的主题、目标读者、写作风格等要求。

3. **知识检索与整合**：使用RAG工具检索相关知识库中的信息，整合多源信息，确保文章内容的准确性和丰富性。

4. **可视化内容生成**：使用图表生成工具创建各类可视化内容（流程图、统计图、示意图等），使文章更加直观易懂。
   - **重要**：生成图表后，必须使用 \`edit\` 工具将返回的 \`url\`（图片URL）插入到文档中，而不是插入图表代码
   - **格式区分**：
     - Markdown文档：使用 \`svg\` 或 \`png\` 格式，插入语法：\`![描述](图片URL)\`
     - LaTeX文档：**必须使用 \`pdf\` 格式**，插入语法：\`\\includegraphics[width=0.8\\textwidth]{图片URL}\`

5. **文档定位与编辑**：使用编辑工具修改文档内容。
   - **定位插入位置**：在插入内容之前，需要确定正确的插入位置。可以使用以下方法：
     - **推荐使用 \`grep\` 工具**：搜索关键词，根据匹配位置和上下文确定插入点（轻量级，可频繁调用，高效）
       - **模糊搜索推荐**：如果不记得确切关键词，使用 \`fuzzy: true\` 启用模糊搜索，类似搜索引擎，能找到相似内容
       - 模糊搜索示例：\`{"pattern": "关键词", "fuzzy": true, "similarityThreshold": 0.7}\`
     - **可选使用 \`outline-tree\` 工具**：获取文档大纲结构，分析内容分布（适合需要了解整体结构时）
     - **绝对不要**总是从行1列1插入，这是严重错误
   - 确定位置后，使用 \`edit\` 工具的 \`insert\` 操作在确定的位置插入内容

6. **文档结构优化**：使用编辑工具优化文档结构，确保文章逻辑清晰、层次分明、易于阅读。

7. **内容质量保障**：使用校对工具检查并修正文章中的错误，确保内容的专业性、准确性和可读性。

8. **专业文章生成**：最终生成结构清晰、内容丰富、专业可靠、图文并茂的高质量文章。

## 工作原则

- **先规划后执行**：**必须**先使用todolist-planning工具进行需求分析和任务规划，然后按计划执行（可以使用简化的字符串列表格式，如 \`{"items": ["任务1", "任务2"]}\`）
- **定位后插入**：插入内容前，需要定位位置，**推荐使用grep工具**（轻量级、可频繁调用、高效）或outline-tree工具，不要总是从行1列1插入
- **频繁使用grep工具**：grep是高效的查询工具，可以频繁调用以快速定位内容和了解上下文
- **模糊搜索推荐**：当不记得确切关键词时，使用grep的模糊搜索模式（\`fuzzy: true\`），类似搜索引擎，能灵活找到相似内容
- **正确插入图表**：生成图表后，插入图片URL而不是代码，注意Markdown和LaTeX格式的差异
- **专业性**：始终保持专业、准确、严谨的态度
- **用户导向**：以用户需求为中心，提供符合用户期望的内容
- **工具协同**：高效组合使用各种AI工具，发挥各自优势
- **质量优先**：确保最终输出的文章质量达到专业标准
- **友好沟通**：与用户保持友好、清晰的沟通，及时反馈进度和问题

## 常见错误避免

1. ❌ **不先规划就执行**：必须先使用todolist-planning工具进行规划（可以使用简化的字符串列表格式）
2. ❌ **总是从行1列1插入**：必须先定位位置，推荐使用grep工具搜索关键词确定位置
3. ❌ **插入图表代码而不是URL**：必须插入图片URL，不是图表代码
4. ❌ **LaTeX文档使用svg/png格式**：LaTeX文档必须使用pdf格式

请始终遵循以上原则和流程，为用户提供高质量的写作服务。`,
        injectTimestamp: true
      }
    }

    this.configs.set(defaultId, defaultConfig)
    this.saveToStorage()
    this.getLogger().info('默认Agent配置已初始化')
  }

  /**
   * 获取Agent配置可用的工具ID列表（取工具集的交集）
   */
  getAvailableToolIds(configId: string): string[] {
    const config = this.configs.get(configId)
    if (!config) {
      return []
    }

    return toolCollectionManager.getToolIdsFromCollections(config.toolCollectionIds)
  }

  /**
   * 验证Agent配置
   */
  validateConfig(config: AgentConfig): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = []
    const warnings: string[] = []

    // 检查工具集是否存在
    for (const collectionId of config.toolCollectionIds) {
      const collection = toolCollectionManager.getCollection(collectionId)
      if (!collection) {
        errors.push(`工具集 ${collectionId} 不存在`)
      } else if (collection.enabled === false) {
        warnings.push(`工具集 ${collectionId} 已禁用`)
      }
    }

    // 检查是否有可用的工具
    const availableToolIds = this.getAvailableToolIds(config.id)
    if (availableToolIds.length === 0 && config.toolCollectionIds.length > 0) {
      warnings.push('没有可用的工具（工具集交集为空）')
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    }
  }

  /**
   * 导出Agent配置
   */
  exportConfig(id: string, includeDependencies = false): SerializedEntity | null {
    const config = this.configs.get(id)
    if (!config) {
      return null
    }

    const entity: SerializedEntity = {
      entityType: 'agent-config',
      data: JSON.parse(JSON.stringify(config)),
      exportedAt: Date.now(),
      exportVersion: '1.0.0'
    }

    if (includeDependencies) {
      const dependencies: SerializedEntity[] = []

      // 收集依赖的工具集
      for (const collectionId of config.toolCollectionIds) {
        const collection = toolCollectionManager.getCollection(collectionId)
        if (collection) {
          const collectionEntity = toolCollectionManager.exportCollection(collectionId, false)
          if (collectionEntity) {
            dependencies.push(collectionEntity)
          }
        }
      }

      entity.dependencies = dependencies
    }

    return entity
  }

  /**
   * 导入Agent配置
   */
  importConfig(entity: SerializedEntity, overwrite = false): AgentConfig {
    if (entity.entityType !== 'agent-config') {
      throw new Error('实体类型不匹配，期望 agent-config')
    }

    const config = entity.data as AgentConfig

    // 验证配置
    const validation = this.validateConfig(config)
    if (!validation.valid) {
      throw new Error(`Agent配置验证失败: ${validation.errors.join(', ')}`)
    }

    if (validation.warnings.length > 0) {
      this.getLogger().warn(`Agent配置导入警告: ${validation.warnings.join(', ')}`)
    }

    const existing = this.configs.get(config.id)

    if (existing && !overwrite) {
      throw new Error(`Agent配置 ${config.id} 已存在，请使用 overwrite=true 覆盖`)
    }

    this.configs.set(config.id, config)
    this.saveToStorage()
    this.getLogger().info(`Agent配置已导入: ${config.id}`)
    return config
  }

  /**
   * 从本地存储加载
   */
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY)
      if (stored) {
        const data = JSON.parse(stored)
        if (Array.isArray(data)) {
          data.forEach((item: AgentConfig) => {
            this.configs.set(item.id, item)
          })
          // 延迟记录日志，避免在构造函数中初始化logger
          if (this.logger) {
            this.logger.info(`已加载 ${data.length} 个Agent配置`)
          }
        }
      }
    } catch (error) {
      // 延迟记录日志，避免在构造函数中初始化logger
      if (this.logger) {
        this.logger.error('加载Agent配置失败:', error)
      } else {
        console.error('加载Agent配置失败:', error)
      }
    }
  }

  /**
   * 保存到本地存储
   */
  private saveToStorage(): void {
    try {
      const data = Array.from(this.configs.values())
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data))
    } catch (error) {
      // 延迟记录日志，避免在构造函数中初始化logger
      if (this.logger) {
        this.logger.error('保存Agent配置失败:', error)
      } else {
        console.error('保存Agent配置失败:', error)
      }
    }
  }
}

// 导出单例
export const agentConfigManager = new AgentConfigManager()

