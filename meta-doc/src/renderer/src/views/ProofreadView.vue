<template>
  <div class="proofread-view" :style="pageStyle">
    <div class="proofread-content-wrapper">
      <div class="proofread-header">
        <h2>{{ $t('proofread.title', '文章校对') }}</h2>
        <div class="header-actions">
          <Button type="primary" :loading="proofreading" @click="handleProofread">
            {{ $t('proofread.startProofread', '开始校对') }}
          </Button>
          <Button v-if="displayErrors.length > 0" @click="handleFixAll">
            {{ $t('proofread.fixAll', '一键修复全部') }}
          </Button>
          <Button v-if="displayErrors.length > 0" @click="handleIgnoreAll">
            {{ $t('proofread.ignoreAll', '一键忽略全部') }}
          </Button>
          <Button v-if="fixedErrorsCount > 0" @click="handleClearFixed">
            {{ $t('proofread.clearFixed', '清空已修复') }}
          </Button>
        </div>
      </div>

      <div v-if="!activeDocument" class="no-document">
        <p>{{ $t('proofread.noDocument', '没有活动的文档') }}</p>
      </div>

      <div v-else class="proofread-content">
        <!-- 错误统计 -->
        <div v-if="proofreadResult" class="error-stats">
          <Alert v-if="displayErrors.length === 0" variant="default" class="mb-2">
            <CheckCircle2 class="h-4 w-4" />
            <AlertTitle>{{ $t('proofread.noErrors', '未发现错误') }}</AlertTitle>
          </Alert>
          <Alert v-else variant="warning" class="mb-2">
            <AlertTriangle class="h-4 w-4" />
            <AlertTitle>
              {{
                $t(
                  'proofread.errorsFound',
                  { count: displayErrors.length },
                  `发现 ${displayErrors.length} 个错误`
                )
              }}
            </AlertTitle>
          </Alert>
        </div>

        <!-- 左右分栏布局 -->
        <div class="split-layout">
          <!-- 左侧：错误列表 -->
          <div class="errors-panel">
            <div class="errors-panel-header">
              <span class="panel-title">{{ $t('proofread.errorsList', '错误列表') }}</span>
              <Badge v-if="displayErrors.length > 0" variant="destructive">
                {{ displayErrors.length }}
              </Badge>
            </div>
            <ScrollArea class="errors-scrollbar">
              <div v-if="displayErrors.length === 0" class="no-errors-message">
                <p>{{ $t('proofread.noErrorsFound', '未发现错误') }}</p>
              </div>
              <div v-else class="errors-list">
                <div
                  v-for="(error, index) in displayErrors"
                  :key="`error-${index}`"
                  class="error-item"
                  :class="[`severity-${error.severity}`, { 'error-fixed': error.fixed }]"
                  :style="errorItemStyle"
                  @click="handleErrorItemClick(error)"
                >
                  <div class="error-header">
                    <div class="error-tags">
                      <Badge :variant="getSeverityBadgeVariant(error.severity)">
                        {{ getSeverityLabel(error.severity) }}
                      </Badge>
                      <Badge :variant="getErrorTypeBadgeVariant(error.type)">
                        {{ getErrorTypeLabel(error.type) }}
                      </Badge>
                      <Badge v-if="error.fixed" variant="default" class="bg-green-600 hover:bg-green-700">
                        {{ $t('proofread.autoFixed', '已修复') }}
                      </Badge>
                    </div>
                    <span class="error-location" :style="locationStyle">
                      {{
                        $t(
                          'proofread.location',
                          { line: error.line, column: error.column },
                          `第 ${error.line} 行，第 ${error.column} 列`
                        )
                      }}
                    </span>
                  </div>
                  <div class="error-content" :style="contentStyle">
                    <div class="error-text">
                      <span class="label">{{ $t('proofread.errorText', '错误文本') }}:</span>
                      <code>{{ error.text }}</code>
                    </div>
                    <div class="error-suggestions">
                      <span class="label">{{ $t('proofread.suggestions', '修改建议') }}:</span>
                      <div class="suggestions-list">
                        <Badge
                          v-for="(suggestion, sugIndex) in error.suggestions || [error.suggestion]"
                          :key="sugIndex"
                          :variant="(error.selectedSuggestion || error.suggestion) === suggestion ? 'default' : 'outline'"
                          class="suggestion-tag cursor-pointer"
                          :class="{
                            'suggestion-selected':
                              (error.selectedSuggestion || error.suggestion) === suggestion
                          }"
                          @click="handleSelectSuggestion(index, suggestion)"
                        >
                          {{ suggestion }}
                        </Badge>
                      </div>
                    </div>
                    <div v-if="error.message" class="error-message" :style="messageStyle">
                      {{ error.message }}
                    </div>
                  </div>
                  <div class="error-actions">
                    <Button
                      size="small"
                      type="primary"
                      :disabled="error.fixed"
                      @click="handleFixError(index)"
                    >
                      {{ $t('proofread.fix', '修复') }}
                    </Button>
                    <Button size="small" type="success" @click="handleAddToDictionary(index)">
                      {{ $t('proofread.addToDictionary', '添加到词典') }}
                    </Button>
                    <Button size="small" @click="handleIgnoreError(index)">
                      {{ $t('proofread.ignore', '忽略') }}
                    </Button>
                  </div>
                </div>
              </div>
              <ScrollBar />
            </ScrollArea>
          </div>

          <!-- 右侧：Monaco 编辑器 -->
          <div class="editor-panel">
            <div class="editor-header" :style="editorHeaderStyle">
              <span class="editor-label">{{ $t('proofread.documentPreview', '文档预览') }}</span>
            </div>
            <div :id="editorId" class="monaco-editor-container" :style="editorContainerStyle"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  ref,
  computed,
  watch,
  onMounted,
  onBeforeUnmount,
  nextTick,
  type WatchStopHandle
} from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { Button } from '@renderer/components/ui/button'
import { ScrollArea, ScrollBar } from '@renderer/components/ui/scroll-area'
import { Alert, AlertTitle } from '@renderer/components/ui/alert'
import { Badge } from '@renderer/components/ui/badge'
import { CheckCircle2, AlertTriangle } from 'lucide-vue-next'
import { useActiveDocument } from '../composables/useActiveDocument'
import { useWorkspace } from '../stores/workspace'
import { proofreadToolCallback } from '../utils/agent-tools/proofread-tool'
import type { ProofreadResult, ProofreadError } from '../utils/agent-tools/proofread-tool'
import { themeState } from '../utils/themes'
import * as monaco from 'monaco-editor'
import { setupMonacoWorker } from '../utils/monaco-worker-config'
import { webMainCalls } from '../utils/web-adapter/web-main-calls'
import messageBridge from '../bridge/message-bridge'

// 非 Electron 环境下需初始化 webMainCalls（与 proofread-tool.ts 中的逻辑一致）
if (typeof window !== 'undefined' && !(window as any).electron?.ipcRenderer) {
  webMainCalls()
}

const { t } = useI18n()
const { activeDocument } = useActiveDocument()
const workspace = useWorkspace()

// 主题样式
const pageStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

const proofreading = ref(false)
const proofreadResult = ref<ProofreadResult | null>(null)
const editorId = ref(`proofread-editor-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`)
let monacoEditor: monaco.editor.IStandaloneCodeEditor | null = null
let previousDecorations: string[] = []

// 显示的错误列表（去重后的，不包括已修复的）
const displayErrors = computed(() => {
  if (!proofreadResult.value) return []
  return (proofreadResult.value.errors || []).filter((e) => !e.fixed)
})

// 已修复的错误数量
const fixedErrorsCount = computed(() => {
  if (!proofreadResult.value) return 0
  return (proofreadResult.value.errors || []).filter((e) => e.fixed).length
})

// 获取当前文档内容
const documentContent = computed(() => {
  if (!activeDocument.value) return ''
  return activeDocument.value.format === 'tex'
    ? activeDocument.value.tex
    : activeDocument.value.markdown
})

// 从文档元数据加载校对结果
onMounted(() => {
  loadProofreadResult()
  nextTick(() => {
    initMonacoEditor()
  })
})

watch(
  () => activeDocument.value?.id,
  () => {
    loadProofreadResult()
    nextTick(() => {
      initMonacoEditor()
    })
  }
)

watch(documentContent, () => {
  if (monacoEditor) {
    updateMonacoContent()
    // 延迟高亮，确保内容已更新
    nextTick(() => {
      highlightErrors()
    })
  }
})

watch(
  displayErrors,
  () => {
    if (monacoEditor) {
      nextTick(() => {
        highlightErrors()
      })
    }
  },
  { deep: true }
)

watch(
  () => themeState.currentTheme.type,
  () => {
    if (monacoEditor) {
      const theme = themeState.currentTheme.type === 'dark' ? 'vs-dark' : 'vs'
      monaco.editor.setTheme(theme)
    }
  }
)

const loadProofreadResult = () => {
  if (!activeDocument.value) {
    proofreadResult.value = null
    return
  }

  // 从文档元数据中读取校对结果
  const meta = activeDocument.value.meta
  if (meta && (meta as any).proofreadResult) {
    const savedResult = (meta as any).proofreadResult as ProofreadResult
    // 合并新的错误（去重）
    if (proofreadResult.value && proofreadResult.value.errors) {
      const existingErrors = new Set(
        proofreadResult.value.errors.map((e) => `${e.line}-${e.column}-${e.text}`)
      )
      const newErrors = savedResult.errors.filter(
        (e) => !existingErrors.has(`${e.line}-${e.column}-${e.text}`)
      )
      proofreadResult.value = {
        ...savedResult,
        errors: [...proofreadResult.value.errors, ...newErrors],
        totalErrors: proofreadResult.value.errors.length + newErrors.length
      }
    } else {
      proofreadResult.value = savedResult
    }
  }
}

// 初始化 Monaco 编辑器
const initMonacoEditor = async () => {
  await nextTick()

  const container = document.getElementById(editorId.value)
  if (!container) {
    console.warn('Monaco编辑器容器未找到')
    return
  }

  // 清理已存在的编辑器
  if (monacoEditor) {
    monacoEditor.dispose()
    monacoEditor = null
  }

  setupMonacoWorker()

  // 创建编辑器
  monacoEditor = monaco.editor.create(container, {
    value: documentContent.value || '',
    language: activeDocument.value?.format === 'tex' ? 'latex' : 'plaintext',
    theme: themeState.currentTheme.type === 'dark' ? 'vs-dark' : 'vs',
    readOnly: true,
    lineNumbers: 'on',
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    automaticLayout: true,
    fontSize: 13,
    fontFamily: 'JetBrains Mono, Consolas, monospace',
    renderLineHighlight: 'all',
    lineDecorationsWidth: 10,
    glyphMargin: true
  })

  // 延迟高亮，确保编辑器已完全初始化
  nextTick(() => {
    highlightErrors()
  })
}

// 更新 Monaco 编辑器内容
const updateMonacoContent = () => {
  if (!monacoEditor) return
  const currentValue = monacoEditor.getValue()
  if (currentValue !== documentContent.value) {
    monacoEditor.setValue(documentContent.value)
  }
}

// 高亮错误
const highlightErrors = () => {
  if (!monacoEditor) return

  const decorations: monaco.editor.IModelDeltaDecoration[] = []

  if (proofreadResult.value && proofreadResult.value.errors) {
    for (const error of displayErrors.value) {
      if (error.line > 0 && !error.fixed) {
        // 高亮错误文本
        const range = new monaco.Range(
          error.line,
          error.column,
          error.line,
          error.column + error.length
        )
        decorations.push({
          range,
          options: {
            inlineClassName: 'proofread-error-highlight',
            hoverMessage: {
              value: `${error.message || ''}\n建议: ${error.selectedSuggestion || error.suggestion || ''}`
            },
            minimap: {
              color: 'rgba(245, 108, 108, 0.5)',
              position: monaco.editor.MinimapPosition.Inline
            }
          }
        })

        // 整行背景高亮
        decorations.push({
          range: new monaco.Range(error.line, 1, error.line, 1),
          options: {
            isWholeLine: true,
            className: 'proofread-error-line',
            glyphMarginClassName: 'proofread-error-glyph'
          }
        })
      }
    }
  }

  // 使用之前的装饰 ID 来更新，这样可以正确清除旧的装饰
  previousDecorations = monacoEditor.deltaDecorations(previousDecorations, decorations)
}

// 开始校对
const handleProofread = async () => {
  console.log('[ProofreadView] handleProofread 开始')

  if (!activeDocument.value) {
    console.warn('[ProofreadView] 没有活动的文档')
    ElMessage.warning(t('proofread.noDocument', '没有活动的文档'))
    return
  }

  proofreading.value = true

  // 初始化校对结果（如果还没有）
  if (!proofreadResult.value) {
    proofreadResult.value = {
      errors: [],
      totalErrors: 0,
      errorCounts: {
        grammar: 0,
        spelling: 0,
        latex: 0,
        style: 0,
        other: 0
      },
      text:
        activeDocument.value.format === 'tex'
          ? activeDocument.value.tex
          : activeDocument.value.markdown,
      format: activeDocument.value.format === 'tex' ? 'latex' : 'markdown'
    }
  }

  try {
    const content =
      activeDocument.value.format === 'tex'
        ? activeDocument.value.tex
        : activeDocument.value.markdown

    console.log('[ProofreadView] 文档格式:', activeDocument.value.format)
    console.log('[ProofreadView] 文档内容长度:', content?.length || 0)

    if (!content || !content.trim()) {
      console.warn('[ProofreadView] 文档内容为空')
      ElMessage.warning(t('proofread.noContent', '文档内容为空'))
      return
    }

    console.log('[ProofreadView] 开始调用校对工具...')

    // 流式错误监听
    let streamingErrorsWatcher: WatchStopHandle | null = null
    let watcherCreated = false

    // 调用校对工具，传入 onUpdate 回调来接收流式错误
    const result = await proofreadToolCallback(
      {
        text: content,
        format: activeDocument.value.format === 'tex' ? 'latex' : 'markdown'
      },
      undefined as any,
      (data, progress) => {
        // 处理流式错误更新
        const contentData = data?.content as any
        if (contentData?.stage === 'proofreading-streaming') {
          const streamingData = contentData

          // 监听流式错误
          if (streamingData.streamingErrors && !watcherCreated) {
            // 如果还没有watcher，创建一个
            watcherCreated = true
            streamingErrorsWatcher = watch(
              () => streamingData.streamingErrors.value,
              (streamingErrorList) => {
                if (!streamingErrorList || streamingErrorList.length === 0) return

                console.log('[ProofreadView] 收到流式错误更新:', streamingErrorList.length)

                // 合并流式错误到 proofreadResult
                if (!proofreadResult.value) {
                  if (!activeDocument.value) return
                  proofreadResult.value = {
                    errors: [],
                    totalErrors: 0,
                    errorCounts: {
                      grammar: 0,
                      spelling: 0,
                      latex: 0,
                      style: 0,
                      other: 0
                    },
                    text: content,
                    format: activeDocument.value.format === 'tex' ? 'latex' : 'markdown'
                  }
                }

                // 去重合并
                const existingKeys = new Set(
                  proofreadResult.value.errors.map((e) => `${e.line}-${e.column}-${e.text}`)
                )

                const streamedNewErrors = streamingErrorList.filter(
                  (e: ProofreadError) => !existingKeys.has(`${e.line}-${e.column}-${e.text}`)
                )

                if (streamedNewErrors.length > 0) {
                  proofreadResult.value.errors.push(...streamedNewErrors)
                  proofreadResult.value.totalErrors = proofreadResult.value.errors.length

                  // 更新错误统计
                  for (const error of streamedNewErrors) {
                    const errorType = error.type as keyof typeof proofreadResult.value.errorCounts
                    proofreadResult.value.errorCounts[errorType] =
                      (proofreadResult.value.errorCounts[errorType] || 0) + 1
                  }

                  // 保存到文档元数据
                  if (activeDocument.value) {
                    workspace.updateDocumentMeta(activeDocument.value.id, (meta) => {
                      ;(meta as any).proofreadResult = proofreadResult.value
                    })
                  }

                  // 更新高亮
                  nextTick(() => {
                    highlightErrors()
                  })

                  console.log(
                    `[ProofreadView] 流式更新：新增 ${streamedNewErrors.length} 个错误，总计 ${proofreadResult.value.totalErrors} 个`
                  )
                }
              },
              { immediate: true, deep: true }
            )
          }
        }
      }
    )

    console.log('[ProofreadView] 校对工具返回结果:', {
      status: result.status,
      hasData: !!result.data,
      hasResult: !!result.result,
      error: result.error,
      dataStructure: result.data ? Object.keys(result.data) : []
    })

    if (result.status === 'succeeded') {
      // 优先使用 result.result，如果没有则从 result.data.content.result 获取
      let proofreadData: ProofreadResult | null = null

      if (result.result) {
        proofreadData = result.result as ProofreadResult
        console.log('[ProofreadView] 从 result.result 获取校对结果')
      } else if (
        result.data &&
        (result.data as any).content &&
        (result.data as any).content.result
      ) {
        proofreadData = (result.data as any).content.result as ProofreadResult
        console.log('[ProofreadView] 从 result.data.content.result 获取校对结果')
      } else if (result.data) {
        // 如果 data 直接就是 ProofreadResult
        proofreadData = result.data as unknown as ProofreadResult
        console.log('[ProofreadView] 从 result.data 直接获取校对结果')
      }

      if (!proofreadData) {
        console.error('[ProofreadView] ❌ 无法从返回结果中提取校对数据')
        ElMessage.error('校对结果格式错误')
        return
      }

      console.log('[ProofreadView] 校对结果:', {
        totalErrors: proofreadData.totalErrors,
        errorsCount: proofreadData.errors?.length || 0,
        format: proofreadData.format,
        autoFixed: proofreadData.autoFixed,
        fixedCount: proofreadData.fixedCount
      })

      // 清理流式错误监听器
      if (streamingErrorsWatcher) {
        const stopWatcher = streamingErrorsWatcher as WatchStopHandle
        stopWatcher()
        streamingErrorsWatcher = null
      }

      // 合并错误（去重）- 流式错误可能已经部分添加，这里只添加新的
      if (proofreadResult.value && proofreadResult.value.errors) {
        const existingErrors = new Set(
          proofreadResult.value.errors.map((e) => `${e.line}-${e.column}-${e.text}`)
        )
        const finalNewErrors = proofreadData.errors.filter(
          (e) => !existingErrors.has(`${e.line}-${e.column}-${e.text}`)
        )

        if (finalNewErrors.length > 0) {
          proofreadResult.value.errors.push(...finalNewErrors)
          proofreadResult.value.totalErrors = proofreadResult.value.errors.length

          // 更新错误统计
          for (const error of finalNewErrors) {
            const errorType = error.type as keyof typeof proofreadResult.value.errorCounts
            proofreadResult.value.errorCounts[errorType] =
              (proofreadResult.value.errorCounts[errorType] || 0) + 1
          }
        }

        // 更新其他字段
        proofreadResult.value.format = proofreadData.format
        proofreadResult.value.text = proofreadData.text
        proofreadResult.value.fixedCount = proofreadData.fixedCount
        proofreadResult.value.autoFixed = proofreadData.autoFixed
      } else {
        proofreadResult.value = proofreadData
      }

      // 保存到文档元数据
      if (activeDocument.value) {
        workspace.updateDocumentMeta(activeDocument.value.id, (meta) => {
          ;(meta as any).proofreadResult = proofreadResult.value
        })
      }

      // 更新高亮
      nextTick(() => {
        highlightErrors()
      })

      ElMessage.success(t('proofread.proofreadSuccess', '校对完成'))
    } else {
      console.error('[ProofreadView] 校对失败:', result.error)
      ElMessage.error(result.error || t('proofread.proofreadFailed', '校对失败'))
    }
  } catch (error) {
    console.error('[ProofreadView] 校对异常:', error)
    ElMessage.error('校对失败: ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    proofreading.value = false
    console.log('[ProofreadView] handleProofread 结束')
  }
}

// 获取当前选中的建议（用于判断标签是否被选中）
const getSelectedSuggestion = (error: ProofreadError, currentSuggestion: string): string => {
  // 返回当前错误选中的建议（如果有），否则返回第一个建议
  const selected = error.selectedSuggestion || error.suggestion
  // 如果当前建议和选中的建议相同，返回当前建议（用于高亮判断）
  return selected === currentSuggestion ? currentSuggestion : selected
}

// 选择建议
const handleSelectSuggestion = (index: number, suggestion: string) => {
  if (!proofreadResult.value) return

  const error = displayErrors.value[index]
  if (!error) return

  // 找到错误在完整错误列表中的索引
  const errorIndex = proofreadResult.value.errors.findIndex(
    (e) => e.line === error.line && e.column === error.column && e.text === error.text
  )

  if (errorIndex >= 0) {
    // 更新选中建议
    proofreadResult.value.errors[errorIndex].selectedSuggestion = suggestion

    // 更新元数据
    if (activeDocument.value) {
      workspace.updateDocumentMeta(activeDocument.value.id, (meta) => {
        ;(meta as any).proofreadResult = proofreadResult.value
      })
    }
  }
}

/**
 * 调整后续错误的位置（修复后调用）
 * @param fixedLine 修复错误所在的行号
 * @param fixedColumn 修复错误所在的列号
 * @param lengthDelta 文本长度变化（新长度 - 旧长度）
 */
const adjustSubsequentErrors = (fixedLine: number, fixedColumn: number, lengthDelta: number) => {
  if (!proofreadResult.value || lengthDelta === 0) return

  for (const err of proofreadResult.value.errors) {
    if (err.fixed) continue // 跳过已修复的错误

    // 如果是同一行的后续错误，调整列号
    if (err.line === fixedLine && err.column > fixedColumn) {
      err.column += lengthDelta
    }
    // 如果是后续行的错误，由于只在同一行修复，行号不变
    // 但需要考虑跨行的情况（如果修复导致行数变化，但实际上我们只修复单词，不会改变行数）
  }
}

// 修复单个错误
const handleFixError = (index: number) => {
  if (!proofreadResult.value || !activeDocument.value) return

  const error = displayErrors.value[index]
  if (!error || error.fixed) return

  const content =
    activeDocument.value.format === 'tex' ? activeDocument.value.tex : activeDocument.value.markdown

  // 替换错误文本
  const lines = content.split('\n')
  if (error.line > 0 && error.line <= lines.length) {
    const line = lines[error.line - 1]

    // 验证错误位置是否有效
    if (error.column > 0 && error.column <= line.length) {
      // 验证实际文本是否匹配错误文本
      const actualText = line.substring(error.column - 1, error.column - 1 + error.length)
      if (actualText !== error.text) {
        console.warn(
          `[ProofreadView] 错误位置不匹配，跳过修复: 期望 "${error.text}"，实际 "${actualText}"`
        )
        ElMessage.warning(t('proofread.fixFailed', '修复失败：错误位置不匹配'))
        return
      }

      // 使用选中的建议或第一个建议
      const selectedSuggestion = error.selectedSuggestion || error.suggestion

      // 计算文本长度变化
      const lengthDelta = selectedSuggestion.length - error.text.length

      // 替换错误文本（不是追加）
      const before = line.substring(0, error.column - 1)
      const after = line.substring(error.column - 1 + error.length)
      lines[error.line - 1] = before + selectedSuggestion + after

      // 更新文档内容
      const newContent = lines.join('\n')
      if (activeDocument.value.format === 'tex') {
        workspace.updateDocumentTex(activeDocument.value.id, newContent)
      } else {
        workspace.updateDocumentMarkdown(activeDocument.value.id, newContent)
      }

      // 在错误列表中找到并标记为已修复
      const errorIndex = proofreadResult.value.errors.findIndex(
        (e) => e.line === error.line && e.column === error.column && e.text === error.text
      )
      if (errorIndex >= 0) {
        proofreadResult.value.errors[errorIndex].fixed = true
      }

      // 调整后续错误的位置
      adjustSubsequentErrors(error.line, error.column, lengthDelta)

      // 更新元数据
      if (activeDocument.value) {
        workspace.updateDocumentMeta(activeDocument.value.id, (meta) => {
          ;(meta as any).proofreadResult = proofreadResult.value
        })
      }

      // 更新高亮
      nextTick(() => {
        highlightErrors()
      })

      ElMessage.success(t('proofread.fixSuccess', '修复成功'))
    }
  }
}

// 添加到词典
const handleAddToDictionary = async (index: number) => {
  if (!proofreadResult.value || !activeDocument.value) return

  const error = displayErrors.value[index]
  if (!error || !error.text) return

  try {
    // 通过消息桥调用主进程添加单词到词典
    await messageBridge.invoke('spell-check-add-word', error.text)

    // 找到所有相同的错误（相同的文本）
    const sameTextErrors = proofreadResult.value.errors.filter(
      (e) => e.text.toLowerCase() === error.text.toLowerCase()
    )

    // 从错误列表中移除所有相同的错误
    for (const sameError of sameTextErrors) {
      const errorIndex = proofreadResult.value.errors.findIndex(
        (e) =>
          e.line === sameError.line && e.column === sameError.column && e.text === sameError.text
      )
      if (errorIndex >= 0) {
        proofreadResult.value.errors.splice(errorIndex, 1)
      }
    }

    proofreadResult.value.totalErrors = proofreadResult.value.errors.length

    // 重新计算错误统计
    proofreadResult.value.errorCounts = {
      grammar: 0,
      spelling: 0,
      latex: 0,
      style: 0,
      other: 0
    }
    for (const e of proofreadResult.value.errors) {
      const errorType = e.type as keyof typeof proofreadResult.value.errorCounts
      proofreadResult.value.errorCounts[errorType] =
        (proofreadResult.value.errorCounts[errorType] || 0) + 1
    }

    // 更新元数据
    if (activeDocument.value) {
      workspace.updateDocumentMeta(activeDocument.value.id, (meta) => {
        ;(meta as any).proofreadResult = proofreadResult.value
      })
    }

    // 更新高亮
    nextTick(() => {
      highlightErrors()
    })

    ElMessage.success(
      t(
        'proofread.addToDictionarySuccess',
        `已将 "${error.text}" 添加到词典，已忽略 ${sameTextErrors.length} 个相同错误`
      )
    )
  } catch (error) {
    console.error('[ProofreadView] 添加到词典失败:', error)
    ElMessage.error(t('proofread.addToDictionaryFailed', '添加到词典失败'))
  }
}

// 忽略错误
const handleIgnoreError = (index: number) => {
  if (!proofreadResult.value || !activeDocument.value) return

  const error = displayErrors.value[index]
  if (!error) return

  // 从错误列表中移除
  const errorIndex = proofreadResult.value.errors.findIndex(
    (e) => e.line === error.line && e.column === error.column && e.text === error.text
  )
  if (errorIndex >= 0) {
    proofreadResult.value.errors.splice(errorIndex, 1)
    proofreadResult.value.totalErrors = proofreadResult.value.errors.length

    // 重新计算错误统计
    proofreadResult.value.errorCounts = {
      grammar: 0,
      spelling: 0,
      latex: 0,
      style: 0,
      other: 0
    }
    for (const e of proofreadResult.value.errors) {
      const errorType = e.type as keyof typeof proofreadResult.value.errorCounts
      proofreadResult.value.errorCounts[errorType] =
        (proofreadResult.value.errorCounts[errorType] || 0) + 1
    }

    // 更新元数据
    if (activeDocument.value) {
      workspace.updateDocumentMeta(activeDocument.value.id, (meta) => {
        ;(meta as any).proofreadResult = proofreadResult.value
      })
    }

    // 更新高亮
    nextTick(() => {
      highlightErrors()
    })

    ElMessage.info(t('proofread.ignoreSuccess', '已忽略'))
  }
}

// 修复全部错误
const handleFixAll = () => {
  if (!proofreadResult.value || !activeDocument.value) return

  const content =
    activeDocument.value.format === 'tex' ? activeDocument.value.tex : activeDocument.value.markdown

  let newContent = content
  const fixableErrors = displayErrors.value.filter((e) => !e.fixed && e.suggestion)
  let fixedCount = 0

  // 从后往前修复，避免行号变化影响
  const sortedErrors = [...fixableErrors].sort((a, b) => {
    if (a.line !== b.line) return b.line - a.line
    return b.column - a.column
  })

  for (const error of sortedErrors) {
    const lines = newContent.split('\n')
    if (error.line > 0 && error.line <= lines.length) {
      const line = lines[error.line - 1]

      // 验证错误位置是否有效
      if (error.column > 0 && error.column <= line.length) {
        // 验证实际文本是否匹配错误文本
        const actualText = line.substring(error.column - 1, error.column - 1 + error.length)
        if (actualText !== error.text) {
          console.warn(
            `[ProofreadView] 错误位置不匹配，跳过修复: 期望 "${error.text}"，实际 "${actualText}"`
          )
          continue
        }

        // 使用选中的建议或第一个建议
        const selectedSuggestion = error.selectedSuggestion || error.suggestion

        // 替换错误文本（不是追加）
        const before = line.substring(0, error.column - 1)
        const after = line.substring(error.column - 1 + error.length)
        lines[error.line - 1] = before + selectedSuggestion + after
        newContent = lines.join('\n')

        // 在错误列表中找到并标记为已修复
        const errorIndex = proofreadResult.value.errors.findIndex(
          (e) => e.line === error.line && e.column === error.column && e.text === error.text
        )
        if (errorIndex >= 0) {
          proofreadResult.value.errors[errorIndex].fixed = true
        }
        fixedCount++
      }
    }
  }

  // 更新文档内容
  if (activeDocument.value.format === 'tex') {
    workspace.updateDocumentTex(activeDocument.value.id, newContent)
  } else {
    workspace.updateDocumentMarkdown(activeDocument.value.id, newContent)
  }

  // 更新元数据
  if (activeDocument.value) {
    workspace.updateDocumentMeta(activeDocument.value.id, (meta) => {
      ;(meta as any).proofreadResult = proofreadResult.value
    })
  }

  // 更新高亮
  nextTick(() => {
    highlightErrors()
  })

  ElMessage.success(t('proofread.fixAllSuccess', `已修复 ${fixedCount} 个错误`))
}

// 一键忽略所有错误
const handleIgnoreAll = () => {
  if (!proofreadResult.value || !activeDocument.value) return

  const beforeCount = proofreadResult.value.errors.length

  // 清空所有错误
  proofreadResult.value.errors = []
  proofreadResult.value.totalErrors = 0

  // 重置错误统计
  proofreadResult.value.errorCounts = {
    grammar: 0,
    spelling: 0,
    latex: 0,
    style: 0,
    other: 0
  }

  // 更新元数据
  if (activeDocument.value) {
    workspace.updateDocumentMeta(activeDocument.value.id, (meta) => {
      ;(meta as any).proofreadResult = proofreadResult.value
    })
  }

  // 更新高亮
  nextTick(() => {
    highlightErrors()
  })

  ElMessage.success(t('proofread.ignoreAllSuccess', `已忽略 ${beforeCount} 个错误`))
}

// 清空已修复的错误
const handleClearFixed = () => {
  if (!proofreadResult.value || !activeDocument.value) return

  // 移除所有已修复的错误
  const beforeCount = proofreadResult.value.errors.length
  proofreadResult.value.errors = proofreadResult.value.errors.filter((e) => !e.fixed)
  const removedCount = beforeCount - proofreadResult.value.errors.length

  // 更新总数
  proofreadResult.value.totalErrors = proofreadResult.value.errors.length

  // 重新计算错误统计
  proofreadResult.value.errorCounts = {
    grammar: 0,
    spelling: 0,
    latex: 0,
    style: 0,
    other: 0
  }
  for (const error of proofreadResult.value.errors) {
    const errorType = error.type as keyof typeof proofreadResult.value.errorCounts
    proofreadResult.value.errorCounts[errorType] =
      (proofreadResult.value.errorCounts[errorType] || 0) + 1
  }

  // 更新元数据
  if (activeDocument.value) {
    workspace.updateDocumentMeta(activeDocument.value.id, (meta) => {
      ;(meta as any).proofreadResult = proofreadResult.value
    })
  }

  // 更新高亮
  nextTick(() => {
    highlightErrors()
  })

  ElMessage.success(t('proofread.clearFixedSuccess', `已清空 ${removedCount} 个已修复的错误`))
}

// 点击错误项，跳转到Monaco编辑器对应位置
const handleErrorItemClick = (error: ProofreadError) => {
  if (!monacoEditor || !error || error.fixed) return

  // 跳转到错误位置
  const position = {
    lineNumber: error.line,
    column: error.column
  }

  monacoEditor.setPosition(position)
  monacoEditor.revealLineInCenter(error.line)
  monacoEditor.focus()

  // 选中错误文本
  const range = new monaco.Range(error.line, error.column, error.line, error.column + error.length)
  monacoEditor.setSelection(range)
}

// 获取错误类型标签
const getErrorTypeBadgeVariant = (type: string): 'default' | 'outline' | 'destructive' | 'secondary' => {
  const typeMap: Record<string, 'default' | 'outline' | 'destructive' | 'secondary'> = {
    grammar: 'default',
    spelling: 'outline',
    latex: 'destructive',
    style: 'secondary',
    other: 'secondary'
  }
  return typeMap[type] || 'secondary'
}

const getErrorTypeLabel = (type: string) => {
  return t(`proofread.errorTypes.${type}`, type)
}

// 获取严重程度标签
const getSeverityBadgeVariant = (severity: string): 'default' | 'outline' | 'destructive' | 'secondary' => {
  if (severity === 'error') return 'destructive'
  if (severity === 'warning') return 'outline'
  return 'secondary'
}

const getSeverityLabel = (severity: string) => {
  return t(`proofread.severity.${severity}`, severity)
}

// 样式计算
const errorItemStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  border: `1px solid ${themeState.currentTheme.textColor2}20`,
  borderRadius: '6px',
  padding: '12px',
  marginBottom: '8px'
}))

const locationStyle = computed(() => ({
  color: themeState.currentTheme.textColor2,
  fontSize: '12px',
  fontFamily: 'monospace',
  marginLeft: 'auto'
}))

const contentStyle = computed(() => ({
  marginTop: '8px',
  paddingTop: '8px',
  borderTop: `1px solid ${themeState.currentTheme.textColor2}20`
}))

const messageStyle = computed(() => ({
  color: themeState.currentTheme.textColor2,
  fontSize: '12px',
  marginTop: '4px',
  fontStyle: 'italic'
}))

const editorHeaderStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd,
  color: themeState.currentTheme.textColor,
  borderBottom: `1px solid ${themeState.currentTheme.textColor2}20`,
  padding: '8px 12px',
  fontSize: '13px',
  fontWeight: '500'
}))

const editorContainerStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  height: '100%'
}))

onBeforeUnmount(() => {
  if (monacoEditor) {
    monacoEditor.dispose()
    monacoEditor = null
  }
})
</script>

<style scoped>
.proofread-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}

.proofread-content-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 24px;
  overflow: hidden;
}

.proofread-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  flex-shrink: 0;
}

.proofread-header h2 {
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.no-document {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: v-bind('themeState.currentTheme.textColor2');
}

.proofread-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.error-stats {
  margin-bottom: 16px;
  flex-shrink: 0;
}

.split-layout {
  flex: 1;
  display: flex;
  gap: 16px;
  min-height: 0;
  overflow: hidden;
}

.errors-panel {
  flex: 0 0 400px;
  display: flex;
  flex-direction: column;
  border: 1px solid v-bind('themeState.currentTheme.textColor2 + "20"');
  border-radius: 6px;
  overflow: hidden;
  background-color: v-bind('themeState.currentTheme.background2nd');
}

.errors-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid v-bind('themeState.currentTheme.textColor2 + "20"');
  background-color: v-bind('themeState.currentTheme.background2nd');
}

.panel-title {
  font-weight: 600;
  font-size: 14px;
  color: v-bind('themeState.currentTheme.textColor');
}

.errors-scrollbar {
  flex: 1;
  min-height: 0;
}

.errors-scrollbar :deep([data-radix-scroll-area-viewport]) {
  overflow-x: hidden;
}

.errors-list {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.no-errors-message {
  padding: 40px 20px;
  text-align: center;
  color: v-bind('themeState.currentTheme.textColor2');
}

.error-item {
  transition: all 0.2s;
  cursor: pointer;
}

.error-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transform: translateY(-1px);
}

.error-item.error-fixed {
  cursor: default;
  opacity: 0.6;
}

.error-item.error-fixed {
  border-left: 4px solid #67c23a;
  opacity: 0.8;
}

.error-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.error-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.error-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.error-text,
.error-suggestion {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.label {
  font-weight: bold;
  font-size: 12px;
  color: v-bind('themeState.currentTheme.textColor2');
}

code {
  background-color: v-bind('themeState.currentTheme.background2nd');
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 12px;
  font-family: monospace;
}

.suggestion-text {
  color: #67c23a;
}

.error-actions {
  margin-top: 8px;
  display: flex;
  gap: 8px;
}

.editor-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  border: 1px solid v-bind('themeState.currentTheme.textColor2 + "20"');
  border-radius: 6px;
  overflow: hidden;
  background-color: v-bind('themeState.currentTheme.background');
}

.monaco-editor-container {
  flex: 1;
  min-height: 0;
}
</style>

<style>
/* 全局样式：Monaco 编辑器的校对高亮 */
.proofread-error-highlight {
  background-color: rgba(245, 108, 108, 0.3) !important;
  font-weight: bold;
}

.proofread-error-line {
  background-color: rgba(245, 108, 108, 0.1) !important;
}

.proofread-error-glyph {
  background-color: rgba(245, 108, 108, 0.3) !important;
}
</style>
