<template>
  <div class="mxgraph-canvas-container" :style="containerStyle">
    <div ref="graphContainer" class="mxgraph-canvas" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { themeState } from '../../../utils/themes'
import type {
  Workflow,
  ArtifactNode,
  ControlFlowNode,
  WorkflowEdge
} from '../../../types/agent-framework'
import { createRendererLogger } from '../../../utils/logger'
// 导入mxgraph全局设置（必须在其他mxgraph导入之前）
import '../../../utils/mxgraph-setup'
import { getWorkflowNodeStyle } from '../../../utils/agent-framework/mxgraph-helper'

const props = defineProps<{
  workflow: Workflow | null
  toolMode?: 'pointer' | 'select' | 'pan' | 'text-edit' | 'delete'
}>()

const emit = defineEmits<{
  nodeAdded: [nodeId: string, nodeType: 'artifact' | 'control-flow']
  nodeRemoved: [nodeId: string]
  nodeUpdated: [nodeId: string, updates: Partial<ArtifactNode | ControlFlowNode>]
  nodeSelected: [nodeId: string | null]
  edgeAdded: [edge: WorkflowEdge]
  edgeRemoved: [edgeId: string]
  edgeUpdated: [edgeId: string, updates: Partial<WorkflowEdge>]
  workflowChanged: [workflow: Workflow]
  selectionChanged: [hasSelection: boolean]
}>()

const logger = createRendererLogger('MxGraphCanvas')
const graphContainer = ref<HTMLElement>()

let mx: any = null
let graph: any = null
let parent: any = null
let nodeIdToCell: Map<string, any> = new Map()
let cellIdToNodeId: Map<string, string> = new Map()
let isUpdatingFromProps = false // 防止循环更新标志
let rubberband: any = null // 框选工具实例

const containerStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd,
  width: '100%',
  height: '100%',
  position: 'relative' as const
}))

// 初始化mxgraph
const initMxGraph = async () => {
  if (!graphContainer.value) {
    logger.error('Graph container not found')
    return
  }

  try {
    // 再次确保mxLoadResources已定义（在动态导入之前）
    if (typeof window !== 'undefined' && !(window as any).mxLoadResources) {
      ;(window as any).mxLoadResources = () => {
        // 空函数，禁用资源加载
      }
    }

    // 动态导入mxgraph
    const mxgraphModule = await import('mxgraph')

    // mxgraph 是一个工厂函数，需要调用它来获取API
    const mxgraphFactory = mxgraphModule.default || mxgraphModule

    if (typeof mxgraphFactory === 'function') {
      // 调用工厂函数获取mxgraph API
      // 不传入任何参数，使用默认配置（资源加载已被禁用）
      mx = mxgraphFactory()

      if (!mx || !mx.mxGraph) {
        throw new Error('mxGraph API not found after factory call')
      }
    } else {
      // 如果不是函数，尝试直接使用模块
      mx = mxgraphModule as any
      if (!mx || !mx.mxGraph) {
        throw new Error('mxGraph not found in module')
      }
    }

    // 创建图形实例
    graph = new mx.mxGraph(graphContainer.value)
    parent = graph.getDefaultParent()

    // 配置图形
    graph.setConnectable(true)
    graph.setAllowDanglingEdges(false)
    graph.setAllowLoops(false)
    graph.setDisconnectOnMove(false)
    graph.setDropEnabled(false)

    // 配置拖动：使用空格键拖动画布，左键拖动节点
    graph.setPanning(true)
    graph.panningHandler.useLeftButtonForPanning = false // 禁用左键拖动画布
    graph.panningHandler.useRightButtonForPanning = false // 禁用右键拖动画布（避免右键菜单冲突）
    graph.panningHandler.usePopupTrigger = false

    // 自定义平移处理：只有在按住空格键时才允许拖动画布
    const originalIsForcePanningEvent = graph.panningHandler.isForcePanningEvent
    graph.panningHandler.isForcePanningEvent = function (me: any) {
      const evt = me.getEvent()
      // 按住空格键(32)时允许拖动画布
      return (
        (evt && evt.keyCode === 32) ||
        mx.mxEvent.isShiftDown(evt) ||
        (originalIsForcePanningEvent ? originalIsForcePanningEvent.call(this, me) : false)
      )
    }

    // 确保节点可以被拖动
    graph.panningHandler.getPanningCell = function (me: any) {
      // 如果点击的是节点，不拖动画布
      const cell = me.getCell()
      if (cell && (cell.vertex || cell.edge)) {
        return null // 返回null表示不拖动画布
      }
      // 点击空白处时允许拖动画布（如果按住空格键）
      return this.isForcePanningEvent(me) ? graph.getDefaultParent() : null
    }

    // 允许节点可移动（左键拖动）
    graph.setCellsMovable(true)
    graph.setCellsResizable(true)
    graph.setCellsCloneable(true)
    graph.setCellsDisconnectable(true)

    // 启用连接点和连接线
    graph.setConnectionConstraint(true)
    graph.setMultigraph(false)

    // 启用连接点显示
    graph.setConnectable(true)

    // 配置连接点样式
    if (mx.mxConstants) {
      mx.mxConstants.HANDLE_FILLCOLOR = '#00a8ff'
      mx.mxConstants.HANDLE_STROKECOLOR = '#006bb3'
      mx.mxConstants.CONNECT_HANDLE_SIZE = 8
    }

    // 启用工具提示
    graph.setTooltips(true)

    // 设置主题适配
    updateTheme()

    // 启用连接处理器（用于创建连接）
    if (mx.mxConnectionHandler) {
      const connectionHandler = new mx.mxConnectionHandler(graph)
      // 配置连接处理器
      connectionHandler.createTarget = true // 允许创建新连接目标
      if (connectionHandler.marker) {
        connectionHandler.marker.setHotspotEnabled(true)
        connectionHandler.marker.hotspot = 0.3 // 连接点热点大小
      }
      // setCreateIcon方法可能不存在，使用可选链
      if (typeof connectionHandler.setCreateIcon === 'function') {
        connectionHandler.setCreateIcon(false) // 禁用创建图标，直接使用连接点
      }
    }

    // 启用连接点显示：当鼠标悬停在节点上时显示连接点
    // 注意：CELL_HOVER 事件可能会导致 updateCellState 错误，改用更安全的方式
    // 连接点会在鼠标悬停时自动显示，无需手动更新状态

    // 配置连接点样式：在节点边缘显示
    if (mx.mxConstants) {
      // 连接点大小
      mx.mxConstants.CONNECT_HANDLE_SIZE = 8
      // 连接点颜色
      mx.mxConstants.HANDLE_FILLCOLOR = '#00a8ff'
      mx.mxConstants.HANDLE_STROKECOLOR = '#006bb3'
      // 连接点在节点边缘
      mx.mxConstants.HANDLE_SIZE = 8
    }

    // 启用框选工具
    if (mx.mxRubberband) {
      rubberband = new mx.mxRubberband(graph)

      // 配置框选样式（虚线框）- 通过重写创建方法来自定义样式
      if (rubberband && typeof rubberband.createShape === 'function') {
        const originalCreateShape = rubberband.createShape.bind(rubberband)
        rubberband.createShape = function (bounds: any) {
          const shape = originalCreateShape(bounds)
          if (shape && shape.node) {
            // 设置虚线边框样式
            shape.node.setAttribute('stroke-dasharray', '5,5')
            shape.node.setAttribute('stroke', '#409EFF')
            shape.node.setAttribute('stroke-width', '2')
            shape.node.setAttribute('fill', 'rgba(64, 158, 255, 0.1)')
            shape.node.setAttribute('stroke-opacity', '1')
            shape.node.setAttribute('fill-opacity', '0.1')
          }
          return shape
        }
      }

      // 设置默认颜色
      if (rubberband.defaultColors) {
        rubberband.defaultColors.stroke = '#409EFF'
        rubberband.defaultColors.fill = 'rgba(64, 158, 255, 0.2)'
      }
    }

    // 修复 geo.clone 错误：重写 translateCell 方法以确保正确处理 geometry
    const originalTranslateCell = graph.translateCell.bind(graph)
    graph.translateCell = function (cell: any, dx: number, dy: number) {
      if (!cell) {
        return originalTranslateCell(cell, dx, dy)
      }

      try {
        const geo = cell.getGeometry()
        if (!geo) {
          return originalTranslateCell(cell, dx, dy)
        }

        // 使用mxUtils.clone来克隆geometry，或者手动创建新的geometry
        let clonedGeo: any
        if (mx.mxUtils && typeof mx.mxUtils.clone === 'function') {
          clonedGeo = mx.mxUtils.clone(geo)
        } else {
          // 手动克隆geometry的所有属性
          clonedGeo = new mx.mxGeometry(geo.x, geo.y, geo.width, geo.height)
          clonedGeo.relative = geo.relative || false
          clonedGeo.sourcePoint = geo.sourcePoint
            ? new mx.mxPoint(geo.sourcePoint.x, geo.sourcePoint.y)
            : null
          clonedGeo.targetPoint = geo.targetPoint
            ? new mx.mxPoint(geo.targetPoint.x, geo.targetPoint.y)
            : null
          clonedGeo.points = geo.points
            ? geo.points.map((p: any) => new mx.mxPoint(p.x, p.y))
            : null
          clonedGeo.offset = geo.offset ? new mx.mxPoint(geo.offset.x, geo.offset.y) : null
        }

        // 应用平移
        clonedGeo.x += dx
        clonedGeo.y += dy

        // 使用setGeometry更新位置
        graph.getModel().setGeometry(cell, clonedGeo)
        return cell
      } catch (error) {
        logger.warn('translateCell error, using fallback:', error)
        // 如果出错，尝试使用原始方法但不传入可能导致错误的参数
        try {
          return originalTranslateCell(cell, dx, dy)
        } catch (e) {
          logger.error('translateCell fallback also failed:', e)
          // 最后的兜底方案：直接更新geometry的x和y
          try {
            const geo = cell.getGeometry()
            if (geo) {
              const newGeo = new mx.mxGeometry(geo.x + dx, geo.y + dy, geo.width, geo.height)
              graph.getModel().setGeometry(cell, newGeo)
            }
          } catch (finalError) {
            logger.error('translateCell final fallback failed:', finalError)
          }
          return cell
        }
      }
    }

    // 启用删除键删除选中的单元格
    graph.addListener(mx.mxEvent.CELLS_DELETED, () => {
      syncToWorkflow()
    })

    // 启用连接创建事件
    graph.addListener(mx.mxEvent.CONNECT_CELL, () => {
      syncToWorkflow()
    })

    // 监听图形变化
    if (mx.mxEvent) {
      graph.getModel().addListener(mx.mxEvent.CHANGE, () => {
        // 防止循环触发
        if (!isUpdatingFromProps) {
          syncToWorkflow()
        }
      })

      // 监听单元格双击编辑
      graph.addListener(mx.mxEvent.DOUBLE_CLICK, (sender: any, evt: any) => {
        const cell = evt.getProperty('cell')
        if (cell && cell.vertex) {
          graph.startEditingAtCell(cell)
        }
      })

      // 监听连接创建
      graph.addListener(mx.mxEvent.CONNECT_CELL, (sender: any, evt: any) => {
        const edge = evt.getProperty('edge')
        const source = evt.getProperty('source')
        const target = evt.getProperty('target')

        if (edge && source && target && source.nodeId && target.nodeId) {
          // 为新创建的边设置edgeId
          if (!edge.edgeId) {
            edge.edgeId = `edge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
          }

          // 存储节点关联信息
          edge.sourceNodeId = source.nodeId
          edge.targetNodeId = target.nodeId

          // 同步到工作流
          nextTick(() => {
            syncToWorkflow()
          })
        }
      })

      // 监听单元格移动
      graph.addListener(mx.mxEvent.MOVE_CELLS, () => {
        syncToWorkflow()
      })

      // 监听选择变化
      graph.getSelectionModel().addListener(mx.mxEvent.CHANGE, () => {
        const cells = graph.getSelectionCells()
        const hasSelection = cells && cells.length > 0
        emit('selectionChanged', hasSelection)

        // 发射节点选择事件
        const selectedNode =
          cells && cells.length === 1 && cells[0].vertex ? cells[0].nodeId || null : null
        emit('nodeSelected', selectedNode)
      })
    }

    // 添加键盘快捷键支持
    if (mx.mxKeyHandler) {
      const keyHandler = new mx.mxKeyHandler(graph)

      // Delete键删除选中的单元格
      keyHandler.bindKey(46, () => {
        // Delete key
        const cells = graph.getSelectionCells()
        if (cells && cells.length > 0) {
          const cellsToRemove = cells.filter((cell: any) => {
            // 只允许删除节点和连接线
            return cell.vertex || cell.edge
          })

          if (cellsToRemove.length > 0) {
            graph.removeCells(cellsToRemove)
            syncToWorkflow()
          }
        }
      })

      // Ctrl+C 复制
      keyHandler.bindControlKey(67, () => {
        // Ctrl+C
        const cells = graph.getSelectionCells()
        if (cells && cells.length > 0) {
          graph.copy()
        }
      })

      // Ctrl+V 粘贴
      keyHandler.bindControlKey(86, () => {
        // Ctrl+V
        graph.paste()
        syncToWorkflow()
      })

      // Ctrl+A 全选
      keyHandler.bindControlKey(65, (evt: KeyboardEvent) => {
        // Ctrl+A
        evt.preventDefault()
        graph.selectAll()
      })
    }

    // 设置初始工具模式
    if (props.toolMode) {
      setToolMode(props.toolMode)
    } else {
      setToolMode('pointer')
    }

    // 加载工作流（使用nextTick确保DOM已渲染）
    nextTick(() => {
      if (props.workflow) {
        loadWorkflow(props.workflow, true) // 首次加载使用强制重新加载
      }
    })

    logger.info('mxGraph initialized successfully')
  } catch (error) {
    logger.error('Failed to initialize mxGraph:', error)
    console.error('mxGraph initialization error:', error)
  }
}

// 更新主题
const updateTheme = () => {
  if (!graph) return

  const bgColor = themeState.currentTheme.background2nd
  const canvas = graphContainer.value
  if (canvas) {
    canvas.style.backgroundColor = bgColor
  }
}

// 节点样式定义
const getNodeStyle = (nodeType: string, isArtifact: boolean): string => {
  return getWorkflowNodeStyle(nodeType, isArtifact, {
    type: themeState.currentTheme.type,
    background: themeState.currentTheme.background,
    textColor: themeState.currentTheme.textColor
  })
}

// 加载工作流到图形（增量更新，保留现有状态）
const loadWorkflow = (workflow: Workflow, forceReload: boolean = false) => {
  if (!graph || !parent || !mx) return

  graph.getModel().beginUpdate()
  try {
    // 保存现有单元格的状态（位置、大小、文字、样式等）
    const existingCells = new Map<string, any>()
    const existingEdges = new Map<string, any>()

    graph.getChildCells(parent, true, true).forEach((cell: any) => {
      if (cell.vertex && cell.nodeId) {
        const geometry = cell.getGeometry()
        const value = cell.getValue()
        const style = cell.getStyle()
        existingCells.set(cell.nodeId, {
          geometry: { ...geometry },
          value,
          style,
          cell
        })
      } else if (cell.edge && cell.edgeId) {
        existingEdges.set(cell.edgeId, {
          source: cell.getSource()?.nodeId,
          target: cell.getTarget()?.nodeId,
          value: cell.getValue(),
          style: cell.getStyle(),
          cell
        })
      }
    })

    // 如果需要强制重新加载，清除所有
    if (forceReload) {
      graph.removeCells(graph.getChildCells(parent, true, true))
      nodeIdToCell.clear()
      cellIdToNodeId.clear()
    } else {
      // 只删除不存在的节点和边
      const existingNodeIds = new Set([
        ...workflow.artifactNodes.map((n) => n.id),
        ...workflow.controlFlowNodes.map((n) => n.id)
      ])
      const existingEdgeIds = new Set(workflow.edges.map((e) => e.id))

      graph.getChildCells(parent, true, true).forEach((cell: any) => {
        if (cell.vertex && cell.nodeId && !existingNodeIds.has(cell.nodeId)) {
          graph.removeCells([cell])
          nodeIdToCell.delete(cell.nodeId)
          cellIdToNodeId.delete(cell.id)
        } else if (cell.edge && cell.edgeId && !existingEdgeIds.has(cell.edgeId)) {
          graph.removeCells([cell])
        }
      })
    }

    // 加载或更新工件节点
    workflow.artifactNodes.forEach((node) => {
      let cell = nodeIdToCell.get(node.id)
      const existingState = existingCells.get(node.id)

      if (cell && existingState && !forceReload) {
        // 更新现有节点，保留位置和大小
        const geometry = existingState.geometry
        // 如果有新位置，使用新位置，否则保留现有位置
        if (node.position) {
          geometry.x = node.position.x
          geometry.y = node.position.y
        }
        // 保留文字（如果用户在图形中修改过）
        if (node.label && node.label !== existingState.value) {
          graph.model.setValue(cell, node.label)
        }
        graph.model.setGeometry(cell, geometry)
      } else {
        // 创建新节点
        cell = createArtifactNodeCell(node)
        if (cell) {
          // 如果有保存的状态，恢复它
          if (existingState) {
            graph.model.setGeometry(cell, existingState.geometry)
            if (existingState.value) {
              graph.model.setValue(cell, existingState.value)
            }
          }
          nodeIdToCell.set(node.id, cell)
          cellIdToNodeId.set(cell.id, node.id)
        }
      }
    })

    // 加载或更新控制流节点
    workflow.controlFlowNodes.forEach((node) => {
      let cell = nodeIdToCell.get(node.id)
      const existingState = existingCells.get(node.id)

      if (cell && existingState && !forceReload) {
        // 更新现有节点
        const geometry = existingState.geometry
        if (node.position) {
          geometry.x = node.position.x
          geometry.y = node.position.y
        }
        if (node.label && node.label !== existingState.value) {
          graph.model.setValue(cell, node.label)
        }
        graph.model.setGeometry(cell, geometry)
      } else {
        // 创建新节点
        cell = createControlFlowNodeCell(node)
        if (cell) {
          if (existingState) {
            graph.model.setGeometry(cell, existingState.geometry)
            if (existingState.value) {
              graph.model.setValue(cell, existingState.value)
            }
          }
          nodeIdToCell.set(node.id, cell)
          cellIdToNodeId.set(cell.id, node.id)
        }
      }
    })

    // 加载或更新边
    workflow.edges.forEach((edge) => {
      const sourceCell = nodeIdToCell.get(edge.source)
      const targetCell = nodeIdToCell.get(edge.target)

      if (!sourceCell || !targetCell) {
        return // 源或目标节点不存在，跳过
      }

      // 查找现有边
      const existingEdge = Array.from(graph.getChildCells(parent, true, true)).find(
        (cell: any) =>
          cell.edge &&
          (cell.edgeId === edge.id ||
            (cell.getSource()?.nodeId === edge.source && cell.getTarget()?.nodeId === edge.target))
      )

      if (!existingEdge) {
        // 创建新边
        createEdgeCell(edge)
      } else if ((existingEdge as any).edgeId !== edge.id) {
        // 更新边的ID
        ;(existingEdge as any).edgeId = edge.id
      }
    })
  } finally {
    graph.getModel().endUpdate()
  }
}

// 创建工件节点单元格
const createArtifactNodeCell = (node: ArtifactNode): any => {
  if (!graph || !parent) return null

  const x = node.position?.x || 100
  const y = node.position?.y || 100
  const width = 150
  const height = 80

  const label = node.label || `${node.type}: ${node.artifactId || 'unnamed'}`
  let style = getNodeStyle(node.type, true)

  // 添加连接点配置，使节点可连接
  style +=
    ';portConstraint=eastwest;portConstraintRotation=0;portConstraintEw=1;portConstraintNs=1;'

  const cell = graph.insertVertex(parent, null, label, x, y, width, height, style)

  // 存储节点信息
  if (cell) {
    cell.nodeId = node.id
    cell.nodeType = 'artifact'
    cell.artifactType = node.type
    cell.artifactId = node.artifactId

    // 确保节点可连接
    graph.setCellStyles('connectable', '1', [cell])
  }

  return cell
}

// 创建控制流节点单元格
const createControlFlowNodeCell = (node: ControlFlowNode): any => {
  if (!graph || !parent) return null

  const x = node.position?.x || 100
  const y = node.position?.y || 100
  const width = 120
  const height = 80

  const label = node.label || node.type
  let style = getNodeStyle(node.type, false)

  // 添加连接点配置，使节点可连接
  style +=
    ';portConstraint=eastwest;portConstraintRotation=0;portConstraintEw=1;portConstraintNs=1;'

  const cell = graph.insertVertex(parent, null, label, x, y, width, height, style)

  // 存储节点信息
  if (cell) {
    cell.nodeId = node.id
    cell.nodeType = 'control-flow'
    cell.controlFlowType = node.type

    // 确保节点可连接
    graph.setCellStyles('connectable', '1', [cell])
  }

  return cell
}

// 创建边单元格
const createEdgeCell = (edge: WorkflowEdge): any => {
  if (!graph || !parent) return null

  const sourceCell = nodeIdToCell.get(edge.source)
  const targetCell = nodeIdToCell.get(edge.target)

  if (!sourceCell || !targetCell) {
    logger.warn(`Edge ${edge.id}: source or target node not found`)
    return null
  }

  const label = edge.label || ''
  // 改进连接线样式：使用正交样式，圆角，带箭头
  const style = [
    'edgeStyle=orthogonalEdgeStyle',
    'rounded=1',
    'strokeWidth=2',
    'endArrow=block',
    'endSize=8',
    'startArrow=none',
    'strokeColor=#666666',
    'labelBackgroundColor=transparent'
  ].join(';')

  const cell = graph.insertEdge(
    parent,
    edge.id, // 使用edge.id作为cell id
    label,
    sourceCell,
    targetCell,
    style
  )

  // 存储边信息到cell上
  if (cell) {
    cell.edgeId = edge.id
    cell.sourceField = edge.sourceField
    cell.targetField = edge.targetField
    cell.condition = edge.condition
  }

  return cell
}

// 同步图形到工作流（保存所有状态：位置、大小、文字）
const syncToWorkflow = () => {
  if (!graph || !parent || !props.workflow || isUpdatingFromProps) return

  const workflow = { ...props.workflow }
  const artifactNodes: ArtifactNode[] = []
  const controlFlowNodes: ControlFlowNode[] = []
  const edges: WorkflowEdge[] = []

  // 收集所有单元格
  const cells = graph.getChildCells(parent, true, false)

  cells.forEach((cell: any) => {
    if (cell.vertex) {
      // 节点 - 保存完整状态
      const geometry = cell.getGeometry()
      const position = { x: geometry.x, y: geometry.y }
      const size = { width: geometry.width, height: geometry.height }
      const label = cell.getValue()?.toString() || ''

      if (cell.nodeType === 'artifact') {
        const node = workflow.artifactNodes.find((n) => n.id === cell.nodeId)
        if (node) {
          artifactNodes.push({
            ...node,
            label,
            position,
            // 保存大小（如果节点类型支持）
            ...(size.width !== 150 || size.height !== 80 ? { size } : {})
          })
        } else {
          // 如果节点不在工作流中，创建一个新节点
          artifactNodes.push({
            id: cell.nodeId,
            type: cell.artifactType || 'tool',
            artifactId: cell.artifactId || '',
            label,
            position,
            ...(size.width !== 150 || size.height !== 80 ? { size } : {})
          })
        }
      } else if (cell.nodeType === 'control-flow') {
        const node = workflow.controlFlowNodes.find((n) => n.id === cell.nodeId)
        if (node) {
          controlFlowNodes.push({
            ...node,
            label,
            position,
            ...(size.width !== 120 || size.height !== 80 ? { size } : {})
          })
        } else {
          // 如果节点不在工作流中，创建一个新节点
          controlFlowNodes.push({
            id: cell.nodeId,
            type: cell.controlFlowType || 'condition',
            label,
            position,
            config: {},
            ...(size.width !== 120 || size.height !== 80 ? { size } : {})
          })
        }
      }
    } else if (cell.edge) {
      // 边 - 保存完整状态
      const source = cell.getSource()
      const target = cell.getTarget()
      if (source && target) {
        const sourceNodeId = source.nodeId || cellIdToNodeId.get(source.id)
        const targetNodeId = target.nodeId || cellIdToNodeId.get(target.id)

        if (sourceNodeId && targetNodeId) {
          const edgeId =
            cell.edgeId ||
            cell.id ||
            `edge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

          if (!cell.edgeId) {
            cell.edgeId = edgeId
          }

          const edge: WorkflowEdge = {
            id: edgeId,
            source: sourceNodeId,
            target: targetNodeId,
            sourceField: cell.sourceField,
            targetField: cell.targetField,
            condition: cell.condition,
            label: cell.getValue()?.toString() || ''
          }

          const existingEdgeIndex = edges.findIndex(
            (e) =>
              e.id === edgeId ||
              (e.source === sourceNodeId && e.target === targetNodeId && e.id !== edgeId)
          )

          if (existingEdgeIndex === -1) {
            edges.push(edge)
          } else {
            edges[existingEdgeIndex] = edge
          }
        }
      }
    }
  })

  // 更新工作流
  workflow.artifactNodes = artifactNodes
  workflow.controlFlowNodes = controlFlowNodes
  workflow.edges = edges

  // 设置标志，防止触发 watch 循环
  isUpdatingFromProps = true
  try {
    emit('workflowChanged', workflow)
  } finally {
    nextTick(() => {
      isUpdatingFromProps = false
    })
  }
}

// 添加节点
const addNode = (
  nodeType: 'artifact' | 'control-flow',
  type: string,
  label: string,
  position: { x: number; y: number },
  nodeId?: string
): any => {
  if (!graph || !parent) return null

  const finalNodeId = nodeId || `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  let cell: any

  graph.getModel().beginUpdate()
  try {
    const style = getNodeStyle(type, nodeType === 'artifact')
    const width = nodeType === 'artifact' ? 150 : 120
    const height = 80

    // 添加连接点配置到样式
    let finalStyle = style
    finalStyle +=
      ';portConstraint=eastwest;portConstraintRotation=0;portConstraintEw=1;portConstraintNs=1;'

    cell = graph.insertVertex(
      parent,
      finalNodeId, // 使用nodeId作为mxgraph的cell id
      label,
      position.x,
      position.y,
      width,
      height,
      finalStyle
    )

    // 设置节点信息到cell上
    if (cell) {
      cell.nodeId = finalNodeId
      cell.nodeType = nodeType
      if (nodeType === 'artifact') {
        cell.artifactType = type
        cell.artifactId = ''
      } else {
        cell.controlFlowType = type
      }

      // 确保节点可连接
      graph.setCellStyles('connectable', '1', [cell])

      nodeIdToCell.set(finalNodeId, cell)
      cellIdToNodeId.set(cell.id, finalNodeId)
    }

    emit('nodeAdded', finalNodeId, nodeType)
  } finally {
    graph.getModel().endUpdate()
  }

  return cell
}

// 设置工具模式
const setToolMode = (mode: 'pointer' | 'select' | 'pan' | 'text-edit' | 'delete') => {
  if (!graph || !mx) return

  // 重置所有模式相关配置
  graph.setPanning(false)
  graph.setCellsMovable(true)
  graph.setCellsSelectable(true)

  // 禁用rubberband（默认）
  if (rubberband) {
    rubberband.setEnabled(false)
  }

  // 移除之前的点击删除监听器
  if (graph._deleteClickHandler) {
    graph.removeListener(graph._deleteClickHandler)
    graph._deleteClickHandler = null
  }

  switch (mode) {
    case 'pointer':
      // 默认模式：可以选择和移动节点
      graph.setCellsMovable(true)
      graph.setCellsSelectable(true)
      graph.setPanning(false)
      break
    case 'select':
      // 框选模式：启用框选工具
      graph.setCellsMovable(false)
      graph.setCellsSelectable(true)
      graph.setPanning(false)
      // 启用rubberband框选
      if (rubberband) {
        rubberband.setEnabled(true)
      }
      break
    case 'pan':
      // 拖动画布模式：启用平移
      graph.setCellsMovable(false)
      graph.setCellsSelectable(false)
      graph.setPanning(true)
      graph.panningHandler.useLeftButtonForPanning = true
      break
    case 'text-edit':
      // 文字编辑模式：双击可编辑
      graph.setCellsMovable(false)
      graph.setCellsSelectable(true)
      graph.setPanning(false)
      break
    case 'delete':
      // 删除模式：点击删除
      graph.setCellsMovable(false)
      graph.setCellsSelectable(true)
      graph.setPanning(false)

      // 添加点击删除监听器
      const deleteHandler = (sender: any, evt: any) => {
        const cell = evt.getProperty('cell')
        if (cell && (cell.vertex || cell.edge)) {
          graph.removeCells([cell])
          syncToWorkflow()
        }
      }
      graph._deleteClickHandler = graph.addListener(mx.mxEvent.CELL_CLICKED, deleteHandler)
      break
  }
}

// 监听工具模式变化
watch(
  () => props.toolMode,
  (newMode) => {
    if (newMode) {
      setToolMode(newMode)
    }
  }
)

// 导出方法供父组件调用
defineExpose({
  addNode,
  loadWorkflow,
  getGraph: () => graph,
  getMx: () => mx,
  setToolMode
})

// 监听工作流变化
// 使用 ref 来跟踪上一次的 workflow，避免不必要的重新加载
let lastWorkflowId: string | null = null

watch(
  () => props.workflow,
  (newWorkflow, oldWorkflow) => {
    if (newWorkflow && graph && !isUpdatingFromProps) {
      // 只在 workflow id 变化时强制重新加载，其他时候增量更新
      const workflowId = newWorkflow.id
      const shouldForceReload = workflowId !== lastWorkflowId || !oldWorkflow

      // 如果只是添加/删除节点，不需要重新加载
      if (!shouldForceReload && oldWorkflow) {
        const oldNodeIds = new Set([
          ...oldWorkflow.artifactNodes.map((n) => n.id),
          ...oldWorkflow.controlFlowNodes.map((n) => n.id)
        ])
        const newNodeIds = new Set([
          ...newWorkflow.artifactNodes.map((n) => n.id),
          ...newWorkflow.controlFlowNodes.map((n) => n.id)
        ])

        // 如果只是新增节点，使用增量更新
        const hasOnlyNewNodes = Array.from(newNodeIds).every(
          (id) => oldNodeIds.has(id) || !oldNodeIds.has(id)
        )
        if (hasOnlyNewNodes && newNodeIds.size >= oldNodeIds.size) {
          // 增量更新，不触发完整重载
          loadWorkflow(newWorkflow, false)
          lastWorkflowId = workflowId
          return
        }
      }

      isUpdatingFromProps = true
      try {
        loadWorkflow(newWorkflow, shouldForceReload)
        lastWorkflowId = workflowId
      } finally {
        nextTick(() => {
          isUpdatingFromProps = false
        })
      }
    }
  },
  { deep: true }
)

// 监听主题变化
watch(
  () => themeState.currentTheme.type,
  () => {
    updateTheme()
    if (graph && props.workflow) {
      loadWorkflow(props.workflow)
    }
  }
)

onMounted(() => {
  nextTick(() => {
    initMxGraph()
  })
})

onBeforeUnmount(() => {
  if (graph) {
    try {
      graph.destroy()
    } catch (e) {
      // ignore
    }
    graph = null
  }
  mx = null
})
</script>

<style scoped>
.mxgraph-canvas-container {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.mxgraph-canvas {
  width: 100%;
  height: 100%;
}
</style>

<style>
/* 框选虚线框样式 - 全局样式 */
.mx-rubberband {
  stroke-dasharray: 5, 5 !important;
  stroke: #409eff !important;
  stroke-width: 2px !important;
  fill: rgba(64, 158, 255, 0.1) !important;
  fill-opacity: 0.1 !important;
  stroke-opacity: 1 !important;
}
</style>
