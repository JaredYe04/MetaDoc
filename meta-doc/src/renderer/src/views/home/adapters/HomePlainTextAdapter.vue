<template>
  <div class="home-panel-content-plaintext">
    <div class="home-panel-content">
      <DocumentMetaSection
        :title="fileName"
        :file-format="fileFormat"
        :creation-date="creationDate"
        :modification-date="modificationDate"
        :show-file-meta="true"
      />
      <div class="document-content-section">
        <Skeleton v-show="isRendering" :rows="15" animated class="content-preview-skeleton" />
        <div v-show="!isRendering" class="content-preview monaco-preview">
          <div ref="monacoContainerRef" class="monaco-preview-inner"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import * as monaco from 'monaco-editor'
import DocumentMetaSection from './DocumentMetaSection.vue'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { getMonacoLanguage } from '../../../utils/editor/format-initializer'
import { themeState, mixColors } from '../../../utils/themes'
import { setupMonacoWorker } from '../../../utils/editor/monaco-worker-config'
import { getSetting } from '../../../utils/settings'

const props = defineProps<{
  fileName: string
  fileFormat?: string
  creationDate?: string
  modificationDate?: string
  content: string
  filePath: string
}>()

const monacoContainerRef = ref<HTMLElement | null>(null)
const isRendering = ref(false)
let monacoEditor: monaco.editor.IStandaloneCodeEditor | null = null
let monacoEditorId: string | null = null

const initMonaco = async () => {
  if (!monacoContainerRef.value) return

  if (monacoEditor && monacoEditorId) {
    try {
      const editors = monaco.editor.getEditors()
      const existing = editors.find((e) => e.getId() === monacoEditorId)
      if (existing && existing.getContainerDomNode() === monacoContainerRef.value) {
        updateMonaco()
        syncTheme()
        return
      }
    } catch (e) {
      console.warn('检查Monaco预览编辑器状态失败', e)
    }
  }

  try {
    isRendering.value = true
    setupMonacoWorker()

    if (monacoEditor || monacoEditorId) {
      try {
        if (monacoEditor) monacoEditor.dispose()
        else if (monacoEditorId) {
          const editors = monaco.editor.getEditors()
          const existing = editors.find((e) => e.getId() === monacoEditorId)
          if (existing) existing.dispose()
        }
      } catch (e) {
        console.warn('销毁Monaco预览编辑器失败', e)
      }
      monacoEditor = null
      monacoEditorId = null
    }

    const language = getMonacoLanguage('txt', props.filePath)
    const isDark = themeState.currentTheme.type === 'dark'

    let showLineNumbers = true
    try {
      const lineNumberSetting = await getSetting('lineNumber')
      if (typeof lineNumberSetting === 'boolean') showLineNumbers = lineNumberSetting
      else if (typeof lineNumberSetting === 'string')
        showLineNumbers = lineNumberSetting === 'on' || lineNumberSetting === 'true'
    } catch {
      /* use default */
    }

    const editor = monaco.editor.create(monacoContainerRef.value, {
      value: props.content,
      language,
      theme: isDark ? 'vs-dark' : 'vs',
      readOnly: true,
      automaticLayout: true,
      fontSize: 14,
      wordWrap: 'on',
      lineNumbers: showLineNumbers ? 'on' : 'off',
      minimap: { enabled: false },
      contextmenu: false,
      scrollBeyondLastLine: false,
      fontFamily: "'JetBrains Mono', 'Consolas', monospace"
    })

    monacoEditor = editor
    monacoEditorId = editor.getId()

    nextTick(() => monacoEditor?.layout())
    syncTheme()
  } catch (error) {
    console.error('初始化Monaco预览编辑器失败', error)
  } finally {
    isRendering.value = false
  }
}

const syncTheme = () => {
  if (!monacoEditor) return
  const isDark = themeState.currentTheme.type === 'dark'
  const themeName = isDark ? 'vs-dark' : 'vs'
  const toMonacoColor = (color: string) => color.replace('#', '') || 'FFFFFF'
  const deeperColor = (color: string) =>
    isDark ? mixColors(color, '#000000', 0.3) : mixColors(color, '#FFFFFF', 0.3)

  monaco.editor.defineTheme('homePreviewTheme', {
    base: themeName,
    inherit: true,
    rules: [
      {
        token: '',
        background: toMonacoColor(deeperColor(themeState.currentTheme.background)),
        fontStyle: ''
      }
    ],
    colors: {
      'editor.background': deeperColor(themeState.currentTheme.background)
    }
  })
  monaco.editor.setTheme('homePreviewTheme')
}

const updateMonaco = () => {
  if (!monacoEditor) return
  try {
    const currentValue = monacoEditor.getValue()
    if (currentValue !== props.content) monacoEditor.setValue(props.content)
    if (props.filePath) {
      const language = getMonacoLanguage('txt', props.filePath)
      const model = monacoEditor.getModel()
      if (model) monaco.editor.setModelLanguage(model, language)
    }
    nextTick(() => monacoEditor?.layout())
  } catch (error) {
    console.error('更新Monaco预览编辑器内容失败', error)
  }
}

watch(
  () => [props.content, props.filePath],
  () => {
    if (monacoEditor) updateMonaco()
    else initMonaco()
  }
)

onMounted(() => {
  initMonaco()
})

onBeforeUnmount(() => {
  if (monacoEditor) {
    try {
      monacoEditor.dispose()
    } catch (e) {
      console.warn('清理Monaco预览编辑器失败', e)
    }
    monacoEditor = null
    monacoEditorId = null
  }
})

defineExpose({
  syncTheme,
  initMonaco
})
</script>

<style scoped>
.home-panel-content-plaintext {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  width: 100%;
  overflow: hidden;
}

.home-panel-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 32px 40px;
  box-sizing: border-box;
  gap: 24px;
}

.document-content-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.content-preview-skeleton {
  flex: 1;
  width: 100%;
  min-height: 0;
  padding: 24px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
}

.content-preview-skeleton :deep(> div) {
  height: 20px;
  margin-bottom: 16px;
  border-radius: 4px;
}

.content-preview-skeleton :deep(> div:last-child) {
  width: 60%;
}

.monaco-preview {
  flex: 1;
  width: 100%;
  min-height: 0;
  padding: 0;
  box-sizing: border-box;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.monaco-preview-inner {
  flex: 1;
  width: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
</style>
