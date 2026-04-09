<template>
  <Dialog :open="open" @update:open="onOpenUpdate">
    <DialogContent
      class="selection-translate-dialog flex max-h-[90vh] w-[min(1200px,96vw)] max-w-[1200px] flex-col gap-0 p-0"
    >
      <DialogHeader class="border-b px-4 py-3 pr-12">
        <DialogTitle class="text-base">{{
          t('selectionTranslate.title', '翻译选中文本')
        }}</DialogTitle>
        <div class="mt-3 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <span class="shrink-0 text-sm text-muted-foreground">{{
            t('selectionTranslate.targetLanguage', '目标语言')
          }}</span>
          <Autocomplete
            v-model="targetLanguageInput"
            class="min-w-0 flex-1"
            input-class="w-full"
            :placeholder="t('selectionTranslate.targetLanguagePlaceholder', '选择或输入目标语言')"
            :fetch-suggestions="fetchLanguageSuggestions"
            :trigger-on-focus="true"
            :debounce="150"
            :disabled="translating"
            value-key="value"
            @select="onLanguageSelect"
          />
        </div>
      </DialogHeader>

      <div class="flex min-h-0 flex-1 flex-col gap-2 px-4 py-3">
        <div class="grid min-h-0 flex-1 grid-cols-1 gap-2 md:grid-cols-2" style="min-height: 280px">
          <div class="flex min-h-0 flex-col gap-1">
            <span class="text-xs font-medium text-muted-foreground">{{
              t('selectionTranslate.sourceLabel', '原文')
            }}</span>
            <div
              ref="leftMonacoHost"
              class="selection-translate-monaco-host min-h-[220px] rounded-md border"
            />
          </div>
          <div class="flex min-h-0 flex-col gap-1">
            <span class="text-xs font-medium text-muted-foreground">{{
              t('selectionTranslate.translationLabel', '译文')
            }}</span>
            <div
              ref="rightMonacoHost"
              class="selection-translate-monaco-host min-h-[220px] rounded-md border"
            />
          </div>
        </div>
      </div>

      <DialogFooter
        class="flex-col gap-2 border-t px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
      >
        <Button variant="default" :disabled="translateDisabled" @click="runTranslate">
          <Loader2 v-if="translating" class="mr-2 h-4 w-4 animate-spin" />
          {{
            translating
              ? t('selectionTranslate.translating', '翻译中…')
              : t('selectionTranslate.translate', '翻译')
          }}
        </Button>
        <div class="flex flex-wrap gap-2">
          <Button variant="outline" :disabled="actionButtonsDisabled" @click="copyTranslation">
            {{ t('common.copy', '复制') }}
          </Button>
          <Button variant="outline" :disabled="actionButtonsDisabled" @click="insertToDocument">
            {{ t('aiChat.insertToDocument', '插入到文档') }}
          </Button>
          <Button variant="outline" :disabled="actionButtonsDisabled" @click="exportToNewDocument">
            {{ t('aiChat.exportToDocument', '导出到新文档') }}
          </Button>
          <Button variant="outline" :disabled="actionButtonsDisabled" @click="replaceSelection">
            {{ t('selectionTranslate.replaceSelection', '替换选中文本') }}
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import * as monaco from 'monaco-editor'
import { Loader2 } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import Autocomplete, {
  type AutocompleteSuggestion
} from '@renderer/components/ui/autocomplete/Autocomplete.vue'
import { setupMonacoWorker, registerLatexLanguage } from '@renderer/utils/editor/monaco-worker-config'
import { themeState } from '@renderer/utils/themes.js'
import eventBus from '@renderer/utils/event-bus'
import { toast } from '@renderer/utils/notification/toast'
import { notifyError } from '@renderer/utils/notification/notify'
import { getLocale } from '@renderer/i18n.js'
import { getPromptByKey } from '@renderer/utils/common/prompts'
import { createAiTask, cancelAiTask, ai_types } from '@renderer/utils/ai/ai_tasks.ts'
import type { AIDialogMessage } from '../../../types'

const props = withDefaults(
  defineProps<{
    open: boolean
    sourceText: string
    documentKind: 'markdown' | 'latex'
    sourceTabId?: string
  }>(),
  { sourceTabId: '' }
)

const emit = defineEmits<{
  'update:open': [value: boolean]
  'apply-replace': [text: string]
}>()

const { t } = useI18n()

const LANGUAGE_OPTIONS: AutocompleteSuggestion[] = [
  { value: '简体中文', label: '简体中文 (Simplified Chinese)' },
  { value: '繁體中文', label: '繁體中文 (Traditional Chinese)' },
  { value: 'English', label: 'English' },
  { value: '日本語', label: '日本語 (Japanese)' },
  { value: '한국어', label: '한국어 (Korean)' },
  { value: 'Deutsch', label: 'Deutsch (German)' },
  { value: 'Français', label: 'Français (French)' },
  { value: 'Español', label: 'Español (Spanish)' },
  { value: 'Português', label: 'Português (Portuguese)' },
  { value: 'Русский', label: 'Русский (Russian)' },
  { value: 'Italiano', label: 'Italiano (Italian)' },
  { value: 'العربية', label: 'العربية (Arabic)' },
  { value: 'Tiếng Việt', label: 'Tiếng Việt (Vietnamese)' },
  { value: 'ไทย', label: 'ไทย (Thai)' },
  { value: 'Nederlands', label: 'Nederlands (Dutch)' },
  { value: 'Polski', label: 'Polski (Polish)' },
  { value: 'Türkçe', label: 'Türkçe (Turkish)' }
]

function defaultTargetLanguageForLocale(): string {
  const loc = (getLocale() || 'zh_CN').replace(/-/g, '_')
  const map: Record<string, string> = {
    zh_CN: '简体中文',
    zh_TW: '繁體中文',
    en_US: 'English',
    ja_JP: '日本語',
    ko_KR: '한국어',
    de_DE: 'Deutsch',
    fr_FR: 'Français',
    es_ES: 'Español',
    pt_BR: 'Português',
    ru_RU: 'Русский'
  }
  return map[loc] || 'English'
}

const targetLanguageInput = ref('')
const translatedText = ref('')
const translating = ref(false)
const taskHandleRef = ref<string | null>(null)

const leftMonacoHost = ref<HTMLElement | null>(null)
const rightMonacoHost = ref<HTMLElement | null>(null)
let leftEditor: monaco.editor.IStandaloneCodeEditor | null = null
let rightEditor: monaco.editor.IStandaloneCodeEditor | null = null

const translateDisabled = computed(
  () =>
    translating.value ||
    !(props.sourceText || '').trim() ||
    !(targetLanguageInput.value || '').trim()
)

const actionButtonsDisabled = computed(
  () => translating.value || !(translatedText.value || '').trim()
)

function monacoTheme(): string {
  return themeState.currentTheme.type === 'dark' ? 'vs-dark' : 'vs'
}

function disposeEditors() {
  leftEditor?.dispose()
  rightEditor?.dispose()
  leftEditor = null
  rightEditor = null
}

function applyMonacoTheme() {
  try {
    monaco.editor.setTheme(monacoTheme())
  } catch {
    /* ignore */
  }
}

async function ensureEditors() {
  if (leftEditor && rightEditor) return
  setupMonacoWorker()
  if (props.documentKind === 'latex') {
    registerLatexLanguage()
  }
  await nextTick()
  const leftEl = leftMonacoHost.value
  const rightEl = rightMonacoHost.value
  if (!leftEl || !rightEl) return

  const lang = props.documentKind === 'latex' ? 'latex' : 'markdown'
  const baseOpts: monaco.editor.IStandaloneEditorConstructionOptions = {
    theme: monacoTheme(),
    readOnly: true,
    lineNumbers: 'on',
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    automaticLayout: true,
    fontSize: 13,
    contextmenu: true,
    folding: true
  }

  leftEditor = monaco.editor.create(leftEl, {
    ...baseOpts,
    value: props.sourceText || '',
    language: lang
  })

  rightEditor = monaco.editor.create(rightEl, {
    ...baseOpts,
    value: '',
    language: lang
  })
}

function syncLeftValue() {
  const m = leftEditor?.getModel()
  if (!m) return
  const v = props.sourceText || ''
  if (m.getValue() !== v) m.setValue(v)
}

function syncRightValue(text: string) {
  const m = rightEditor?.getModel()
  if (!m) return
  if (m.getValue() !== text) {
    m.setValue(text)
    const lineCount = m.getLineCount()
    if (lineCount > 0) {
      rightEditor?.revealLine(lineCount, monaco.editor.ScrollType.Smooth)
    }
  }
}

function onOpenUpdate(v: boolean) {
  if (!v && translating.value && taskHandleRef.value) {
    cancelAiTask(taskHandleRef.value, false)
    taskHandleRef.value = null
    translating.value = false
  }
  emit('update:open', v)
}

function fetchLanguageSuggestions(query: string, cb: (rows: AutocompleteSuggestion[]) => void) {
  const q = (query || '').trim().toLowerCase()
  if (!q) {
    cb([...LANGUAGE_OPTIONS])
    return
  }
  const hit = LANGUAGE_OPTIONS.filter(
    (o) =>
      o.value.toLowerCase().includes(q) || (o.label && String(o.label).toLowerCase().includes(q))
  )
  cb(hit.length ? hit : [{ value: query.trim(), label: query.trim() }])
}

function onLanguageSelect(item: AutocompleteSuggestion) {
  targetLanguageInput.value = item.value
}

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      targetLanguageInput.value = defaultTargetLanguageForLocale()
      translatedText.value = ''
      await nextTick()
      await ensureEditors()
      syncLeftValue()
      syncRightValue('')
    } else {
      if (taskHandleRef.value) {
        cancelAiTask(taskHandleRef.value, false)
        taskHandleRef.value = null
      }
      translating.value = false
      translatedText.value = ''
      disposeEditors()
    }
  }
)

watch(
  () => props.sourceText,
  () => {
    if (props.open) syncLeftValue()
  }
)

watch(translatedText, (text) => {
  if (props.open) syncRightValue(text)
})

watch(
  () => themeState.currentTheme.type,
  () => {
    if (props.open) applyMonacoTheme()
  }
)

async function runTranslate() {
  const source = (props.sourceText || '').trim()
  const targetLang = (targetLanguageInput.value || '').trim()
  if (!source || !targetLang) return

  if (taskHandleRef.value) {
    cancelAiTask(taskHandleRef.value, false)
    taskHandleRef.value = null
  }

  translating.value = true
  translatedText.value = ''
  syncRightValue('')

  const documentKindLabel = props.documentKind === 'latex' ? 'LaTeX' : 'Markdown'
  const systemContent = getPromptByKey('selectionTranslateSystem', {
    documentKind: documentKindLabel
  })
  const userContent = getPromptByKey('selectionTranslateUser', {
    targetLanguage: targetLang,
    sourceText: source
  })

  const messages: AIDialogMessage[] = [
    { role: 'system', content: systemContent },
    { role: 'user', content: userContent }
  ]

  const target = translatedText
  const { handle, done } = createAiTask(
    t('selectionTranslate.title', '翻译选中文本'),
    messages,
    target,
    ai_types.chat,
    'selection-translate-dialog',
    { stream: true }
  )
  taskHandleRef.value = handle

  try {
    await done
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!msg.includes('取消') && !msg.toLowerCase().includes('cancel')) {
      notifyError(t('selectionTranslate.failed', '翻译失败') + (msg ? `: ${msg}` : ''), {
        title: t('main.notification.error.title', '错误')
      })
    }
  } finally {
    taskHandleRef.value = null
    translating.value = false
  }
}

async function copyTranslation() {
  const text = translatedText.value.trim()
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    toast.success(t('common.copySuccess', '复制成功'))
  } catch {
    toast.error(t('common.copyFailed', '复制失败'))
  }
}

function insertToDocument() {
  const text = translatedText.value.trim()
  if (!text) return
  const tabId = (props.sourceTabId || '').trim()
  if (tabId) {
    eventBus.emit('ai-chat-insert-to-document', { content: text, tabId })
  } else {
    eventBus.emit('ai-chat-request-insert-to-document', { content: text })
  }
}

function exportToNewDocument() {
  const text = translatedText.value.trim()
  if (!text) return
  eventBus.emit('ai-chat-export-to-document', { content: text })
  toast.success(t('aiChat.exportToDocumentSuccess', '已发送导出请求'))
}

function replaceSelection() {
  const text = translatedText.value.trim()
  if (!text) return
  emit('apply-replace', text)
  emit('update:open', false)
}

onBeforeUnmount(() => {
  if (taskHandleRef.value) cancelAiTask(taskHandleRef.value, false)
  disposeEditors()
})
</script>

<style scoped>
.selection-translate-monaco-host {
  min-height: 220px;
  height: 100%;
}
</style>
