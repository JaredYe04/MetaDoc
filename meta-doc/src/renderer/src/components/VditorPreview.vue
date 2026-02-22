<template>
  <div class="vditor-preview-wrapper">
    <Skeleton :loading="isRendering" :rows="15" animated class="vditor-preview-skeleton">
      <div ref="containerRef" class="vditor-preview-container"></div>
    </Skeleton>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { themeState } from '../utils/themes'
import { renderMarkdownPreview, local2fileProtocol } from '../utils/md-utils'
import eventBus from '../utils/event-bus'
import { Skeleton } from '@renderer/components/ui/skeleton'

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

// 渲染锁 - 防止并发渲染
let isRenderLocked = false

/**
 * 设置链接点击事件处理器
 */
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
  if (isRenderLocked) {
    console.log('[VditorPreview] Render locked, skipping')
    return
  }

  if (!props.markdown || !props.markdown.trim()) {
    isRendering.value = false
    await nextTick()
    if (containerRef.value) {
      if (linkClickHandler) {
        containerRef.value.removeEventListener('click', linkClickHandler)
        linkClickHandler = null
      }
      containerRef.value.innerHTML = ''
    }
    return
  }

  // 等待容器挂载
  let retries = 0
  while (!containerRef.value && retries < 20) {
    await nextTick()
    await new Promise((resolve) => requestAnimationFrame(resolve))
    retries++
  }

  if (!containerRef.value) {
    console.warn('[VditorPreview] Container not found')
    return
  }

  isRenderLocked = true
  console.log('[VditorPreview] Starting render')

  try {
    isRendering.value = true

    if (containerRef.value && themeState.currentTheme) {
      containerRef.value.style.color = themeState.currentTheme.textColor || '#000000'
    }

    const processedMarkdown = await local2fileProtocol(props.markdown, props.docPath)

    if (!containerRef.value) {
      console.log('[VditorPreview] Container lost after local2fileProtocol')
      return
    }

    await nextTick()
    await new Promise((resolve) => requestAnimationFrame(resolve))
    await nextTick()

    if (!containerRef.value) {
      console.log('[VditorPreview] Container lost after waiting')
      return
    }

    const isManualContext = containerRef.value?.closest('.manual-content') !== null
    console.log('[VditorPreview] Calling renderMarkdownPreview...')
    await renderMarkdownPreview(containerRef.value as HTMLDivElement, processedMarkdown, {
      applyMermaidTheme: isManualContext,
      linkBase: '',
      renderCode: true,
      renderMath: true
    })
    console.log('[VditorPreview] renderMarkdownPreview done')

    setupLinkClickHandler(containerRef.value)
    const container = containerRef.value
    if (container) {
      emit('rendered', container)
    }
  } catch (error) {
    console.error('[VditorPreview] Render failed:', error)
    if (containerRef.value) {
      containerRef.value.innerHTML = `<p style="color: var(--el-color-danger);">渲染失败: ${error instanceof Error ? error.message : String(error)}</p>`
    }
  } finally {
    isRendering.value = false
    isRenderLocked = false
    console.log('[VditorPreview] Render complete')
  }
}

// 监听 Markdown 内容变化
watch(
  () => props.markdown,
  (newMarkdown, oldMarkdown) => {
    if (newMarkdown !== oldMarkdown) {
      renderMarkdown()
    }
  },
  { immediate: false }
)

onMounted(() => {
  console.log('[VditorPreview] onMounted')
  if (props.markdown && props.markdown.trim()) {
    renderMarkdown()
  }
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
  display: flex;
  flex-direction: column;
  min-height: 100px;
}

.vditor-preview-container {
  width: 100%;
  min-height: 100px;
  padding: 16px;
  flex: 1;
}

.vditor-preview-skeleton {
  flex: 1;
  width: 100%;
  padding: 16px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
}

.vditor-preview-skeleton :deep(.bg-muted) {
  height: 20px;
  margin-bottom: 16px;
  border-radius: 4px;
}

.vditor-preview-skeleton :deep(.bg-muted:last-child) {
  width: 60%;
}
</style>
