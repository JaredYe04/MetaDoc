<template>
  <Dialog :open="visible" @update:open="(val: boolean) => emit('update:visible', val)">
    <DialogContent class="w-[90vw] max-w-[90vw]">
      <DialogHeader>
        <DialogTitle>{{
          t('main.dialogs.fileConflictTitle', { defaultValue: '文件冲突' })
        }}</DialogTitle>
      </DialogHeader>
      <div class="conflict-content">
        <div class="conflict-message">
          <Alert variant="warning">
            <AlertTriangle class="h-4 w-4" />
            <AlertTitle>{{ conflictMessage }}</AlertTitle>
          </Alert>
        </div>

        <div class="diff-container">
          <div class="diff-header">
            <div class="diff-tabs">
              <Button
                :variant="viewMode === 'unified' ? 'default' : 'secondary'"
                size="sm"
                @click="viewMode = 'unified'"
              >
                {{ t('agent.display.diff.unifiedView', '统一视图') }}
              </Button>
              <Button
                :variant="viewMode === 'split' ? 'default' : 'secondary'"
                size="sm"
                @click="viewMode = 'split'"
              >
                {{ t('agent.display.diff.splitView', '分列视图') }}
              </Button>
            </div>
            <div class="diff-stats">
              <Badge variant="default" class="bg-green-600 hover:bg-green-700 text-white">
                {{ t('agent.display.diff.insertions', { count: insertionsCount }) }}
              </Badge>
              <Badge variant="destructive">
                {{ t('agent.display.diff.deletions', { count: deletionsCount }) }}
              </Badge>
            </div>
          </div>

          <!-- 统一视图 -->
          <ScrollArea v-if="viewMode === 'unified'" class="h-[400px]">
            <div class="diff-content">
              <!-- 显示冲突区域 -->
              <template v-if="hasConflicts && conflictRanges.length > 0">
                <div
                  v-for="(conflict, conflictIndex) in conflictRanges"
                  :key="`conflict-${conflictIndex}`"
                  class="conflict-block"
                  :class="{ 'conflict-resolved': isConflictResolved(conflictIndex) }"
                >
                  <div class="conflict-header">
                    <span class="conflict-label">
                      {{
                        t('main.dialogs.conflictBlock', {
                          index: conflictIndex + 1,
                          defaultValue: `冲突 ${conflictIndex + 1}`
                        })
                      }}
                      ({{ conflict.start + 1 }}-{{ conflict.end + 1 }})
                    </span>
                    <div class="conflict-actions">
                      <Button
                        :variant="
                          getConflictChoice(conflictIndex) === 'current' ? 'default' : 'secondary'
                        "
                        size="sm"
                        @click="chooseConflictVersion(conflictIndex, 'current')"
                      >
                        {{ t('main.dialogs.useCurrentVersion', { defaultValue: '使用 MetaDoc' }) }}
                      </Button>
                      <Button
                        :variant="
                          getConflictChoice(conflictIndex) === 'external' ? 'default' : 'secondary'
                        "
                        size="sm"
                        @click="chooseConflictVersion(conflictIndex, 'external')"
                      >
                        {{ t('main.dialogs.useExternalVersion', { defaultValue: '使用磁盘' }) }}
                      </Button>
                    </div>
                  </div>
                  <div class="conflict-content-split">
                    <div class="conflict-version current-version">
                      <div class="version-label">
                        {{ t('main.dialogs.currentVersion', '当前版本（MetaDoc）') }}
                      </div>
                      <pre class="conflict-text">{{ conflict.currentText }}</pre>
                    </div>
                    <div class="conflict-version external-version">
                      <div class="version-label">
                        {{ t('main.dialogs.externalVersion', '外部版本（磁盘）') }}
                      </div>
                      <pre class="conflict-text">{{ conflict.externalText }}</pre>
                    </div>
                  </div>
                </div>
              </template>
              <!-- 显示普通差异 -->
              <template v-else-if="diffChunks && diffChunks.length > 0">
                <div
                  v-for="(chunk, chunkIndex) in diffChunks"
                  :key="`chunk-${chunkIndex}`"
                  class="diff-chunk"
                >
                  <div class="chunk-header">
                    <span class="chunk-info">
                      {{ chunk.oldStart }}-{{ chunk.oldEnd }} → {{ chunk.newStart }}-{{
                        chunk.newEnd
                      }}
                    </span>
                    <Badge
                      :variant="getChunkBadgeVariant(chunk.type)"
                      :class="getChunkBadgeClass(chunk.type)"
                    >
                      {{ getTypeLabel(chunk.type) }}
                    </Badge>
                  </div>
                  <div
                    v-if="chunk.oldLines && chunk.oldLines.length > 0"
                    class="diff-lines old-lines"
                  >
                    <div
                      v-for="(line, lineIndex) in chunk.oldLines"
                      :key="`old-${chunkIndex}-${lineIndex}`"
                      class="diff-line diff-delete"
                    >
                      <span class="line-number">{{ chunk.oldStart + lineIndex }}</span>
                      <span class="line-content">- {{ line }}</span>
                    </div>
                  </div>
                  <div
                    v-if="chunk.newLines && chunk.newLines.length > 0"
                    class="diff-lines new-lines"
                  >
                    <div
                      v-for="(line, lineIndex) in chunk.newLines"
                      :key="`new-${chunkIndex}-${lineIndex}`"
                      class="diff-line diff-insert"
                    >
                      <span class="line-number">{{ chunk.newStart + lineIndex }}</span>
                      <span class="line-content">+ {{ line }}</span>
                    </div>
                  </div>
                </div>
              </template>
              <div v-else class="no-diff-data">
                {{ t('agent.display.diff.noData', '无差异数据') }}
              </div>
            </div>
          </ScrollArea>

          <!-- 分列视图 -->
          <div v-else class="split-view-container">
            <div class="split-editors">
              <div class="editor-panel old-panel">
                <div class="editor-header">
                  <span class="editor-label">{{
                    t('main.dialogs.currentVersion', '当前版本（MetaDoc）')
                  }}</span>
                </div>
                <div :id="oldEditorId" class="monaco-editor-container"></div>
              </div>
              <div class="editor-panel new-panel">
                <div class="editor-header">
                  <span class="editor-label">{{
                    t('main.dialogs.externalVersion', '外部版本（磁盘）')
                  }}</span>
                </div>
                <div :id="newEditorId" class="monaco-editor-container"></div>
              </div>
            </div>
            <!-- 如果有冲突，在底部显示冲突列表（可折叠） -->
            <div v-if="hasConflicts && conflictRanges.length > 0" class="conflicts-panel">
              <Collapsible v-model:open="isConflictsOpen" class="conflicts-collapsible">
                <CollapsibleTrigger class="conflicts-trigger">
                  {{
                    t('main.dialogs.conflictsList', {
                      count: conflictRanges.length,
                      defaultValue: `冲突列表 (${conflictRanges.length})`
                    })
                  }}
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ScrollArea class="h-[200px]">
                    <div class="conflicts-list">
                      <div
                        v-for="(conflict, conflictIndex) in conflictRanges"
                        :key="`conflict-${conflictIndex}`"
                        class="conflict-item"
                        :class="{ 'conflict-resolved': isConflictResolved(conflictIndex) }"
                        :style="{
                          borderColor: isConflictResolved(conflictIndex)
                            ? conflictColors.resolved.border
                            : conflictColors.unresolved.border,
                          backgroundColor: isConflictResolved(conflictIndex)
                            ? conflictColors.resolved.background
                            : conflictColors.unresolved.background
                        }"
                      >
                        <div class="conflict-item-header">
                          <span class="conflict-item-label">
                            {{
                              t('main.dialogs.conflictBlock', {
                                index: conflictIndex + 1,
                                defaultValue: `冲突 ${conflictIndex + 1}`
                              })
                            }}
                            ({{ conflict.start + 1 }}-{{ conflict.end + 1 }})
                          </span>
                        </div>
                        <div class="conflict-item-actions">
                          <Button
                            :variant="
                              getConflictChoice(conflictIndex) === 'current'
                                ? 'default'
                                : 'secondary'
                            "
                            size="sm"
                            @click="chooseConflictVersion(conflictIndex, 'current')"
                          >
                            {{
                              t('main.dialogs.useCurrentVersion', { defaultValue: '使用 MetaDoc' })
                            }}
                          </Button>
                          <Button
                            :variant="
                              getConflictChoice(conflictIndex) === 'external'
                                ? 'default'
                                : 'secondary'
                            "
                            size="sm"
                            @click="chooseConflictVersion(conflictIndex, 'external')"
                          >
                            {{ t('main.dialogs.useExternalVersion', { defaultValue: '使用磁盘' }) }}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </ScrollArea>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>
        </div>
      </div>

      <DialogFooter>
        <div class="dialog-footer">
          <div class="footer-left">
            <Button variant="secondary" @click="handleCancel">
              {{ t('main.dialogs.keepCurrentVersion', { defaultValue: '保留当前版本' }) }}
            </Button>
            <Button variant="secondary" @click="handleUseExternal">
              {{ t('main.dialogs.useExternalVersion', { defaultValue: '使用外部版本' }) }}
            </Button>
          </div>
          <div class="footer-right">
            <Button
              v-if="hasConflicts"
              variant="outline"
              class="bg-green-600 text-white hover:bg-green-700 border-green-600"
              :disabled="!allConflictsResolved"
              @click="handleMerge"
            >
              {{ t('main.dialogs.mergeConflicts', { defaultValue: '合并' }) }}
              <template v-if="!allConflictsResolved">
                ({{ conflictRanges.length - conflictChoices.size }}/{{ conflictRanges.length }})
              </template>
            </Button>
          </div>
        </div>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@renderer/components/ui/button'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Alert, AlertTitle } from '@renderer/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { AlertTriangle } from 'lucide-vue-next'
import { Badge } from '@renderer/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@renderer/components/ui/collapsible'
import { themeState } from '../utils/themes'
import * as monaco from 'monaco-editor'
import { setupMonacoWorker } from '../utils/editor/monaco-worker-config'
import { computeDiff } from '../utils/agent-tools/diff-tool'
import type { DiffChunk, DiffResult } from '../utils/agent-tools/diff-tool'
import { removeMetaInfo } from '../utils/metadata/meta-info-remover'

const { t } = useI18n()

interface Props {
  visible: boolean
  fileName: string
  currentContent: string
  externalContent: string
  savedContent?: string
  format?: 'md' | 'tex'
  mergeResult?: {
    hasConflict: boolean
    conflictRanges?: Array<{
      start: number
      end: number
      baseText: string
      currentText: string
      externalText: string
    }>
  }
}

const props = withDefaults(defineProps<Props>(), {
  format: 'md'
})

const emit = defineEmits<{
  'update:visible': [value: boolean]
  'use-external': []
  'keep-current': []
  merge: [mergedContent: string]
}>()

const viewMode = ref<'unified' | 'split'>('unified')
const oldEditorId = ref(`conflict-old-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`)
const newEditorId = ref(`conflict-new-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`)
const isConflictsOpen = ref(false) // 默认折叠冲突列表

// 冲突选择状态：记录每个冲突区域选择使用哪个版本 ('current' | 'external' | null)
const conflictChoices = ref<Map<number, 'current' | 'external'>>(new Map())

// 是否有冲突需要解决
const hasConflicts = computed(() => {
  return props.mergeResult?.hasConflict && (props.mergeResult.conflictRanges?.length || 0) > 0
})

// 所有冲突是否都已解决
const allConflictsResolved = computed(() => {
  if (!hasConflicts.value) return true
  const conflictRanges = props.mergeResult?.conflictRanges || []
  return conflictRanges.every((_, index) => conflictChoices.value.has(index))
})

// 移除 meta-info 后的内容（用于 diff 比较）
// meta-info 是 MetaDoc 注入的，不应该显示在 diff 窗口中
const currentContentWithoutMeta = computed(() => {
  return removeMetaInfo(props.currentContent, props.format)
})

const externalContentWithoutMeta = computed(() => {
  return removeMetaInfo(props.externalContent, props.format)
})

// 计算差异（使用移除 meta-info 后的内容）
const diffResult = computed<DiffResult>(() => {
  return computeDiff(currentContentWithoutMeta.value, externalContentWithoutMeta.value)
})

const diffChunks = computed<DiffChunk[]>(() => {
  return diffResult.value.chunks || []
})

const insertionsCount = computed(() => {
  return diffResult.value.summary?.insertions || 0
})

const deletionsCount = computed(() => {
  return diffResult.value.summary?.deletions || 0
})

const getChunkBadgeVariant = (
  type: string
): 'default' | 'secondary' | 'destructive' | 'outline' => {
  const map: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    insert: 'default',
    delete: 'destructive',
    replace: 'secondary',
    equal: 'outline'
  }
  return map[type] || 'outline'
}

const getChunkBadgeClass = (type: string): string => {
  const map: Record<string, string> = {
    insert: 'bg-green-600 hover:bg-green-700 text-white',
    delete: '',
    replace: 'bg-amber-500 hover:bg-amber-600 text-white',
    equal: ''
  }
  return map[type] || ''
}

const getTypeLabel = (type: string) => {
  if (type === 'insert') return '+'
  if (type === 'delete') return '-'
  if (type === 'replace') return '~'
  return '='
}

const conflictMessage = computed(() => {
  if (hasConflicts.value) {
    const unresolvedCount =
      (props.mergeResult?.conflictRanges?.length || 0) - conflictChoices.value.size
    if (unresolvedCount > 0) {
      return t('main.dialogs.fileConflictMessageWithConflicts', {
        fileName: props.fileName,
        unresolvedCount,
        defaultValue: `文件 "${props.fileName}" 有 ${unresolvedCount} 处冲突需要解决。请为每个冲突选择使用 MetaDoc 版本或磁盘版本。`
      })
    }
  }
  return t('main.dialogs.fileConflictMessage', {
    fileName: props.fileName,
    defaultValue: `文件 "${props.fileName}" 已在外部被修改，且当前有未保存的改动。请选择如何处理。`
  })
})

// 获取冲突区域列表
const conflictRanges = computed(() => {
  return props.mergeResult?.conflictRanges || []
})

// 选择冲突版本
const chooseConflictVersion = (conflictIndex: number, version: 'current' | 'external') => {
  conflictChoices.value.set(conflictIndex, version)
}

// 检查冲突区域是否已选择
const isConflictResolved = (conflictIndex: number) => {
  return conflictChoices.value.has(conflictIndex)
}

// 获取冲突区域的选择
const getConflictChoice = (conflictIndex: number): 'current' | 'external' | null => {
  return conflictChoices.value.get(conflictIndex) || null
}

// 生成合并后的内容
const generateMergedContent = (): string => {
  if (!hasConflicts.value || !props.savedContent) {
    return currentContentWithoutMeta.value
  }

  const currentLines = currentContentWithoutMeta.value.split('\n')
  const externalLines = externalContentWithoutMeta.value.split('\n')
  const savedLines = props.savedContent.split('\n')
  const mergedLines: string[] = []

  const conflicts = conflictRanges.value
  let lineIndex = 0
  const maxLines = Math.max(currentLines.length, externalLines.length, savedLines.length)

  for (let conflictIndex = 0; conflictIndex < conflicts.length; conflictIndex++) {
    const conflict = conflicts[conflictIndex]
    const choice = conflictChoices.value.get(conflictIndex)

    // 添加冲突前的行（自动合并非冲突部分）
    while (lineIndex < conflict.start && lineIndex < maxLines) {
      const savedLine = lineIndex < savedLines.length ? savedLines[lineIndex] : ''
      const currentLine = lineIndex < currentLines.length ? currentLines[lineIndex] : ''
      const externalLine = lineIndex < externalLines.length ? externalLines[lineIndex] : ''

      // 决定使用哪一行的内容（优先使用有改动的版本）
      if (currentLine !== savedLine) {
        mergedLines.push(currentLine)
      } else if (externalLine !== savedLine) {
        mergedLines.push(externalLine)
      } else {
        mergedLines.push(currentLine || savedLine || '')
      }
      lineIndex++
    }

    // 处理冲突区域（根据用户选择）
    if (choice === 'current') {
      // 使用 MetaDoc 版本
      for (let i = conflict.start; i <= conflict.end && i < currentLines.length; i++) {
        mergedLines.push(currentLines[i])
      }
    } else if (choice === 'external') {
      // 使用磁盘版本
      for (let i = conflict.start; i <= conflict.end && i < externalLines.length; i++) {
        mergedLines.push(externalLines[i])
      }
    } else {
      // 未选择（不应该发生，因为按钮已禁用），使用当前版本作为默认值
      for (let i = conflict.start; i <= conflict.end && i < currentLines.length; i++) {
        mergedLines.push(currentLines[i])
      }
    }

    lineIndex = conflict.end + 1
  }

  // 添加剩余的行（自动合并非冲突部分）
  while (lineIndex < maxLines) {
    const savedLine = lineIndex < savedLines.length ? savedLines[lineIndex] : ''
    const currentLine = lineIndex < currentLines.length ? currentLines[lineIndex] : ''
    const externalLine = lineIndex < externalLines.length ? externalLines[lineIndex] : ''

    if (currentLine !== savedLine) {
      mergedLines.push(currentLine)
    } else if (externalLine !== savedLine) {
      mergedLines.push(externalLine)
    } else {
      mergedLines.push(currentLine || savedLine || '')
    }
    lineIndex++
  }

  return mergedLines.join('\n')
}

// 处理合并
const handleMerge = () => {
  if (!allConflictsResolved.value) return
  const mergedContent = generateMergedContent()
  emit('merge', mergedContent)
  emit('update:visible', false)
}

// 监听冲突变化，重置选择
watch(
  () => props.mergeResult,
  () => {
    conflictChoices.value.clear()
  },
  { deep: true }
)

// 计算基于主题的冲突颜色
const conflictColors = computed(() => {
  const isDark = themeState.currentTheme.type === 'dark'
  return {
    unresolved: {
      border: isDark ? 'rgba(245, 108, 108, 0.6)' : 'rgba(245, 108, 108, 0.8)',
      background: isDark ? 'rgba(245, 108, 108, 0.1)' : 'rgba(245, 108, 108, 0.15)',
      text: isDark ? 'rgba(245, 108, 108, 0.9)' : 'rgba(200, 50, 50, 0.9)'
    },
    resolved: {
      border: isDark ? 'rgba(103, 194, 58, 0.6)' : 'rgba(103, 194, 58, 0.8)',
      background: isDark ? 'rgba(103, 194, 58, 0.1)' : 'rgba(103, 194, 58, 0.15)',
      text: isDark ? 'rgba(103, 194, 58, 0.9)' : 'rgba(50, 150, 50, 0.9)'
    },
    delete: {
      background: isDark ? 'rgba(245, 108, 108, 0.1)' : 'rgba(245, 108, 108, 0.05)'
    },
    insert: {
      background: isDark ? 'rgba(103, 194, 58, 0.1)' : 'rgba(103, 194, 58, 0.05)'
    },
    currentVersion: {
      background: isDark ? 'rgba(64, 158, 255, 0.1)' : 'rgba(64, 158, 255, 0.08)'
    },
    externalVersion: {
      background: isDark ? 'rgba(245, 108, 108, 0.1)' : 'rgba(245, 108, 108, 0.08)'
    }
  }
})

// 初始化 Monaco 编辑器（分列视图）
const initMonacoEditors = async () => {
  if (viewMode.value !== 'split') return

  await nextTick()

  const oldContainer = document.getElementById(oldEditorId.value)
  const newContainer = document.getElementById(newEditorId.value)

  if (!oldContainer || !newContainer) {
    console.warn('Monaco编辑器容器未找到')
    return
  }

  // 设置 CSS 变量以便 Monaco 编辑器使用
  const root = document.documentElement
  root.style.setProperty('--conflict-delete-bg', conflictColors.value.delete.background)
  root.style.setProperty('--conflict-insert-bg', conflictColors.value.insert.background)
  root.style.setProperty('--conflict-unresolved-bg', conflictColors.value.unresolved.background)
  root.style.setProperty('--conflict-unresolved-border', conflictColors.value.unresolved.border)

  setupMonacoWorker()

  // 清理已存在的编辑器
  const editors = monaco.editor.getEditors()
  const oldEditor = editors.find((e) => e.getId?.() === oldEditorId.value)
  const newEditor = editors.find((e) => e.getId?.() === newEditorId.value)

  if (oldEditor) oldEditor.dispose()
  if (newEditor) newEditor.dispose()

  // 创建编辑器（显示移除 meta-info 后的内容）
  const oldMonacoEditor = monaco.editor.create(oldContainer, {
    value: currentContentWithoutMeta.value,
    language: 'plaintext',
    theme: themeState.currentTheme.type === 'dark' ? 'vs-dark' : 'vs',
    readOnly: true,
    lineNumbers: 'on',
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    automaticLayout: true,
    fontSize: 13,
    fontFamily: 'JetBrains Mono, Consolas, monospace'
  })

  const newMonacoEditor = monaco.editor.create(newContainer, {
    value: externalContentWithoutMeta.value,
    language: 'plaintext',
    theme: themeState.currentTheme.type === 'dark' ? 'vs-dark' : 'vs',
    readOnly: true,
    lineNumbers: 'on',
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    automaticLayout: true,
    fontSize: 13,
    fontFamily: 'JetBrains Mono, Consolas, monospace'
  })

  // 同步滚动
  oldMonacoEditor.onDidScrollChange((e) => {
    if (e.scrollTop !== undefined) newMonacoEditor.setScrollTop(e.scrollTop)
    if (e.scrollLeft !== undefined) newMonacoEditor.setScrollLeft(e.scrollLeft)
  })

  newMonacoEditor.onDidScrollChange((e) => {
    if (e.scrollTop !== undefined) oldMonacoEditor.setScrollTop(e.scrollTop)
    if (e.scrollLeft !== undefined) oldMonacoEditor.setScrollLeft(e.scrollLeft)
  })

  // 添加行装饰（包括冲突标记）
  const oldDecorations: monaco.editor.IModelDeltaDecoration[] = []
  const newDecorations: monaco.editor.IModelDeltaDecoration[] = []

  // 首先标记冲突区域
  if (hasConflicts.value && conflictRanges.value.length > 0) {
    for (const conflict of conflictRanges.value) {
      // 在左侧编辑器（MetaDoc版本）标记冲突
      for (let line = conflict.start + 1; line <= conflict.end + 1; line++) {
        oldDecorations.push({
          range: new monaco.Range(line, 1, line, 1),
          options: {
            isWholeLine: true,
            className: 'conflict-line',
            minimap: {
              color: 'rgba(245, 108, 108, 0.5)',
              position: monaco.editor.MinimapPosition.Inline
            },
            glyphMarginClassName: 'conflict-glyph'
          }
        })
      }
      // 在右侧编辑器（磁盘版本）标记冲突
      for (let line = conflict.start + 1; line <= conflict.end + 1; line++) {
        newDecorations.push({
          range: new monaco.Range(line, 1, line, 1),
          options: {
            isWholeLine: true,
            className: 'conflict-line',
            minimap: {
              color: 'rgba(245, 108, 108, 0.5)',
              position: monaco.editor.MinimapPosition.Inline
            },
            glyphMarginClassName: 'conflict-glyph'
          }
        })
      }
    }
  }

  // 然后添加差异标记
  if (diffChunks.value.length > 0) {
    for (const chunk of diffChunks.value) {
      if (chunk.type === 'delete' && chunk.oldLines) {
        for (let i = 0; i < chunk.oldLines.length; i++) {
          const line = chunk.oldStart + i
          oldDecorations.push({
            range: new monaco.Range(line, 1, line, 1),
            options: {
              isWholeLine: true,
              className: 'diff-line-delete',
              minimap: {
                color: 'rgba(245, 108, 108, 0.3)',
                position: monaco.editor.MinimapPosition.Inline
              }
            }
          })
        }
      } else if (chunk.type === 'insert' && chunk.newLines) {
        for (let i = 0; i < chunk.newLines.length; i++) {
          const line = chunk.newStart + i
          newDecorations.push({
            range: new monaco.Range(line, 1, line, 1),
            options: {
              isWholeLine: true,
              className: 'diff-line-insert',
              minimap: {
                color: 'rgba(103, 194, 58, 0.3)',
                position: monaco.editor.MinimapPosition.Inline
              }
            }
          })
        }
      } else if (chunk.type === 'replace') {
        if (chunk.oldLines) {
          for (let i = 0; i < chunk.oldLines.length; i++) {
            const line = chunk.oldStart + i
            oldDecorations.push({
              range: new monaco.Range(line, 1, line, 1),
              options: {
                isWholeLine: true,
                className: 'diff-line-delete',
                minimap: {
                  color: 'rgba(245, 108, 108, 0.3)',
                  position: monaco.editor.MinimapPosition.Inline
                }
              }
            })
          }
        }
        if (chunk.newLines) {
          for (let i = 0; i < chunk.newLines.length; i++) {
            const line = chunk.newStart + i
            newDecorations.push({
              range: new monaco.Range(line, 1, line, 1),
              options: {
                isWholeLine: true,
                className: 'diff-line-insert',
                minimap: {
                  color: 'rgba(103, 194, 58, 0.3)',
                  position: monaco.editor.MinimapPosition.Inline
                }
              }
            })
          }
        }
      }
    }

    oldMonacoEditor.deltaDecorations([], oldDecorations)
    newMonacoEditor.deltaDecorations([], newDecorations)
  }
}

const disposeMonacoEditors = () => {
  const editors = monaco.editor.getEditors()
  const oldEditor = editors.find((e) => e.getId?.() === oldEditorId.value)
  const newEditor = editors.find((e) => e.getId?.() === newEditorId.value)

  if (oldEditor) oldEditor.dispose()
  if (newEditor) newEditor.dispose()
}

const handleUseExternal = () => {
  emit('use-external')
  emit('update:visible', false)
}

const handleCancel = () => {
  emit('keep-current')
  emit('update:visible', false)
}

watch(viewMode, async (newMode) => {
  if (newMode === 'split') {
    await nextTick()
    initMonacoEditors()
  } else {
    disposeMonacoEditors()
  }
})

watch(
  () => props.visible,
  async (newVisible) => {
    if (newVisible && viewMode.value === 'split') {
      await nextTick()
      initMonacoEditors()
    }
  }
)

watch([currentContentWithoutMeta, externalContentWithoutMeta], async () => {
  if (props.visible && viewMode.value === 'split') {
    await nextTick()
    initMonacoEditors()
  }
})

// 监听冲突选择变化，更新编辑器装饰
watch(
  [conflictChoices, conflictRanges],
  async () => {
    if (props.visible && viewMode.value === 'split') {
      await nextTick()
      // 重新初始化编辑器以更新装饰
      const editors = monaco.editor.getEditors()
      const oldEditor = editors.find((e) => e.getId?.() === oldEditorId.value)
      const newEditor = editors.find((e) => e.getId?.() === newEditorId.value)

      if (oldEditor && newEditor) {
        // 重新应用装饰
        initMonacoEditors()
      }
    }
  },
  { deep: true }
)

watch(
  () => themeState.currentTheme.type,
  async () => {
    if (props.visible && viewMode.value === 'split') {
      const editors = monaco.editor.getEditors()
      const oldEditor = editors.find((e) => e.getId?.() === oldEditorId.value)
      const newEditor = editors.find((e) => e.getId?.() === newEditorId.value)

      // Monaco 主题由 monaco-global-theme 统一管理

      // 更新 CSS 变量
      const root = document.documentElement
      root.style.setProperty('--conflict-delete-bg', conflictColors.value.delete.background)
      root.style.setProperty('--conflict-insert-bg', conflictColors.value.insert.background)
      root.style.setProperty('--conflict-unresolved-bg', conflictColors.value.unresolved.background)
      root.style.setProperty('--conflict-unresolved-border', conflictColors.value.unresolved.border)
    }
  }
)

// 监听冲突颜色变化，更新 CSS 变量
watch(
  conflictColors,
  () => {
    if (props.visible && viewMode.value === 'split') {
      const root = document.documentElement
      root.style.setProperty('--conflict-delete-bg', conflictColors.value.delete.background)
      root.style.setProperty('--conflict-insert-bg', conflictColors.value.insert.background)
      root.style.setProperty('--conflict-unresolved-bg', conflictColors.value.unresolved.background)
      root.style.setProperty('--conflict-unresolved-border', conflictColors.value.unresolved.border)
    }
  },
  { deep: true }
)

onMounted(async () => {
  if (props.visible && viewMode.value === 'split') {
    await nextTick()
    initMonacoEditors()
  }
})

onBeforeUnmount(() => {
  disposeMonacoEditors()
})
</script>

<style scoped>
.file-conflict-dialog {
  --el-dialog-padding-primary: 20px;
}

.conflict-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.conflict-message {
  margin-bottom: 8px;
}

.diff-container {
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  overflow: hidden;
  background-color: v-bind('themeState.currentTheme.background');
}

.diff-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color);
  background-color: v-bind('themeState.currentTheme.background2nd');
}

.diff-tabs {
  display: flex;
  gap: 8px;
}

.diff-stats {
  display: flex;
  gap: 8px;
}

.diff-content {
  padding: 12px;
}

.diff-chunk {
  margin-bottom: 16px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  overflow: hidden;
  background-color: v-bind('themeState.currentTheme.background');
}

.chunk-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--el-border-color);
  background-color: v-bind('themeState.currentTheme.background2nd');
}

.chunk-info {
  font-size: 12px;
  color: v-bind('themeState.currentTheme.textColor');
  font-family: 'JetBrains Mono', 'Consolas', monospace;
}

.diff-lines {
  display: flex;
  flex-direction: column;
}

.diff-line {
  display: flex;
  align-items: flex-start;
  padding: 2px 0;
  font-family: 'JetBrains Mono', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.5;
}

.line-number {
  min-width: 60px;
  text-align: right;
  padding: 0 8px;
  color: v-bind('themeState.currentTheme.textColor2');
  font-size: 11px;
  user-select: none;
}

.line-content {
  flex: 1;
  padding: 0 8px;
  white-space: pre-wrap;
  word-break: break-word;
}

.old-lines .diff-line {
  background-color: v-bind('conflictColors.delete.background');
}

.new-lines .diff-line {
  background-color: v-bind('conflictColors.insert.background');
}

.no-diff-data {
  padding: 20px;
  text-align: center;
  color: v-bind('themeState.currentTheme.textColor2');
}

.split-view-container {
  width: 100%;
  height: 400px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.split-editors {
  flex: 1;
  display: flex;
  width: 100%;
  min-height: 0;
  overflow: hidden;
}

.conflicts-panel {
  border-top: 1px solid var(--el-border-color);
  background-color: v-bind('themeState.currentTheme.background2nd');
  max-height: 250px;
  overflow: hidden;
}

.conflicts-collapsible {
  border: none;
  background-color: transparent;
}

.conflicts-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 16px;
  background-color: v-bind('themeState.currentTheme.background2nd');
  color: v-bind('themeState.currentTheme.textColor');
  border-bottom: 1px solid var(--el-border-color);
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.conflicts-trigger:hover {
  background-color: v-bind('themeState.currentTheme.hoverBackground');
}

.conflicts-trigger::after {
  content: '';
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 5px solid v-bind('themeState.currentTheme.textColor2');
  transition: transform 0.2s;
}

.conflicts-trigger[data-state='open']::after {
  transform: rotate(180deg);
}

.conflicts-collapsible [data-state='open'] {
  background-color: v-bind('themeState.currentTheme.background');
}

.conflicts-list {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.conflict-item {
  padding: 10px 12px;
  border: 1px solid;
  border-radius: 4px;
  background-color: v-bind('themeState.currentTheme.background');
  transition: all 0.2s;
}

.conflict-item-header {
  margin-bottom: 8px;
}

.conflict-item-label {
  font-size: 12px;
  font-weight: 500;
  color: v-bind('themeState.currentTheme.textColor');
  line-height: 1.4;
}

.conflict-item-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.editor-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--el-border-color);
  overflow: hidden;
}

.editor-panel:last-child {
  border-right: none;
}

.editor-header {
  padding: 8px 12px;
  border-bottom: 1px solid var(--el-border-color);
  font-weight: 500;
  font-size: 13px;
  background-color: v-bind('themeState.currentTheme.background2nd');
  color: v-bind('themeState.currentTheme.textColor');
}

.monaco-editor-container {
  flex: 1;
  min-height: 0;
}

.dialog-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.footer-left {
  display: flex;
  gap: 12px;
}

.footer-right {
  display: flex;
  gap: 12px;
}

.conflict-block {
  margin-bottom: 16px;
  border: 2px solid;
  border-radius: 6px;
  overflow: hidden;
  background-color: v-bind('themeState.currentTheme.background');
  transition: border-color 0.2s;
}

.conflict-block:not(.conflict-resolved) {
  border-color: v-bind('conflictColors.unresolved.border');
}

.conflict-block.conflict-resolved {
  border-color: v-bind('conflictColors.resolved.border');
}

.conflict-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color);
  transition: background-color 0.2s;
}

.conflict-block:not(.conflict-resolved) .conflict-header {
  background-color: v-bind('conflictColors.unresolved.background');
}

.conflict-block.conflict-resolved .conflict-header {
  background-color: v-bind('conflictColors.resolved.background');
}

.conflict-label {
  font-weight: 600;
  font-size: 14px;
  color: v-bind('themeState.currentTheme.textColor');
}

.conflict-actions {
  display: flex;
  gap: 8px;
}

.conflict-content-split {
  display: flex;
  width: 100%;
}

.conflict-version {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--el-border-color);
}

.conflict-version:last-child {
  border-right: none;
}

.version-label {
  padding: 8px 12px;
  font-weight: 500;
  font-size: 12px;
  background-color: v-bind('themeState.currentTheme.background2nd');
  border-bottom: 1px solid var(--el-border-color);
  color: v-bind('themeState.currentTheme.textColor');
}

.current-version .version-label {
  background-color: v-bind('conflictColors.currentVersion.background');
}

.external-version .version-label {
  background-color: v-bind('conflictColors.externalVersion.background');
}

.conflict-text {
  flex: 1;
  margin: 0;
  padding: 12px;
  font-family: 'JetBrains Mono', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-x: auto;
  background-color: v-bind('themeState.currentTheme.background');
  color: v-bind('themeState.currentTheme.textColor');
  max-height: 200px;
  overflow-y: auto;
}
</style>

<style>
/* 全局样式：Monaco 编辑器的行装饰 - 使用 CSS 变量以便动态更新 */
.diff-line-delete {
  background-color: var(--conflict-delete-bg, rgba(245, 108, 108, 0.1)) !important;
}

.diff-line-insert {
  background-color: var(--conflict-insert-bg, rgba(103, 194, 58, 0.1)) !important;
}

.conflict-line {
  background-color: var(--conflict-unresolved-bg, rgba(245, 108, 108, 0.15)) !important;
  border-left: 3px solid var(--conflict-unresolved-border, rgba(245, 108, 108, 0.6)) !important;
}

.conflict-glyph {
  background-color: var(--conflict-unresolved-border, rgba(245, 108, 108, 0.8)) !important;
}
</style>
