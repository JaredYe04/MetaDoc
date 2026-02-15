<template>
  <div ref="containerRef" class="vditor-preview-container"></div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from 'vue'
import { themeState } from '../utils/themes'
import { renderMarkdownPreview, local2fileProtocol } from '../utils/md-utils'

const props = withDefaults(
  defineProps<{
    markdown: string
    docPath?: string
  }>(),
  {
    docPath: ''
  }
)

const emit = defineEmits<{ rendered: [] }>()
const containerRef = ref<HTMLElement | null>(null)

const renderMarkdown = async () => {
  if (!containerRef.value || !props.markdown) return

  try {
    // 设置容器文字颜色
    containerRef.value.style.color = themeState.currentTheme.textColor

    // 预览组件需要 file:// 协议，以便浏览器能够加载本地图片
    // local2fileProtocol 可以处理：
    // - 相对路径（通过 docPath 解析）
    // - 绝对路径
    // - HTTP URL（会保持原样，但预览时可能无法加载，建议先转本地路径）
    // 注意：如果输入包含 HTTP URL（如预渲染的图表），可能需要先转换为本地路径
    const processedMarkdown = await local2fileProtocol(props.markdown, props.docPath)

    // 使用统一的 Markdown 预览渲染函数
    await renderMarkdownPreview(containerRef.value as HTMLDivElement, processedMarkdown)
    emit('rendered')
  } catch (error) {
    console.error('渲染 Markdown 失败:', error)
    if (containerRef.value) {
      containerRef.value.innerHTML = `<p style="color: var(--el-color-danger);">渲染失败: ${error instanceof Error ? error.message : String(error)}</p>`
    }
  }
}

// 监听 Markdown 内容变化和主题变化
watch(
  [() => props.markdown, () => themeState.currentTheme.type],
  () => {
    nextTick(() => {
      renderMarkdown()
    })
  },
  { immediate: true }
)

onMounted(() => {
  nextTick(() => {
    renderMarkdown()
  })
})
</script>

<style scoped>
.vditor-preview-container {
  width: 100%;
  min-height: 100px;
  padding: 16px;
}
</style>
