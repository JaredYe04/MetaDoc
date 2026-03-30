<template>
  <ScrollArea class="home-panel-scrollbar">
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
          :style="{ color: themeState.currentTheme.textColor }"
        ></div>
      </div>
    </div>
  </ScrollArea>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import DocumentMetaSection from './DocumentMetaSection.vue'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { renderMarkdownPreview, local2fileProtocol, local2httpProtocol } from '../../../utils/md-utils'
import { themeState } from '../../../utils/themes'
import eventBus from '../../../utils/event-bus'

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
          nextTick(() => {
            nextTick(() => {
              setTimeout(() => eventBus.emit('open-quickstart'), 150)
            })
          })
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
        renderMath: true
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
          renderMath: true
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

onMounted(() => {
  nextTick(() => {
    nextTick(() => renderPreview())
  })
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
  /* 不裁剪，便于宽表格把 scrollWidth 传给外层 ScrollArea 显示横向滚动条 */
  overflow: visible;
}

.content-preview {
  flex: 1;
  width: 100%;
  min-width: max-content;
  padding: 24px;
  box-sizing: border-box;
  word-wrap: break-word;
  overflow-wrap: break-word;
  line-height: 1.7;
  font-size: 15px;
  min-height: 0;
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
