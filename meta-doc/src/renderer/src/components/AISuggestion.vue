<template>
  <!-- ghost span 的渲染由 JS 直接挂载到 targetEl -->
  <div v-if="false"></div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount, watchEffect } from "vue";
import "../assets/ai-suggestion.css";
import { themeState } from "../utils/themes";
import { useI18n } from 'vue-i18n'
import { suggestionCompletionPrompt } from "../utils/prompts";
import { ai_types, cancelAiTask, createAiTask } from "../utils/ai_tasks";
import { getSetting } from "../utils/settings";
import { current_format } from "../utils/common-data";
import * as monaco from "monaco-editor";
import 'monaco-latex';
import eventBus from "../utils/event-bus";


const { t } = useI18n()
const props = defineProps({
  targetEl: { type: Object, required: true }, // 宿主元素 (contenteditable 或 textarea overlay)
  trigger: { type: Boolean }, // 是否触发补全
  rootNodeClass: { type: String, required: true }, // 根节点
  context: { type: Object, default: () => ({}) },

});

const emits = defineEmits(["accepted", "cancelled", "reset","triggerSuggestion"]);

let suggestionEl = null;
let generating = false;

let zwsp = null; // 零宽空格
/** 开始生成补全 */
let tooltipEl = null;
const aiText = ref(""); // 流式生成的文本

function handleSelectionChange() {
  if (!suggestionEl) return;

  const sel = window.getSelection();
  if (!sel.rangeCount) return;

  const range = sel.getRangeAt(0);

  // 如果光标不在零宽空格或 span 之后，就取消
  if (
    zwsp && range.startContainer !== zwsp &&
    range.startContainer !== suggestionEl
  ) {
    cancelSuggestion();
  }
}
onMounted(() => {
  document.addEventListener("selectionchange", handleSelectionChange);
});

onBeforeUnmount(() => {
  document.removeEventListener("selectionchange", handleSelectionChange);
});

let ghostDecoration = [];
let ghostRange = null;
let ghostStartPosition = null;
let currentAiHandle=null;

/** 更新 Ghost Text（不会修改 editor 的实际内容，光标锁定在 ghostStartPosition） */

function updateGhostText(editor, text) {
  const model = editor.getModel();
  const currentPosition = editor.getPosition();

  // 如果起始位置不存在，则初始化
  if (!ghostStartPosition) {
    ghostStartPosition = currentPosition;
  }

  const startLine = ghostStartPosition.lineNumber;
  const startColumn = ghostStartPosition.column;
  const lines = text.split("\n");

  const endLine = startLine + lines.length - 1;
  const endColumn =
    lines.length === 1
      ? startColumn + lines[0].length
      : lines[lines.length - 1].length + 1;

  const newRange = new monaco.Range(startLine, startColumn, endLine, endColumn);

  // 保存光标原始位置
  const originalPosition = ghostStartPosition;

  // 关闭 UndoStop，保证连续更新不会产生 Undo 止点
  editor.pushUndoStop();

  // 插入或更新 Ghost Text
  model.applyEdits([
    {
      range: ghostRange || newRange,
      text: text,
      forceMoveMarkers: true,
    },
  ]);

  // 更新范围
  ghostRange = newRange;

  // 更新装饰
  ghostDecoration = editor.deltaDecorations(ghostDecoration || [], [
    {
      range: ghostRange,
      options: {
        inlineClassName:
          themeState.currentTheme.type === "dark"
            ? "ai-suggestion-dark"
            : "ai-suggestion",
        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
      },
    },
  ]);

  // 强制锁定光标在 ghostStartPosition
  editor.setPosition(originalPosition);
  
  editor.revealPositionInCenterIfOutsideViewport(originalPosition);
}

/** 接受 Ghost Text（把 ghost text 变成真实文本） */
function acceptGhostText(editor) {
  if (!ghostRange) return;

  const model = editor.getModel();
  const text = aiText.value;

  // 插入真实文本到光标原始位置
  model.applyEdits([
    {
      range: ghostRange,
      text: text,
      forceMoveMarkers: true
    }
  ]);

  // 清理 ghost text decoration
  ghostDecoration && editor.deltaDecorations(ghostDecoration, []);
  ghostDecoration = null;
  ghostRange = null;
  ghostStartPosition = null;
  
}

/** 取消 Ghost Text（撤销显示，但不修改原文） */
function cancelGhostText(editor) {
  if (!ghostRange) return;
  const model = editor.getModel();
  model.applyEdits([
    {
      range: ghostRange,
      text: "",
      forceMoveMarkers: true,
    },
  ]);
  ghostDecoration && editor.deltaDecorations(ghostDecoration, []);
  ghostDecoration = null;
  ghostRange = null;
  ghostStartPosition = null;
}


function getContextFromCursor(range, rootNodeClass, contextSize = 500) {
  let preContext = '';
  let postContext = '';

  if (!range) return { preContext, postContext };

  // --- 向前收集 ---
  let preRange = range.cloneRange();
  preRange.collapse(true); // 光标前
  let chars = 0;
  let node = preRange.startContainer;
  let offset = preRange.startOffset;

  while (node && chars < contextSize) {
    if (node.classList && node.classList.contains(rootNodeClass)) {
      break; // 超出根节点范围
    }
    if (node.nodeType === Node.TEXT_NODE) {
      const sliceLen = Math.min(offset, contextSize - chars);
      preContext = node.textContent.slice(offset - sliceLen, offset) + preContext;
      chars += sliceLen;
      offset = 0;
    }
    node = getPreviousTextNode(node);
    if (node) offset = node.textContent.length;
  }

  // --- 向后收集 ---
  let postRange = range.cloneRange();
  postRange.collapse(false); // 光标后
  chars = 0;
  node = postRange.startContainer;
  offset = postRange.startOffset;

  while (node && chars < contextSize) {
    if (node.classList && node.classList.contains(rootNodeClass)) {
      break; // 超出根节点范围
    }
    if (node.nodeType === Node.TEXT_NODE) {
      const sliceLen = Math.min(node.textContent.length - offset, contextSize - chars);
      postContext += node.textContent.slice(offset, offset + sliceLen);
      chars += sliceLen;
      offset = 0;
    }
    node = getNextTextNode(node);
  }

  return { preContext, postContext };
}

// 获取前一个文本节点
function getPreviousTextNode(node) {
  if (!node) return null;
  if (node.previousSibling) {
    node = node.previousSibling;
    while (node && node.nodeType !== Node.TEXT_NODE) {
      if (node.lastChild) node = node.lastChild;
      else node = node.previousSibling;
    }
    return node;
  }
  return node.parentNode; // 向上找
}

// 获取下一个文本节点
function getNextTextNode(node) {
  if (!node) return null;
  if (node.nextSibling) {
    node = node.nextSibling;
    while (node && node.nodeType !== Node.TEXT_NODE) {
      if (node.firstChild) node = node.firstChild;
      else node = node.nextSibling;
    }
    return node;
  }
  return node.parentNode;
}

function showTooltip() {
  hideTooltip();
  tooltipEl = document.createElement("div");
  tooltipEl.textContent = t("aiSuggestion.generatingTooltip");
  tooltipEl.style.position = "absolute";
  tooltipEl.style.padding = "2px 6px";
  tooltipEl.style.background = "rgba(0,0,0,0.7)";
  tooltipEl.style.color = "#fff";
  tooltipEl.style.borderRadius = "4px";
  tooltipEl.style.fontSize = "12px";
  tooltipEl.style.pointerEvents = "none";
  tooltipEl.style.whiteSpace = "nowrap";
  document.body.appendChild(tooltipEl);

  // 定位
  let rect;
  if (current_format.value === 'md') {
    rect = suggestionEl.getBoundingClientRect();
  }
  else {
    rect = suggestionEl.dom.getBoundingClientRect();
    //console.log("rect",rect)
  }
  tooltipEl.style.left = rect.left - 10 + "px";
  tooltipEl.style.top = rect.top - rect.height - 20 + "px";
}

function hideTooltip() {
  if (tooltipEl) {
    tooltipEl.remove();
    tooltipEl = null;
  }
}
function setElTheme(element) {
  // 根据 themeState 动态设置 class
  if (themeState?.currentTheme?.type === "dark") {
    element.className = "ai-suggestion-dark";
  } else {
    element.className = "ai-suggestion";
  }

  element.contentEditable = "false";
  element.textContent = "";
}
async function startSuggestion() {
  //console.log("开始Suggestion")
  const autoCompletionEnabled = await getSetting('autoCompletion');
  if (!autoCompletionEnabled) return;
  resetSuggestion();

  const range = getCurrentRange();
  if (!range) return;

  const { preContext, postContext } = current_format.value === 'md' ? getContextFromCursor(range, props.rootNodeClass, 1000) : props.context;
  // console.log("上下文：")
  // console.log(preContext)
  // console.log(postContext)
  if (current_format.value === 'md') {
    // --- Vditor 插入方式 ---
    const sel = window.getSelection();
    const currentRange = sel.getRangeAt(0).cloneRange();
    suggestionEl = document.createElement("span");
    setElTheme(suggestionEl);
    range.insertNode(suggestionEl);

    sel.removeAllRanges();
    sel.addRange(currentRange);
  }  else if (current_format.value === 'tex') {
    // --- Monaco Overlay Widget 初始化 ---
    const editor = monaco.editor.getEditors()[0];
    if (!editor) return;
    updateGhostText(editor,"");
    const widgetDom = document.createElement("span");
    setElTheme(widgetDom);
    widgetDom.style.opacity = "0.5"; // 半透明
    widgetDom.style.pointerEvents = "none";

    const widgetId = 'ai-suggestion-widget';
    const overlayWidget = {
      getId: () => widgetId,
      getDomNode: () => widgetDom,
      getPosition: () => {
        const pos = editor.getPosition() || new monaco.Position(1, 1);
        return { position: pos, preference: [monaco.editor.ContentWidgetPositionPreference.EXACT] };
      }
    };

    editor.addContentWidget(overlayWidget);

    suggestionEl = { dom: widgetDom, widget: overlayWidget, editor };
  }
  // 生成 AI 文本
  generateAIText(preContext, postContext);
}


// 监听 themeState 变化
watch(() => themeState?.currentTheme?.type, (val) => {
  if (!suggestionEl) return;

  const cls = val === "dark" ? "ai-suggestion-dark" : "ai-suggestion";

  if (current_format.value === 'md') {
    suggestionEl.className = cls;

  } else if (current_format.value === 'tex') {
    suggestionEl.dom.className = cls;
  }
});


async function generateAIText(preContext, postContext) {
  let prompt = suggestionCompletionPrompt(preContext, postContext);
  
  const autoCompletionMode = await getSetting("autoCompletionMode");
  const enableKnowledgeBase = await getSetting("enableKnowledgeBase");
  try{
      generating = true;
      const { handle, done } = createAiTask(t(`aiSuggestion.tooltip`), prompt, aiText, ai_types.chat, t(`aiSuggestion.tooltip`), enableKnowledgeBase, {
      stream: !(autoCompletionMode === 'full')
  });
      currentAiHandle=handle;
  }
  catch(e){
    console.warn(e)
  }


}

watch(() => aiText.value, (newValue) => {
  //console.log('watch',newValue)
  if (aiText.value == "") {
    hideTooltip();
  } else {
    showTooltip();
  }

  if (current_format.value === 'md') {
    if (!suggestionEl) return;
    suggestionEl.textContent = newValue;

  } else if (current_format.value === 'tex') {
    const editor = monaco.editor.getEditors()[0];
    updateGhostText(editor,newValue);
    // // 更新 Overlay Widget 文本
    // suggestionEl.dom.textContent = newValue;

    // 重新布局 widget 以确保跟随光标
    //suggestionEl.editor.layoutContentWidget(suggestionEl.widget);
  }
});

/** 重置 */
function resetSuggestion() {
    if(currentAiHandle){
      cancelAiTask(currentAiHandle,false);
      currentAiHandle=null;
      generating = false;
    }
    hideTooltip();
  if (current_format.value === 'md' && suggestionEl instanceof HTMLElement) {
      if(suggestionEl){
        suggestionEl.remove();
    }
  } else if (current_format.value === 'tex') {
    const editor = monaco.editor.getEditors()[0];
    cancelGhostText(editor)
    // suggestionEl.dom.remove();
    // suggestionEl.dom=null;
    // suggestionEl.editor.removeContentWidget(suggestionEl.widget);
  }
  //suggestionEl = null;

  
  aiText.value = "";
  if (zwsp) {
    zwsp.remove();
    zwsp = null;
  }

  emits("reset");
}
/** 获取当前光标 */
function getCurrentRange() {
  const sel = window.getSelection();
  if (sel.rangeCount > 0) return sel.getRangeAt(0);
  return null;
}

/** 接受补全 */
function acceptSuggestion() {
  if (!suggestionEl) return;
  //const text = aiText.value;
  //删除suggestionEl元素
  if (current_format.value === 'md' && suggestionEl instanceof HTMLElement) {
      suggestionEl.remove();
  }
  else{
      const editor = monaco.editor.getEditors()[0];
      acceptGhostText(editor)
  }
  emits("accepted", aiText.value);
  resetSuggestion();
  //suggestionEl = null;
}

/** 取消补全 */
function cancelSuggestion() {
  //console.log("已取消")
  resetSuggestion();
  emits("cancelled");
}





/** 键盘事件处理 */
function handleVditorKeydown(e) {
  if (e.key === "Tab") {
    acceptSuggestion();
    e.preventDefault();
    return;

  } else if (e.key === "Escape") {
    cancelSuggestion();
    return;
  }
  // 定义需要忽略的控制键
  const ignoredKeys = new Set([
    "Control", "Shift", "Alt", "Meta", "CapsLock", "Insert", "Delete"
  ]);
  if (ignoredKeys.has(e.code)) {
    return;//如果是一些特殊的键，则不管
  }
  //对于没有列出的普通键，例如字母和数字、符号，则先取消，然后重新触发
  cancelSuggestion();
  const cancel_keys = ["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End","PageUp","PageDown","Delete"];
  if (cancel_keys.includes(e.key)) {
    return;
  }
  emits("triggerSuggestion");

}


// Monaco键盘事件处理
function handleMonacoKeydown(e) {
  const cancel_keys = ["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End","PageUp","PageDown","Delete"];
  if (cancel_keys.includes(e.code)) {
    cancelSuggestion();
    return;
  }

  const suggestionControlKeys = new Set([
    "Escape", "Tab"
  ]);
    if (suggestionControlKeys.has(e.code)) {
    //handleVditorKeydown({ key: e.code });
    return;
  }
  // 定义需要忽略的控制键
  const ignoredKeys = new Set([
    "Control", "Shift", "Alt", "Meta", "CapsLock", "Insert", "Delete"
  ]);
  if (ignoredKeys.has(e.code)) {
    return;//如果是一些特殊的键，则不管
  }


  //对于没有列出的普通键，例如字母和数字、符号，则先取消，然后重新触发
  cancelSuggestion();

  emits("triggerSuggestion");
}

function handleVditorMousedown(){
  cancelSuggestion();
}
onMounted(() => {
  eventBus.on("cancel-suggestion",()=>cancelSuggestion());
  if (current_format.value === 'tex') {
    eventBus.on('monaco-ready',()=>{
        const editor = monaco.editor.getEditors()[0];
        editor.onMouseDown(() => cancelSuggestion());
        editor.onKeyDown((e) =>handleMonacoKeydown(e));
      editor.addCommand(
        monaco.KeyCode.Tab,
        () => {
          if (aiText.value.trim()!=="") {
            acceptSuggestion();
            //console.log("已拦截")
          } else {
            // 手动插入制表符
            //console.log("插入制表符")
            editor.trigger('keyboard', 'type', { text: '\t' });
          }
        }
      );
      editor.addCommand(
      monaco.KeyCode.Escape,
        () => {
          cancelSuggestion();
        }
      );
      editor.onDidChangeCursorPosition((e) => {
        // e.position 是 monaco.Position 对象
        const line = e.position.lineNumber;
        const column = e.position.column;
        console.log("光标位置:", line, column);
      });
      
    })
  }
  else if (current_format.value === 'md'){
    window.addEventListener("keydown", handleVditorKeydown);
    const vditorEl = document.getElementById("vditor");
    if (vditorEl) {
      vditorEl.addEventListener("mousedown", handleVditorMousedown);
    }
  }
});

onBeforeUnmount(() => {
  if(current_format.value==='md'){
      window.removeEventListener("keydown", handleVditorKeydown);
      const vditorEl = document.getElementById("vditor");
      if (vditorEl) {
        vditorEl.removeEventListener("mousedown", handleVditorMousedown);
      }
  }

  hideTooltip();
  resetSuggestion();
});

/** 监听 trigger */
watch(
  () => props.trigger,
  (val) => {
    //console.log("trigger更新："+val)
    if (val) startSuggestion();
    else{
      cancelSuggestion();
    }
  }
);
</script>

<style scoped></style>
