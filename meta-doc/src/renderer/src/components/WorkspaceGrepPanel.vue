<template>
  <div class="workspace-grep-panel" :style="panelStyle">
    <header class="panel-header">
      <div class="panel-title">
        <span>{{ $t('workspaceGrep.title', '工作区搜索') }}</span>
      </div>
    </header>

    <!-- VSCode 风格的搜索 / 替换区域 -->
    <section class="search-widgets-container">
      <div class="search-widget">
        <div class="search-row">
          <button
            class="toggle-replace-button"
            type="button"
            :aria-expanded="showReplace ? 'true' : 'false'"
            @click="showReplace = !showReplace"
          >
            ⇅
          </button>
          <div class="search-input-container">
            <div class="search-input-wrapper">
              <ScrollArea class="search-textarea-scroll">
                <Textarea
                  v-model="pattern"
                  :rows="1"
                  class="search-input"
                  :placeholder="$t('workspaceGrep.patternPlaceholder', '输入要搜索的文本或正则表达式')"
                  @keydown.enter.prevent="handleEnter"
                />
              </ScrollArea>
              <div class="search-controls">
                <button
                  class="toggle-flag"
                  :class="{ active: matchCase }"
                  type="button"
                  @click="matchCase = !matchCase"
                >
                  Aa
                </button>
                <button
                  class="toggle-flag"
                  :class="{ active: wholeWord }"
                  type="button"
                  @click="wholeWord = !wholeWord"
                >
                  W
                </button>
                <button
                  class="toggle-flag"
                  :class="{ active: useRegex }"
                  type="button"
                  @click="useRegex = !useRegex"
                >
                  .*
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="showReplace" class="replace-row">
          <div class="replace-input-container">
            <ScrollArea class="replace-textarea-scroll">
              <Textarea
                v-model="replaceText"
                :rows="1"
                class="replace-input"
                :placeholder="$t('workspaceGrep.replacePlaceholder', '替换为')"
                @keydown.enter.prevent
              />
            </ScrollArea>
          </div>
          <div class="replace-controls">
            <button
              class="toggle-flag"
              :class="{ active: preserveCase }"
              type="button"
              @click="preserveCase = !preserveCase"
            >
              ↔
            </button>
          </div>
        </div>
      </div>

      <div class="query-details">
        <span v-if="isSearching" class="status-text">
          {{ $t('workspaceGrep.searching', '正在搜索工作区...') }}
        </span>
      </div>
    </section>

    <section class="result-summary" v-if="!isSearching && matches.length > 0">
      <span>
        {{ $t('workspaceGrep.resultSummary', '共找到 {count} 处匹配', { count: matches.length }) }}
      </span>
    </section>

    <!-- 结果树：文件为一级节点，匹配为子节点 -->
    <section class="result-list" v-if="matches.length > 0">
      <ScrollArea class="result-scroll">
        <div class="file-group" v-for="group in fileGroups" :key="group.filePath">
          <div
            class="file-row"
            :class="{ 'is-expanded': groupExpanded(group.filePath) }"
            @click="handleFileClick(group.filePath, group.matches[0])"
          >
            <div class="file-main">
              <span class="twistie" @click.stop="toggleFileExpand(group.filePath)">
                {{ groupExpanded(group.filePath) ? '▼' : '▶' }}
              </span>
              <span class="file-name">{{ getFileName(group.filePath) }}</span>
              <span class="file-dir">{{ getFileDir(group.filePath) }}</span>
            </div>
            <span class="file-count">{{ group.matches.length }}</span>
          </div>

          <div v-if="groupExpanded(group.filePath)" class="match-list">
            <div
              v-for="(m, idx) in group.matches"
              :key="group.filePath + ':' + idx + ':' + m.line + ':' + m.column"
              class="match-row"
              @click="handleMatchClick(group.filePath, m)"
            >
              <span class="match-line-number">{{ m.line }}</span>
              <span class="match-line-text" v-html="getHighlightedLine(m)"></span>
            </div>
          </div>
        </div>
      </ScrollArea>
    </section>

    <section v-else-if="!isSearching && hasSearched" class="empty-state">
      <span>{{ $t('workspaceGrep.noResult', '未找到匹配项') }}</span>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Textarea } from '@renderer/components/ui/textarea'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { themeState, mixColors } from '../utils/themes'
import { useWorkspace } from '../stores/workspace'
import { grepInWorkspaces, type WorkspaceGrepMatch } from '../utils/workspace/workspace-grep'
import { searchInText } from '../utils/text-search-utils'
import eventBus from '../utils/event-bus'
import { normalize as normalizePath } from '../utils/path-utils'

const { t } = useI18n()
const workspace = useWorkspace()

const pattern = ref('')
const replaceText = ref('')
const useRegex = ref(false)
const matchCase = ref(false)
const wholeWord = ref(false)
const preserveCase = ref(false)
const showReplace = ref(false)

const isSearching = ref(false)
const hasSearched = ref(false)
const matches = ref<WorkspaceGrepMatch[]>([])
const expandedFiles = ref<Set<string>>(new Set())
let currentAbortController: AbortController | null = null
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null

const panelStyle = computed(() => ({
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  padding: '8px 8px 8px 8px',
  backgroundColor: themeState.currentTheme.background2nd,
  color: themeState.currentTheme.textColor
}))

const canSearch = computed(() => pattern.value.trim().length > 0 && !isSearching.value)

const workspaceRoots = computed<string[]>(() => {
  try {
    const saved = localStorage.getItem('workspaceFolders')
    if (!saved) return []
    const arr = JSON.parse(saved)
    if (!Array.isArray(arr)) return []
    return arr.filter((p) => typeof p === 'string' && p.length > 0)
  } catch {
    return []
  }
})

interface FileGroup {
  filePath: string
  matches: WorkspaceGrepMatch[]
}

const fileGroups = computed<FileGroup[]>(() => {
  const groups = new Map<string, WorkspaceGrepMatch[]>()
  for (const m of matches.value) {
    const key = m.filePath
    if (!groups.has(key)) {
      groups.set(key, [])
      expandedFiles.value.add(key)
    }
    groups.get(key)!.push(m)
  }
  return Array.from(groups.entries()).map(([filePath, list]) => ({
    filePath,
    matches: list
  }))
})

const groupExpanded = (filePath: string) => expandedFiles.value.has(filePath)

const toggleFileExpand = (filePath: string) => {
  const set = expandedFiles.value
  if (set.has(filePath)) {
    set.delete(filePath)
  } else {
    set.add(filePath)
  }
  expandedFiles.value = new Set(set)
}

const getFileName = (fullPath: string) => {
  const normalized = normalizePath(fullPath || '')
  const idx = normalized.lastIndexOf('/')
  return idx >= 0 ? normalized.slice(idx + 1) : normalized
}

const getFileDir = (fullPath: string) => {
  const normalized = normalizePath(fullPath || '')
  const idx = normalized.lastIndexOf('/')
  return idx >= 0 ? normalized.slice(0, idx) : ''
}

const handleEnter = () => {
  if (!pattern.value.trim()) return
  triggerSearch(true)
}

const triggerSearch = (immediate = false) => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer)
    searchDebounceTimer = null
  }

  if (!pattern.value.trim()) {
    if (currentAbortController) {
      currentAbortController.abort()
      currentAbortController = null
    }
    matches.value = []
    hasSearched.value = false
    isSearching.value = false
    return
  }

  const doSearch = () => {
    void runSearch()
  }

  if (immediate) {
    doSearch()
  } else {
    searchDebounceTimer = setTimeout(doSearch, 400)
  }
}

const runSearch = async () => {
  if (!pattern.value.trim()) return

  if (currentAbortController) {
    currentAbortController.abort()
  }
  const abortController = new AbortController()
  currentAbortController = abortController

  isSearching.value = true
  hasSearched.value = true
  matches.value = []
  expandedFiles.value = new Set()

  const patternValue = pattern.value
  const isRegex = useRegex.value
  const matchCaseValue = matchCase.value
  const wholeWordValue = wholeWord.value

  try {
    const roots = workspaceRoots.value

    if (roots.length === 0) {
      for (const tab of workspace.tabs) {
        if (abortController.signal.aborted) break
        if (tab.kind !== 'file' || !tab.id || !tab.path) continue
        const path = tab.path

        const doc = workspace.ensureDocument(tab.id)
        const text =
          doc.format === 'tex'
            ? (doc.tex as string)
            : (doc.markdown as string)

        if (!text) continue

        const textMatches = searchInText(text, patternValue, {
          useRegex: isRegex,
          matchCase: matchCaseValue,
          wholeWord: wholeWordValue
        })

        if (!textMatches.length) continue

        const lines = text.split(/\r?\n/)
        const contextLines = 3

        for (const m of textMatches) {
          if (abortController.signal.aborted) break
          const lineIndex = m.line - 1
          const startLine = Math.max(0, lineIndex - contextLines)
          const endLine = Math.min(lines.length - 1, lineIndex + contextLines)

          const preContext = lines.slice(startLine, lineIndex).join('\n')
          const postContext = lines.slice(lineIndex + 1, endLine + 1).join('\n')
          const context = lines.slice(startLine, endLine + 1).join('\n')
          const lineText = lines[lineIndex] ?? ''

          const matchItem: WorkspaceGrepMatch = {
            filePath: path,
            line: m.line,
            column: m.column,
            match: m.match,
            lineText,
            preContext,
            postContext,
            context
          }

          matches.value = matches.value.concat(matchItem)
        }
      }
    } else {
      await grepInWorkspaces(roots, {
        pattern: patternValue,
        isRegex,
        matchCase: matchCaseValue,
        wholeWord: wholeWordValue,
        contextLines: 3,
        maxMatchesPerFile: 100,
        maxFiles: 3000,
        signal: abortController.signal,
        onBatch: (batch) => {
          if (abortController.signal.aborted) return
          if (!batch || batch.length === 0) return
          matches.value = matches.value.concat(batch)
        }
      })
    }
  } finally {
    if (currentAbortController === abortController) {
      isSearching.value = false
      currentAbortController = null
    }
  }
}

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

const getHighlightedLine = (m: WorkspaceGrepMatch) => {
  const line = m.lineText ?? m.context ?? ''
  const idx = line.toLowerCase().indexOf(m.match.toLowerCase())
  if (idx === -1) {
    return escapeHtml(line)
  }
  const before = line.slice(0, idx)
  const mid = line.slice(idx, idx + m.match.length)
  const after = line.slice(idx + m.match.length)
  return `${escapeHtml(before)}<span class="match-highlight">${escapeHtml(
    mid
  )}</span>${escapeHtml(after)}`
}

const handleFileClick = (filePath: string, firstMatch?: WorkspaceGrepMatch) => {
  if (!filePath) return
  eventBus.emit('workspace-open-document', {
    path: filePath,
    isPreview: false
  })
  if (firstMatch) {
    eventBus.emit('workspace-grep-jump', {
      path: filePath,
      line: firstMatch.line,
      column: firstMatch.column
    })
  }
}

const handleMatchClick = (filePath: string, match: WorkspaceGrepMatch) => {
  eventBus.emit('workspace-open-document', {
    path: filePath,
    isPreview: false
  })
  eventBus.emit('workspace-grep-jump', {
    path: filePath,
    line: match.line,
    column: match.column
  })
}

watch(
  () => ({
    pattern: pattern.value,
    useRegex: useRegex.value,
    matchCase: matchCase.value,
    wholeWord: wholeWord.value
  }),
  () => {
    triggerSearch(false)
  }
)
</script>

<style scoped>
.workspace-grep-panel {
  font-size: 13px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.panel-title span:first-child {
  font-weight: 600;
}

.search-widgets-container {
  margin-bottom: 8px;
}

.search-widget {
  border-radius: 4px;
  padding: 4px 4px 6px;
  background-color: v-bind('mixColors(themeState.currentTheme.background, "#000000", 0.02)');
}

.search-row {
  display: flex;
  align-items: flex-start;
  gap: 4px;
}

.toggle-replace-button {
  border: none;
  background: transparent;
  width: 22px;
  height: 22px;
  cursor: pointer;
  color: v-bind('themeState.currentTheme.SideTextColor2');
}

.search-input-container {
  flex: 1;
}

.search-input-wrapper {
  position: relative;
}

.search-textarea-scroll {
  max-height: 60px;
}

.search-input :deep(textarea) {
  resize: none;
  padding-right: 72px; /* 给右上角的 toggle 留出空间，避免文字覆盖 */
}

.search-controls {
  position: absolute;
  top: 2px;
  right: 4px;
  display: flex;
  flex-direction: row;
  gap: 4px;
}

.toggle-flag {
  min-width: 22px;
  height: 22px;
  border-radius: 3px;
  border: 1px solid v-bind('themeState.currentTheme.borderColor');
  background-color: transparent;
  color: inherit;
  font-size: 11px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.toggle-flag.active {
  background-color: v-bind('themeState.currentTheme.primaryColor');
  color: v-bind('themeState.currentTheme.background');
}

.replace-row {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  margin-top: 4px;
}

.replace-input-container {
  flex: 1;
}

.replace-textarea-scroll {
  max-height: 60px;
}

.replace-input :deep(textarea) {
  resize: none;
}

.replace-controls {
  display: flex;
  flex-direction: row;
  gap: 4px;
  padding-left: 2px;
}

.query-details {
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.status-text {
  font-size: 12px;
  opacity: 0.9;
  margin-top: 4px;
}

.result-summary {
  margin-bottom: 4px;
  font-size: 12px;
}

.result-list {
  flex: 1;
  min-height: 0;
}

.result-scroll {
  height: 100%;
}

.file-group {
  margin-bottom: 4px;
}

.file-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 6px;
  border-radius: 3px;
  cursor: pointer;
  background-color: v-bind('themeState.currentTheme.background2nd');
}

.file-row:hover {
  background-color: v-bind('mixColors(themeState.currentTheme.background2nd, "#000000", 0.05)');
}

.file-main {
  display: flex;
  align-items: center;
  gap: 4px;
  overflow: hidden;
}

.twistie {
  width: 14px;
  text-align: center;
  font-size: 10px;
  flex-shrink: 0;
}

.file-name {
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-dir {
  font-size: 11px;
  opacity: 0.7;
  margin-left: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-count {
  font-size: 11px;
  padding: 0 4px;
  border-radius: 10px;
  border: 1px solid v-bind('themeState.currentTheme.borderColor');
}

.match-list {
  margin-top: 2px;
  margin-left: 16px;
}

.match-row {
  display: flex;
  align-items: center;
  padding: 1px 4px;
  border-radius: 3px;
  cursor: pointer;
}

.match-row:hover {
  background-color: v-bind('mixColors(themeState.currentTheme.background2nd, "#000000", 0.05)');
}

.match-line-number {
  width: 36px;
  font-size: 11px;
  opacity: 0.8;
  text-align: right;
  margin-right: 6px;
  font-family: monospace;
}

.match-line-text {
  font-size: 12px;
  font-family: monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.match-highlight {
  background-color: v-bind('mixColors(themeState.currentTheme.primaryColor, "#ffffff", 0.6)');
  color: inherit;
}

.empty-state {
  margin-top: 8px;
  font-size: 12px;
  opacity: 0.8;
}
</style>

