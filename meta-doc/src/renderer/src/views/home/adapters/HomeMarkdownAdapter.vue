<template>
  <ScrollArea class="home-panel-scrollbar" :show-horizontal-scrollbar="false">
    <div class="home-panel-content">
      <DocumentMetaSection
        :title="metaTitle || $t('article.no_title')"
        :meta-author="metaAuthor"
        :meta-description="metaDescription"
        :show-author-meta="true"
      />
      <div class="document-content-section">
        <Skeleton v-show="isRendering" :rows="15" animated class="content-preview-skeleton" />
        <div
          v-show="!isRendering"
          ref="previewContainerRef"
          class="content-preview"
          :class="themeState.currentTheme.mdeditorClass"
          :style="previewZoomStyle"
        ></div>
      </div>
    </div>
  </ScrollArea>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import DocumentMetaSection from './DocumentMetaSection.vue'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { renderMarkdownPreview, local2fileProtocol, local2httpProtocol } from '../../../utils/md-utils'
import { themeState } from '../../../utils/themes'
import eventBus from '@renderer/utils/event-bus'

const { t } = useI18n()

const props = defineProps<{
  markdown: string
  linkBase: string
  docPath: string
  metaTitle?: string
  metaAuthor?: string
  metaDescription?: string
  openSystemTab: (path: string, title: string) => unknown
}>()

const previewContainerRef = ref<HTMLElement | null>(null)
const isRendering = ref(false)

const zoomScale = ref(1)
const previewZoomStyle = computed(() => ({
  // transform: scale() 只缩放视觉，不会触发布局重排；会导致缩放后仍按旧宽度换行
  // Electron/Chromium 下使用 zoom 会触发布局重排，缩放时换行/表格布局会随容器宽度重新计算
  zoom: zoomScale.value
}))

function clampZoom(v: number) {
  return Math.max(0.5, Math.min(3, Math.round(v * 10) / 10))
}

let handleZoomShortcut: ((payload?: unknown) => void) | null = null

const renderPreview = async () => {
  if (!previewContainerRef.value) return

  let markdown = props.markdown

  if (!markdown || markdown.trim() === '') {
    const container = previewContainerRef.value as HTMLDivElement
    const primaryColor = themeState.currentTheme.primaryColor || '#6366f1'
    container.innerHTML = `
      <div style="
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        min-height: 200px;
        color: ${themeState.currentTheme.textColor};
        opacity: 0.5;
        font-size: 14px;
        text-align: center;
        padding: 24px;
        gap: 16px;
      ">
        <p style="margin: 0;">${t('home.emptyContent') || '文档内容为空'}</p>
        <button class="quick-start-button" style="
          margin-top: 8px;
          padding: 10px 20px;
          background-color: ${primaryColor};
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s ease;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        ">
          ${t('home.quickStartButton') || '快速生成内容'}
        </button>
      </div>
    `
    nextTick(() => {
      const button = container.querySelector('.quick-start-button') as HTMLButtonElement
      if (button) {
        button.addEventListener('mouseenter', () => {
          button.style.opacity = '0.9'
          button.style.transform = 'translateY(-1px)'
          button.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)'
        })
        button.addEventListener('mouseleave', () => {
          button.style.opacity = '1'
          button.style.transform = 'translateY(0)'
          button.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)'
        })
        button.addEventListener('click', () => {
          props.openSystemTab('/global-home', t('headMenu.home') || '主页')
        })
      }
    })
    isRendering.value = false
    return
  }

  try {
    isRendering.value = true
    markdown = await local2httpProtocol(markdown, props.docPath)
    const processedMarkdown = await local2fileProtocol(markdown, props.docPath)

    await nextTick()
    await new Promise((resolve) => requestAnimationFrame(resolve))
    await nextTick()

    let container = previewContainerRef.value as HTMLDivElement | null
    if (!container) {
      await nextTick()
      await new Promise((resolve) => requestAnimationFrame(resolve))
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 100))
      container = previewContainerRef.value as HTMLDivElement | null
    }

    if (!container) {
      isRendering.value = false
      return
    }

    try {
      await renderMarkdownPreview(container, processedMarkdown, {
        linkBase: props.linkBase,
        renderCode: true,
        renderMath: true,
        applyMermaidTheme: true
      })
      await nextTick()
      await new Promise((resolve) => requestAnimationFrame(resolve))
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 200))

      const finalContainer = previewContainerRef.value as HTMLDivElement | null
      if (finalContainer && (!finalContainer.innerHTML || !finalContainer.innerHTML.trim())) {
        finalContainer.innerHTML = '<p>正在加载预览...</p>'
        await renderMarkdownPreview(finalContainer, processedMarkdown, {
          linkBase: props.linkBase,
          renderCode: true,
          renderMath: true,
          applyMermaidTheme: true
        })
        await nextTick()
        await new Promise((resolve) => setTimeout(resolve, 300))
        const checkContainer = previewContainerRef.value || finalContainer
        if (!checkContainer.innerHTML?.trim()) {
          checkContainer.innerHTML = `<p style="color: var(--console-err, #fe8771);">预览渲染失败，请刷新页面重试</p>`
        }
      }
    } catch (renderError) {
      console.error('renderMarkdownPreview 执行出错', renderError)
      throw renderError
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const container = previewContainerRef.value
    if (container) {
      container.innerHTML = `
        <div style="
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          min-height: 200px;
          color: ${themeState.currentTheme.textColor};
          opacity: 0.7;
          font-size: 14px;
          text-align: center;
          padding: 24px;
        ">
          <p style="margin: 0; color: var(--console-err, #fe8771);">渲染失败: ${errorMessage}</p>
          <p style="margin: 8px 0 0 0; font-size: 12px; opacity: 0.6;">请检查文档内容或刷新页面重试</p>
        </div>
      `
    }
  } finally {
    isRendering.value = false
  }
}

watch(
  () => [props.markdown, props.docPath, props.linkBase],
  () => renderPreview(),
  { immediate: false }
)

// 应用主题 / 代码高亮主题变化时重新预览，避免全局 hljs 样式切换后主页仍沿用旧渲染
watch(
  () =>
    [
      themeState.currentTheme.type,
      themeState.currentTheme.codeTheme,
      themeState.currentTheme.vditorTheme
    ] as const,
  () => {
    if (!props.markdown?.trim()) return
    renderPreview()
  }
)

onMounted(() => {
  nextTick(() => {
    nextTick(() => renderPreview())
  })

  handleZoomShortcut = (payload?: unknown) => {
    const p = payload as { action?: 'zoomIn' | 'zoomOut' | 'zoomReset' } | undefined
    if (!p?.action) return
    if (p.action === 'zoomIn') zoomScale.value = clampZoom(zoomScale.value + 0.1)
    else if (p.action === 'zoomOut') zoomScale.value = clampZoom(zoomScale.value - 0.1)
    else if (p.action === 'zoomReset') zoomScale.value = 1
  }
  eventBus.on('zoom-shortcut', handleZoomShortcut as (payload?: unknown) => void)
})

onUnmounted(() => {
  if (handleZoomShortcut) {
    eventBus.off('zoom-shortcut', handleZoomShortcut as (payload?: unknown) => void)
    handleZoomShortcut = null
  }
})
</script>

<style scoped>
.home-panel-scrollbar {
  flex: 1;
  width: 100%;
  height: 100%;
}

.home-panel-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 32px 40px;
  box-sizing: border-box;
  gap: 24px;
}

.document-content-section {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.content-preview {
  flex: 1;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: 24px;
  box-sizing: border-box;
  word-wrap: break-word;
  overflow-wrap: break-word;
  overflow-x: hidden;
  line-height: 1.7;
  font-size: 15px;
  min-height: 0;
  /* 与主题正文色一致；勿对整树使用 * { color: inherit }，否则会压过 hljs（见 MarkdownEditor.vue） */
  color: v-bind('themeState.currentTheme.textColor');
}

/* Vditor 预览根：限制在容器宽度内换行，避免出现整页级横向滚动 */
.content-preview :deep(.vditor-reset) {
  max-width: 100%;
  overflow-wrap: break-word;
  word-break: break-word;
}

/* 固定布局 + 占满容器宽度，列宽可被压缩，单元格内长文/URL 会换行而不是单行撑开 */
.content-preview :deep(table) {
  width: 100%;
  max-width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  display: table;
}

.content-preview :deep(th),
.content-preview :deep(td) {
  white-space: normal;
  vertical-align: top;
  overflow-wrap: anywhere;
  word-break: break-word;
  /* 固定布局下允许列收缩，避免长连续字符把单元格撑成一行 */
  min-width: 0;
}

/* 单元格内的代码/预格式化块也允许换行 */
.content-preview :deep(td pre),
.content-preview :deep(td code),
.content-preview :deep(th pre),
.content-preview :deep(th code) {
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
}

/* 代码块过长时在块内滚动，不把整页撑宽 */
.content-preview :deep(pre) {
  max-width: 100%;
  overflow-x: auto;
  box-sizing: border-box;
}

/* 块级公式过宽时在公式容器内横向滚动 */
.content-preview :deep(.katex-display) {
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
}

.content-preview :deep(img) {
  max-width: 100%;
  height: auto;
  vertical-align: middle;
}

.content-preview :deep(svg) {
  max-width: 100%;
  height: auto;
}

.content-preview-skeleton {
  flex: 1;
  width: 100%;
  min-height: 0;
  padding: 24px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
}

.content-preview-skeleton :deep(> div) {
  height: 20px;
  margin-bottom: 16px;
  border-radius: 4px;
}

.content-preview-skeleton :deep(> div:last-child) {
  width: 60%;
}
</style>
