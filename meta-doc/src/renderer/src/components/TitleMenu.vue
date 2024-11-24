<template>
  <div class="aero-div" :style="menuStyles" @mousedown="onMouseDown">
    <p style="font-weight: bold;"  @mousedown.stop> {{ props.title ? props.title : "标题" }}

      <el-button circle size="mini" @click="$emit('close')" class="aero-btn" style="float: inline-end;" @mousedown.stop>
        <el-icon>
          <Close />
        </el-icon>
      </el-button>
    </p>
    <MarkdownItEditor :source="articleContent" v-if="!generated && !generating" class="md-container" @mousedown.stop/>
    <MarkdownItEditor :source="generatedText" v-if="generated || generating" class="md-container" @mousedown.stop/>
    <!-- <p class="article-content">{{ articleContent }}</p> -->
    <el-autocomplete v-model="userPrompt" :fetch-suggestions="querySearch" clearable class="inline-input"
      style="color: black; opacity: 1;" placeholder="请输入需求" @mousedown.stop/>

      <div @mousedown.stop >
        <el-button circle type="primary" @click="generate" :disabled="generating || userPrompt.length === 0" ><el-icon>
        <Promotion />
      </el-icon></el-button>
    <el-button circle type="info" @click="reset" v-if="generated"><el-icon>
        <RefreshLeft />
      </el-icon></el-button>
    <el-button circle type="success" @click="accept" v-if="generated"><el-icon>
        <Check />
      </el-icon></el-button>
      </div>

  </div>
</template>

<script setup>
import { ElButton, ElDialog } from 'element-plus' // 引入 Element Plus 按钮和弹框组件
import MarkdownItEditor from 'vue3-markdown-it';
import { computed, onMounted } from 'vue';
import { latest_view, searchNode } from '../utils/common-data';
import { sync, current_outline_tree } from '../utils/common-data';
import { ref, watch } from 'vue';
import { max } from 'd3';
import { sectionChangePrompt } from '../utils/prompts';
import { answerQuestionStream } from '../utils/llm-api';
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
  treeJson: {
    type: String,
    required: true
  }
})
const presetPrompts = ref([
  {
    value: '扩写这段文字，使得字数变得更多，内容更丰富翔实',
    label: '扩写这段文字'
  },
  {
    value: '精简这段文字，使得这段文字更加精炼简介',
    label: '精简这段文字'
  },
  {
    value: '优化文笔，使得这段文字更加优美，可以使用各种修辞手法',
    label: '优化一下文笔'
  },
  {
    value: '根据整篇文章的大意内容，生成本章节的文字内容，要求丰富翔实',
    label: '生成本节内容'
  },
  {
    value: '修改文本中所有的语病、错别字、不妥当之处，保留原意',
    label: '校对修改'
  }
])
const emit = defineEmits(["accept"]);

const accept = () => {
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
  emit('accept', generatedText.value);
  reset();

}
const generate = async () => {
  generating.value = true;

  const prompt = sectionChangePrompt(props.treeJson, articleContent.value, props.title, userPrompt.value);
  await answerQuestionStream(prompt, generatedText);
  generating.value = false;

  generated.value = true;
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
  maxWidth: '600px',
  zIndex: 1000, // 保证层级
  color: 'black'
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