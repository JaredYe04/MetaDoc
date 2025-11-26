/**
 * Agent Tool 插件管理器
 * 负责外部Tool的导入、导出、编辑等功能
 */

import type { AgentToolConfig, MCPToolConfig } from '../../types/agent-tool'
import { agentToolManager } from '../agent-tool-manager'
import { createRendererLogger } from '../logger'

const logger = createRendererLogger('ToolPluginManager')

/**
 * Tool配置导出格式
 */
export interface ExportedToolConfig {
  version: string
  tool: Omit<AgentToolConfig, 'callback' | 'displayComponent'>
  metadata?: {
    exportedAt: string
    exportedBy?: string
    description?: string
  }
}

/**
 * Tool插件管理器
 */
class ToolPluginManager {
  /**
   * 导出Tool配置为JSON
   */
  exportToolConfig(toolId: string): ExportedToolConfig | null {
    const tool = agentToolManager.getTool(toolId)
    if (!tool) {
      logger.warn(`Tool ${toolId} 不存在`)
      return null
    }

    // 只导出可编辑的Tool
    if (!tool.config.editable) {
      logger.warn(`Tool ${toolId} 不可导出（内部Tool）`)
      return null
    }

    const { callback, displayComponent, ...exportableConfig } = tool.config

    return {
      version: '1.0.0',
      tool: exportableConfig as Omit<AgentToolConfig, 'callback' | 'displayComponent'>,
      metadata: {
        exportedAt: new Date().toISOString(),
        description: `Exported tool: ${toolId}`
      }
    }
  }

  /**
   * 导出Tool配置为JSON字符串
   */
  exportToolConfigAsJSON(toolId: string): string | null {
    const config = this.exportToolConfig(toolId)
    if (!config) return null
    return JSON.stringify(config, null, 2)
  }

  /**
   * 从JSON导入Tool配置
   */
  importToolConfigFromJSON(json: string): void {
    try {
      const exported: ExportedToolConfig = JSON.parse(json)
      this.importToolConfig(exported)
    } catch (error) {
      logger.error('导入Tool配置失败:', error)
      throw new Error(`无效的Tool配置JSON: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 导入Tool配置
   */
  importToolConfig(exported: ExportedToolConfig): void {
    if (!exported.tool || !exported.tool.id) {
      throw new Error('Tool配置格式无效：缺少id')
    }

    const toolConfig = exported.tool

    // 验证必需字段
    if (!toolConfig.name || !toolConfig.description || !toolConfig.instruction) {
      throw new Error('Tool配置不完整：缺少必需字段')
    }

    // 如果是MCP Tool，需要特殊处理
    if (toolConfig.origin === 'mcp') {
      this.importMCPTool(toolConfig)
    } else if (toolConfig.origin === 'external') {
      // 外部Tool需要提供callback实现
      // 这里可以扩展为从URL加载或使用eval（不推荐）
      logger.warn('外部Tool需要手动实现callback函数')
      throw new Error('外部Tool需要提供callback实现，请使用可视化编辑器配置')
    } else {
      throw new Error(`不支持的Tool来源: ${toolConfig.origin}`)
    }
  }

  /**
   * 导入MCP Tool
   */
  private importMCPTool(config: Partial<AgentToolConfig> & { id: string; mcpConfig?: MCPToolConfig }): void {
    if (!config.mcpConfig) {
      throw new Error('MCP Tool必须提供mcpConfig')
    }

    // 创建MCP Tool回调函数
    const mcpCallback = this.createMCPCallback(config.mcpConfig!)

    // 注册Tool
    agentToolManager.registerTool({
      ...config,
      callback: mcpCallback,
      origin: 'mcp',
      editable: true
    } as AgentToolConfig)

    logger.info(`MCP Tool ${config.id} 已导入`)
  }

  /**
   * 创建MCP Tool回调函数
   * 注意：这里需要实现MCP客户端来调用MCP服务器
   */
  private createMCPCallback(mcpConfig: MCPToolConfig): any {
    // TODO: 实现MCP客户端调用
    // 这里应该连接到MCP服务器并调用相应的tool
    return async (params: Record<string, unknown>, signal: AbortSignal) => {
      // MCP调用实现
      logger.info('MCP Tool调用', { mcpConfig, params })
      
      // 这里需要实现实际的MCP协议调用
      // 可以参考MCP (Model Context Protocol) 规范
      throw new Error('MCP Tool调用尚未实现，需要MCP客户端支持')
    }
  }

  /**
   * 验证Tool配置
   */
  validateToolConfig(config: Partial<AgentToolConfig>): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!config.id) errors.push('缺少id')
    if (!config.name) errors.push('缺少name')
    if (!config.description) errors.push('缺少description')
    if (!config.instruction) errors.push('缺少instruction')
    if (!config.origin) errors.push('缺少origin')

    if (config.origin === 'mcp' && !config.mcpConfig) {
      errors.push('MCP Tool必须提供mcpConfig')
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  /**
   * 获取所有可导出的Tool
   */
  getExportableTools(): string[] {
    return agentToolManager
      .getAllTools()
      .filter(tool => tool.config.editable)
      .map(tool => tool.config.id)
  }
}

// 导出单例
export const toolPluginManager = new ToolPluginManager()

