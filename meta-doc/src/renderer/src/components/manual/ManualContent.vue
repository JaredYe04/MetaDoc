<template>
  <div class="manual-content">
    <ManualBreadcrumb />
    <el-scrollbar ref="scrollbarRef" class="content-scrollbar" @scroll="onContentScroll">
      <div class="content-wrapper">
        <div v-if="processedContent && processedContent.trim()" class="markdown-wrapper">
          <VditorPreview
            :markdown="processedContent"
            :key="`content-${currentArticleId}-${locale}`"
            class="markdown-preview"
            @rendered="handleRendered"
          />
        </div>
        <div v-else class="empty-content">
          <Empty :description="$t('userManual.emptyContent') || '暂无内容'" />
        </div>
      </div>
    </el-scrollbar>
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
import { parseInternalLinks } from '../../manuals/utils'
import { preprocessMarkdownWithDemoPlaceholders } from '../../manuals/demo-mode'
import { getDemoComponent } from '../../manuals/demo-registry'
import { themeState } from '../../utils/themes'
import { mixColors } from '../../utils/themes'
import VditorPreview from '../VditorPreview.vue'
import ManualBreadcrumb from './ManualBreadcrumb.vue'
import { Empty } from '@renderer/components/ui/empty'

const { locale } = useI18n()
const { currentArticleContent, currentArticleId, setCurrentArticle, markArticleAsRead } =
  useUserManual()

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

// 在 setup 顶层捕获 appContext，事件回调中 getCurrentInstance() 可能为 null
const capturedAppContext = getCurrentInstance()?.appContext ?? null

const scrollbarRef = ref<InstanceType<typeof import('element-plus').ElScrollbar> | null>(null)
const hasMarkedReadForArticle = ref<string | null>(null)

// 先占位符替换再交给 Vditor，不破坏 Mermaid 等渲染；渲染完成后再把占位 div 替换成 Vue 组件
const processedContent = computed(() =>
  preprocessMarkdownWithDemoPlaceholders(currentArticleContent.value ?? '')
)

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
  if (processTimer) clearTimeout(processTimer)
  const targetContainer = container ?? document.querySelector('.vditor-preview-container')
  processTimer = setTimeout(() => {
    nextTick(async () => {
      // 确保滚动位置在顶部（避免切换文章时保留滚动位置）
      resetScrollPosition()
      processInternalLinks()
      await injectDemoComponents(capturedAppContext, targetContainer as HTMLElement | null)
      // 设置高度监听器，在内容高度稳定后检查是否需要自动标记
      setupHeightObserver()
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
watch([processedContent, currentArticleId], () => {
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
      processInternalLinks()
      // 高度监听器会在 handleRendered 中设置
    })
  }, 200)
})

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

// 处理内部链接：在渲染后的 DOM 中查找并替换
function processInternalLinks() {
  const content = currentArticleContent.value
  if (!content) return

  const containers = Array.from(document.querySelectorAll('.vditor-preview-container'))
  if (containers.length === 0) return

  const links = parseInternalLinks(content)
  if (links.length === 0) return

  for (const container of containers) {
    const existingLinks = container.querySelectorAll('.manual-internal-link')
    existingLinks.forEach((link) => {
      const text = link.textContent || ''
      const parent = link.parentNode
      if (parent) {
        parent.replaceChild(document.createTextNode(text), link)
        parent.normalize()
      }
    })

    function isInCodeBlock(node: Node): boolean {
      let checkNode: Node | null = node
      while (checkNode && checkNode !== container) {
        if (checkNode.nodeType === Node.ELEMENT_NODE) {
          const element = checkNode as Element
          if (element.tagName === 'CODE' || element.tagName === 'PRE') return true
        }
        checkNode = checkNode.parentNode
      }
      return false
    }

    function replaceTextInNode(
      node: Node,
      link: ReturnType<typeof parseInternalLinks>[0]
    ): boolean {
      if (isInCodeBlock(node)) return false
      if (node.nodeType === Node.TEXT_NODE) {
        const textNode = node as Text
        const text = textNode.textContent || ''
        const parent = textNode.parentElement
        if (parent?.tagName === 'A' && parent.classList.contains('manual-internal-link'))
          return false
        let index = text.indexOf(link.fullMatch)
        let matchLength = link.fullMatch.length
        let replaceText = link.displayText
        if (index < 0) {
          index = text.indexOf(link.displayText)
          matchLength = link.displayText.length
        }
        if (index < 0) return false
        const linkElement = document.createElement('a')
        linkElement.className = 'manual-internal-link'
        linkElement.setAttribute('data-article-id', link.articleId)
        linkElement.textContent = replaceText
        linkElement.href = '#'
        linkElement.style.color = 'var(--el-color-primary, #409EFF)'
        linkElement.style.textDecoration = 'none'
        linkElement.style.borderBottom = '1px solid var(--el-color-primary, #409EFF)'
        linkElement.style.cursor = 'pointer'
        linkElement.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          setCurrentArticle(link.articleId, 'link')
        })
        const beforeText = text.substring(0, index)
        const afterText = text.substring(index + matchLength)
        const fragment = document.createDocumentFragment()
        if (beforeText) fragment.appendChild(document.createTextNode(beforeText))
        fragment.appendChild(linkElement)
        if (afterText) fragment.appendChild(document.createTextNode(afterText))
        textNode.parentNode?.replaceChild(fragment, textNode)
        return true
      }
      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element
        if (element.tagName === 'A' && element.classList.contains('manual-internal-link'))
          return false
        if (element.tagName === 'CODE' || element.tagName === 'PRE') return false
        const children = Array.from(element.childNodes).reverse()
        for (const child of children) {
          if (replaceTextInNode(child, link)) return true
        }
      }
      return false
    }

    for (const link of links.reverse()) {
      replaceTextInNode(container, link)
    }
  }
}
</script>

<style scoped>
.manual-content {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: v-bind('themeState.currentTheme.background');
}

.content-scrollbar {
  flex: 1;
  height: 100%;
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
  /* 确保内部容器能完整显示 */
  min-height: 600px;
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
  min-height: 500px;
}

/* ViewMenu: 保持原始宽度（120px/64px）和高度（100%），只改定位 */
.markdown-preview :deep(.manual-demo-inline .view-menu-container) {
  position: relative !important;
  /* 保持原始宽度和高度，不强制 100% */
  width: auto !important;
  height: auto !important;
  min-height: 200px;
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

/* MainTabs: 保持原始固定高度（40px），只改定位 */
.markdown-preview :deep(.manual-demo-inline .main-tabs-wrapper) {
  position: relative !important;
  /* 保持原始高度：height: 40px; max-height: 40px */
  height: 40px !important;
  max-height: 40px !important;
  width: 100% !important;
}

/* LeftMenu (UIMenu): 保持原始宽度，高度自适应 */
.markdown-preview :deep(.manual-demo-inline .ui-menu) {
  position: relative !important;
  /* 保持原始宽度（通常由组件内部样式控制），高度自适应 */
  width: auto !important;
  height: auto !important;
  min-height: 300px;
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

/* ConsoleTerminal: 在手册中限制最大高度 */
.markdown-preview :deep(.manual-demo-inline .console-terminal) {
  position: relative !important;
  width: 100% !important;
  max-width: 100% !important;
  height: auto !important;
  min-height: 200px !important;
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
