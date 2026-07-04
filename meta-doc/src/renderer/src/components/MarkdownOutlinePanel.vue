<template>
  <div class="markdown-outline-panel" :style="panelStyle">
    <div v-if="!adapter" class="hint-text">
      {{ t('viewMenuContainer.outlineSearchNeedMd', '请打开 Markdown 文档以使用大纲。') }}
    </div>
    <div v-else-if="!displayRows.length" class="hint-text">
      {{ t('viewMenuContainer.markdownOutlineEmpty', '未识别到 Markdown 标题。') }}
    </div>
    <div v-else class="markdown-outline-scroll">
      <button
        v-for="row in displayRows"
        :key="row.path + '-' + row.titleLine"
        type="button"
        class="focus-outline-item"
        :class="{ 'focus-outline-item--active': activeLine === row.titleLine }"
        :style="{ paddingLeft: row.depth * 12 + 8 + 'px' }"
        @click="onItemClick(row)"
        @contextmenu.prevent="onItemContextMenu($event, row)"
      >
        <span class="focus-outline-item__text">{{ row.title || t('viewMenuContainer.outlineUntitled', '（无标题）') }}</span>
      </button>
    </div>
    <ContextMenu
      v-if="contextMenuVisible"
      :x="menuX"
      :y="menuY"
      :items="outlineMenuItems"
      @trigger="onOutlineMenuTrigger"
      @close="onOutlineMenuClose"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { themeState } from '../utils/themes'
import { buildOutlineSectionLineRanges, type OutlineSectionLineRange } from '../utils/outline-section-lines'
import {
  outlineSidebarSearchAdapterRef,
  outlineSidebarAdapterTabIdRef,
  registeredMonacoEditorIdRef
} from '../composables/outline-sidebar-search-adapter'
import { useWorkspace } from '../stores/workspace'
import { VIEW_MENU_DOCUMENT_TAB_ID } from './view-menu-context'
import type { TextEditorAdapter } from '../editor/text-editor-types'
import type { SectionInfo } from './section-optimizer/types'
import type { MaterialBasketItem } from '../../../types'
import { getMarkdownOutlineContextMenuItems } from './contextMenus/MarkdownOutlineContextMenu'
import ContextMenu from './ContextMenu.vue'
import { messageBox } from '../utils/messageBox'
import { notifySuccess, notifyError, notifyInfo } from '@renderer/utils/notify'
import eventBus from '../utils/event-bus'
import { extractOutlineTreeFromMarkdown } from '../utils/md-utils'
import { searchNode } from '../utils/outline-helpers'

const props = withDefaults(
  defineProps<{
    tabId?: string | null
  }>(),
  {
    tabId: null
  }
)

const { t } = useI18n()
const workspace = useWorkspace()
const { activeDocument } = storeToRefs(workspace)

const viewMenuDocumentTabId = inject(
  VIEW_MENU_DOCUMENT_TAB_ID,
  computed(() => null as string | null)
)

const effectiveTabId = computed(() => props.tabId ?? viewMenuDocumentTabId.value)

const effectiveDocument = computed(() => {
  const tid = effectiveTabId.value
  if (tid) {
    try {
      return workspace.ensureDocument(tid)
    } catch {
      return null
    }
  }
  return activeDocument.value
})

const adapter = computed(() => outlineSidebarSearchAdapterRef.value)

const mdSource = computed(() => {
  const doc = effectiveDocument.value
  const wantId = effectiveTabId.value ?? workspace.activeTabId.value
  const regId = outlineSidebarAdapterTabIdRef.value
  const ad = adapter.value
  if (ad?.kind === 'monaco' && regId && wantId && regId === wantId) {
    try {
      const full = (ad as TextEditorAdapter).getFullText()
      if (typeof full === 'string') return full
    } catch {
      /* ignore */
    }
  }
  return doc?.markdown ?? ''
})

const activeLine = ref<number | null>(null)

const panelBg = computed(
  () =>
    (themeState.currentTheme as { sidebarPanelBackground?: string }).sidebarPanelBackground ||
    themeState.currentTheme.background2nd ||
    themeState.currentTheme.background
)

const panelStyle = computed(() => ({
  backgroundColor: panelBg.value,
  color: themeState.currentTheme.textColor
}))

const ranges = computed((): OutlineSectionLineRange[] => {
  const src = mdSource.value
  if (!src.trim()) return []
  try {
    return buildOutlineSectionLineRanges(src)
  } catch {
    return []
  }
})

type Row = OutlineSectionLineRange & { depth: number }

const displayRows = computed((): Row[] =>
  ranges.value
    .filter((r) => r.path !== '')
    .map((r) => ({
      ...r,
      depth: Math.max(0, r.path.split('.').filter(Boolean).length - 1)
    }))
)

const outlineMenuItems = getMarkdownOutlineContextMenuItems()

const contextMenuVisible = ref(false)
const menuX = ref(0)
const menuY = ref(0)
const contextRow = ref<Row | null>(null)

function isSidebarContextOk(): boolean {
  const tid = effectiveTabId.value ?? workspace.activeTabId.value
  if (!tid || outlineSidebarAdapterTabIdRef.value !== tid) return false
  return adapter.value?.kind === 'monaco'
}

function buildSectionInfoFromRow(row: Row, md: string): SectionInfo {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const tl1 = row.titleLine
  const el1 = row.endLine
  const titleIdx0 = tl1 - 1
  const endIdx0 = el1 - 1
  const lastLine = lines[endIdx0] ?? ''
  const content = lines.slice(titleIdx0 + 1, endIdx0 + 1).join('\n').trim()
  return {
    title: row.title,
    path: row.path,
    range: {
      start: { line: tl1, column: 0 },
      end: { line: endIdx0, column: lastLine.length }
    },
    content,
    titleLine: titleIdx0
  }
}

function onItemClick(row: Row) {
  const ad = adapter.value as TextEditorAdapter | null
  if (!ad || ad.kind !== 'monaco') return
  activeLine.value = row.titleLine

  const md = mdSource.value.replace(/\r\n/g, '\n')
  const lines = md.split('\n')
  const lineText = lines[row.titleLine - 1] ?? ''
  const headingMatch = lineText.match(/^(#+)\s+(.*)/)
  let query = row.title?.trim() || ''

  if (headingMatch?.[2]) {
    const titleText = headingMatch[2]
    const startCol = lineText.indexOf(titleText) + 1
    ad.goToRanges([
      {
        start: { line: row.titleLine, column: startCol },
        end: { line: row.titleLine, column: startCol + titleText.length }
      }
    ])
    query = titleText.trim() || query
  } else {
    const trimmed = lineText.trim()
    if (trimmed) {
      const startCol = lineText.indexOf(trimmed) + 1
      ad.goToRanges([
        {
          start: { line: row.titleLine, column: startCol },
          end: { line: row.titleLine, column: startCol + trimmed.length }
        }
      ])
      query = trimmed
    } else {
      ad.goTo({ line: row.titleLine, column: 1 })
    }
  }

  ad.focus()

  const tabId = effectiveTabId.value ?? workspace.activeTabId.value
  if (tabId && query) {
    eventBus.emit('markdown-monaco-sync-preview', { tabId, query, line: row.titleLine })
  }
}

function onItemContextMenu(e: MouseEvent, row: Row) {
  if (!isSidebarContextOk()) return
  e.preventDefault()
  contextRow.value = row
  menuX.value = e.clientX
  menuY.value = e.clientY
  contextMenuVisible.value = true
}

function onOutlineMenuClose() {
  contextMenuVisible.value = false
  contextRow.value = null
}

async function onOutlineMenuTrigger(value: string) {
  const row = contextRow.value
  const tabId = effectiveTabId.value ?? workspace.activeTabId.value ?? activeDocument.value?.tabId
  const md = mdSource.value.replace(/\r\n/g, '\n')
  const px = menuX.value
  const py = menuY.value
  onOutlineMenuClose()
  if (!row || !tabId || !isSidebarContextOk()) return

  switch (value) {
    case 'outline-section-optimizer': {
      if (!registeredMonacoEditorIdRef.value) return
      const sectionInfo = buildSectionInfoFromRow(row, md)
      eventBus.emit('focus-markdown-outline-section-optimizer', {
        tabId,
        sectionInfo,
        clientX: px,
        clientY: py
      })
      break
    }
    case 'outline-copy-section': {
      const sectionInfo = buildSectionInfoFromRow(row, md)
      const text = sectionInfo.content?.trim() || row.title?.trim() || ''
      if (!text) {
        eventBus.emit(
          'show-warning',
          t('markdownEditor.outlineMenu.emptySection', '该段落暂无内容可复制')
        )
        return
      }
      try {
        await navigator.clipboard.writeText(text)
        notifySuccess(t('common.success'))
      } catch {
        notifyError(t('markdownEditor.outlineMenu.copyFailed', '复制失败'))
      }
      break
    }
    case 'outline-copy-title': {
      const title = row.title?.trim() || ''
      if (!title) {
        eventBus.emit(
          'show-warning',
          t('markdownEditor.outlineMenu.emptyTitle', '暂无标题可复制')
        )
        return
      }
      try {
        await navigator.clipboard.writeText(title)
        notifySuccess(t('common.success'))
      } catch {
        notifyError(t('markdownEditor.outlineMenu.copyFailed', '复制失败'))
      }
      break
    }
    case 'outline-generate-illustration': {
      const sectionInfo = buildSectionInfoFromRow(row, md)
      const body = sectionInfo.content?.trim() || ''
      const h = row.title?.trim() || ''
      const sel = [h, body].filter(Boolean).join('\n\n').trim()
      if (!sel) {
        eventBus.emit(
          'show-warning',
          t('graph.selectTextForIllustration', '请先选中要生成插图的文本')
        )
        return
      }
      eventBus.emit('focus-markdown-outline-graph-quick', { tabId, selection: sel })
      break
    }
    case 'outline-add-material-basket': {
      const sectionInfo = buildSectionInfoFromRow(row, md)
      let outlineTree: ReturnType<typeof extractOutlineTreeFromMarkdown> = null
      try {
        outlineTree = extractOutlineTreeFromMarkdown(md, true)
      } catch {
        outlineTree = null
      }
      const node = row.path && outlineTree ? searchNode(row.path, outlineTree) : null
      const id =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `mb-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const basketItem: MaterialBasketItem = {
        id,
        title: row.title || t('article.untitled_document', '未命名文档'),
        text: sectionInfo.content ?? node?.text ?? '',
        title_level: node?.title_level ?? 1,
        createdAt: Date.now()
      }
      workspace.updateDocumentMeta(tabId, (meta) => {
        const list = Array.isArray(meta.materialBasket) ? meta.materialBasket : []
        meta.materialBasket = JSON.parse(JSON.stringify([...list, basketItem])) as MaterialBasketItem[]
      })
      notifyInfo(`${t('outline.materialBasket.moveToBasket')} ${t('common.success')}`)
      break
    }
    case 'outline-delete-section': {
      const titleIdx0 = row.titleLine - 1
      const endIdx0 = row.endLine - 1
      const lines = md.split('\n')
      if (titleIdx0 < 0 || endIdx0 < titleIdx0 || endIdx0 >= lines.length) {
        eventBus.emit(
          'show-warning',
          t('markdownEditor.outlineMenu.noRangeToDelete', '无法定位该段落范围，删除已取消')
        )
        return
      }
      try {
        await messageBox.confirm(
          t('markdownEditor.outlineMenu.deleteSectionConfirm'),
          t('markdownEditor.outlineMenu.deleteSectionTitle'),
          {
            confirmButtonText: t('common.confirm'),
            cancelButtonText: t('common.cancel'),
            type: 'warning'
          }
        )
      } catch {
        return
      }
      const next = [...lines.slice(0, titleIdx0), ...lines.slice(endIdx0 + 1)].join('\n')
      workspace.updateDocumentMarkdown(tabId, next)
      const titleLine = row.titleLine
      if (activeLine.value !== null && activeLine.value >= titleLine && activeLine.value <= row.endLine) {
        activeLine.value = null
      }
      notifySuccess(t('common.success'))
      break
    }
    default:
      break
  }
}
</script>

<style scoped>
.markdown-outline-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.hint-text {
  margin: 8px;
  font-size: 11px;
  opacity: 0.65;
  line-height: 1.35;
}

.markdown-outline-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 4px 4px 8px;
}

.focus-outline-item {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 22px;
  padding: 2px 8px;
  margin-bottom: 1px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font-size: 12px;
  line-height: 1.25;
  text-align: left;
  cursor: pointer;
  transition:
    background-color 0.12s ease,
    color 0.12s ease,
    transform 0.08s ease;
}

.focus-outline-item:hover {
  background: color-mix(in srgb, currentColor 8%, transparent);
}

.focus-outline-item:active {
  transform: scale(0.99);
  background: color-mix(in srgb, currentColor 14%, transparent);
}

.focus-outline-item--active {
  background: color-mix(in srgb, var(--el-color-primary, #409eff) 18%, transparent);
}

.focus-outline-item__text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
