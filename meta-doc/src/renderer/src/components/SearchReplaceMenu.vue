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

    <footer class="panel-actions" @mousedown.stop>
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
import { ElButton, ElInput, ElTooltip } from "element-plus";
import { useI18n } from "vue-i18n";
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
  View,
} from "@element-plus/icons-vue";

const logger = createRendererLogger("SearchReplaceMenu");

const props = defineProps<{
  position: { top: number; left: number };
  adapter: TextEditorAdapter | null;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const { t } = useI18n();

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

const canSearch = computed(() => !!form.findText && !regexError.value);
const canReplace = computed(() => {
  if (!canSearch.value) return false;
  return (searchState.value?.matches.length ?? 0) > 0;
});

const applySearch = () => {
  if (!props.adapter) return;
  if (!form.findText) {
    props.adapter.clearSearch();
    searchState.value = null;
    regexError.value = null;
    return;
  }
  try {
    const state = props.adapter.configureSearch(
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
    
    // 异步搜索完成后，需要更新 searchState.value 以触发 UI 更新
    // 使用简单的轮询，最多检查 30 次（约 1.5 秒）
    let checkCount = 0;
    const checkInterval = setInterval(() => {
      const currentState = props.adapter?.getSearchState();
      if (currentState) {
        // 每次检查都更新状态，确保 UI 响应
        searchState.value = currentState;
        // 如果找到匹配，可以提前结束
        if (currentState.matches.length > 0) {
          clearInterval(checkInterval);
        }
      }
      checkCount++;
      if (checkCount >= 30) {
        clearInterval(checkInterval);
      }
    }, 50);
  } catch (error) {
    regexError.value = (error as Error)?.message ?? String(error);
  }
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

const handleFind = (direction: "next" | "previous") => {
  if (!props.adapter || !canSearch.value) return;
  logger.debug("handleFind", direction);
  const state = props.adapter.find(direction);
  searchState.value = state;
};

const handleReplace = () => {
  if (!props.adapter || !canReplace.value) return;
  const state = props.adapter.replaceCurrent(form.replaceText);
  searchState.value = state;
  
  // replaceCurrent 会重新调用 configureSearch（异步），需要等待搜索完成
  let checkCount = 0;
  const checkInterval = setInterval(() => {
    const currentState = props.adapter?.getSearchState();
    if (currentState) {
      searchState.value = currentState;
      // 如果找到匹配，可以提前结束
      if (currentState.matches.length > 0 || checkCount >= 30) {
        clearInterval(checkInterval);
      }
    }
    checkCount++;
    if (checkCount >= 30) {
      clearInterval(checkInterval);
    }
  }, 50);
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
  eventBus.emit("show-info", t("searchReplace.foundCount", {
    count: state.matches.length,
    find: form.findText,
  }));
};

const handleReset = () => {
  // 只重置搜索结果，不清除搜索和替换文本
  regexError.value = null;
  props.adapter?.clearSearch();
  searchState.value = null;
  // 如果有搜索文本，重新执行搜索
  if (form.findText) {
    applySearch();
  }
};

const handleClose = () => {
  props.adapter?.clearSearch();
  eventBus.emit("search-replace-closed");
  emit("close");
};

type ToggleFlagKey = "matchCase" | "wholeWord" | "useRegex" | "preserveCase";

const toggleFlag = (key: ToggleFlagKey) => {
  form[key] = !form[key];
};

const collapsed = ref(true);
const isDragging = ref(false);
const dragStart = ref({ x: 0, y: 0 });

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

onMounted(() => {
  eventBus.on('search-replace-expand', handleForceExpand);
  nextTick(() => {
    const selectionText = props.adapter?.getSelectionText();
    if (selectionText && selectionText.length < 200) {
      form.findText = selectionText;
    }
    findInputRef.value?.focus();
  });
});

onBeforeUnmount(() => {
  props.adapter?.clearSearch();
  document.removeEventListener("mousemove", onMouseMove);
  document.removeEventListener("mouseup", onMouseUp);
  eventBus.off('search-replace-expand', handleForceExpand);
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
</style>

