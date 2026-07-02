<template>
  <div ref="rootRef" class="visualize-page">
    <WordCloudDetail
      v-if="showTitleMenu && isAiEnabled"
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
        <!-- 左侧：章节体量旭日图、高频词主题河流（class 供本实例 query，避免多 tab 重复 id） -->
        <div class="left-section">
          <div class="structure-section panel-item">
            <h3>{{ $t('visualize.structureSunburstTitle') }}</h3>
            <div class="structure-chart-container">
              <div class="js-structure-sunburst chart-container"></div>
            </div>
          </div>

          <div class="theme-river-section panel-item">
            <h3>{{ $t('visualize.wordFlowAlongDocTitle') }}</h3>
            <div class="theme-river-chart-container">
              <div class="js-theme-river chart-container"></div>
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
          <div class="js-wordcloud-3d wordcloud-canvas"></div>
        </div>

        <!-- 右侧：段落分布和词频统计 -->
        <div class="right-section">
          <div class="pie-analysis panel-item">
            <h3>{{ $t('visualize.paragraphDistribution') }}</h3>
            <div class="pie-chart-container">
              <div class="js-pie chart-container"></div>
            </div>
          </div>

          <div class="word-frequency-section panel-item">
            <h3>{{ $t('visualize.wordFrequency') }}</h3>
            <div class="word-frequency-chart-container">
              <div class="js-word-frequency-diagram chart-container"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, nextTick } from 'vue'

const props = withDefaults(
  defineProps<{
    /** 当前实例对应的 tab id，用于多 tab 时只刷新当前激活 tab 的可视化，避免操作错 DOM */
    tabId?: string
  }>(),
  { tabId: undefined }
)

// 根元素 ref，所有 DOM 查询限定在本实例内，避免多 tab 下 getElementById 总是拿到第一个
const rootRef = ref<HTMLElement | null>(null)
function getRoot(): HTMLElement | null {
  return rootRef.value
}

// @ts-ignore - d3-cloud没有类型定义
import cloud from 'd3-cloud'
// @ts-ignore - d3类型定义可能不完整
import * as d3 from 'd3'
import { generatePieFromData, generateWordFrequencyTrendChart } from '../utils/md-utils'
import {
  buildOutlineSunburstOption,
  buildTopWordsThemeRiverOption,
  patchTooltipUnclip,
  type VisualizeChartThemeSlice
} from '../utils/visualize-document-stats'
import { colorForWord } from '../utils/wordcloud-shape-presets'
import type { EChartsOption } from 'echarts'
import { createVisualizeAdapter, type VisualizeAdapter } from '../utils/visualize-adapters'
// @ts-ignore - lodash.debounce没有类型定义
import debounce from 'lodash.debounce'
import type { DocumentOutlineNode } from '../../../types'

import * as echarts from 'echarts'
import eventBus from '../utils/event-bus'
import { themeState } from '../utils/themes'
import WordCloudDetail from '../components/WordCloudDetail.vue'
import { getSetting, settings } from '../utils/settings'
import messageBridge from '../bridge/message-bridge'
import { webMainCalls } from '../utils/web-adapter/web-main-calls'
import { useDocumentViewContext } from '../view-api'
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
const structureSunburstChart = ref<echarts.ECharts | null>(null)
const themeRiverChart = ref<echarts.ECharts | null>(null)
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
const { t, locale } = useI18n()
const isAiEnabled = computed(() => settings.llmEnabled === true)

const visualizeChartTheme = computed<VisualizeChartThemeSlice>(() => ({
  type: themeState.currentTheme.type as VisualizeChartThemeSlice['type'],
  textColor2: themeState.currentTheme.textColor2
}))
const { activeDocument, content: documentContent, effectiveTabId } = useDocumentViewContext(
  () => props.tabId
)

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

// 原始文档正文（通过 View API 上下文）
const rawDocumentContent = documentContent

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
  if (!getRoot()) return
  // 等待 DOM 布局完成后再测量容器尺寸，避免图表 init 时拿到 0 尺寸
  await nextTick()
  try {
    await processWords()
  } catch (e) {
    console.error('[Visualize] processWords failed:', e)
  }
  try {
    await generateWordCloud()
  } catch (e) {
    console.error('[Visualize] generateWordCloud failed:', e)
  }
  try {
    await generateStructureSunburst()
  } catch (e) {
    console.error('[Visualize] generateStructureSunburst failed:', e)
  }
  try {
    await generateWordFrequencyDiagram()
  } catch (e) {
    console.error('[Visualize] generateWordFrequencyDiagram failed:', e)
  }
  try {
    await generateTopWordsThemeRiver()
  } catch (e) {
    console.error('[Visualize] generateTopWordsThemeRiver failed:', e)
  }
  try {
    await generatePie()
  } catch (e) {
    console.error('[Visualize] generatePie failed:', e)
  }
}

eventBus.on('refresh', refreshAll)

const scheduleRefresh = debounce(() => {
  refreshAll()
}, 300)

watch(
  () => effectiveTabId.value,
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

watch(locale, () => {
  scheduleRefresh()
})

watch(
  () => [themeState.currentTheme.type, themeState.currentTheme.textColor2] as const,
  () => {
    scheduleRefresh()
  }
)

// 处理窗口大小变化（使用 debounce 避免频繁调用）
const handleResize = debounce(() => {
  // 调整所有 ECharts 图表大小
  if (pieChart.value) {
    pieChart.value.resize()
  }
  if (structureSunburstChart.value) {
    structureSunburstChart.value.resize()
  }
  if (themeRiverChart.value) {
    themeRiverChart.value.resize()
  }
  if (wordFrequencyChart.value) {
    wordFrequencyChart.value.resize()
  }
  // 重新生成词云图以适应新大小
  if (wordCount.value.length > 0) {
    generateWordCloud()
  }
  // 若之前因容器尺寸为 0 未成功初始化，在获得尺寸后补绘 ECharts（限定本实例根）
  const root = getRoot()
  if (!root) return
  const pieNode = root.querySelector('.js-pie')
  if (article_text.value?.trim() && pieNode && !echarts.getInstanceByDom(pieNode as HTMLElement)) {
    generatePie()
  }
  const sunNode = root.querySelector('.js-structure-sunburst')
  if (rawDocumentContent.value?.trim() && sunNode && !echarts.getInstanceByDom(sunNode as HTMLElement)) {
    generateStructureSunburst()
  }
  const trNode = root.querySelector('.js-theme-river')
  if (trNode && !echarts.getInstanceByDom(trNode as HTMLElement)) {
    generateTopWordsThemeRiver()
  }
  const wfNode = root.querySelector('.js-word-frequency-diagram')
  if (wordCount.value.length > 0 && article_text.value?.trim() && wfNode && !echarts.getInstanceByDom(wfNode as HTMLElement)) {
    generateWordFrequencyDiagram()
  }
}, 300)

onMounted(async () => {
  // 先等一帧确保 v-show 生效且布局完成，再初始化图表（避免容器 clientWidth/clientHeight 为 0）
  await nextTick()
  await new Promise((r) => requestAnimationFrame(r))
  await refreshAll()

  // 使用 ResizeObserver 监听容器大小变化（首次获得尺寸时补绘图表）
  await nextTick()
  const mainPanel = getRoot()?.querySelector('.main-panel')
  if (mainPanel) {
    resizeObserver = new ResizeObserver(() => {
      handleResize()
      if (wordCount.value.length > 0 && !getRoot()?.querySelector('.js-wordcloud-3d svg')) {
        generateWordCloud()
      }
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
  if (structureSunburstChart.value) {
    structureSunburstChart.value.dispose()
    structureSunburstChart.value = null
  }
  if (themeRiverChart.value) {
    themeRiverChart.value.dispose()
    themeRiverChart.value = null
  }
  if (wordFrequencyChart.value) {
    wordFrequencyChart.value.dispose()
    wordFrequencyChart.value = null
  }
})
const generatePie = async () => {
  const node = getRoot()?.querySelector('.js-pie') as HTMLElement | null
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

  const config = patchTooltipUnclip(generatePieFromData(data, documentTitle.value) as EChartsOption)
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

const generateStructureSunburst = async () => {
  const node = getRoot()?.querySelector('.js-structure-sunburst') as HTMLElement | null
  if (!node) return

  const doc = activeDocument.value
  const adapter = currentAdapter.value
  if (!doc || !adapter || !rawDocumentContent.value?.trim()) {
    const existing = echarts.getInstanceByDom(node)
    if (existing) existing.dispose()
    structureSunburstChart.value = null
    return
  }

  let tree: DocumentOutlineNode | null = doc.outline || null
  if (!tree || !tree.children?.length) {
    tree = adapter.extractOutline(rawDocumentContent.value)
  }

  const sunburstLabels = {
    seriesName: t('visualize.structureSunburstSeries'),
    unnamedSection: t('visualize.unnamedSection'),
    emptyOutline: t('visualize.emptyOutline'),
    tooltipChars: t('visualize.tooltipSectionChars')
  }
  const config = buildOutlineSunburstOption(tree, sunburstLabels, visualizeChartTheme.value)

  const existingChart = echarts.getInstanceByDom(node)
  if (existingChart) existingChart.dispose()
  const tryInit = (retries = 0) => {
    if (node.clientWidth && node.clientHeight) {
      const chart = echarts.init(node)
      chart.setOption(config)
      structureSunburstChart.value = chart
      requestAnimationFrame(() => chart.resize())
      return
    }
    if (retries < 20) requestAnimationFrame(() => tryInit(retries + 1))
  }
  tryInit()
}

const generateTopWordsThemeRiver = async () => {
  const node = getRoot()?.querySelector('.js-theme-river') as HTMLElement | null
  if (!node) return

  const riverLabels = {
    emptyPlainText: t('visualize.emptyPlainText'),
    emptyNoWords: t('visualize.themeRiverEmptyWords'),
    themeRiverNoHits: t('visualize.themeRiverNoHits'),
    axisCaption: t('visualize.wordFlowAxisCaption'),
    binTickLabel: (segmentIndex: number) => t('visualize.wordFlowBinTick', { n: segmentIndex + 1 }),
    hitUnit: t('visualize.wordFlowHitUnit')
  }
  const config = buildTopWordsThemeRiverOption(
    article_text.value,
    wordCount.value,
    riverLabels,
    visualizeChartTheme.value
  )

  const existingChart = echarts.getInstanceByDom(node)
  if (existingChart) existingChart.dispose()
  const tryInit = (retries = 0) => {
    if (node.clientWidth && node.clientHeight) {
      const chart = echarts.init(node)
      chart.setOption(config)
      themeRiverChart.value = chart
      requestAnimationFrame(() => chart.resize())
      return
    }
    if (retries < 20) requestAnimationFrame(() => tryInit(retries + 1))
  }
  tryInit()
}

const generateWordFrequencyDiagram = async () => {
  const node = getRoot()?.querySelector('.js-word-frequency-diagram') as HTMLElement | null
  if (!node) return
  if (!wordCount.value.length || !article_text.value?.trim()) {
    return
  }
  const existingChart = echarts.getInstanceByDom(node)
  if (existingChart) existingChart.dispose()
  const top5words = wordCount.value.slice(0, 5).map((item) => item.text)
  if (!top5words.length) return
  const config = patchTooltipUnclip(
    generateWordFrequencyTrendChart(article_text.value, top5words) as EChartsOption
  )
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
  const containerNode = getRoot()?.querySelector('.js-wordcloud-3d') as HTMLElement | null
  if (!containerNode) return
  const container = d3.select(containerNode)
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

  // 获取容器实际大小；避免 flex 未布局完成时为 0 导致词云空白
  const containerWidth = Math.max(120, containerNode.clientWidth || 0)
  const containerHeight = Math.max(120, containerNode.clientHeight || 0)
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
    const w = layout.size()[0]
    const h = layout.size()[1]

    const svg = container.append('svg').attr('width', w).attr('height', h)
    const rootG = svg.append('g').attr('transform', `translate(${w / 2}, ${h / 2})`)

    rootG
      .selectAll('text')
      .data(data)
      .enter()
      .append('text')
      .style('font-family', 'Impact')
      .style('font-size', (d: any) => `${d.size}px`)
      /* 避免继承 body/shadcn 的 color（暗色下近白）被当作 SVG fill/currentColor */
      .attr('fill', (d: any) => colorForWord(d.text))
      .style('fill', (d: any) => colorForWord(d.text), 'important')
      .attr('class', 'wordcloud-text')
      .attr('text-anchor', 'middle')
      .style('padding', '10px')
      .attr('transform', (d: any) => `translate(${d.x}, ${d.y}) rotate(${d.rotate})`)
      .style('opacity', 0)
      .transition()
      .duration(1000)
      .style('opacity', 1)
      .text((d: any) => d.text)

    container.selectAll('.wordcloud-text').on('click', (event: MouseEvent, d: any) => {
      if (!isAiEnabled.value) return
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

/* 左侧区域：章节旭日图与内容密度 */
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

/* 上图略多占垂直空间，保证旭日图有足够边长贴近容器 */
.structure-section {
  flex: 1.35;
  min-height: 0;
}

.theme-river-section {
  flex: 1;
  min-height: 0;
}

.structure-chart-container {
  flex: 1;
  min-height: 220px;
  min-width: 0;
  width: 100%;
  max-width: 100%;
  overflow: hidden;
}

.theme-river-chart-container {
  flex: 1;
  min-height: 240px;
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
