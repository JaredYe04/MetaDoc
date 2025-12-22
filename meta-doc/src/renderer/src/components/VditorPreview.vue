<template>
  <div ref="containerRef" class="vditor-preview-container"></div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from 'vue'
import Vditor from 'vditor'
import { themeState } from '../utils/themes'
import { getSetting } from '../utils/settings'
import { isElectronEnv } from '../utils/event-bus'
import { localVditorCDN, vditorCDN } from '../utils/vditor-cdn'

const props = defineProps<{
  markdown: string
}>()

const containerRef = ref<HTMLElement | null>(null)

const renderMarkdown = async () => {
  if (!containerRef.value || !props.markdown) return

  try {
    const cdn = isElectronEnv() ? localVditorCDN : vditorCDN
    const contentTheme = await getSetting('contentTheme') || 'light'
    const codeTheme = themeState.currentTheme.codeTheme
    const lineNumber = await getSetting('lineNumber') ?? true

    // 清空容器
    containerRef.value.innerHTML = ''
    containerRef.value.style.color = themeState.currentTheme.textColor

    // 使用 Vditor.preview 渲染
    const previewOptions: any = {
      cdn,
      mode: themeState.currentTheme.type === 'dark' ? 'dark' : 'light',
      markdown: {
        theme: { current: contentTheme }
      },
      hljs: {
        style: codeTheme,
        lineNumber: lineNumber
      },
      theme: themeState.currentTheme.vditorTheme
    }

    await Vditor.preview(containerRef.value as HTMLDivElement, props.markdown, previewOptions)

    // 等待 preview 完成后再调用其他渲染方法
    await nextTick()

    // 渲染代码块
    if (typeof Vditor.codeRender === 'function') {
      Vditor.codeRender(containerRef.value)
    }

    // 渲染数学公式
    if (typeof Vditor.mathRender === 'function') {
      Vditor.mathRender(containerRef.value, {
        cdn
      })
    }
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

