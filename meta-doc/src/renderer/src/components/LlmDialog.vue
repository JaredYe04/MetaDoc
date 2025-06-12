<template>
  <div class="llm-dialog aero-div">
    <!-- 顶部标题 -->
    <div class="llm-dialog-header">
      <span :style="{color:themeState.currentTheme.textColor}">
        {{ props.title ? props.title : $t('llmDialog.aiAssistant') }}
      </span>
      <el-tooltip :content="$t('llmDialog.closeMenuTooltip')" placement="top">
        <el-button circle size="small" @click="closeDialog" class="aero-btn" type="danger">
          <el-icon><Close /></el-icon>
        </el-button>
      </el-tooltip>
    </div>

    <!-- 文本框内容 -->
    <el-input
      type="textarea"
      v-model="aiResponse"
      rows="10"
      :placeholder="$t('llmDialog.inputPlaceholder')"
      class="llm-dialog-input"
      :autosize="{ minRows: defaultInputSize, maxRows: 10 }"
      :style="{ color: themeState.currentTheme.textColor }"
    ></el-input>

    <!-- 按钮组 -->
    <div class="llm-dialog-footer">
      <el-tooltip :content="$t('llmDialog.generateAITooltip')" placement="left" style="z-index: 1001;">
        <el-button
          type="info"
          @click="handleReset"
          :loading="loading"
          class="aero-btn"
          circle
          v-if="props.prompt"
        >
          <el-icon v-if="!loading"><Refresh /></el-icon>
        </el-button>
      </el-tooltip>

      <el-tooltip :content="$t('llmDialog.acceptTooltip')" placement="left" style="z-index: 1001;">
        <el-button type="success" @click="handleAccept" :disabled="loading" class="aero-btn" circle>
          <el-icon><Check /></el-icon>
        </el-button>
      </el-tooltip>
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
import { themeState } from "../utils/themes";
import { color } from "d3";
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

import { useI18n } from 'vue-i18n'

const { t } = useI18n()

async function generateContent() {
  if (!props.prompt) {
    ElMessage.warning(t('llmDialog.promptEmptyWarning'))
    return
  }
  loading.value = true
  try {
    await answerQuestionStream(props.prompt, aiResponse, props.llmConfig)
  } catch (error) {
    ElMessage.error(t('llmDialog.generateFailedError'))
    console.error(error)
  } finally {
    loading.value = false
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
  position: fixed;
  z-index: 1000;
  width: 15%;
  max-height: 400px;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.5);
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