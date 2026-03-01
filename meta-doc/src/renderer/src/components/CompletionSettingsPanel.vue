<template>
  <div class="completion-settings">
    <h3 class="section-title">{{ t('ai.completion.title', 'AI 自动补全设置') }}</h3>

    <Form class="settings-form">
      <!-- 启用自动补全 -->
      <FormField :label="t('ai.completion.enable', '启用自动补全')" name="enableCompletion">
        <div class="flex items-center gap-2">
          <span class="text-sm text-muted-foreground">{{ t('common.disabled', '禁用') }}</span>
          <Switch
            v-model:checked="settings.enableCompletion"
            @update:checked="handleSettingChange('enableCompletion', settings.enableCompletion)"
          />
          <span class="text-sm text-muted-foreground">{{ t('common.enabled', '启用') }}</span>
        </div>
      </FormField>

      <!-- 触发字符设置 -->
      <FormField :label="t('ai.completion.triggerChars', '触发字符')" name="triggerChars">
        <div class="trigger-chars-input">
          <Input
            v-model="settings.triggerChars"
            :placeholder="t('ai.completion.triggerCharsPlaceholder', '输入触发字符，如: . ->')"
            class="w-[280px]"
            @blur="handleSettingChange('triggerChars', settings.triggerChars)"
          />
          <p class="field-hint">
            {{ t('ai.completion.triggerCharsHint', '输入这些字符后将触发 AI 补全建议') }}
          </p>
        </div>
      </FormField>

      <!-- 延迟时间 -->
      <FormField :label="t('ai.completion.delay', '触发延迟 (ms)')" name="delay">
        <div class="delay-input">
          <Slider
            v-model="settings.delay"
            :min="100"
            :max="2000"
            :step="100"
            class="w-[280px]"
            @update:model-value="handleSettingChange('delay', settings.delay)"
          />
          <div class="delay-value">{{ settings.delay }}ms</div>
          <p class="field-hint">
            {{ t('ai.completion.delayHint', '输入后等待多长时间再触发补全') }}
          </p>
        </div>
      </FormField>

      <!-- 最大 Token 数 -->
      <FormField :label="t('ai.completion.maxTokens', '最大 Token 数')" name="maxTokens">
        <div class="tokens-input">
          <NumberField
            v-model="settings.maxTokens"
            :min="50"
            :max="500"
            :step="10"
            class="w-[140px]"
            @update:model-value="handleSettingChange('maxTokens', settings.maxTokens)"
          />
          <p class="field-hint">
            {{ t('ai.completion.maxTokensHint', '每次补全生成的最大 Token 数量') }}
          </p>
        </div>
      </FormField>

      <!-- 温度设置 -->
      <FormField :label="t('ai.completion.temperature', '生成温度')" name="temperature">
        <div class="temperature-input">
          <Slider
            v-model="settings.temperature"
            :min="0"
            :max="1"
            :step="0.1"
            class="w-[280px]"
            @update:model-value="handleSettingChange('temperature', settings.temperature)"
          />
          <div class="temperature-value">{{ settings.temperature }}</div>
          <p class="field-hint">
            {{ t('ai.completion.temperatureHint', '较低值使输出更确定，较高值使输出更多样') }}
          </p>
        </div>
      </FormField>

      <!-- 显示行数 -->
      <FormField :label="t('ai.completion.maxLines', '最大显示行数')" name="maxLines">
        <div class="lines-input">
          <NumberField
            v-model="settings.maxLines"
            :min="1"
            :max="10"
            :step="1"
            class="w-[140px]"
            @update:model-value="handleSettingChange('maxLines', settings.maxLines)"
          />
          <p class="field-hint">{{ t('ai.completion.maxLinesHint', '补全建议最多显示的行数') }}</p>
        </div>
      </FormField>

      <!-- 上下文行数 -->
      <FormField :label="t('ai.completion.contextLines', '上下文行数')" name="contextLines">
        <div class="context-input">
          <NumberField
            v-model="settings.contextLines"
            :min="3"
            :max="50"
            :step="1"
            class="w-[140px]"
            @update:model-value="handleSettingChange('contextLines', settings.contextLines)"
          />
          <p class="field-hint">
            {{ t('ai.completion.contextLinesHint', '提供给 AI 的上下文代码行数') }}
          </p>
        </div>
      </FormField>

      <!-- 预览区域 -->
      <div v-if="isDemo" class="preview-section">
        <h4 class="preview-title">{{ t('ai.completion.preview', '效果预览') }}</h4>
        <div class="code-preview">
          <div class="code-line">
            <span class="code-text">function calculateSum(a, b) {{ '{' }}</span>
          </div>
          <div class="code-line">
            <span class="code-text">
              // {{ t('ai.completion.demoComment', '计算两个数的和') }}</span
            >
          </div>
          <div class="code-line completion-active">
            <span class="code-text"> return a + b;</span>
            <span class="completion-suggestion"
              >← {{ t('ai.completion.aiSuggestion', 'AI 建议') }}</span
            >
          </div>
          <div class="code-line">
            <span class="code-text">{{ '}' }}</span>
          </div>
        </div>
      </div>
    </Form>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { notifySuccess, notifyInfo } from '../utils/notify'
import { Form, FormField } from '@renderer/components/ui/form'
import { Switch } from '@renderer/components/ui/switch'
import { Input } from '@renderer/components/ui/input'
import { NumberField } from '@renderer/components/ui/number-field'
import { Slider } from '@renderer/components/ui/slider'

// Props definition
const props = defineProps<{
  mode?: string
}>()
const isDemo = computed(() => props.mode === 'demo')

const { t } = useI18n()

// Settings interface
interface CompletionSettings {
  enableCompletion: boolean
  triggerChars: string
  delay: number
  maxTokens: number
  temperature: number
  maxLines: number
  contextLines: number
}

// Reactive settings state
const settings = reactive<CompletionSettings>({
  enableCompletion: true,
  triggerChars: '. -> ::',
  delay: 500,
  maxTokens: 100,
  temperature: 0.3,
  maxLines: 3,
  contextLines: 10
})

// Demo data loading
const loadDemoData = () => {
  settings.enableCompletion = true
  settings.triggerChars = '. -> ::'
  settings.delay = 500
  settings.maxTokens = 100
  settings.temperature = 0.3
  settings.maxLines = 3
  settings.contextLines = 10
}

// Setting change handler
const handleSettingChange = (key: keyof CompletionSettings, value: unknown) => {
  if (isDemo.value) {
    notifyInfo(t('ai.completion.demoHint', '演示模式：设置变更仅用于展示'))
    return
  }

  // In real mode, would save to settings store
  notifySuccess(t('ai.completion.settingSaved', '设置已保存'))
}

// Initialize
onMounted(() => {
  if (isDemo.value) {
    loadDemoData()
  }
})
</script>

<style scoped>
.completion-settings {
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  padding: 24px;
  box-sizing: border-box;
}

.section-title {
  margin: 0 0 24px 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.settings-form {
  width: 100%;
}

.trigger-chars-input,
.delay-input,
.tokens-input,
.temperature-input,
.lines-input,
.context-input {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-hint {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}

.delay-value,
.temperature-value {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

/* Preview section styles */
.preview-section {
  margin-top: 32px;
  padding: 16px;
  background-color: var(--el-fill-color-light);
  border-radius: 8px;
  border: 1px solid var(--el-border-color-light);
}

.preview-title {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.code-preview {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 13px;
  line-height: 1.6;
  background-color: var(--el-bg-color);
  border-radius: 6px;
  padding: 12px;
  border: 1px solid var(--el-border-color-lighter);
}

.code-line {
  padding: 2px 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.code-text {
  color: var(--el-text-color-primary);
}

.completion-active {
  background-color: rgba(64, 158, 255, 0.1);
  border-radius: 4px;
}

.completion-suggestion {
  color: var(--el-color-primary);
  font-size: 11px;
  font-weight: 500;
  padding: 2px 6px;
  background-color: rgba(64, 158, 255, 0.15);
  border-radius: 4px;
}

/* Dark mode adjustments */
@media (prefers-color-scheme: dark) {
  .completion-active {
    background-color: rgba(64, 158, 255, 0.2);
  }

  .completion-suggestion {
    background-color: rgba(64, 158, 255, 0.25);
  }
}
</style>
