<template>
  <div id="particle-bg" class="homepage">
    <!-- 如果文档格式未选择，显示格式选择界面 -->
    <div v-if="needsFormatSelection" class="format-selection-container">
      <NewDocumentWorkspace 
        v-if="activeTabId"
        :tab-id="activeTabId"
        :active="true"
      />
    </div>

    <!-- 如果已选择格式，显示文档预览 -->
    <div v-else-if="showDocumentPreview" class="document-preview">
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
        <div ref="previewContainerRef" class="md-preview-container" :class="themeState.currentTheme.mdeditorClass"
          :style="{ color: themeState.currentTheme.textColor }" v-loading="isRendering"></div>
      </el-scrollbar>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import NewDocumentWorkspace from './NewDocumentWorkspace.vue'
import eventBus, { getWindowType } from '../utils/event-bus'
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
import { renderMarkdownPreview } from '../utils/md-utils'
import { preRenderAllCharts } from '../utils/chart-pre-renderer'

const { t } = useI18n()

const maybeWindow =
  typeof window !== 'undefined'
    ? (window as Window & { electron?: { ipcRenderer?: IpcRendererLike } })
    : undefined

const workspace = useWorkspace()
const { activeTabId } = workspace
const { activeDocument, activeTab } = useActiveDocument()

const currentFilePath = computed(() => activeDocument.value?.path ?? '')
const metaTitle = computed(() => activeDocument.value?.meta?.title ?? '')
const metaAuthor = computed(() => activeDocument.value?.meta?.author ?? '')
const metaDescription = computed(() => activeDocument.value?.meta?.description ?? '')

// 判断是否需要显示格式选择界面
const needsFormatSelection = computed(() => {
  const tab = activeTab.value
  // 如果是新建文档且还没有选择格式，显示格式选择界面
  return tab?.kind === 'new' && !activeDocument.value?.format
})

// 计算当前文档的 linkBase（用于 Markdown 预览解析相对路径）
const currentLinkBase = computed(() => {
  const path = currentFilePath.value;
  if (!path) return '';
  return workspace.getLinkBase(path);
})

const previewMarkdown = computed(() => {
  const doc = activeDocument.value
  if (!doc) return ''
  if (doc.format === 'tex') {
    return convertLatexToMarkdown(doc.tex ?? '')
  }
  return doc.markdown ?? ''
})

const previewContainerRef = ref<HTMLElement | null>(null)
const isRendering = ref(false)

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

// 是否显示文档预览：只有当真正打开了已存在的文档或已选择格式的文档时才显示
const showDocumentPreview = computed(() => {
  const tab = activeTab.value
  if (!tab) return false
  // 如果是文件类型且有路径，显示预览
  if (tab.kind === 'file' && currentFilePath.value) return true
  // 如果是新建文档但已选择格式，显示预览
  if (tab.kind === 'new' && activeDocument.value?.format) return true
  return false
})

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
    isRendering.value = false
    return
  }

  try {
    // 开始渲染，显示loading
    isRendering.value = true

    // 获取当前文档的 linkBase
    const linkBase = currentLinkBase.value;

    // 使用统一的 Markdown 预览渲染函数
    await renderMarkdownPreview(container, markdown, {
      linkBase: linkBase,
      renderCode: false,
      renderMath: false
    })
  } catch (error) {
    logger.error('渲染预览失败', error)
    container.innerHTML = `<p style="color: var(--console-err, #fe8771);">渲染失败: ${error instanceof Error ? error.message : String(error)}</p>`
  } finally {
    // 渲染完成，隐藏loading
    isRendering.value = false
  }
}

// 监听预览内容变化，只在需要显示文档预览时渲染
watch([previewMarkdown, () => themeState.currentTheme.type, showDocumentPreview], () => {
  if (!showDocumentPreview.value) return
  nextTick(() => {
    renderPreview()
  })
}, { immediate: false })

onMounted(() => {
  scheduleParticleEffect()
  window.addEventListener('mousemove', (e) => particleEffectInstance.handleMouseMove(e))
  window.addEventListener('resize', () => particleEffectInstance.handleWindowResize())
  preventNavigate()

  // 初始渲染（只在需要显示文档预览时）
  nextTick(() => {
    if (showDocumentPreview.value) {
      renderPreview()
    }
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', (e) => particleEffectInstance.handleMouseMove(e))
  window.removeEventListener('resize', () => particleEffectInstance.handleWindowResize())
  particleEffectInstance.dispose()
})

</script>

<style scoped>
#particle-bg {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  /* 确保容器内的内容在 canvas 之上 */
  z-index: 0;
  /* 设置背景色，当粒子效果关闭时显示主题背景色 */
  background-color: v-bind('themeState.currentTheme.background');
}

.homepage {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.format-selection-container {
  width: 100%;
  height: 100%;
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
  justify-content: center;
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
  overflow: visible;
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

/* 最近文档容器 */
.recent-docs-container {
  width: 80vw;
  max-width: 800px;
  margin-top: 32px;
  padding: 24px;
  border-radius: 12px;
  border: 1px solid;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.recent-docs-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  padding: 0;
}

.recent-docs-scrollbar {
  max-height: calc(52px * 8);
  /* 8条文档的高度 */
  width: 100%;
}

.recent-docs-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.recent-doc-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
}

.recent-doc-item:hover {
  opacity: 0.8;
  transform: translateX(4px);
}

.recent-doc-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.recent-doc-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
}
</style>
