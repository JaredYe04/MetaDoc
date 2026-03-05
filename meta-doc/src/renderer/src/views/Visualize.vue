<template>
  <div class="visualize-page">
    <WordCloudDetail
      v-if="showTitleMenu"
      :word="current_word"
      :frequency="current_frequency"
      :position="menuPosition"
      :document-content="rawDocumentContent"
      :adapter="currentAdapter || undefined"
      @close="handleTitleMenuClose"
      style="max-width: 300px"
    />
    <div class="main-panel" :style="mainPanelStyle">
      <div class="visualize-container">
        <!-- 左侧：文章大纲和字数统计 -->
        <div class="left-section">
          <div class="outline-section panel-item">
            <h3>{{ $t('visualize.articleOutline') }}</h3>
            <ScrollArea class="outline-scrollbar">
              <div
                id="outline-graph"
                :style="{
                  color: themeState.currentTheme.textColor
                }"
              ></div>
              <ScrollBar />
            </ScrollArea>
          </div>

          <div class="word-count-section panel-item">
            <h3>{{ $t('visualize.wordCount') }}</h3>
            <div class="word-count-chart-container">
              <div
                id="word-count-diagram"
                class="chart-container"
                :style="{
                  color: themeState.currentTheme.textColor
                }"
              ></div>
            </div>
          </div>
        </div>

        <!-- 中间：词云图 -->
        <div class="wordcloud-section panel-item">
          <h1
            class="big-title interactive-text"
            @click="generateWordCloud"
            :style="{
              color: themeState.currentTheme.textColor
            }"
          >
            {{ $t('visualize.wordCloud') }}
          </h1>
          <div id="wordcloud-3d" class="wordcloud-canvas"></div>
        </div>

        <!-- 右侧：段落分布和词频统计 -->
        <div class="right-section">
          <div class="pie-analysis panel-item">
            <h3>{{ $t('visualize.paragraphDistribution') }}</h3>
            <div class="pie-chart-container">
              <div id="pie" class="chart-container"></div>
            </div>
          </div>

          <div class="word-frequency-section panel-item">
            <h3>{{ $t('visualize.wordFrequency') }}</h3>
            <div class="word-frequency-chart-container">
              <div id="word-frequency-diagram" class="chart-container"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, nextTick } from 'vue'

// @ts-ignore - d3-cloud没有类型定义
import cloud from 'd3-cloud'
// @ts-ignore - d3类型定义可能不完整
import * as d3 from 'd3'
import {
  generatePieFromData,
  generateWordCountBarChart,
  generateWordFrequencyTrendChart,
  ConvertMarkdownToHtmlVditor,
  outlineToMindMap
} from '../utils/md-utils'
import { createVisualizeAdapter, type VisualizeAdapter } from '../utils/visualize-adapters'
// @ts-ignore - lodash.debounce没有类型定义
import debounce from 'lodash.debounce'
import type { DocumentOutlineNode } from '../../../types'

import * as echarts from 'echarts'
import eventBus from '../utils/event-bus'
import { themeState } from '../utils/themes'
import { ScrollArea, ScrollBar } from '@renderer/components/ui/scroll-area'
import WordCloudDetail from '../components/WordCloudDetail.vue'
import { getSetting } from '../utils/settings'
import messageBridge from '../bridge/message-bridge'
import { webMainCalls } from '../utils/web-adapter/web-main-calls'
import { useWorkspace } from '../stores/workspace'
import { ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'

if (typeof window !== 'undefined' && !(window as any).electron?.ipcRenderer) {
  webMainCalls()
}

interface WordCountItem {
  text: string
  size: number
}

const words = ref<string[]>([])
const wordCount = ref<WordCountItem[]>([])
const showTitleMenu = ref(false)

// 保存图表实例引用
const pieChart = ref<echarts.ECharts | null>(null)
const wordCountChart = ref<echarts.ECharts | null>(null)
const wordFrequencyChart = ref<echarts.ECharts | null>(null)

// ResizeObserver 实例
let resizeObserver: ResizeObserver | null = null
// 关闭标题菜单
const handleTitleMenuClose = () => {
  showTitleMenu.value = false
}
const menuPosition = ref({ top: 0, left: 0 })
const current_word = ref('')
const current_frequency = ref(0)
const { t } = useI18n()
const workspace = useWorkspace()
const { tabs, activeTabId, activeDocument, activateTab, removeTab } = workspace

// 主 Panel 样式
const mainPanelStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd,
  borderColor:
    themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.12)'
}))

// 获取当前文档的适配器
const currentAdapter = computed<VisualizeAdapter | null>(() => {
  const doc = activeDocument.value
  if (!doc) return null
  const format = doc.format === 'tex' ? 'latex' : 'markdown'
  return createVisualizeAdapter(format)
})

// 获取原始文档内容
const rawDocumentContent = computed(() => {
  const doc = activeDocument.value
  if (!doc) return ''
  if (doc.format === 'tex') {
    return doc.tex ?? ''
  }
  return doc.markdown ?? ''
})

const documentTitle = computed(() => {
  const doc = activeDocument.value
  if (!doc) return '未命名文档'
  const metaTitle = doc.meta?.title?.trim()
  if (metaTitle) return metaTitle
  const segments = (doc.path || '').split(/[/\\]+/).filter(Boolean)
  return segments[segments.length - 1] || '未命名文档'
})

// const initVditor = async () => {
//     Vditor = await ipcRenderer.invoke('get-vditor');
// };
const refreshAll = async () => {
  if (!activeDocument.value) {
    article_text.value = ''
    wordCount.value = []
    words.value = []
    return
  }
  await processWords()
  await generateWordCloud()
  await generateOutlineGraph()
  await generateWordFrequencyDiagram()
  await generateWordCountDiagram()
  await generatePie()
}

eventBus.on('refresh', refreshAll)

const scheduleRefresh = debounce(() => {
  refreshAll()
}, 300)

watch(
  () => activeTabId.value,
  () => {
    scheduleRefresh()
  }
)

watch(
  activeDocument,
  (doc) => {
    if (!doc) {
      article_text.value = ''
      wordCount.value = []
      words.value = []
      scheduleRefresh.cancel()
      return
    }
    scheduleRefresh()
  },
  { deep: true }
)

// 处理窗口大小变化（使用 debounce 避免频繁调用）
const handleResize = debounce(() => {
  // 调整所有 ECharts 图表大小
  if (pieChart.value) {
    pieChart.value.resize()
  }
  if (wordCountChart.value) {
    wordCountChart.value.resize()
  }
  if (wordFrequencyChart.value) {
    wordFrequencyChart.value.resize()
  }
  // 重新生成词云图以适应新大小
  if (wordCount.value.length > 0) {
    generateWordCloud()
  }
}, 300)

onMounted(async () => {
  // 初始化所有图表
  await refreshAll()

  // 使用 ResizeObserver 监听容器大小变化
  await nextTick()
  const mainPanel = document.querySelector('.main-panel')
  if (mainPanel) {
    resizeObserver = new ResizeObserver(() => {
      handleResize()
    })
    resizeObserver.observe(mainPanel)
  }

  // 也监听窗口大小变化（作为备用）
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  scheduleRefresh.cancel()
  eventBus.off('refresh', refreshAll)

  // 取消 resize debounce
  handleResize.cancel()

  // 清理 resize 监听器
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  window.removeEventListener('resize', handleResize)

  // 销毁所有图表实例
  if (pieChart.value) {
    pieChart.value.dispose()
    pieChart.value = null
  }
  if (wordCountChart.value) {
    wordCountChart.value.dispose()
    wordCountChart.value = null
  }
  if (wordFrequencyChart.value) {
    wordFrequencyChart.value.dispose()
    wordFrequencyChart.value = null
  }
})
const generatePie = async () => {
  const node = document.getElementById('pie')
  if (!node) return

  const adapter = currentAdapter.value
  if (!adapter || !rawDocumentContent.value?.trim()) {
    return
  }

  let outline = adapter.extractOutline(rawDocumentContent.value)
  if (!outline || !outline.children?.length) {
    return
  }

  if (outline.children.length === 1) {
    outline = outline.children[0]
  }

  interface PieDataItem {
    value: number
    label: string
  }

  const data: PieDataItem[] = []

  const dfs = (treeNode: DocumentOutlineNode): number => {
    let cnt = (treeNode.title?.length ?? 0) + (treeNode.text?.length ?? 0)
    for (let i = 0; i < (treeNode.children?.length ?? 0); i++) {
      cnt += dfs(treeNode.children[i])
    }
    return cnt
  }

  const collect = (treeNode: DocumentOutlineNode) => {
    const label = treeNode.title || '段落'
    const baseValue = (treeNode.text?.length ?? 0) + (treeNode.title?.length ?? 0)
    data.push({ value: baseValue + dfs(treeNode), label })
  }

  for (let i = 0; i < (outline.children?.length ?? 0); i++) {
    collect(outline.children[i])
  }

  if (!data.length) return

  const config = generatePieFromData(data, documentTitle.value)
  const existingChart = echarts.getInstanceByDom(node)
  if (existingChart) existingChart.dispose()
  // 仅在容器已有尺寸时初始化，避免 ECharts 报 "Can't get DOM width or height"
  const tryInit = (retries = 0) => {
    if (node.clientWidth && node.clientHeight) {
      const chart = echarts.init(node)
      chart.setOption(config)
      pieChart.value = chart
      return
    }
    if (retries < 20) requestAnimationFrame(() => tryInit(retries + 1))
  }
  tryInit()
}

const generateWordCountDiagram = async () => {
  const node = document.getElementById('word-count-diagram')
  if (!node) return
  if (!article_text.value?.trim()) {
    return
  }
  const existingChart = echarts.getInstanceByDom(node)
  if (existingChart) existingChart.dispose()
  const config = generateWordCountBarChart(article_text.value)
  const tryInit = (retries = 0) => {
    if (node.clientWidth && node.clientHeight) {
      const chart = echarts.init(node)
      chart.setOption(config)
      wordCountChart.value = chart
      return
    }
    if (retries < 20) requestAnimationFrame(() => tryInit(retries + 1))
  }
  tryInit()
}

const generateWordFrequencyDiagram = async () => {
  const node = document.getElementById('word-frequency-diagram')
  if (!node) return
  if (!wordCount.value.length || !article_text.value?.trim()) {
    return
  }
  const existingChart = echarts.getInstanceByDom(node)
  if (existingChart) existingChart.dispose()
  const top5words = wordCount.value.slice(0, 5).map((item) => item.text)
  if (!top5words.length) return
  const config = generateWordFrequencyTrendChart(article_text.value, top5words)
  const tryInit = (retries = 0) => {
    if (node.clientWidth && node.clientHeight) {
      const chart = echarts.init(node)
      chart.setOption(config)
      wordFrequencyChart.value = chart
      return
    }
    if (retries < 20) requestAnimationFrame(() => tryInit(retries + 1))
  }
  tryInit()
}

const generateOutlineGraph = async () => {
  const node = document.getElementById('outline-graph')
  if (!node) return

  const doc = activeDocument.value
  const adapter = currentAdapter.value
  if (!doc || !adapter) {
    return
  }

  let tree: DocumentOutlineNode | null = doc.outline || null
  if (!tree || !tree.children?.length) {
    tree = adapter.extractOutline(rawDocumentContent.value)
  }
  if (!tree) {
    return
  }

  const md = outlineToMindMap(tree)
  const html = await ConvertMarkdownToHtmlVditor(md)
  node.innerHTML = html
  const lis = node.getElementsByTagName('li')
  for (let i = 0; i < lis.length; i++) {
    if (lis[i].getElementsByTagName('ul').length > 0) continue
    lis[i].style.cursor = 'pointer'
    lis[i].addEventListener('mouseover', () => {
      ;(lis[i].style as any).scale = '1.05'
    })
    lis[i].addEventListener('mouseout', () => {
      ;(lis[i].style as any).scale = '1'
    })
  }
}
const article_text = ref('')
const processWords = async () => {
  const doc = activeDocument.value
  const adapter = currentAdapter.value
  if (!doc || !adapter) {
    article_text.value = ''
    wordCount.value = []
    words.value = []
    return
  }

  const bypassCodeBlock = await getSetting('bypassCodeBlock')
  // 使用适配器提取纯文本
  const text = adapter.extractPlainText(rawDocumentContent.value, bypassCodeBlock)
  article_text.value = text

  if (!text.trim()) {
    wordCount.value = []
    words.value = []
    return
  }

  try {
    const rawWords: string[] = (await messageBridge.invoke('cut-words', { text })) || []
    words.value = rawWords

    const counts: Record<string, number> = Object.create(null)
    rawWords.forEach((word: string) => {
      if (!word) return
      counts[word] = (counts[word] || 0) + 1
    })

    const symbols =
      '~!@#$%^&*()_+`-={}|[]\\:";\'<>?,./。、，；：\'\'""【】《》？！￥…（）—0123456789'
    const entries = Object.entries(counts).filter(([key, value]: [string, number]) => {
      if (symbols.includes(key)) return false
      if (value < 2) return false
      if (key.length < 2 || key.length > 10) return false
      return true
    })

    const sorted: WordCountItem[] = entries
      .map(([key, size]: [string, number]) => ({ text: key, size }))
      .sort((a: WordCountItem, b: WordCountItem) => b.size - a.size)

    wordCount.value = sorted.slice(0, Math.min(30, sorted.length))
  } catch (error) {
    console.error('[Visualize] cut-words failed:', error)
    wordCount.value = []
    words.value = []
  }
}
const generateWordCloud = async () => {
  const container = d3.select('#wordcloud-3d')
  container.selectAll('svg').remove()

  if (!wordCount.value.length) {
    return
  }

  const maxFreq = wordCount.value.reduce(
    (max: number, cur: WordCountItem) => Math.max(max, cur.size),
    0
  )
  if (maxFreq <= 0) {
    return
  }

  // 获取容器实际大小
  const containerNode = document.getElementById('wordcloud-3d')
  if (!containerNode) return
  const containerWidth = containerNode.clientWidth || 600
  const containerHeight = containerNode.clientHeight || 600
  const size = Math.min(containerWidth, containerHeight, 600)

  const layout = cloud()
    .size([size, size])
    .words(
      wordCount.value.map((d) => ({
        text: d.text,
        size: d.size
      }))
    )
    .font('Impact')
    .fontSize((d: any) => Math.min((d.size * 120) / maxFreq + 10, 100))
    .rotate((d: any) =>
      Math.random() > 0.5 || d.text === wordCount.value[0]?.text
        ? 0
        : 90 * (Math.random() > 0.5 ? 1 : -1)
    )
    .on('end', draw)

  layout.start()

  function draw(data: any[]) {
    const svg = container
      .append('svg')
      .attr('width', layout.size()[0])
      .attr('height', layout.size()[1])
      .append('g')
      .attr('transform', `translate(${layout.size()[0] / 2}, ${layout.size()[1] / 2})`)

    svg
      .selectAll('text')
      .data(data)
      .enter()
      .append('text')
      .style('font-family', 'Impact')
      .style('font-size', (d: any) => `${d.size}px`)
      .style('fill', () => d3.schemeCategory10[Math.floor(Math.random() * 10)] as string)
      .attr('class', 'wordcloud-text')
      .attr('text-anchor', 'middle')
      .style('padding', '10px')
      .attr('transform', (d: any) => `translate(${d.x}, ${d.y}) rotate(${d.rotate})`)
      .style('opacity', 0)
      .transition()
      .duration(1000)
      .style('opacity', 1)
      .text((d: any) => d.text)

    d3.selectAll('.wordcloud-text').on('click', (event: MouseEvent, d: any) => {
      current_word.value = d.text
      current_frequency.value = d.size
      showTitleMenu.value = false
      menuPosition.value = {
        top: event.clientY,
        left: event.clientX
      }
      showTitleMenu.value = true
    })
  }
}
</script>

<style scoped>
.visualize-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  /* 设置主题背景色 */
  background-color: v-bind('themeState.currentTheme.background');
}

/* 主 Panel：包裹所有子 panel 的圆角矩形容器 */
.main-panel {
  flex: 1;
  min-height: 0;
  min-width: 0;
  margin: 16px;
  padding: 16px;
  border-radius: 16px;
  border: 1px solid;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease;
}

.visualize-container {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.33fr) minmax(0, 1fr);
  /* 左中右三列，比例约为 30% : 40% : 30%，使用 fr 单位确保自适应 */
  gap: 16px;
  flex: 1;
  min-height: 0;
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
  overflow: hidden;
}

/* 左侧区域：文章大纲和字数统计 */
.left-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

/* 子 Panel 通用样式 */
.panel-item {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 16px;
  box-sizing: border-box;
  background-color: v-bind('themeState.currentTheme.background');
  border-radius: 12px;
  transition: background-color 0.2s ease;
  overflow: hidden;
}

.panel-item h3 {
  flex-shrink: 0;
  margin: 0 0 12px 0;
  font-size: 18px;
  font-weight: bold;
}

.outline-section,
.word-count-section {
  flex: 1;
  min-height: 0;
}

.outline-scrollbar {
  flex: 1;
  min-height: 0;
}

.outline-section :deep([data-radix-scroll-area-viewport]) {
  flex: 1;
  min-height: 0;
}

.word-count-chart-container {
  flex: 1;
  min-height: 0;
  min-width: 0;
  width: 100%;
  max-width: 100%;
  overflow: hidden;
}

/* 中间区域：词云图 */
.wordcloud-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 0;
}

.wordcloud-section .big-title {
  flex-shrink: 0;
  margin-bottom: 16px;
}

.wordcloud-canvas {
  flex: 1;
  width: 100%;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 右侧区域：段落分布和词频统计 */
.right-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

/* 段落分布部分 */
.pie-analysis,
.word-frequency-section {
  flex: 1;
  min-height: 0;
  /* 让两部分平分右侧区域的高度 */
}

.pie-chart-container,
.word-frequency-chart-container {
  flex: 1;
  min-height: 0;
  min-width: 0;
  width: 100%;
  max-width: 100%;
  overflow: hidden;
}

/* 图表容器：宽度和高度自动填充父容器 */
.chart-container {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.big-title {
  font-size: 36px;
  cursor: pointer;
  margin: 0;
  padding: 0;
}
</style>
