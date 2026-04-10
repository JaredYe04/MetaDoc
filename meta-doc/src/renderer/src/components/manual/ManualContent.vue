<template>
  <div class="manual-content">
    <ManualBreadcrumb />
    <div class="manual-content-body">
      <ResizableContainer
        v-if="currentArticleId"
        class="manual-outline-resize"
        direction="vertical"
        sidebar-position="start"
        :sidebar-on-left="true"
        :initial-sidebar-size="OUTLINE_DEFAULT"
        :min-size="OUTLINE_MIN"
        :max-size="OUTLINE_MAX"
        :divider-size="6"
        storage-key="manual-outline-sidebar"
        :show-sidebar="true"
        :collapsible="true"
        :show-collapse-button="true"
        :seamless-divider="true"
        :collapse-button-title="$t('viewMenuContainer.collapse')"
        :expand-button-title="$t('viewMenuContainer.expand')"
      >
        <template #sidebar>
          <div class="manual-outline-column">
            <ManualDocumentOutline :markdown="outlineMarkdown" @jump="scrollToHeadingByIndex" />
          </div>
        </template>
        <template #main>
          <el-scrollbar ref="scrollbarRef" class="content-scrollbar" @scroll="onContentScroll">
            <div class="content-wrapper">
              <div v-show="processedContent && processedContent.trim()" class="markdown-wrapper">
                <VditorPreview
                  :markdown="processedContent"
                  :key="`content-${currentArticleId}-${locale}`"
                  class="markdown-preview"
                  @rendered="handleRendered"
                />
              </div>
              <div v-show="!processedContent || !processedContent.trim()" class="empty-content">
                <Empty :description="$t('userManual.emptyContent') || '暂无内容'" />
              </div>
            </div>
          </el-scrollbar>
        </template>
      </ResizableContainer>
      <el-scrollbar
        v-else
        ref="scrollbarRef"
        class="content-scrollbar content-scrollbar--full"
        @scroll="onContentScroll"
      >
        <div class="content-wrapper">
          <div v-show="processedContent && processedContent.trim()" class="markdown-wrapper">
            <VditorPreview
              :markdown="processedContent"
              :key="`content-${currentArticleId}-${locale}`"
              class="markdown-preview"
              @rendered="handleRendered"
            />
          </div>
          <div v-show="!processedContent || !processedContent.trim()" class="empty-content">
            <Empty :description="$t('userManual.emptyContent') || '暂无内容'" />
          </div>
        </div>
      </el-scrollbar>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  ref,
  computed,
  watch,
  getCurrentInstance,
  nextTick,
  createVNode,
  render,
  onBeforeUnmount,
  type AppContext
} from 'vue'
import { useI18n } from 'vue-i18n'
import { useUserManual } from '../../stores/userManual'
import { replaceManualInternalLinksWithHtml } from '../../manuals/utils'
import { preprocessMarkdownWithDemoPlaceholders } from '../../manuals/demo-mode'
import { getDemoComponent } from '../../manuals/demo-registry'
import { mixColors, themeState } from '../../utils/themes'
import VditorPreview from '../VditorPreview.vue'
import ManualBreadcrumb from './ManualBreadcrumb.vue'
import ManualDocumentOutline from './ManualDocumentOutline.vue'
import ResizableContainer from '../base/ResizableContainer.vue'
import { Empty } from '@renderer/components/ui/empty'

const { locale } = useI18n()
const { currentArticleContent, currentArticleId, setCurrentArticle, markArticleAsRead } =
  useUserManual()

const OUTLINE_MIN = 200
const OUTLINE_MAX = 400
const OUTLINE_DEFAULT = 260

const outlineMarkdown = computed(() => currentArticleContent.value ?? '')

function scrollToHeadingByIndex(index: number) {
  nextTick(() => {
    const scrollbarEl = scrollbarRef.value?.$el as HTMLElement | undefined
    const wrap = scrollbarEl?.querySelector('.el-scrollbar__wrap') as HTMLElement | undefined
    const container = document.querySelector(
      '.manual-content .vditor-preview-container'
    ) as HTMLElement | null
    if (!wrap || !container || index < 0) return
    const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6')
    const el = headings[index] as HTMLElement | undefined
    if (!el) return
    const wrapRect = wrap.getBoundingClientRect()
    const elRect = el.getBoundingClientRect()
    const top = wrap.scrollTop + (elRect.top - wrapRect.top) - 12
    wrap.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  })
}

// 计算 ViewMenu 活跃状态的背景色和文字颜色（用于 CSS v-bind）
const activeMenuBgColor = computed(() => {
  const theme = themeState.currentTheme
  if (!theme) return '#e0e0e0'
  const bg2nd = theme.background2nd || theme.background || '#ffffff'
  const textColor = theme.textColor || '#333333'
  return mixColors(bg2nd, textColor, 0.3)
})
const activeMenuTextColor = computed(() => {
  const theme = themeState.currentTheme
  if (!theme) return '#333333'
  return theme.textColor || '#333333'
})

/** 手册大纲列背景：由 themes.js 按 75% 灰 + 25% 主题色生成 */
const manualOutlineColumnBackground = computed(() => {
  const theme = themeState.currentTheme as {
    manualOutlineColumnBackground?: string
    sidebarPanelBackground?: string
    background2nd?: string
    background?: string
  }
  return (
    theme.manualOutlineColumnBackground ||
    theme.sidebarPanelBackground ||
    theme.background2nd ||
    theme.background ||
    '#ebebeb'
  )
})

// 在 setup 顶层捕获 appContext，事件回调中 getCurrentInstance() 可能为 null
const capturedAppContext = getCurrentInstance()?.appContext ?? null

const scrollbarRef = ref<InstanceType<typeof import('element-plus').ElScrollbar> | null>(null)
const hasMarkedReadForArticle = ref<string | null>(null)

// 先占位符替换再交给 Vditor，不破坏 Mermaid 等渲染；渲染完成后再把占位 div 替换成 Vue 组件
const processedContent = computed(() => {
  const rawContent = currentArticleContent.value ?? ''
  const withLinks = replaceManualInternalLinksWithHtml(rawContent)
  const processed = preprocessMarkdownWithDemoPlaceholders(withLinks)
  console.log('[ManualContent] processedContent computed:', {
    currentArticleId: currentArticleId.value,
    rawLength: rawContent.length,
    processedLength: processed.length,
    hasContent: !!processed.trim()
  })
  return processed
})

const BOTTOM_THRESHOLD = 80
// 最小内容高度阈值：只有内容高度小于此值时才自动标记为已读（避免误判长文章）
const MIN_CONTENT_HEIGHT_FOR_AUTO_MARK = 400

// ResizeObserver 用于监听内容高度变化，在高度稳定后检查是否需要自动标记
let resizeObserver: ResizeObserver | null = null
let heightCheckTimer: ReturnType<typeof setTimeout> | null = null
let lastHeight = 0

// 检查内容是否已经全部可见（不需要滚动）
// 只在内容确实很短且高度稳定时才自动标记为已读，避免误判长文章
function checkIfContentFullyVisible() {
  const id = currentArticleId.value
  if (!id || hasMarkedReadForArticle.value === id) return
  const scrollbar = scrollbarRef.value?.$el
  if (!scrollbar) return
  const wrap = scrollbar.querySelector('.el-scrollbar__wrap') as HTMLElement | null
  if (!wrap) return
  const { scrollHeight, clientHeight } = wrap

  // 只有在内容确实很短（小于阈值）且完全可见时，才自动标记
  // 这样可以避免误判长文章
  if (scrollHeight <= MIN_CONTENT_HEIGHT_FOR_AUTO_MARK && scrollHeight <= clientHeight) {
    hasMarkedReadForArticle.value = id
    markArticleAsRead(id)
  }
}

// 设置 ResizeObserver 监听内容高度变化
function setupHeightObserver() {
  // 清理旧的 observer
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }

  const scrollbar = scrollbarRef.value?.$el
  if (!scrollbar) return

  const wrap = scrollbar.querySelector('.el-scrollbar__wrap') as HTMLElement | null
  if (!wrap) return

  // 创建 ResizeObserver 监听滚动容器的高度变化
  resizeObserver = new ResizeObserver(() => {
    const currentHeight = wrap.scrollHeight

    // 如果高度发生变化，重置计时器
    if (currentHeight !== lastHeight) {
      lastHeight = currentHeight

      // 清除之前的计时器
      if (heightCheckTimer) {
        clearTimeout(heightCheckTimer)
      }

      // 高度稳定 1.5 秒后，再检查是否需要自动标记
      // 这样可以确保图片、图表等异步内容都已加载完成
      heightCheckTimer = setTimeout(() => {
        checkIfContentFullyVisible()
      }, 1500)
    }
  })

  resizeObserver.observe(wrap)
}

function onContentScroll({ scrollTop, scrollLeft }: { scrollTop: number; scrollLeft: number }) {
  const id = currentArticleId.value
  if (!id || hasMarkedReadForArticle.value === id) return

  // 如果滚动位置在顶部附近（可能是刚切换文章，滚动位置还没重置），不处理
  // 这样可以避免切换文章时立即误判
  if (scrollTop < 10) return

  const scrollbar = scrollbarRef.value?.$el
  if (!scrollbar) return
  const wrap = scrollbar.querySelector('.el-scrollbar__wrap') as HTMLElement | null
  if (!wrap) return
  const { scrollHeight, clientHeight } = wrap

  // 确保内容高度大于可视区域高度（避免短文章误判）
  // 只有用户主动滚动到底部时才标记为已读
  if (scrollHeight > clientHeight && scrollTop + clientHeight >= scrollHeight - BOTTOM_THRESHOLD) {
    hasMarkedReadForArticle.value = id
    markArticleAsRead(id)
  }
}

// 使用防抖避免重复处理
let processTimer: ReturnType<typeof setTimeout> | null = null

// 懒加载 Demo 组件注册表，避免循环依赖（仅在手册需要嵌入 Demo 时加载）
let demoComponentsLoadPromise: Promise<void> | null = null
function ensureDemoComponentsLoaded(): Promise<void> {
  if (!demoComponentsLoadPromise) {
    demoComponentsLoadPromise = import('../../manuals/demo-registry-components').then(() => {})
  }
  return demoComponentsLoadPromise
}

// Vditor 渲染完成后：先处理内部链接，再把占位 div 替换为 Vue 组件（不破坏 Mermaid 等）
// 必须在同步阶段捕获 appContext，否则在 setTimeout/async 回调中 getCurrentInstance() 为 null
const handleRendered = (container?: HTMLElement | null) => {
  console.log('[ManualContent] handleRendered called', { hasContainer: !!container })
  if (processTimer) clearTimeout(processTimer)
  const targetContainer = container ?? document.querySelector('.vditor-preview-container')
  console.log('[ManualContent] targetContainer found:', !!targetContainer)
  processTimer = setTimeout(() => {
    nextTick(async () => {
      console.log('[ManualContent] Processing rendered content...')
      // 确保滚动位置在顶部（避免切换文章时保留滚动位置）
      resetScrollPosition()
      bindManualInternalLinkClicks(targetContainer as HTMLElement | null)
      await injectDemoComponents(capturedAppContext, targetContainer as HTMLElement | null)
      bindManualInternalLinkClicks(targetContainer as HTMLElement | null)
      // 设置高度监听器，在内容高度稳定后检查是否需要自动标记
      setupHeightObserver()
      console.log('[ManualContent] Rendered content processing complete')
    })
  }, 100)
}

async function injectDemoComponents(appContext: AppContext | null, container: HTMLElement | null) {
  if (!appContext || !container) return
  const placeholders = container.querySelectorAll('[data-demo-component]')
  if (placeholders.length === 0) return
  await ensureDemoComponentsLoaded()
  placeholders.forEach((el) => {
    const componentName = (el as HTMLElement).getAttribute('data-demo-component')
    const propsJson = (el as HTMLElement).getAttribute('data-demo-props')
    if (!componentName || !propsJson) return
    const Component = getDemoComponent(componentName)
    if (!Component) return
    let props: Record<string, unknown>
    try {
      props = JSON.parse(propsJson) as Record<string, unknown>
    } catch {
      return
    }
    const placeholder = el as HTMLElement
    render(null, placeholder)
    const wrapper = document.createElement('div')
    wrapper.className = 'manual-demo-inline'
    placeholder.appendChild(wrapper)
    blockDemoEvents(wrapper)
    const vnode = createVNode(Component, props)
    vnode.appContext = appContext
    render(vnode, wrapper)
  })
}

/** 在包装元素上拦截所有交互事件，避免手册内 Demo 触发真实业务逻辑（不修改组件本身） */
function blockDemoEvents(wrapper: HTMLElement) {
  const block = (e: Event) => {
    e.stopPropagation()
    e.preventDefault()
  }
  const events = [
    'click',
    'mousedown',
    'mouseup',
    'dblclick',
    'contextmenu',
    'keydown',
    'keypress',
    'keyup',
    'submit',
    'touchstart',
    'touchend',
    'touchmove'
  ] as const
  events.forEach((type) => wrapper.addEventListener(type, block, true))
}

// 重置滚动位置到顶部
function resetScrollPosition() {
  nextTick(() => {
    const scrollbar = scrollbarRef.value?.$el
    if (!scrollbar) return
    const wrap = scrollbar.querySelector('.el-scrollbar__wrap') as HTMLElement | null
    if (!wrap) return
    wrap.scrollTop = 0
  })
}

// 监听内容变化，延迟处理内部链接（等待渲染完成）
watch(
  [processedContent, currentArticleId],
  ([newContent, newArticleId], [oldContent, oldArticleId]) => {
    console.log('[ManualContent] Watch triggered', {
      articleIdChanged: newArticleId !== oldArticleId,
      newArticleId: newArticleId,
      contentChanged: newContent !== oldContent,
      contentLength: newContent?.length
    })
    hasMarkedReadForArticle.value = null
    lastHeight = 0 // 重置高度记录

    // 重置滚动位置到顶部，避免切换文章时保留上一个文章的滚动位置
    resetScrollPosition()

    // 清理旧的监听器
    if (resizeObserver) {
      resizeObserver.disconnect()
      resizeObserver = null
    }
    if (heightCheckTimer) {
      clearTimeout(heightCheckTimer)
      heightCheckTimer = null
    }

    if (processTimer) {
      clearTimeout(processTimer)
    }
    processTimer = setTimeout(() => {
      nextTick(() => {
        console.log('[ManualContent] Watch timer: binding internal links')
        const c = document.querySelector('.manual-content .vditor-preview-container') as
          | HTMLElement
          | null
        bindManualInternalLinkClicks(c)
        // 高度监听器会在 handleRendered 中设置
      })
    }, 200)
  }
)

onBeforeUnmount(() => {
  if (processTimer) {
    clearTimeout(processTimer)
  }
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (heightCheckTimer) {
    clearTimeout(heightCheckTimer)
    heightCheckTimer = null
  }
})

/** 为 Vditor 渲染后的 <a class="manual-internal-link"> 绑定跳转（Markdown 中已预处理为 HTML） */
function bindManualInternalLinkClicks(root: HTMLElement | null) {
  if (!root) return
  root.querySelectorAll('a.manual-internal-link[data-article-id]').forEach((el) => {
    const link = el as HTMLAnchorElement
    if (link.dataset.manualLinkBound === '1') return
    link.dataset.manualLinkBound = '1'
    link.setAttribute('href', '#')
    link.style.cursor = 'pointer'
    link.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const id = link.getAttribute('data-article-id')
      if (id) setCurrentArticle(id, 'link')
    })
  })
}
</script>

<style scoped>
.manual-content {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background-color: v-bind('themeState.currentTheme.background');
}

.manual-content-body {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: row;
  align-items: stretch;
}

/* 与编辑器侧栏一致：用绝对坐标计算宽度，避免 flex + delta 拖拽在缩放布局下只改主区域 */
.manual-outline-resize {
  flex: 1;
  min-width: 0;
  min-height: 0;
  width: 100%;
  height: 100%;
}

.manual-outline-column {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 12px 0 12px 12px;
  box-sizing: border-box;
  background-color: v-bind('manualOutlineColumnBackground');
}

.content-scrollbar {
  flex: 1;
  min-width: 0;
  min-height: 0;
  height: 100%;
}

.content-scrollbar--full {
  width: 100%;
}

.content-wrapper {
  min-height: 100%;
  padding: 24px;
  max-width: 900px;
  margin: 0 auto;
}

.markdown-wrapper {
  width: 100%;
}

.markdown-preview {
  width: 100%;
  min-height: 200px;
}

.markdown-preview :deep(.manual-internal-link) {
  color: v-bind('themeState.currentTheme.primaryColor || "#409EFF"');
  text-decoration: none;
  border-bottom: 1px solid v-bind('themeState.currentTheme.primaryColor || "#409EFF"');
  transition: all 0.2s;
}

.markdown-preview :deep(.manual-internal-link:hover) {
  color: v-bind('themeState.currentTheme.primaryColor || "#409EFF"');
  border-bottom-width: 2px;
}

/* Vditor 输出中的 Demo 占位 div，注入 Vue 组件后保留此容器样式 */
.markdown-preview :deep(.manual-demo-placeholder) {
  margin: 12px 0;
  padding: 8px;
  border: 1px dashed v-bind('themeState.currentTheme.borderColor || "rgba(0,0,0,0.15)"');
  border-radius: 8px;
  background-color: transparent;
}

/* 手册内 Demo：样式与交互均在此处统一处理，不依赖各组件内部逻辑 */
/* 大纲等需要横向占满正文栏的 Demo：覆盖下方 fit-content，避免演示框过窄 */
.markdown-preview :deep(.manual-demo-inline:has(.outline-page)) {
  width: 100% !important;
  max-width: 100% !important;
  margin-left: 0;
  margin-right: 0;
}

.markdown-preview :deep(.manual-demo-inline) {
  /* 创建新的定位上下文，让内部 absolute 元素相对于此容器定位（而不是视口） */
  position: relative;
  /* 根据内容自适应宽度，不强制 100% */
  width: fit-content;
  max-width: 100%;
  /* 居中显示 */
  margin: 0 auto;
  display: block;
  /* 允许内容完整显示，如果内容过大则允许滚动 */
  overflow: visible;
  /* 最小高度确保能容纳组件内容 */
  min-height: fit-content;
  /* 保持正常的文档流，不影响内部定位 */
  isolation: isolate;
  /* 阻断指针事件，防止触发组件内业务逻辑（配合 JS 中 blockDemoEvents 的捕获阶段拦截） */
  pointer-events: none;
}

.markdown-preview :deep(.manual-demo-inline *) {
  pointer-events: none;
}

/* AgentView demo：需要稳定的尺寸与字体基线，避免按钮/图标被挤压或异常放大覆盖 */
.markdown-preview :deep(.manual-demo-inline .agent-view-page) {
  width: 100% !important;
  max-width: 100% !important;
  /* 给出可视高度，避免内部 100% 高度布局塌陷 */
  height: 560px !important;
  min-height: 560px !important;
  /* 统一字体基线，避免图标按继承字号被放大 */
  font-size: 14px !important;
  line-height: 1.4 !important;
  overflow: hidden !important;
  border-radius: 10px;
  border: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0,0,0,0.1)"');
  background-color: v-bind('themeState.currentTheme.background');
}

.markdown-preview :deep(.manual-demo-inline .agent-view-page .el-icon) {
  font-size: 16px !important;
}

.markdown-preview :deep(.manual-demo-inline .agent-view-page svg) {
  max-width: 20px;
  max-height: 20px;
}

.markdown-preview :deep(.manual-demo-inline .agent-view-page .sidebar-footer-content) {
  /* 防止 footer 区域被压缩到看不见（导致只剩一个巨大的 icon 叠在内容上） */
  flex-shrink: 0;
}

/* 手册内 AI 对话 Demo：左侧会话列表与整体填满高度 */
.markdown-preview :deep(.manual-demo-inline .ai-chat-container) {
  min-height: 380px !important;
  height: 380px !important;
  max-height: 440px !important;
}
.markdown-preview :deep(.manual-demo-inline .ai-chat-container .main-container) {
  min-height: 340px !important;
  flex: 1 !important;
  height: 100% !important;
}
.markdown-preview :deep(.manual-demo-inline .session-list-root) {
  min-height: 340px !important;
  height: 100% !important;
}

/* 知识库 Demo：四宫格需要明确高度 */
.markdown-preview :deep(.manual-demo-inline .kb-root) {
  min-height: 420px !important;
  height: 420px !important;
  max-height: 460px !important;
}

/* 绘图窗口 Demo */
.markdown-preview :deep(.manual-demo-inline .graph-window) {
  min-height: 400px !important;
  height: 400px !important;
  max-height: 460px !important;
}
.markdown-preview :deep(.manual-demo-inline .graph-window .main-container) {
  min-height: 360px !important;
  height: 100% !important;
}

/* 大纲树图 Demo：给 vue-tree 稳定视口 */
.markdown-preview :deep(.manual-demo-inline .outline-page) {
  width: 100% !important;
  min-height: 400px !important;
  height: 400px !important;
  max-height: 460px !important;
  position: relative !important;
  overflow: hidden !important;
}
.markdown-preview :deep(.manual-demo-inline .outline-page .container) {
  min-height: 320px !important;
}
.markdown-preview :deep(.manual-demo-inline .outline-viewport) {
  min-height: 260px !important;
}

/* 手册内 Demo：只改变定位方式（防止浮层），保持组件原始尺寸和布局 */
/* QuickStartPanel: 原为 absolute 全屏，改为 relative，让 wrapper 自适应内容高度 */
.markdown-preview :deep(.manual-demo-inline .quick-start-panel-wrapper) {
  position: relative !important;
  top: auto !important;
  left: auto !important;
  right: auto !important;
  bottom: auto !important;
  /* wrapper 自适应内容，内部容器保持原始 max-width: 900px, max-height: 600px */
  width: 100% !important;
  height: auto !important;
  /* 移除 padding，让内部容器居中显示 */
  padding: 0 !important;
  /* 根据内容自适应高度，不设置固定最小高度 */
  min-height: fit-content;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 确保内部容器保持原始尺寸限制（QuickStartPanel 有 max-width/max-height，QuickStartMarkdown/Latex 没有） */
.markdown-preview :deep(.manual-demo-inline .quick-start-panel-container) {
  /* QuickStartPanel 的容器：保持原始 max-width: 900px, max-height: 600px */
  /* QuickStartMarkdown/Latex 的容器：保持 width: 100%, height: 100% */
  width: 100% !important;
  height: 100% !important;
}

.markdown-preview :deep(.manual-demo-inline .quick-start-overlay) {
  position: relative !important;
  top: auto !important;
  left: auto !important;
  right: auto !important;
  bottom: auto !important;
  /* 保持原始尺寸：width: 70vw, height: 90vh，在手册内改为固定尺寸 */
  width: 100% !important;
  height: auto !important;
  /* 根据内容自适应高度，不设置固定最小高度 */
  min-height: fit-content;
}

/* ViewMenu: 保持原始宽度（120px/64px）和高度（100%），只改定位 */
.markdown-preview :deep(.manual-demo-inline .view-menu-container) {
  position: relative !important;
  /* 保持原始宽度和高度，不强制 100% */
  width: auto !important;
  height: auto !important;
  /* 根据内容自适应高度 */
  min-height: fit-content;
}

/* ViewMenu: 修复活跃状态的样式，确保背景覆盖整个菜单项 */
.markdown-preview :deep(.manual-demo-inline .view-menu-container .modern-side-menu) {
  /* 确保菜单本身有正确的宽度 */
  width: auto !important;
}

.markdown-preview :deep(.manual-demo-inline .view-menu-container .el-menu-item) {
  /* 确保每个菜单项都有正确的宽度和布局 */
  width: 100% !important;
  box-sizing: border-box !important;
  display: flex !important;
  align-items: center !important;
  padding-left: 20px !important;
  padding-right: 20px !important;
}

.markdown-preview :deep(.manual-demo-inline .view-menu-container .el-menu-item.is-active) {
  background-color: v-bind('activeMenuBgColor') !important;
  color: v-bind('activeMenuTextColor') !important;
  border-radius: 6px !important;
  /* 确保背景覆盖整个菜单项 */
  width: 100% !important;
  box-sizing: border-box !important;
  margin: 2px 0 !important;
}

.markdown-preview :deep(.manual-demo-inline .view-menu-container .el-menu-item.is-active::before) {
  /* 移除 Element Plus 默认的左侧指示条，使用背景色代替 */
  display: none !important;
}

.markdown-preview
  :deep(.manual-demo-inline .view-menu-container .el-menu-item.is-active .icon-wrapper),
.markdown-preview :deep(.manual-demo-inline .view-menu-container .el-menu-item.is-active span) {
  /* 确保内部元素正常显示 */
  position: relative;
  z-index: 1;
}

/* MainTabs: 保持与主窗口顶栏一致的固定高度（34px），只改定位 */
.markdown-preview :deep(.manual-demo-inline .main-tabs-wrapper) {
  position: relative !important;
  height: 34px !important;
  max-height: 34px !important;
  width: 100% !important;
}

/* LeftMenu (UIMenu): 保持原始宽度，高度自适应 */
.markdown-preview :deep(.manual-demo-inline .ui-menu) {
  position: relative !important;
  /* 保持原始宽度（通常由组件内部样式控制），高度自适应 */
  width: auto !important;
  height: auto !important;
  /* 根据内容自适应高度 */
  min-height: fit-content;
}

/* SearchReplaceMenu: 在手册中改为相对定位，防止被挤出容器 */
.markdown-preview :deep(.manual-demo-inline .search-replace-panel) {
  position: relative !important;
  top: auto !important;
  left: auto !important;
  right: auto !important;
  bottom: auto !important;
  /* 确保在容器内完整显示 */
  width: 100% !important;
  max-width: 480px !important;
  margin: 0 auto !important;
  /* 防止被其他元素遮挡 */
  z-index: 10 !important;
}

/* TitleMenu: 在手册中改为相对定位，防止定位问题 */
.markdown-preview :deep(.manual-demo-inline .title-menu-container) {
  position: relative !important;
  top: auto !important;
  left: auto !important;
  right: auto !important;
  bottom: auto !important;
  width: 100% !important;
  max-width: 320px !important;
  margin: 0 auto !important;
}

/* SectionOptimizer: 在手册中改为相对定位，防止定位问题 */
.markdown-preview :deep(.manual-demo-inline .section-optimizer-container) {
  position: relative !important;
  top: auto !important;
  left: auto !important;
  right: auto !important;
  bottom: auto !important;
  width: 100% !important;
  max-width: 400px !important;
  margin: 0 auto !important;
}

/* PdfPreviewPanel: 在手册中限制最大高度 */
.markdown-preview :deep(.manual-demo-inline .pdf-preview-panel) {
  position: relative !important;
  width: 100% !important;
  max-width: 100% !important;
  height: auto !important;
  max-height: 500px !important;
  margin: 0 auto !important;
}

/* ConsoleTerminal / XtermConsole: 在手册中限制最大高度 */
.markdown-preview :deep(.manual-demo-inline .console-terminal),
.markdown-preview :deep(.manual-demo-inline .xterm-console-container) {
  position: relative !important;
  width: 100% !important;
  max-width: 100% !important;
  height: auto !important;
  /* 根据内容自适应高度，移除固定最小高度 */
  min-height: fit-content !important;
  max-height: 400px !important;
  margin: 0 auto !important;
}

/* MetaInfoPanel: 在手册中自适应宽度 */
.markdown-preview :deep(.manual-demo-inline .meta-info-panel) {
  position: relative !important;
  width: 100% !important;
  max-width: 480px !important;
  margin: 0 auto !important;
}

.empty-content {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 400px;
}
</style>

<script lang="ts">
import { themeState } from '../../utils/themes'
export { themeState }
</script>
