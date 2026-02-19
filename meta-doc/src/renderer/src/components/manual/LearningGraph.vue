<template>
  <div class="learning-graph">
    <div v-if="!defaultExpanded" class="graph-header">
      <h3>{{ $t('userManual.graph.title') || '学习路径图' }}</h3>
      <el-button
        text
        :icon="isExpanded ? ArrowUp : ArrowDown"
        @click="toggleExpanded"
      >
        {{ isExpanded ? ($t('userManual.graph.collapse') || '收起') : ($t('userManual.graph.expand') || '展开') }}
      </el-button>
    </div>
    
    <div v-if="isExpanded || defaultExpanded" class="graph-content">
      <div ref="graphContainer" class="graph-canvas"></div>
      
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
      </div>
    </div>
    
    <div v-if="defaultExpanded" class="graph-header-simple">
      <h3>{{ $t('userManual.graph.title') || '学习路径图' }}</h3>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox } from 'element-plus'
import { useUserManual } from '../../stores/userManual'
import { ArrowUp, ArrowDown } from '@element-plus/icons-vue'
import * as d3 from 'd3'

const props = withDefaults(defineProps<{
  defaultExpanded?: boolean
}>(), {
  defaultExpanded: false
})

const emit = defineEmits<{
  nodeSelected: [articleId: string | null]
}>()

const { learningPath, articleProgress, currentArticleId, setCurrentArticle, learningGraph, manualIndex } = useUserManual()
const { t } = useI18n()

const isExpanded = ref(props.defaultExpanded)
const graphContainer = ref<HTMLElement | null>(null)
const selectedNodeId = ref<string | null>(null)
let svg: d3.Selection<SVGSVGElement, unknown, null, undefined> | null = null
let simulation: d3.Simulation<any, any> | null = null

const toggleExpanded = () => {
  isExpanded.value = !isExpanded.value
  if (isExpanded.value || props.defaultExpanded) {
    nextTick(() => {
      renderGraph()
    })
  }
}


const renderGraph = async () => {
  if (!graphContainer.value) {
    console.warn('LearningGraph: graphContainer未找到')
    return
  }

  if (learningPath.value.length === 0) {
    console.warn('LearningGraph: 学习路径为空')
    return
  }

  // 清除旧内容
  d3.select(graphContainer.value).selectAll('*').remove()

  const graph = await learningGraph.value
  if (!graph || graph.nodes.length === 0) {
    console.warn('LearningGraph: 图数据为空')
    return
  }

  const width = graphContainer.value.clientWidth || 800
  const height = Math.max(600, graph.nodes.length * 120)

  svg = d3.select(graphContainer.value)
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')

  // 拓扑排序计算节点顺序
  const topologicalOrder = computeTopologicalOrder(graph.nodes, graph.edges)
  
  // 为节点添加顺序信息
  graph.nodes.forEach((node: any, index: number) => {
    node.order = topologicalOrder.indexOf(node.id)
  })

  // 创建力导向图，增加节点间距
  simulation = d3.forceSimulation(graph.nodes as any)
    .force('link', d3.forceLink(graph.edges).id((d: any) => d.id).distance(200))
    .force('charge', d3.forceManyBody().strength(-800))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(50))

  // 绘制边
  const link = svg.append('g')
    .selectAll('line')
    .data(graph.edges)
    .enter()
    .append('line')
    .attr('stroke', (d: any) => d.type === 'prerequisite' ? '#409eff' : '#909399')
    .attr('stroke-width', 2)
    .attr('stroke-opacity', 0.6)
    .attr('marker-end', 'url(#arrowhead)')

  // 绘制箭头
  svg.append('defs').append('marker')
    .attr('id', 'arrowhead')
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 25)
    .attr('refY', 0)
    .attr('markerWidth', 6)
    .attr('markerHeight', 6)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0,-5L10,0L0,5')
    .attr('fill', '#409eff')

  // 绘制节点
  const node = svg.append('g')
    .selectAll('g')
    .data(graph.nodes)
    .enter()
    .append('g')
    .attr('class', 'node')
    .call(d3.drag<SVGGElement, any>()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended))

  // 节点圆圈
  const circles = node.append('circle')
    .attr('r', 30)
    .attr('fill', (d: any) => {
      const progress = articleProgress.value.get(d.id)
      if (progress?.read) return '#67c23a' // 已完成 - 绿色
      if (d.id === selectedNodeId.value) return '#e6a23c' // 选中 - 橙色
      if (d.id === currentArticleId.value) return '#409eff' // 当前 - 蓝色
      return '#909399' // 待学习 - 灰色
    })
    .attr('stroke', (d: any) => {
      if (d.id === selectedNodeId.value) return '#e6a23c'
      return '#fff'
    })
    .attr('stroke-width', (d: any) => {
      if (d.id === selectedNodeId.value) return 4
      return 2
    })
    .style('cursor', 'pointer')
    .on('click', async (event: MouseEvent, d: any) => {
      event.stopPropagation()
      // 如果点击的是已选中的节点，取消选择
      if (selectedNodeId.value === d.id) {
        selectedNodeId.value = null
        emit('nodeSelected', null)
        updateNodeStyles()
        return
      }
      
      // 显示确认对话框
      try {
        await ElMessageBox.confirm(
          t('userManual.graph.confirmStart', { title: d.label }) || `是否开始学习"${d.label}"？`,
          t('userManual.graph.confirmTitle') || '确认学习',
          {
            confirmButtonText: t('userManual.graph.confirm') || '开始学习',
            cancelButtonText: t('userManual.graph.cancel') || '取消',
            type: 'info'
          }
        )
        selectedNodeId.value = d.id
        emit('nodeSelected', d.id)
        updateNodeStyles()
      } catch {
        // 用户取消
      }
    })

  // 节点顺序标签（拓扑排序序号）
  node.append('text')
    .text((d: any) => {
      const order = topologicalOrder.indexOf(d.id)
      return order >= 0 ? (order + 1).toString() : ''
    })
    .attr('dy', 0)
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'middle')
    .attr('font-size', '14px')
    .attr('font-weight', 'bold')
    .attr('fill', '#fff')
    .style('pointer-events', 'none')

  // 节点标题标签
  node.append('text')
    .text((d: any) => d.label)
    .attr('dy', 45)
    .attr('text-anchor', 'middle')
    .attr('font-size', '13px')
    .attr('fill', '#333')
    .style('pointer-events', 'none')

  // 更新节点样式的函数
  function updateNodeStyles() {
    circles
      .attr('fill', (d: any) => {
        const progress = articleProgress.value.get(d.id)
        if (progress?.read) return '#67c23a'
        if (d.id === selectedNodeId.value) return '#e6a23c'
        if (d.id === currentArticleId.value) return '#409eff'
        return '#909399'
      })
      .attr('stroke', (d: any) => {
        if (d.id === selectedNodeId.value) return '#e6a23c'
        return '#fff'
      })
      .attr('stroke-width', (d: any) => {
        if (d.id === selectedNodeId.value) return 4
        return 2
      })
  }

  // 更新位置
  simulation.on('tick', () => {
    link
      .attr('x1', (d: any) => d.source.x)
      .attr('y1', (d: any) => d.source.y)
      .attr('x2', (d: any) => d.target.x)
      .attr('y2', (d: any) => d.target.y)

    node.attr('transform', (d: any) => `translate(${d.x},${d.y})`)
  })

  function dragstarted(event: any, d: any) {
    if (!event.active) simulation.alphaTarget(0.3).restart()
    d.fx = d.x
    d.fy = d.y
  }

  function dragged(event: any, d: any) {
    d.fx = event.x
    d.fy = event.y
  }

  function dragended(event: any, d: any) {
    if (!event.active) simulation.alphaTarget(0)
    d.fx = null
    d.fy = null
  }
}

// 拓扑排序函数
function computeTopologicalOrder(nodes: any[], edges: any[]): string[] {
  const nodeIds = nodes.map(n => n.id)
  const inDegree = new Map<string, number>()
  const adjList = new Map<string, string[]>()
  
  // 初始化
  nodeIds.forEach(id => {
    inDegree.set(id, 0)
    adjList.set(id, [])
  })
  
  // 构建邻接表和入度
  edges.forEach(edge => {
    if (edge.type === 'prerequisite') {
      const target = edge.target.id || edge.target
      const source = edge.source.id || edge.source
      adjList.get(source)?.push(target)
      inDegree.set(target, (inDegree.get(target) || 0) + 1)
    }
  })
  
  // Kahn算法
  const queue: string[] = []
  const result: string[] = []
  
  // 找到所有入度为0的节点
  inDegree.forEach((degree, id) => {
    if (degree === 0) {
      queue.push(id)
    }
  })
  
  while (queue.length > 0) {
    const current = queue.shift()!
    result.push(current)
    
    const neighbors = adjList.get(current) || []
    neighbors.forEach(neighbor => {
      const degree = inDegree.get(neighbor) || 0
      inDegree.set(neighbor, degree - 1)
      if (inDegree.get(neighbor) === 0) {
        queue.push(neighbor)
      }
    })
  }
  
  // 如果还有节点未处理，按原始顺序添加
  nodeIds.forEach(id => {
    if (!result.includes(id)) {
      result.push(id)
    }
  })
  
  return result
}

watch([learningPath, currentArticleId, articleProgress, selectedNodeId], () => {
  if ((isExpanded.value || props.defaultExpanded) && graphContainer.value && svg) {
    // 只更新样式，不重新渲染整个图
    const circles = svg.selectAll('circle')
    circles
      .attr('fill', (d: any) => {
        const progress = articleProgress.value.get(d.id)
        if (progress?.read) return '#67c23a'
        if (d.id === selectedNodeId.value) return '#e6a23c'
        if (d.id === currentArticleId.value) return '#409eff'
        return '#909399'
      })
      .attr('stroke', (d: any) => {
        if (d.id === selectedNodeId.value) return '#e6a23c'
        return '#fff'
      })
      .attr('stroke-width', (d: any) => {
        if (d.id === selectedNodeId.value) return 4
        return 2
      })
  } else if ((isExpanded.value || props.defaultExpanded) && graphContainer.value) {
    nextTick(() => {
      renderGraph()
    })
  }
})

// 监听窗口大小变化
onMounted(() => {
  window.addEventListener('resize', () => {
    if ((isExpanded.value || props.defaultExpanded) && graphContainer.value) {
      renderGraph()
    }
  })
  
  // 如果默认展开，在挂载时渲染
  if (props.defaultExpanded && learningPath.value.length > 0) {
    nextTick(() => {
      setTimeout(() => {
        renderGraph()
      }, 200)
    })
  }
})

onBeforeUnmount(() => {
  if (svg) {
    svg.remove()
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

.graph-header-simple h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: v-bind('themeState.currentTheme.textColor');
}

.graph-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: v-bind('themeState.currentTheme.textColor');
}

.graph-content {
  padding: 24px;
}

.graph-canvas {
  width: 100%;
  min-height: 600px;
  height: 100%;
  border: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0,0,0,0.1)"');
  border-radius: 4px;
  background-color: v-bind('themeState.currentTheme.background');
  overflow: visible;
}

.graph-canvas svg {
  width: 100%;
  height: 100%;
}

.graph-legend {
  display: flex;
  gap: 24px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0,0,0,0.1)"');
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: v-bind('themeState.currentTheme.textColor');
}

.legend-node {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid #fff;
}

.legend-node.completed {
  background-color: #67c23a;
}

.legend-node.current {
  background-color: #409eff;
}

.legend-node.pending {
  background-color: #909399;
}
</style>

<script lang="ts">
import { themeState } from '../../utils/themes'
export { themeState }
</script>
