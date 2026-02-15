<template>
  <div class="workflow-code-editor" :style="containerStyle">
    <div class="code-editor-header">
      <div class="header-left">
        <h3>{{ t('agent.workflow.pseudoCode.title') }}</h3>
      </div>
      <div class="header-right" v-if="!props.readOnly">
        <el-button size="small" @click="handleFormat">{{ t('common.format') }}</el-button>
        <el-button size="small" type="primary" @click="handleApply">{{
          t('common.apply')
        }}</el-button>
      </div>
    </div>
    <div ref="editorContainer" class="code-editor-content"></div>
    <div v-if="parseErrors.length > 0" class="code-errors">
      <el-alert
        v-for="(error, index) in parseErrors"
        :key="index"
        :title="error"
        type="error"
        :closable="false"
        show-icon
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import * as monaco from 'monaco-editor'
import { themeState } from '../../../utils/themes'
import type { Workflow } from '../../../types/agent-framework'
import {
  workflowToPseudoCode,
  pseudoCodeToWorkflow
} from '../../../utils/agent-framework/workflow-pseudo-code'

const props = defineProps<{
  workflow: Workflow
  readOnly?: boolean
}>()

const emit = defineEmits<{
  workflowChanged: [workflow: Workflow]
}>()

const { t } = useI18n()

const editorContainer = ref<HTMLElement>()
let editor: monaco.editor.IStandaloneCodeEditor | null = null
const parseErrors = ref<string[]>([])

const containerStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor,
  height: '100%',
  display: 'flex',
  flexDirection: 'column'
}))

// 初始化Monaco编辑器
const initEditor = async () => {
  if (!editorContainer.value) return

  try {
    // 确保Monaco Worker已配置
    const { setupMonacoWorker } = await import('../../../utils/monaco-worker-config')
    setupMonacoWorker()

    // 创建编辑器（使用JavaScript语言）
    editor = monaco.editor.create(editorContainer.value, {
      value: workflowToPseudoCode(props.workflow),
      language: 'javascript',
      theme: themeState.currentTheme.type === 'dark' ? 'vs-dark' : 'vs',
      automaticLayout: true,
      minimap: { enabled: true },
      scrollBeyondLastLine: false,
      fontSize: 14,
      lineNumbers: 'on',
      wordWrap: 'on',
      readOnly: props.readOnly || false
    })

    // 监听内容变化，实时解析
    let parseTimer: number | null = null
    editor.onDidChangeModelContent(() => {
      if (parseTimer) {
        clearTimeout(parseTimer)
      }
      parseTimer = window.setTimeout(() => {
        validateCode()
      }, 500)
    })

    // 监听主题变化
    watch(
      () => themeState.currentTheme.type,
      (newType) => {
        if (editor) {
          monaco.editor.setTheme(newType === 'dark' ? 'vs-dark' : 'vs')
        }
      }
    )
  } catch (error) {
    console.error('Failed to initialize code editor:', error)
  }
}

// 验证代码
const validateCode = () => {
  if (!editor) return

  const code = editor.getValue()
  const result = pseudoCodeToWorkflow(code)

  parseErrors.value = result.errors

  // 显示语法错误标记
  if (editor && result.errors.length > 0) {
    const model = editor.getModel()
    if (model) {
      // 清除之前的标记
      monaco.editor.removeAllMarkers('workflow-pseudo')

      // 添加错误标记（简化版）
      result.errors.forEach((error, index) => {
        monaco.editor.setModelMarkers(model, 'workflow-pseudo', [
          {
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: 1,
            endColumn: 1,
            message: error,
            severity: monaco.MarkerSeverity.Error
          }
        ])
      })
    }
  }
}

// 格式化代码
const handleFormat = () => {
  if (!editor) return

  const code = editor.getValue()
  const result = pseudoCodeToWorkflow(code)

  if (result.workflow) {
    const formatted = workflowToPseudoCode(result.workflow)
    editor.setValue(formatted)
    parseErrors.value = []
    ElMessage.success(t('agent.workflow.pseudoCode.convertSuccess'))
  } else {
    ElMessage.error(t('agent.workflow.pseudoCode.parseError'))
  }
}

// 应用更改
const handleApply = () => {
  if (!editor) return

  const code = editor.getValue()
  const result = pseudoCodeToWorkflow(code)

  if (result.workflow && result.errors.length === 0) {
    emit('workflowChanged', result.workflow)
    parseErrors.value = []
    ElMessage.success(t('agent.workflow.pseudoCode.convertSuccess'))
  } else {
    ElMessage.error(t('agent.workflow.pseudoCode.parseError'))
    parseErrors.value = result.errors
  }
}

// 转换到图形视图的功能已移除，由视图切换自动处理

// 监听工作流变化，更新编辑器内容
watch(
  () => props.workflow,
  (newWorkflow) => {
    if (editor && newWorkflow) {
      const currentCode = editor.getValue()
      const newCode = workflowToPseudoCode(newWorkflow)

      // 只在内容不同时更新，避免光标位置丢失
      if (currentCode !== newCode) {
        editor.setValue(newCode)
      }
    }
  },
  { deep: true }
)

onMounted(() => {
  nextTick(() => {
    initEditor()
  })
})

onBeforeUnmount(() => {
  if (editor) {
    editor.dispose()
    editor = null
  }
})
</script>

<style scoped>
.workflow-code-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.code-editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color);
}

.header-left,
.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.code-editor-header h3 {
  margin: 0;
  font-size: 16px;
}

.code-editor-content {
  flex: 1;
  min-height: 0;
}

.code-errors {
  padding: 8px 16px;
  border-top: 1px solid var(--el-border-color);
  max-height: 150px;
  overflow-y: auto;
}
</style>
