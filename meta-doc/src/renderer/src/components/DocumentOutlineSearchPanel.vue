<template>
  <section class="doc-outline-search" :style="sectionStyle">
    <div class="search-widgets-container">
      <div class="search-widget">
        <div class="find-row">
          <span class="find-label">{{ t('searchReplace.find') }}</span>
          <Loader2 v-if="isSearching" class="search-loading-icon h-3.5 w-3.5 animate-spin shrink-0" />
        </div>
        <div class="find-input-shell">
          <input
            v-model="findText"
            type="text"
            class="find-input"
            :placeholder="t('viewMenuContainer.outlineDocSearchPlaceholder', '在本文档中查找…')"
            spellcheck="false"
            autocomplete="off"
            @keydown.enter.prevent="runSearchNow"
          />
          <div class="find-input-controls" @mousedown.prevent>
            <Tooltip>
              <TooltipTrigger as-child>
                <button
                  type="button"
                  class="find-toggle"
                  :class="{ 'find-toggle--on': matchCase }"
                  :aria-pressed="matchCase"
                  @click="matchCase = !matchCase"
                >
                  Aa
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{{ t('searchReplace.matchCase') }}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger as-child>
                <button
                  type="button"
                  class="find-toggle"
                  :class="{ 'find-toggle--on': wholeWord }"
                  :aria-pressed="wholeWord"
                  @click="wholeWord = !wholeWord"
                >
                  W
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{{ t('searchReplace.matchWholeWord') }}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger as-child>
                <button
                  type="button"
                  class="find-toggle find-toggle--regex"
                  :class="{ 'find-toggle--on': useRegex }"
                  :aria-pressed="useRegex"
                  @click="useRegex = !useRegex"
                >
                  .*
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{{ t('searchReplace.useRegex') }}</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>

    <p v-if="regexError" class="error-text">{{ regexError }}</p>
    <p v-else-if="!adapter" class="hint-text">
      {{
        t(
          'viewMenuContainer.outlineSearchNeedEditor',
          '请打开并聚焦当前文档以在本文档内搜索。'
        )
      }}
    </p>

    <div v-if="adapter && grouped.length" class="results-scroll">
      <div v-for="(group, gi) in grouped" :key="group.key + '-' + gi" class="outline-search-group">
        <div class="group-title">{{ group.displayTitle }}</div>
        <button
          v-for="item in group.items"
          :key="item.uid"
          type="button"
          class="match-row"
          :class="{ 'match-row-active': activeUid === item.uid }"
          @click="focusMatch(item)"
        >
          <span class="match-row-inner">
            <span class="match-loc"
              >{{ t('searchReplace.line') }} {{ item.match.range.start.line }},
              {{ t('searchReplace.column') }} {{ item.match.range.start.column }}</span
            >
            <span class="match-context" v-html="item.html" />
          </span>
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { Loader2 } from 'lucide-vue-next'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { mixColors, themeState } from '../utils/themes'
import { generateMatchContext } from '../utils/match-context'
import {
  buildOutlineSectionLineRanges,
  buildOutlineSectionLineRangesFromLatex,
  findSectionForLine
} from '../utils/outline-section-lines'
import { outlineSidebarSearchAdapterRef } from '../composables/outline-sidebar-search-adapter'
import { useWorkspace } from '../stores/workspace'
import type { FindResult } from '../editor/text-editor-types'
import { VditorTextEditorAdapter } from '../editor/vditor-adapter'
import { MonacoTextEditorAdapter } from '../editor/monaco-adapter'

const { t } = useI18n()
const workspace = useWorkspace()
const { activeDocument } = storeToRefs(workspace)

const adapter = computed(() => outlineSidebarSearchAdapterRef.value)

const findText = ref('')
const matchCase = ref(false)
const wholeWord = ref(false)
const useRegex = ref(false)
const regexError = ref<string | null>(null)
const matches = ref<FindResult[]>([])
const isSearching = ref(false)
const activeUid = ref<string | null>(null)

let searchTimer: ReturnType<typeof setTimeout> | null = null

const panelBg = computed(
  () =>
    (themeState.currentTheme as { sidebarPanelBackground?: string }).sidebarPanelBackground ||
    themeState.currentTheme.background2nd ||
    themeState.currentTheme.background
)
const inputBg = computed(() => mixColors(panelBg.value, themeState.currentTheme.textColor, 0.06))
const sectionHairline = computed(() => mixColors(panelBg.value, themeState.currentTheme.textColor, 0.08))
const sectionStyle = computed(() => ({
  backgroundColor: panelBg.value,
  color: themeState.currentTheme.textColor,
  '--doc-outline-search-input-bg': inputBg.value,
  '--doc-outline-search-hairline': sectionHairline.value
}))

function escapeHtml(text: string) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function matchContextHtml(fullText: string, m: FindResult): string {
  const lines = fullText.split('\n')
  let offset = 0
  for (let i = 0; i < m.range.start.line - 1; i++) {
    offset += (lines[i]?.length ?? 0) + 1
  }
  const startOffset = offset + m.range.start.column - 1
  const endOffset = startOffset + m.matchText.length
  const maxLen = 56
  const ctx = generateMatchContext(fullText, m.matchText, startOffset, endOffset, maxLen)
  return `${escapeHtml(ctx.before)}<mark class="match-highlight">${escapeHtml(ctx.match)}</mark>${escapeHtml(ctx.after)}`
}

type Grouped = {
  key: string
  displayTitle: string
  items: { uid: string; match: FindResult; html: string }[]
}

const grouped = computed((): Grouped[] => {
  const ad = adapter.value
  const doc = activeDocument.value
  const format = doc?.format?.toLowerCase() ?? 'md'
  const body = format === 'tex' ? (doc?.tex ?? '') : (doc?.markdown ?? '')
  if (!ad || !matches.value.length) return []

  let ranges: ReturnType<typeof buildOutlineSectionLineRanges>
  try {
    ranges =
      format === 'tex' ? buildOutlineSectionLineRangesFromLatex(body) : buildOutlineSectionLineRanges(body)
  } catch {
    return []
  }

  const fullText = ad.getFullText()
  const map = new Map<string, Grouped>()

  for (let i = 0; i < matches.value.length; i++) {
    const m = matches.value[i]
    const line = m.range.start.line
    const sec = findSectionForLine(line, ranges)
    const key = sec?.path ?? 'unknown'
    const displayTitle = !sec
      ? t('viewMenuContainer.outlineSearchNoHeading', '正文')
      : sec.title.trim()
        ? sec.title
        : sec.path === ''
          ? t('viewMenuContainer.outlineSearchDocStart', '文档开头')
          : t('viewMenuContainer.outlineSearchNoHeading', '正文')

    if (!map.has(key)) {
      map.set(key, { key, displayTitle, items: [] })
    }
    const g = map.get(key)!
    g.items.push({
      uid: `${i}-${line}-${m.range.start.column}`,
      match: m,
      html: matchContextHtml(fullText, m)
    })
  }

  const orderKeys = ranges.map((r) => r.path)
  const ordered: Grouped[] = []
  const seen = new Set<string>()
  for (const k of orderKeys) {
    const g = map.get(k)
    if (g && g.items.length) {
      ordered.push(g)
      seen.add(k)
    }
  }
  for (const [k, g] of map) {
    if (!seen.has(k) && g.items.length) ordered.push(g)
  }
  return ordered
})

function runSearch() {
  const ad = adapter.value
  if (!ad) {
    matches.value = []
    regexError.value = null
    return
  }
  const q = findText.value
  if (!q.trim()) {
    matches.value = []
    regexError.value = null
    return
  }

  isSearching.value = true
  regexError.value = null
  try {
    const list = ad.findTextByContent(q, {
      matchCase: matchCase.value,
      wholeWord: wholeWord.value,
      useRegex: useRegex.value,
      maxResults: 2000
    })
    matches.value = list
  } catch (e) {
    regexError.value = (e as Error)?.message ?? String(e)
    matches.value = []
  } finally {
    isSearching.value = false
  }
}

function runSearchNow() {
  if (searchTimer) {
    clearTimeout(searchTimer)
    searchTimer = null
  }
  runSearch()
}

function scheduleSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    searchTimer = null
    runSearch()
  }, 280)
}

watch(
  () => [
    outlineSidebarSearchAdapterRef.value,
    activeDocument.value?.tabId,
    activeDocument.value?.markdown,
    activeDocument.value?.tex,
    activeDocument.value?.format,
    findText.value,
    matchCase.value,
    wholeWord.value,
    useRegex.value
  ],
  () => {
    scheduleSearch()
  }
)

onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer)
})

function focusMatch(item: { match: FindResult }) {
  const ad = adapter.value
  if (!ad) return
  activeUid.value = item.uid
  const idx = matches.value.indexOf(item.match)
  if (idx < 0) return

  const q = findText.value.trim()
  const queryOpts = {
    text: q,
    matchCase: matchCase.value,
    wholeWord: wholeWord.value,
    useRegex: useRegex.value
  }

  if (ad.kind === 'vditor') {
    ;(ad as VditorTextEditorAdapter).applySidebarSearchHighlight(matches.value, idx, queryOpts)
    ad.focus()
    return
  }

  if (ad.kind === 'monaco') {
    ;(ad as MonacoTextEditorAdapter).applySidebarSearchHighlight(matches.value, idx, queryOpts)
    return
  }

  const m = item.match
  const range = m.getCurrentRange?.() ?? m.range
  ad.goTo(range.start)
  ad.focus()
  ad.goToRanges([range])
}
</script>

<style scoped>
.doc-outline-search {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-bottom: 1px solid var(--doc-outline-search-hairline, rgba(0, 0, 0, 0.06));
}

.search-widgets-container {
  padding: 6px 8px 6px;
  width: 100%;
}

.search-widget {
  width: 100%;
}

.find-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.find-label {
  font-size: 11px;
  font-weight: 600;
  opacity: 0.88;
}

.search-loading-icon {
  flex-shrink: 0;
  opacity: 0.75;
}

.find-input-shell {
  display: flex;
  align-items: center;
  gap: 2px;
  min-height: 26px;
  border-radius: 4px;
  border: 1px solid var(--el-border-color-lighter, rgba(0, 0, 0, 0.12));
  background-color: var(--doc-outline-search-input-bg, rgba(0, 0, 0, 0.04));
  padding-left: 6px;
}

.find-input {
  flex: 1;
  min-width: 0;
  height: 24px;
  line-height: 24px;
  border: none;
  outline: none;
  background: transparent;
  color: inherit;
  font-size: 12px;
  font-family: inherit;
  padding: 0 4px 0 0;
}

.find-input::placeholder {
  opacity: 0.55;
}

.find-input-controls {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 1px;
  padding-right: 3px;
}

.find-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 20px;
  padding: 0 4px;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: inherit;
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  opacity: 0.55;
  transition:
    background-color 0.1s ease,
    opacity 0.1s ease,
    transform 0.06s ease;
}

.find-toggle--regex {
  font-size: 9px;
  font-weight: 700;
}

.find-toggle:hover {
  opacity: 0.95;
  background: color-mix(in srgb, currentColor 10%, transparent);
}

.find-toggle:active {
  transform: scale(0.96);
}

.find-toggle--on {
  opacity: 1;
  background: color-mix(in srgb, var(--el-color-primary, #409eff) 22%, transparent);
  color: var(--el-color-primary, #409eff);
}

.error-text {
  margin: 0 8px 4px;
  font-size: 11px;
  color: var(--el-color-danger, #f56c6c);
}

.hint-text {
  margin: 0 8px 6px;
  font-size: 11px;
  opacity: 0.65;
  line-height: 1.35;
}

.results-scroll {
  flex: 1;
  min-height: 60px;
  max-height: 42vh;
  overflow: auto;
  padding: 2px 6px 8px;
}

.outline-search-group {
  margin-bottom: 8px;
}

.group-title {
  font-size: 10px;
  font-weight: 600;
  opacity: 0.82;
  padding: 3px 6px 4px;
  position: sticky;
  top: 0;
  background: inherit;
  z-index: 1;
}

.match-row {
  display: block;
  width: 100%;
  text-align: left;
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 0 4px;
  margin-bottom: 1px;
  cursor: pointer;
  background: color-mix(in srgb, var(--doc-outline-search-input-bg, #888) 35%, transparent);
  color: inherit;
  font: inherit;
  transition:
    border-color 0.1s ease,
    background-color 0.1s ease,
    transform 0.06s ease;
}

.match-row:hover {
  border-color: var(--el-border-color-lighter, rgba(0, 0, 0, 0.12));
}

.match-row:active {
  transform: scale(0.998);
}

.match-row-active {
  border-color: var(--el-color-primary, #409eff);
  background: color-mix(in srgb, var(--el-color-primary, #409eff) 12%, transparent);
}

.match-row-inner {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 22px;
  max-height: 22px;
  overflow: hidden;
}

.match-loc {
  flex-shrink: 0;
  font-size: 9px;
  opacity: 0.6;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.match-context {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.match-context :deep(.match-highlight) {
  background: var(--md-search-match-bg, rgba(255, 200, 0, 0.35));
  border-radius: 2px;
  padding: 0 1px;
}
</style>
