<template>
  <div class="console-container" :style="consoleStyle">
    <div class="console-header" :style="{
      backgroundColor:themeState.currentTheme.editorToolbarBackgroundColor
    }">
      <span class="console-title">{{ $t('console.title') }}</span>
      <div class="console-actions">
        <el-switch
          v-if="showAiAnalysis"
          v-model="enableAiAnalysis"
          :active-text="$t('console.enableAiAnalysis')"
          size="small"
          style="margin-right: 8px;"
          @change="handleAiAnalysisToggle"
        />
        <el-button size="small" @click="clearConsole">{{ $t('console.clear') }}</el-button>
        <el-button size="small" @click="copyConsole">{{ $t('console.copy') }}</el-button>
        <el-button size="small" @click="saveConsole">{{ $t('console.saveLog') }}</el-button>
      </div>
    </div>
    <div class="console-editor" ref="editorContainer"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, PropType, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import * as monaco from 'monaco-editor';
import { setupMonacoWorker } from '../utils/monaco-worker-config';
import localIpcRenderer from '../utils/web-adapter/local-ipc-renderer.ts';
import { webMainCalls } from '../utils/web-adapter/web-main-calls.js';
let ipcRenderer: typeof localIpcRenderer | null = null
if (window && window.electron) {
    ipcRenderer = window.electron.ipcRenderer as typeof localIpcRenderer
} else {
    webMainCalls();
    ipcRenderer = localIpcRenderer
}
import eventBus from '../utils/event-bus';
import { themeState } from '../utils/themes';

const { t } = useI18n();

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
  append?: boolean;
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
  },
  showAiAnalysis: {
    type: Boolean,
    default: true
  }
});

const consoleStyle = ref({
  '--console-bg': themeState.currentTheme.editorPanelBackgroundColor,
  '--console-text': themeState.currentTheme.textColor2,
  '--console-err': '#fe8771',
  '--console-warn': '#e6a23c',
  '--console-debug': '#909399'
});

const editorContainer = ref<HTMLDivElement | null>(null);

let lineId = 0;
let editorId: string | null = null;
let decorationIds: string[] = [];
let consoleFontLoaded = false;

const normalizeType = (type?: string, fallback: ConsoleLineType = 'out'): ConsoleLineType => {
  if (!type) return fallback;
  const lower = type.toLowerCase();
  if (lower === 'error' || lower === 'err') return 'err';
  if (lower === 'warn' || lower === 'warning') return 'warn';
  if (lower === 'debug') return 'debug';
  return fallback;
};

const detectTypeFromContent = (content: string): ConsoleLineType | null => {
  if (!content || typeof content !== 'string') return null;
  const trimmed = content.trim();
  if (!trimmed) return null;
  const lowerContent = trimmed.toLowerCase();
  
  if (lowerContent.startsWith('error')) {
    return 'err';
  }
  if (lowerContent.startsWith('warning')) {
    return 'warn';
  }
  return null;
};

const lines = ref<ConsoleLine[]>([]);

const enableAiAnalysis = ref(true);

const handleAiAnalysisToggle = (value: boolean) => {
  eventBus.emit('console-ai-analysis-toggle', {
    key: props.consoleKey,
    enabled: value
  });
};

const getEditor = (): monaco.editor.IStandaloneCodeEditor | null => {
  if (!editorId) return null;
  const editors = (monaco.editor as any).getEditors?.() ?? [];
  const found = editors.find((e: monaco.editor.IStandaloneCodeEditor) => e.getId?.() === editorId);
  return found ?? null;
};

const ensureConsoleFont = async () => {
  if (consoleFontLoaded || !ipcRenderer?.invoke) return;
  try {
    const resourcesPath = await ipcRenderer.invoke('resources-path');
    if (typeof resourcesPath !== 'string' || !resourcesPath) return;
    const normalized = resourcesPath.replace(/\\/g, '/').replace(/^\/+/, '');
    const fontUrl = `file:///${normalized}/consola.ttf`;
    const fontFace = new FontFace('ConsoleAscii', `url(${fontUrl})`, {
      style: 'normal',
      weight: '400',
      display: 'swap',
      unicodeRange: 'U+0020-007E'
    });
    await fontFace.load();
    document.fonts?.add(fontFace);
    consoleFontLoaded = true;
  } catch (error) {
    console.warn('[ConsoleOutput] 加载 consola 字体失败', error);
  }
};

const applyConsoleTheme = () => {
  const editor = getEditor();
  if (!editor) return;
  const isDark = themeState.currentTheme.type === 'dark';
  const bg = themeState.currentTheme.editorPanelBackgroundColor || (isDark ? '#1e1e1e' : '#ffffff');
  const fg = themeState.currentTheme.textColor2 || (isDark ? '#d4d4d4' : '#333333');

  const normalizeColor = (color: string) => {
    if (!color) return '#FFFFFF';
    let hex = color.replace('#', '');
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    return hex.length === 6 ? '#' + hex.toUpperCase() : '#FFFFFF';
  };

  const normalizedBg = normalizeColor(bg);
  const normalizedFg = normalizeColor(fg);

  monaco.editor.defineTheme('console-viewer', {
    base: isDark ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': normalizedBg,
      'editor.foreground': normalizedFg,
      'editorLineNumber.foreground': normalizedFg,
      'editorLineNumber.activeForeground': normalizedFg,
      'scrollbarSlider.background': `${normalizedFg}33`,
      'scrollbarSlider.hoverBackground': `${normalizedFg}55`
    }
  });
  monaco.editor.setTheme('console-viewer');
};

const applyDecorations = (editor: monaco.editor.IStandaloneCodeEditor) => {
  const decorations = lines.value
    .map((line, idx) => {
      let inlineClassName: string | undefined;
      if (line.type === 'err') inlineClassName = 'console-inline-err';
      else if (line.type === 'warn') inlineClassName = 'console-inline-warn';
      if (!inlineClassName) return null;
      return {
        range: new monaco.Range(idx + 1, 1, idx + 1, line.content.length + 1),
        options: { inlineClassName, stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges }
      } as monaco.editor.IModelDeltaDecoration;
    })
    .filter((item): item is monaco.editor.IModelDeltaDecoration => !!item);

  decorationIds = editor.deltaDecorations(decorationIds, decorations);
};

const renderConsole = () => {
  const editor = getEditor();
  if (!editor) return;
  
  const text = lines.value.map(l => l.content).join('\n');
  const currentValue = editor.getValue();
  const position = editor.getPosition();
  const wasAtEnd = position && position.lineNumber === editor.getModel()?.getLineCount();
  
  if (currentValue !== text) {
    editor.setValue(text);
    
    if (wasAtEnd) {
      const lineCount = lines.value.length;
      if (lineCount > 0) {
        editor.revealLine(lineCount, monaco.editor.ScrollType.Immediate);
      }
    }
  }
  
  applyDecorations(editor);
  
  // 自动滚动到底部
  const lineCount = lines.value.length;
  if (lineCount > 0) {
    editor.revealLine(lineCount, monaco.editor.ScrollType.Immediate);
  }
};

const createEditor = async () => {
  await nextTick();
  if (!editorContainer.value) return;
  setupMonacoWorker();
  await ensureConsoleFont();
  const editor = monaco.editor.create(editorContainer.value, {
    value: '',
    language: 'plaintext',
    theme: themeState.currentTheme.type === 'dark' ? 'vs-dark' : 'vs',
    readOnly: true,
    lineNumbers: 'on',
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    automaticLayout: true,
    contextmenu: false,
    fontSize: 13,
    fontFamily: 'ConsoleAscii, "JetBrains Mono", Consolas, monospace',
    renderLineHighlight: 'none',
    glyphMargin: false,
    folding: false
  });
  editorId = editor.getId();
  applyConsoleTheme();
  renderConsole();
};

const applyHistory = (history: HistoryLine[]) => {
  const initialLines = history.map(historyLine => ({
    id: lineId++,
    content: historyLine.content,
    type: normalizeType(historyLine.type, 'out')
  }));
  lines.value = initialLines;
  renderConsole();
};

applyHistory(props.history);

watch(() => props.history, (newHistory) => {
  lineId = 0;
  applyHistory(newHistory);
});

eventBus.on('sync-editor-theme', async () => {
  consoleStyle.value = {
    '--console-bg': themeState.currentTheme.editorPanelBackgroundColor,
    '--console-text': themeState.currentTheme.textColor2,
    '--console-err': '#fe8771',
    '--console-warn': '#e6a23c',
    '--console-debug': '#909399'
  };
  applyConsoleTheme();
});

const addLine = (content: string, type: ConsoleLineType = 'out') => {
  if (content.includes('\n')) {
    const parts = content.split('\n');
    for (const part of parts) {
      lines.value.push({ id: lineId++, content: part, type });
    }
  } else {
    lines.value.push({ id: lineId++, content, type });
  }
  renderConsole();
};

const appendToLastLine = (content: string, type: ConsoleLineType = 'out') => {
  if (lines.value.length === 0) {
    addLine(content, type);
    return;
  }
  
  const hasNewline = content.includes('\n');
  if (!hasNewline) {
    const lastLine = lines.value[lines.value.length - 1];
    lastLine.content += content;
    renderConsole();
  } else {
    const parts = content.split('\n');
    if (parts[0]) {
      const lastLine = lines.value[lines.value.length - 1];
      lastLine.content += parts[0];
    }
    for (let i = 1; i < parts.length - 1; i++) {
      if (parts[i]) {
        lines.value.push({ id: lineId++, content: parts[i], type });
      } else {
        lines.value.push({ id: lineId++, content: '', type });
      }
    }
    if (parts.length > 1 && parts[parts.length - 1]) {
      lines.value.push({ id: lineId++, content: parts[parts.length - 1], type });
    }
    renderConsole();
  }
};

const clearConsole = () => {
  lines.value = [];
  const editor = getEditor();
  if (editor) {
    decorationIds = editor.deltaDecorations(decorationIds, []);
    editor.setValue('');
  }
};

const copyConsole = () => {
  const text = lines.value.map(l => l.content).join('\n');
  navigator.clipboard.writeText(text).then(() => {
    eventBus.emit("show-success", t('console.copiedToClipboard'))
  });
};

const saveConsole = async () => {
  const text = lines.value.map(l => l.content).join('\n');
  
  try {
    if (!ipcRenderer) {
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `console-${props.consoleKey}.log`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      eventBus.emit("show-success", t('console.logSaved'));
      return;
    }
    
    const result = await ipcRenderer.invoke('save-file-dialog', {
      defaultName: `console-${props.consoleKey}.log`,
      filters: [
        { name: 'Log Files', extensions: ['log', 'txt'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    }) as { canceled?: boolean; filePath?: string };
    
    if (result.canceled || !result.filePath) {
      return;
    }
    
    await ipcRenderer.invoke('write-file-content', {
      filePath: result.filePath,
      content: text,
      encoding: 'utf8'
    });
    
    eventBus.emit("show-success", t('console.logSaved'));
  } catch (error) {
    console.error('保存日志失败:', error);
    eventBus.emit("show-error", t('console.logSaveFailed') || '保存日志失败');
  }
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
        type: fallbackType,
        append: false
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
      type: normalizeType(obj.type, fallbackType),
      append: obj.append ?? false
    };
  }

  return null;
};

const handleOutPayload = (payload: unknown, fallbackType: ConsoleLineType) => {
  const resolved = resolvePayload(payload, fallbackType);
  if (!resolved) return;
  
  const detectedType = detectTypeFromContent(resolved.content);
  
  let finalType: ConsoleLineType;
  if (detectedType !== null) {
    finalType = detectedType;
  } else {
    finalType = normalizeType(resolved.type, fallbackType);
  }
  
  if (resolved.append) {
    appendToLastLine(resolved.content, finalType);
  } else {
    addLine(resolved.content, finalType);
  }
};

const handleClearPayload = (payload: unknown) => {
  if (payload === undefined || payload === null) {
    clearConsole();
    return;
  }
  const resolved = resolvePayload(payload, 'out', false);
  if (!resolved) {
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
  createEditor();
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
  const editor = getEditor();
  if (editor) {
    editor.dispose();
  }
  editorId = null;
  decorationIds = [];
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

.console-title {
  user-select: none;
}

.console-actions button {
  margin-left: 5px;
}

.console-editor {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

:deep(.monaco-editor),
:deep(.monaco-editor .margin) {
  background-color: var(--console-bg) !important;
}

:deep(.monaco-editor .view-overlays .current-line) {
  background-color: transparent !important;
}

:deep(.console-inline-err) {
  color: var(--console-err) !important;
}

:deep(.console-inline-warn) {
  color: var(--console-warn) !important;
}
</style>


