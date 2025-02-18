<template>
  <div class="aero-div" :style="menuStyles" @mousedown.stop="onMouseDown">

    <div style="width: 100% ;height: fit-content; align-items: end; ">
      <el-button circle size="small" type="danger" @click="$emit('close')" class="aero-btn" style="float: inline-start;"
        @mousedown.stop>
      </el-button>
      <p style="font-weight: bold;" @mousedown.stop  > {{ props.word ? props.word : "词语" }}</p>
      <p style="font-size: 12px; color: #666666;" @mousedown.stop>词频: {{ props.frequency }}</p>
    </div>
    <el-scrollbar class="md-container"  v-if="generated || generating" @mousedown.stop style="  max-height: 20vh; padding: 5px; margin: 0;">
      <MarkdownItEditor :source="generatedText" />
    </el-scrollbar>
  </div>
</template>

<script setup>
import { ElButton, ElDialog } from 'element-plus' // 引入 Element Plus 按钮和弹框组件
import MarkdownItEditor from 'vue3-markdown-it';
import { computed, onMounted } from 'vue';
import { latest_view, searchNode } from '../utils/common-data';
import { sync, current_outline_tree } from '../utils/common-data';
import { ref, watch } from 'vue';
import { max, min } from 'd3';
import { explainWordPrompt, sectionChangePrompt } from '../utils/prompts';
import { answerQuestionStream } from '../utils/llm-api';
import eventBus from '../utils/event-bus';
import { generateMarkdownFromOutlineTree } from '../utils/md-utils';
import {  defineProps, defineEmits } from 'vue';
import { themeState } from '../utils/themes';
const props = defineProps({
  word: {
    type: String,
    required: true
  },
  frequency: {
    type:Number,
    required: true,
  },
  position: {
    type: Object,
    required: true,
  },
})

// onMounted(() => {
//   reset();
//   generate();
// })
const emit = defineEmits(["accept",'close']);


const generate = async () => {
  generating.value = true;
  const prompt = explainWordPrompt(props.word);
  await answerQuestionStream(prompt, generatedText);
  generating.value = false;
  generated.value = true;
}

const reset = () => {
  generated.value = false;
  generatedText.value = '';
}
const generating = ref(false);
const userPrompt = ref('');
const generatedText = ref('');
const generated = ref(false);
// 定义计算属性 menuStyles
const articleContent = ref(''); // 定义 articleContent 变量
const menuStyles = computed(() => ({
  position: 'absolute',
  top: `${menuPosition.value.top}px`,
  left: `${menuPosition.value.left}px`,
  border: '1px solid #ccc',
  padding: '10px',
  boxShadow: '0px 2px 10px rgba(0, 0, 0, 0.2)',
  maxWidth: '1000px',
  minWidth: '300px',
  zIndex: 1000, // 保证层级
  color: themeState.currentTheme.textColor2,
  backdropFilter: 'blur(5px)',
  background:  themeState.currentTheme.titleMenuBackground,
}));
const refreshContent = () => {
  menuPosition.value={
    top: props.position.top,
    left: props.position.left,
  }
  reset();
  generate();
  //articleContent.value = searchNode(props.path, current_outline_tree.value).text;
}
//如果props的word变了，触发refreshContent
watch(() => props.word, (newVal, oldVal) => {
  refreshContent();
})

const menuPosition = ref({ top: props.position.top, left: props.position.left });
const isDragging = ref(false);
const dragStart = ref({ x: 0, y: 0 });
const onMouseDown = (event) => {
  isDragging.value = true;
  dragStart.value = {
    x: event.clientX - menuPosition.value.left,
    y: event.clientY - menuPosition.value.top,
  };
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
};

const onMouseMove = (event) => {
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
onMounted(() => {
  refreshContent();
})
watch(() => props.path, (newVal, oldVal) => {
  //refreshContent();
})

</script>

<style>
.md-container {
  max-height: 400px;
  overflow: auto;
  padding: 10px;
  border: 1px solid #cccccc36;
  backdrop-filter: blur(20px) brightness(1.05);
  /*圆角边框 */
  border-radius: 10px;

}

.aero-div:hover {
  transform: scale(1);
  /* 微缩放 */
}
</style>