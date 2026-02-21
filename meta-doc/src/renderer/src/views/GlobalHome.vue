<template>
  <div id="particle-bg" class="homepage">
    <!-- 动态背景动画 -->
    <DynamicBackgroundAnimation />
    
    <!-- 极简网格装饰 -->
    <div class="grid-decoration"></div>

    <ScrollArea class="center-content">
      <div class="center-content-wrapper">
        <!-- METADOC 扭曲文字 Banner -->
        <div v-if="showWelcome" class="hero-section">
          <div class="distortion-wrapper">
            <DistortionBanner />
          </div>
          <p class="subtitle">
            {{ $t('home.subtitle') || '现代文档编辑与创作工具' }}
          </p>
        </div>

        <!-- 操作按钮区域 -->
        <div v-if="showWelcome" class="action-section">
          <div class="action-card" @click="openQuickStart">
            <div class="action-icon">
              <Info class="w-5 h-5" />
            </div>
            <div class="action-content">
              <h3 class="action-title">{{ $t('home.button.quickStart') }}</h3>
              <p class="action-desc">{{ $t('home.tooltip.quickStart') || '快速开始使用' }}</p>
            </div>
            <ChevronRight class="w-4 h-4" />
          </div>

          <div class="action-card" @click="openNewDoc">
            <div class="action-icon">
              <FilePlus class="w-5 h-5" />
            </div>
            <div class="action-content">
              <h3 class="action-title">{{ $t('home.button.newDoc') }}</h3>
              <p class="action-desc">{{ $t('home.tooltip.newDoc') || '创建一篇新文档' }}</p>
            </div>
            <ChevronRight class="w-4 h-4" />
          </div>

          <div class="action-card" @click="openFile">
            <div class="action-icon">
              <FolderOpen class="w-5 h-5" />
            </div>
            <div class="action-content">
              <h3 class="action-title">{{ $t('home.button.openFile') }}</h3>
              <p class="action-desc">{{ $t('home.tooltip.openFile') || '打开现有文档' }}</p>
            </div>
            <ChevronRight class="w-4 h-4" />
          </div>

          <div 
            class="action-card manual-card" 
            :class="{ 'highlight-pulse': showManualHighlight }"
            @click="openUserManual"
          >
            <div class="action-icon">
              <BookOpen class="w-5 h-5" />
            </div>
            <div class="action-content">
              <h3 class="action-title">{{ $t('home.button.userManual') || '用户手册' }}</h3>
              <p class="action-desc">{{ $t('home.tooltip.userManual') || '学习如何使用MetaDoc' }}</p>
            </div>
            <ChevronRight class="w-4 h-4" />
          </div>
        </div>

        <!-- 最近文档列表 -->
        <div v-if="showWelcome && recentDocs.length > 0" class="recent-section">
          <div class="recent-header">
            <h3 class="recent-title">
              <FileText class="w-4 h-4" />
              {{ $t('home.recentDocuments') || '最近文档' }}
            </h3>
          </div>
          <div class="recent-docs-container">
            <div class="recent-docs-grid">
              <div
                v-for="(docPath, index) in recentDocs.slice(0, 12)"
                :key="docPath"
                class="recent-doc-card"
                :style="{ animationDelay: `${index * 0.03}s` }"
                @click="openRecentDoc(docPath)"
              >
                <div class="doc-card-indicator"></div>
                <span class="doc-card-name">
                  {{ getFileName(docPath) }}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  class="doc-card-delete-btn h-6 w-6 rounded-full"
                  @click.stop="removeRecentDoc(docPath)"
                >
                  <Close class="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <ScrollBar />
    </ScrollArea>

    <QuickStartPanel v-if="quickStartStage !== 'inactive'" @close="handleQuickStartClose" />
    <UserProfileDialog ref="profileDialogRef" @submitted="handleProfileSubmitted" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, onActivated } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@renderer/components/ui/button'
import QuickStartPanel from '../components/home/QuickStartPanel.vue'
import DistortionBanner from '../components/home/DistortionBanner.vue'
import DynamicBackgroundAnimation from '../components/home/DynamicBackgroundAnimation.vue'
import '../assets/aero-div.css'
import '../assets/aero-btn.css'
import '../assets/aero-input.css'
import { ScrollArea, ScrollBar } from '@renderer/components/ui/scroll-area'
import eventBus from '../utils/event-bus'
import { createRendererLogger } from '../utils/logger'
// 粒子效果相关代码已注释，以备后用
// import { getSetting } from '../utils/settings'
import { themeState, mixColors } from '../utils/themes'
// 粒子效果相关代码已注释，以备后用
// import { ParticleEffect } from '../utils/particle-effect'
// import { extractPlainTextFromLatex } from '../utils/latex-utils'
import { getRecentDocs, removeRecentDoc as removeRecentDocFromStorage } from '../utils/settings'
import {
  FileText,
  Info,
  FolderOpen,
  ArrowRight,
  X,
  FilePlus,
  BookOpen
} from 'lucide-vue-next'
import { basename, extname } from '../utils/path-utils'
import { formatRegistry } from '../utils/format-registry'
import { hasCompletedProfile } from '../utils/user-profile'
import { useWorkspace } from '../stores/workspace'
import UserProfileDialog from '../components/manual/UserProfileDialog.vue'

const { t } = useI18n()

// 计算主页背景色：极简干净
const homepageBackgroundColor = computed(() => {
  const baseBackground = themeState.currentTheme.background
  const isDark = themeState.currentTheme.type === 'dark'

  if (isDark) {
    return mixColors(baseBackground, '#111111', 0.3)
  } else {
    return mixColors(baseBackground, '#fafafa', 0.5)
  }
})

const quickStartStage = ref<'inactive' | 'format' | 'markdown' | 'latex'>('inactive')
const recentDocs = ref<string[]>([])
const showWelcome = computed(() => quickStartStage.value === 'inactive')
const showManualHighlight = ref(false)
const profileDialogRef = ref<InstanceType<typeof UserProfileDialog> | null>(null)
const workspace = useWorkspace()

const openQuickStart = () => {
  eventBus.emit('reset-quickstart')
  eventBus.emit('open-quickstart')
  quickStartStage.value = 'format'
}

const handleQuickStartClose = () => {
  quickStartStage.value = 'inactive'
  eventBus.emit('reset-quickstart')
}

const openNewDoc = () => {
  eventBus.emit('new-doc')
}

const openFile = () => {
  eventBus.emit('open-doc')
}

const openUserManual = () => {
  workspace.openSystemTab('/user-manual', t('userManual.title') || '用户手册')
  // 如果首次使用，显示问卷
  checkAndShowProfileDialog()
}

const checkAndShowProfileDialog = async () => {
  const completed = await hasCompletedProfile()
  if (!completed && profileDialogRef.value) {
    profileDialogRef.value.open()
  }
}

const handleProfileSubmitted = () => {
  showManualHighlight.value = false
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

// 打开最近文档：与工作区树一致，使用 workspace-open-document，以便已打开时 focus 到对应 tab
const openRecentDoc = (filePath: string) => {
  const fileExt = extname(filePath)
  const formatId = formatRegistry.getFormatByExtension(fileExt) || 'txt'
  eventBus.emit('workspace-open-document', {
    path: filePath,
    format: formatId,
    content: '',
    preview: false
  })
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

// 粒子效果相关代码已注释，以备后用
// // 获取最后一个打开文档的内容用于粒子效果
// const lastDocumentText = ref('')

// // 监听文档打开事件，获取文档内容用于粒子效果
// const updateLastDocumentText = async () => {
//   try {
//     // 先尝试从 workspace 获取当前打开的文档
//     const { useWorkspace } = await import('../stores/workspace')
//     const workspace = useWorkspace()
//     const tabs = workspace.tabs

//     // 查找最近打开的文件类型的 tab
//     const fileTab = tabs.find((t) => t.kind === 'file' && t.path)
//     if (fileTab) {
//       const doc = workspace.ensureDocument(fileTab.id)
//       if (doc) {
//         // 根据文档格式选择文本源
//         if (doc.format === 'tex') {
//           lastDocumentText.value = doc.tex ?? ''
//         } else {
//           lastDocumentText.value = doc.markdown ?? ''
//         }
//         return
//       }
//     }

//     // 如果 workspace 中没有打开的文档，尝试从最近文档列表读取
//     const docs = await getRecentDocs()
//     if (docs.length > 0 && ipcRenderer?.invoke) {
//       const lastDocPath = docs[0]
//       try {
//         const content = (await ipcRenderer.invoke('read-file-content', lastDocPath)) as string
//         lastDocumentText.value = content || ''
//       } catch (error) {
//         logger.warn('读取文档内容失败', error)
//         lastDocumentText.value = ''
//       }
//     } else {
//       lastDocumentText.value = ''
//     }
//   } catch (error) {
//     logger.warn('更新文档文本失败', error)
//     lastDocumentText.value = ''
//   }
// }

// // 初始化粒子效果（使用最后一个打开文档的内容）
// const particleEffectInstance = new ParticleEffect({
//   logger,
//   eventBus,
//   getSetting,
//   ipcRenderer,
//   particleMarkdown: computed(() => lastDocumentText.value),
//   extractPlainTextFromLatex,
//   containerId: 'particle-bg'
// })

// const scheduleParticleEffect = () => {
//   const runner = async () => {
//     // 先更新文档文本
//     await updateLastDocumentText()
//     // 然后初始化粒子效果
//     await particleEffectInstance.init()
//     // 触发粒子效果启用事件
//     eventBus.emit('toggle-particle-effect', {})
//   }
//   if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
//     window.requestIdleCallback(() =>
//       runner().catch((err) => logger.warn('粒子效果初始化失败', err))
//     )
//   } else {
//     setTimeout(() => runner().catch((err) => logger.warn('粒子效果初始化失败', err)), 0)
//   }
// }

onMounted(async () => {
  // 粒子效果相关代码已注释，以备后用
  // scheduleParticleEffect()
  // window.addEventListener('mousemove', (e) => particleEffectInstance.handleMouseMove(e))
  // window.addEventListener('resize', () => particleEffectInstance.handleWindowResize())

  // 监听 quickStartPanel 的状态变化
  eventBus.on('open-quickstart', () => {
    quickStartStage.value = 'format'
  })

  // 监听粒子效果切换事件，确保在设置改变时能实时响应
  // 粒子效果类已经监听了 toggle-particle-effect 事件，这里只需要确保事件能传递到粒子效果类
  // 当收到 toggle-particle-effect 事件时，粒子效果类会自动检查设置并更新显示

  // 加载最近文档列表
  loadRecentDocs()

  // 检查是否首次使用，显示高亮动画
  const completed = await hasCompletedProfile()
  if (!completed) {
    showManualHighlight.value = true
  }

  // 监听文档打开成功事件，刷新最近文档列表和更新粒子效果文本
  eventBus.on('open-doc-success', () => {
    handleDocOpenSuccess()
    // 粒子效果相关代码已注释，以备后用
    // // 延迟一下，确保文档已加载
    // setTimeout(() => {
    //   updateLastDocumentText().then(() => {
    //     // 更新后重新创建粒子
    //     if (particleEffectInstance) {
    //       eventBus.emit('toggle-particle-effect', {})
    //     }
    //   })
    // }, 500)
  })

  // 监听文档打开事件，也刷新列表
  eventBus.on('open-doc', handleDocOpen)
})

// 当组件激活时（Tab 切换回来时），重新检查粒子效果设置
// 粒子效果相关代码已注释，以备后用
// onActivated(async () => {
//   // 确保粒子效果已初始化
//   if (particleEffectInstance) {
//     // 先初始化粒子效果（如果还没有初始化的话）
//     await particleEffectInstance.init()
//     // 触发粒子效果检查，确保设置改变时能实时响应
//     eventBus.emit('toggle-particle-effect', {})
//   }
// })

onBeforeUnmount(() => {
  // 粒子效果相关代码已注释，以备后用
  // window.removeEventListener('mousemove', (e) => particleEffectInstance.handleMouseMove(e))
  // window.removeEventListener('resize', () => particleEffectInstance.handleWindowResize())
  // particleEffectInstance.dispose()
  eventBus.off('open-quickstart')
  eventBus.off('open-doc-success', handleDocOpenSuccess)
  eventBus.off('open-doc', handleDocOpen)
})
</script>

<style scoped>
/* ===== 基础布局 ===== */
#particle-bg {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  z-index: 0;
}

.homepage {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: v-bind('homepageBackgroundColor');
}

#particle-bg.homepage {
  background-color: v-bind('homepageBackgroundColor');
}

/* 极简网格装饰：淡淡的背景网格增加科技感 */
.grid-decoration {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-image:
    linear-gradient(
      v-bind(
          'themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)"'
        )
        1px,
      transparent 1px
    ),
    linear-gradient(
      90deg,
      v-bind(
          'themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)"'
        )
        1px,
      transparent 1px
    );
  background-size: 64px 64px;
  z-index: 0;
  pointer-events: none;
  mask-image: radial-gradient(ellipse 70% 60% at 50% 40%, black 10%, transparent 70%);
  -webkit-mask-image: radial-gradient(ellipse 70% 60% at 50% 40%, black 10%, transparent 70%);
}

/* QuickStart 面板层级 */
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

/* 粒子效果相关代码已注释，以备后用 */
/* 粒子画布（排除 DistortionBanner 的 canvas） */
/* #particle-bg > canvas {
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
  width: 100% !important;
  height: 100% !important;
  z-index: 1 !important;
  pointer-events: none !important;
  background: transparent !important;
} */

/* ===== 内容容器 ===== */
.center-content {
  width: 100%;
  height: 100%;
  position: relative;
  z-index: 2;
}

.center-content :deep([data-radix-scroll-area-viewport]) {
  overflow-x: hidden;
  overflow-y: auto;
}

.center-content-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: clamp(20px, 3vh, 36px);
  min-height: 100%;
  padding: clamp(16px, 3vh, 40px) clamp(24px, 5vw, 64px);
  box-sizing: border-box;
  width: 100%;
}

/* ===== DistortionBanner 区域 ===== */
.hero-section {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  animation: fadeIn 0.5s ease-out;
}

.distortion-wrapper {
  width: 100%;
  max-width: 1400px;
  height: clamp(110px, 20vh, 200px);
}

.subtitle {
  font-size: clamp(16px, 2.5vw, 22px);
  font-weight: 500;
  margin: 0;
  padding: 0;
  color: v-bind('themeState.currentTheme.textColor');
  opacity: 0.45;
  letter-spacing: 0.1em;
  user-select: none;
  -webkit-user-select: none;
}

/* ===== 操作卡片区域 ===== */
.action-section {
  width: 100%;
  max-width: 820px;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  animation: fadeIn 0.5s ease-out 0.08s both;
}

.action-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid
    v-bind(
      'themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"'
    );
  background: v-bind(
    'themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.6)"'
  );
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  user-select: none;
  overflow: hidden;
}

.action-card::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  border-radius: 10px;
  opacity: 0;
  transition: opacity 0.2s ease;
  background: v-bind(
    'themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)"'
  );
  pointer-events: none;
}

.action-card:hover {
  border-color: v-bind(
    'themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)"'
  );
  transform: translateY(-2px);
  box-shadow: 0 4px 12px
    v-bind('themeState.currentTheme.type === "dark" ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.06)"');
}

.action-card:hover::after {
  opacity: 1;
}

.action-card:active {
  transform: translateY(-1px);
}

.action-icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: v-bind(
    'themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"'
  );
  color: v-bind(
    'themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.45)"'
  );
  transition: all 0.2s ease;
}

.action-card:hover .action-icon {
  background: v-bind(
    'themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)"'
  );
  color: v-bind(
    'themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.8)" : "rgba(0,0,0,0.6)"'
  );
}

.action-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.action-title {
  font-size: 14px;
  font-weight: 500;
  margin: 0;
  padding: 0;
  color: v-bind('themeState.currentTheme.textColor');
  line-height: 1.4;
}

.action-desc {
  font-size: 12px;
  margin: 0;
  padding: 0;
  color: v-bind('themeState.currentTheme.textColor2 || "rgba(0,0,0,0.5)"');
  opacity: 0.6;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-arrow {
  flex-shrink: 0;
  color: v-bind('themeState.currentTheme.textColor2 || "rgba(0,0,0,0.3)"');
  transition: all 0.2s ease;
  opacity: 0;
}

.action-card:hover .action-arrow {
  transform: translateX(3px);
  opacity: 0.5;
}

/* ===== 最近文档区域 ===== */
.recent-section {
  width: 100%;
  max-width: 820px;
  animation: fadeIn 0.5s ease-out 0.15s both;
}

.recent-header {
  margin-bottom: 16px;
  display: flex;
  align-items: center;
}

.recent-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  padding: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  color: v-bind('themeState.currentTheme.textColor');
  user-select: none;
  -webkit-user-select: none;
}

.recent-title-icon {
  font-size: 18px;
  opacity: 0.7;
}

/* 列表容器 */
.recent-docs-container {
  border-radius: 10px;
  border: 1px solid
    v-bind(
      'themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)"'
    );
  background-color: v-bind(
    'themeState.currentTheme.type === "dark" ? "rgb(40,40,42)" : "rgb(255,255,255)"'
  );
  box-shadow: v-bind(
    'themeState.currentTheme.type === "dark" ? "0 2px 8px rgba(0,0,0,0.3)" : "0 1px 4px rgba(0,0,0,0.04)"'
  );
  overflow: hidden;
}

.recent-docs-grid {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.recent-doc-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 16px;
  cursor: pointer;
  transition: all 0.05s ease;
  background: v-bind(
    'themeState.currentTheme.type === "dark" ? "rgb(40,40,42)" : "rgb(255,255,255)"'
  );
  user-select: none;
  animation: fadeIn 0.3s ease-out both;
  border-bottom: 1px solid
    v-bind(
      'themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)"'
    );
}

.recent-doc-card:last-child {
  border-bottom: none;
}

.recent-doc-card:hover {
  background: v-bind(
    'themeState.currentTheme.type === "dark" ? "rgb(50,50,52)" : "rgb(245,245,245)"'
  );
}

.recent-doc-card:active {
  background: v-bind(
    'themeState.currentTheme.type === "dark" ? "rgb(55,55,57)" : "rgb(238,238,238)"'
  );
}

/* 文档卡片左侧小竖线指示器 */
.doc-card-indicator {
  flex-shrink: 0;
  width: 3px;
  height: 16px;
  border-radius: 1.5px;
  background: v-bind(
    'themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"'
  );
  transition: all 0.05s ease;
}

.recent-doc-card:hover .doc-card-indicator {
  background: v-bind(
    'themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.2)"'
  );
  height: 20px;
}

.doc-card-name {
  flex: 1;
  font-size: 13px;
  font-weight: 400;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: v-bind('themeState.currentTheme.textColor');
  opacity: 0.75;
  transition: opacity 0.05s ease;
}

.recent-doc-card:hover .doc-card-name {
  opacity: 1;
}

.doc-card-delete-btn {
  opacity: 0;
  transition: opacity 0.05s ease;
  z-index: 10;
  flex-shrink: 0;
  color: v-bind('themeState.currentTheme.textColor2 || "rgba(0,0,0,0.3)"') !important;
}

.recent-doc-card:hover .doc-card-delete-btn {
  opacity: 0.5;
}

.doc-card-delete-btn:hover {
  opacity: 1 !important;
}

/* ===== 动画 ===== */
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ===== 用户手册卡片高亮动画 ===== */
.manual-card.highlight-pulse {
  animation: highlightPulse 2s ease-in-out infinite;
  box-shadow: 0 0 20px rgba(64, 158, 255, 0.4);
}

@keyframes highlightPulse {
  0%, 100% {
    transform: translateY(0) scale(1);
    box-shadow: 0 0 20px rgba(64, 158, 255, 0.4);
  }
  50% {
    transform: translateY(-4px) scale(1.02);
    box-shadow: 0 0 30px rgba(64, 158, 255, 0.6);
  }
}

/* ===== 响应式 ===== */
@media (max-width: 1024px) {
  .action-section {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .action-section {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 640px) {
  .center-content-wrapper {
    padding: 32px 20px;
  }
}
</style>
