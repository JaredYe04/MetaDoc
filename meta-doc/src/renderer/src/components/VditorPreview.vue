<template>
  <div class="vditor-preview-wrapper">
    <!-- 容器始终存在 -->
    <div ref="containerRef" class="vditor-preview-container"></div>

    <!-- Loading 遮罩 -->
    <div v-if="isRendering" class="loading-overlay">
      <Skeleton :rows="15" animated />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { themeState } from '../utils/themes'
import { renderMarkdownPreview, local2fileProtocol } from '../utils/md-utils'
import eventBus from '../utils/event-bus'
import { Skeleton } from '@renderer/components/ui/skeleton'

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    markdown: string
    docPath?: string
  }>(),
  {
    docPath: ''
  }
)

const emit = defineEmits<{ rendered: [container: HTMLElement] }>()
const containerRef = ref<HTMLElement | null>(null)
const isRendering = ref(false)
let linkClickHandler: ((e: MouseEvent) => void) | null = null

// 设置链接点击事件处理器
const setupLinkClickHandler = (container: HTMLElement | null) => {
  if (!container) return

  if (linkClickHandler) {
    container.removeEventListener('click', linkClickHandler)
  }

  linkClickHandler = (e: MouseEvent) => {
    const target = e.target as HTMLElement
    const link = target.closest('a')

    if (link && link.href) {
      if (link.classList.contains('manual-internal-link')) {
        return
      }

      const url = link.href
      if (url.startsWith('http://') || url.startsWith('https://')) {
        e.preventDefault()
        e.stopPropagation()
        eventBus.emit('open-link', url)
      }
    }
  }

  container.addEventListener('click', linkClickHandler)
}

const renderMarkdown = async () => {
  console.log('[VditorPreview] renderMarkdown called', {
    hasMarkdown: !!props.markdown,
    markdownLength: props.markdown?.length,
    hasContainer: !!containerRef.value
  })

  if (!props.markdown || !props.markdown.trim()) {
    console.log('[VditorPreview] Empty markdown, clearing container')
    if (containerRef.value) {
      containerRef.value.innerHTML = ''
    }
    isRendering.value = false
    return
  }

  // 等待容器挂载
  let retries = 0
  while (!containerRef.value && retries < 30) {
    await nextTick()
    await new Promise((resolve) => requestAnimationFrame(resolve))
    retries++
  }

  if (!containerRef.value) {
    console.error('[VditorPreview] Container not found after retries')
    isRendering.value = false
    return
  }

  console.log('[VditorPreview] Starting render')
  isRendering.value = true

  try {
    // 设置主题颜色
    if (themeState.currentTheme) {
      containerRef.value.style.color = themeState.currentTheme.textColor || '#000000'
    }

    // 处理 markdown
    console.log('[VditorPreview] Processing markdown...')
    const processedMarkdown = await local2fileProtocol(props.markdown, props.docPath)
    console.log('[VditorPreview] Markdown processed, length:', processedMarkdown.length)

    // 再次检查容器
    if (!containerRef.value) {
      console.error('[VditorPreview] Container lost during processing')
      return
    }

    // 清空并渲染
    containerRef.value.innerHTML = ''

    console.log('[VditorPreview] Rendering to container...')
    await renderMarkdownPreview(containerRef.value as HTMLDivElement, processedMarkdown, {
      applyMermaidTheme: true,
      linkBase: '',
      renderCode: true,
      renderMath: true
    })
    console.log(
      '[VditorPreview] Render complete, content length:',
      containerRef.value.innerHTML.length
    )

    // 设置链接处理器
    setupLinkClickHandler(containerRef.value)

    // 触发渲染完成事件
    emit('rendered', containerRef.value)
  } catch (error) {
    console.error('[VditorPreview] Render failed:', error)
    if (containerRef.value) {
      containerRef.value.innerHTML = `<p style="color: red; padding: 20px;">${t('vditorPreview.renderFailed', '渲染失败')}: ${error instanceof Error ? error.message : String(error)}</p>`
    }
  } finally {
    console.log('[VditorPreview] Setting isRendering to false')
    isRendering.value = false
  }
}

// 监听 markdown 变化
watch(
  () => props.markdown,
  (newMarkdown, oldMarkdown) => {
    console.log('[VditorPreview] Markdown changed:', {
      newLength: newMarkdown?.length,
      oldLength: oldMarkdown?.length
    })
    renderMarkdown()
  },
  { immediate: false }
)

onMounted(() => {
  console.log('[VditorPreview] onMounted, hasMarkdown:', !!props.markdown)
  renderMarkdown()
})

onBeforeUnmount(() => {
  console.log('[VditorPreview] onBeforeUnmount')
  if (linkClickHandler && containerRef.value) {
    containerRef.value.removeEventListener('click', linkClickHandler)
    linkClickHandler = null
  }
})
</script>

<style scoped>
.vditor-preview-wrapper {
  width: 100%;
  height: 100%;
  min-height: 100px;
  position: relative;
}

.vditor-preview-container {
  width: 100%;
  min-height: 100px;
  padding: 16px;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: hsl(var(--background));
  padding: 16px;
  z-index: 10;
}
</style>
