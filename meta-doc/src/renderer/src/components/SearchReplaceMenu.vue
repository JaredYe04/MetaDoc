<template>
  <div
    ref="panelRef"
    class="search-replace-panel"
    :style="panelStyles"
    @mousedown.stop="handlePanelMouseDown"
  >
    <header class="panel-header">
      <h3>{{ t('searchReplace.title') }}</h3>
      <Button variant="ghost" size="icon" class="close-btn h-7 w-7" @click="handleClose" @mousedown.stop>
        ✕
      </Button>
    </header>

    <section class="field-group draggable-zone">
      <div class="field-label">
        {{ t('searchReplace.find') }}
        <span v-if="matchSummary.total" class="match-counter">
          {{ matchSummary.current }}/{{ matchSummary.total }}
        </span>
        <el-icon v-if="isSearching" class="search-loading-icon" :class="'is-loading'">
          <Loading />
        </el-icon>
      </div>
      <ScrollArea class="textarea-scroll">
        <Textarea
          ref="findInputRef"
          v-model="form.findText"
          :placeholder="t('searchReplace.findPlaceholder')"
          :rows="2"
          @keydown.enter.prevent="handleFind('next')"
        />
      </ScrollArea>
      <div class="toggle-row">
        <el-tooltip :content="t('searchReplace.matchCase')" placement="top">
          <Button
            :variant="form.matchCase ? 'default' : 'secondary'"
            size="sm"
            class="toggle-btn h-7 px-2"
            @click="toggleFlag('matchCase')"
          >
            Aa
          </Button>
        </el-tooltip>
        <el-tooltip :content="t('searchReplace.matchWholeWord')" placement="top">
          <Button
            :variant="form.wholeWord ? 'default' : 'secondary'"
            size="sm"
            class="toggle-btn h-7 px-2"
            @click="toggleFlag('wholeWord')"
          >
            W
          </Button>
        </el-tooltip>
        <el-tooltip :content="t('searchReplace.useRegex')" placement="top">
          <Button
            :variant="form.useRegex ? 'default' : 'secondary'"
            size="sm"
            class="toggle-btn h-7 px-2"
            @click="toggleFlag('useRegex')"
          >
            .*
          </Button>
        </el-tooltip>
        <el-tooltip :content="t('searchReplace.preserveCase')" placement="top">
          <Button
            :variant="form.preserveCase ? 'default' : 'secondary'"
            size="sm"
            class="toggle-btn h-7 px-2"
            @click="toggleFlag('preserveCase')"
          >
            ↔
          </Button>
        </el-tooltip>
      </div>
    </section>

    <section v-show="!collapsed" class="field-group draggable-zone">
      <div class="field-label">{{ t('searchReplace.replace') }}</div>
      <ScrollArea class="textarea-scroll">
        <Textarea
          v-model="form.replaceText"
          :placeholder="t('searchReplace.replacePlaceholder')"
          :rows="2"
          @keydown.enter.prevent="handleReplace"
        />
      </ScrollArea>
    </section>

    <section v-if="regexError" class="error-banner">
      {{ regexError }}
    </section>

    <!-- 匹配列表 -->
    <section
      v-if="showMatchesList && searchState?.matches.length"
      class="matches-section"
      :style="matchesSectionStyle"
    >
      <div class="matches-panel" :style="matchesPanelStyle">
        <div class="panel-header-small">
          <span>{{ t('searchReplace.matchesList') }} ({{ searchState.matches.length }})</span>
        </div>
        <ScrollArea class="matches-scrollbar" :style="matchesScrollbarStyle">
          <div class="matches-list">
            <el-tooltip
              v-for="(match, index) in searchState.matches"
              :key="index"
              :content="getMatchLineText(match)"
              placement="bottom"
              :show-after="700"
              :hide-after="0"
            >
              <div
                class="match-item"
                :class="{ 'match-item-active': searchState.currentIndex === index }"
                :style="getMatchItemStyle(index)"
                @click="selectMatch(index)"
              >
                <span class="match-location">
                  {{ t('searchReplace.line') }} {{ match.range.start.line }},
                  {{ t('searchReplace.column') }} {{ match.range.start.column }}
                </span>
                <div class="match-context" v-html="getMatchContextHtml(match, index)"></div>
              </div>
            </el-tooltip>
          </div>
        </ScrollArea>
      </div>
    </section>

    <footer class="panel-actions" @mousedown.stop>
      <el-tooltip :content="t('searchReplace.findFromStartBtn')" placement="top">
        <span>
          <Button
            variant="secondary"
            size="icon"
            class="h-7 w-7"
            :disabled="!canSearch"
            @click="handleFindFromStart"
          >
            <RefreshLeft class="h-4 w-4" />
          </Button>
        </span>
      </el-tooltip>
      <el-tooltip :content="t('searchReplace.findPrevBtn')" placement="top">
        <span>
          <Button
            variant="secondary"
            size="icon"
            class="h-7 w-7"
            :disabled="!canSearch"
            @click="handleFind('previous')"
          >
            <Top class="h-4 w-4" />
          </Button>
        </span>
      </el-tooltip>
      <el-tooltip :content="t('searchReplace.findNextBtn')" placement="top">
        <span>
          <Button
            variant="secondary"
            size="icon"
            class="h-7 w-7"
            :disabled="!canSearch"
            @click="handleFind('next')"
          >
            <Bottom class="h-4 w-4" />
          </Button>
        </span>
      </el-tooltip>
      <el-tooltip :content="t('searchReplace.findAllBtn')" placement="top">
        <span>
          <Button
            variant="secondary"
            size="icon"
            class="h-7 w-7"
            :disabled="!canSearch"
            @click="handleFindAll"
          >
            <View class="h-4 w-4" />
          </Button>
        </span>
      </el-tooltip>
      <template v-if="!collapsed">
        <el-divider direction="vertical" border-style="dashed"></el-divider>
        <el-tooltip :content="t('searchReplace.replaceBtn')" placement="top">
          <span>
            <Button
              variant="secondary"
              size="icon"
              class="h-7 w-7"
              :disabled="!canReplace"
              @click="handleReplace"
            >
              <EditPen class="h-4 w-4" />
            </Button>
          </span>
        </el-tooltip>
        <el-tooltip :content="t('searchReplace.replaceAllBtn')" placement="top">
          <span>
            <Button
              variant="secondary"
              size="icon"
              class="h-7 w-7"
              :disabled="!canReplace"
              @click="handleReplaceAll"
            >
              <RefreshRight class="h-4 w-4" />
            </Button>
          </span>
        </el-tooltip>
      </template>

      <Button
        variant="secondary"
        size="icon"
        class="collapse-btn h-7 w-7"
        @click="collapsed = !collapsed"
      >
        <component :is="collapsed ? ArrowDown : ArrowUp" class="h-4 w-4" />
      </Button>
      <Button variant="secondary" size="sm" class="h-7" @click="handleReset">
        {{ t('searchReplace.resetBtn') }}
      </Button>
    </footer>

    <!-- Resizer 组件 -->
    <div class="panel-resizer" @mousedown.stop="handleResizerMouseDown"></div>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
  watchEffect
} from 'vue'
import { ElTooltip, ElIcon } from 'element-plus'
import { Button } from '@renderer/components/ui/button'
import { Textarea } from '@renderer/components/ui/textarea'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { themeState, mixColors } from '../utils/themes'
import eventBus from '../utils/event-bus'
import type { TextEditorAdapter, EditorSearchState } from '../editor/text-editor-types'
import { createRendererLogger } from '../utils/logger'
import {
  ArrowDown,
  ArrowUp,
  Top,
  Bottom,
  EditPen,
  RefreshRight,
  RefreshLeft,
  View,
  Loading
} from '@element-plus/icons-vue'
import { generateMatchContext } from '../utils/match-context'

const logger = createRendererLogger('SearchReplaceMenu')

const props = withDefaults(
  defineProps<{
    position: { top: number; left: number }
    adapter: TextEditorAdapter | null
    mode?: 'normal' | 'demo'
  }>(),
  { mode: 'normal' }
)

const emit = defineEmits<{
  (e: 'close'): void
}>()

const { t } = useI18n()
const route = useRoute()

const menuPosition = ref({
  top: props.position.top,
  left: props.position.left
})

watch(
  () => props.position,
  (position) => {
    menuPosition.value = { ...position }
  },
  { deep: true }
)

// 面板大小状态
const panelSize = ref({
  width: 380,
  height: 0 // 0 表示自动高度
})

const panelRef = ref<HTMLElement | null>(null)
const isResizing = ref(false)
const resizeStart = ref({ x: 0, y: 0, width: 0, height: 0 })

const form = reactive({
  findText: '',
  replaceText: '',
  matchCase: false,
  wholeWord: false,
  useRegex: false,
  preserveCase: false
})

const searchState = ref<EditorSearchState | null>(null)
const regexError = ref<string | null>(null)
const findInputRef = ref<InstanceType<typeof ElInput>>()

const panelStyles = computed(() => {
  const theme = themeState.currentTheme
  return {
    top: `${menuPosition.value.top}px`,
    left: `${menuPosition.value.left}px`,
    width: `${panelSize.value.width}px`,
    height: panelSize.value.height > 0 ? `${panelSize.value.height}px` : 'auto',
    backgroundColor: theme.background2nd,
    color: theme.textColor,
    border: `1px solid ${mixColors(theme.background2nd, theme.textColor, 0.3)}`
  }
})

watchEffect(() => {
  const theme = themeState.currentTheme
  const root = document.documentElement
  const matchBg = mixColors(theme.background2nd, theme.textColor, 0.2)
  const activeBg = mixColors(theme.background2nd, '#409EFF', theme.type === 'dark' ? 0.6 : 0.4)
  root.style.setProperty('--md-search-match-bg', matchBg)
  root.style.setProperty('--md-search-active-bg', activeBg)
  root.style.setProperty(
    '--md-search-match-border',
    mixColors(theme.textColor, theme.background2nd, 0.7)
  )
})

const matchSummary = computed(() => {
  const total = searchState.value?.matches.length ?? 0
  const current = (searchState.value?.currentIndex ?? -1) + 1
  return {
    total,
    current: total > 0 ? current : 0
  }
})

const isSearching = computed(() => {
  return searchState.value?.isSearching ?? false
})

const canSearch = computed(() => !!form.findText && !regexError.value)
const canReplace = computed(() => {
  if (!canSearch.value) return false
  return (searchState.value?.matches.length ?? 0) > 0
})

// 防抖处理，避免频繁搜索导致卡顿
let searchTimeout: ReturnType<typeof setTimeout> | null = null
let searchCheckInterval: ReturnType<typeof setInterval> | null = null

const applySearch = () => {
  if (!props.adapter) return
  if (!form.findText) {
    // 清除之前的定时器
    if (searchTimeout) {
      clearTimeout(searchTimeout)
      searchTimeout = null
    }
    if (searchCheckInterval) {
      clearInterval(searchCheckInterval)
      searchCheckInterval = null
    }
    props.adapter.clearSearch()
    searchState.value = null
    regexError.value = null
    showMatchesList.value = false
    return
  }

  // 清除之前的定时器
  if (searchTimeout) {
    clearTimeout(searchTimeout)
    searchTimeout = null
  }
  if (searchCheckInterval) {
    clearInterval(searchCheckInterval)
    searchCheckInterval = null
  }

  // 防抖：延迟300ms执行搜索，避免输入时频繁触发
  searchTimeout = setTimeout(() => {
    try {
      const state = props.adapter!.configureSearch(
        {
          text: form.findText,
          matchCase: form.matchCase,
          wholeWord: form.wholeWord,
          useRegex: form.useRegex,
          preserveCase: form.preserveCase
        },
        { revealFirst: false }
      )
      searchState.value = state
      regexError.value = null

      // 异步搜索过程中，需要持续更新 searchState.value 以触发 UI 实时刷新
      // 使用轮询机制，在搜索过程中（isSearching 为 true）持续更新状态
      // 轮询间隔设为 30ms，确保分批加载时能及时刷新
      // 开始新搜索时，清除用户选择标记
      userSelectedIndex.value = null
      let checkCount = 0
      const MAX_CHECK_COUNT = 500 // 最多检查 500 次（约 15 秒），足够长时间文档搜索
      let lastMatchCount = 0

      searchCheckInterval = setInterval(() => {
        const currentState = props.adapter?.getSearchState()
        if (currentState) {
          const currentMatchCount = currentState.matches.length
          const hasMatchCountChanged = currentMatchCount !== lastMatchCount
          const hasIsSearchingChanged = currentState.isSearching !== searchState.value?.isSearching

          // 如果匹配数量或搜索状态发生变化，需要更新状态
          // 但是对于 currentIndex，需要保护用户手动选择的索引
          if (hasMatchCountChanged || hasIsSearchingChanged) {
            // 创建状态副本，保护用户选择的索引
            const stateToUpdate = { ...currentState }

            // 如果用户手动选择了索引，并且该索引仍然有效，保持用户的选择
            if (userSelectedIndex.value !== null && userSelectedIndex.value < currentMatchCount) {
              stateToUpdate.currentIndex = userSelectedIndex.value
              // 同时更新适配器的内部状态以保持一致
              // 注意：这里只更新 searchState，不会触发适配器状态更新，因为适配器状态会在用户点击时通过 find 方法更新
            }

            searchState.value = stateToUpdate
            lastMatchCount = currentMatchCount
          } else if (
            // 如果只有 currentIndex 变化，且不是用户选择的索引，才更新
            currentState.currentIndex !== searchState.value?.currentIndex &&
            (userSelectedIndex.value === null ||
              currentState.currentIndex !== userSelectedIndex.value)
          ) {
            // 这是适配器内部状态变化（比如通过 find 方法），可以更新
            searchState.value = currentState
          }

          // 如果搜索完成（isSearching 为 false），停止轮询并清除用户选择标记
          if (!currentState.isSearching) {
            userSelectedIndex.value = null
            if (searchCheckInterval) {
              clearInterval(searchCheckInterval)
              searchCheckInterval = null
            }
          }
        }

        checkCount++
        // 安全保护：即使搜索未完成，也要在达到最大检查次数时停止
        if (checkCount >= MAX_CHECK_COUNT) {
          userSelectedIndex.value = null
          if (searchCheckInterval) {
            clearInterval(searchCheckInterval)
            searchCheckInterval = null
          }
        }
      }, 500) // 500ms 轮询间隔，确保实时性
    } catch (error) {
      regexError.value = (error as Error)?.message ?? String(error)
    }
    searchTimeout = null
  }, 300)
}

watch(
  () => ({
    find: form.findText,
    matchCase: form.matchCase,
    wholeWord: form.wholeWord,
    useRegex: form.useRegex,
    preserveCase: form.preserveCase,
    adapter: props.adapter
  }),
  () => {
    applySearch()
  }
)

// 监听搜索状态变化，自动显示匹配列表
watch(
  () => searchState.value?.matches.length,
  (matchCount) => {
    if (matchCount && matchCount > 0) {
      showMatchesList.value = true
      const currentIndex = searchState.value?.currentIndex ?? -1
      selectedMatchIndex.value = currentIndex >= 0 ? currentIndex : 0
    }
  }
)

// 监听搜索状态变化，更新选中项
watch(
  () => searchState.value?.currentIndex,
  (newIndex) => {
    if (newIndex !== null && newIndex !== undefined) {
      selectedMatchIndex.value = newIndex
    }
  }
)

const handleFind = (direction: 'next' | 'previous') => {
  if (props.mode === 'demo') return
  if (!props.adapter || !canSearch.value) return
  logger.debug('handleFind', direction)
  const state = props.adapter.find(direction)
  searchState.value = state
}

const handleFindFromStart = () => {
  if (props.mode === 'demo' || !props.adapter || !canSearch.value) return
  logger.debug('handleFindFromStart')
  // 先移动到文档开头
  props.adapter.goTo({ line: 1, column: 1 })
  // 重新配置搜索，从开头开始（startOffset=0）
  const state = props.adapter.configureSearch(
    {
      text: form.findText,
      matchCase: form.matchCase,
      wholeWord: form.wholeWord,
      useRegex: form.useRegex,
      preserveCase: form.preserveCase
    },
    { revealFirst: true }
  )
  searchState.value = state

  // 等待搜索完成，实时更新状态
  // 清除用户选择标记，因为这是新的搜索
  userSelectedIndex.value = null
  let checkCount = 0
  const MAX_CHECK_COUNT = 500
  let lastMatchCount = 0
  const checkInterval = setInterval(() => {
    const currentState = props.adapter?.getSearchState()
    if (currentState) {
      const currentMatchCount = currentState.matches.length
      const hasMatchCountChanged = currentMatchCount !== lastMatchCount
      const hasIsSearchingChanged = currentState.isSearching !== searchState.value?.isSearching

      // 如果匹配数量或搜索状态发生变化，需要更新状态
      // 但是对于 currentIndex，需要保护用户手动选择的索引
      if (hasMatchCountChanged || hasIsSearchingChanged) {
        const stateToUpdate = { ...currentState }
        if (userSelectedIndex.value !== null && userSelectedIndex.value < currentMatchCount) {
          stateToUpdate.currentIndex = userSelectedIndex.value
        }
        searchState.value = stateToUpdate
        lastMatchCount = currentMatchCount
      } else if (
        currentState.currentIndex !== searchState.value?.currentIndex &&
        (userSelectedIndex.value === null || currentState.currentIndex !== userSelectedIndex.value)
      ) {
        searchState.value = currentState
      }

      // 如果搜索完成，停止轮询
      if (!currentState.isSearching) {
        userSelectedIndex.value = null
        clearInterval(checkInterval)
      }
    }
    checkCount++
    if (checkCount >= MAX_CHECK_COUNT) {
      userSelectedIndex.value = null
      clearInterval(checkInterval)
    }
  }, 500)
}

const handleReplace = () => {
  if (props.mode === 'demo' || !props.adapter || !canReplace.value) return
  const state = props.adapter.replaceCurrent(form.replaceText)
  searchState.value = state

  // replaceCurrent 会重新调用 configureSearch（异步），需要等待搜索完成并实时更新
  // 替换后清除用户选择标记，因为搜索会重新开始
  userSelectedIndex.value = null
  let checkCount = 0
  const MAX_CHECK_COUNT = 500
  let lastMatchCount = 0
  const checkInterval = setInterval(() => {
    const currentState = props.adapter?.getSearchState()
    if (currentState) {
      const currentMatchCount = currentState.matches.length
      const hasMatchCountChanged = currentMatchCount !== lastMatchCount
      const hasIsSearchingChanged = currentState.isSearching !== searchState.value?.isSearching

      if (hasMatchCountChanged || hasIsSearchingChanged) {
        const stateToUpdate = { ...currentState }
        if (userSelectedIndex.value !== null && userSelectedIndex.value < currentMatchCount) {
          stateToUpdate.currentIndex = userSelectedIndex.value
        }
        searchState.value = stateToUpdate
        lastMatchCount = currentMatchCount
      } else if (
        currentState.currentIndex !== searchState.value?.currentIndex &&
        (userSelectedIndex.value === null || currentState.currentIndex !== userSelectedIndex.value)
      ) {
        searchState.value = currentState
      }

      // 如果搜索完成，停止轮询
      if (!currentState.isSearching) {
        userSelectedIndex.value = null
        clearInterval(checkInterval)
      }
    }
    checkCount++
    if (checkCount >= MAX_CHECK_COUNT) {
      userSelectedIndex.value = null
      clearInterval(checkInterval)
    }
  }, 500)
}

const handleReplaceAll = () => {
  if (props.mode === 'demo') return
  if (!props.adapter || !canReplace.value) return
  const { state, replacedCount } = props.adapter.replaceAll(form.replaceText)
  searchState.value = state
  eventBus.emit(
    'show-success',
    t('searchReplace.replaceCount', {
      count: replacedCount,
      find: form.findText,
      replace: form.replaceText
    })
  )
}

const handleFindAll = () => {
  if (props.mode === 'demo') return
  if (!props.adapter || !canSearch.value) return
  const state = props.adapter.getSearchState()
  searchState.value = state
  // 显示匹配列表
  if (state.matches.length > 0) {
    showMatchesList.value = true
    selectedMatchIndex.value = state.currentIndex >= 0 ? state.currentIndex : 0
  }
  eventBus.emit(
    'show-info',
    t('searchReplace.foundCount', {
      count: state.matches.length,
      find: form.findText
    })
  )
}

const selectMatch = (index: number) => {
  if (!props.adapter || !searchState.value) return
  selectedMatchIndex.value = index
  // 标记为用户手动选择的索引，需要在轮询中保护
  userSelectedIndex.value = index

  // 更新适配器的当前索引并高亮
  const state = props.adapter.getSearchState()
  if (state.matches[index]) {
    // 对于vditor，直接调用highlightSingleMatch高亮指定匹配
    if (props.adapter.kind === 'vditor') {
      const vditorAdapter = props.adapter as any
      if (vditorAdapter.highlightSingleMatch) {
        // 更新适配器内部的状态
        const currentIndex = state.currentIndex
        if (currentIndex !== index) {
          // 计算需要移动的步数，使用find方法更新适配器内部状态
          const direction = index > currentIndex ? 'next' : 'previous'
          const steps = Math.abs(index - currentIndex)
          let newState = state
          for (let i = 0; i < steps; i++) {
            newState = props.adapter.find(direction)
          }
          searchState.value = newState
        } else {
          // 如果已经是当前索引，直接高亮（不通过find，避免重复操作）
          vditorAdapter.highlightSingleMatch(state.matches[index], index, true)
          // 更新UI状态
          const newState = { ...state, currentIndex: index }
          searchState.value = newState
        }
        return
      }
    }

    // 对于monaco，直接定位到行和列（不需要DOM搜索）
    if (props.adapter.kind === 'monaco') {
      const match = state.matches[index]
      if (match) {
        // 直接使用 goTo 定位到匹配位置
        props.adapter.goTo(match.range.start)
        // 选中匹配范围
        props.adapter.goToRanges([match.range])
        // 更新适配器内部的状态
        const monacoAdapter = props.adapter as any
        if (monacoAdapter.applyDecorations) {
          // 只高亮当前匹配
          monacoAdapter.applyDecorations([match], 0)
        }
        // 更新UI状态
        const newState = { ...state, currentIndex: index }
        searchState.value = newState
      }
      return
    }

    // 对于其他编辑器，使用find方法导航
    const currentIndex = state.currentIndex
    if (currentIndex !== index) {
      const direction = index > currentIndex ? 'next' : 'previous'
      const steps = Math.abs(index - currentIndex)
      let newState = state
      for (let i = 0; i < steps; i++) {
        newState = props.adapter.find(direction)
      }
      searchState.value = newState
    }
  }
}

/**
 * 根据面板宽度计算可用的字符数
 * 假设每个字符平均宽度为 8px（等宽字体），减去 padding 和 margin
 */
const calculateAvailableChars = (): number => {
  if (!panelRef.value) return 80 // 默认值

  const panelWidth = panelSize.value.width
  // 减去左右 padding (16px * 2) 和匹配项左右 padding (12px * 2)
  const availableWidth = panelWidth - 16 * 2 - 12 * 2 - 20 // 20px 作为安全边距
  // 假设每个字符平均宽度为 7px（等宽字体，但考虑中文字符）
  const charsPerPixel = 1 / 7
  const availableChars = Math.floor(availableWidth * charsPerPixel)

  // 确保最小和最大值
  return Math.max(20, Math.min(200, availableChars))
}

const getMatchContextHtml = (match: any, index: number): string => {
  if (!props.adapter) return ''

  try {
    const fullText = props.adapter.getFullText()
    if (!fullText) return ''

    // 根据面板宽度动态计算可用字符数
    const maxLength = calculateAvailableChars()

    // 获取匹配的偏移量
    const startOffset = (match as any).startOffset
    const endOffset = (match as any).endOffset

    if (startOffset === undefined || endOffset === undefined) {
      // 如果没有偏移量信息，使用 range 计算
      const lines = fullText.split('\n')
      let offset = 0
      for (let i = 0; i < match.range.start.line - 1; i++) {
        offset += lines[i].length + 1 // +1 for newline
      }
      const calculatedStartOffset = offset + match.range.start.column - 1
      const calculatedEndOffset = calculatedStartOffset + match.matchText.length

      const context = generateMatchContext(
        fullText,
        match.matchText,
        calculatedStartOffset,
        calculatedEndOffset,
        maxLength
      )

      // 转义HTML并高亮匹配部分
      const escapeHtml = (text: string) => {
        const div = document.createElement('div')
        div.textContent = text
        return div.innerHTML
      }

      const beforeEscaped = escapeHtml(context.before)
      const matchEscaped = escapeHtml(context.match)
      const afterEscaped = escapeHtml(context.after)

      return `${beforeEscaped}<mark class="match-highlight">${matchEscaped}</mark>${afterEscaped}`
    } else {
      // 使用偏移量生成上下文
      const context = generateMatchContext(
        fullText,
        match.matchText,
        startOffset,
        endOffset,
        maxLength
      )

      // 转义HTML并高亮匹配部分
      const escapeHtml = (text: string) => {
        const div = document.createElement('div')
        div.textContent = text
        return div.innerHTML
      }

      const beforeEscaped = escapeHtml(context.before)
      const matchEscaped = escapeHtml(context.match)
      const afterEscaped = escapeHtml(context.after)

      return `${beforeEscaped}<mark class="match-highlight">${matchEscaped}</mark>${afterEscaped}`
    }
  } catch (error) {
    logger.warn('生成匹配上下文失败', error)
    // 回退到只显示匹配文本
    const escapeHtml = (text: string) => {
      const div = document.createElement('div')
      div.textContent = text
      return div.innerHTML
    }
    return `<mark class="match-highlight">${escapeHtml(match.matchText)}</mark>`
  }
}

/**
 * 获取匹配所在行的完整文本（用于tooltip显示）
 * 最多显示50个字符，超过则截断并添加省略号
 */
const getMatchLineText = (match: any): string => {
  if (!props.adapter || !match) return ''

  try {
    // 获取匹配所在的行号（1-based）
    const lineNumber = match.range.start.line

    // 获取该行的完整文本
    const lineText = props.adapter.getLineText(lineNumber)

    // 如果行文本为空，返回匹配文本
    if (!lineText || lineText.trim().length === 0) {
      return match.matchText || ''
    }

    // 如果行文本超过50个字符，截断并添加省略号
    const maxLength = 50
    if (lineText.length > maxLength) {
      return lineText.substring(0, maxLength) + '...'
    }

    return lineText
  } catch (error) {
    logger.warn('获取匹配行文本失败', error)
    return match.matchText || ''
  }
}

const getMatchItemStyle = (index: number) => {
  const isActive = searchState.value?.currentIndex === index
  const theme = themeState.currentTheme
  return {
    backgroundColor: isActive
      ? theme.type === 'dark'
        ? 'rgba(64, 158, 255, 0.2)'
        : 'rgba(64, 158, 255, 0.1)'
      : theme.background,
    border: `1px solid ${
      isActive ? theme.primaryColor : mixColors(theme.textColor, theme.background2nd, 0.2)
    }`,
    borderRadius: '6px',
    padding: '12px',
    marginBottom: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s'
  }
}

// 计算匹配列表区域的样式，当面板高度为auto时，设置明确的高度约束以显示滚动条
const matchesSectionStyle = computed(() => {
  // 当面板高度为0（auto）时，设置固定高度，让flex布局和滚动条能正确工作
  // 固定高度300px，确保滚动条能正确显示
  if (panelSize.value.height === 0) {
    return {
      height: '300px', // 固定高度，确保flex子元素能正确计算
      flex: 'none' // 不使用flex: 1，直接使用固定高度
    }
  }
  return {}
})

// 计算匹配面板的样式，确保在auto模式下有明确高度
const matchesPanelStyle = computed(() => {
  // 当面板高度为0（auto）时，确保面板有明确高度约束
  if (panelSize.value.height === 0) {
    return {
      height: '100%',
      minHeight: '0'
    }
  }
  return {}
})

// 计算滚动条容器的样式，确保在auto模式下有明确高度
const matchesScrollbarStyle = computed(() => {
  // 当面板高度为0（auto）时，确保滚动条有明确高度约束
  if (panelSize.value.height === 0) {
    return {
      height: '100%',
      minHeight: '0'
    }
  }
  return {}
})

const handleReset = () => {
  if (props.mode === 'demo') return
  // 只重置搜索结果，不清除搜索和替换文本
  regexError.value = null
  props.adapter?.clearSearch()
  searchState.value = null
  userSelectedIndex.value = null // 清除用户选择标记
  // 如果有搜索文本，重新执行搜索
  if (form.findText) {
    applySearch()
  }
}

const handleClose = () => {
  if (props.mode === 'demo') return
  props.adapter?.clearSearch()
  userSelectedIndex.value = null // 清除用户选择标记
  eventBus.emit('search-replace-closed')
  emit('close')
}

type ToggleFlagKey = 'matchCase' | 'wholeWord' | 'useRegex' | 'preserveCase'

const toggleFlag = (key: ToggleFlagKey) => {
  form[key] = !form[key]
}

const collapsed = ref(true)
const showMatchesList = ref(false)
const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0 })
const selectedMatchIndex = ref<number | null>(null)
const userSelectedIndex = ref<number | null>(null) // 用户手动选择的索引，需要保护不被轮询覆盖

const onMouseDown = (event: MouseEvent) => {
  isDragging.value = true
  dragStart.value = {
    x: event.clientX - menuPosition.value.left,
    y: event.clientY - menuPosition.value.top
  }
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

const onMouseMove = (event: MouseEvent) => {
  if (!isDragging.value) return
  menuPosition.value = {
    top: event.clientY - dragStart.value.y,
    left: event.clientX - dragStart.value.x
  }
}

const onMouseUp = () => {
  isDragging.value = false
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
}

// Resizer 处理函数
const handleResizerMouseDown = (event: MouseEvent) => {
  event.preventDefault()
  event.stopPropagation()

  if (!panelRef.value) return

  isResizing.value = true
  const rect = panelRef.value.getBoundingClientRect()
  resizeStart.value = {
    x: event.clientX,
    y: event.clientY,
    width: rect.width,
    height: rect.height
  }

  const onResizeMove = (e: MouseEvent) => {
    if (!isResizing.value) return

    const deltaX = e.clientX - resizeStart.value.x
    const deltaY = e.clientY - resizeStart.value.y

    const minWidth = 300
    const maxWidth = 800
    const minHeight = 200
    // 最大高度限制为视口高度的 80%，但不超过 1000px
    const maxHeight = Math.min(1000, window.innerHeight * 0.8)

    const newWidth = Math.max(minWidth, Math.min(maxWidth, resizeStart.value.width + deltaX))
    const newHeight = Math.max(minHeight, Math.min(maxHeight, resizeStart.value.height + deltaY))

    panelSize.value = {
      width: newWidth,
      height: newHeight
    }
  }

  const onResizeUp = () => {
    isResizing.value = false
    document.removeEventListener('mousemove', onResizeMove)
    document.removeEventListener('mouseup', onResizeUp)
  }

  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', onResizeUp)
}

const isInteractiveElement = (target: HTMLElement | null) => {
  if (!target) return false
  return !!target.closest('input, textarea, button, .el-input, .el-textarea, .el-button')
}

const handlePanelMouseDown = (event: MouseEvent) => {
  if (isInteractiveElement(event.target as HTMLElement)) return
  onMouseDown(event)
}

const handleForceExpand = () => {
  collapsed.value = false
}

watch(
  () => collapsed.value,
  (value) => {
    if (!value) {
      eventBus.emit('search-replace-expand')
    }
  }
)

// 处理 Tab 切换和视图切换时关闭菜单
const handleTabOrViewChange = () => {
  logger.debug('Tab 或视图切换，关闭查找替换菜单')
  handleClose()
}

// 监听路由变化（视图切换）
watch(
  () => route.path,
  () => {
    handleTabOrViewChange()
  }
)

onMounted(() => {
  eventBus.on('search-replace-expand', handleForceExpand)
  // 监听 Tab 切换事件
  eventBus.on('active-tab-changed', handleTabOrViewChange)
  nextTick(() => {
    const selectionText = props.adapter?.getSelectionText()
    if (selectionText && selectionText.length < 200) {
      form.findText = selectionText
    }
    findInputRef.value?.focus()
  })
})

onBeforeUnmount(() => {
  // 清除搜索定时器
  if (searchTimeout) {
    clearTimeout(searchTimeout)
    searchTimeout = null
  }
  if (searchCheckInterval) {
    clearInterval(searchCheckInterval)
    searchCheckInterval = null
  }
  props.adapter?.clearSearch()
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
  eventBus.off('search-replace-expand', handleForceExpand)
  eventBus.off('active-tab-changed', handleTabOrViewChange)
})
</script>

<style scoped>
.search-replace-panel {
  position: absolute;
  padding: 16px;
  border-radius: 10px;
  box-shadow: 0 20px 40px rgba(15, 23, 42, 0.18);
  z-index: 2000;
  backdrop-filter: blur(12px);
  transition: box-shadow 0.2s ease;
  user-select: none;
  overflow: visible;
  display: flex;
  flex-direction: column;
  min-height: 0; /* 确保 flex 子元素可以收缩 */
  max-height: min(1000px, 80vh); /* 限制最大高度，不超过视口高度的80%或1000px */
}

.search-replace-panel:active {
  box-shadow: 0 18px 32px rgba(15, 23, 42, 0.2);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.panel-header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.close-btn {
  background: transparent;
  border: none;
  font-size: 14px;
  font-weight: 500;
  color: inherit;
}

.field-group {
  margin-bottom: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-label {
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  text-transform: uppercase;
  opacity: 0.8;
}

.match-counter {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.08);
}

.search-loading-icon {
  margin-left: 8px;
  animation: rotating 2s linear infinite;
}

@keyframes rotating {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.toggle-row {
  display: flex;
  gap: 8px;
}

.toggle-btn {
  min-width: 36px;
  font-family: 'Fira Code', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
}

.panel-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  flex-shrink: 0; /* 不收缩，保持自然高度 */
  margin-top: auto; /* 确保紧贴底部 */
}

.error-banner {
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  color: #f56c6c;
  background: rgba(245, 108, 108, 0.12);
  border: 1px solid rgba(245, 108, 108, 0.3);
  margin-bottom: 12px;
}

.collapse-btn {
  margin-left: auto;
}

.draggable-zone {
  cursor: move;
}

.draggable-zone :is(input, textarea, button, .el-input, .el-textarea, .el-button) {
  cursor: auto;
}

.textarea-scroll {
  max-height: 160px;
}

.textarea-scroll .el-scrollbar__wrap {
  overflow-x: hidden !important;
}

.textarea-scroll .el-scrollbar__view {
  padding: 0 !important;
}

.matches-section {
  margin-top: 16px;
  margin-bottom: 14px;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0; /* 确保可以收缩 */
}

.matches-panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  border: 1px solid
    v-bind(
      'mixColors(themeState.currentTheme.textColor, themeState.currentTheme.background2nd, 0.2)'
    );
  border-radius: 6px;
  overflow: hidden;
  background-color: v-bind('themeState.currentTheme.background');
  min-height: 0; /* 确保可以收缩 */
}

.panel-header-small {
  background-color: v-bind('themeState.currentTheme.background2nd');
  color: v-bind('themeState.currentTheme.textColor');
  border-bottom: 1px solid
    v-bind(
      'mixColors(themeState.currentTheme.textColor, themeState.currentTheme.background2nd, 0.2)'
    );
  padding: 8px 12px;
  font-weight: 500;
  font-size: 13px;
  flex-shrink: 0; /* 不收缩 */
}

.matches-scrollbar {
  flex: 1;
  min-height: 0; /* 确保可以收缩 */
  overflow: hidden; /* 确保不会超出容器 */
}

.matches-scrollbar :deep(.el-scrollbar__wrap) {
  overflow-x: hidden !important;
  overflow-y: auto !important; /* 确保可以垂直滚动 */
}

.matches-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
}

.match-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 12px;
  transition: all 0.2s;
  cursor: pointer;
}

.match-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transform: translateX(2px);
}

.match-item-active {
  box-shadow: 0 2px 12px rgba(64, 158, 255, 0.3);
}

.match-location {
  color: v-bind('themeState.currentTheme.textColor2');
  font-size: 11px;
  font-family: monospace;
  flex-shrink: 0;
}

.match-context {
  font-size: 12px;
  font-family: monospace;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.5;
}

.match-context :deep(.match-highlight) {
  background-color: rgba(255, 235, 59, 0.4);
  padding: 2px 0;
  border-radius: 2px;
  font-weight: 600;
  color: inherit;
}

.panel-resizer {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 20px;
  height: 20px;
  cursor: nwse-resize;
  background: linear-gradient(
    -45deg,
    transparent 0%,
    transparent 30%,
    v-bind(
        'mixColors(themeState.currentTheme.textColor, themeState.currentTheme.background2nd, 0.3)'
      )
      30%,
    v-bind(
        'mixColors(themeState.currentTheme.textColor, themeState.currentTheme.background2nd, 0.3)'
      )
      35%,
    transparent 35%,
    transparent 65%,
    v-bind(
        'mixColors(themeState.currentTheme.textColor, themeState.currentTheme.background2nd, 0.3)'
      )
      65%,
    v-bind(
        'mixColors(themeState.currentTheme.textColor, themeState.currentTheme.background2nd, 0.3)'
      )
      70%,
    transparent 70%
  );
  opacity: 0.6;
  transition: opacity 0.2s;
}

.panel-resizer:hover {
  opacity: 1;
}
</style>
