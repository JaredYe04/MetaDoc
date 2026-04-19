<template>
  <Dialog :open="open" @update:open="(v) => emit('update:open', v)">
    <DialogContent class="sm:max-w-[720px]">
      <DialogHeader>
        <DialogTitle>
          {{ isBuiltinFree ? t('llmErrorDialog.titleBuiltinFree') : t('llmErrorDialog.title') }}
        </DialogTitle>
      </DialogHeader>

      <div class="space-y-4 py-2">
        <Alert v-if="isBuiltinFree">
          <Info class="h-4 w-4" />
          <AlertTitle>{{ t('llmErrorDialog.builtinFreeIntro') }}</AlertTitle>
          <div class="text-sm text-muted-foreground mt-1">
            {{ t('llmErrorDialog.builtinFreeQuotaHint') }}
          </div>
        </Alert>

        <div class="rounded-md border p-3 space-y-2">
          <div class="text-sm font-medium">{{ t('llmErrorDialog.currentConfig') }}</div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <div>
              <span class="text-muted-foreground">{{ t('llmErrorDialog.configType') }}：</span
              ><span class="font-mono">{{ configType }}</span>
            </div>
            <div>
              <span class="text-muted-foreground">{{ t('llmErrorDialog.model') }}：</span
              ><span class="font-mono">{{ model }}</span>
            </div>
            <div class="sm:col-span-2">
              <span class="text-muted-foreground">{{ t('llmErrorDialog.baseUrl') }}：</span
              ><span class="font-mono break-all">{{ baseUrl }}</span>
            </div>
            <div class="sm:col-span-2">
              <span class="text-muted-foreground">{{ t('llmErrorDialog.apiKey') }}：</span
              ><span class="font-mono">{{ maskedKey }}</span>
            </div>
          </div>
        </div>

        <div class="rounded-md border p-3 space-y-2">
          <div class="text-sm font-medium">{{ t('llmErrorDialog.errorDetails') }}</div>
          <div class="text-sm">
            <div>
              <span class="text-muted-foreground">{{ t('llmErrorDialog.errorType') }}：</span
              ><span class="font-mono">{{ errorType }}</span>
            </div>
            <div class="mt-1">
              <span class="text-muted-foreground">{{ t('llmErrorDialog.message') }}：</span
              ><span>{{ errorMessage }}</span>
            </div>
          </div>
          <details class="text-sm">
            <summary class="cursor-pointer text-muted-foreground">
              {{ t('llmErrorDialog.originalException') }}
            </summary>
            <pre
              class="mt-2 p-2 rounded bg-muted text-xs overflow-auto max-h-48 whitespace-pre-wrap"
              >{{ originalException }}</pre
            >
          </details>
        </div>

        <div class="flex items-center justify-between gap-3 flex-wrap">
          <label class="flex items-center gap-2 text-sm text-muted-foreground select-none">
            <input
              type="checkbox"
              class="h-4 w-4"
              :checked="dontShowChecked"
              @change="onToggleDontShow"
            />
            <span>{{ t('llmErrorDialog.dontShowAgain') }}</span>
          </label>

          <div class="flex gap-2 ml-auto">
            <Button variant="outline" @click="emit('update:open', false)">
              {{ t('common.close') }}
            </Button>
            <Button v-if="showRechargePrimary" @click="openSteamRecharge">
              {{ t('llmErrorDialog.rechargeCredits') }}
            </Button>
            <Button v-else @click="openManual">
              {{ t('llmErrorDialog.learnHowToConfigure') }}
            </Button>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Info } from 'lucide-vue-next'
import { useWorkspace } from '@renderer/stores/workspace'
import { useUserManual } from '@renderer/stores/userManual'
import eventBus from '@renderer/utils/event-bus.js'
import { useMetadocCloudOpenAiRoute } from '@renderer/utils/dev-ai-pipeline'
import { LlmErrorType } from '@renderer/utils/llm-errors.js'
import { Button } from '@renderer/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@renderer/components/ui/dialog'
import { Alert, AlertTitle } from '@renderer/components/ui/alert'

type LlmApiErrorPayload = {
  llmError?: any
  context?: any
  originalErrorMessage?: string
  originalErrorString?: string
}

const props = defineProps<{
  open: boolean
  payload: LlmApiErrorPayload | null
  dontShowChecked?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'dont-show-again', v: boolean): void
}>()

const { t } = useI18n()
const workspace = useWorkspace()
const manual = useUserManual()

const BUILTIN_FREE_OPENROUTER_API_KEY =
  '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'

const llmConfig = computed(() => props.payload?.context?.llmConfig || null)

const configType = computed(() => String(llmConfig.value?.type || ''))
const baseUrl = computed(() => String(llmConfig.value?.apiUrl || ''))
const model = computed(() => String(llmConfig.value?.selectedModel || llmConfig.value?.model || ''))
const apiKey = computed(() => String(llmConfig.value?.apiKey || ''))

const isBuiltinFree = computed(() => {
  return (
    baseUrl.value.includes('openrouter.ai') &&
    model.value === 'openrouter/free' &&
    apiKey.value === BUILTIN_FREE_OPENROUTER_API_KEY
  )
})

const maskedKey = computed(() => {
  const k = apiKey.value || ''
  if (!k) return t('llmErrorDialog.apiKeyEmpty')
  if (isBuiltinFree.value) return t('llmErrorDialog.apiKeyBuiltinHidden')
  if (k.length <= 8) return '********'
  return `${k.slice(0, 4)}…${k.slice(-4)}`
})

const steamCloudRoute = useMetadocCloudOpenAiRoute()

const showRechargePrimary = computed(() => {
  const errTy = props.payload?.llmError?.type
  return steamCloudRoute === true && errTy === LlmErrorType.INSUFFICIENT_CREDITS
})

const errorType = computed(() =>
  String(props.payload?.llmError?.type || props.payload?.llmError?.name || '')
)
const errorMessage = computed(() => {
  const userMsg = props.payload?.llmError?.getUserMessage?.()
  return String(
    userMsg || props.payload?.llmError?.message || props.payload?.originalErrorMessage || ''
  )
})
const originalException = computed(() =>
  String(props.payload?.originalErrorString || props.payload?.originalErrorMessage || '')
)

const dontShowChecked = computed(() => props.dontShowChecked === true)

const onToggleDontShow = (e: Event) => {
  const checked = (e.target as HTMLInputElement).checked
  emit('dont-show-again', checked)
}

const openManual = async () => {
  workspace.openSystemTab('/user-manual', t('userManual.title') || '用户手册')
  await manual.setCurrentArticle('settings.llm-api-setup', 'link')
  emit('update:open', false)
}

function openSteamRecharge() {
  eventBus.emit('steam-cloud-open-recharge')
  workspace.openSystemTab('/setting', t('leftMenu.settings'))
  emit('update:open', false)
}
</script>
