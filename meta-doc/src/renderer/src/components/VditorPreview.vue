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

/**
 * 设置链接点击事件处理器
 * 拦截容器内所有链接的点击，如果是外部链接（http/https），则在系统浏览器中打开
 */
const setupLinkClickHandler = (container: HTMLElement | null) => {
  if (!container) {
    console.warn('VditorPreview: setupLinkClickHandler called with null container')
    return
  }

  // 移除之前的事件监听器（如果存在）
  if (linkClickHandler) {
    container.removeEventListener('click', linkClickHandler)
  }

  // 创建新的事件处理器
  linkClickHandler = (e: MouseEvent) => {
    const target = e.target as HTMLElement
    // 查找最近的 <a> 标签
    const link = target.closest('a')

    if (link && link.href) {
      // 跳过内部链接（manual-internal-link）
      if (link.classList.contains('manual-internal-link')) {
        return // 让内部链接的事件处理器处理
      }

      const url = link.href

      // 判断是否为外部链接（http/https）
      if (url.startsWith('http://') || url.startsWith('https://')) {
        e.preventDefault()
        e.stopPropagation()

        // 使用 eventBus 在系统浏览器中打开链接
        eventBus.emit('open-link', url)
      }
      // 对于其他类型的链接（如锚点链接、file:// 协议等），保持默认行为
    }
  }

  // 添加事件监听器
  container.addEventListener('click', linkClickHandler)
}

// 防抖函数
function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  return function (this: any, ...args: Parameters<T>) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      fn.apply(this, args)
    }, delay)
  }
}

// 组件挂载状态 - 必须在 setup 内定义，确保每个实例独立
const isMounted = ref(true)
onBeforeUnmount(() => {
  isMounted.value = false
})

const renderMarkdown = async () => {
  console.log('[VditorPreview] renderMarkdown called', {
    isMounted: isMounted.value,
    hasMarkdown: !!props.markdown,
    markdownLength: props.markdown?.length,
    hasContainer: !!containerRef.value,
    docPath: props.docPath
  })

  // 检查组件是否仍然挂载
  if (!isMounted.value) {
    console.log('[VditorPreview] Early return: isMounted is false')
    isRendering.value = false
    return
  }

  if (!props.markdown || !props.markdown.trim()) {
    console.log('[VditorPreview] Early return: markdown is empty')
    isRendering.value = false
    // 清空容器并移除事件监听器
    await nextTick()
    if (containerRef.value) {
      // 移除事件监听器
      if (linkClickHandler) {
        containerRef.value.removeEventListener('click', linkClickHandler)
        linkClickHandler = null
      }
      containerRef.value.innerHTML = ''
    }
    return
  }

  // 等待容器挂载，多次尝试确保容器已准备好
  let retries = 0
  console.log('[VditorPreview] Waiting for container...')
  while (!containerRef.value && retries < 20) {
    await nextTick()
    await new Promise((resolve) => requestAnimationFrame(resolve))
    retries++
  }

  if (!containerRef.value) {
    console.warn('[VditorPreview] 容器元素未找到，重试次数:', retries)
    isRendering.value = false
    return
  }

  console.log('[VditorPreview] Container found, starting render...')

  try {
    isRendering.value = true
    console.log('[VditorPreview] isRendering set to true')

    // 设置容器文字颜色
    if (containerRef.value && themeState.currentTheme) {
      containerRef.value.style.color = themeState.currentTheme.textColor || '#000000'
    }

    // 预览组件需要 file:// 协议，以便浏览器能够加载本地图片
    // local2fileProtocol 可以处理：
    // - 相对路径（通过 docPath 解析）
    // - 绝对路径
    // - HTTP URL（会保持原样，但预览时可能无法加载，建议先转本地路径）
    // 注意：如果输入包含 HTTP URL（如预渲染的图表），可能需要先转换为本地路径
    console.log('[VditorPreview] Calling local2fileProtocol...')
    const processedMarkdown = await local2fileProtocol(props.markdown, props.docPath)
    console.log('[VditorPreview] local2fileProtocol done', {
      processedLength: processedMarkdown?.length
    })

    // 检查组件是否仍然挂载（快速切换文章时的正常情况）
    if (!isMounted.value || !containerRef.value) {
      console.log('[VditorPreview] Early return after local2fileProtocol: unmounted')
      isRendering.value = false
      return
    }

    // 再次检查容器是否存在（防止异步过程中被销毁）
    await nextTick()

    // 检查组件是否仍然挂载（快速切换文章时的正常情况）
    if (!isMounted.value || !containerRef.value) {
      console.log('[VditorPreview] Early return after nextTick: unmounted')
      isRendering.value = false
      return
    }

    await new Promise((resolve) => requestAnimationFrame(resolve))

    // 检查组件是否仍然挂载（快速切换文章时的正常情况）
    if (!isMounted.value || !containerRef.value) {
      console.log('[VditorPreview] Early return after requestAnimationFrame: unmounted')
      isRendering.value = false
      return
    }

    await nextTick()

    if (!isMounted.value || !containerRef.value) {
      console.log('[VditorPreview] Early return after second nextTick: unmounted')
      isRendering.value = false
      return
    }

    // 使用统一的 Markdown 预览渲染函数
    // 用户手册需要应用 Mermaid 主题适配，其他场景不需要
    const isManualContext = containerRef.value?.closest('.manual-content') !== null
    console.log('[VditorPreview] Calling renderMarkdownPreview...', { isManualContext })
    await renderMarkdownPreview(containerRef.value as HTMLDivElement, processedMarkdown, {
      applyMermaidTheme: isManualContext,
      linkBase: '',
      renderCode: true,
      renderMath: true
    })
    console.log('[VditorPreview] renderMarkdownPreview done')

    // 添加链接点击事件监听器，使外部链接在系统浏览器中打开
    setupLinkClickHandler(containerRef.value)
    const container = containerRef.value
    if (container) {
      console.log('[VditorPreview] Emitting rendered event')
      emit('rendered', container)
    }
  } catch (error) {
    console.error('[VditorPreview] 渲染 Markdown 失败:', error)
    if (containerRef.value) {
      containerRef.value.innerHTML = `<p style="color: var(--el-color-danger);">渲染失败: ${error instanceof Error ? error.message : String(error)}</p>`
    }
  } finally {
    isRendering.value = false
    console.log('[VditorPreview] isRendering set to false')
  }
}

// 防抖的 renderMarkdown
const debouncedRenderMarkdown = debounce(renderMarkdown, 100)

// 监听 Markdown 内容变化和主题变化
watch(
  [() => props.markdown, () => themeState.currentTheme?.type],
  async ([newMarkdown, newThemeType], [oldMarkdown, oldThemeType]) => {
    console.log('[VditorPreview] Watch triggered', {
      markdownChanged: newMarkdown !== oldMarkdown,
      themeChanged: newThemeType !== oldThemeType,
      hasMarkdown: !!newMarkdown,
      markdownLength: newMarkdown?.length,
      isMounted: isMounted.value
    })
    if (!props.markdown || !props.markdown.trim()) {
      console.log('[VditorPreview] Watch: markdown is empty, clearing')
      isRendering.value = false
      if (containerRef.value) {
        // 移除事件监听器
        if (linkClickHandler) {
          containerRef.value.removeEventListener('click', linkClickHandler)
          linkClickHandler = null
        }
        containerRef.value.innerHTML = ''
      }
      return
    }
    // 等待DOM更新完成
    console.log('[VditorPreview] Watch: waiting for DOM updates...')
    await nextTick()
    await new Promise((resolve) => requestAnimationFrame(resolve))
    await nextTick()
    console.log('[VditorPreview] Watch: calling debouncedRenderMarkdown')
    debouncedRenderMarkdown()
  },
  { immediate: false }
)

onMounted(async () => {
  console.log('[VditorPreview] onMounted', {
    isMounted: isMounted.value,
    hasMarkdown: !!props.markdown,
    markdownLength: props.markdown?.length
  })
  // 等待DOM完全挂载
  await nextTick()
  await new Promise((resolve) => requestAnimationFrame(resolve))
  await nextTick()
  console.log('[VditorPreview] onMounted: DOM ready, hasContainer:', !!containerRef.value)
  if (props.markdown && props.markdown.trim()) {
    console.log('[VditorPreview] onMounted: calling debouncedRenderMarkdown')
    debouncedRenderMarkdown()
  } else {
    console.log('[VditorPreview] onMounted: no markdown to render')
  }
})

onBeforeUnmount(() => {
  // 清理事件监听器
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
