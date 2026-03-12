<template>
  <div class="pdf-panel-root">
    <div
      v-if="isValidPdfUrl"
      class="pdf-toolbar"
      :style="{ backgroundColor: themeState.currentTheme.editorToolbarBackgroundColor }"
    >
      <Tooltip>
        <TooltipTrigger as-child>
          <div
            class="pdf-toolbar-icon"
            :class="{ disabled: currentPdfPage <= 1 }"
            @click="currentPdfPage > 1 && goPrevPage()"
          >
            <ArrowLeft />
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {{ $t('latexEditor.prevPage') }}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger as-child>
          <div
            class="pdf-toolbar-icon"
            :class="{ disabled: currentPdfPage >= totalPdfPages }"
            @click="currentPdfPage < totalPdfPages && goNextPage()"
          >
            <ArrowRight />
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {{ $t('latexEditor.nextPage') }}
        </TooltipContent>
      </Tooltip>
      <span
        class="pdf-toolbar__page"
        :title="`${inputPdfPage} / ${totalPdfPages} ${$t('latexEditor.pages')}`"
      >
        <input
          v-model.number="inputPdfPage"
          type="number"
          :min="1"
          :max="totalPdfPages"
          @change="jumpToPage"
        />
        <span class="pdf-toolbar__page-label"
          >/ {{ totalPdfPages }} {{ $t('latexEditor.pages') }}</span
        >
      </span>
      <Tooltip>
        <TooltipTrigger as-child>
          <div class="pdf-toolbar-icon" @click="pdfZoomIn">
            <ZoomIn />
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {{ $t('latexEditor.toolbar.zoomIn') }}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger as-child>
          <div class="pdf-toolbar-icon" @click="pdfZoomOut">
            <ZoomOut />
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {{ $t('latexEditor.toolbar.zoomOut') }}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger as-child>
          <div class="pdf-toolbar-icon" @click="pdfZoomReset">
            <Refresh />
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {{ $t('latexEditor.toolbar.zoomReset') }}
        </TooltipContent>
      </Tooltip>
      <Divider direction="vertical" />
      <span class="pdf-toolbar__pages-per-row">
        <span class="pdf-toolbar__pages-per-row-label"
          >{{ $t('latexEditor.pagesPerRow') || '每行页数' }}:</span
        >
        <Select v-model="pagesPerRow" @update:model-value="handlePagesPerRowChange">
          <SelectTrigger class="w-[80px] h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="num in 10" :key="num" :value="num">{{ String(num) }}</SelectItem>
          </SelectContent>
        </Select>
      </span>
      <Divider direction="vertical" />
      <Tooltip>
        <TooltipTrigger as-child>
          <div
            class="pdf-toolbar-icon"
            :class="{ active: pdfViewMode === 'pointer' }"
            @click="setPdfViewMode('pointer')"
          >
            <img
              :src="(themeState.currentTheme as any).CursorIcon"
              alt="pointer"
              class="pdf-toolbar-mode-icon"
            />
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {{ $t('latexEditor.toolbar.pointerMode') }}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger as-child>
          <div
            class="pdf-toolbar-icon"
            :class="{ active: pdfViewMode === 'hand' }"
            @click="setPdfViewMode('hand')"
          >
            <img
              :src="(themeState.currentTheme as any).HandIcon"
              alt="hand"
              class="pdf-toolbar-mode-icon"
            />
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {{ $t('latexEditor.toolbar.handMode') }}
        </TooltipContent>
      </Tooltip>
    </div>
    <ScrollArea
      v-if="isValidPdfUrl"
      ref="pdfScrollbarRef"
      class="pdf-preview-container h-full"
      :class="{ 'hand-mode': pdfViewMode === 'hand', 'pointer-mode': pdfViewMode === 'pointer' }"
      :style="{ background: themeState.currentTheme.background }"
    >
      <div
        ref="pdfPagesWrapper"
        class="pdf-pages-wrapper"
        :style="pdfWrapperStyle"
        @mousedown="handleHandModeMouseDown"
        @mousemove="handleHandModeMouseMove"
        @mouseup="handleHandModeMouseUp"
        @mouseleave="handleHandModeMouseUp"
        @wheel="handlePdfWheel"
      >
        <div
          ref="pdfPagesContainer"
          class="pdf-pages-container"
          :style="{
            ...pdfContainerStyle,
            transform: `scale(${zoomScale / PDF_RENDER_SCALE})`,
            transformOrigin: 'top left'
          }"
        >
          <div
            v-for="pageNum in displayPageCount"
            :key="`pdf-page-${pageNum}-${pdfUrl}-${pdfRenderKey}`"
            :ref="(el) => setPageRef(el, pageNum)"
            class="pdf-page-wrapper"
            :data-page-number="pageNum"
          >
            <!-- 唯一流式子元素，用其尺寸撑开 wrapper，使 wrapper 与 page 紧贴 -->
            <div
              class="pdf-page-sizer"
              :style="{ width: placeholderPageWidth + 'px', height: placeholderPageHeight + 'px' }"
              aria-hidden="true"
            />
            <div class="pdf-page-placeholder" aria-hidden="true" />
            <VuePdf
              :key="`vue-pdf-${pageNum}-${pdfUrl}-${pdfRenderKey}`"
              :src="pdfUrl"
              :page="pageNum"
              :scale="PDF_RENDER_SCALE"
              :enable-text-selection="true"
              :enable-annotations="false"
              class="vue-pdf-wrapper"
              @total-pages="handleNumPages"
              @pdf-loaded="pageNum === 1 ? handlePdfLoaded($event) : undefined"
              @error="(err: any) => handlePdfError(err, pageNum)"
            />
          </div>
        </div>
      </div>
    </ScrollArea>
    <div
      v-else
      class="pdf-preview-container pdf-empty"
      :style="{ background: themeState.currentTheme.background }"
    >
      <h3 class="pdf-empty-text">{{ $t('latexEditor.pdfEmpty') }}</h3>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowLeft, ArrowRight, ZoomIn, ZoomOut, Refresh } from '@element-plus/icons-vue'
import { VuePdf, createLoadingTask } from 'vue3-pdfjs'
import { themeState } from '../utils/themes'
import { debounce } from 'lodash'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from '@renderer/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { Divider } from '@renderer/components/ui/separator'

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    pdfUrl: string
    /** 默认每行页数，Home 传 2，LaTeXEditor 不传则 1 */
    defaultPagesPerRow?: number
    mode?: 'normal' | 'demo'
  }>(),
  { defaultPagesPerRow: 1, mode: 'normal' }
)

const PDF_RENDER_SCALE = 2.5
/** A4 在 PDF 坐标系下的默认尺寸 (pt)，用于占位框默认大小，避免未加载时布局抖动 */
const A4_WIDTH_PT = 595.28
const A4_HEIGHT_PT = 841.89
const pdfScrollbarRef = ref<InstanceType<typeof ScrollArea> | null>(null)
const pdfPagesContainer = ref<HTMLElement | null>(null)
const pdfPagesWrapper = ref<HTMLElement | null>(null)
const pageRefs = new Map<number, HTMLElement>()

/** 获取 ScrollArea 的视口元素（reka-ui 与 radix 属性兼容） */
function getScrollViewport(scrollbarEl: HTMLElement | null | undefined): HTMLElement | null {
  if (!scrollbarEl) return null
  return (
    scrollbarEl.querySelector('[data-reka-scroll-area-viewport]') ||
    scrollbarEl.querySelector('[data-radix-scroll-area-viewport]')
  ) as HTMLElement | null
}
const pagesPerRow = ref(props.defaultPagesPerRow)
const pdfViewMode = ref<'pointer' | 'hand'>('pointer')
const zoomScale = ref(1.0)
const currentPdfPage = ref(1)
const totalPdfPages = ref(0)
const inputPdfPage = ref(1)
const pdfRenderKey = ref(0)
/** 单页占位尺寸（与 VuePdf 渲染尺寸一致，用于等大占位避免顺序加载时的细小闪烁） */
const placeholderPageWidth = ref(A4_WIDTH_PT * PDF_RENDER_SCALE)
const placeholderPageHeight = ref(A4_HEIGHT_PT * PDF_RENDER_SCALE)
/** 与 .pdf-pages-container 的 padding、grid gap 一致 */
const CONTAINER_PADDING = 20
const GRID_GAP = 20
/** 由「页数 + 边距」直接算出容器未缩放时的尺寸，避免依赖 DOM 测量（易被拉伸导致空白） */
const baseContainerHeight = computed(() => {
  const n = displayPageCount.value
  const cols = pagesPerRow.value
  const rows = Math.ceil(n / cols)
  if (rows <= 0) return 0
  return (
    CONTAINER_PADDING * 2 +
    rows * placeholderPageHeight.value +
    (rows - 1) * GRID_GAP
  )
})
const baseContainerWidth = computed(() => {
  const n = displayPageCount.value
  const cols = pagesPerRow.value
  if (cols <= 0) return 0
  return (
    CONTAINER_PADDING * 2 +
    cols * placeholderPageWidth.value +
    (cols - 1) * GRID_GAP
  )
})
/** 与 zoomScale 同步计算，避免缩放时先改 scale 再异步改 wrapper 导致闪烁 */
const pdfWrapperHeight = computed(() => {
  if (baseContainerHeight.value <= 0) return 'auto'
  return baseContainerHeight.value * (zoomScale.value / PDF_RENDER_SCALE)
})
const pdfWrapperWidth = computed(() => {
  if (baseContainerWidth.value <= 0) return 'auto'
  return baseContainerWidth.value * (zoomScale.value / PDF_RENDER_SCALE)
})
let isDragging = false
let dragStartX = 0
let dragStartY = 0
let scrollStartX = 0
let scrollStartY = 0
let isAutoUpdatingPage = false

const isValidPdfUrl = computed(() => {
  return !!(
    props.pdfUrl &&
    props.pdfUrl !== '' &&
    props.pdfUrl !== 'file:///' &&
    props.pdfUrl.trim() !== ''
  )
})

// 有有效 URL 时至少渲染 1 页，让 VuePdf 挂载并触发 @total-pages，否则 totalPdfPages 一直为 0 会显示「请先正确编译」
const displayPageCount = computed(() => Math.max(1, totalPdfPages.value))

const pdfContainerStyle = computed(() => ({
  display: 'grid',
  gridTemplateColumns: `repeat(${pagesPerRow.value}, 1fr)`,
  gap: '20px',
  gridAutoRows: 'min-content',
  justifyItems: 'start'
}))

const pdfWrapperStyle = computed(() => ({
  position: 'relative' as const,
  height:
    typeof pdfWrapperHeight.value === 'number'
      ? `${pdfWrapperHeight.value}px`
      : pdfWrapperHeight.value,
  width:
    typeof pdfWrapperWidth.value === 'number'
      ? `${pdfWrapperWidth.value}px`
      : pdfWrapperWidth.value,
  display: 'block'
}))

function calculateOptimalScale(baseScale: number): number {
  const rounded = Math.round(baseScale * 10) / 10
  return Math.max(0.2, Math.min(5, rounded))
}

function setPageRef(el: any, pageNum: number) {
  if (el && el instanceof HTMLElement) {
    pageRefs.set(pageNum, el)
  } else if (el === null) {
    pageRefs.delete(pageNum)
  }
}

function setPdfViewMode(mode: 'pointer' | 'hand') {
  if (props.mode === 'demo') return
  pdfViewMode.value = mode
  nextTick(() => {
    if (pdfPagesWrapper.value) {
      pdfPagesWrapper.value.style.cursor = mode === 'hand' ? 'grab' : 'default'
      pdfPagesWrapper.value.style.userSelect = mode === 'hand' ? 'none' : 'text'
    }
  })
}

function handlePagesPerRowChange() {
  nextTick(updateWrapperSize)
}

function isPdfContainerReady(): boolean {
  if (!isValidPdfUrl.value || !pdfPagesContainer.value) return false
  return pageRefs.get(1) != null
}

function safeUpdateZoomScale(newScale: number) {
  if (!isPdfContainerReady()) return
  zoomScale.value = newScale
}

function pdfZoomIn() {
  if (props.mode === 'demo' || !isPdfContainerReady()) return
  const newScale = Math.min(Math.max(zoomScale.value + 0.1, 0.2), 5)
  safeUpdateZoomScale(calculateOptimalScale(newScale))
}
function pdfZoomOut() {
  if (props.mode === 'demo' || !isPdfContainerReady()) return
  const newScale = Math.min(Math.max(zoomScale.value - 0.1, 0.2), 5)
  safeUpdateZoomScale(calculateOptimalScale(newScale))
}
function pdfZoomReset() {
  if (props.mode === 'demo' || !isPdfContainerReady()) return
  safeUpdateZoomScale(calculateOptimalScale(1.0))
}

function goPrevPage() {
  if (props.mode === 'demo' || currentPdfPage.value <= 1) return
  currentPdfPage.value--
  inputPdfPage.value = currentPdfPage.value
  scrollToPage(currentPdfPage.value)
}
function goNextPage() {
  if (props.mode === 'demo' || currentPdfPage.value >= totalPdfPages.value) return
  currentPdfPage.value++
  inputPdfPage.value = currentPdfPage.value
  scrollToPage(currentPdfPage.value)
}
function jumpToPage() {
  if (props.mode === 'demo') return
  const page = Math.min(Math.max(inputPdfPage.value, 1), totalPdfPages.value)
  currentPdfPage.value = page
  inputPdfPage.value = page
  scrollToPage(page)
}

async function scrollToPage(pageNumber: number) {
  await nextTick()
  const pageElement = pageRefs.get(pageNumber)
  const scrollbar = pdfScrollbarRef.value
  if (!pageElement || !scrollbar) return
  const scrollbarEl = (scrollbar as any).$el as HTMLElement | null
  const scrollbarWrap = getScrollViewport(scrollbarEl)
  if (!scrollbarWrap) return
  const containerRect = scrollbarWrap.getBoundingClientRect()
  const pageRect = pageElement.getBoundingClientRect()
  const pageTopInScrollContent = scrollbarWrap.scrollTop + pageRect.top - containerRect.top
  const viewportHeight = containerRect.height
  const pageHeight = pageRect.height
  const targetScrollTop = pageTopInScrollContent - (viewportHeight - pageHeight) / 2
  const pageLeftInScrollContent = scrollbarWrap.scrollLeft + pageRect.left - containerRect.left
  const viewportWidth = containerRect.width
  const pageWidth = pageRect.width
  const targetScrollLeft = pageLeftInScrollContent - (viewportWidth - pageWidth) / 2
  scrollbarWrap.scrollTo({
    top: Math.max(0, targetScrollTop),
    left: Math.max(0, targetScrollLeft),
    behavior: 'smooth'
  })
}

/** 占位/缩放变化时占位已由 computed 同步，此处保留空实现以兼容现有调用 */
function updateWrapperSize() {}

function handleNumPages(numPages: number) {
  totalPdfPages.value = numPages
  nextTick(updateWrapperSize)
}

function handlePdfLoaded(pdf: any) {
  if (pdf?.numPages) {
    totalPdfPages.value = pdf.numPages
    nextTick(updateWrapperSize)
  }
  // 用第一页实际 page 尺寸（vue-pdf-main / vue-pdf-wrapper）校准 sizer，使 wrapper 与 page 紧贴
  nextTick(() => {
    requestAnimationFrame(() => {
      const firstEl = pageRefs.get(1)
      if (!firstEl) return
      const pageEl =
        firstEl.querySelector('.vue-pdf-main') ||
        firstEl.querySelector('.vue-pdf-wrapper')
      if (pageEl) {
        const w = (pageEl as HTMLElement).offsetWidth
        const h = (pageEl as HTMLElement).offsetHeight
        if (w > 0 && h > 0) {
          placeholderPageWidth.value = w
          placeholderPageHeight.value = h
          nextTick(updateWrapperSize)
        }
      }
    })
  })
}

function handlePdfError(_err: any, _pageNum: number) {
  // no-op or log
}

function handleHandModeMouseDown(e: MouseEvent) {
  if (pdfViewMode.value !== 'hand' || !pdfScrollbarRef.value || e.button !== 0) return
  const scrollbarEl = (pdfScrollbarRef.value as any).$el as HTMLElement | null
  const scrollbarWrap = getScrollViewport(scrollbarEl)
  if (!scrollbarWrap) return
  isDragging = true
  dragStartX = e.clientX
  dragStartY = e.clientY
  scrollStartX = scrollbarWrap.scrollLeft
  scrollStartY = scrollbarWrap.scrollTop
  if (pdfPagesWrapper.value) pdfPagesWrapper.value.style.cursor = 'grabbing'
  document.addEventListener('mousemove', handleHandModeMouseMoveGlobal)
  document.addEventListener('mouseup', handleHandModeMouseUpGlobal)
  document.body.style.userSelect = 'none'
  e.preventDefault()
  e.stopPropagation()
}

function handleHandModeMouseMove(e: MouseEvent) {
  handleHandModeMouseMoveGlobal(e)
}

function handleHandModeMouseMoveGlobal(e: MouseEvent) {
  if (pdfViewMode.value !== 'hand' || !isDragging || !pdfScrollbarRef.value) return
  const scrollbarEl = (pdfScrollbarRef.value as any).$el as HTMLElement | null
  const scrollbarWrap = getScrollViewport(scrollbarEl)
  if (!scrollbarWrap) return
  scrollbarWrap.scrollLeft = scrollStartX + (dragStartX - e.clientX)
  scrollbarWrap.scrollTop = scrollStartY + (dragStartY - e.clientY)
  e.preventDefault()
  e.stopPropagation()
}

function handleHandModeMouseUpGlobal() {
  if (pdfViewMode.value !== 'hand') return
  isDragging = false
  document.removeEventListener('mousemove', handleHandModeMouseMoveGlobal)
  document.removeEventListener('mouseup', handleHandModeMouseUpGlobal)
  document.body.style.userSelect = ''
  if (pdfPagesWrapper.value) {
    pdfPagesWrapper.value.style.cursor = pdfViewMode.value === 'hand' ? 'grab' : 'default'
  }
}

function handleHandModeMouseUp() {
  handleHandModeMouseUpGlobal()
}

function handlePdfWheel(event: WheelEvent) {
  if (!isPdfContainerReady()) return
  const scrollbarEl = pdfScrollbarRef.value ? (pdfScrollbarRef.value as any).$el as HTMLElement : null
  const scrollbarWrap = getScrollViewport(scrollbarEl)
  const delta = event.deltaY > 0 ? -0.1 : 0.1
  const newScale = Math.min(Math.max(zoomScale.value + delta, 0.2), 5)
  const optimalScale = calculateOptimalScale(newScale)
  const willChange = Math.abs(optimalScale - zoomScale.value) > 0.05

  if (pdfViewMode.value === 'hand') {
    event.preventDefault()
    event.stopPropagation()
    if (!willChange) return
    // 以鼠标位置为圆心缩放：记录当前鼠标下的内容坐标，缩放后调整滚动使该点仍在鼠标下
    let viewportX = 0
    let viewportY = 0
    let contentX = 0
    let contentY = 0
    if (scrollbarWrap) {
      const rect = scrollbarWrap.getBoundingClientRect()
      viewportX = event.clientX - rect.left
      viewportY = event.clientY - rect.top
      contentX = scrollbarWrap.scrollLeft + viewportX
      contentY = scrollbarWrap.scrollTop + viewportY
    }
    const scaleFactor = optimalScale / zoomScale.value
    safeUpdateZoomScale(optimalScale)
    if (scrollbarWrap && scaleFactor !== 1) {
      nextTick(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const wrap = getScrollViewport((pdfScrollbarRef.value as any)?.$el)
            if (!wrap) return
            const newScrollLeft = contentX * scaleFactor - viewportX
            const newScrollTop = contentY * scaleFactor - viewportY
            wrap.scrollLeft = Math.max(0, Math.min(newScrollLeft, wrap.scrollWidth - wrap.clientWidth))
            wrap.scrollTop = Math.max(0, Math.min(newScrollTop, wrap.scrollHeight - wrap.clientHeight))
          })
        })
      })
    }
  } else if (event.ctrlKey || event.metaKey) {
    event.preventDefault()
    event.stopPropagation()
    if (!willChange) return
    let viewportX = 0
    let viewportY = 0
    let contentX = 0
    let contentY = 0
    if (scrollbarWrap) {
      const rect = scrollbarWrap.getBoundingClientRect()
      viewportX = event.clientX - rect.left
      viewportY = event.clientY - rect.top
      contentX = scrollbarWrap.scrollLeft + viewportX
      contentY = scrollbarWrap.scrollTop + viewportY
    }
    const scaleFactor = optimalScale / zoomScale.value
    safeUpdateZoomScale(optimalScale)
    if (scrollbarWrap && scaleFactor !== 1) {
      nextTick(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const wrap = getScrollViewport((pdfScrollbarRef.value as any)?.$el)
            if (!wrap) return
            const newScrollLeft = contentX * scaleFactor - viewportX
            const newScrollTop = contentY * scaleFactor - viewportY
            wrap.scrollLeft = Math.max(0, Math.min(newScrollLeft, wrap.scrollWidth - wrap.clientWidth))
            wrap.scrollTop = Math.max(0, Math.min(newScrollTop, wrap.scrollHeight - wrap.clientHeight))
          })
        })
      })
    }
  }
}

function detectCurrentPage() {
  if (!pdfScrollbarRef.value || !pdfPagesContainer.value || totalPdfPages.value === 0) return
  const scrollbarEl = (pdfScrollbarRef.value as any).$el as HTMLElement | null
  const scrollbarWrap = getScrollViewport(scrollbarEl)
  if (!scrollbarWrap) return
  const containerRect = scrollbarWrap.getBoundingClientRect()
  const viewportCenterX = containerRect.left + containerRect.width / 2
  const viewportCenterY = containerRect.top + containerRect.height / 2
  let currentPage = 1
  let minDistance = Infinity
  for (let pageNum = 1; pageNum <= totalPdfPages.value; pageNum++) {
    const pageElement = pageRefs.get(pageNum)
    if (!pageElement) continue
    const pageRect = pageElement.getBoundingClientRect()
    const pageCenterX = pageRect.left + pageRect.width / 2
    const pageCenterY = pageRect.top + pageRect.height / 2
    const distance = Math.sqrt(
      Math.pow(viewportCenterX - pageCenterX, 2) + Math.pow(viewportCenterY - pageCenterY, 2)
    )
    const toleranceX = pageRect.width / 2
    const toleranceY = pageRect.height / 2
    const isInCenter =
      Math.abs(viewportCenterX - pageCenterX) <= toleranceX &&
      Math.abs(viewportCenterY - pageCenterY) <= toleranceY
    if (isInCenter && distance < minDistance) {
      minDistance = distance
      currentPage = pageNum
    } else if (minDistance === Infinity && distance < minDistance) {
      minDistance = distance
      currentPage = pageNum
    }
  }
  if (currentPage !== currentPdfPage.value) {
    isAutoUpdatingPage = true
    currentPdfPage.value = currentPage
    inputPdfPage.value = currentPage
    nextTick(() => {
      isAutoUpdatingPage = false
    })
  }
}

const handleScrollDebounced = debounce(detectCurrentPage, 100)

function setupScrollListener() {
  if (!pdfScrollbarRef.value) return
  const scrollbarEl = (pdfScrollbarRef.value as any).$el as HTMLElement | null
  const scrollbarWrap = getScrollViewport(scrollbarEl)
  if (scrollbarWrap)
    scrollbarWrap.addEventListener('scroll', handleScrollDebounced, { passive: true })
}

function removeScrollListener() {
  if (!pdfScrollbarRef.value) return
  const scrollbarEl = (pdfScrollbarRef.value as any).$el as HTMLElement | null
  const scrollbarWrap = getScrollViewport(scrollbarEl)
  if (scrollbarWrap) scrollbarWrap.removeEventListener('scroll', handleScrollDebounced)
}

watch(
  () => currentPdfPage.value,
  (newPage) => {
    if (!isAutoUpdatingPage) scrollToPage(newPage)
  }
)

watch(
  () => totalPdfPages.value,
  () => nextTick(updateWrapperSize)
)

watch(
  () => props.pdfUrl,
  (url) => {
    pdfRenderKey.value++
    currentPdfPage.value = 1
    inputPdfPage.value = 1
    totalPdfPages.value = 0
    pageRefs.clear()
    placeholderPageWidth.value = A4_WIDTH_PT * PDF_RENDER_SCALE
    placeholderPageHeight.value = A4_HEIGHT_PT * PDF_RENDER_SCALE
    if (
      url &&
      url !== '' &&
      url !== 'file:///' &&
      String(url).trim() !== ''
    ) {
      createLoadingTask(url)
        .promise.then((pdf: any) => pdf.getPage(1))
        .then((page: any) => {
          const vp = page.getViewport({ scale: PDF_RENDER_SCALE })
          placeholderPageWidth.value = vp.width
          placeholderPageHeight.value = vp.height
          nextTick(updateWrapperSize)
        })
        .catch(() => {})
    }
  }
)

onMounted(() => {
  nextTick(() => {
    if (pdfPagesContainer.value) {
      pdfPagesContainer.value.addEventListener('wheel', handlePdfWheel as any, { passive: false })
    }
    setupScrollListener()
  })
})

onBeforeUnmount(() => {
  removeScrollListener()
  if (pdfPagesContainer.value) {
    pdfPagesContainer.value.removeEventListener('wheel', handlePdfWheel as any)
  }
  document.removeEventListener('mousemove', handleHandModeMouseMoveGlobal)
  document.removeEventListener('mouseup', handleHandModeMouseUpGlobal)
})

defineExpose({
  pdfZoomIn,
  pdfZoomOut,
  pdfZoomReset,
  getCurrentPage: () => currentPdfPage.value,
  scrollToPage,
  getPageRefs: () => pageRefs
})
</script>

<style scoped>
.pdf-panel-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.pdf-toolbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  overflow: hidden;
  flex-wrap: nowrap;
}
.pdf-toolbar__page {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  flex-shrink: 0;
}
.pdf-toolbar__page input {
  width: 50px;
  text-align: center;
  flex-shrink: 0;
}
.pdf-toolbar__page-label {
  white-space: nowrap;
  flex-shrink: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pdf-toolbar__pages-per-row {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  flex-shrink: 0;
  margin-left: 4px;
}
.pdf-toolbar__pages-per-row-label {
  white-space: nowrap;
  font-size: 12px;
  color: var(--el-text-color-regular);
}
.pdf-toolbar-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 5px;
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 0.2s;
}
.pdf-toolbar-icon:hover {
  background-color: rgba(66, 66, 66, 0.35);
}
.pdf-toolbar-icon.active {
  background-color: rgba(99, 99, 99, 0.45);
  color: var(--el-color-primary);
}
.pdf-toolbar-mode-icon {
  width: 16px;
  height: 16px;
}
.pdf-preview-container {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--el-border-color-lighter);
}
.pdf-preview-container :deep([data-radix-scroll-area-viewport]) {
  overflow-x: auto !important;
  overflow-y: auto !important;
}
.pdf-preview-container.hand-mode :deep([data-radix-scroll-area-viewport]) {
  overflow: hidden !important;
}
.pdf-preview-container.hand-mode :deep([data-radix-scroll-area-scrollbar]) {
  display: none !important;
}
.pdf-preview-container.hand-mode .pdf-pages-wrapper {
  cursor: grab;
  user-select: none;
}
.pdf-preview-container.hand-mode .pdf-pages-wrapper:active {
  cursor: grabbing;
}
.pdf-preview-container.pointer-mode .pdf-pages-wrapper {
  cursor: default;
  user-select: text;
}
.pdf-pages-wrapper {
  position: relative;
  display: block;
  text-align: left;
}
.pdf-pages-container {
  padding: 20px;
  box-sizing: border-box;
  overflow: visible;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
.pdf-page-wrapper {
  position: relative;
  display: block;
  margin: 0;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  align-self: start;
  justify-self: start;
}
/* 唯一流式子元素，尺寸由内联 style 决定，撑开 wrapper 与 page 紧贴 */
.pdf-page-sizer {
  display: block;
  margin: 0;
  padding: 0;
  pointer-events: none;
}
.pdf-page-placeholder {
  position: absolute;
  inset: 0;
  background-color: var(--pdf-page-bg, #f5f5f5);
  pointer-events: none;
}
/* VuePdf 绝对定位叠在上方，不参与流式布局，不撑大 wrapper；超出由 wrapper overflow 裁剪 */
.pdf-page-wrapper .vue-pdf-wrapper {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
}
.vue-pdf-wrapper {
  display: inline-block;
}
.pdf-page-wrapper :deep(.vue-pdf-main),
.pdf-page-wrapper :deep(.vue-pdf),
.pdf-page-wrapper :deep(.vue-pdf__wrapper) {
  background-color: var(--pdf-page-bg, #ffffff);
}
.pdf-page-wrapper :deep(canvas) {
  background-color: var(--pdf-page-bg, #ffffff);
  image-rendering: auto;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
.pdf-empty {
  align-items: center;
  justify-content: center;
}
.pdf-empty-text {
  color: var(--el-text-color-secondary, #999);
  font-weight: normal;
  margin: 0;
  font-size: 1.1rem;
  text-align: center;
}
.pdf-toolbar-icon.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
