<template>
  <el-scrollbar v-if="displayType !== 'code'" class="file-content-scroll" max-height="400px">
    <!-- SVG: 渲染为图片 -->
    <div v-if="displayType === 'svg'" class="file-content-rendered">
      <img
        :src="svgDataUrl"
        alt="SVG"
        class="rendered-svg"
        referrerpolicy="no-referrer"
      />
    </div>
    <!-- HTML: 沙箱 iframe 渲染 -->
    <div v-else-if="displayType === 'html'" class="file-content-rendered">
      <iframe
        :srcdoc="file.content"
        sandbox="allow-same-origin"
        class="rendered-html"
        title="HTML Preview"
      />
    </div>
    <!-- 纯文本 -->
    <pre v-else class="content-text" :style="contentTextStyle">{{ file.content }}</pre>
  </el-scrollbar>
  <!-- 代码: Monaco 编辑器 -->
  <div v-else ref="monacoContainerRef" class="file-content-scroll file-content-monaco max-h-[400px]"></div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import * as monaco from 'monaco-editor'
import {
  getFileDisplayType,
  getMonacoLanguageForPath,
  svgContentToDataUrl,
  type FileDisplayType
} from '../../file-display-utils'
import { themeState } from '../../themes'
import { attachMonacoWheelScrollChain } from '../monaco-scroll-chain'
import { setupMonacoWorker } from '../../monaco-worker-config'

const props = defineProps<{
  file: { path: string; content: string }
  contentTextStyle: Record<string, string>
}>()

const monacoContainerRef = ref<HTMLElement | null>(null)
let monacoEditor: monaco.editor.IStandaloneCodeEditor | null = null
let monacoWheelCleanup: (() => void) | null = null

const displayType = computed((): FileDisplayType => getFileDisplayType(props.file.path))

const svgDataUrl = computed(() => {
  if (displayType.value !== 'svg') return ''
  return svgContentToDataUrl(props.file.content)
})

function initMonaco() {
  if (!monacoContainerRef.value || displayType.value !== 'code') return

  if (monacoEditor) {
    monacoEditor.dispose()
    monacoWheelCleanup?.()
    monacoEditor = null
    monacoWheelCleanup = null
  }

  setupMonacoWorker()

  const language = getMonacoLanguageForPath(props.file.path)
  const isDark = themeState.currentTheme.type === 'dark'

  monacoEditor = monaco.editor.create(monacoContainerRef.value, {
    value: props.file.content,
    language,
    theme: isDark ? 'vs-dark' : 'vs',
    readOnly: true,
    lineNumbers: 'on',
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    automaticLayout: true,
    fontSize: 12,
    fontFamily: "'JetBrains Mono', 'Consolas', monospace",
    contextmenu: false
  })

  monacoWheelCleanup = attachMonacoWheelScrollChain(monacoContainerRef.value, () => {
    if (!monacoEditor) return { scrollTop: 0, scrollHeight: 0, height: 0 }
    const layout = monacoEditor.getLayoutInfo()
    return {
      scrollTop: monacoEditor!.getScrollTop(),
      scrollHeight: monacoEditor!.getScrollHeight(),
      height: layout?.height ?? monacoContainerRef.value!.clientHeight
    }
  })
}

function disposeMonaco() {
  monacoWheelCleanup?.()
  monacoWheelCleanup = null
  if (monacoEditor) {
    monacoEditor.dispose()
    monacoEditor = null
  }
}

watch(
  () => [props.file.path, props.file.content, displayType.value],
  () => {
    if (displayType.value === 'code') {
      nextTick(initMonaco)
    } else {
      disposeMonaco()
    }
  },
  { immediate: true }
)

watch(
  () => themeState.currentTheme.type,
  () => {
    if (monacoEditor) {
      const isDark = themeState.currentTheme.type === 'dark'
      monaco.editor.setTheme(isDark ? 'vs-dark' : 'vs')
    }
  }
)

onMounted(() => {
  if (displayType.value === 'code') {
    nextTick(initMonaco)
  }
})

onBeforeUnmount(() => {
  disposeMonaco()
})
</script>

<style scoped>
.file-content-scroll {
  width: 100%;
  max-height: 400px;
  display: block;
}

.file-content-scroll :deep(.el-scrollbar__wrap) {
  overflow-x: auto;
  overflow-y: scroll;
  max-height: 400px;
}

.file-content-monaco {
  min-height: 120px;
}

.file-content-rendered {
  padding: 12px;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  min-height: 80px;
}

.rendered-svg {
  max-width: 100%;
  height: auto;
  object-fit: contain;
}

.rendered-html {
  width: 100%;
  min-height: 300px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 4px;
}

.content-text {
  margin: 0;
  padding: 12px;
}
</style>
