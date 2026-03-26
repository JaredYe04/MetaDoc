<template>
  <div
    ref="containerRef"
    class="readonly-json-monaco w-full rounded-md border border-input overflow-hidden"
    :style="boxStyle"
  />
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick, computed } from 'vue'
import * as monaco from 'monaco-editor'
import { themeState } from '../../utils/themes'
import { setupMonacoWorker } from '../../utils/monaco-worker-config'
import { attachMonacoWheelScrollChain } from '../../utils/agent-tools/monaco-scroll-chain'

const props = withDefaults(
  defineProps<{
    modelValue: string
    /** 固定可视高度，内容在编辑器内滚动 */
    maxHeight: string
    compact?: boolean
  }>(),
  { compact: false }
)

const containerRef = ref<HTMLElement | null>(null)
const modelUri = monaco.Uri.parse(
  `inmemory://metadoc/tool-readonly-json/${Date.now()}-${Math.random().toString(36).slice(2)}.json`
)

let editor: monaco.editor.IStandaloneCodeEditor | null = null
let model: monaco.editor.ITextModel | null = null
let wheelCleanup: (() => void) | null = null

const boxStyle = computed(() => ({
  height: props.maxHeight,
  minHeight: props.compact ? '120px' : '140px'
}))

function disposeMonaco() {
  wheelCleanup?.()
  wheelCleanup = null
  if (editor) {
    editor.dispose()
    editor = null
  }
  if (model) {
    model.dispose()
    model = null
  }
}

function initMonaco() {
  if (!containerRef.value) return
  disposeMonaco()
  setupMonacoWorker()

  const isDark = themeState.currentTheme.type === 'dark'
  model = monaco.editor.createModel(props.modelValue || '', 'json', modelUri)

  editor = monaco.editor.create(containerRef.value, {
    model,
    theme: isDark ? 'vs-dark' : 'vs',
    readOnly: true,
    lineNumbers: 'on',
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    automaticLayout: true,
    fontSize: props.compact ? 12 : 13,
    fontFamily: "'JetBrains Mono', 'Consolas', monospace",
    tabSize: 2,
    folding: true,
    renderLineHighlight: 'none',
    scrollbar: {
      vertical: 'auto',
      horizontal: 'auto',
      verticalScrollbarSize: 8,
      horizontalScrollbarSize: 8
    }
  })

  wheelCleanup = attachMonacoWheelScrollChain(containerRef.value, () => {
    if (!editor) return { scrollTop: 0, scrollHeight: 0, height: 0 }
    const layout = editor.getLayoutInfo()
    return {
      scrollTop: editor.getScrollTop(),
      scrollHeight: editor.getScrollHeight(),
      height: layout?.height ?? containerRef.value!.clientHeight
    }
  })
}

watch(
  () => props.modelValue,
  (v) => {
    if (!editor || !model) return
    const cur = model.getValue()
    if (v !== cur) {
      model.setValue(v)
    }
  }
)

watch(
  () => themeState.currentTheme.type,
  () => {
    const isDark = themeState.currentTheme.type === 'dark'
    monaco.editor.setTheme(isDark ? 'vs-dark' : 'vs')
  }
)

watch(
  () => [props.maxHeight, props.compact],
  () => {
    nextTick(() => editor?.layout())
  }
)

onMounted(() => {
  nextTick(initMonaco)
})

onBeforeUnmount(() => {
  disposeMonaco()
})
</script>

<style scoped>
.readonly-json-monaco {
  box-sizing: border-box;
}
</style>
