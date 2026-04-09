<template>
  <div class="latex-compiler-panel" :class="{ 'demo-mode': mode === 'demo' }">
    <div
      class="compiler-header"
      :style="{ backgroundColor: themeState.currentTheme.editorToolbarBackgroundColor }"
    >
      <span class="compiler-title">{{ $t('latexEditor.compiler.title') || 'LaTeX 编译器' }}</span>
      <div class="compiler-actions">
        <Button
          size="sm"
          :variant="isCompiling ? 'secondary' : 'default'"
          :disabled="isCompiling || mode === 'demo'"
          @click="handleCompile"
        >
          <Play v-if="!isCompiling" class="w-4 h-4 mr-1" />
          <Loader2 v-else class="w-4 h-4 mr-1 animate-spin" />
          {{
            isCompiling
              ? $t('latexEditor.compiler.compiling') || '编译中...'
              : $t('latexEditor.compiler.compile') || '编译'
          }}
        </Button>
      </div>
    </div>

    <div class="compiler-settings">
      <div class="setting-row">
        <label class="setting-label">{{ $t('latexEditor.compiler.engine') || '编译引擎' }}</label>
        <Select v-model="compilerEngine" :disabled="isCompiling || mode === 'demo'">
          <SelectTrigger class="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              value="tectonic"
              :title="$t('latexEditor.compiler.engineHintTectonic')"
              >{{ $t('latexEditor.compiler.engineOptTectonic') || 'Tectonic（内置）' }}</SelectItem>
            <SelectItem
              value="xelatex"
              :title="$t('latexEditor.compiler.engineHintXelatex')"
              >{{ $t('latexEditor.compiler.engineOptXelatex') || 'XeLaTeX' }}</SelectItem>
            <SelectItem
              value="pdflatex"
              :title="$t('latexEditor.compiler.engineHintPdflatex')"
              >{{ $t('latexEditor.compiler.engineOptPdflatex') || 'pdfLaTeX' }}</SelectItem>
            <SelectItem
              value="lualatex"
              :title="$t('latexEditor.compiler.engineHintLualatex')"
              >{{ $t('latexEditor.compiler.engineOptLualatex') || 'LuaLaTeX' }}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div class="setting-row">
        <label class="setting-label">{{
          $t('latexEditor.compiler.interaction') || '交互模式'
        }}</label>
        <Select v-model="interactionMode" :disabled="isCompiling || mode === 'demo'">
          <SelectTrigger class="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              value="nonstopmode"
              :title="$t('latexEditor.compiler.interactionHintNonstop')"
              >{{ $t('latexEditor.compiler.nonstop') || '非停止模式' }}</SelectItem>
            <SelectItem
              value="batchmode"
              :title="$t('latexEditor.compiler.interactionHintBatch')"
              >{{ $t('latexEditor.compiler.batch') || '批处理模式' }}</SelectItem>
            <SelectItem
              value="scrollmode"
              :title="$t('latexEditor.compiler.interactionHintScroll')"
              >{{ $t('latexEditor.compiler.scroll') || '滚动模式' }}</SelectItem>
            <SelectItem
              value="errorstopmode"
              :title="$t('latexEditor.compiler.interactionHintErrorstop')"
              >{{ $t('latexEditor.compiler.errorstop') || '错误停止模式' }}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div class="setting-row">
        <label class="setting-label">{{ $t('latexEditor.compiler.flags') || '编译选项' }}</label>
        <div class="flags-container">
          <label class="flag-item">
            <input
              v-model="flags.synctex"
              type="checkbox"
              :disabled="isCompiling || mode === 'demo'"
            />
            <span>-synctex=1</span>
          </label>
          <label class="flag-item">
            <input
              v-model="flags.shellEscape"
              type="checkbox"
              :disabled="isCompiling || mode === 'demo'"
            />
            <span>-shell-escape</span>
          </label>
          <label class="flag-item">
            <input
              v-model="flags.draft"
              type="checkbox"
              :disabled="isCompiling || mode === 'demo'"
            />
            <span>-draftmode</span>
          </label>
        </div>
      </div>
    </div>

    <div
      v-if="compilerEngine !== 'tectonic'"
      class="cli-command-preview"
      :title="$t('latexEditor.compiler.cliPreviewCaption')"
    >
      <div class="cli-command-label">{{ $t('latexEditor.compiler.cliPreviewLabel') }}</div>
      <pre class="cli-command-text">{{ getCommandLine }}</pre>
    </div>

    <!-- Progress Bar -->
    <div v-if="isCompiling" class="progress-section">
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: `${compileProgress}%` }"></div>
      </div>
      <span class="progress-text">{{ compileStatus }}</span>
    </div>

    <!-- Compile Result -->
    <div v-if="compileResult && !isCompiling" class="compile-result" :class="compileResult.type">
      <div class="result-header">
        <CheckCircle2 v-if="compileResult.type === 'success'" class="w-5 h-5" />
        <XCircle v-else-if="compileResult.type === 'error'" class="w-5 h-5" />
        <AlertCircle v-else class="w-5 h-5" />
        <span class="result-title">{{ compileResult.title }}</span>
      </div>
      <div class="result-details">
        <p>{{ compileResult.message }}</p>
        <p v-if="compileResult.duration" class="result-duration">
          {{ $t('latexEditor.compiler.duration') || '耗时' }}: {{ compileResult.duration }}s
        </p>
      </div>
    </div>

    <!-- Mock Console Output -->
    <div class="console-output-section">
      <div
        class="console-header-small"
        :style="{ backgroundColor: themeState.currentTheme.editorToolbarBackgroundColor }"
      >
        <span class="console-title-small">{{
          $t('latexEditor.compiler.output') || '编译输出'
        }}</span>
        <Button v-if="consoleOutput.length > 0" size="xs" variant="ghost" @click="clearConsole">
          {{ $t('console.clear') || '清空' }}
        </Button>
      </div>
      <div ref="consoleRef" class="console-content">
        <div
          v-for="(line, index) in consoleOutput"
          :key="index"
          class="console-line"
          :class="line.type"
        >
          <span class="line-prefix">{{ line.prefix }}</span>
          <span class="line-content">{{ line.content }}</span>
        </div>
        <div v-if="consoleOutput.length === 0" class="console-placeholder">
          {{ $t('latexEditor.compiler.noOutput') || '暂无编译输出...' }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@renderer/components/ui/button'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from '@renderer/components/ui/select'
import { Play, Loader2, CheckCircle2, XCircle, AlertCircle } from 'lucide-vue-next'
import { themeState } from '../utils/themes'

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    mode?: 'normal' | 'demo'
  }>(),
  {
    mode: 'normal'
  }
)

// Compiler settings
const compilerEngine = ref('tectonic')
const interactionMode = ref('nonstopmode')
const flags = ref({
  synctex: true,
  shellEscape: false,
  draft: false
})

// Compilation state
const isCompiling = ref(false)
const compileProgress = ref(0)
const compileStatus = ref('')
const compileResult = ref<{
  type: 'success' | 'error' | 'warning'
  title: string
  message: string
  duration?: number
} | null>(null)

// Console output
interface ConsoleLine {
  prefix: string
  content: string
  type: 'info' | 'success' | 'error' | 'warning'
}

const consoleOutput = ref<ConsoleLine[]>([])
const consoleRef = ref<HTMLDivElement | null>(null)

// Mock compilation log messages
const mockLogMessages = [
  { prefix: '[INFO]', content: 'Starting compilation...', type: 'info' as const },
  { prefix: '[INFO]', content: 'Engine: Tectonic / XeLaTeX / … (see toolbar options)', type: 'info' as const },
  { prefix: '[INFO]', content: 'Document class: article', type: 'info' as const },
  { prefix: '[INFO]', content: 'Loading packages...', type: 'info' as const },
  { prefix: '[INFO]', content: 'Package: fontspec 2024/01/01', type: 'info' as const },
  { prefix: '[INFO]', content: 'Package: xeCJK 2024/01/01', type: 'info' as const },
  { prefix: '[INFO]', content: 'Processing pages...', type: 'info' as const },
  { prefix: '[INFO]', content: 'Page 1: title page', type: 'info' as const },
  { prefix: '[INFO]', content: 'Page 2: section Introduction', type: 'info' as const },
  { prefix: '[INFO]', content: 'Page 3: content', type: 'info' as const },
  {
    prefix: '[INFO]',
    content: 'Output written on document.pdf (3 pages)',
    type: 'success' as const
  },
  { prefix: '[SUCCESS]', content: 'Compilation completed successfully!', type: 'success' as const }
]

const addConsoleLine = (prefix: string, content: string, type: ConsoleLine['type'] = 'info') => {
  consoleOutput.value.push({ prefix, content, type })
  nextTick(() => {
    if (consoleRef.value) {
      consoleRef.value.scrollTop = consoleRef.value.scrollHeight
    }
  })
}

const clearConsole = () => {
  if (props.mode === 'demo') return
  consoleOutput.value = []
}

const handleCompile = async () => {
  if (props.mode === 'demo') {
    // In demo mode, show a toast instead
    return
  }

  isCompiling.value = true
  compileProgress.value = 0
  compileResult.value = null
  consoleOutput.value = []

  const startTime = Date.now()

  // Simulate compilation steps
  for (let i = 0; i < mockLogMessages.length; i++) {
    const msg = mockLogMessages[i]
    compileProgress.value = Math.round(((i + 1) / mockLogMessages.length) * 100)
    compileStatus.value = msg.content

    addConsoleLine(msg.prefix, msg.content, msg.type)

    // Random delay between messages
    await new Promise((resolve) => setTimeout(resolve, 200 + Math.random() * 300))
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1)

  // Show success result
  compileResult.value = {
    type: 'success',
    title: t('latexEditor.compiler.success') || '编译成功',
    message: t('latexEditor.compiler.pdfGenerated') || 'PDF 文件已生成',
    duration: parseFloat(duration)
  }

  isCompiling.value = false
}

// For demo mode: pre-fill with mock data
if (props.mode === 'demo') {
  // Add some mock console output
  consoleOutput.value = [
    { prefix: '[INFO]', content: 'This is a demo compiler panel', type: 'info' },
    { prefix: '[INFO]', content: 'Engine: XeLaTeX', type: 'info' },
    { prefix: '[INFO]', content: 'Select settings and click Compile in real mode', type: 'warning' }
  ]
}

const getCommandLine = computed(() => {
  if (compilerEngine.value === 'tectonic') {
    return `tectonic "document.tex"  # ${t('latexEditor.compiler.tectonicCliHint')}`
  }
  const parts = [compilerEngine.value]
  parts.push(`-interaction=${interactionMode.value}`)
  if (flags.value.synctex) parts.push('-synctex=1')
  if (flags.value.shellEscape) parts.push('-shell-escape')
  if (flags.value.draft) parts.push('-draftmode')
  parts.push(`-output-directory=${t('latexEditor.compiler.cliOutputDirToken')}`)
  parts.push(t('latexEditor.compiler.cliSourceTexToken'))
  return parts.join(' ')
})

defineExpose({
  handleCompile,
  clearConsole,
  getCommandLine
})
</script>

<style scoped>
.latex-compiler-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background-color: var(
    --compiler-bg,
    v-bind('themeState.currentTheme.editorPanelBackgroundColor')
  );
  border: 1px solid var(--compiler-border, v-bind('themeState.currentTheme.borderColor'));
  border-radius: 8px;
  overflow: hidden;
}

.latex-compiler-panel.demo-mode {
  min-height: 400px;
  height: 400px;
}

.compiler-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--compiler-border, v-bind('themeState.currentTheme.borderColor'));
  flex-shrink: 0;
}

.compiler-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--compiler-text, v-bind('themeState.currentTheme.textColor'));
}

.compiler-actions {
  display: flex;
  gap: 8px;
}

.compiler-settings {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex-shrink: 0;
}

.setting-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.setting-label {
  min-width: 100px;
  font-size: 13px;
  color: var(--compiler-text-secondary, v-bind('themeState.currentTheme.textColor2'));
}

.cli-command-preview {
  margin: 0 16px 12px;
  padding: 10px 12px;
  border-radius: 6px;
  border: 1px solid var(--compiler-border, v-bind('themeState.currentTheme.borderColor'));
  background: var(--compiler-bg-muted, v-bind('themeState.currentTheme.background2nd'));
}

.cli-command-label {
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 6px;
  color: var(--compiler-text-secondary, v-bind('themeState.currentTheme.textColor2'));
}

.cli-command-text {
  margin: 0;
  font-family: 'JetBrains Mono', 'Consolas', 'Courier New', monospace;
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--compiler-text, v-bind('themeState.currentTheme.textColor'));
}

.flags-container {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.flag-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  cursor: pointer;
  color: var(--compiler-text, v-bind('themeState.currentTheme.textColor'));
}

.flag-item input[type='checkbox'] {
  cursor: pointer;
}

.flag-item input[type='checkbox']:disabled + span {
  opacity: 0.5;
  cursor: not-allowed;
}

.progress-section {
  padding: 12px 16px;
  border-top: 1px solid var(--compiler-border, v-bind('themeState.currentTheme.borderColor'));
  flex-shrink: 0;
}

.progress-bar {
  height: 4px;
  background-color: var(--compiler-progress-bg, v-bind('themeState.currentTheme.background2nd'));
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background-color: var(--compiler-progress-fill, v-bind('themeState.currentTheme.primary'));
  transition: width 0.3s ease;
}

.progress-text {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  color: var(--compiler-text-secondary, v-bind('themeState.currentTheme.textColor2'));
}

.compile-result {
  margin: 0 16px 16px;
  padding: 12px 16px;
  border-radius: 6px;
  flex-shrink: 0;
}

.compile-result.success {
  background-color: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.3);
  color: #22c55e;
}

.compile-result.error {
  background-color: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #ef4444;
}

.compile-result.warning {
  background-color: rgba(234, 179, 8, 0.1);
  border: 1px solid rgba(234, 179, 8, 0.3);
  color: #eab308;
}

.result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.result-title {
  font-weight: 600;
  font-size: 14px;
}

.result-details {
  font-size: 13px;
  padding-left: 28px;
}

.result-duration {
  margin-top: 4px;
  opacity: 0.8;
}

.console-output-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--compiler-border, v-bind('themeState.currentTheme.borderColor'));
}

.console-header-small {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  border-bottom: 1px solid var(--compiler-border, v-bind('themeState.currentTheme.borderColor'));
  flex-shrink: 0;
}

.console-title-small {
  font-size: 12px;
  font-weight: 600;
  color: var(--compiler-text-secondary, v-bind('themeState.currentTheme.textColor2'));
}

.console-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  font-family: 'JetBrains Mono', 'Consolas', 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.6;
}

.console-line {
  display: flex;
  gap: 8px;
  margin-bottom: 2px;
}

.line-prefix {
  color: var(--compiler-text-muted, v-bind('themeState.currentTheme.textColor3'));
  flex-shrink: 0;
}

.line-content {
  color: var(--compiler-text, v-bind('themeState.currentTheme.textColor'));
}

.console-line.success .line-prefix {
  color: #22c55e;
}

.console-line.error .line-prefix {
  color: #ef4444;
}

.console-line.warning .line-prefix {
  color: #eab308;
}

.console-placeholder {
  color: var(--compiler-text-muted, v-bind('themeState.currentTheme.textColor3'));
  font-style: italic;
  text-align: center;
  padding: 24px;
}
</style>
