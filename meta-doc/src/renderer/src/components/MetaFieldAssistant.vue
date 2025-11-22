<template>
  <div
    class="meta-assistant"
    :style="{
      backgroundColor: themeState.currentTheme.background2nd,
      color: themeState.currentTheme.textColor,
    }"
  >
    <div class="meta-assistant__header">
      <span :style="{ color: themeState.currentTheme.textColor }">
        {{ title || $t('llmDialog.aiAssistant') }}
      </span>
      <el-tooltip :content="$t('llmDialog.closeMenuTooltip')" placement="top">
        <el-button circle plain size="small" @click="closeDialog" type="danger">
          <el-icon><Close /></el-icon>
        </el-button>
      </el-tooltip>
    </div>

    <el-input
      type="textarea"
      v-model="aiResponse"
      class="meta-assistant__input"
      :autosize="{ minRows: defaultInputSize, maxRows: 10 }"
      :style="{ color: themeState.currentTheme.textColor }"
      :placeholder="$t('llmDialog.inputPlaceholder')"
    />

    <div class="meta-assistant__footer">
      <el-tooltip v-if="prompt && allowGenerate" :content="$t('llmDialog.generateAITooltip')" placement="left" style="z-index: 1001;">
        <el-button type="info" @click="handleGenerate" :loading="loading" circle>
          <el-icon v-if="!loading"><Refresh /></el-icon>
        </el-button>
      </el-tooltip>

      <el-tooltip :content="$t('llmDialog.acceptTooltip')" placement="left" style="z-index: 1001;">
        <el-button type="success" @click="handleAccept" :disabled="loading" circle>
          <el-icon><Check /></el-icon>
        </el-button>
      </el-tooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Close, Refresh, Check } from '@element-plus/icons-vue';
import { themeState } from '../utils/themes';
import { useI18n } from 'vue-i18n';
import { ai_types, createAiTask } from '../utils/ai_tasks';
import { getSetting } from '../utils/settings';

type ValueType = 'text' | 'array';

const props = withDefaults(defineProps<{
  title?: string;
  visible: boolean;
  prompt: string;
  defaultValue?: string | string[];
  valueType?: ValueType;
  defaultInputSize?: number;
  autoGenerate?: boolean;
  allowGenerate?: boolean;
}>(), {
  title: '',
  defaultValue: '',
  valueType: 'text',
  defaultInputSize: 1,
  autoGenerate: true,
  allowGenerate: true,
});

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'accept', value: string | string[]): void;
}>();

const { t } = useI18n();

const formatInitialValue = (value: string | string[], type: ValueType): string => {
  if (type === 'array') {
    if (Array.isArray(value)) {
      return value.join('\n');
    }
    try {
      const parsed = JSON.parse(value ?? '');
      if (Array.isArray(parsed)) {
        return parsed.join('\n');
      }
    } catch {
      // ignore
    }
  }
  return typeof value === 'string' ? value : '';
};

const aiResponse = ref(formatInitialValue(props.defaultValue ?? '', props.valueType));
const loading = ref(false);

const parseArrayValue = (value: string): string[] => {
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch {
    // ignore json parse error
  }
  return trimmed
    .split(/[\n,，;；]+/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const handleAccept = () => {
  const value =
    props.valueType === 'array' ? parseArrayValue(aiResponse.value) : aiResponse.value;
  emit('accept', value);
  emit('update:visible', false);
};

const closeDialog = () => {
  emit('update:visible', false);
};

const generateContent = async () => {
  if (!props.prompt) {
    ElMessage.warning(t('llmDialog.promptEmptyWarning'));
    return;
  }
  loading.value = true;
  try {
    const enableKnowledgeBase = await getSetting('enableKnowledgeBase');
    await createAiTask(
      props.title,
      props.prompt,
      aiResponse,
      ai_types.answer,
      props.title,
      enableKnowledgeBase,
    ).done;
  } catch (error) {
    ElMessage.error(t('llmDialog.generateFailedError'));
    console.error(error);
  } finally {
    loading.value = false;
  }
};

const handleGenerate = () => {
  if (!props.allowGenerate) return;
  generateContent();
};

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      aiResponse.value = formatInitialValue(props.defaultValue ?? '', props.valueType);
      if (props.autoGenerate && props.allowGenerate) {
        generateContent();
      }
    } else {
      aiResponse.value = '';
    }
  },
);

watch(
  () => props.defaultValue,
  (value) => {
    if (!props.visible) {
      aiResponse.value = formatInitialValue(value ?? '', props.valueType);
    }
  },
);
</script>

<style scoped>
.meta-assistant {
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

.meta-assistant__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: bold;
}

.meta-assistant__input {
  width: 100%;
}

.meta-assistant__footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>

