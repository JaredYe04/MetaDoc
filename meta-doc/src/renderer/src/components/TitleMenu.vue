<template>
  <div class="aero-div" :style="menuStyles" @mousedown.prevent="onMouseDown">

    <div style="width: 100%; height: fit-content; align-items: end; padding-bottom: 10px;">
      <el-button
        circle
        size="small"
        type="danger"
        @click="$emit('close')"
        class="aero-btn"
        style="float: inline-start;"
        @mousedown.prevent
      >
      </el-button>
    </div>

    <p style="font-weight: bold;" @mousedown.stop>
      {{ props.title ? props.title : t('titleMenu.defaultTitle') }}
    </p>

    <MarkdownItEditor
      class="md-container"
      v-if="!generated && !generating"
      @mousedown.stop
      :source="articleContent"
    />

    <MarkdownItEditor
      class="md-container"
      v-if="generated || generating"
      @mousedown.stop
      :source="generatedText"
    />

    <el-autocomplete
      v-model="userPrompt"
      :fetch-suggestions="querySearch"
      clearable
      class="inline-input"
      resize="none"
      style="color: black; opacity: 1;"
      :placeholder="t('titleMenu.inputPlaceholder')"
      @mousedown.stop
    />

    <div @mousedown.stop style="align-items: center; margin-top: 20px;">
      <el-slider
        v-model="context_mode"
        :step="1"
        :min="0"
        :max="2"
        style="width: 60%; display: inline-block; align-self: center; margin-left: 20%; margin-right: 20%;"
        show-stops
        :marks="{
          0: t('titleMenu.contextMarks.none'),
          1: t('titleMenu.contextMarks.chapter'),
          2: t('titleMenu.contextMarks.full')
        }"
        :format-tooltip="formatTooltip"
      />
    </div>

    <div @mousedown.stop>
      <el-tooltip :content="t('titleMenu.tooltips.generate')" placement="top">
        <el-button
          circle
          type="primary"
          @click="generate"
          :disabled="generating || generated || userPrompt.length === 0"
        >
          <el-icon><Promotion /></el-icon>
        </el-button>
      </el-tooltip>

      <el-tooltip :content="t('titleMenu.tooltips.reset')" placement="top" v-if="generated">
        <el-button circle type="info" @click="reset">
          <el-icon><RefreshLeft /></el-icon>
        </el-button>
      </el-tooltip>

      <el-tooltip :content="t('titleMenu.tooltips.chat')" placement="top" v-if="generated">
        <el-button circle type="info" @click="chat">
          <el-icon><ChatLineRound /></el-icon>
        </el-button>
      </el-tooltip>

      <el-tooltip :content="t('titleMenu.tooltips.acceptReplace')" placement="top" v-if="generated">
        <el-button circle type="success" @click="accept(false)">
          <el-icon><Check /></el-icon>
        </el-button>
      </el-tooltip>

      <el-tooltip :content="t('titleMenu.tooltips.acceptAppend')" placement="top" v-if="generated">
        <el-button circle type="success" @click="accept(true)">
          <el-icon><Plus /></el-icon>
        </el-button>
      </el-tooltip>
    </div>

  </div>
</template>

<script setup>
import { ElButton, ElDialog } from 'element-plus' // 引入 Element Plus 按钮和弹框组件
import MarkdownItEditor from 'vue3-markdown-it';
import { computed, onMounted } from 'vue';
import { addDialog, defaultAiChatMessages, latest_view, searchNode } from '../utils/common-data';
import { sync, current_outline_tree } from '../utils/common-data';
import { ref, watch } from 'vue';
import { max } from 'd3';
import { sectionChangePrompt } from '../utils/prompts';

import eventBus from '../utils/event-bus';
import { generateMarkdownFromOutlineTree } from '../utils/md-utils';
import { defineProps, defineEmits } from 'vue';
import { themeState } from '../utils/themes';
import { current_article } from '../utils/common-data';
import { Plus } from '@element-plus/icons-vue';
import { useI18n } from 'vue-i18n'
import { ai_types, createAiTask } from '../utils/ai_tasks';

const { t } = useI18n()

function formatTooltip(val) {
  if (val === 0) {
    return t('titleMenu.contextTooltips.none')
  }
  if (val === 1) {
    return t('titleMenu.contextTooltips.chapter')
  }
  if (val === 2) {
    return t('titleMenu.contextTooltips.full')
  }
}
const props = defineProps({
  title: {
    type: String,
    required: true
  },
  position: {
    type: Object,
    required: true,
  },
  path: {
    type: String,
    required: true
  },
  tree: {
    type: Object,
    required: true
  }
})
const context_mode = ref(1);
const presetPrompts = ref([
  {
    value: '扩写这段文字',
    label: '扩写这段文字'
  },
  {
    value: '精简这段文字',
    label: '精简这段文字'
  },
  {
    value: '优化文笔，使得这段文字更加优美',
    label: '优化一下文笔'
  },
  {
    value: '根据整篇文章的大意内容，生成本章节的文字内容，要求丰富翔实',
    label: '生成本节内容'
  },
  {
    value: '修改文本中所有的语病、错别字、不妥当之处，保留原意',
    label: '校对修改'
  },
  {
    value: '根据本段内容，生成一张mermaid流程图，使用代码框包裹'
  },
  {
    value: '根据文章结构，生成一张mermaid思维导图，使用代码框包裹'
  }
])

const emit = defineEmits(["accept"]);

const accept = (append=false) => {
  //searchNode(props.path, current_outline_tree.value).text=generatedText.value;
  // latest_view.value='outline';
  // sync();
  //如果最后一位不是换行符，加上换行符
  if (generatedText.value[generatedText.value.length - 1] !== '\n') {
    generatedText.value += '\n';
  }

  //如果第一行是标题，去掉标题
  if (generatedText.value.startsWith('#')) {
    generatedText.value = generatedText.value.split('\n').slice(1).join('\n');
  }
  articleContent.value = generatedText.value;
  emit('accept',{
    append: append,
    content: generatedText.value,
  });
  reset();

}

const generate = async () => {
  generating.value = true;
  const outline = generateMarkdownFromOutlineTree(props.tree);

  const prompt = sectionChangePrompt(outline, articleContent.value, props.title, userPrompt.value, context_mode.value, current_article.value);
  //console.log(prompt);
  const { handle, done } = createAiTask(props.title, prompt, generatedText, ai_types.answer, 'title-menu');
  generating.value = true;
  generated.value = false;

  try {
    await done;
  } catch (err) {
    console.warn('任务失败或取消：', err);
  } finally {
    generated.value = true;
    generating.value = false;
  }

  // generating.value = false;

  // generated.value = true;
}
const chat = async () => {
  const outline = generateMarkdownFromOutlineTree(props.tree);
  const prompt = sectionChangePrompt(outline, articleContent.value, props.title, userPrompt.value, context_mode.value, current_article.value);
  let messages = [...defaultAiChatMessages]
  messages.push({
    role: 'user',
    content: prompt
  })
  messages.push({
    role: 'assistant',
    content: generatedText.value
  })
  const newDialog = {
    title: props.title,
    messages: messages
  };
  addDialog(newDialog,true)
  eventBus.emit('ai-chat');//触发开始长对话事件

}

const querySearch = (queryString, cb) => {
  const createFilter = (queryString) => {
    return (preset) => {
      //模糊匹配，只要包含就行
      return preset.value.toLowerCase().includes(queryString.toLowerCase())
    }
  }
  //console.log(queryString)
  const results = queryString
    ? presetPrompts.value.filter(createFilter(queryString))
    : presetPrompts.value
  // call callback function to return suggestions
  cb(results)
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
  minWidth: '500px',
  maxWidth: '800px',
  zIndex: 1000, // 保证层级
  color: themeState.currentTheme.textColor2,
  backdropFilter: 'blur(5px)',
  background: themeState.currentTheme.titleMenuBackground,
}));
const refreshContent = () => {
  articleContent.value = searchNode(props.path, current_outline_tree.value).text;
}

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
  refreshContent();
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