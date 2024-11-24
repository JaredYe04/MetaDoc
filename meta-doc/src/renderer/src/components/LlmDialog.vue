<template>
    <div class="llm-dialog aero-div">
      <!-- 顶部标题 -->
      <div class="llm-dialog-header">
        <span>{{props.title?props.title:"AI助手"}}</span>
        <el-button circle size="mini" @click="closeDialog" class="aero-btn"><el-icon><Close /></el-icon></el-button>
      </div>
  
      <!-- 文本框内容 -->
      <el-input
        type="textarea"
        v-model="aiResponse"
        rows="10"
        placeholder="AI生成的内容会显示在这里"
        readonly
        class="llm-dialog-input aero-input"
        :autosize="{ minRows: defaultInputSize, maxRows: 10 }"
      ></el-input>
  
      <!-- 按钮组 -->
      <div class="llm-dialog-footer">
        <el-button type="info" @click="handleReset" :loading="loading" class="aero-btn" circle ><el-icon v-if="!loading"><Refresh /></el-icon></el-button>
        <el-button type="success" @click="handleAccept" :disabled="loading" class="aero-btn" circle >
          <el-icon><Check /></el-icon>
        </el-button>
      </div>
    </div>
  </template>

<script setup>
import { ref, watch, onMounted } from "vue";
import { ElMessage } from "element-plus";
import { answerQuestionStream } from "../utils/llm-api";
import "../assets/aero-div.css";
import "../assets/aero-btn.css";
import "../assets/aero-input.css";
import { Close } from "@element-plus/icons-vue";
// 定义 Props 和 Emits
const props = defineProps({
  title: {
    type: String
  },
  visible: {
    type: Boolean,
    required: true,
  },
  prompt: {
    type: String,
    required: true,
  },
  llmConfig: {
    type: Object,
    default: () => ({}),
  },
  defaultText: {
    type: String,
    default: "",
  },
  defaultInputSize: {
    type: Number,
    default: 1,
  },
});

const emit = defineEmits(["update:visible", "llm-content-accept"]);

// 响应式变量
const aiResponse = ref(props.defaultText); // LLM生成的内容
const loading = ref(false);

// 调用 LLM 生成内容
async function generateContent() {
  //console.log(props.prompt)
  if (!props.prompt) {
    ElMessage.warning("提示词为空，无法生成内容！");
    return;
  }
  loading.value = true;
  try {
    await answerQuestionStream(props.prompt, aiResponse, props.llmConfig);
  } catch (error) {
    ElMessage.error("生成内容失败，请重试！");
    console.error(error);
  } finally {
    loading.value = false;
  }
}

// 重置生成内容
function handleReset() {
  generateContent();
}

// 接受生成的内容
function handleAccept() {
  emit("llm-content-accept", aiResponse.value);
}

// 关闭悬浮组件
function closeDialog() {
  emit("update:visible", false);
}

// 监听 `visible` 的变化
watch(
  () => props.visible,
  (newVal) => {
    if (newVal) {
      //console.log("LlmDialog visible");
      generateContent(); // 显示时自动生成内容
    } else {
      aiResponse.value = ""; // 隐藏时重置内容
    }
  }
);

// 组件挂载时执行
onMounted(() => {
  aiResponse.value = props.defaultText;
});
</script>
<style scoped>
.llm-dialog {
  position:fixed;
  z-index: 9999;
  width: 200px;
  max-height: 400px;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  color: black;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  padding: 15px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.llm-dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: bold;
}

.llm-dialog-input {
  width: 100%;
}

.llm-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>