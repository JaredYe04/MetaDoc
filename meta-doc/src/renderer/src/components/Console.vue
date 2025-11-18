<template>
  <div class="console-container" :style="consoleStyle">
    <div class="console-header" :style="{
      backgroundColor:themeState.currentTheme.editorToolbarBackgroundColor
    }">
      <span>终端输出</span>
      <div class="console-actions">
        <el-button size="small" @click="clearConsole">清屏</el-button>
        <el-button size="small" @click="copyConsole">复制</el-button>
        <el-button size="small" @click="saveConsole">保存日志</el-button>
      </div>
    </div>
    <div class="console-body" ref="consoleBody">
        <div v-for="line in lines" :key="line.id" :class="line.type">
        {{ line.content }}
        </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, PropType } from 'vue';
import localIpcRenderer from '../utils/web-adapter/local-ipc-renderer.ts';
import { webMainCalls } from '../utils/web-adapter/web-main-calls.js';
let ipcRenderer: typeof localIpcRenderer | null = null
if (window && window.electron) {
    ipcRenderer = window.electron.ipcRenderer as typeof localIpcRenderer

} else {
    webMainCalls();
    ipcRenderer = localIpcRenderer
    //todo 说明当前环境不是electron环境，需要另外适配
}
import eventBus from '../utils/event-bus';
import { themeState } from '../utils/themes';

type ConsoleLineType = 'out' | 'err' | 'warn' | 'debug';

interface HistoryLine {
  content: string;
  type?: ConsoleLineType | string;
}

interface ConsolePayload {
  key?: string;
  console_key?: string;
  consoleKey?: string;
  content?: string;
  message?: string;
  text?: string;
  type?: string;
}

interface ConsoleLine {
  id: number;
  content: string;
  type: ConsoleLineType;
}

const props = defineProps({
  consoleKey: {
    type: String,
    default: 'default'
  },
  history: {
    type: Array as PropType<HistoryLine[]>,
    default: () => []
  }
});

const consoleStyle = ref({
  '--console-bg': themeState.currentTheme.editorPanelBackgroundColor,
  '--console-text': themeState.currentTheme.textColor2,
  '--console-err': '#fe8771',
  '--console-warn': '#e6a23c',
  '--console-debug': '#909399'
});

eventBus.on('sync-editor-theme', async () => {
  consoleStyle.value = {
    '--console-bg': themeState.currentTheme.editorPanelBackgroundColor,
    '--console-text': themeState.currentTheme.textColor2,
    '--console-err': '#fe8771',
    '--console-warn': '#e6a23c',
    '--console-debug': '#909399'
  };
});

const lines = ref<ConsoleLine[]>([]);
const consoleBody = ref<HTMLDivElement | null>(null);

let lineId = 0;

const normalizeType = (type?: string, fallback: ConsoleLineType = 'out'): ConsoleLineType => {
  if (!type) return fallback;
  const lower = type.toLowerCase();
  if (lower === 'error' || lower === 'err') return 'err';
  if (lower === 'warn' || lower === 'warning') return 'warn';
  if (lower === 'debug') return 'debug';
  return fallback;
};

const applyHistory = (history: HistoryLine[]) => {
  const initialLines = history.map(historyLine => ({
    id: lineId++,
    content: historyLine.content,
    type: normalizeType(historyLine.type, 'out')
  }));
  lines.value = initialLines;
};

applyHistory(props.history);

watch(() => props.history, (newHistory) => {
  lineId = 0;
  applyHistory(newHistory);
});

const addLine = (content: string, type: ConsoleLineType = 'out') => {
  lines.value.push({ id: lineId++, content, type });
  requestAnimationFrame(() => {
    if (consoleBody.value) consoleBody.value.scrollTop = consoleBody.value.scrollHeight;
  });
};

const clearConsole = () => {
  lines.value = [];
};

const copyConsole = () => {
  const text = lines.value.map(l => l.content).join('\n');
  navigator.clipboard.writeText(text).then(() => {
    eventBus.emit("show-success",'已复制到剪贴板')
  });
};

const saveConsole = () => {
  const text = lines.value.map(l => l.content).join('\n');
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `console-${props.consoleKey}.log`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  eventBus.emit("show-success",'日志已保存')
};

const resolvePayload = (payload: unknown, fallbackType: ConsoleLineType, requireContent = true) => {
  if (payload === null || payload === undefined) {
    return null;
  }

  if (typeof payload === 'string') {
    const keyMatch = props.consoleKey;
    if (!requireContent || payload.length > 0) {
      return {
        key: keyMatch,
        content: payload,
        type: fallbackType
      };
    }
    return null;
  }

  if (typeof payload === 'object') {
    const obj = payload as ConsolePayload;
    const key = obj.key ?? obj.console_key ?? obj.consoleKey ?? props.consoleKey;
    if (key !== props.consoleKey) {
      return null;
    }

    const content = obj.content ?? obj.message ?? obj.text ?? '';
    if (requireContent && !content) {
      return null;
    }

    return {
      key,
      content,
      type: normalizeType(obj.type, fallbackType)
    };
  }

  return null;
};

const handleOutPayload = (payload: unknown, fallbackType: ConsoleLineType) => {
  const resolved = resolvePayload(payload, fallbackType);
  if (!resolved) return;
  addLine(resolved.content, normalizeType(resolved.type, fallbackType));
};

const handleClearPayload = (payload: unknown) => {
  if (payload === undefined || payload === null) {
    clearConsole();
    return;
  }
  const resolved = resolvePayload(payload, 'out', false);
  if (!resolved) {
    // 如果 key 不匹配则忽略
    return;
  }
  clearConsole();
};

const onConsoleOut = (_event: unknown, data: unknown) => handleOutPayload(data, 'out');
const onConsoleErr = (_event: unknown, data: unknown) => handleOutPayload(data, 'err');
const onEventBusConsoleOut = (data: unknown) => handleOutPayload(data, 'out');
const onEventBusConsoleErr = (data: unknown) => handleOutPayload(data, 'err');
const onEventBusClear = (data: unknown) => handleClearPayload(data);

onMounted(() => {
  eventBus.on('console-out', onEventBusConsoleOut);
  eventBus.on('console-err', onEventBusConsoleErr);
  eventBus.on('clear-console', onEventBusClear);
  if (ipcRenderer) {
    ipcRenderer.on('console-out', onConsoleOut);
    ipcRenderer.on('console-err', onConsoleErr);
  }
});

onBeforeUnmount(() => {
  eventBus.off('console-out', onEventBusConsoleOut);
  eventBus.off('console-err', onEventBusConsoleErr);
  eventBus.off('clear-console', onEventBusClear);
  if (ipcRenderer) {
    ipcRenderer.removeListener('console-out', onConsoleOut);
    ipcRenderer.removeListener('console-err', onConsoleErr);
  }
});
</script>

<style scoped>
.console-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background-color: var(--console-bg);
  color: var(--console-text);
  font-size: 13px;
  overflow: hidden;
}

.console-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 5px;
  border-bottom: 1px solid #9a9a9a41;
  flex-shrink: 0;
}

.console-actions button {
  margin-left: 5px;
}

.console-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 5px;
  white-space: pre-wrap;
  word-break: break-word;
}

.out {
  color: var(--console-text);
}

.err {
  color: var(--console-err);
}

.warn {
  color: var(--console-warn);
}

.debug {
  color: var(--console-debug);
}
</style>
