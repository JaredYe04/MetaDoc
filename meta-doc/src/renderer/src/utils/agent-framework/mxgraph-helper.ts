/**
 * mxgraph 辅助工具
 * 封装 mxgraph 的初始化和常用操作
 */

// 导入mxgraph全局设置（必须在其他mxgraph导入之前）
import '../mxgraph-setup'
import type {
  Workflow,
  ArtifactNode,
  ControlFlowNode,
  WorkflowEdge
} from '../../types/agent-framework'

let mxgraphFactory: any = null
let mx: any = null

/**
 * 初始化 mxgraph
 */
export async function initMxGraph(): Promise<any> {
  if (mx) {
    return mx
  }

  try {
    // mxLoadResources 已在模块级别定义，这里直接导入mxgraph
    // 动态导入 mxgraph
    const mxgraphModule = await import('mxgraph')

    // mxgraph 是一个工厂函数，需要调用它来获取API
    mxgraphFactory = mxgraphModule.default || mxgraphModule

    if (typeof mxgraphFactory === 'function') {
      // 调用工厂函数获取mxgraph API
      // 不传入任何参数，使用默认配置（资源加载已被禁用）
      mx = mxgraphFactory()
    } else {
      // 如果不是函数，尝试直接使用模块
      mx = mxgraphModule as any
    }

    if (!mx || !mx.mxGraph) {
      throw new Error('mxGraph initialization failed')
    }

    return mx
  } catch (error) {
    console.error('Failed to initialize mxgraph:', error)
    throw error
  }
}

/**
 * 获取 mxgraph 实例
 */
export function getMxGraph(): any {
  if (!mx) {
    throw new Error('mxgraph not initialized. Call initMxGraph() first.')
  }
  return mx
}

/**
 * 创建工作流节点样式
 */
export function getWorkflowNodeStyle(
  nodeType: string,
  isArtifact: boolean,
  theme: { type: string; background: string; textColor: string }
): string {
  const baseStyle = 'rounded=1;whiteSpace=wrap;html=1;'
  const fillColor = theme.type === 'dark' ? '#2d2d30' : '#ffffff'
  const strokeColor = theme.type === 'dark' ? '#3e3e42' : '#d1d1d1'
  const textColor = theme.textColor

  if (isArtifact) {
    // 工件节点样式
    switch (nodeType) {
      case 'tool':
        return `${baseStyle}fillColor=${fillColor};strokeColor=#4CAF50;fontColor=${textColor};strokeWidth=2;`
      case 'workflow':
        return `${baseStyle}fillColor=${fillColor};strokeColor=#2196F3;fontColor=${textColor};strokeWidth=2;`
      case 'llm-decision':
        return `${baseStyle}fillColor=${fillColor};strokeColor=#FF9800;fontColor=${textColor};strokeWidth=2;`
      case 'agent-config':
        return `${baseStyle}fillColor=${fillColor};strokeColor=#9C27B0;fontColor=${textColor};strokeWidth=2;`
      default:
        return `${baseStyle}fillColor=${fillColor};strokeColor=${strokeColor};fontColor=${textColor};`
    }
  } else {
    // 控制流节点样式
    switch (nodeType) {
      case 'start':
        return `${baseStyle}shape=ellipse;fillColor=${fillColor};strokeColor=#4CAF50;fontColor=${textColor};strokeWidth=3;`
      case 'end':
        return `${baseStyle}shape=doubleEllipse;fillColor=${fillColor};strokeColor=#F44336;fontColor=${textColor};strokeWidth=3;`
      case 'condition':
        return `${baseStyle}shape=rhombus;fillColor=${fillColor};strokeColor=#F44336;fontColor=${textColor};strokeWidth=2;`
      case 'loop':
        return `${baseStyle}shape=hexagon;fillColor=${fillColor};strokeColor=#E91E63;fontColor=${textColor};strokeWidth=2;`
      case 'parallel':
        return `${baseStyle}fillColor=${fillColor};strokeColor=#00BCD4;fontColor=${textColor};strokeWidth=2;`
      case 'merge':
        return `${baseStyle}shape=triangle;fillColor=${fillColor};strokeColor=#009688;fontColor=${textColor};strokeWidth=2;`
      case 'async':
        return `${baseStyle}shape=cylinder;fillColor=${fillColor};strokeColor=#795548;fontColor=${textColor};strokeWidth=2;`
      case 'aggregate':
        return `${baseStyle}fillColor=${fillColor};strokeColor=#607D8B;fontColor=${textColor};strokeWidth=2;`
      default:
        return `${baseStyle}fillColor=${fillColor};strokeColor=${strokeColor};fontColor=${textColor};`
    }
  }
}

/**
 * 将工作流节点映射到图形节点
 */
export function mapWorkflowNodeToGraphCell(
  node: ArtifactNode | ControlFlowNode,
  mx: any,
  graph: any,
  parent: any
): any {
  const x = node.position?.x || 100
  const y = node.position?.y || 100
  const width = 150
  const height = 80

  let label = node.label
  let style = ''
  let nodeInfo: any = {}

  if ('artifactId' in node) {
    // 工件节点
    const artifactNode = node as ArtifactNode
    label = artifactNode.label || `${artifactNode.type}: ${artifactNode.artifactId || 'unnamed'}`
    style = getWorkflowNodeStyle(artifactNode.type, true, {
      type: 'light', // 后续可以从主题获取
      background: '#ffffff',
      textColor: '#000000'
    })
    nodeInfo = {
      nodeId: artifactNode.id,
      nodeType: 'artifact',
      artifactType: artifactNode.type,
      artifactId: artifactNode.artifactId
    }
  } else {
    // 控制流节点
    const controlNode = node as ControlFlowNode
    label = controlNode.label || controlNode.type
    style = getWorkflowNodeStyle(controlNode.type, false, {
      type: 'light',
      background: '#ffffff',
      textColor: '#000000'
    })
    nodeInfo = {
      nodeId: controlNode.id,
      nodeType: 'control-flow',
      controlFlowType: controlNode.type
    }
  }

  const cell = graph.insertVertex(parent, null, label, x, y, width, height, style)

  // 附加节点信息
  Object.assign(cell, nodeInfo)

  return cell
}

/**
 * 将工作流边映射到图形边
 */
export function mapWorkflowEdgeToGraphEdge(
  edge: WorkflowEdge,
  mx: any,
  graph: any,
  parent: any,
  nodeIdToCell: Map<string, any>
): any {
  const sourceCell = nodeIdToCell.get(edge.source)
  const targetCell = nodeIdToCell.get(edge.target)

  if (!sourceCell || !targetCell) {
    return null
  }

  const label = edge.label || ''
  const style = 'edgeStyle=orthogonalEdgeStyle;rounded=0;strokeWidth=2;'

  const cell = graph.insertEdge(parent, null, label, sourceCell, targetCell, style)

  // 附加边信息
  cell.edgeId = edge.id
  cell.sourceField = edge.sourceField
  cell.targetField = edge.targetField
  cell.condition = edge.condition

  return cell
}
