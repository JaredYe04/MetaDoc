<template>
  <div id="particle-bg" class="homepage">
    <!-- 渐变背景叠加层 -->
    <div class="gradient-overlay"></div>
    
    <el-scrollbar class="center-content">
      <div class="center-content-wrapper">
        <!-- 主标题区域 -->
        <div v-if="showWelcome" class="hero-section">
          <div class="title-container">
            <h1 class="main-title" @mouseover="highlightM" @mouseleave="resetM">
              {{ $t('home.metaDoc') }}
            </h1>
            <p class="subtitle" :style="{ color: themeState.currentTheme.textColor2 || 'rgba(0, 0, 0, 0.6)' }">
              {{ $t('home.subtitle') || '现代文档编辑与创作工具' }}
            </p>
          </div>
        </div>

        <!-- 操作按钮区域 -->
        <div v-if="showWelcome" class="action-section">
          <div class="action-card aero-div" @click="openQuickStart">
            <div class="action-icon primary">
              <el-icon :size="32">
                <InfoFilled />
              </el-icon>
            </div>
            <div class="action-content">
              <h3 class="action-title">{{ $t('home.button.quickStart') }}</h3>
              <p class="action-desc">{{ $t('home.tooltip.quickStart') || '快速开始使用' }}</p>
            </div>
            <el-icon class="action-arrow" :size="20">
              <ArrowRight />
            </el-icon>
          </div>

          <div class="action-card aero-div" @click="openFile">
            <div class="action-icon success">
              <el-icon :size="32">
                <FolderOpened />
              </el-icon>
            </div>
            <div class="action-content">
              <h3 class="action-title">{{ $t('home.button.openFile') }}</h3>
              <p class="action-desc">{{ $t('home.tooltip.openFile') || '打开现有文档' }}</p>
            </div>
            <el-icon class="action-arrow" :size="20">
              <ArrowRight />
            </el-icon>
          </div>
        </div>

        <!-- 最近文档列表 -->
        <div v-if="showWelcome && recentDocs.length > 0" class="recent-section">
          <div class="recent-header">
            <h3 class="recent-title" :style="{ color: themeState.currentTheme.textColor }">
              <el-icon class="recent-title-icon"><Document /></el-icon>
              {{ $t('home.recentDocuments') || '最近文档' }}
            </h3>
          </div>
          <div class="recent-docs-grid">
            <div 
              v-for="(docPath, index) in recentDocs.slice(0, 12)" 
              :key="docPath" 
              class="recent-doc-card aero-div"
              :style="{ 
                animationDelay: `${index * 0.025}s`,
                borderColor: themeState.currentTheme.borderColor || 'rgba(0, 0, 0, 0.1)'
              }"
              @click="openRecentDoc(docPath)"
            >
              <div class="doc-card-icon">
                <el-icon :size="24"><Document /></el-icon>
              </div>
              <div class="doc-card-content">
                <span class="doc-card-name" :style="{ color: themeState.currentTheme.textColor }">
                  {{ getFileName(docPath) }}
                </span>
              </div>
              <el-button
                class="doc-card-delete-btn"
                circle
                size="small"
                :icon="Close"
                text
                @click.stop="removeRecentDoc(docPath)"
                :style="{ color: themeState.currentTheme.textColor }"
              />
              <div class="doc-card-hover-effect"></div>
            </div>
          </div>
        </div>
      </div>
    </el-scrollbar>

    <QuickStartPanel v-if="quickStartStage !== 'inactive'" @close="handleQuickStartClose" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, onActivated } from 'vue'
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
import { themeState, mixColors } from '../utils/themes'
import { ParticleEffect } from '../utils/particle-effect'
import type { IpcRendererLike } from '../utils/particle-effect'
import { extractPlainTextFromLatex } from '../utils/latex-utils'
import { getRecentDocs, removeRecentDoc as removeRecentDocFromStorage } from '../utils/settings'
import { Document, InfoFilled, FolderOpened, ArrowRight, Close } from '@element-plus/icons-vue'
import { basename } from '../utils/path-utils'

const { t } = useI18n()

// 计算主页背景色：与themeState.background混合
const homepageBackgroundColor = computed(() => {
  const baseBackground = themeState.currentTheme.background
  const isDark = themeState.currentTheme.type === 'dark'
  
  // 检查 baseBackground 是否接近纯白色（用于亮色模式）
  const isNearWhite = (color: string) => {
    try {
      const rgb = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color)
      if (rgb) {
        const r = parseInt(rgb[1], 16)
        const g = parseInt(rgb[2], 16)
        const b = parseInt(rgb[3], 16)
        // 如果 RGB 值都大于 250，认为是接近白色
        return r > 250 && g > 250 && b > 250
      }
    } catch {
      // 解析失败，返回 false
    }
    return false
  }
  
  if (isDark) {
    // 暗色模式：混合白色，让背景稍微提亮但保持暗色特征
    // 使用较小的权重，避免过亮
    return mixColors(baseBackground, '#ffffff', 0.12)
  } else {
    // 亮色模式
    if (isNearWhite(baseBackground)) {
      // 如果背景接近白色，使用主题的 primaryColor 或其他颜色与白色混合
      // 这样可以确保有主题色特征
      const themeColor = themeState.currentTheme.primaryColor || themeState.currentTheme.textColor || '#6366f1'
      // 先将主题色与白色混合（让主题色变淡），然后再与背景色混合
      const lightThemeColor = mixColors(themeColor, '#ffffff', 0.85)
      return mixColors(baseBackground, lightThemeColor, 0.3)
    } else {
      // 如果背景已经有颜色，直接与白色混合
      return mixColors(baseBackground, '#ffffff', 0.25)
    }
  }
})

// 根据主题类型计算标题渐变色
const titleGradient = computed(() => {
  const isDark = themeState.currentTheme.type === 'dark'
  
  if (isDark) {
    // 暗色主题：使用更亮的渐变色，确保在暗色背景下足够明显
    return 'linear-gradient(135deg, rgb(100, 150, 255) 0%, rgb(120, 140, 255) 50%, rgb(160, 120, 255) 100%)'
  } else {
    // 亮色主题：使用原有的渐变色
    return 'linear-gradient(135deg, rgb(65, 105, 225) 0%, rgb(99, 102, 241) 50%, rgb(139, 92, 246) 100%)'
  }
})

// 根据主题类型计算标题阴影效果
const titleTextShadow = computed(() => {
  const isDark = themeState.currentTheme.type === 'dark'
  if (isDark) {
    // 暗色主题：使用更深的阴影，增强对比度
    return '0 4px 8px rgba(0, 0, 0, 0.25), 0 8px 16px rgba(0, 0, 0, 0.15), 0 2px 4px rgba(99, 102, 241, 0.3)'
  }
  //亮色主题不使用阴影
  return 'none'
})


const maybeWindow =
  typeof window !== 'undefined'
    ? (window as Window & { electron?: { ipcRenderer?: IpcRendererLike } })
    : undefined

const quickStartStage = ref<'inactive' | 'format' | 'markdown' | 'latex'>('inactive')
const recentDocs = ref<string[]>([])
const showWelcome = computed(() => quickStartStage.value === 'inactive')

const highlightM = () => {
  const el = document.querySelector('.main-title') as HTMLElement | null
  if (el) el.style.color = 'rgb(50, 150, 250)'
}

const resetM = () => {
  const el = document.querySelector('.main-title') as HTMLElement | null
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

// 删除最近文档
const removeRecentDoc = async (filePath: string) => {
  try {
    await removeRecentDocFromStorage(filePath)
    await loadRecentDocs() // 重新加载列表
    logger.debug('删除最近文档成功', { filePath })
  } catch (error) {
    logger.warn('删除最近文档失败', error)
  }
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

// 获取最后一个打开文档的内容用于粒子效果
const lastDocumentText = ref('')

// 监听文档打开事件，获取文档内容用于粒子效果
const updateLastDocumentText = async () => {
  try {
    // 先尝试从 workspace 获取当前打开的文档
    const { useWorkspace } = await import('../stores/workspace')
    const workspace = useWorkspace()
    const tabs = workspace.tabs
    
    // 查找最近打开的文件类型的 tab
    const fileTab = tabs.find(t => t.kind === 'file' && t.path)
    if (fileTab) {
      const doc = workspace.ensureDocument(fileTab.id)
      if (doc) {
        // 根据文档格式选择文本源
        if (doc.format === 'tex') {
          lastDocumentText.value = doc.tex ?? ''
        } else {
          lastDocumentText.value = doc.markdown ?? ''
        }
        return
      }
    }
    
    // 如果 workspace 中没有打开的文档，尝试从最近文档列表读取
    const docs = await getRecentDocs()
    if (docs.length > 0 && ipcRenderer?.invoke) {
      const lastDocPath = docs[0]
      try {
        const content = await ipcRenderer.invoke('read-file-content', lastDocPath) as string
        lastDocumentText.value = content || ''
      } catch (error) {
        logger.warn('读取文档内容失败', error)
        lastDocumentText.value = ''
      }
    } else {
      lastDocumentText.value = ''
    }
  } catch (error) {
    logger.warn('更新文档文本失败', error)
    lastDocumentText.value = ''
  }
}

// 初始化粒子效果（使用最后一个打开文档的内容）
const particleEffectInstance = new ParticleEffect({
  logger,
  eventBus,
  getSetting,
  ipcRenderer,
  particleMarkdown: computed(() => lastDocumentText.value),
  extractPlainTextFromLatex,
  containerId: 'particle-bg'
})

const scheduleParticleEffect = () => {
  const runner = async () => {
    // 先更新文档文本
    await updateLastDocumentText()
    // 然后初始化粒子效果
    await particleEffectInstance.init()
    // 触发粒子效果启用事件
    eventBus.emit('toggle-particle-effect', {})
  }
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(() => runner().catch((err) => logger.warn('粒子效果初始化失败', err)))
  } else {
    setTimeout(() => runner().catch((err) => logger.warn('粒子效果初始化失败', err)), 0)
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

  // 监听粒子效果切换事件，确保在设置改变时能实时响应
  // 粒子效果类已经监听了 toggle-particle-effect 事件，这里只需要确保事件能传递到粒子效果类
  // 当收到 toggle-particle-effect 事件时，粒子效果类会自动检查设置并更新显示

  // 加载最近文档列表
  loadRecentDocs()

  // 监听文档打开成功事件，刷新最近文档列表和更新粒子效果文本
  eventBus.on('open-doc-success', () => {
    handleDocOpenSuccess()
    // 延迟一下，确保文档已加载
    setTimeout(() => {
      updateLastDocumentText().then(() => {
        // 更新后重新创建粒子
        if (particleEffectInstance) {
          eventBus.emit('toggle-particle-effect', {})
        }
      })
    }, 500)
  })

  // 监听文档打开事件，也刷新列表
  eventBus.on('open-doc', handleDocOpen)
})

// 当组件激活时（Tab 切换回来时），重新检查粒子效果设置
onActivated(async () => {
  // 确保粒子效果已初始化
  if (particleEffectInstance) {
    // 先初始化粒子效果（如果还没有初始化的话）
    await particleEffectInstance.init()
    // 触发粒子效果检查，确保设置改变时能实时响应
    eventBus.emit('toggle-particle-effect', {})
  }
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
  /* 背景色设置在 .homepage 上，这里不设置避免覆盖 */
}

.homepage {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  /* 背景色直接设置在这里，确保优先级 */
  background-color: v-bind('homepageBackgroundColor');
}

/* 确保 #particle-bg 也应用背景色（因为它是同一个元素） */
#particle-bg.homepage {
  background-color: v-bind('homepageBackgroundColor');
}

.homepage :deep(.quick-start-panel-wrapper) {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 10;
  pointer-events: none;
}

.homepage :deep(.quick-start-panel-wrapper > *) {
  pointer-events: auto;
}

.homepage :deep(.quick-start-panel),
.homepage :deep(.quick-start-markdown),
.homepage :deep(.quick-start-latex) {
  position: relative;
  z-index: 10;
}

/* 渐变背景叠加层 */
.gradient-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: radial-gradient(circle at 20% 50%, rgba(99, 102, 241, 0.1) 0%, transparent 50%),
              radial-gradient(circle at 80% 80%, rgba(139, 92, 246, 0.1) 0%, transparent 50%),
              radial-gradient(circle at 40% 20%, rgba(59, 130, 246, 0.08) 0%, transparent 50%);
  z-index: 1;
  pointer-events: none;
}

#particle-bg canvas {
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
  width: 100% !important;
  height: 100% !important;
  z-index: 1 !important;
  pointer-events: none !important;
  background: transparent !important;
}

.center-content {
  width: 100%;
  height: 100%;
  position: relative;
  z-index: 2;
}

.center-content-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: clamp(24px, 4vh, 48px);
  min-height: 100%;
  padding: clamp(24px, 5vh, 64px) clamp(20px, 4vw, 48px);
  box-sizing: border-box;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
}

.center-content :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
  overflow-y: auto;
}

/* 主标题区域 */
.hero-section {
  width: 100%;
  text-align: center;
  margin-bottom: clamp(16px, 3vh, 32px);
  animation: fadeInUp 0.4s ease-out;
}

.title-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.main-title {
  font-size: clamp(42px, 8vw, 72px);
  font-weight: 700;
  background: v-bind('titleGradient');
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin: 0;
  padding: 0;
  transition: transform 0.3s ease, filter 0.3s ease;
  letter-spacing: -0.02em;
  line-height: 1.2;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  text-shadow: v-bind('titleTextShadow');
}

.main-title:hover {
  transform: scale(1.02);
  filter: brightness(1.1);
  text-shadow: v-bind('titleTextShadow');
}

.subtitle {
  font-size: clamp(16px, 2.5vw, 20px);
  font-weight: 400;
  margin: 0;
  padding: 0;
  opacity: 0.8;
  letter-spacing: 0.01em;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

/* 操作按钮区域 */
.action-section {
  width: 100%;
  max-width: 700px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
  margin-bottom: clamp(16px, 3vh, 32px);
  animation: fadeInUp 0.4s ease-out 0.1s both;
}

.action-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 24px;
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0, 0, 0, 0.1)"');
  background: v-bind('themeState.currentTheme.background2nd || "rgba(255, 255, 255, 0.6)"');
  overflow: hidden;
  user-select: none;
}

.action-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(139, 92, 246, 0.05) 100%);
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
}

.action-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.15), 0 4px 8px rgba(0, 0, 0, 0.1);
}

.action-card:hover::before {
  opacity: 1;
}

.action-card:active {
  transform: translateY(-2px);
}

.action-icon {
  flex-shrink: 0;
  width: 64px;
  height: 64px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
}

.action-icon.primary {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(99, 102, 241, 0.15) 100%);
  color: rgb(59, 130, 246);
}

.action-icon.success {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(16, 185, 129, 0.15) 100%);
  color: rgb(34, 197, 94);
}

.action-card:hover .action-icon {
  transform: scale(1.1) rotate(5deg);
}

.action-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.action-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  padding: 0;
  color: v-bind('themeState.currentTheme.textColor');
  line-height: 1.4;
}

.action-desc {
  font-size: 14px;
  margin: 0;
  padding: 0;
  color: v-bind('themeState.currentTheme.textColor2 || "rgba(0, 0, 0, 0.6)"');
  opacity: 0.8;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-arrow {
  flex-shrink: 0;
  color: v-bind('themeState.currentTheme.textColor2 || "rgba(0, 0, 0, 0.4)"');
  transition: all 0.3s ease;
  opacity: 0.6;
}

.action-card:hover .action-arrow {
  transform: translateX(4px);
  opacity: 1;
}

/* 最近文档区域 */
.recent-section {
  width: 100%;
  max-width: 1200px;
  animation: fadeInUp 0.4s ease-out 0.2s both;
}

.recent-header {
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.recent-title {
  font-size: clamp(18px, 2.5vw, 22px);
  font-weight: 600;
  margin: 0;
  padding: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  color: v-bind('themeState.currentTheme.textColor');
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

.recent-title-icon {
  font-size: 20px;
}

.recent-docs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.recent-doc-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid;
  background: v-bind('themeState.currentTheme.background2nd || "rgba(255, 255, 255, 0.6)"');
  overflow: visible;
  user-select: none;
  animation: fadeInScale 0.25s ease-out both;
}

.recent-doc-card:hover {
  transform: translateY(-2px);
}

.doc-card-icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%);
  color: rgb(99, 102, 241);
  transition: all 0.3s ease;
}

.recent-doc-card:hover .doc-card-icon {
  transform: scale(1.1);
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(139, 92, 246, 0.2) 100%);
}

.doc-card-content {
  flex: 1;
  min-width: 0;
}

.doc-card-name {
  font-size: 14px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
  color: v-bind('themeState.currentTheme.textColor');
}

.doc-card-delete-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  opacity: 0;
  transition: opacity 0.2s ease;
  z-index: 10;
  flex-shrink: 0;
}

.recent-doc-card:hover .doc-card-delete-btn {
  opacity: 0.7;
}

.doc-card-delete-btn:hover {
  opacity: 1 !important;
}

.doc-card-hover-effect {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.05), transparent);
  transition: transform 0.5s ease;
  pointer-events: none;
  
}

/* 动画 */
@keyframes fadeInUp {
  from {
    opacity: 0;

  }
  to {
    opacity: 1;

  }
}

@keyframes fadeInScale {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* 响应式设计 */
@media (max-width: 768px) {
  .action-section {
    grid-template-columns: 1fr;
  }
  
  .recent-docs-grid {
    grid-template-columns: 1fr;
  }
  
  .action-card {
    padding: 20px;
  }
}

@media (max-width: 480px) {
  .center-content-wrapper {
    padding: 20px 16px;
  }
  
  .action-icon {
    width: 56px;
    height: 56px;
  }
  
  .action-icon svg {
    width: 28px;
    height: 28px;
  }
}
</style>

