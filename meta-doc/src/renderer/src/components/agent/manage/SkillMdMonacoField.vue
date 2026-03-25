<template>
  <div
    ref="containerRef"
    class="skill-md-monaco border rounded-md overflow-hidden"
    :style="boxStyle"
  />
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick, computed } from 'vue'
import * as monaco from 'monaco-editor'
import { themeState } from '../../../utils/themes'
import { setupMonacoWorker } from '../../../utils/monaco-worker-config'
import { attachMonacoWheelScrollChain } from '../../../utils/agent-tools/monaco-scroll-chain'

const props = defineProps<{
  modelValue: string
  minHeight?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [string]
}>()

const containerRef = ref<HTMLElement | null>(null)
let editor: monaco.editor.IStandaloneCodeEditor | null = null
let wheelCleanup: (() => void) | null = null

const boxStyle = computed(() => ({
  minHeight: props.minHeight ?? '280px'
}))

function disposeMonaco() {
  wheelCleanup?.()
  wheelCleanup = null
  if (editor) {
    editor.dispose()
    editor = null
  }
}

function initMonaco() {
  if (!containerRef.value) return
  disposeMonaco()
  setupMonacoWorker()
  const isDark = themeState.currentTheme.type === 'dark'
  editor = monaco.editor.create(containerRef.value, {
    value: props.modelValue,
    language: 'markdown',
    theme: isDark ? 'vs-dark' : 'vs',
    readOnly: false,
    lineNumbers: 'on',
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    automaticLayout: true,
    fontSize: 13,
    fontFamily: "'JetBrains Mono', 'Consolas', monospace",
    tabSize: 2
  })
  editor.onDidChangeModelContent(() => {
    emit('update:modelValue', editor!.getValue())
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
    if (!editor) return
    const cur = editor.getValue()
    if (v !== cur) {
      editor.setValue(v)
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
  () => props.minHeight,
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
.skill-md-monaco {
  width: 100%;
}
</style>
