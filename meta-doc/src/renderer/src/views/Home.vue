<template>
  <div id="particle-bg" class="homepage">
    <WorkspaceTabs
      closable
      @update:activeId="handleTabChange"
      @close="handleCloseTab"
    />

    <div v-if="quickStartStage === 'inactive'" class="center-content">
      <h1
        class="main-letter"
        v-if="showWelcome"
        @mouseover="highlightM"
        @mouseleave="resetM"
      >
        {{ $t('home.metaDoc') }}
      </h1>

      <div class="buttons aero-div" v-if="showWelcome">
        <el-tooltip :content="$t('home.tooltip.quickStart')" placement="top">
          <el-button type="primary" @click="openQuickStart" class="aero-btn">
            {{ $t('home.button.quickStart') }}
          </el-button>
        </el-tooltip>
        <el-tooltip :content="$t('home.tooltip.openFile')" placement="top">
          <el-button type="success" @click="openFile" class="aero-btn">
            {{ $t('home.button.openFile') }}
          </el-button>
        </el-tooltip>
      </div>

      <div v-else class="document-preview">
        <el-scrollbar class="md-metainfo" min-size="10">
          <h1 class="md-title" :style="{ color: themeState.currentTheme.textColor }">
            {{ metaTitle }}
          </h1>
          <div class="md-author" :style="{ color: themeState.currentTheme.textColor }">
            <h3>{{ $t('home.authorLabel') }}：{{ metaAuthor }}</h3>
          </div>
          <div class="md-description" :style="{ color: themeState.currentTheme.textColor }">
            <h3>{{ $t('home.abstractLabel') }}</h3>
            {{ metaDescription }}
          </div>
        </el-scrollbar>

        <el-scrollbar class="md-container">
          <div
            ref="previewContainerRef"
            class="md-preview-container"
            :class="themeState.currentTheme.mdeditorClass"
            :style="{ color: themeState.currentTheme.textColor }"
          ></div>
        </el-scrollbar>
      </div>
    </div>

    <QuickStartPanel
      v-else
      @close="handleQuickStartClose"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import WorkspaceTabs from '../components/workspace/WorkspaceTabs.vue'
import QuickStartPanel from '../components/home/QuickStartPanel.vue'
import '../assets/aero-div.css'
import '../assets/aero-btn.css'
import '../assets/aero-input.css'
import eventBus, { getWindowType, isElectronEnv } from '../utils/event-bus'
import { createRendererLogger } from '../utils/logger'
import { getSetting } from '../utils/settings'
import localIpcRenderer from '../utils/web-adapter/local-ipc-renderer'
import { webMainCalls } from '../utils/web-adapter/web-main-calls'
import { themeState } from '../utils/themes'
import { useWorkspace } from '../stores/workspace'
import { useActiveDocument } from '../composables/useActiveDocument'
import { convertLatexToMarkdown, extractPlainTextFromLatex } from '../utils/latex-utils'
import { ParticleEffect } from '../utils/particle-effect'
import type { IpcRendererLike } from '../utils/particle-effect'
import Vditor from 'vditor'
import { localVditorCDN, vditorCDN } from '../utils/vditor-cdn'
import { preRenderAllCharts } from '../utils/chart-pre-renderer'

const { t } = useI18n()

const maybeWindow =
  typeof window !== 'undefined'
    ? (window as Window & { electron?: { ipcRenderer?: IpcRendererLike } })
    : undefined

const workspace = useWorkspace()
const {
  tabs,
  activeTabId,
  initializeDocumentFromTemplate,
  activateTab,
  ensureDocument,
  removeTab
} = workspace
const { activeDocument } = useActiveDocument()

const quickStartStage = ref<'inactive' | 'format' | 'markdown' | 'latex'>('inactive')

const currentFilePath = computed(() => activeDocument.value?.path ?? '')
const metaTitle = computed(() => activeDocument.value?.meta?.title ?? '')
const metaAuthor = computed(() => activeDocument.value?.meta?.author ?? '')
const metaDescription = computed(() => activeDocument.value?.meta?.description ?? '')

const previewMarkdown = computed(() => {
  const doc = activeDocument.value
  if (!doc) return ''
  if (doc.format === 'tex') {
    return convertLatexToMarkdown(doc.tex ?? '')
  }
  return doc.markdown ?? ''
})

const previewContainerRef = ref<HTMLElement | null>(null)

// 粒子效果使用的文本：根据文档格式选择对应的文本源
const particleMarkdown = computed(() => {
  const doc = activeDocument.value
  if (!doc) return ''
  
  // 根据文档格式选择文本源
  if (doc.format === 'tex') {
    // LaTeX 格式：直接使用 LaTeX 文本（ParticleEffect 内部会提取纯文本）
    return doc.tex ?? ''
  }
  
  // Markdown 格式：直接使用 Markdown 文本
  return doc.markdown ?? ''
})

const showWelcome = computed(() => quickStartStage.value === 'inactive' && currentFilePath.value === '')

const openQuickStart = () => {
  eventBus.emit('reset-quickstart')
  eventBus.emit('open-quickstart')
  quickStartStage.value = 'format'
}

const handleQuickStartClose = () => {
  quickStartStage.value = 'inactive'
  eventBus.emit('reset-quickstart')
}

const highlightM = () => {
  const el = document.querySelector('.main-letter') as HTMLElement | null
  if (el) el.style.color = 'rgb(50, 150, 250)'
}

const resetM = () => {
  const el = document.querySelector('.main-letter') as HTMLElement | null
  if (el) el.style.color = 'rgb(65,105,225)'
}

const openFile = () => {
  eventBus.emit('open-doc')
}

// 粒子效果初始化
const logger = createRendererLogger('Home', {
  windowTypeProvider: () => getWindowType()
})

let ipcRenderer: IpcRendererLike | null = null
if (maybeWindow?.electron?.ipcRenderer) {
  ipcRenderer = maybeWindow.electron.ipcRenderer
} else {
  webMainCalls()
  ipcRenderer = localIpcRenderer as IpcRendererLike
}

// 初始化粒子效果
const particleEffectInstance = new ParticleEffect({
  logger,
  eventBus,
  getSetting,
  ipcRenderer,
  particleMarkdown,
  extractPlainTextFromLatex,
  containerId: 'particle-bg'
})

const preventNavigate = () => {
  document.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement | null)?.closest('a') as HTMLAnchorElement | null
    if (target && target.href && target.target !== '_blank') {
      event.preventDefault()
      const url = target.href
      if (url.startsWith('http')) {
        eventBus.emit('open-link', url)
      }
    }
  })
}

const scheduleParticleEffect = () => {
  const runner = () => {
    particleEffectInstance.init().catch((err) => logger.warn('粒子效果初始化失败', err))
  }
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(() => runner())
  } else {
    setTimeout(runner, 0)
  }
}

// 渲染预览内容
const renderPreview = async () => {
  if (!previewContainerRef.value) return
  
  const container = previewContainerRef.value as HTMLDivElement
  const markdown = previewMarkdown.value
  
  if (!markdown) {
    container.innerHTML = ''
    return
  }
  
  try {
    // 获取 CDN 和主题设置
    const cdn = isElectronEnv() ? localVditorCDN : vditorCDN
    const contentTheme = await getSetting('contentTheme') || 'light'
    const codeTheme = await getSetting('codeTheme') || 'github'
    const lineNumber = await getSetting('lineNumber') ?? true
    
    // 清空容器
    container.innerHTML = ''
    
    // 使用 Vditor.preview 渲染
    // Vditor 类型定义可能不完整，但实际支持这些配置
    const previewOptions: any = {
      cdn,
      mode: themeState.currentTheme.type === 'dark' ? 'dark' : 'light',
      markdown: {
        theme: { current: contentTheme }
      },
      hljs: {
        style: codeTheme,
        lineNumber: lineNumber
      },
      theme: themeState.currentTheme.vditorTheme
    }
    Vditor.preview(container, markdown, previewOptions)
    
    // 等待 preview 完成后再调用其他渲染方法
    await nextTick()
    
    // 渲染代码块
    if (typeof Vditor.codeRender === 'function') {
      Vditor.codeRender(container)
    }
    
    // 渲染数学公式
    if (typeof Vditor.mathRender === 'function') {
      Vditor.mathRender(container, {
        cdn
      })
    }
    
    // 预渲染所有图表（Mermaid, ECharts 等）
    await preRenderAllCharts(markdown, cdn)
    
  } catch (error) {
    logger.error('渲染预览失败', error)
    container.innerHTML = `<p style="color: var(--console-err, #fe8771);">渲染失败: ${error instanceof Error ? error.message : String(error)}</p>`
  }
}

// 监听预览内容变化
watch([previewMarkdown, () => themeState.currentTheme.type], () => {
  nextTick(() => {
    renderPreview()
  })
}, { immediate: false })

onMounted(() => {
  scheduleParticleEffect()
  window.addEventListener('mousemove', (e) => particleEffectInstance.handleMouseMove(e))
  window.addEventListener('resize', () => particleEffectInstance.handleWindowResize())
  preventNavigate()
  
  // 监听 quickStartPanel 的状态变化
  eventBus.on('open-quickstart', () => {
    quickStartStage.value = 'format'
  })
  
  // 初始渲染
  nextTick(() => {
    renderPreview()
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', (e) => particleEffectInstance.handleMouseMove(e))
  window.removeEventListener('resize', () => particleEffectInstance.handleWindowResize())
  particleEffectInstance.dispose()
  eventBus.off('open-quickstart')
})

const handleTabChange = (id: string) => {
  activateTab(id)
}

const handleCloseTab = (id: string) => {
  if (tabs.length <= 1) return
  removeTab(id)
}
</script>

<style scoped>
#particle-bg {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  /* 确保容器内的内容在 canvas 之上 */
  z-index: 0;
}

.homepage {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 确保 WorkspaceTabs 在 canvas 之上 */
.homepage :deep(.workspace-tabs-wrapper) {
  position: relative;
  z-index: 1;
}

/* 确保 QuickStartPanel 在 canvas 之上 */
.homepage :deep(.quick-start-panel),
.homepage :deep(.quick-start-markdown),
.homepage :deep(.quick-start-latex) {
  position: relative;
  z-index: 1;
}

/* 确保 Three.js canvas 只在 #particle-bg 容器内显示，在最底层 */
#particle-bg canvas {
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
  width: 100% !important;
  height: 100% !important;
  z-index: 0 !important;
  pointer-events: none !important;
}

.center-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: 100%;
  height: 100%;
  padding: 16px 24px;
  box-sizing: border-box;
  /* 确保内容在 canvas 之上 */
  position: relative;
  z-index: 1;
  overflow: auto;
}

.main-letter {
  font-size: 48px;
  font-weight: 700;
  color: rgb(65, 105, 225);
  margin: 0;
  padding: 8px 0;
  transition: color 0.3s ease;
}

.main-letter:hover {
  color: rgb(50, 150, 250);
}

.buttons {
  display: flex;
  gap: 16px;
  padding: 20px 32px;
  border-radius: 4px;
}

.document-preview {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 80vw;
  /* 确保内容在 canvas 之上 */
  position: relative;
  z-index: 1;
}

.md-metainfo {
  width: 100%;
  height: 15vh;
  max-height: 15vh;
  overflow: auto;
  border-radius: 4px;
}

.md-title {
  margin: 0 0 12px;
}

.md-author,
.md-description {
  margin-bottom: 12px;
}

.md-container {
  height: 60vh;
  max-height: 60vh;
  width: 100%;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 4px;
}

.md-preview-container {
  width: 100%;
  padding: 16px;
  overflow:visible;
  box-sizing: border-box;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

/* QuickStartPanel 样式已迁移到组件内部 */

/* 摘要栏的滚动条样式 */
.md-metainfo :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
  overflow-y: auto;
}
</style>
