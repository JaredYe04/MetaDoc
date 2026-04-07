<template>
  <div
    class="latex-agent-pdf-first-page"
    role="button"
    tabindex="0"
    :title="hint"
    @click="openPdf"
    @keydown.enter.prevent="openPdf"
    @keydown.space.prevent="openPdf"
  >
    <div ref="stageRef" class="latex-agent-pdf-first-page__stage latex-agent-pdf-first-page__stage--measure">
      <div class="latex-agent-pdf-first-page__viewport" :style="viewportBoxStyle">
        <div class="latex-agent-pdf-first-page__scaled" :style="scaledLayerStyle">
        <div
          class="latex-agent-pdf-first-page__sizer"
          :style="{ width: pageW + 'px', height: pageH + 'px' }"
          aria-hidden="true"
        />
        <VuePdf
          v-if="hasUrl && pdfRenderAllowed"
          :key="renderKey"
          :src="pdfUrl"
          :page="1"
          :scale="PDF_RENDER_SCALE"
          :enable-text-selection="false"
          :enable-annotations="false"
          class="vue-pdf-wrapper latex-agent-pdf-first-page__pdf"
          @pdf-loaded="onPdfLoaded"
        />
        </div>
      </div>
    </div>
    <div class="latex-agent-pdf-first-page__hint" :style="hintBoxStyle">{{ hint }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { VuePdf } from 'vue3-pdfjs'
import eventBus from '@renderer/utils/event-bus'

const props = defineProps<{
  pdfUrl: string
  /** 本地绝对路径，用于在工作区打开预览 Tab */
  filePath: string
}>()

const { t } = useI18n()

const PDF_RENDER_SCALE = 2.5
const A4_WIDTH_PT = 595.28
const A4_HEIGHT_PT = 841.89

/** 父级分配的可视区域（嵌入框），用于算 scale；勿用已缩放后的 viewport 量自己，避免逻辑循环 */
const stageRef = ref<HTMLElement | null>(null)
const availW = ref(0)
const availH = ref(0)
const pageW = ref(A4_WIDTH_PT * PDF_RENDER_SCALE)
const pageH = ref(A4_HEIGHT_PT * PDF_RENDER_SCALE)
const renderKey = ref(0)
/** 等 stage 有真实宽高再挂 VuePdf，避免 pdf.js 对非 Element 调 getComputedStyle */
const pdfRenderAllowed = ref(false)
/** 相对消息区宽度的展示比例，默认 0.9（自适应但保留安全边距）；由 .tool-message-wrapper 上 --latex-agent-pdf-width-scale 提供 */
const widthScale = ref(0.9)

let ro: ResizeObserver | null = null

const hasUrl = computed(() => {
  const u = props.pdfUrl?.trim() ?? ''
  return u !== '' && u !== 'file:///'
})

const fitScale = computed(() => {
  const aw = availW.value
  const ah = availH.value
  const pw = pageW.value
  const ph = pageH.value
  if (aw <= 0 || ah <= 0 || pw <= 0 || ph <= 0) {
    return 0.25
  }
  const padW = 0.98
  const awSafe = Math.max(aw, 48)
  const ratio = Math.min(Math.max(widthScale.value, 0.1), 1)
  const byWidth = (awSafe * padW * ratio) / pw
  return Math.min(byWidth, 1)
})

const vizW = computed(() => Math.max(1, Math.round(pageW.value * fitScale.value)))
const vizH = computed(() => {
  const rawH = Math.max(1, Math.round(pageH.value * fitScale.value))
  if (pageW.value > 0) {
    const clampedScale = vizW.value / pageW.value
    return Math.max(1, Math.round(pageH.value * clampedScale))
  }
  return rawH
})

const viewportBoxStyle = computed(() => ({
  width: `${vizW.value}px`,
  maxWidth: '100%',
  marginLeft: 'auto',
  marginRight: 'auto',
  height: `${vizH.value}px`,
  boxSizing: 'border-box',
  overflow: 'hidden',
  flexShrink: 0
}))

const scaledLayerStyle = computed(() => ({
  width: `${pageW.value}px`,
  height: `${pageH.value}px`,
  transform: `scale(${fitScale.value})`,
  transformOrigin: 'top left'
}))

const hintBoxStyle = computed(() => ({
  width: '100%',
  boxSizing: 'border-box' as const
}))

const hint = computed(() => t('agent.display.latexCompile.clickToOpenPdf'))

function readWidthScaleFromAncestors() {
  const stage = stageRef.value
  if (!stage) return
  const embed = stage.closest('.latex-compile-pdf-embed') as HTMLElement | null
  const wrap = stage.closest('.tool-message-wrapper') as HTMLElement | null
  for (const el of [embed, wrap].filter(Boolean) as HTMLElement[]) {
    const raw = getComputedStyle(el).getPropertyValue('--latex-agent-pdf-width-scale').trim()
    if (!raw) continue
    const n = parseFloat(raw)
    if (Number.isFinite(n) && n >= 0.1 && n <= 1) {
      widthScale.value = n
      return
    }
  }
}

function measureStage() {
  const el = stageRef.value
  if (!el) return
  const r = el.getBoundingClientRect()
  availW.value = r.width
  availH.value = r.height
  readWidthScaleFromAncestors()
}

function syncPdfRenderGate() {
  pdfRenderAllowed.value =
    hasUrl.value && availW.value >= 48 && availH.value >= 48
}

function onPdfLoaded() {
  requestAnimationFrame(() => {
    const root = stageRef.value?.querySelector('.latex-agent-pdf-first-page__scaled')
    if (!root) return
    const pageEl =
      root.querySelector('.vue-pdf-main') ||
      root.querySelector('canvas') ||
      root.querySelector('.vue-pdf__wrapper')
    if (!pageEl) return
    const w = (pageEl as HTMLElement).offsetWidth
    const h = (pageEl as HTMLElement).offsetHeight
    if (w > 0 && h > 0) {
      pageW.value = w
      pageH.value = h
      measureStage()
      syncPdfRenderGate()
    }
  })
}

function openPdf() {
  const p = props.filePath?.trim()
  if (!p) return
  eventBus.emit('workspace-open-document', {
    path: p,
    format: 'pdf',
    preview: true
  })
}

watch(
  () => props.pdfUrl,
  async () => {
    pdfRenderAllowed.value = false
    renderKey.value++
    pageW.value = A4_WIDTH_PT * PDF_RENDER_SCALE
    pageH.value = A4_HEIGHT_PT * PDF_RENDER_SCALE
    await nextTick()
    measureStage()
    requestAnimationFrame(() => {
      measureStage()
      syncPdfRenderGate()
    })
  }
)

onMounted(() => {
  nextTick(() => {
    measureStage()
    requestAnimationFrame(() => {
      measureStage()
      syncPdfRenderGate()
    })
    const el = stageRef.value
    if (el && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        measureStage()
        syncPdfRenderGate()
      })
      ro.observe(el)
    }
  })
})

onBeforeUnmount(() => {
  ro?.disconnect()
  ro = null
})
</script>

<style scoped>
.latex-agent-pdf-first-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  height: 100%;
  min-height: 0;
  min-width: 0;
  cursor: pointer;
  outline: none;
  border-radius: inherit;
  overflow: hidden;
}
.latex-agent-pdf-first-page:focus-visible {
  box-shadow: 0 0 0 2px var(--el-color-primary-light-5);
}
/* 占满嵌入区宽度再测量，避免父级 flex 下 shrink-to-fit 得到极小宽度 → fitScale≈0 → 只剩竖排字 */
.latex-agent-pdf-first-page__stage--measure {
  align-self: stretch;
  width: 100%;
  min-width: 0;
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  box-sizing: border-box;
}
.latex-agent-pdf-first-page__viewport {
  position: relative;
  overflow: hidden;
  flex-shrink: 0;
  background: var(--el-fill-color-lighter, rgba(0, 0, 0, 0.04));
  border-radius: 4px;
}
.latex-agent-pdf-first-page__scaled {
  position: absolute;
  left: 0;
  top: 0;
  flex-shrink: 0;
}
.latex-agent-pdf-first-page__sizer {
  pointer-events: none;
  visibility: hidden;
}
.latex-agent-pdf-first-page__pdf {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
}
.latex-agent-pdf-first-page__scaled :deep(.vue-pdf-main),
.latex-agent-pdf-first-page__scaled :deep(.vue-pdf-wrapper) {
  max-width: 100% !important;
}
.latex-agent-pdf-first-page__hint {
  flex-shrink: 0;
  align-self: stretch;
  padding: 6px 8px;
  font-size: 11px;
  line-height: 1.3;
  text-align: center;
  color: var(--el-text-color-secondary);
  border-top: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
}
</style>
