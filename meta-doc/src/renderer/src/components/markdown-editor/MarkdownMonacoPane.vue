<template>
  <div class="markdown-monaco-pane">
    <MarkdownMonacoToolbar
      :llm-enabled="props.llmEnabled"
      @undo="emit('undo')"
      @redo="emit('redo')"
      @action="(action) => emit('toolbar-action', action)"
      @search-replace="emit('search-replace')"
      @convert-latex="emit('convert-latex')"
      @ai-assistant="emit('ai-assistant')"
      @switch-to-visual="emit('switch-to-visual')"
    />
    <ResizableContainer
      direction="vertical"
      storage-key="markdown-code-preview-panel"
      :initial-sidebar-size="420"
      :min-size="240"
      :max-size="900"
      :divider-size="6"
      sidebar-position="end"
      :show-sidebar="true"
      class="markdown-monaco-pane__split"
    >
      <template #main>
        <div
          :key="editorKey"
          ref="editorEl"
          class="editor markdown-monaco-editor"
          @contextmenu.prevent="emit('contextmenu', $event)"
          :style="editorStyle"
        />
      </template>
      <template #sidebar>
        <MarkdownEditorPreview :markdown="previewMarkdown" :doc-path="docPath" />
      </template>
    </ResizableContainer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount, nextTick } from 'vue'
import { debounce } from 'lodash'
import * as monaco from 'monaco-editor'
import ResizableContainer from '../base/ResizableContainer.vue'
import MarkdownMonacoToolbar from './MarkdownMonacoToolbar.vue'
import MarkdownEditorPreview from './MarkdownEditorPreview.vue'
import { setupMonacoWorker } from '../../utils/monaco-worker-config'
import { createMonacoAdapter } from '../../editor/monaco-adapter'
import { MonacoEditorAdapter } from '../../utils/editor-adapters'
import {
  setEditorCompletionAdapter,
  cancelEditorCompletion,
  triggerEditorCompletion,
  handleEditorCompletionMouseClick
} from '../../utils/editor-completion-bridge'
import { themeState } from '../../utils/themes'
import {
  pushMarkdownHistorySnapshot,
  isApplyingMarkdownHistory
} from '../../composables/useMarkdownUnifiedHistory'
import type { MarkdownToolbarAction } from '../../utils/markdown-toolbar-actions'
import { runMarkdownToolbarActionOnEditor } from '../../utils/markdown-toolbar-actions'
import type { TextEditorAdapter } from '../../editor/text-editor-types'

const props = withDefaults(
  defineProps<{
    tabId: string
    active: boolean
    markdown: string
    docPath: string
    llmEnabled?: boolean
  }>(),
  {
    llmEnabled: false
  }
)

const emit = defineEmits<{
  undo: []
  redo: []
  'toolbar-action': [action: MarkdownToolbarAction]
  'search-replace': []
  'convert-latex': []
  'ai-assistant': []
  'switch-to-visual': []
  contextmenu: [event: MouseEvent]
  'content-change': [markdown: string]
  ready: [payload: { editorId: string; adapter: TextEditorAdapter | null }]
  unready: []
}>()

const editorEl = ref<HTMLElement | null>(null)
const editor = ref<monaco.editor.IStandaloneCodeEditor | null>(null)
const editorKey = ref(Date.now())
const editorId = ref<string | null>(null)
const textEditorAdapter = ref<TextEditorAdapter | null>(null)
const previewMarkdown = ref('')
const initialized = ref(false)

let textBuffer = ''
let isUpdatingFromExternal = false
let contentChangeListener: monaco.IDisposable | null = null
let debounceSync: ReturnType<typeof debounce> | null = null
let debouncePreview: ReturnType<typeof debounce> | null = null
let isPaneMounted = true

const editorStyle = computed(() => ({
  '--panel-background-color': themeState.currentTheme.editorPanelBackgroundColor,
  '--editor-text-color': themeState.currentTheme.textColor,
  color: themeState.currentTheme.textColor,
  height: '100%'
}))

function getEditorFontFamily(): string {
  if (typeof document === 'undefined') return "'Fira Code', 'OPPO Sans 4.0', sans-serif"
  const v = getComputedStyle(document.documentElement).getPropertyValue('--font-family-editor').trim()
  return v || "'Fira Code', 'OPPO Sans 4.0', sans-serif"
}

const getActiveMonacoEditor = () => {
  const editors = monaco.editor.getEditors()
  const byId = editorId.value ? editors.find((e) => e.getId?.() === editorId.value) : undefined
  return byId || editors[0] || editor.value
}

const syncPreview = (value: string) => {
  previewMarkdown.value = value
}

const flushToWorkspace = (): string => {
  const monacoEditor = getActiveMonacoEditor()
  if (!monacoEditor) return textBuffer
  const value = monacoEditor.getValue()
  textBuffer = value
  return value
}

const flushSyncToWorkspace = (): string => {
  const value = flushToWorkspace()
  if (debounceSync && 'flush' in debounceSync) {
    debounceSync.flush()
  }
  return value
}

const runToolbarAction = (action: MarkdownToolbarAction) => {
  const monacoEditor = getActiveMonacoEditor()
  if (!monacoEditor) return
  runMarkdownToolbarActionOnEditor(monacoEditor, action)
  textBuffer = monacoEditor.getValue()
  flushSyncToWorkspace()
  debouncePreview?.()
}

const initEditor = async () => {
  if (!isPaneMounted) return
  if (initialized.value && editor.value) return
  setupMonacoWorker()
  if (!editorEl.value) return

  if (editor.value || editorId.value) {
    try {
      if (editor.value) editor.value.dispose()
      else if (editorId.value) {
        const existing = monaco.editor.getEditors().find((e) => e.getId() === editorId.value)
        existing?.dispose()
      }
    } catch {
      /* ignore */
    }
    editor.value = null
    editorId.value = null
  }

  textBuffer = props.markdown ?? ''
  previewMarkdown.value = textBuffer

  editor.value = monaco.editor.create(editorEl.value, {
    value: textBuffer,
    language: 'markdown',
    theme: themeState.currentTheme.type === 'dark' ? 'vs-dark' : 'vs',
    mouseWheelZoom: true,
    automaticLayout: true,
    fontSize: 14,
    fontFamily: getEditorFontFamily(),
    wordWrap: 'on',
    wrappingIndent: 'same',
    lineNumbers: 'on',
    minimap: { enabled: false },
    contextmenu: false
  })

  editorId.value = editor.value.getId()
  textEditorAdapter.value = createMonacoAdapter(editorId.value)
  emit('ready', { editorId: editorId.value, adapter: textEditorAdapter.value })

  const adapter = new MonacoEditorAdapter(editorId.value, () => props.active)
  setEditorCompletionAdapter(adapter)

  let isUpdatingGhostText = false

  debounceSync = debounce(() => {
    if (!isPaneMounted) return
    if (props.markdown !== textBuffer && !isApplyingMarkdownHistory(props.tabId)) {
      emit('content-change', textBuffer)
      pushMarkdownHistorySnapshot(props.tabId, textBuffer)
    }
  }, 100)

  debouncePreview = debounce(() => {
    syncPreview(textBuffer)
  }, 300)

  contentChangeListener = editor.value.onDidChangeModelContent(
    (event: monaco.editor.IModelContentChangedEvent) => {
      const monacoEditor = getActiveMonacoEditor()
      if (!monacoEditor) return
      if (isUpdatingFromExternal) {
        textBuffer = monacoEditor.getValue()
        debouncePreview?.()
        return
      }
      textBuffer = monacoEditor.getValue()
      debounceSync?.()
      debouncePreview?.()

      if (isUpdatingGhostText) return
      const isPasteOperation =
        event.changes.length > 1 || event.changes.some((change) => change.text.length > 100)
      if (isPasteOperation) return
      if (editorId.value) {
        setEditorCompletionAdapter(new MonacoEditorAdapter(editorId.value, () => props.active))
      }
      cancelEditorCompletion()
      triggerEditorCompletion('input')
    }
  )

  editor.value.onMouseDown((e: monaco.editor.IEditorMouseEvent) => {
    if (e.event.browserEvent.button === 0) handleEditorCompletionMouseClick()
  })

  editor.value.onKeyDown((e: monaco.IKeyboardEvent) => {
    if (e.shiftKey && e.keyCode === monaco.KeyCode.Tab) {
      e.preventDefault()
      e.stopPropagation()
      triggerEditorCompletion('manual')
      return
    }
    if (e.keyCode === monaco.KeyCode.Tab) return
    cancelEditorCompletion()
  })

  initialized.value = true
}

const applyExternalMarkdown = (incoming: string) => {
  const nextValue = (incoming ?? '').replace(/\r\n/g, '\n')
  textBuffer = nextValue
  debouncePreview?.()
  const monacoEditor = getActiveMonacoEditor()
  if (!monacoEditor) return
  const editorContent = monacoEditor.getValue()
  if (editorContent === nextValue) return
  isUpdatingFromExternal = true
  try {
    const position = monacoEditor.getPosition()
    monacoEditor.setValue(nextValue)
    if (position) {
      monacoEditor.setPosition(position)
      monacoEditor.revealPositionInCenter(position)
    }
  } finally {
    setTimeout(() => {
      isUpdatingFromExternal = false
    }, 0)
  }
}

watch(
  () => props.markdown,
  (incoming) => {
    if (isUpdatingFromExternal) return
    applyExternalMarkdown(incoming ?? '')
  }
)

watch(
  () => props.active,
  (active, wasActive) => {
    if (!active) {
      textBuffer = props.markdown ?? ''
      return
    }
    if (active && !wasActive) {
      if (!initialized.value) {
        nextTick(() => initEditor())
      } else {
        nextTick(() => getActiveMonacoEditor()?.focus())
      }
    }
  },
  { immediate: true }
)

watch(
  () => themeState.currentTheme.type,
  () => {
    monaco.editor.setTheme(themeState.currentTheme.type === 'dark' ? 'vs-dark' : 'vs')
  }
)

onBeforeUnmount(() => {
  isPaneMounted = false
  debounceSync?.cancel()
  debouncePreview?.cancel()
  contentChangeListener?.dispose()
  contentChangeListener = null
  if (editor.value) {
    editor.value.dispose()
    editor.value = null
  }
  editorId.value = null
  initialized.value = false
  emit('unready')
})

defineExpose({
  editorId,
  textEditorAdapter,
  flushToWorkspace,
  flushSyncToWorkspace,
  applyExternalMarkdown,
  initEditor,
  runToolbarAction,
  focus: () => getActiveMonacoEditor()?.focus(),
  getActiveMonacoEditor
})
</script>

<style scoped>
.markdown-monaco-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.markdown-monaco-pane__split {
  flex: 1;
  min-height: 0;
}

.markdown-monaco-editor {
  width: 100%;
  height: 100%;
  min-height: 0;
}
</style>
