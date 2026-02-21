<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="emit('update:visible', $event)"
    :title="title || $t('llmDialog.aiAssistant')"
    width="30%"
    class="meta-assistant-dialog"
    :style="{
      '--el-dialog-bg-color': themeState.currentTheme.background2nd,
      '--el-dialog-text-color': themeState.currentTheme.textColor
    }"
  >
    <el-scrollbar class="meta-assistant__input-scroll" max-height="300px">
      <div class="meta-assistant__input-wrapper">
        <Textarea
          v-model="aiResponse"
          :rows="defaultInputSize"
          class="meta-assistant__input w-full"
          :style="{ color: themeState.currentTheme.textColor }"
          :placeholder="$t('llmDialog.inputPlaceholder')"
        />
      </div>
    </el-scrollbar>

    <template #footer>
      <div class="meta-assistant__footer">
        <Tooltip v-if="prompt && allowGenerate">
          <TooltipTrigger as-child>
            <Button type="info" @click="handleGenerate" :loading="loading" circle>
              <el-icon v-if="!loading"><Refresh /></el-icon>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">
            <p>{{ $t('llmDialog.generateAITooltip') }}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger as-child>
            <Button type="success" @click="handleAccept" :disabled="loading" circle>
              <el-icon><Check /></el-icon>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">
            <p>{{ $t('llmDialog.acceptTooltip') }}</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, Check } from '@element-plus/icons-vue'
import { Button } from '@renderer/components/ui/button'
import { Textarea } from '@renderer/components/ui/textarea'
import { themeState } from '../utils/themes'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@renderer/components/ui/tooltip'
import { useI18n } from 'vue-i18n'
import { ai_types, createAiTask } from '../utils/ai_tasks'
import type { AIDialogMessage } from '../../../types'

type ValueType = 'text' | 'array'

const props = withDefaults(
  defineProps<{
    title?: string
    visible: boolean
    prompt: string
    defaultValue?: string | string[]
    valueType?: ValueType
    defaultInputSize?: number
    autoGenerate?: boolean
    allowGenerate?: boolean
  }>(),
  {
    title: '',
    defaultValue: '',
    valueType: 'text',
    defaultInputSize: 1,
    autoGenerate: false,
    allowGenerate: true
  }
)

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'accept', value: string | string[]): void
}>()

const { t } = useI18n()

const formatInitialValue = (value: string | string[], type: ValueType): string => {
  if (type === 'array') {
    if (Array.isArray(value)) {
      return value.join('\n')
    }
    try {
      const parsed = JSON.parse(value ?? '')
      if (Array.isArray(parsed)) {
        return parsed.join('\n')
      }
    } catch {
      // ignore
    }
  }
  return typeof value === 'string' ? value : ''
}

const aiResponse = ref(formatInitialValue(props.defaultValue ?? '', props.valueType))
const loading = ref(false)

const parseArrayValue = (value: string): string[] => {
  const trimmed = value.trim()
  if (!trimmed) return []
  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean)
    }
  } catch {
    // ignore json parse error
  }
  return trimmed
    .split(/[\n,，;；]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

const handleAccept = () => {
  const value = props.valueType === 'array' ? parseArrayValue(aiResponse.value) : aiResponse.value
  emit('accept', value)
  emit('update:visible', false)
}

const generateContent = async () => {
  if (!props.prompt) {
    ElMessage.warning(t('llmDialog.promptEmptyWarning'))
    return
  }
  loading.value = true
  try {
    // 构建消息数组，将 prompt 转换为对话格式
    const messages: AIDialogMessage[] = []

    // 如果有默认值，在 prompt 中添加上下文信息，让 AI 知道现有值
    const currentValue = aiResponse.value.trim()
    let userPrompt = props.prompt
    if (currentValue) {
      // 如果已有值，在 prompt 中说明现有内容，让 AI 知道是在原有基础上工作
      const contextInfo =
        props.valueType === 'array'
          ? `\n\n**现有内容：**\n${currentValue}\n\n请基于上述现有内容进行补充或优化。`
          : `\n\n**现有内容：**${currentValue}\n\n请基于上述现有内容进行补充或优化。`
      userPrompt = props.prompt + contextInfo
    }

    messages.push({
      role: 'user',
      content: userPrompt
    })

    await createAiTask(props.title, messages, aiResponse, ai_types.chat, props.title, {
      stream: true
    }).done
  } catch (error) {
    ElMessage.error(t('llmDialog.generateFailedError'))
    console.error(error)
  } finally {
    loading.value = false
  }
}

const handleGenerate = () => {
  if (!props.allowGenerate) return
  generateContent()
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      aiResponse.value = formatInitialValue(props.defaultValue ?? '', props.valueType)
      if (props.autoGenerate && props.allowGenerate) {
        generateContent()
      }
    } else {
      aiResponse.value = ''
    }
  }
)

watch(
  () => props.defaultValue,
  (value) => {
    if (!props.visible) {
      aiResponse.value = formatInitialValue(value ?? '', props.valueType)
    }
  }
)
</script>

<style scoped>
.meta-assistant__input-scroll {
  width: 100%;
}

.meta-assistant__input-wrapper {
  width: 100%;
}

.meta-assistant__input {
  width: 100%;
}

.meta-assistant__input :deep(.el-textarea__inner) {
  resize: none;
  overflow: hidden;
}

.meta-assistant__footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
