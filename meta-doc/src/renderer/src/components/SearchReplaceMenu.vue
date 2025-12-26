<template>
  <div
    class="search-replace-panel"
    :style="panelStyles"
    @mousedown.stop="handlePanelMouseDown"
  >
    <header class="panel-header " >
      <h3>{{ t('searchReplace.title') }}</h3>
      <el-button
        circle
        size="small"
        class="close-btn"
        @click="handleClose"
        @mousedown.stop
      >
        ✕
      </el-button>
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
      <el-scrollbar class="textarea-scroll" > 
        <el-input
          ref="findInputRef"
          v-model="form.findText"
          :placeholder="t('searchReplace.findPlaceholder')"
          type="textarea"
          :autosize="{ minRows: 2, maxRows: 6 }"
          size="small"
          @keyup.enter="handleFind('next')"
        />
      </el-scrollbar>
      <div class="toggle-row">
        <el-tooltip :content="t('searchReplace.matchCase')" placement="top">
          <el-button
            size="small"
            :type="form.matchCase ? 'primary' : 'default'"
            class="toggle-btn"
            @click="toggleFlag('matchCase')"
          >
            Aa
          </el-button>
        </el-tooltip>
        <el-tooltip :content="t('searchReplace.matchWholeWord')" placement="top">
          <el-button
            size="small"
            :type="form.wholeWord ? 'primary' : 'default'"
            class="toggle-btn"
            @click="toggleFlag('wholeWord')"
          >
            W
          </el-button>
        </el-tooltip>
        <el-tooltip :content="t('searchReplace.useRegex')" placement="top">
          <el-button
            size="small"
            :type="form.useRegex ? 'primary' : 'default'"
            class="toggle-btn"
            @click="toggleFlag('useRegex')"
          >
            .*
          </el-button>
        </el-tooltip>
        <el-tooltip :content="t('searchReplace.preserveCase')" placement="top">
          <el-button
            size="small"
            :type="form.preserveCase ? 'primary' : 'default'"
            class="toggle-btn"
            @click="toggleFlag('preserveCase')"
          >
            ↔
          </el-button>
        </el-tooltip>
    </div>
    </section>

    <section v-show="!collapsed" class="field-group draggable-zone">
      <div class="field-label">{{ t('searchReplace.replace') }}</div>
      <el-scrollbar class="textarea-scroll" >
        <el-input
          v-model="form.replaceText"
          :placeholder="t('searchReplace.replacePlaceholder')"
          type="textarea"
          :autosize="{ minRows: 2, maxRows: 6 }"
          size="small"
          @keyup.enter="handleReplace"
        />
      </el-scrollbar>
    </section>

    <section v-if="regexError" class="error-banner">
      {{ regexError }}
    </section>

    <!-- 匹配列表 -->
    <section v-if="showMatchesList && searchState?.matches.length" class="matches-section">
      <div class="matches-panel">
        <div class="panel-header-small">
          <span>{{ t('searchReplace.matchesList') }} ({{ searchState.matches.length }})</span>
        </div>
        <el-scrollbar height="300px">
          <div class="matches-list">
            <div
              v-for="(match, index) in searchState.matches"
              :key="index"
              class="match-item"
              :class="{ 'match-item-active': searchState.currentIndex === index }"
              :style="getMatchItemStyle(index)"
              @click="selectMatch(index)"
            >
              <span class="match-location">
                {{ t('searchReplace.line') }} {{ match.range.start.line }}, {{ t('searchReplace.column') }} {{ match.range.start.column }}
              </span>
              <div class="match-context" v-html="getMatchContextHtml(match, index)"></div>
            </div>
          </div>
        </el-scrollbar>
      </div>
    </section>

    <footer class="panel-actions" @mousedown.stop>
      <el-tooltip :content="t('searchReplace.findFromStartBtn')" placement="top">
        <span>
          <el-button
            size="small"
            :icon="RefreshLeft"
            circle
            :disabled="!canSearch"
            @click="handleFindFromStart"
          />
        </span>
      </el-tooltip>
      <el-tooltip :content="t('searchReplace.findPrevBtn')" placement="top">
        <span>
          <el-button
            size="small"
            :icon="Top"
            circle
            :disabled="!canSearch"
            @click="handleFind('previous')"
          />
        </span>
      </el-tooltip>
      <el-tooltip :content="t('searchReplace.findNextBtn')" placement="top">
        <span>
          <el-button
            size="small"
            :icon="Bottom"
            circle
            :disabled="!canSearch"
            @click="handleFind('next')"
          />
        </span>
      </el-tooltip>
      <el-tooltip :content="t('searchReplace.findAllBtn')" placement="top">
        <span>
          <el-button
            size="small"
            circle
            :icon="View"
            :disabled="!canSearch"
            @click="handleFindAll"
          />
        </span>
      </el-tooltip>
      <template v-if="!collapsed">
        <el-divider direction="vertical" border-style="dashed"></el-divider>
        <el-tooltip :content="t('searchReplace.replaceBtn')" placement="top">
          <span>
            <el-button
              size="small"
              circle
              :icon="EditPen"
              :disabled="!canReplace"
              @click="handleReplace"
            />
          </span>
        </el-tooltip>
        <el-tooltip :content="t('searchReplace.replaceAllBtn')" placement="top">
          <span>
            <el-button
              size="small"
              circle
              :icon="RefreshRight"
              :disabled="!canReplace"
              @click="handleReplaceAll"
            />
          </span>
        </el-tooltip>
      </template>

      <el-button
        size="small"
        class="collapse-btn"
        :icon="collapsed ? ArrowDown : ArrowUp"
        circle
        @click="collapsed = !collapsed"
      />
      <el-button size="small" @click="handleReset">
        {{ t('searchReplace.resetBtn') }}
      </el-button>
    </footer>
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
  watchEffect,
} from "vue";
import { ElButton, ElInput, ElTooltip, ElScrollbar, ElIcon } from "element-plus";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { themeState, mixColors } from "../utils/themes";
import eventBus from "../utils/event-bus";
import type { TextEditorAdapter, EditorSearchState } from "../editor/text-editor-types";
import { createRendererLogger } from "../utils/logger";
import {
  ArrowDown,
  ArrowUp,
  Top,
  Bottom,
  EditPen,
  RefreshRight,
  RefreshLeft,
  View,
  Loading,
} from "@element-plus/icons-vue";
import { generateMatchContext } from "../utils/match-context";

const logger = createRendererLogger("SearchReplaceMenu");

const props = defineProps<{
  position: { top: number; left: number };
  adapter: TextEditorAdapter | null;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const { t } = useI18n();
const route = useRoute();

const menuPosition = ref({
  top: props.position.top,
  left: props.position.left,
});

watch(
  () => props.position,
  (position) => {
    menuPosition.value = { ...position };
  },
  { deep: true },
);

const form = reactive({
  findText: "",
  replaceText: "",
  matchCase: false,
  wholeWord: false,
  useRegex: false,
  preserveCase: false,
});

const searchState = ref<EditorSearchState | null>(null);
const regexError = ref<string | null>(null);
const findInputRef = ref<InstanceType<typeof ElInput>>();

const panelStyles = computed(() => {
  const theme = themeState.currentTheme;
  return {
    top: `${menuPosition.value.top}px`,
    left: `${menuPosition.value.left}px`,
    backgroundColor: theme.background2nd,
    color: theme.textColor,
    border: `1px solid ${mixColors(theme.background2nd, theme.textColor, 0.3)}`,
  };
});

watchEffect(() => {
  const theme = themeState.currentTheme;
  const root = document.documentElement;
  const matchBg = mixColors(theme.background2nd, theme.textColor, 0.2);
  const activeBg = mixColors(theme.background2nd, "#409EFF", theme.type === "dark" ? 0.6 : 0.4);
  root.style.setProperty("--md-search-match-bg", matchBg);
  root.style.setProperty("--md-search-active-bg", activeBg);
  root.style.setProperty("--md-search-match-border", mixColors(theme.textColor, theme.background2nd, 0.7));
});

const matchSummary = computed(() => {
  const total = searchState.value?.matches.length ?? 0;
  const current = (searchState.value?.currentIndex ?? -1) + 1;
  return {
    total,
    current: total > 0 ? current : 0,
  };
});

const isSearching = computed(() => {
  return searchState.value?.isSearching ?? false;
});

const canSearch = computed(() => !!form.findText && !regexError.value);
const canReplace = computed(() => {
  if (!canSearch.value) return false;
  return (searchState.value?.matches.length ?? 0) > 0;
});

// 防抖处理，避免频繁搜索导致卡顿
let searchTimeout: ReturnType<typeof setTimeout> | null = null;
let searchCheckInterval: ReturnType<typeof setInterval> | null = null;

const applySearch = () => {
  if (!props.adapter) return;
  if (!form.findText) {
    // 清除之前的定时器
    if (searchTimeout) {
      clearTimeout(searchTimeout);
      searchTimeout = null;
    }
    if (searchCheckInterval) {
      clearInterval(searchCheckInterval);
      searchCheckInterval = null;
    }
    props.adapter.clearSearch();
    searchState.value = null;
    regexError.value = null;
    showMatchesList.value = false;
    return;
  }
  
  // 清除之前的定时器
  if (searchTimeout) {
    clearTimeout(searchTimeout);
    searchTimeout = null;
  }
  if (searchCheckInterval) {
    clearInterval(searchCheckInterval);
    searchCheckInterval = null;
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
          preserveCase: form.preserveCase,
        },
        { revealFirst: false },
      );
      searchState.value = state;
      regexError.value = null;
      
      // 异步搜索过程中，需要持续更新 searchState.value 以触发 UI 实时刷新
      // 使用轮询机制，在搜索过程中（isSearching 为 true）持续更新状态
      // 轮询间隔设为 30ms，确保分批加载时能及时刷新
      // 开始新搜索时，清除用户选择标记
      userSelectedIndex.value = null;
      let checkCount = 0;
      const MAX_CHECK_COUNT = 500; // 最多检查 500 次（约 15 秒），足够长时间文档搜索
      let lastMatchCount = 0;
      
      searchCheckInterval = setInterval(() => {
        const currentState = props.adapter?.getSearchState();
        if (currentState) {
          const currentMatchCount = currentState.matches.length;
          const hasMatchCountChanged = currentMatchCount !== lastMatchCount;
          const hasIsSearchingChanged = currentState.isSearching !== searchState.value?.isSearching;
          
          // 如果匹配数量或搜索状态发生变化，需要更新状态
          // 但是对于 currentIndex，需要保护用户手动选择的索引
          if (hasMatchCountChanged || hasIsSearchingChanged) {
            // 创建状态副本，保护用户选择的索引
            const stateToUpdate = { ...currentState };
            
            // 如果用户手动选择了索引，并且该索引仍然有效，保持用户的选择
            if (userSelectedIndex.value !== null && userSelectedIndex.value < currentMatchCount) {
              stateToUpdate.currentIndex = userSelectedIndex.value;
              // 同时更新适配器的内部状态以保持一致
              // 注意：这里只更新 searchState，不会触发适配器状态更新，因为适配器状态会在用户点击时通过 find 方法更新
            }
            
            searchState.value = stateToUpdate;
            lastMatchCount = currentMatchCount;
          } else if (
            // 如果只有 currentIndex 变化，且不是用户选择的索引，才更新
            currentState.currentIndex !== searchState.value?.currentIndex &&
            (userSelectedIndex.value === null || currentState.currentIndex !== userSelectedIndex.value)
          ) {
            // 这是适配器内部状态变化（比如通过 find 方法），可以更新
            searchState.value = currentState;
          }
          
          // 如果搜索完成（isSearching 为 false），停止轮询并清除用户选择标记
          if (!currentState.isSearching) {
            userSelectedIndex.value = null;
            if (searchCheckInterval) {
              clearInterval(searchCheckInterval);
              searchCheckInterval = null;
            }
          }
        }
        
        checkCount++;
        // 安全保护：即使搜索未完成，也要在达到最大检查次数时停止
        if (checkCount >= MAX_CHECK_COUNT) {
          userSelectedIndex.value = null;
          if (searchCheckInterval) {
            clearInterval(searchCheckInterval);
            searchCheckInterval = null;
          }
        }
      }, 500); // 500ms 轮询间隔，确保实时性
    } catch (error) {
      regexError.value = (error as Error)?.message ?? String(error);
    }
    searchTimeout = null;
  }, 300);
};

watch(
  () => ({
    find: form.findText,
    matchCase: form.matchCase,
    wholeWord: form.wholeWord,
    useRegex: form.useRegex,
    preserveCase: form.preserveCase,
    adapter: props.adapter,
  }),
  () => {
    applySearch();
  },
);

// 监听搜索状态变化，自动显示匹配列表
watch(
  () => searchState.value?.matches.length,
  (matchCount) => {
    if (matchCount && matchCount > 0) {
      showMatchesList.value = true;
      const currentIndex = searchState.value?.currentIndex ?? -1;
      selectedMatchIndex.value = currentIndex >= 0 ? currentIndex : 0;
    }
  },
);

// 监听搜索状态变化，更新选中项
watch(
  () => searchState.value?.currentIndex,
  (newIndex) => {
    if (newIndex !== null && newIndex !== undefined) {
      selectedMatchIndex.value = newIndex;
    }
  },
);

const handleFind = (direction: "next" | "previous") => {
  if (!props.adapter || !canSearch.value) return;
  logger.debug("handleFind", direction);
  const state = props.adapter.find(direction);
  searchState.value = state;
};

const handleFindFromStart = () => {
  if (!props.adapter || !canSearch.value) return;
  logger.debug("handleFindFromStart");
  // 先移动到文档开头
  props.adapter.goTo({ line: 1, column: 1 });
  // 重新配置搜索，从开头开始（startOffset=0）
  const state = props.adapter.configureSearch(
    {
      text: form.findText,
      matchCase: form.matchCase,
      wholeWord: form.wholeWord,
      useRegex: form.useRegex,
      preserveCase: form.preserveCase,
    },
    { revealFirst: true },
  );
  searchState.value = state;
  
  // 等待搜索完成，实时更新状态
  // 清除用户选择标记，因为这是新的搜索
  userSelectedIndex.value = null;
  let checkCount = 0;
  const MAX_CHECK_COUNT = 500;
  let lastMatchCount = 0;
  const checkInterval = setInterval(() => {
    const currentState = props.adapter?.getSearchState();
    if (currentState) {
      const currentMatchCount = currentState.matches.length;
      const hasMatchCountChanged = currentMatchCount !== lastMatchCount;
      const hasIsSearchingChanged = currentState.isSearching !== searchState.value?.isSearching;
      
      // 如果匹配数量或搜索状态发生变化，需要更新状态
      // 但是对于 currentIndex，需要保护用户手动选择的索引
      if (hasMatchCountChanged || hasIsSearchingChanged) {
        const stateToUpdate = { ...currentState };
        if (userSelectedIndex.value !== null && userSelectedIndex.value < currentMatchCount) {
          stateToUpdate.currentIndex = userSelectedIndex.value;
        }
        searchState.value = stateToUpdate;
        lastMatchCount = currentMatchCount;
      } else if (
        currentState.currentIndex !== searchState.value?.currentIndex &&
        (userSelectedIndex.value === null || currentState.currentIndex !== userSelectedIndex.value)
      ) {
        searchState.value = currentState;
      }
      
      // 如果搜索完成，停止轮询
      if (!currentState.isSearching) {
        userSelectedIndex.value = null;
        clearInterval(checkInterval);
      }
    }
    checkCount++;
    if (checkCount >= MAX_CHECK_COUNT) {
      userSelectedIndex.value = null;
      clearInterval(checkInterval);
    }
  }, 500);
};

const handleReplace = () => {
  if (!props.adapter || !canReplace.value) return;
  const state = props.adapter.replaceCurrent(form.replaceText);
  searchState.value = state;
  
  // replaceCurrent 会重新调用 configureSearch（异步），需要等待搜索完成并实时更新
  // 替换后清除用户选择标记，因为搜索会重新开始
  userSelectedIndex.value = null;
  let checkCount = 0;
  const MAX_CHECK_COUNT = 500;
  let lastMatchCount = 0;
  const checkInterval = setInterval(() => {
    const currentState = props.adapter?.getSearchState();
    if (currentState) {
      const currentMatchCount = currentState.matches.length;
      const hasMatchCountChanged = currentMatchCount !== lastMatchCount;
      const hasIsSearchingChanged = currentState.isSearching !== searchState.value?.isSearching;
      
      if (hasMatchCountChanged || hasIsSearchingChanged) {
        const stateToUpdate = { ...currentState };
        if (userSelectedIndex.value !== null && userSelectedIndex.value < currentMatchCount) {
          stateToUpdate.currentIndex = userSelectedIndex.value;
        }
        searchState.value = stateToUpdate;
        lastMatchCount = currentMatchCount;
      } else if (
        currentState.currentIndex !== searchState.value?.currentIndex &&
        (userSelectedIndex.value === null || currentState.currentIndex !== userSelectedIndex.value)
      ) {
        searchState.value = currentState;
      }
      
      // 如果搜索完成，停止轮询
      if (!currentState.isSearching) {
        userSelectedIndex.value = null;
        clearInterval(checkInterval);
      }
    }
    checkCount++;
    if (checkCount >= MAX_CHECK_COUNT) {
      userSelectedIndex.value = null;
      clearInterval(checkInterval);
    }
  }, 500);
};


const handleReplaceAll = () => {
  if (!props.adapter || !canReplace.value) return;
  const { state, replacedCount } = props.adapter.replaceAll(form.replaceText);
  searchState.value = state;
  eventBus.emit("show-success", t("searchReplace.replaceCount", {
    count: replacedCount,
    find: form.findText,
    replace: form.replaceText,
  }));
};

const handleFindAll = () => {
  if (!props.adapter || !canSearch.value) return;
  const state = props.adapter.getSearchState();
  searchState.value = state;
  // 显示匹配列表
  if (state.matches.length > 0) {
    showMatchesList.value = true;
    selectedMatchIndex.value = state.currentIndex >= 0 ? state.currentIndex : 0;
  }
  eventBus.emit("show-info", t("searchReplace.foundCount", {
    count: state.matches.length,
    find: form.findText,
  }));
};

const selectMatch = (index: number) => {
  if (!props.adapter || !searchState.value) return;
  selectedMatchIndex.value = index;
  // 标记为用户手动选择的索引，需要在轮询中保护
  userSelectedIndex.value = index;
  
  // 更新适配器的当前索引并高亮
  const state = props.adapter.getSearchState();
  if (state.matches[index]) {
    // 对于vditor，直接调用highlightSingleMatch高亮指定匹配
    if (props.adapter.kind === "vditor") {
      const vditorAdapter = props.adapter as any;
      if (vditorAdapter.highlightSingleMatch) {
        // 更新适配器内部的状态
        const currentIndex = state.currentIndex;
        if (currentIndex !== index) {
          // 计算需要移动的步数，使用find方法更新适配器内部状态
          const direction = index > currentIndex ? "next" : "previous";
          const steps = Math.abs(index - currentIndex);
          let newState = state;
          for (let i = 0; i < steps; i++) {
            newState = props.adapter.find(direction);
          }
          searchState.value = newState;
        } else {
          // 如果已经是当前索引，直接高亮（不通过find，避免重复操作）
          vditorAdapter.highlightSingleMatch(state.matches[index], index, true);
          // 更新UI状态
          const newState = { ...state, currentIndex: index };
          searchState.value = newState;
        }
        return;
      }
    }
    
    // 对于monaco，直接定位到行和列（不需要DOM搜索）
    if (props.adapter.kind === "monaco") {
      const match = state.matches[index];
      if (match) {
        // 直接使用 goTo 定位到匹配位置
        props.adapter.goTo(match.range.start);
        // 选中匹配范围
        props.adapter.goToRanges([match.range]);
        // 更新适配器内部的状态
        const monacoAdapter = props.adapter as any;
        if (monacoAdapter.applyDecorations) {
          // 只高亮当前匹配
          monacoAdapter.applyDecorations([match], 0);
        }
        // 更新UI状态
        const newState = { ...state, currentIndex: index };
        searchState.value = newState;
      }
      return;
    }
    
    // 对于其他编辑器，使用find方法导航
    const currentIndex = state.currentIndex;
    if (currentIndex !== index) {
      const direction = index > currentIndex ? "next" : "previous";
      const steps = Math.abs(index - currentIndex);
      let newState = state;
      for (let i = 0; i < steps; i++) {
        newState = props.adapter.find(direction);
      }
      searchState.value = newState;
    }
  }
};


const getMatchContextHtml = (match: any, index: number): string => {
  if (!props.adapter) return '';
  
  try {
    const fullText = props.adapter.getFullText();
    if (!fullText) return '';
    
    // 获取匹配的偏移量
    const startOffset = (match as any).startOffset;
    const endOffset = (match as any).endOffset;
    
    if (startOffset === undefined || endOffset === undefined) {
      // 如果没有偏移量信息，使用 range 计算
      const lines = fullText.split('\n');
      let offset = 0;
      for (let i = 0; i < match.range.start.line - 1; i++) {
        offset += lines[i].length + 1; // +1 for newline
      }
      const calculatedStartOffset = offset + match.range.start.column - 1;
      const calculatedEndOffset = calculatedStartOffset + match.matchText.length;
      
      const context = generateMatchContext(
        fullText,
        match.matchText,
        calculatedStartOffset,
        calculatedEndOffset,
        80
      );
      
      // 转义HTML并高亮匹配部分
      const escapeHtml = (text: string) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
      };
      
      const beforeEscaped = escapeHtml(context.before);
      const matchEscaped = escapeHtml(context.match);
      const afterEscaped = escapeHtml(context.after);
      
      return `${beforeEscaped}<mark class="match-highlight">${matchEscaped}</mark>${afterEscaped}`;
    } else {
      // 使用偏移量生成上下文
      const context = generateMatchContext(
        fullText,
        match.matchText,
        startOffset,
        endOffset,
        80
      );
      
      // 转义HTML并高亮匹配部分
      const escapeHtml = (text: string) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
      };
      
      const beforeEscaped = escapeHtml(context.before);
      const matchEscaped = escapeHtml(context.match);
      const afterEscaped = escapeHtml(context.after);
      
      return `${beforeEscaped}<mark class="match-highlight">${matchEscaped}</mark>${afterEscaped}`;
    }
  } catch (error) {
    logger.warn('生成匹配上下文失败', error);
    // 回退到只显示匹配文本
    const escapeHtml = (text: string) => {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    };
    return `<mark class="match-highlight">${escapeHtml(match.matchText)}</mark>`;
  }
};

const getMatchItemStyle = (index: number) => {
  const isActive = searchState.value?.currentIndex === index;
  const theme = themeState.currentTheme;
  return {
    backgroundColor: isActive 
      ? (theme.type === "dark" ? "rgba(64, 158, 255, 0.2)" : "rgba(64, 158, 255, 0.1)")
      : theme.background,
    border: `1px solid ${isActive 
      ? theme.primaryColor 
      : mixColors(theme.textColor, theme.background2nd, 0.2)}`,
    borderRadius: "6px",
    padding: "12px",
    marginBottom: "8px",
    cursor: "pointer",
    transition: "all 0.2s",
  };
};

const handleReset = () => {
  // 只重置搜索结果，不清除搜索和替换文本
  regexError.value = null;
  props.adapter?.clearSearch();
  searchState.value = null;
  userSelectedIndex.value = null; // 清除用户选择标记
  // 如果有搜索文本，重新执行搜索
  if (form.findText) {
    applySearch();
  }
};

const handleClose = () => {
  props.adapter?.clearSearch();
  userSelectedIndex.value = null; // 清除用户选择标记
  eventBus.emit("search-replace-closed");
  emit("close");
};

type ToggleFlagKey = "matchCase" | "wholeWord" | "useRegex" | "preserveCase";

const toggleFlag = (key: ToggleFlagKey) => {
  form[key] = !form[key];
};

const collapsed = ref(true);
const showMatchesList = ref(false);
const isDragging = ref(false);
const dragStart = ref({ x: 0, y: 0 });
const selectedMatchIndex = ref<number | null>(null);
const userSelectedIndex = ref<number | null>(null); // 用户手动选择的索引，需要保护不被轮询覆盖

const onMouseDown = (event: MouseEvent) => {
  isDragging.value = true;
  dragStart.value = {
    x: event.clientX - menuPosition.value.left,
    y: event.clientY - menuPosition.value.top,
  };
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
};

const onMouseMove = (event: MouseEvent) => {
  if (!isDragging.value) return;
  menuPosition.value = {
    top: event.clientY - dragStart.value.y,
    left: event.clientX - dragStart.value.x,
  };
};

const onMouseUp = () => {
  isDragging.value = false;
  document.removeEventListener("mousemove", onMouseMove);
  document.removeEventListener("mouseup", onMouseUp);
};

const isInteractiveElement = (target: HTMLElement | null) => {
  if (!target) return false;
  return !!target.closest(
    "input, textarea, button, .el-input, .el-textarea, .el-button",
  );
};

const handlePanelMouseDown = (event: MouseEvent) => {
  if (isInteractiveElement(event.target as HTMLElement)) return;
  onMouseDown(event);
};

const handleForceExpand = () => {
  collapsed.value = false;
};

watch(
  () => collapsed.value,
  (value) => {
    if (!value) {
      eventBus.emit("search-replace-expand");
    }
  },
);

// 处理 Tab 切换和视图切换时关闭菜单
const handleTabOrViewChange = () => {
  logger.debug("Tab 或视图切换，关闭查找替换菜单");
  handleClose();
};

// 监听路由变化（视图切换）
watch(
  () => route.path,
  () => {
    handleTabOrViewChange();
  },
);

onMounted(() => {
  eventBus.on('search-replace-expand', handleForceExpand);
  // 监听 Tab 切换事件
  eventBus.on('active-tab-changed', handleTabOrViewChange);
  nextTick(() => {
    const selectionText = props.adapter?.getSelectionText();
    if (selectionText && selectionText.length < 200) {
      form.findText = selectionText;
    }
    findInputRef.value?.focus();
  });
});

onBeforeUnmount(() => {
  // 清除搜索定时器
  if (searchTimeout) {
    clearTimeout(searchTimeout);
    searchTimeout = null;
  }
  if (searchCheckInterval) {
    clearInterval(searchCheckInterval);
    searchCheckInterval = null;
  }
  props.adapter?.clearSearch();
  document.removeEventListener("mousemove", onMouseMove);
  document.removeEventListener("mouseup", onMouseUp);
  eventBus.off('search-replace-expand', handleForceExpand);
  eventBus.off('active-tab-changed', handleTabOrViewChange);
});
</script>

<style scoped>
.search-replace-panel {
  position: absolute;
  width: 380px;
  padding: 16px;
  border-radius: 10px;
  box-shadow: 0 20px 40px rgba(15, 23, 42, 0.18);
  z-index: 2000;
  backdrop-filter: blur(12px);
  transition: box-shadow 0.2s ease;
  user-select: none;
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
  font-family: "Fira Code", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
}

.panel-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
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
}

.matches-panel {
  width: 100%;
  display: flex;
  flex-direction: column;
  border: 1px solid v-bind('mixColors(themeState.currentTheme.textColor, themeState.currentTheme.background2nd, 0.2)');
  border-radius: 6px;
  overflow: hidden;
  background-color: v-bind('themeState.currentTheme.background');
}

.panel-header-small {
  background-color: v-bind('themeState.currentTheme.background2nd');
  color: v-bind('themeState.currentTheme.textColor');
  border-bottom: 1px solid v-bind('mixColors(themeState.currentTheme.textColor, themeState.currentTheme.background2nd, 0.2)');
  padding: 8px 12px;
  font-weight: 500;
  font-size: 13px;
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
</style>

