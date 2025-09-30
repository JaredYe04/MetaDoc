<template>
    <!-- ghost span 的渲染由 JS 直接挂载到 targetEl -->
    <div v-if="false"></div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount,watchEffect } from "vue";
import "../assets/ai-suggestion.css";
import { themeState } from "../utils/themes";
import { ElTooltip } from "element-plus";
import { h, render } from "vue";
import { useI18n } from 'vue-i18n'
import { suggestionCompletionPrompt } from "../utils/prompts";
import { ai_types, createAiTask } from "../utils/ai_tasks";
import { getSetting } from "../utils/settings";
const { t } = useI18n()
const props = defineProps({
    targetEl: { type: Object, required: true }, // 宿主元素 (contenteditable 或 textarea overlay)
    trigger: { type: Boolean, default: false }, // 是否触发补全
    rootNodeClass: { type: String, required: true } // 根节点
});

const emits = defineEmits(["accepted", "cancelled", "reset"]);

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
  if (!suggestionEl) return;
  if(tooltipEl)return; // 已存在则不重复创建
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

  // 定位到 suggestionEl 上方
  const rect = suggestionEl.getBoundingClientRect();
  tooltipEl.style.left = rect.left - 10 + "px";
  tooltipEl.style.top = rect.top - rect.height - 20 + "px";
}

function hideTooltip() {
  if (tooltipEl) {
    tooltipEl.remove();
    tooltipEl = null;
  }
}
function setElTheme(suggestionEl){
  // 根据 themeState 动态设置 class
  if (themeState?.currentTheme?.type === "dark") {
    suggestionEl.className = "ai-suggestion-dark";
  } else {
    suggestionEl.className = "ai-suggestion";
  }

  suggestionEl.contentEditable = "false";
  suggestionEl.textContent = "";
}
async function startSuggestion() {
  const autoCompletionEnabled=await getSetting('autoCompletion');
  if(!autoCompletionEnabled)return;
  resetSuggestion();

  const range = getCurrentRange();
  if (!range) return;

  const { preContext, postContext } = getContextFromCursor(range, props.rootNodeClass, 1000);

  suggestionEl = document.createElement("span");
  setElTheme(suggestionEl);

  const sel = window.getSelection();
  const currentRange = sel.getRangeAt(0).cloneRange();

  range.insertNode(suggestionEl);

  sel.removeAllRanges();
  sel.addRange(currentRange);

  // 生成 AI 文本
  generateAIText(preContext, postContext);
}


// 监听 themeState 变化，实时更新 class
watch(
  () => themeState?.currentTheme?.type,
  (val) => {
    if (!suggestionEl) return;
    if (val === "dark") {
      suggestionEl.className = "ai-suggestion-dark";
    } else {
      suggestionEl.className = "ai-suggestion";
    }
  }
);

async function generateAIText(preContext, postContext) {
  
  let prompt=suggestionCompletionPrompt(preContext, postContext);
  const autoCompletionMode=await getSetting("autoCompletionMode");
  const enableKnowledgeBase=await getSetting("enableKnowledgeBase");
  createAiTask(t(`aiSuggestion.tooltip`), prompt, aiText,ai_types.chat,t(`aiSuggestion.tooltip`),enableKnowledgeBase,{
    stream:!(autoCompletionMode==='full')
  });

}

watch(() => aiText.value, (newValue) => {
  if (newValue.trim() === "") {
    hideTooltip();
  }
  else{
    showTooltip();
  }
  //console.log("AI Suggestion Text:", newValue);
  if (suggestionEl) {
    suggestionEl.textContent = newValue;
  }
});


/** 获取当前光标 */
function getCurrentRange() {
    const sel = window.getSelection();
    if (sel.rangeCount > 0) return sel.getRangeAt(0);
    return null;
}

/** 接受补全 */
function acceptSuggestion() {
    if (!suggestionEl) return;
    const text = suggestionEl.textContent;
    //删除suggestionEl元素
    suggestionEl.remove();
    suggestionEl = null;
    resetSuggestion();
    emits("accepted", text);
}

/** 取消补全 */
function cancelSuggestion() {
    resetSuggestion();
    emits("cancelled");
}

/** 重置 */
function resetSuggestion() {
    if (suggestionEl) {
        suggestionEl.remove();
        suggestionEl = null;
    }
    generating = false;
    aiText.value = "";
    if(zwsp){
      zwsp.remove();
      zwsp = null;
    }
    //hideTooltip();
    emits("reset");
}

/** 键盘事件处理 */
function handleKeydown(e) {
    if (!suggestionEl) return;

    if (e.key === "Tab") {
        // 只有 suggestion 存在时阻止默认Tab行为
        e.preventDefault();
        acceptSuggestion();
    } else if (e.key === "Escape") {
        cancelSuggestion();
    } else if (
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key) ||
        e.key.length === 1
    ) {
        resetSuggestion();
    }
}

onMounted(() => {
    window.addEventListener("keydown", handleKeydown);
});

onBeforeUnmount(() => {
    window.removeEventListener("keydown", handleKeydown);
    resetSuggestion();
});

/** 监听 trigger */
watch(
    () => props.trigger,
    (val) => {
        if (val) startSuggestion();
    }
);
</script>

<style scoped>

</style>
