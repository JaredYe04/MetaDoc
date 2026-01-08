<template>
  <div class="homepage">
    <!-- 快速开始面板 - 优先级最高，覆盖其他所有内容 -->
    <!-- 注意：快速开始面板只在 GlobalHome 中显示，Home.vue 只显示文档总览 -->
    
    <!-- 如果文档格式未选择，显示格式选择界面 -->
    <div v-if="needsFormatSelection" class="format-selection-container">
      <NewDocumentWorkspace 
        v-if="activeTabId"
        :tab-id="activeTabId"
        :active="true"
      />
    </div>

    <!-- 如果已选择格式，显示文档预览 -->
    <div v-else-if="showDocumentPreview" class="home-panel" :style="panelStyle">
      <el-scrollbar class="home-panel-scrollbar">
        <div class="home-panel-content">
          <!-- 文档元信息区域 -->
          <div class="document-meta-section">
            <div class="meta-header">
              <h1 class="document-title" :style="{ color: themeState.currentTheme.textColor }">
                {{ metaTitle || $t('article.no_title') }}
              </h1>
              <div class="meta-info-row">
                <div class="meta-item" v-if="metaAuthor">
                  <span class="meta-label">{{ $t('home.authorLabel') }}</span>
                  <span class="meta-value" :style="{ color: themeState.currentTheme.textColor }">
                    {{ metaAuthor }}
                  </span>
                </div>
              </div>
              <div class="meta-description" v-if="metaDescription">
                <span class="description-label">{{ $t('home.abstractLabel') }}</span>
                <p class="description-text" :style="{ color: themeState.currentTheme.textColor }">
                  {{ metaDescription }}
                </p>
              </div>
            </div>
          </div>

          <!-- 文档内容预览区域 -->
          <div class="document-content-section">
            <div 
              ref="previewContainerRef" 
              class="content-preview" 
              :class="themeState.currentTheme.mdeditorClass"
              :style="{ color: themeState.currentTheme.textColor }" 
              v-loading="isRendering"
            ></div>
          </div>
        </div>
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
import { themeState } from '../utils/themes'
import { useWorkspace } from '../stores/workspace'
import { useActiveDocument } from '../composables/useActiveDocument'
import { convertLatexToMarkdown } from '../utils/latex-utils'
// 移除粒子效果相关导入，Home.vue 不再使用
import { renderMarkdownPreview } from '../utils/md-utils'
import { preRenderAllCharts } from '../utils/chart-pre-renderer'

const { t } = useI18n()

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

// 移除粒子效果相关代码

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

// 面板样式
const panelStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd || themeState.currentTheme.background,
  borderColor: themeState.currentTheme.borderColor || 'rgba(0, 0, 0, 0.1)'
}))

// 日志记录
const logger = createRendererLogger('Home', {
  windowTypeProvider: () => getWindowType()
})

// 移除粒子效果相关的 ipcRenderer 初始化，Home.vue 不再使用

// Home.vue 不再使用粒子效果，移除相关代码

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
  preventNavigate()

  // 初始渲染（只在需要显示文档预览时）
  nextTick(() => {
    if (showDocumentPreview.value) {
      renderPreview()
    }
  })
})

onBeforeUnmount(() => {
  // 无需清理粒子效果，因为 Home.vue 不再使用
})

</script>

<style scoped>
/* Home.vue 不使用粒子效果，所以不需要 particle-bg 容器 */

.homepage {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: v-bind('themeState.currentTheme.background');
}


.format-selection-container {
  width: 100%;
  height: 100%;
  position: relative;
  z-index: 1;
}

/* Home.vue 不使用粒子效果，所以不需要 canvas 样式 */

/* 主页面板容器 */
.home-panel {
  position: relative;
  z-index: 1;
  width: calc(100% - 48px);
  height: calc(100% - 48px);
  margin: 24px;
  border-radius: 16px;
  border: 1px solid;
  backdrop-filter: blur(20px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.home-panel-scrollbar {
  flex: 1;
  width: 100%;
  height: 100%;
}

.home-panel-scrollbar :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
  overflow-y: auto;
}

.home-panel-content {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  padding: 32px 40px;
  box-sizing: border-box;
  gap: 24px;
}

/* 文档元信息区域 */
.document-meta-section {
  flex-shrink: 0;
  padding-bottom: 24px;
  border-bottom: 1px solid;
  border-bottom-color: v-bind('themeState.currentTheme.borderColor || "rgba(0, 0, 0, 0.08)"');
}

.meta-header {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.document-title {
  font-size: 24px;
  font-weight: 600;
  line-height: 1.4;
  margin: 0;
  padding: 0;
  color: v-bind('themeState.currentTheme.textColor');
  letter-spacing: -0.02em;
}

.meta-info-row {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  align-items: center;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.meta-label {
  font-weight: 500;
  opacity: 0.7;
  color: v-bind('themeState.currentTheme.textColor');
}

.meta-value {
  font-weight: 400;
  color: v-bind('themeState.currentTheme.textColor');
}

.meta-description {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.description-label {
  font-size: 13px;
  font-weight: 500;
  opacity: 0.7;
  color: v-bind('themeState.currentTheme.textColor');
}

.description-text {
  font-size: 14px;
  line-height: 1.6;
  margin: 0;
  padding: 0;
  color: v-bind('themeState.currentTheme.textColor');
  opacity: 0.85;
  max-width: 100%;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

/* 文档内容预览区域 */
.document-content-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.content-preview {
  flex: 1;
  width: 100%;
  padding: 24px;
  box-sizing: border-box;
  word-wrap: break-word;
  overflow-wrap: break-word;
  line-height: 1.7;
  font-size: 15px;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .home-panel {
    width: calc(100% - 32px);
    height: calc(100% - 32px);
    margin: 16px;
    border-radius: 12px;
  }

  .home-panel-content {
    padding: 24px;
    gap: 20px;
  }

  .document-title {
    font-size: 20px;
  }

  .content-preview {
    padding: 16px;
    font-size: 14px;
  }
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
