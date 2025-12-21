<template>
  <div class="aero-div" :style="menuStyles" @mousedown.stop="onMouseDown">

    <div style="width: 100% ;height: fit-content; align-items: end; ">
      <el-button 
        circle plain
        size="small" 
        type="danger" 
        @click="handleClose"
        class="aero-btn" 
        style="float: inline-start;"
        @mousedown.stop
      >
      </el-button>
      <p style="font-weight: bold;" @mousedown.stop>
        {{ props.word ? props.word : t('wordCloudDetail.defaultWord') }}
      </p>
      <p style="font-size: 12px; color: #666666;" @mousedown.stop>
        {{ t('wordCloudDetail.frequency') }}: {{ props.frequency }}
      </p>
    </div>
    <el-scrollbar class="md-container" v-if="generated || generating" @mousedown.stop
      style="  max-height: 20vh; padding: 5px; margin: 0;">
      <MarkdownItEditor :source="generatedText" />
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { ElButton, ElDialog } from 'element-plus' // 引入 Element Plus 按钮和弹框组件
// @ts-ignore - vue3-markdown-it没有类型定义
import MarkdownItEditor from 'vue3-markdown-it';
import { computed, onMounted, ref, watch } from 'vue';
import { explainWordPrompt } from '../utils/prompts';
import type { VisualizeAdapter } from '../utils/visualize-adapters';
import { themeState } from '../utils/themes';
import { useActiveDocument } from '../composables/useActiveDocument';
import { searchNode } from '../utils/outline-helpers';
const props = defineProps({
  word: {
    type: String,
    required: true
  },
  frequency: {
    type: Number,
    required: true,
  },
  position: {
    type: Object,
    required: true,
  },
  path: {
    type: String,
    required: false,
  },
  documentContent: {
    type: String,
    required: false,
    default: '',
  },
  adapter: {
    type: Object,
    required: false,
    default: null,
  },
})

// onMounted(() => {
//   reset();
//   generate();
// })
const emit = defineEmits(["accept", 'close']);
import { useI18n } from 'vue-i18n'
import { ai_types, createAiTask } from '../utils/ai_tasks';
import { getSetting } from '../utils/settings';
import type { AIDialogMessage } from '@/types';
const { t } = useI18n()

const handleClose = () => {
  emit('close');
};
const generate = async () => {
  generating.value = true;
  
  // 搜索词语在文档中的上下文
  let contexts: string[] = [];
  if (props.adapter && props.documentContent && props.word) {
    try {
      console.log('[WordCloudDetail] 开始搜索上下文:', {
        word: props.word,
        documentContentLength: props.documentContent.length,
        adapter: props.adapter.getFormat()
      });
      
      contexts = props.adapter.searchWordContexts(
        props.documentContent,
        props.word,
        3, // 最多3个上下文
        200 // 每个上下文200字符
      );
      
      console.log('[WordCloudDetail] 找到的上下文:', {
        count: contexts.length,
        contexts: contexts
      });
    } catch (error) {
      console.error('[WordCloudDetail] 搜索上下文失败:', error);
    }
  } else {
    console.warn('[WordCloudDetail] 无法搜索上下文:', {
      hasAdapter: !!props.adapter,
      hasDocumentContent: !!props.documentContent,
      hasWord: !!props.word
    });
  }
  
  const prompt = explainWordPrompt(props.word, contexts);
  console.log('[WordCloudDetail] 生成的提示词:', prompt);
  
  const messages: AIDialogMessage[] = [{
    role: 'user',
    content: prompt,
  }]
  const { handle, done } = createAiTask(props.word, messages, generatedText, ai_types.chat, 'word-cloud-detail');

  try {
    await done;
  } catch (err) {
    console.warn('任务失败或取消：', err);
  } finally {
    generated.value = true;
    generating.value = false;
  }
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
const { activeDocument } = useActiveDocument();
const currentOutline = computed(() => activeDocument.value?.outline ?? null);
const articleContent = ref(''); // 定义 articleContent 变量
const menuStyles = computed(() => ({
  position: 'absolute' as const,
  top: `${menuPosition.value.top}px`,
  left: `${menuPosition.value.left}px`,
  border: '1px solid rgba(0, 0, 0, 0.1)',
  padding: '12px',
  boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.1)',
  maxWidth: '1000px',
  minWidth: '300px',
  zIndex: 1000, // 保证层级
  color: themeState.currentTheme.textColor2,
  backdropFilter: 'blur(8px)',
  background: themeState.currentTheme.titleMenuBackground,
  borderRadius: '4px', // 更小的圆角半径
}));
const refreshContent = () => {
  menuPosition.value = {
    top: props.position.top,
    left: props.position.left,
  }
  reset();
  generate();
  if (props.path && currentOutline.value) {
    const node = searchNode(props.path, currentOutline.value);
    articleContent.value = node?.text ?? '';
  } else {
    articleContent.value = '';
  }
}
//如果props的word变了，触发refreshContent
watch(() => props.word, (newVal, oldVal) => {
  refreshContent();
})

const menuPosition = ref({ top: props.position.top, left: props.position.left });
const isDragging = ref(false);
const dragStart = ref({ x: 0, y: 0 });
const onMouseDown = (event: { clientX: number; clientY: number; }) => {
  isDragging.value = true;
  dragStart.value = {
    x: event.clientX - menuPosition.value.left,
    y: event.clientY - menuPosition.value.top,
  };
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
};

const onMouseMove = (event: { clientY: number; clientX: number; }) => {
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

<style scoped>
.aero-div {
  border-radius: 4px; /* 更小的圆角半径，更扁平化 */
}

.md-container {
  max-height: 400px;
  overflow: auto;
  padding: 10px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  backdrop-filter: blur(8px);
  border-radius: 4px; /* 更小的圆角半径 */
  margin-top: 8px;
}
</style>