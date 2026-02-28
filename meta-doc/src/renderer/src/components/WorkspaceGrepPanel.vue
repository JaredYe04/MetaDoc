<template>
  <div ref="panelRef" class="workspace-grep-panel" :style="panelStyle">
    <header class="panel-header">
      <div class="panel-title">
        <span>{{ $t('workspaceGrep.title', '工作区搜索') }}</span>
      </div>
    </header>

    <!-- VSCode 风格的搜索 / 替换区域 -->
    <section class="search-widgets-container">
      <div class="search-widget">
        <div class="search-row">
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  variant="secondary"
                  size="icon"
                  class="toggle-replace-btn grep-icon-btn"
                  :aria-expanded="showReplace ? 'true' : 'false'"
                  @click="showReplace = !showReplace"
                >
                  <component :is="showReplace ? ArrowUp : ArrowDown" class="grep-icon-svg" />
                </Button>
              </TooltipTrigger>
            <TooltipContent side="top">
              {{ $t('searchReplace.toggleReplace', '切换替换') }}
            </TooltipContent>
          </Tooltip>
          <div class="search-input-container">
            <div class="search-input-wrapper">
              <input
                v-model="pattern"
                type="text"
                class="search-input"
                :placeholder="$t('workspaceGrep.patternPlaceholder', '搜索')"
                autocomplete="off"
                spellcheck="false"
                @keydown.enter.prevent="handleEnter"
              />
              <div class="search-controls">
                <Tooltip>
                  <TooltipTrigger as-child>
                    <button
                      type="button"
                      class="grep-toggle-btn"
                      :class="{ active: matchCase }"
                      @click="matchCase = !matchCase"
                      :aria-label="$t('searchReplace.matchCase', '区分大小写')"
                    >
                      <span class="grep-toggle-label">Aa</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {{ $t('searchReplace.matchCase', '区分大小写') }} (Alt+C)
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger as-child>
                    <button
                      type="button"
                      class="grep-toggle-btn"
                      :class="{ active: wholeWord }"
                      @click="wholeWord = !wholeWord"
                      :aria-label="$t('searchReplace.matchWholeWord', '全词匹配')"
                    >
                      <span class="grep-toggle-label">W</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {{ $t('searchReplace.matchWholeWord', '全词匹配') }} (Alt+W)
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger as-child>
                    <button
                      type="button"
                      class="grep-toggle-btn"
                      :class="{ active: useRegex }"
                      @click="useRegex = !useRegex"
                      :aria-label="$t('searchReplace.useRegex', '正则表达式')"
                    >
                      <span class="grep-toggle-label">.*</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {{ $t('searchReplace.useRegex', '正则表达式') }} (Alt+R)
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        </div>

        <div v-if="showReplace" class="replace-row">
          <div class="replace-input-container">
            <input
              v-model="replaceText"
              type="text"
              class="replace-input"
              :placeholder="$t('workspaceGrep.replacePlaceholder', '替换为')"
              autocomplete="off"
              spellcheck="false"
              @keydown.enter.prevent
            />
          </div>
          <div class="replace-controls">
            <Tooltip>
              <TooltipTrigger as-child>
                <button
                  type="button"
                  class="grep-toggle-btn"
                  :class="{ active: preserveCase }"
                  @click="preserveCase = !preserveCase"
                  :aria-label="$t('searchReplace.preserveCase', '保留大小写')"
                >
                  <span class="grep-toggle-label">AB</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {{ $t('searchReplace.preserveCase', '保留大小写') }} (Alt+P)
              </TooltipContent>
            </Tooltip>
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
    <section ref="resultListRef" class="result-list" v-if="matches.length > 0">
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
              :class="{ 'is-selected': isMatchSelected(group.filePath, m) }"
              :data-context-width="resultListWidth"
              @click="handleMatchClick(group.filePath, m)"
            >
              <span class="match-line-number">{{ m.line }}</span>
              <span class="match-line-text" v-html="getMatchContextHtml(m)"></span>
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
import { Button } from '@renderer/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { themeState, mixColors } from '../utils/themes'
import { ArrowDown, ArrowUp } from 'lucide-vue-next'
import { useWorkspace } from '../stores/workspace'
import { grepInWorkspaces, type WorkspaceGrepMatch } from '../utils/workspace/workspace-grep'
import { searchInText } from '../utils/text-search-utils'
import { generateMatchContext } from '../utils/match-context'
import eventBus from '../utils/event-bus'
import { normalize as normalizePath } from '../utils/path-utils'
import { onMounted, onBeforeUnmount } from 'vue'

const { t } = useI18n()
const workspace = useWorkspace()

const pattern = ref('')
const replaceText = ref('')
const useRegex = ref(false)
const matchCase = ref(false)
const wholeWord = ref(false)
const preserveCase = ref(false)
const showReplace = ref(false)

/** 当前选中的匹配项（点击后高亮并用于打开/定位） */
const selectedMatch = ref<{ filePath: string; line: number; column: number } | null>(null)

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

const isMatchSelected = (filePath: string, m: WorkspaceGrepMatch) => {
  const s = selectedMatch.value
  return s !== null && s.filePath === filePath && s.line === m.line && s.column === m.column
}

/** 根据结果列表容器宽度动态计算上下文最大字符数，确保匹配项在可视区中间（与 SearchReplaceMenu 一致） */
const resultListWidth = ref(0)
const calculateMatchContextMaxLength = (): number => {
  const w = resultListWidth.value
  if (w <= 0) return 60
  const lineNumberWidth = 36
  const marginRight = 6
  const padding = 8 * 2
  const availableWidth = w - lineNumberWidth - marginRight - padding - 16
  const charsPerPixel = 1 / 7
  const chars = Math.floor(availableWidth * charsPerPixel)
  return Math.max(20, Math.min(120, chars))
}

/** 以匹配项为中心取左右上下文并高亮，与 SearchReplaceMenu 一致 */
const getMatchContextHtml = (m: WorkspaceGrepMatch): string => {
  const lineText = m.lineText ?? m.context ?? ''
  if (!lineText) return ''
  const startOffset = Math.max(0, m.column - 1)
  const endOffset = Math.min(lineText.length, m.column - 1 + m.match.length)
  const maxLength = calculateMatchContextMaxLength()
  const context = generateMatchContext(
    lineText,
    m.match,
    startOffset,
    endOffset,
    maxLength
  )
  const escapeHtml = (text: string) =>
    text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  const beforeEscaped = escapeHtml(context.before)
  const matchEscaped = escapeHtml(context.match)
  const afterEscaped = escapeHtml(context.after)
  return `${beforeEscaped}<mark class="match-highlight">${matchEscaped}</mark>${afterEscaped}`
}

const panelRef = ref<HTMLElement | null>(null)
const resultListRef = ref<HTMLElement | null>(null)

onMounted(() => {
  const ro = new ResizeObserver((entries) => {
    for (const e of entries) {
      resultListWidth.value = e.contentRect.width
      break
    }
  })
  watch(
    () => resultListRef.value,
    (el, prev) => {
      if (prev) ro.unobserve(prev)
      if (el) {
        resultListWidth.value = el.getBoundingClientRect().width
        ro.observe(el)
      } else {
        resultListWidth.value = 0
      }
    },
    { immediate: true }
  )

  const onDocKeydown = (e: KeyboardEvent) => {
    if (!e.altKey) return
    if (!document.activeElement?.closest('.workspace-grep-panel')) return
    switch (e.code) {
      case 'KeyC':
        e.preventDefault()
        matchCase.value = !matchCase.value
        break
      case 'KeyW':
        e.preventDefault()
        wholeWord.value = !wholeWord.value
        break
      case 'KeyR':
        e.preventDefault()
        useRegex.value = !useRegex.value
        break
      case 'KeyP':
        e.preventDefault()
        preserveCase.value = !preserveCase.value
        break
    }
  }
  document.addEventListener('keydown', onDocKeydown)
  onBeforeUnmount(() => {
    ro.disconnect()
    document.removeEventListener('keydown', onDocKeydown)
  })
})

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
  if (firstMatch) {
    selectedMatch.value = {
      filePath,
      line: firstMatch.line,
      column: firstMatch.column
    }
  } else {
    selectedMatch.value = null
  }
  eventBus.emit('workspace-open-document', {
    path: filePath,
    isPreview: false
  })
  if (firstMatch) {
    eventBus.emit('workspace-grep-jump', {
      path: filePath,
      line: firstMatch.line,
      column: firstMatch.column,
      matchLength: firstMatch.match?.length ?? 0,
      matchText: firstMatch.match ?? ''
    })
  }
}

const handleMatchClick = (filePath: string, match: WorkspaceGrepMatch) => {
  selectedMatch.value = {
    filePath,
    line: match.line,
    column: match.column
  }
  eventBus.emit('workspace-open-document', {
    path: filePath,
    isPreview: false
  })
  eventBus.emit('workspace-grep-jump', {
    path: filePath,
    line: match.line,
    column: match.column,
    matchLength: match.match?.length ?? 0,
    matchText: match.match ?? ''
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

/* 切换替换按钮：与输入框同背景，图标随主题文字色，避免深色模式下黑底黑字 */
.toggle-replace-btn.grep-icon-btn {
  flex-shrink: 0;
  width: 25px;
  height: 25px;
  min-width: 25px;
  min-height: 25px;
  padding: 0;
  border-radius: 6px;
  background-color: v-bind('themeState.currentTheme.background') !important;
  color: v-bind('themeState.currentTheme.textColor') !important;
  border: none;
}

.toggle-replace-btn.grep-icon-btn:hover {
  background-color: v-bind('mixColors(themeState.currentTheme.background, themeState.currentTheme.textColor, 0.12)') !important;
}

.toggle-replace-btn.grep-icon-btn .grep-icon-svg {
  width: 14px;
  height: 14px;
  color: inherit;
}

.search-input-container {
  flex: 1;
  min-width: 0;
}

.search-input-wrapper {
  position: relative;
}

.search-input {
  display: block;
  width: 100%;
  height: 28px;
  line-height: 28px;
  padding: 0 8px;
  padding-right: 112px;
  border-radius: 4px;
  border: 1px solid v-bind('themeState.currentTheme.borderColor');
  background-color: v-bind('themeState.currentTheme.background');
  color: v-bind('themeState.currentTheme.textColor');
  font-size: 13px;
  outline: none;
}

.search-input::placeholder {
  color: v-bind('themeState.currentTheme.textColor2');
  opacity: 0.8;
}

.search-controls {
  position: absolute;
  top: 2px;
  right: 4px;
  display: flex;
  flex-direction: row;
  gap: 2px;
  align-items: center;
}

/* 与 ViewMenuContainer 上方菜单按钮一致：小尺寸、统一宽高、背景与输入框一致 */
.grep-toggle-btn {
  width: 25px;
  height: 25px;
  min-width: 25px;
  min-height: 25px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  background-color: v-bind('themeState.currentTheme.background');
  color: v-bind('themeState.currentTheme.textColor');
  font-size: 12px;
  font-family: inherit;
  transition: background-color 0.2s;
}

.grep-toggle-btn:hover {
  background-color: v-bind('mixColors(themeState.currentTheme.background, themeState.currentTheme.textColor, 0.12)');
}

/* 高亮状态：用 background2nd + 文字色混合，亮暗主题下文字都保持可见 */
.grep-toggle-btn.active {
  background-color: v-bind('mixColors(themeState.currentTheme.background2nd, themeState.currentTheme.textColor, 0.3)');
  color: v-bind('themeState.currentTheme.textColor');
}

.grep-toggle-label {
  font-size: 12px;
  line-height: 1;
  font-family: inherit;
}

.replace-row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
}

.replace-input-container {
  flex: 1;
  min-width: 0;
}

.replace-input {
  display: block;
  width: 100%;
  height: 28px;
  line-height: 28px;
  padding: 0 8px;
  padding-right: 36px;
  border-radius: 4px;
  border: 1px solid v-bind('themeState.currentTheme.borderColor');
  background-color: v-bind('themeState.currentTheme.background');
  color: v-bind('themeState.currentTheme.textColor');
  font-size: 13px;
  outline: none;
}

.replace-input::placeholder {
  color: v-bind('themeState.currentTheme.textColor2');
  opacity: 0.8;
}

.replace-controls {
  display: flex;
  flex-direction: row;
  gap: 2px;
  flex-shrink: 0;
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
  justify-content: flex-start;
  padding: 1px 4px;
  border-radius: 3px;
  cursor: pointer;
}

.match-row:hover {
  background-color: v-bind('mixColors(themeState.currentTheme.background2nd, "#000000", 0.05)');
}

.match-row.is-selected {
  background-color: v-bind('mixColors(themeState.currentTheme.background2nd, themeState.currentTheme.primaryColor || "#409eff", 0.25)');
}

.match-line-number {
  width: 36px;
  flex-shrink: 0;
  font-size: 11px;
  opacity: 0.8;
  text-align: left;
  margin-right: 6px;
  font-family: inherit;
}

.match-line-text {
  font-size: 12px;
  font-family: monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  flex: 1;
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

