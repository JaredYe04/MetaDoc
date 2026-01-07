<template>
  <div id="particle-bg" class="homepage">
    <el-scrollbar class="center-content">
      <div class="center-content-wrapper">
        <h1 class="main-letter" v-if="showWelcome" @mouseover="highlightM" @mouseleave="resetM">
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

        <!-- 最近文档列表 -->
        <div v-if="showWelcome && recentDocs.length > 0" class="recent-docs-container aero-div" :style="{
          borderColor: themeState.currentTheme.borderColor || 'rgba(0, 0, 0, 0.1)'
        }">
          <h3 class="recent-docs-title" :style="{ color: themeState.currentTheme.textColor }">
            {{ $t('home.recentDocuments') || '最近文档' }}
          </h3>
          <!-- 当文档数量超过8条时使用滚动条 -->
          <el-scrollbar v-if="recentDocs.length > 8" class="recent-docs-scrollbar">
            <div class="recent-docs-list">
              <div v-for="docPath in recentDocs" :key="docPath" class="recent-doc-item" @click="openRecentDoc(docPath)"
                :style="{
                  backgroundColor: themeState.currentTheme.background2nd,
                  color: themeState.currentTheme.textColor
                }">
                <el-icon class="recent-doc-icon">
                  <Document />
                </el-icon>
                <span class="recent-doc-name">{{ getFileName(docPath) }}</span>
              </div>
            </div>
          </el-scrollbar>
          <!-- 当文档数量不超过8条时直接显示 -->
          <div v-else class="recent-docs-list">
            <div v-for="docPath in recentDocs" :key="docPath" class="recent-doc-item" @click="openRecentDoc(docPath)"
              :style="{
                backgroundColor: themeState.currentTheme.background2nd,
                color: themeState.currentTheme.textColor
              }">
              <el-icon class="recent-doc-icon">
                <Document />
              </el-icon>
              <span class="recent-doc-name">{{ getFileName(docPath) }}</span>
            </div>
          </div>
        </div>
      </div>
    </el-scrollbar>

    <QuickStartPanel v-if="quickStartStage !== 'inactive'" @close="handleQuickStartClose" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import QuickStartPanel from '../components/home/QuickStartPanel.vue'
import '../assets/aero-div.css'
import '../assets/aero-btn.css'
import '../assets/aero-input.css'
import eventBus from '../utils/event-bus'
import { createRendererLogger } from '../utils/logger'
import { getSetting } from '../utils/settings'
import localIpcRenderer from '../utils/web-adapter/local-ipc-renderer'
import { webMainCalls } from '../utils/web-adapter/web-main-calls'
import { themeState } from '../utils/themes'
import { ParticleEffect } from '../utils/particle-effect'
import type { IpcRendererLike } from '../utils/particle-effect'
import { extractPlainTextFromLatex } from '../utils/latex-utils'
import { getRecentDocs } from '../utils/settings'
import { Document } from '@element-plus/icons-vue'
import { basename } from '../utils/path-utils'

const { t } = useI18n()

const maybeWindow =
  typeof window !== 'undefined'
    ? (window as Window & { electron?: { ipcRenderer?: IpcRendererLike } })
    : undefined

const quickStartStage = ref<'inactive' | 'format' | 'markdown' | 'latex'>('inactive')
const recentDocs = ref<string[]>([])
const showWelcome = computed(() => quickStartStage.value === 'inactive')

const highlightM = () => {
  const el = document.querySelector('.main-letter') as HTMLElement | null
  if (el) el.style.color = 'rgb(50, 150, 250)'
}

const resetM = () => {
  const el = document.querySelector('.main-letter') as HTMLElement | null
  if (el) el.style.color = 'rgb(65,105,225)'
}

const openQuickStart = () => {
  eventBus.emit('reset-quickstart')
  eventBus.emit('open-quickstart')
  quickStartStage.value = 'format'
}

const handleQuickStartClose = () => {
  quickStartStage.value = 'inactive'
  eventBus.emit('reset-quickstart')
}

const openFile = () => {
  eventBus.emit('open-doc')
}

// 获取文件名
const getFileName = (filePath: string): string => {
  if (!filePath) return ''
  try {
    return basename(filePath)
  } catch (error) {
    const segments = filePath.split(/[/\\]+/).filter(Boolean)
    return segments[segments.length - 1] || filePath
  }
}

// 打开最近文档
const openRecentDoc = (filePath: string) => {
  eventBus.emit('open-doc', filePath)
}

// 粒子效果初始化
const logger = createRendererLogger('GlobalHome')

// 加载最近文档列表
const loadRecentDocs = async () => {
  try {
    recentDocs.value = await getRecentDocs()
  } catch (error) {
    logger.warn('加载最近文档失败', error)
    recentDocs.value = []
  }
}

// 定义事件处理器
const handleDocOpenSuccess = () => {
  loadRecentDocs()
}

const handleDocOpen = () => {
  // 延迟一下，确保更新完成
  setTimeout(() => {
    loadRecentDocs()
  }, 100)
}

let ipcRenderer: IpcRendererLike | null = null
if (maybeWindow?.electron?.ipcRenderer) {
  ipcRenderer = maybeWindow.electron.ipcRenderer
} else {
  webMainCalls()
  ipcRenderer = localIpcRenderer as IpcRendererLike
}

// 初始化粒子效果（使用空文本，因为这是全局主页，不需要文档内容）
const particleEffectInstance = new ParticleEffect({
  logger,
  eventBus,
  getSetting,
  ipcRenderer,
  particleMarkdown: computed(() => ''),
  extractPlainTextFromLatex,
  containerId: 'particle-bg'
})

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

  // 监听 quickStartPanel 的状态变化
  eventBus.on('open-quickstart', () => {
    quickStartStage.value = 'format'
  })

  // 加载最近文档列表
  loadRecentDocs()

  // 监听文档打开成功事件，刷新最近文档列表
  eventBus.on('open-doc-success', handleDocOpenSuccess)

  // 监听文档打开事件，也刷新列表
  eventBus.on('open-doc', handleDocOpen)
})

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', (e) => particleEffectInstance.handleMouseMove(e))
  window.removeEventListener('resize', () => particleEffectInstance.handleWindowResize())
  particleEffectInstance.dispose()
  eventBus.off('open-quickstart')
  eventBus.off('open-doc-success', handleDocOpenSuccess)
  eventBus.off('open-doc', handleDocOpen)
})
</script>

<style scoped>
#particle-bg {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  z-index: 0;
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

.homepage :deep(.quick-start-panel),
.homepage :deep(.quick-start-markdown),
.homepage :deep(.quick-start-latex) {
  position: relative;
  z-index: 1;
}

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
  width: 100%;
  height: 100%;
  position: relative;
  z-index: 1;
}

.center-content-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  min-height: 100%;
  padding: 16px 24px;
  box-sizing: border-box;
}

.center-content :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
  overflow-y: auto;
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
  width: 100%;
}

.recent-docs-scrollbar :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
  overflow-y: auto;
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

