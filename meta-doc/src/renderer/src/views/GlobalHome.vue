<template>
  <div id="particle-bg" class="homepage">
    <DynamicBackgroundAnimation />

    <div class="grid-decoration"></div>

    <ScrollArea class="center-content" :show-horizontal-scrollbar="false">
      <div class="center-content-wrapper">
        <div class="hero-section">
          <div class="distortion-wrapper">
            <DistortionBanner />
          </div>
          <p class="subtitle">
            {{ $t('home.subtitle') || '现代文档编辑与创作工具' }}
          </p>
        </div>

        <!-- 主页 Agent 输入：由 agent 插件注册 -->
        <template v-for="section in homePluginSections" :key="section.id">
          <component :is="section.component" />
        </template>

        <div class="action-section action-section--row3">
          <div class="action-card" @click="openNewDoc">
            <div class="action-icon">
              <FilePlus class="h-5 w-5" />
            </div>
            <div class="action-content">
              <h3 class="action-title">{{ $t('home.button.newDoc') }}</h3>
              <p class="action-desc">{{ $t('home.tooltip.newDoc') || '创建一篇新文档' }}</p>
            </div>
            <ChevronRight class="h-4 w-4" />
          </div>

          <div class="action-card" @click="openFile">
            <div class="action-icon">
              <FolderOpen class="h-5 w-5" />
            </div>
            <div class="action-content">
              <h3 class="action-title">{{ $t('home.button.openFile') }}</h3>
              <p class="action-desc">{{ $t('home.tooltip.openFile') || '打开现有文档' }}</p>
            </div>
            <ChevronRight class="h-4 w-4" />
          </div>

          <div
            class="action-card manual-card"
            :class="{ 'highlight-pulse': showManualHighlight }"
            @click="openUserManual"
          >
            <div class="action-icon">
              <BookOpen class="h-5 w-5" />
            </div>
            <div class="action-content">
              <h3 class="action-title">{{ $t('home.button.userManual') || '用户手册' }}</h3>
              <p class="action-desc">
                {{ $t('home.tooltip.userManual') || '学习如何使用MetaDoc' }}
              </p>
            </div>
            <ChevronRight class="h-4 w-4" />
          </div>
        </div>

        <div v-if="recentOpens.length > 0" class="recent-section">
          <div class="recent-header">
            <h3 class="recent-title">
              <Clock class="h-4 w-4" />
              {{ $t('home.recent') }}
            </h3>
          </div>
          <div class="recent-docs-container">
            <ElScrollbar class="recent-docs-scrollbar">
              <div class="recent-docs-grid">
                <div
                  v-for="(entry, index) in recentOpens.slice(0, RECENT_MAX)"
                  :key="`${entry.kind}:${entry.path}`"
                  class="recent-doc-card"
                  :style="{ animationDelay: `${index * 0.03}s` }"
                  @click="openRecentItem(entry)"
                >
                  <div class="doc-card-indicator"></div>
                  <span class="doc-card-name">
                    {{ getFileName(entry.path) }}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    class="doc-card-delete-btn h-6 w-6 rounded-full"
                    @click.stop="removeRecentItem(entry.path)"
                  >
                    <X class="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </ElScrollbar>
          </div>
        </div>
      </div>
      <ScrollBar />
    </ScrollArea>

    <UserProfileDialog ref="profileDialogRef" @submitted="handleProfileSubmitted" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@renderer/components/ui/button'
import DistortionBanner from '../components/home/DistortionBanner.vue'
import DynamicBackgroundAnimation from '../components/home/DynamicBackgroundAnimation.vue'
import '../assets/aero-div.css'
import '../assets/aero-btn.css'
import '../assets/aero-input.css'
import { ScrollArea, ScrollBar } from '@renderer/components/ui/scroll-area'
import eventBus from '../utils/event-bus'
import { createRendererLogger } from '../utils/logger'
import { themeState, mixColors } from '../utils/themes'
import { getRecentOpens, removeRecentOpen as removeRecentOpenFromStorage } from '../utils/settings'
import { FolderOpen, Clock, FilePlus, BookOpen, ChevronRight, X } from 'lucide-vue-next'
import { basename, extname } from '../utils/path-utils'
import { formatRegistry } from '../utils/format-registry'
import { hasCompletedProfile } from '../utils/user-profile'
import { useWorkspace } from '../stores/workspace'
import UserProfileDialog from '../components/manual/UserProfileDialog.vue'
import type { RecentOpenEntry } from '../components/focus-mode-left-menu-api'
import { pluginRegistry } from '../core/host-runtime'
import { isAiRuntimeLoaded } from '../ai-runtime/loader'

/** 主页统一「最近」列表最多展示条数 */
const RECENT_MAX = 20

const { t } = useI18n()
const workspace = useWorkspace()
const homePluginRevision = ref(0)

const homePluginSections = computed(() => {
  homePluginRevision.value
  if (!isAiRuntimeLoaded()) return []
  return [...pluginRegistry.homeSections].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
})

const onHomePluginRuntimeChange = () => {
  homePluginRevision.value++
}

const homepageBackgroundColor = computed(() => {
  const baseBackground = themeState.currentTheme.background
  const isDark = themeState.currentTheme.type === 'dark'
  if (isDark) {
    return mixColors(baseBackground, '#111111', 0.3)
  }
  return mixColors(baseBackground, '#fafafa', 0.5)
})

const recentOpens = ref<RecentOpenEntry[]>([])
const showManualHighlight = ref(false)
const profileDialogRef = ref<InstanceType<typeof UserProfileDialog> | null>(null)

const openNewDoc = () => {
  workspace.openNewDocumentTab()
}

const openFile = () => {
  eventBus.emit('open-doc')
}

const openUserManual = () => {
  workspace.openSystemTab('/user-manual', t('userManual.title') || '用户手册')
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

const getFileName = (filePath: string): string => {
  if (!filePath) return ''
  try {
    return basename(filePath)
  } catch {
    const segments = filePath.split(/[/\\]+/).filter(Boolean)
    return segments[segments.length - 1] || filePath
  }
}

const logger = createRendererLogger('GlobalHome')

const loadRecentOpens = async () => {
  try {
    recentOpens.value = (await getRecentOpens()) as RecentOpenEntry[]
  } catch (error) {
    logger.warn('加载最近列表失败', error)
    recentOpens.value = []
  }
}

const openRecentItem = (entry: RecentOpenEntry) => {
  if (entry.kind === 'folder') {
    eventBus.emit('open-recent-workspace', { path: entry.path })
    return
  }
  const fileExt = extname(entry.path)
  const formatId = formatRegistry.getFormatByExtension(fileExt) || 'txt'
  eventBus.emit('workspace-open-document', {
    path: entry.path,
    format: formatId,
    content: '',
    preview: false
  })
}

const removeRecentItem = async (path: string) => {
  try {
    await removeRecentOpenFromStorage(path)
    await loadRecentOpens()
    logger.debug('删除最近项成功', { path })
  } catch (error) {
    logger.warn('删除最近项失败', error)
  }
}

const handleDocOpenSuccess = () => {
  loadRecentOpens()
}

const handleDocOpen = () => {
  setTimeout(() => {
    loadRecentOpens()
  }, 100)
}

const handleRecentOpensChanged = () => {
  loadRecentOpens()
}

onMounted(async () => {
  eventBus.on('ai-runtime-ready', onHomePluginRuntimeChange)
  eventBus.on('ai-runtime-unloaded', onHomePluginRuntimeChange)

  loadRecentOpens()
  const completed = await hasCompletedProfile()
  if (!completed) {
    showManualHighlight.value = true
  }

  eventBus.on('open-doc-success', handleDocOpenSuccess)
  eventBus.on('open-doc', handleDocOpen)
  eventBus.on('recent-opens-changed', handleRecentOpensChanged)
})

onBeforeUnmount(() => {
  eventBus.off('ai-runtime-ready', onHomePluginRuntimeChange)
  eventBus.off('ai-runtime-unloaded', onHomePluginRuntimeChange)
  eventBus.off('open-doc-success', handleDocOpenSuccess)
  eventBus.off('open-doc', handleDocOpen)
  eventBus.off('recent-opens-changed', handleRecentOpensChanged)
})
</script>

<style scoped>
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
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: v-bind('homepageBackgroundColor');
  /* 随主内容区（标签页区域）宽高变化，而不仅依赖视口 media */
  container-name: global-home;
  container-type: size;
}

#particle-bg.homepage {
  background-color: v-bind('homepageBackgroundColor');
}

.grid-decoration {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-image: linear-gradient(
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

.center-content {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  flex: 1;
  position: relative;
  z-index: 2;
}

/* reka-ui 视口 data 属性为 data-reka-scroll-area-viewport（非 radix），原先选择器未命中 */
.center-content :deep([data-reka-scroll-area-viewport]),
.center-content :deep([data-radix-scroll-area-viewport]) {
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  overflow-x: hidden !important;
  overflow-y: auto !important;
}

/* 横条存在时 reka 会给该子节点内联 min-width: fit-content；主页已关横条，此处再兜底防止回退 */
.center-content :deep([data-reka-scroll-area-viewport] > *) {
  min-width: 0 !important;
  max-width: 100%;
  box-sizing: border-box;
}

.center-content-wrapper {
  display: flex;
  flex-direction: column;
  /* stretch：子项占满滚动区宽度，避免 align-items:center 时随「内容最小宽度」撑开导致无法随容器变窄 */
  align-items: stretch;
  justify-content: flex-start;
  gap: clamp(14px, min(2.2vh, 2.5cqh), 28px);
  min-height: 100%;
  min-width: 0;
  padding: clamp(12px, min(2.5vh, 2.5cqh), 32px) clamp(16px, min(4vw, 4cqi), 56px);
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  overflow-x: hidden;
}

.hero-section {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  animation: fadeIn 0.45s ease-out;
}

.distortion-wrapper {
  width: 100%;
  max-width: min(1400px, 100%);
  height: clamp(72px, min(16vh, 14cqh), 160px);
}

.subtitle {
  font-size: clamp(13px, min(2.2vw, 2.2cqi), 18px);
  font-weight: 500;
  margin: 0;
  padding: 0;
  color: v-bind('themeState.currentTheme.textColor');
  opacity: 0.45;
  letter-spacing: 0.1em;
  user-select: none;
  -webkit-user-select: none;
}

/* ----- 三列操作 ----- */
.action-section {
  width: 100%;
  max-width: min(920px, 100%);
  min-width: 0;
  margin-inline: auto;
  box-sizing: border-box;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: clamp(8px, 1.5cqi, 12px);
  animation: fadeIn 0.45s ease-out 0.08s both;
}

.action-section--row3 {
  max-width: min(920px, 100%);
}

.action-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
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
  min-width: 0;
}

.action-card::after {
  content: '';
  position: absolute;
  inset: 0;
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
  width: 34px;
  height: 34px;
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
    'themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.6)"'
  );
}

.action-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.action-title {
  font-size: 13px;
  font-weight: 500;
  margin: 0;
  padding: 0;
  color: v-bind('themeState.currentTheme.textColor');
  line-height: 1.35;
}

.action-desc {
  font-size: 11px;
  margin: 0;
  padding: 0;
  color: v-bind('themeState.currentTheme.textColor2 || "rgba(0,0,0,0.5)"');
  opacity: 0.65;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ----- 最近文档（卡片式 + 仅 5 条可视高度，超出 el-scrollbar） ----- */
.recent-section {
  width: 100%;
  max-width: min(920px, 100%);
  min-width: 0;
  margin-inline: auto;
  box-sizing: border-box;
  animation: fadeIn 0.45s ease-out 0.12s both;
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

.recent-docs-scrollbar {
  width: 100%;
}

.recent-docs-scrollbar :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
  /* 约 5 行卡片高，并随视口 / 主页容器高度收缩 */
  max-height: min(235px, 40vh, 32cqh);
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
  background: v-bind('themeState.currentTheme.background2nd');
  user-select: none;
  animation: fadeIn 0.3s ease-out both;
  border-bottom: 1px solid v-bind('themeState.currentTheme.borderColor + "40"');
}

.recent-doc-card:last-child {
  border-bottom: none;
}

.recent-doc-card:hover {
  background: v-bind('themeState.currentTheme.background');
}

.recent-doc-card:active {
  background: v-bind('themeState.currentTheme.background');
}

.doc-card-indicator {
  flex-shrink: 0;
  width: 3px;
  height: 16px;
  border-radius: 1.5px;
  background: v-bind('themeState.currentTheme.primaryColor + "30"');
  transition: all 0.05s ease;
}

.recent-doc-card:hover .doc-card-indicator {
  background: v-bind('themeState.currentTheme.primaryColor');
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

.manual-card.highlight-pulse {
  animation: highlightPulse 2s ease-in-out infinite;
  box-shadow: 0 0 20px rgba(64, 158, 255, 0.4);
}

@keyframes highlightPulse {
  0%,
  100% {
    transform: translateY(0) scale(1);
    box-shadow: 0 0 20px rgba(64, 158, 255, 0.4);
  }
  50% {
    transform: translateY(-3px) scale(1.01);
    box-shadow: 0 0 28px rgba(64, 158, 255, 0.55);
  }
}

/* 窄主内容区：单列（容器查询优先于纯视口，便于侧栏较宽时仍适配） */
@container global-home (max-width: 900px) {
  .action-section--row3 {
    grid-template-columns: 1fr;
  }
}

@container global-home (min-width: 560px) and (max-width: 900px) {
  .action-section--row3 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@container global-home (max-width: 640px) {
  .center-content-wrapper {
    padding-left: 16px;
    padding-right: 16px;
  }

  .suggested-prompts-toolbar {
    flex-wrap: wrap;
  }
}

@container global-home (max-height: 520px) {
  .center-content-wrapper {
    gap: clamp(10px, 2cqh, 18px);
    padding-top: clamp(8px, 1.5cqh, 20px);
    padding-bottom: clamp(8px, 1.5cqh, 20px);
  }

  .distortion-wrapper {
    height: clamp(64px, min(12vh, 10cqh), 120px);
  }
}

@media (max-width: 900px) {
  .action-section--row3 {
    grid-template-columns: 1fr;
  }
}

@media (min-width: 561px) and (max-width: 900px) {
  .action-section--row3 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .center-content-wrapper {
    padding-left: 16px;
    padding-right: 16px;
  }

  .suggested-prompts-toolbar {
    flex-wrap: wrap;
  }
}

@media (max-height: 520px) {
  .center-content-wrapper {
    gap: clamp(10px, 2vh, 18px);
    padding-top: clamp(8px, 1.5vh, 20px);
    padding-bottom: clamp(8px, 1.5vh, 20px);
  }

  .distortion-wrapper {
    height: clamp(64px, 12vh, 120px);
  }
}
</style>
