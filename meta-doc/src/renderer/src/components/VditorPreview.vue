<template>
  <div ref="containerRef" class="vditor-preview-container"></div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from 'vue'
import { themeState } from '../utils/themes'
import { renderMarkdownPreview, local2fileProtocol } from '../utils/md-utils'

const props = withDefaults(defineProps<{
  markdown: string
  docPath?: string
}>(), {
  docPath: ''
})

const containerRef = ref<HTMLElement | null>(null)

const renderMarkdown = async () => {
  if (!containerRef.value || !props.markdown) return

  try {
    // 设置容器文字颜色
    containerRef.value.style.color = themeState.currentTheme.textColor

    // 将本地图片路径转换为 file:// 协议，以便浏览器能够加载本地图片
    const processedMarkdown = await local2fileProtocol(props.markdown, props.docPath)

    // 使用统一的 Markdown 预览渲染函数
    await renderMarkdownPreview(containerRef.value as HTMLDivElement, processedMarkdown)
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

