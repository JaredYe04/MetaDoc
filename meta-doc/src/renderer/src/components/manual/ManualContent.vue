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
          <el-empty :description="$t('userManual.emptyContent') || '暂无内容'" />
        </div>
      </div>
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, getCurrentInstance, nextTick, createVNode, render, onBeforeUnmount, type AppContext } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUserManual } from '../../stores/userManual'
import { parseInternalLinks } from '../../manuals/utils'
import { preprocessMarkdownWithDemoPlaceholders } from '../../manuals/demo-mode'
import { getDemoComponent } from '../../manuals/demo-registry'
import VditorPreview from '../VditorPreview.vue'
import ManualBreadcrumb from './ManualBreadcrumb.vue'

const { locale } = useI18n()
const { currentArticleContent, currentArticleId, setCurrentArticle, markArticleAsRead } = useUserManual()

// 在 setup 顶层捕获 appContext，事件回调中 getCurrentInstance() 可能为 null
const capturedAppContext = getCurrentInstance()?.appContext ?? null

const scrollbarRef = ref<InstanceType<typeof import('element-plus').ElScrollbar> | null>(null)
const hasMarkedReadForArticle = ref<string | null>(null)

// 先占位符替换再交给 Vditor，不破坏 Mermaid 等渲染；渲染完成后再把占位 div 替换成 Vue 组件
const processedContent = computed(() => preprocessMarkdownWithDemoPlaceholders(currentArticleContent.value ?? ''))

const BOTTOM_THRESHOLD = 80

function onContentScroll({ scrollTop, scrollLeft }: { scrollTop: number; scrollLeft: number }) {
  const id = currentArticleId.value
  if (!id || hasMarkedReadForArticle.value === id) return
  const scrollbar = scrollbarRef.value?.$el
  if (!scrollbar) return
  const wrap = scrollbar.querySelector('.el-scrollbar__wrap') as HTMLElement | null
  if (!wrap) return
  const { scrollHeight, clientHeight } = wrap
  if (scrollTop + clientHeight >= scrollHeight - BOTTOM_THRESHOLD) {
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
      processInternalLinks()
      await injectDemoComponents(capturedAppContext, targetContainer as HTMLElement | null)
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

// 监听内容变化，延迟处理内部链接（等待渲染完成）
watch([processedContent, currentArticleId], () => {
  hasMarkedReadForArticle.value = null
  if (processTimer) {
    clearTimeout(processTimer)
  }
  processTimer = setTimeout(() => {
    nextTick(() => {
      processInternalLinks()
    })
  }, 200)
})

onBeforeUnmount(() => {
  if (processTimer) {
    clearTimeout(processTimer)
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
    existingLinks.forEach(link => {
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

    function replaceTextInNode(node: Node, link: ReturnType<typeof parseInternalLinks>[0]): boolean {
      if (isInCodeBlock(node)) return false
      if (node.nodeType === Node.TEXT_NODE) {
        const textNode = node as Text
        const text = textNode.textContent || ''
        const parent = textNode.parentElement
        if (parent?.tagName === 'A' && parent.classList.contains('manual-internal-link')) return false
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
        if (element.tagName === 'A' && element.classList.contains('manual-internal-link')) return false
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
  background-color: v-bind('themeState.currentTheme.background2nd || "transparent"');
}

/* 手册内 Demo：样式与交互均在此处统一处理，不依赖各组件内部逻辑 */
.markdown-preview :deep(.manual-demo-inline) {
  position: relative;
  width: 100%;
  overflow: auto;
  isolation: isolate;
  /* 阻断指针事件，防止触发组件内业务逻辑（配合 JS 中 blockDemoEvents 的捕获阶段拦截） */
  pointer-events: none;
}

.markdown-preview :deep(.manual-demo-inline *) {
  pointer-events: none;
}

/* 任意 Demo 组件根在手册内均强制内联（防止 fixed/absolute 浮层） */
.markdown-preview :deep(.manual-demo-inline > *) {
  position: relative !important;
  width: 100% !important;
  height: auto !important;
  max-height: none;
}

/* 各 Demo 组件根在手册内强制内联展示（覆盖其原有的 fixed/absolute/全屏样式） */
.markdown-preview :deep(.manual-demo-inline .quick-start-panel-wrapper),
.markdown-preview :deep(.manual-demo-inline .quick-start-overlay) {
  position: relative !important;
  top: auto !important;
  left: auto !important;
  right: auto !important;
  bottom: auto !important;
  width: 100% !important;
  height: auto !important;
  min-height: 200px;
  max-height: 420px;
}

.markdown-preview :deep(.manual-demo-inline .quick-start-panel-wrapper) {
  padding: 16px;
}

.markdown-preview :deep(.manual-demo-inline .view-menu-container),
.markdown-preview :deep(.manual-demo-inline .main-tabs-wrapper) {
  position: relative !important;
  width: 100% !important;
  height: auto !important;
  min-height: 0;
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
