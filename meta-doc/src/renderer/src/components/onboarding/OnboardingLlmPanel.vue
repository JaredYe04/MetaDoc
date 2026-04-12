<template>
  <div class="onboarding-llm-panel space-y-4 text-left">
    <Alert class="border-muted">
      <Info class="h-4 w-4" />
      <AlertTitle class="text-sm font-normal leading-relaxed">
        {{ t('onboarding.llm.builtinHint') }}
      </AlertTitle>
    </Alert>
    <p class="text-sm text-muted-foreground">{{ t('onboarding.llm.thirdPartyHint') }}</p>

    <FormField :label="t('setting.configName')" name="name">
      <Input
        v-model="name"
        class="max-w-md"
        :placeholder="t('onboarding.llm.configNamePlaceholder')"
      />
    </FormField>

    <FormField :label="t('setting.llmType')" name="type">
      <Select v-model="selectedType">
        <SelectTrigger class="w-[220px]">
          <SelectValue :placeholder="t('setting.chooseLlm')" />
        </SelectTrigger>
        <SelectContent class="!z-[10060]">
          <SelectItem value="openai">{{ t('setting.openai') }}</SelectItem>
          <SelectItem value="ollama">{{ t('setting.ollama') }}</SelectItem>
          <SelectItem value="openai-official">{{ t('setting.openaiOfficial') }}</SelectItem>
          <SelectItem value="deepseek">{{ t('setting.deepseek') }}</SelectItem>
          <SelectItem value="gemini">{{ t('setting.gemini') }}</SelectItem>
          <SelectItem value="qwen">{{ t('setting.qwen') }}</SelectItem>
        </SelectContent>
      </Select>
    </FormField>

    <template v-if="selectedType === 'ollama'">
      <FormField :label="t('setting.apiBaseUrl')" name="ollamaUrl">
        <Input v-model="ollamaApiUrl" class="max-w-md" :placeholder="t('setting.ollamaApiUrl')" />
      </FormField>
      <FormField :label="t('setting.chooseModel')" name="ollamaModel">
        <Input
          v-model="ollamaModel"
          class="max-w-md"
          :placeholder="t('setting.chooseModelPlaceholder')"
        />
      </FormField>
    </template>

    <template v-else-if="selectedType === 'openai'">
      <FormField :label="t('setting.apiBaseUrl')" name="openaiUrl">
        <Input v-model="openaiApiUrl" class="max-w-md" :placeholder="t('setting.openaiApiUrl')" />
      </FormField>
      <FormField :label="t('setting.apiKey')" name="openaiKey">
        <Input
          v-model="openaiApiKey"
          type="password"
          class="max-w-md"
          :placeholder="t('setting.apiKeyPlaceholder')"
        />
      </FormField>
      <FormField :label="t('setting.chooseModel')" name="openaiModel">
        <Input
          v-model="openaiModel"
          class="max-w-md"
          :placeholder="t('setting.chooseModelPlaceholder')"
        />
      </FormField>
    </template>

    <template v-else-if="selectedType === 'openai-official'">
      <FormField :label="t('setting.apiKey')" name="ooKey">
        <Input
          v-model="officialApiKey"
          type="password"
          class="max-w-md"
          :placeholder="t('setting.apiKeyPlaceholder')"
        />
      </FormField>
      <FormField :label="t('setting.chooseModel')" name="ooModel">
        <Input
          v-model="officialModel"
          class="max-w-md"
          :placeholder="t('setting.chooseModelPlaceholder')"
        />
      </FormField>
    </template>

    <template v-else-if="selectedType === 'deepseek'">
      <FormField :label="t('setting.apiKey')" name="dsKey">
        <Input
          v-model="deepseekApiKey"
          type="password"
          class="max-w-md"
          :placeholder="t('setting.apiKeyPlaceholder')"
        />
      </FormField>
      <FormField :label="t('setting.chooseModel')" name="dsModel">
        <Input v-model="deepseekModel" class="max-w-md" placeholder="deepseek-chat" />
      </FormField>
    </template>

    <template v-else-if="selectedType === 'gemini'">
      <FormField :label="t('setting.apiKey')" name="gKey">
        <Input
          v-model="geminiApiKey"
          type="password"
          class="max-w-md"
          :placeholder="t('setting.geminiApiKeyPlaceholder')"
        />
      </FormField>
      <FormField :label="t('setting.chooseModel')" name="gModel">
        <Input v-model="geminiModel" class="max-w-md" placeholder="gemini-2.0-flash" />
      </FormField>
    </template>

    <template v-else-if="selectedType === 'qwen'">
      <FormField :label="t('setting.apiBaseUrl')" name="qwUrl">
        <Input
          v-model="qwenApiUrl"
          class="max-w-md"
          :placeholder="t('setting.qwenApiUrlPlaceholder')"
        />
      </FormField>
      <FormField :label="t('setting.apiKey')" name="qwKey">
        <Input
          v-model="qwenApiKey"
          type="password"
          class="max-w-md"
          :placeholder="t('setting.apiKeyPlaceholder')"
        />
      </FormField>
      <FormField :label="t('setting.chooseModel')" name="qwModel">
        <Input v-model="qwenModel" class="max-w-md" placeholder="qwen-plus" />
      </FormField>
    </template>

    <div class="flex flex-wrap items-center gap-2 pt-2">
      <TooltipRoot :delay-duration="200">
        <TooltipTrigger as-child>
          <button type="button" class="frw-llm-check-btn" :disabled="testing" @click="runTest">
            <Loader2 v-if="testing" class="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
            <CheckCircle2
              v-else-if="testCheckStatus === 'success'"
              class="h-4 w-4 shrink-0 text-green-600 dark:text-green-500"
            />
            <AlertCircle
              v-else-if="testCheckStatus === 'partial'"
              class="h-4 w-4 shrink-0 text-yellow-600 dark:text-yellow-500"
            />
            <XCircle
              v-else-if="testCheckStatus === 'error'"
              class="h-4 w-4 shrink-0 text-destructive"
            />
            <span v-else class="frw-llm-check-label">{{ t('onboarding.llm.testConnection') }}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" class="!z-[10060] max-w-xs text-left">
          <template v-if="testCheckStatus === 'success'">
            {{ t('onboarding.llm.testOk') }}
          </template>
          <template v-else-if="testCheckStatus === 'partial' || testCheckStatus === 'error'">
            {{ testCheckTooltip || t('onboarding.llm.testFail') }}
          </template>
          <template v-else>
            {{ t('setting.checkConfigTooltip') }}
          </template>
        </TooltipContent>
      </TooltipRoot>
      <Button type="button" :disabled="saving" @click="saveConfig">
        <Loader2 v-if="saving" class="mr-2 h-4 w-4 animate-spin" />
        {{ t('onboarding.llm.saveAndUse') }}
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Info, Loader2, CheckCircle2, AlertCircle, XCircle } from 'lucide-vue-next'
import { Button } from '@renderer/components/ui/button'
import { TooltipRoot } from 'radix-vue'
import { TooltipTrigger, TooltipContent } from '@renderer/components/ui/tooltip'
import { Input } from '@renderer/components/ui/input'
import { FormField } from '@renderer/components/ui/form'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from '@renderer/components/ui/select'
import { Alert, AlertTitle } from '@renderer/components/ui/alert'
import { settings, setSetting } from '../../utils/settings.js'
import eventBus from '../../utils/event-bus.js'
import {
  addConfig,
  switchConfig,
  loadLlmConfigs,
  type LlmConfigItem
} from '../../utils/llm-config-manager'
import { quickLlmChatConnectivityDetailed } from '../../utils/llm-connectivity-check'
import { notifySuccess, notifyError, notifyWarning } from '../../utils/notify'

const { t } = useI18n()

const emit = defineEmits<{
  saved: []
}>()

const name = ref('')
const selectedType = ref<LlmConfigItem['type']>('openai')

const ollamaApiUrl = ref('http://localhost:11434/api')
const ollamaModel = ref('')

const openaiApiUrl = ref('https://api.openai.com/v1')
const openaiApiKey = ref('')
const openaiModel = ref('')

const officialApiKey = ref('')
const officialModel = ref('')

const deepseekApiKey = ref('')
const deepseekModel = ref('deepseek-chat')

const geminiApiKey = ref('')
const geminiModel = ref('gemini-2.0-flash')

const qwenApiUrl = ref('https://dashscope.aliyuncs.com/compatible-mode/v1')
const qwenApiKey = ref('')
const qwenModel = ref('qwen-plus')

const testing = ref(false)
const saving = ref(false)

const testCheckStatus = ref<'success' | 'partial' | 'error' | null>(null)
const testCheckTooltip = ref('')

function clearTestCheckVisual() {
  testCheckStatus.value = null
  testCheckTooltip.value = ''
}

watch(
  [
    name,
    selectedType,
    ollamaApiUrl,
    ollamaModel,
    openaiApiUrl,
    openaiApiKey,
    openaiModel,
    officialApiKey,
    officialModel,
    deepseekApiKey,
    deepseekModel,
    geminiApiKey,
    geminiModel,
    qwenApiUrl,
    qwenApiKey,
    qwenModel
  ],
  () => {
    clearTestCheckVisual()
  }
)

function buildTempItem(): LlmConfigItem | null {
  const ts = Date.now()
  const base = {
    id: `onboarding-temp-${ts}`,
    name: name.value || 'temp',
    createdAt: ts,
    updatedAt: ts
  }
  switch (selectedType.value) {
    case 'ollama':
      return {
        ...base,
        type: 'ollama',
        ollama: {
          apiUrl: ollamaApiUrl.value.trim(),
          selectedModel: ollamaModel.value.trim(),
          enableMaxTokens: false,
          maxTokens: 4096
        }
      }
    case 'openai':
      return {
        ...base,
        type: 'openai',
        openai: {
          apiUrl: openaiApiUrl.value.trim(),
          apiKey: openaiApiKey.value,
          selectedModel: openaiModel.value.trim(),
          enableMaxTokens: false,
          maxTokens: 4096
        }
      }
    case 'openai-official':
      return {
        ...base,
        type: 'openai-official',
        'openai-official': {
          apiKey: officialApiKey.value,
          selectedModel: officialModel.value.trim(),
          enableMaxTokens: false,
          maxTokens: 4096
        }
      }
    case 'deepseek':
      return {
        ...base,
        type: 'deepseek',
        deepseek: {
          apiKey: deepseekApiKey.value,
          selectedModel: deepseekModel.value.trim() || 'deepseek-chat',
          enableMaxTokens: false,
          maxTokens: 4096
        }
      }
    case 'gemini':
      return {
        ...base,
        type: 'gemini',
        gemini: {
          apiKey: geminiApiKey.value,
          selectedModel: geminiModel.value.trim() || 'gemini-2.0-flash',
          enableMaxTokens: false,
          maxTokens: 4096
        }
      }
    case 'qwen':
      return {
        ...base,
        type: 'qwen',
        qwen: {
          apiUrl: qwenApiUrl.value.trim(),
          apiKey: qwenApiKey.value,
          selectedModel: qwenModel.value.trim() || 'qwen-plus',
          enableMaxTokens: false,
          maxTokens: 4096
        }
      }
    default:
      return null
  }
}

function validateForTest(): string | null {
  const item = buildTempItem()
  if (!item) return 'type'
  if (!(name.value || '').trim()) return 'name'
  if (item.type === 'ollama' && (!item.ollama?.apiUrl || !item.ollama?.selectedModel))
    return 'fields'
  if (
    item.type === 'openai' &&
    (!item.openai?.apiUrl || !item.openai?.apiKey || !item.openai?.selectedModel)
  )
    return 'fields'
  if (
    item.type === 'openai-official' &&
    (!item['openai-official']?.apiKey || !item['openai-official']?.selectedModel)
  )
    return 'fields'
  if (item.type === 'deepseek' && (!item.deepseek?.apiKey || !item.deepseek?.selectedModel))
    return 'fields'
  if (item.type === 'gemini' && (!item.gemini?.apiKey || !item.gemini?.selectedModel))
    return 'fields'
  if (
    item.type === 'qwen' &&
    (!item.qwen?.apiUrl || !item.qwen?.apiKey || !item.qwen?.selectedModel)
  )
    return 'fields'
  return null
}

async function runTest() {
  const err = validateForTest()
  if (err) {
    notifyWarning(t('onboarding.llm.fillBeforeTest'))
    return
  }
  const item = buildTempItem()
  if (!item) return
  testing.value = true
  clearTestCheckVisual()
  try {
    const r = await quickLlmChatConnectivityDetailed(item, t)
    if (r.ok) {
      testCheckStatus.value = 'success'
      testCheckTooltip.value = t('onboarding.llm.testOk')
      void import('../../services/steam-client').then((m) =>
        m.tryUnlockSteamAchievementByApi('ACH_LLM_TEST_OK')
      )
    } else {
      const msg = (r.message || '').trim()
      const isGenericEmpty = msg === t('onboarding.llm.testFail') || !msg
      testCheckStatus.value = isGenericEmpty ? 'partial' : 'error'
      testCheckTooltip.value = isGenericEmpty ? t('onboarding.llm.testFail') : msg
    }
  } catch {
    testCheckStatus.value = 'error'
    testCheckTooltip.value = t('onboarding.llm.testFail')
  } finally {
    testing.value = false
  }
}

function buildPayload(): Omit<LlmConfigItem, 'id' | 'createdAt' | 'updatedAt'> | null {
  const item = buildTempItem()
  if (!item) return null
  const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = item
  return rest
}

async function saveConfig() {
  const err = validateForTest()
  if (err) {
    notifyWarning(t('onboarding.llm.fillBeforeSave'))
    return
  }
  const payload = buildPayload()
  if (!payload) return
  saving.value = true
  try {
    settings.llmEnabled = true
    await setSetting('llmEnabled', true)
    const created = addConfig(payload)
    await loadLlmConfigs()
    await switchConfig(created.id)
    eventBus.emit('llm-api-updated')
    notifySuccess(t('onboarding.llm.saveOk'))
    emit('saved')
  } catch {
    notifyError(t('onboarding.llm.saveFail'))
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.frw-llm-check-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.4rem 0.65rem;
  font-size: 0.875rem;
  border-radius: var(--radius);
  background: transparent;
  border: 1px solid hsl(var(--border));
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  transition:
    background 0.2s,
    color 0.2s;
}

.frw-llm-check-btn:hover:not(:disabled) {
  background: hsl(var(--accent));
  color: hsl(var(--accent-foreground));
}

.frw-llm-check-btn:disabled {
  cursor: not-allowed;
  opacity: 0.85;
}

.frw-llm-check-label {
  white-space: nowrap;
}
</style>
