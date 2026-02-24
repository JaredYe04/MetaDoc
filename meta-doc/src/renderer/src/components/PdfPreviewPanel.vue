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
import { VuePdf } from 'vue3-pdfjs'
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
const pdfScrollbarRef = ref<InstanceType<typeof ScrollArea> | null>(null)
const pdfPagesContainer = ref<HTMLElement | null>(null)
const pdfPagesWrapper = ref<HTMLElement | null>(null)
const pageRefs = new Map<number, HTMLElement>()
const pagesPerRow = ref(props.defaultPagesPerRow)
const pdfViewMode = ref<'pointer' | 'hand'>('pointer')
const zoomScale = ref(1.0)
const currentPdfPage = ref(1)
const totalPdfPages = ref(0)
const inputPdfPage = ref(1)
const pdfRenderKey = ref(0)
const pdfWrapperHeight = ref<number | string>('auto')
const pdfWrapperWidth = ref<number | string>('auto')
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
  const scrollbarWrap = scrollbarEl?.querySelector(
    '[data-radix-scroll-area-viewport]'
  ) as HTMLElement | null
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

function updateWrapperSize() {
  if (!pdfPagesContainer.value || !pdfPagesWrapper.value) return
  nextTick(() => {
    requestAnimationFrame(() => {
      if (!pdfPagesContainer.value || !pdfPagesWrapper.value) return
      let containerHeight = pdfPagesContainer.value.scrollHeight
      let containerWidth = pdfPagesContainer.value.scrollWidth
      if (containerHeight === 0 || containerWidth === 0) {
        containerHeight = pdfPagesContainer.value.offsetHeight
        containerWidth = pdfPagesContainer.value.offsetWidth
      }
      if (containerHeight > 0 && containerWidth > 0) {
        const scaleFactor = zoomScale.value / PDF_RENDER_SCALE
        pdfWrapperHeight.value = containerHeight * scaleFactor
        pdfWrapperWidth.value = containerWidth * scaleFactor
      } else {
        pdfWrapperHeight.value = 'auto'
        pdfWrapperWidth.value = 'auto'
      }
    })
  })
}

function handleNumPages(numPages: number) {
  totalPdfPages.value = numPages
  nextTick(updateWrapperSize)
}

function handlePdfLoaded(pdf: any) {
  if (pdf?.numPages) {
    totalPdfPages.value = pdf.numPages
    nextTick(updateWrapperSize)
  }
}

function handlePdfError(_err: any, _pageNum: number) {
  // no-op or log
}

function handleHandModeMouseDown(e: MouseEvent) {
  if (pdfViewMode.value !== 'hand' || !pdfScrollbarRef.value || e.button !== 0) return
  const scrollbarEl = (pdfScrollbarRef.value as any).$el as HTMLElement | null
  const scrollbarWrap = scrollbarEl?.querySelector(
    '[data-radix-scroll-area-viewport]'
  ) as HTMLElement | null
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
  const scrollbarWrap = scrollbarEl?.querySelector(
    '[data-radix-scroll-area-viewport]'
  ) as HTMLElement | null
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
  if (pdfViewMode.value === 'hand') {
    event.preventDefault()
    event.stopPropagation()
    const delta = event.deltaY > 0 ? -0.1 : 0.1
    const newScale = Math.min(Math.max(zoomScale.value + delta, 0.2), 5)
    if (Math.abs(calculateOptimalScale(newScale) - zoomScale.value) > 0.05) {
      safeUpdateZoomScale(calculateOptimalScale(newScale))
    }
  } else if (event.ctrlKey || event.metaKey) {
    event.preventDefault()
    event.stopPropagation()
    const delta = event.deltaY > 0 ? -0.1 : 0.1
    const newScale = Math.min(Math.max(zoomScale.value + delta, 0.2), 5)
    if (Math.abs(calculateOptimalScale(newScale) - zoomScale.value) > 0.05) {
      safeUpdateZoomScale(calculateOptimalScale(newScale))
    }
  }
}

function detectCurrentPage() {
  if (!pdfScrollbarRef.value || !pdfPagesContainer.value || totalPdfPages.value === 0) return
  const scrollbarEl = (pdfScrollbarRef.value as any).$el as HTMLElement | null
  const scrollbarWrap = scrollbarEl?.querySelector(
    '[data-radix-scroll-area-viewport]'
  ) as HTMLElement | null
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
  const scrollbarWrap = scrollbarEl?.querySelector(
    '[data-radix-scroll-area-viewport]'
  ) as HTMLElement | null
  if (scrollbarWrap)
    scrollbarWrap.addEventListener('scroll', handleScrollDebounced, { passive: true })
}

function removeScrollListener() {
  if (!pdfScrollbarRef.value) return
  const scrollbarEl = (pdfScrollbarRef.value as any).$el as HTMLElement | null
  const scrollbarWrap = scrollbarEl?.querySelector(
    '[data-radix-scroll-area-viewport]'
  ) as HTMLElement | null
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
  () => {
    pdfRenderKey.value++
    currentPdfPage.value = 1
    inputPdfPage.value = 1
    totalPdfPages.value = 0
    pageRefs.clear()
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
  display: flex;
  justify-content: flex-start;
  align-items: flex-start;
  background-color: var(--pdf-page-bg, #ffffff);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  width: fit-content;
  margin: 0;
  flex-shrink: 0;
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
