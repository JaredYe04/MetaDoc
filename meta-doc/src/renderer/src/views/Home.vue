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
          <MdPreview
            class="md-preview-fixed"
            :modelValue="previewMarkdown"
            previewTheme="github"
            :theme="previewTheme"
            :codeFold="false"
            :autoFoldThreshold="300"
            :class="themeState.currentTheme.mdeditorClass"
          />
        </el-scrollbar>
      </div>
    </div>

    <div v-else-if="quickStartStage === 'format'" class="center-content quick-start-format-wrapper">
      <div class="aero-div quick-start-format" :style="formatContainerStyle">
        <h2 class="main-letter">{{ $t('home.quickStartFormatTitle') }}</h2>
        <div class="quick-start-format__options">
          <div
            class="quick-start-format__option"
            :style="formatOptionStyle"
            @click="selectQuickStartFormat('md')"
          >
            <h3>Markdown</h3>
            <p>{{ $t('home.quickStartFormatDescriptionMarkdown') }}</p>
          </div>
          <div
            class="quick-start-format__option"
            :style="formatOptionStyle"
            @click="selectQuickStartFormat('tex')"
          >
            <h3>LaTeX</h3>
            <p>{{ $t('home.quickStartFormatDescriptionLatex') }}</p>
          </div>
        </div>
        <div class="quick-start-format__actions">
          <el-button class="aero-btn" @click="closeQuickStart">
            {{ $t('home.tooltip.close') }}
          </el-button>
        </div>
      </div>
    </div>

    <QuickStartMarkdown
      v-else-if="quickStartStage === 'markdown'"
      @close="handleQuickStartClose"
    />
    <QuickStartLatex
      v-else
      @close="handleQuickStartClose"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { MdPreview, type Themes } from 'md-editor-v3'
import WorkspaceTabs from '../components/workspace/WorkspaceTabs.vue'
import QuickStartMarkdown from '../components/home/QuickStartMarkdown.vue'
import QuickStartLatex from '../components/home/QuickStartLatex.vue'
import '../assets/aero-div.css'
import '../assets/aero-btn.css'
import '../assets/aero-input.css'
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

const previewTheme = computed<Themes>(() => themeState.currentTheme.mdeditorTheme as Themes)

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

const formatContainerStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  background: themeState.currentTheme.quickStartBackground1
}))

const formatOptionStyle = computed(() => ({
  background: themeState.currentTheme.quickStartBackground2
}))

const openQuickStart = () => {
  eventBus.emit('reset-quickstart')
  quickStartStage.value = 'format'
}

const closeQuickStart = () => {
  quickStartStage.value = 'inactive'
  eventBus.emit('reset-quickstart')
}

const handleQuickStartClose = () => {
  closeQuickStart()
}

const selectQuickStartFormat = (format: 'md' | 'tex') => {
  const tabId = activeTabId.value
  if (!tabId) return
  try {
    initializeDocumentFromTemplate(tabId, format)
  } catch (error) {
    logger.warn('初始化文档模板失败', error)
  }
  eventBus.emit('reset-quickstart')
  quickStartStage.value = format === 'md' ? 'markdown' : 'latex'
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

onMounted(() => {
  scheduleParticleEffect()
  window.addEventListener('mousemove', (e) => particleEffectInstance.handleMouseMove(e))
  window.addEventListener('resize', () => particleEffectInstance.handleWindowResize())
  preventNavigate()
})

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', (e) => particleEffectInstance.handleMouseMove(e))
  window.removeEventListener('resize', () => particleEffectInstance.handleWindowResize())
  particleEffectInstance.dispose()
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

/* 确保 QuickStartMarkdown 和 QuickStartLatex 在 canvas 之上 */
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
  gap: 24px;
  width: 100%;
  height: 100%;
  padding: 32px 24px;
  box-sizing: border-box;
  /* 确保内容在 canvas 之上 */
  position: relative;
  z-index: 1;
}

.main-letter {
  font-size: 80px;
  font-weight: 700;
  color: rgb(65, 105, 225);
  margin: 0;
  transition: color 0.3s ease;
}

.main-letter:hover {
  color: rgb(50, 150, 250);
}

.buttons {
  display: flex;
  gap: 16px;
  padding: 20px 32px;
  border-radius: 16px;
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
  max-height: 25vh;
  overflow: auto;
  border-radius: 12px;
}

.md-title {
  margin: 0 0 12px;
}

.md-author,
.md-description {
  margin-bottom: 12px;
}

.md-container {
  max-height: 63vh;
  height: 63vh;
  overflow: auto;
  width: 100%;
  border: 1px #cccccc44 solid;
  border-radius: 10px;
}

.md-preview-fixed {
  max-width: 100%;
  word-wrap: break-word;
  overflow-wrap: break-word;
  white-space: pre-wrap;
  box-sizing: border-box;
}

.quick-start-format-wrapper {
  height: 100%;
  width: 100%;
  justify-content: center;
  /* 确保内容在 canvas 之上 */
  position: relative;
  z-index: 1;
}

.quick-start-format {
  width: 60vw;
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  border-radius: 16px;
  backdrop-filter: blur(20px) brightness(1.05);
}

.quick-start-format__options {
  width: 100%;
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  justify-content: center;
}

.quick-start-format__option {
  flex: 1 1 240px;
  padding: 20px;
  border-radius: 16px;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
}

.quick-start-format__option:hover {
  transform: translateY(-4px);
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.2);
}

.quick-start-format__actions {
  display: flex;
  justify-content: flex-end;
}

.homepage :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
}
</style>
