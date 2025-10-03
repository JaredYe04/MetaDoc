<template>
  <div class="console-container" :style="consoleStyle">
    <div class="console-header">
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

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
let ipcRenderer = null
if (window && window.electron) {
    ipcRenderer = window.electron.ipcRenderer

} else {
    webMainCalls();
    ipcRenderer = localIpcRenderer
    //todo 说明当前环境不是electron环境，需要另外适配
}
import eventBus from '../utils/event-bus';
import { themeState } from '../utils/themes';

const consoleStyle = ref({
      '--console-bg': themeState.currentTheme.editorPanelBackgroundColor,
      '--console-text': themeState.currentTheme.textColor2,
      '--console-err': '#fe8771'
    });
eventBus.on('sync-editor-theme', async () => {
    consoleStyle.value={
      '--console-bg': themeState.currentTheme.editorPanelBackgroundColor,
      '--console-text': themeState.currentTheme.textColor2,
      '--console-err': '#fe8771'
    };
});

const lines = ref([]);
const consoleBody = ref(null);

let lineId = 0;
const addLine = (content, type = 'out') => {
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
  a.download = 'console.log'; // 默认文件名
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  eventBus.emit("show-success",'日志已保存')
};


const onConsoleOut = (event, data) => addLine(data, 'out');
const onConsoleErr = (event, data) => addLine(data, 'err');

onMounted(() => {
  ipcRenderer.on('console-out', onConsoleOut);
  ipcRenderer.on('console-err', onConsoleErr);
});

onBeforeUnmount(() => {
  ipcRenderer.removeListener('console-out', onConsoleOut);
  ipcRenderer.removeListener('console-err', onConsoleErr);
});
</script>

<style scoped>
.console-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--console-bg);
  color: var(--console-text);
  font-size: 13px;
}

.console-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 5px;
  background-color: #2d2d2d;
  border-bottom: 1px solid #444;
}

.console-actions button {
  margin-left: 5px;
}

.console-body {
  flex: 1;
  overflow-y: auto;
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
</style>
