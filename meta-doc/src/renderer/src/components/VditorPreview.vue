<template>
  <div class="vditor-preview-wrapper">
    <el-skeleton
      v-if="isRendering"
      :rows="15"
      animated
      class="vditor-preview-skeleton"
    />
    <div v-show="!isRendering" ref="containerRef" class="vditor-preview-container"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { themeState } from '../utils/themes'
import { renderMarkdownPreview, local2fileProtocol } from '../utils/md-utils'
import eventBus from '../utils/event-bus'

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

const renderMarkdown = async () => {
  if (!props.markdown || !props.markdown.trim()) {
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
  while (!containerRef.value && retries < 20) {
    await nextTick()
    await new Promise(resolve => requestAnimationFrame(resolve))
    retries++
  }

  if (!containerRef.value) {
    console.warn('VditorPreview: 容器元素未找到，重试次数:', retries)
    isRendering.value = false
    return
  }

  try {
    isRendering.value = true

    // 设置容器文字颜色
    if (containerRef.value) {
      containerRef.value.style.color = themeState.currentTheme.textColor
    }

    // 预览组件需要 file:// 协议，以便浏览器能够加载本地图片
    // local2fileProtocol 可以处理：
    // - 相对路径（通过 docPath 解析）
    // - 绝对路径
    // - HTTP URL（会保持原样，但预览时可能无法加载，建议先转本地路径）
    // 注意：如果输入包含 HTTP URL（如预渲染的图表），可能需要先转换为本地路径
    const processedMarkdown = await local2fileProtocol(props.markdown, props.docPath)

    // 再次检查容器是否存在（防止异步过程中被销毁）
    await nextTick()
    await new Promise(resolve => requestAnimationFrame(resolve))
    await nextTick()
    
    if (!containerRef.value) {
      console.warn('VditorPreview: 容器元素在渲染过程中被销毁')
      isRendering.value = false
      return
    }

    // 使用统一的 Markdown 预览渲染函数
    await renderMarkdownPreview(containerRef.value as HTMLDivElement, processedMarkdown)
    
    // 添加链接点击事件监听器，使外部链接在系统浏览器中打开
    setupLinkClickHandler(containerRef.value)
    const container = containerRef.value
    if (container) emit('rendered', container)
  } catch (error) {
    console.error('渲染 Markdown 失败:', error)
    if (containerRef.value) {
      containerRef.value.innerHTML = `<p style="color: var(--el-color-danger);">渲染失败: ${error instanceof Error ? error.message : String(error)}</p>`
    }
  } finally {
    isRendering.value = false
  }
}

// 监听 Markdown 内容变化和主题变化
watch(
  [() => props.markdown, () => themeState.currentTheme.type],
  async () => {
    if (!props.markdown || !props.markdown.trim()) {
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
    await nextTick()
    await new Promise(resolve => requestAnimationFrame(resolve))
    await nextTick()
    renderMarkdown()
  },
  { immediate: false }
)

onMounted(async () => {
  // 等待DOM完全挂载
  await nextTick()
  await new Promise(resolve => requestAnimationFrame(resolve))
  await nextTick()
  if (props.markdown && props.markdown.trim()) {
    renderMarkdown()
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

.vditor-preview-skeleton :deep(.el-skeleton__item) {
  height: 20px;
  margin-bottom: 16px;
  border-radius: 4px;
}

.vditor-preview-skeleton :deep(.el-skeleton__item:last-child) {
  width: 60%;
}
</style>
