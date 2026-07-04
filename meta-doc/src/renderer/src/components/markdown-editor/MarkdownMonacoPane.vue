<template>
  <div class="markdown-monaco-pane">
    <MarkdownMonacoToolbar
      :llm-enabled="props.llmEnabled"
      :current-mode="props.currentMode"
      :outline-visible="showOutlineSidebar"
      @undo="emit('undo')"
      @redo="emit('redo')"
      @action="runToolbarAction"
      @search-replace="emit('search-replace')"
      @convert-latex="emit('convert-latex')"
      @ai-assistant="emit('ai-assistant')"
      @mode-change="emit('mode-change', $event)"
      @toggle-outline="toggleOutlineSidebar"
    />
    <ResizableContainer
      direction="vertical"
      storage-key="markdown-outline-panel"
      :initial-sidebar-size="220"
      :min-size="160"
      :max-size="480"
      :divider-size="6"
      sidebar-position="start"
      :sidebar-on-left="true"
      :show-sidebar="showOutlineSidebar"
      class="markdown-monaco-pane__outline-row"
    >
      <template #sidebar>
        <MarkdownOutlinePanel :tab-id="tabId" class="markdown-monaco-pane__outline" />
      </template>
      <template #main>
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
              ref="editorEl"
              class="editor markdown-monaco-editor"
              @contextmenu.prevent="emit('contextmenu', $event)"
              :style="editorStyle"
            />
          </template>
          <template #sidebar>
            <MarkdownEditorPreview
              ref="previewRef"
              :markdown="previewMarkdown"
              :doc-path="docPath"
            />
          </template>
        </ResizableContainer>
      </template>
    </ResizableContainer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount, onMounted, nextTick } from 'vue'
import { debounce } from 'lodash'
import * as monaco from 'monaco-editor'
import ResizableContainer from '../base/ResizableContainer.vue'
import MarkdownMonacoToolbar from './MarkdownMonacoToolbar.vue'
import MarkdownEditorPreview from './MarkdownEditorPreview.vue'
import MarkdownOutlinePanel from '../MarkdownOutlinePanel.vue'
import { setupMonacoWorker } from '../../utils/monaco-worker-config'
import { createMonacoAdapter } from '../../editor/monaco-adapter'
import { MonacoEditorAdapter } from '../../utils/editor-adapters'
import {
  setEditorCompletionAdapter,
  cancelEditorCompletion,
  triggerEditorCompletion,
  handleEditorCompletionMouseClick,
  removeEditorCompletionAdapter
} from '../../utils/editor-completion-bridge'
import { themeState } from '../../utils/themes'
import {
  pushMarkdownHistorySnapshot,
  isApplyingMarkdownHistory
} from '../../composables/useMarkdownUnifiedHistory'
import type { MarkdownToolbarAction } from '../../utils/markdown-toolbar-actions'
import { runMarkdownToolbarActionOnEditor } from '../../utils/markdown-toolbar-actions'
import type { TextEditorAdapter } from '../../editor/text-editor-types'
import type { MarkdownDefaultEditorModeChoice } from '../../utils/markdown-editor-mode'
import type { PreviewSyncExpose } from '../../composables/useMonacoPreviewScrollSync'
import { selectTextInPreview, clearPreviewTextSelection } from '../../utils/monaco-preview-sync'
import eventBus from '../../utils/event-bus'

const props = withDefaults(
  defineProps<{
    tabId: string
    active: boolean
    markdown: string
    docPath: string
    llmEnabled?: boolean
    currentMode?: MarkdownDefaultEditorModeChoice
  }>(),
  {
    llmEnabled: false,
    currentMode: 'code'
  }
)

const emit = defineEmits<{
  undo: []
  redo: []
  'toolbar-action': [action: MarkdownToolbarAction]
  'search-replace': []
  'convert-latex': []
  'ai-assistant': []
  'mode-change': [choice: MarkdownDefaultEditorModeChoice]
  contextmenu: [event: MouseEvent]
  'content-change': [markdown: string]
  ready: [payload: { editorId: string; adapter: TextEditorAdapter | null }]
  unready: []
}>()

const editorEl = ref<HTMLElement | null>(null)
const previewRef = ref<PreviewSyncExpose | null>(null)
const editor = ref<monaco.editor.IStandaloneCodeEditor | null>(null)
const editorId = ref<string | null>(null)
const textEditorAdapter = ref<TextEditorAdapter | null>(null)
const previewMarkdown = ref('')
const showOutlineSidebar = ref(true)

let textBuffer = ''
let isUpdatingFromExternal = false
let contentChangeListener: monaco.IDisposable | null = null
let debounceSync: ReturnType<typeof debounce> | null = null
let debouncePreview: ReturnType<typeof debounce> | null = null
let debouncePreviewSelectionSync: ReturnType<typeof debounce> | null = null

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

/** 与 PlainTextEditor / LaTeXEditor 一致：按 editorId 从全局取实例 */
const getActiveMonacoEditor = (): monaco.editor.IStandaloneCodeEditor | null => {
  const editors = monaco.editor.getEditors()
  const byId = editorId.value
    ? (editors.find((e) => e.getId?.() === editorId.value) as
        | monaco.editor.IStandaloneCodeEditor
        | undefined)
    : undefined
  return byId ?? editor.value
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
  debounceSync?.flush?.()
  return value
}

const runToolbarAction = (action: MarkdownToolbarAction, sampleText?: string) => {
  const monacoEditor = getActiveMonacoEditor()
  if (!monacoEditor) return
  runMarkdownToolbarActionOnEditor(monacoEditor, action, sampleText)
  textBuffer = monacoEditor.getValue()
  flushSyncToWorkspace()
  debouncePreview?.()
}

function toggleOutlineSidebar() {
  showOutlineSidebar.value = !showOutlineSidebar.value
  nextTick(() => getActiveMonacoEditor()?.layout())
}

function syncPreviewSelectionFromEditorSelection() {
  if (!props.active) return
  const monacoEditor = getActiveMonacoEditor()
  const preview = previewRef.value
  if (!monacoEditor || !preview) return

  const selection = monacoEditor.getSelection()
  if (!selection || selection.isEmpty()) return

  const model = monacoEditor.getModel()
  if (!model) return

  const query = model.getValueInRange(selection).replace(/\s+/g, ' ').trim()
  if (!query) return

  const scrollRoot = preview.getScrollElement()
  const contentRoot = preview.getContentElement()
  if (!scrollRoot || !contentRoot) return

  clearPreviewTextSelection(contentRoot)
  selectTextInPreview(scrollRoot, contentRoot, query)
}

/** 对齐 PlainTextEditor.initEditor：已存在则跳过，避免 switchSurface 与 watch 重复创建 */
const initEditor = () => {
  if (editor.value || editorId.value) {
    nextTick(() => getActiveMonacoEditor()?.layout())
    return
  }

  setupMonacoWorker()
  if (!editorEl.value) return

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

  debounceSync = debounce(() => {
    if (props.markdown !== textBuffer && !isApplyingMarkdownHistory(props.tabId)) {
      emit('content-change', textBuffer)
      pushMarkdownHistorySnapshot(props.tabId, textBuffer)
    }
  }, 100)

  debouncePreview = debounce(() => {
    syncPreview(textBuffer)
  }, 300)

  debouncePreviewSelectionSync = debounce(() => {
    syncPreviewSelectionFromEditorSelection()
  }, 120)

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

  editor.value.onMouseUp(() => {
    debouncePreviewSelectionSync?.()
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

watch(showOutlineSidebar, () => {
  nextTick(() => getActiveMonacoEditor()?.layout())
})

/** 与 LaTeXEditor 一致：active 时 focus，不在 watch 里反复 init */
watch(
  () => props.active,
  (active, wasActive) => {
    if (!active) return
    if (!editor.value && !editorId.value) {
      nextTick(() => initEditor())
    }
    if (active && !wasActive) {
      const el = document.activeElement as HTMLElement | null
      if (el && el !== document.body) el.blur()
      const tryFocus = () => {
        if (props.active && editor.value && !editor.value.hasTextFocus()) {
          editor.value.focus()
        }
      }
      nextTick(() => {
        requestAnimationFrame(() => {
          setTimeout(tryFocus, 0)
        })
      })
    }
  },
  { immediate: true }
)

function handleOutlinePreviewSync(payload?: unknown) {
  const p = payload as { tabId?: string; query?: string }
  if (p?.tabId !== props.tabId || !p?.query?.trim()) return
  const preview = previewRef.value
  if (!preview) return
  const scrollRoot = preview.getScrollElement()
  const contentRoot = preview.getContentElement()
  if (!scrollRoot || !contentRoot) return
  clearPreviewTextSelection(contentRoot)
  selectTextInPreview(scrollRoot, contentRoot, p.query)
}

watch(
  () => themeState.currentTheme.type,
  () => {
    monaco.editor.setTheme(themeState.currentTheme.type === 'dark' ? 'vs-dark' : 'vs')
  }
)

onMounted(() => {
  eventBus.on('markdown-monaco-sync-preview', handleOutlinePreviewSync)
})

onBeforeUnmount(() => {
  eventBus.off('markdown-monaco-sync-preview', handleOutlinePreviewSync)
  debounceSync?.cancel()
  debouncePreview?.cancel()
  debouncePreviewSelectionSync?.cancel()
  if (contentChangeListener) {
    contentChangeListener.dispose()
    contentChangeListener = null
  }
  cancelEditorCompletion()
  removeEditorCompletionAdapter()
  if (editorId.value) {
    try {
      monaco.editor.getEditors().forEach((ed) => {
        if (ed.getId() === editorId.value) {
          try {
            ed.dispose()
          } catch {
            /* ignore */
          }
        }
      })
    } catch {
      /* ignore */
    }
  }
  editor.value = null
  editorId.value = null
  textEditorAdapter.value = null
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

.markdown-monaco-pane__outline-row {
  flex: 1;
  min-height: 0;
}

.markdown-monaco-pane__outline {
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
