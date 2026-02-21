<template>
  <div class="learning-graph">
    <div v-if="!defaultExpanded" class="graph-header">
      <h3>{{ $t('userManual.graph.title') || '学习路径图' }}</h3>
      <Button
        variant="ghost"
        @click="toggleExpanded"
      >
        <component :is="isExpanded ? ArrowUp : ArrowDown" class="mr-2 h-4 w-4" />
        {{ isExpanded ? ($t('userManual.graph.collapse') || '收起') : ($t('userManual.graph.expand') || '展开') }}
      </Button>
    </div>

    <div v-if="isExpanded || defaultExpanded" class="graph-content">
      <div
        ref="graphContainer"
        class="graph-canvas"
        @mousedown="onCanvasMouseDown"
        @wheel.prevent="onWheel"
      >
        <!-- SVG 由 renderGraph 挂载到 graphContainer 内 -->
      </div>

      <div class="graph-legend">
        <div class="legend-item">
          <span class="legend-node completed"></span>
          <span>{{ $t('userManual.graph.completed') || '已完成' }}</span>
        </div>
        <div class="legend-item">
          <span class="legend-node current"></span>
          <span>{{ $t('userManual.graph.current') || '当前' }}</span>
        </div>
        <div class="legend-item">
          <span class="legend-node pending"></span>
          <span>{{ $t('userManual.graph.pending') || '待学习' }}</span>
        </div>
        <div class="legend-item">
          <span class="legend-node selected"></span>
          <span>{{ $t('userManual.graph.selected') || '已选中' }}</span>
        </div>
      </div>
    </div>

    <div v-if="defaultExpanded" class="graph-header-simple">
      <h3>{{ $t('userManual.graph.title') || '学习路径图' }}</h3>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUserManual } from '../../stores/userManual'
import { ArrowUp, ArrowDown } from '@element-plus/icons-vue'
import { Button } from '@renderer/components/ui/button'
import * as d3 from 'd3'

const props = withDefaults(defineProps<{
  defaultExpanded?: boolean
  selectedId?: string | null
}>(), {
  defaultExpanded: false,
  selectedId: null
})

const emit = defineEmits<{
  'update:selectedId': [articleId: string | null]
  nodeSelected: [articleId: string | null]
}>()

const { learningPath, articleProgress, currentArticleId, learningGraph, setCurrentArticle } = useUserManual()
const { t } = useI18n()

const isExpanded = ref(props.defaultExpanded)
const graphContainer = ref<HTMLElement | null>(null)
const selectedNodeId = ref<string | null>(props.selectedId ?? null)

// 平移与缩放（在「容器像素」下：viewBox = 容器大小，内容在 graph 坐标里再通过 transform 映射）
const panX = ref(0)
const panY = ref(0)
const zoomK = ref(1)
let containerWidth = 400
let containerHeight = 320
let graphWidth = 400
let graphHeight = 320
let zoomPanGroup: d3.Selection<SVGGElement, unknown, null, undefined> | null = null
let nodesWithPos: Array<{ id: string; label: string; x: number; y: number; order: number }> = []
const MIN_ZOOM = 0.15
const MAX_ZOOM = 4

watch(() => props.selectedId, (id) => {
  selectedNodeId.value = id ?? null
}, { immediate: true })

const toggleExpanded = () => {
  isExpanded.value = !isExpanded.value
  if (isExpanded.value || props.defaultExpanded) {
    nextTick(() => renderGraph())
  }
}

// 拓扑序
function computeTopologicalOrder(nodes: any[], edges: any[]): string[] {
  const nodeIds = nodes.map(n => n.id)
  const inDegree = new Map<string, number>()
  const adjList = new Map<string, string[]>()
  nodeIds.forEach(id => {
    inDegree.set(id, 0)
    adjList.set(id, [])
  })
  edges.forEach(edge => {
    if (edge.type === 'prerequisite') {
      const target = edge.target?.id ?? edge.target
      const source = edge.source?.id ?? edge.source
      adjList.get(source)?.push(target)
      inDegree.set(target, (inDegree.get(target) || 0) + 1)
    }
  })
  const queue: string[] = []
  const result: string[] = []
  inDegree.forEach((degree, id) => { if (degree === 0) queue.push(id) })
  while (queue.length > 0) {
    const current = queue.shift()!
    result.push(current)
    ;(adjList.get(current) || []).forEach(neighbor => {
      const d = inDegree.get(neighbor) || 0
      inDegree.set(neighbor, d - 1)
      if (inDegree.get(neighbor) === 0) queue.push(neighbor)
    })
  }
  nodeIds.forEach(id => { if (!result.includes(id)) result.push(id) })
  return result
}

// 正交折线：从 source 底中 到 target 顶中
function orthogonalPath(
  sx: number, sy: number, sw: number, sh: number,
  tx: number, ty: number, tw: number, th: number
): string {
  const fromX = sx + sw / 2
  const fromY = sy + sh
  const toX = tx + tw / 2
  const toY = ty
  const midY = (fromY + toY) / 2
  return `M ${fromX} ${fromY} L ${fromX} ${midY} L ${toX} ${midY} L ${toX} ${toY}`
}

function applyZoomPan() {
  if (!zoomPanGroup) return
  zoomPanGroup.attr('transform', `translate(${panX.value},${panY.value}) scale(${zoomK.value})`)
}

function onWheel(e: WheelEvent) {
  if (!graphContainer.value) return
  const rect = graphContainer.value.getBoundingClientRect()
  const cx = e.clientX - rect.left
  const cy = e.clientY - rect.top
  const factor = e.deltaY > 0 ? 0.9 : 1.1
  const newK = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomK.value * factor))
  const gx = (cx - panX.value) / zoomK.value
  const gy = (cy - panY.value) / zoomK.value
  panX.value = cx - gx * newK
  panY.value = cy - gy * newK
  zoomK.value = newK
  applyZoomPan()
}

let panStart = { x: 0, y: 0, panX: 0, panY: 0 }

function onCanvasMouseDown(e: MouseEvent) {
  if (!graphContainer.value || (e.target as HTMLElement).closest('.node-g')) return
  panStart = { x: e.clientX, y: e.clientY, panX: panX.value, panY: panY.value }
  window.addEventListener('mousemove', onPanMove)
  window.addEventListener('mouseup', onPanUp)
}

function onPanMove(e: MouseEvent) {
  panX.value = panStart.panX + (e.clientX - panStart.x)
  panY.value = panStart.panY + (e.clientY - panStart.y)
  applyZoomPan()
}

function onPanUp() {
  window.removeEventListener('mousemove', onPanMove)
  window.removeEventListener('mouseup', onPanUp)
}

const NODE_WIDTH = 100
const NODE_HEIGHT = 48
const PAD = 20
const GAP_X = 28
const GAP_Y = 24

const renderGraph = async () => {
  if (!graphContainer.value || learningPath.value.length === 0) return
  const graph = await learningGraph.value
  if (!graph || graph.nodes.length === 0) return

  d3.select(graphContainer.value).selectAll('*').remove()

  containerWidth = graphContainer.value.clientWidth || 400
  containerHeight = graphContainer.value.clientHeight || 320

  // 与底部列表一致：按 learningPath 顺序排布节点，不再使用拓扑序
  const pathOrder = learningPath.value.filter(id => graph.nodes.some((n: any) => n.id === id))
  const order = pathOrder.length > 0 ? pathOrder : graph.nodes.map((n: any) => n.id)
  const n = order.length
  const cols = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(n))))
  const rows = Math.ceil(n / cols)
  graphWidth = PAD * 2 + cols * NODE_WIDTH + (cols - 1) * GAP_X
  graphHeight = PAD * 2 + rows * NODE_HEIGHT + (rows - 1) * GAP_Y

  const nodeById = new Map(graph.nodes.map((n: any) => [n.id, n]))
  nodesWithPos = order.map((id: string, i: number) => {
    const node = nodeById.get(id)
    const col = i % cols
    const row = Math.floor(i / cols)
    return {
      id,
      label: node?.label ?? id,
      x: PAD + col * (NODE_WIDTH + GAP_X),
      y: PAD + row * (NODE_HEIGHT + GAP_Y),
      order: i + 1
    }
  })

  const scaleToFit = Math.min(
    containerWidth / graphWidth,
    containerHeight / graphHeight
  ) * 0.92
  zoomK.value = scaleToFit
  panX.value = (containerWidth - graphWidth * scaleToFit) / 2
  panY.value = (containerHeight - graphHeight * scaleToFit) / 2

  const svg = d3.select(graphContainer.value)
    .append('svg')
    .attr('width', '100%')
    .attr('height', '100%')
    .attr('viewBox', `0 0 ${containerWidth} ${containerHeight}`)

  const defs = svg.append('defs')
  defs.append('marker')
    .attr('id', 'arrowhead')
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 8)
    .attr('refY', 0)
    .attr('markerWidth', 6)
    .attr('markerHeight', 6)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0,-5L10,0L0,5')
    .attr('fill', '#409eff')

  zoomPanGroup = svg.append('g').attr('class', 'zoom-pan-group')
  applyZoomPan()

  const posMap = new Map(nodesWithPos.map(n => [n.id, n]))

  // 边：正交
  const linkData = graph.edges
    .filter((e: any) => e.type === 'prerequisite')
    .map((e: any) => ({
      source: posMap.get(e.source?.id ?? e.source),
      target: posMap.get(e.target?.id ?? e.target)
    }))
    .filter((l: any) => l.source && l.target)

  zoomPanGroup.append('g').attr('class', 'links')
    .selectAll('path')
    .data(linkData)
    .enter()
    .append('path')
    .attr('d', (d: any) => orthogonalPath(
      d.source.x, d.source.y, NODE_WIDTH, NODE_HEIGHT,
      d.target.x, d.target.y, NODE_WIDTH, NODE_HEIGHT
    ))
    .attr('fill', 'none')
    .attr('stroke', '#409eff')
    .attr('stroke-width', 2)
    .attr('stroke-opacity', 0.7)
    .attr('marker-end', 'url(#arrowhead)')

  const nodeG = zoomPanGroup.append('g').attr('class', 'nodes')
    .selectAll('g')
    .data(nodesWithPos)
    .enter()
    .append('g')
    .attr('class', 'node-g')
    .attr('transform', (d: any) => `translate(${d.x},${d.y})`)
    .attr('title', (d: any) => d.label || d.id)
    .style('cursor', 'pointer')
    .on('click', (event: MouseEvent, d: any) => {
      event.stopPropagation()
      const next = selectedNodeId.value === d.id ? null : d.id
      selectedNodeId.value = next
      emit('update:selectedId', next)
      emit('nodeSelected', next)
      updateNodeStyles()
    })
    .on('dblclick', (event: MouseEvent, d: any) => {
      event.stopPropagation()
      event.preventDefault()
      setCurrentArticle(d.id, 'navigation')
    })

  function nodeColor(d: any) {
    const progress = articleProgress.value.get(d.id)
    if (progress?.read) return '#67c23a'
    if (d.id === selectedNodeId.value) return '#e6a23c'
    if (d.id === currentArticleId.value) return '#409eff'
    return '#909399'
  }

  function nodeStroke(d: any) {
    return d.id === selectedNodeId.value ? '#e6a23c' : 'rgba(255,255,255,0.8)'
  }

  function nodeStrokeWidth(d: any) {
    return d.id === selectedNodeId.value ? 3 : 1.5
  }

  nodeG.append('rect')
    .attr('class', 'node-rect')
    .attr('width', NODE_WIDTH)
    .attr('height', NODE_HEIGHT)
    .attr('rx', 8)
    .attr('ry', 8)
    .attr('fill', nodeColor)
    .attr('stroke', nodeStroke)
    .attr('stroke-width', nodeStrokeWidth)

  nodeG.append('text')
    .attr('class', 'node-order')
    .attr('x', NODE_WIDTH / 2)
    .attr('y', 18)
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'middle')
    .attr('font-size', '14px')
    .attr('font-weight', 'bold')
    .attr('fill', '#fff')
    .text((d: any) => String(d.order))

  nodeG.append('text')
    .attr('class', 'node-label')
    .attr('x', NODE_WIDTH / 2)
    .attr('y', NODE_HEIGHT - 10)
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'middle')
    .attr('font-size', '11px')
    .attr('fill', 'rgba(255,255,255,0.95)')
    .text((d: any) => {
      const s = d.label || d.id
      return s.length > 10 ? s.slice(0, 9) + '…' : s
    })

  function updateNodeStyles() {
    nodeG.selectAll('.node-rect')
      .attr('fill', nodeColor)
      .attr('stroke', nodeStroke)
      .attr('stroke-width', nodeStrokeWidth)
  }
}

watch([learningPath, currentArticleId, articleProgress, selectedNodeId], () => {
  if (!(isExpanded.value || props.defaultExpanded) || !graphContainer.value) return
  const g = graphContainer.value.querySelector('.node-g')
  if (g) {
    d3.select(graphContainer.value).selectAll('.node-g').select('.node-rect')
      .attr('fill', function() {
        const d = d3.select(this.parentNode as Element).datum() as any
        if (!d) return '#909399'
        const progress = articleProgress.value.get(d.id)
        if (progress?.read) return '#67c23a'
        if (d.id === selectedNodeId.value) return '#e6a23c'
        if (d.id === currentArticleId.value) return '#409eff'
        return '#909399'
      })
      .attr('stroke', function() {
        const d = d3.select(this.parentNode as Element).datum() as any
        return d?.id === selectedNodeId.value ? '#e6a23c' : 'rgba(255,255,255,0.8)'
      })
      .attr('stroke-width', function() {
        const d = d3.select(this.parentNode as Element).datum() as any
        return d?.id === selectedNodeId.value ? 3 : 1.5
      })
  } else {
    nextTick(() => renderGraph())
  }
})

let resizeObserver: ResizeObserver | null = null
let resizeHandler: (() => void) | null = null

onMounted(() => {
  resizeHandler = () => {
    if (!(isExpanded.value || props.defaultExpanded) || !graphContainer.value) return
    const w = graphContainer.value.clientWidth || 400
    const h = graphContainer.value.clientHeight || 320
    containerWidth = w
    containerHeight = h
    const svgEl = graphContainer.value.querySelector('svg')
    if (svgEl) {
      svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`)
      const scaleToFit = Math.min(w / graphWidth, h / graphHeight) * 0.92
      zoomK.value = scaleToFit
      panX.value = (w - graphWidth * scaleToFit) / 2
      panY.value = (h - graphHeight * scaleToFit) / 2
      applyZoomPan()
    } else {
      renderGraph()
    }
  }
  window.addEventListener('resize', resizeHandler)
  nextTick(() => {
    if (graphContainer.value) {
      resizeObserver = new ResizeObserver(resizeHandler!)
      resizeObserver.observe(graphContainer.value)
    }
  })
  if (props.defaultExpanded && learningPath.value.length > 0) {
    nextTick(() => setTimeout(() => renderGraph(), 200))
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onPanMove)
  window.removeEventListener('mouseup', onPanUp)
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler)
    resizeHandler = null
  }
  resizeObserver?.disconnect()
  resizeObserver = null
  if (graphContainer.value) {
    d3.select(graphContainer.value).selectAll('*').remove()
  }
})
</script>

<style scoped>
.learning-graph {
  margin-bottom: 24px;
  border: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0,0,0,0.1)"');
  border-radius: 8px;
  background-color: v-bind('themeState.currentTheme.background2nd');
}

.graph-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0,0,0,0.1)"');
}

.graph-header-simple {
  padding: 0 0 12px 0;
  margin-bottom: 16px;
  border-bottom: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0,0,0,0.1)"');
}

.graph-header-simple h3,
.graph-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: v-bind('themeState.currentTheme.textColor');
}

.graph-content {
  padding: 16px;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.graph-canvas {
  width: 100%;
  flex: 1;
  min-height: 200px;
  border: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0,0,0,0.1)"');
  border-radius: 6px;
  background-color: v-bind('themeState.currentTheme.background');
  overflow: hidden;
  cursor: grab;
}

.graph-canvas:active {
  cursor: grabbing;
}

.graph-canvas :deep(.node-g) {
  cursor: pointer;
}

.graph-canvas :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}

.graph-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0,0,0,0.1)"');
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: v-bind('themeState.currentTheme.textColor');
}

.legend-node {
  width: 14px;
  height: 14px;
  border-radius: 4px;
  border: 1.5px solid rgba(255,255,255,0.8);
}

.legend-node.completed { background-color: #67c23a; }
.legend-node.current { background-color: #409eff; }
.legend-node.pending { background-color: #909399; }
.legend-node.selected { background-color: #e6a23c; }
</style>

<script lang="ts">
import { themeState } from '../../utils/themes'
export { themeState }
</script>
