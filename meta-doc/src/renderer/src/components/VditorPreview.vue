<template>
  <div class="vditor-preview-wrapper">
    <el-skeleton
      v-if="isRendering"
      :rows="15"
      animated
      class="vditor-preview-skeleton"
    />
    <div v-else ref="containerRef" class="vditor-preview-container"></div>
  </div>
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
const isRendering = ref(false)

const renderMarkdown = async () => {
  if (!props.markdown) {
    isRendering.value = false
    return
  }

  // 等待容器挂载
  await nextTick()
  if (!containerRef.value) {
    isRendering.value = false
    return
  }

  try {
    isRendering.value = true

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
  } finally {
    isRendering.value = false
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
