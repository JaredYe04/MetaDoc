<template>
  <div
    ref="containerRef"
    class="mcp-servers-json-monaco border rounded-md overflow-hidden"
    :style="boxStyle"
  />
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick, computed } from 'vue'
import * as monaco from 'monaco-editor'
import { themeState } from '../../../utils/themes'
import { setupMonacoWorker } from '../../../utils/monaco-worker-config'
import { attachMonacoWheelScrollChain } from '../../../utils/agent-tools/monaco-scroll-chain'

const MCP_MODEL_URI = 'inmemory://metadoc/mcp-servers.json'
const MCP_SCHEMA_URI = 'metadoc://schemas/mcp-servers.schema.json'

const MCP_SERVERS_JSON_SCHEMA = {
  type: 'object',
  required: ['mcpServers'],
  additionalProperties: false,
  properties: {
    mcpServers: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Stdio: executable' },
          args: {
            type: 'array',
            items: { type: 'string' },
            description: 'Stdio: arguments'
          },
          env: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'Environment variables for stdio process'
          },
          cwd: { type: 'string', description: 'Working directory for stdio process' },
          url: { type: 'string', description: 'HTTP MCP endpoint (Streamable HTTP or SSE)' }
        }
      }
    }
  }
}

const props = defineProps<{
  modelValue: string
  minHeight?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [string]
}>()

const containerRef = ref<HTMLElement | null>(null)
let editor: monaco.editor.IStandaloneCodeEditor | null = null
let model: monaco.editor.ITextModel | null = null
let wheelCleanup: (() => void) | null = null
let schemaRegistered = false

const boxStyle = computed(() => ({
  minHeight: props.minHeight ?? '320px'
}))

function ensureJsonSchemaDiagnostics() {
  if (schemaRegistered) return
  schemaRegistered = true
  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    allowComments: false,
    schemas: [
      {
        uri: MCP_SCHEMA_URI,
        fileMatch: [MCP_MODEL_URI],
        schema: MCP_SERVERS_JSON_SCHEMA
      }
    ]
  })
}

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
  ensureJsonSchemaDiagnostics()

  const isDark = themeState.currentTheme.type === 'dark'
  const uri = monaco.Uri.parse(MCP_MODEL_URI)
  model = monaco.editor.createModel(props.modelValue, 'json', uri)

  editor = monaco.editor.create(containerRef.value, {
    model,
    theme: isDark ? 'vs-dark' : 'vs',
    readOnly: false,
    lineNumbers: 'on',
    minimap: { enabled: true },
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
    if (!editor || !model) return
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
.mcp-servers-json-monaco {
  width: 100%;
}
</style>
