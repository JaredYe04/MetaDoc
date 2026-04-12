<template>
  <div class="file-association-block" :class="{ 'file-association-block--compact': compact }">
    <h4 v-if="showTitle" class="file-association-block__title">
      {{ t('setting.fileAssociation.sectionTitle') }}
    </h4>

    <div class="file-association-block__cards">
      <button
        type="button"
        class="file-assoc-card"
        :disabled="!canPickFormat || demoBlocked"
        @click="openSample('md')"
      >
        <span class="file-assoc-card__icon file-assoc-card__icon--md" aria-hidden="true">
          <span class="file-assoc-card__icon-mask" :style="mdIconMaskStyle" />
        </span>
        <span class="file-assoc-card__label">{{ t('setting.fileAssociation.pickMd') }}</span>
      </button>
      <button
        type="button"
        class="file-assoc-card"
        :disabled="!canPickFormat || demoBlocked"
        @click="openSample('tex')"
      >
        <span class="file-assoc-card__icon file-assoc-card__icon--tex" aria-hidden="true">
          <span class="file-assoc-card__icon-mask" :style="texIconMaskStyle" />
        </span>
        <span class="file-assoc-card__label">{{ t('setting.fileAssociation.pickTex') }}</span>
      </button>
    </div>

    <div class="file-association-block__footer">
      <Button
        type="button"
        variant="outline"
        size="sm"
        :disabled="!canOpenSystemUi || demoBlocked"
        @click="openSystemSettings"
      >
        {{ t('setting.fileAssociation.openSystemSettings') }}
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from '@renderer/components/ui/button/Button.vue'
import messageBridge from '@renderer/bridge/message-bridge'
import { notifySuccess, notifyError, notifyWarning } from '@renderer/utils/notify'
import mdDocSvgUrl from '@logos/logov3/md-doc.svg?url'
import texDocSvgUrl from '@logos/logov3/tex-doc.svg?url'

const props = withDefaults(
  defineProps<{
    compact?: boolean
    showTitle?: boolean
    mode?: string
  }>(),
  { compact: false, showTitle: true, mode: undefined }
)

const { t } = useI18n()
const runtimePlatform = ref<string>('')
const isElectronShell = ref(false)
const demoBlocked = computed(() => props.mode === 'demo')

const mdIconMaskStyle = computed(() => ({
  WebkitMaskImage: `url(${mdDocSvgUrl})`,
  maskImage: `url(${mdDocSvgUrl})`
}))

const texIconMaskStyle = computed(() => ({
  WebkitMaskImage: `url(${texDocSvgUrl})`,
  maskImage: `url(${texDocSvgUrl})`
}))

const canPickFormat = computed(() => {
  if (!isElectronShell.value) return false
  const p = runtimePlatform.value
  return p === 'win32' || p === 'darwin' || p === 'linux'
})

const canOpenSystemUi = computed(() => {
  if (!isElectronShell.value) return false
  const p = runtimePlatform.value
  return p === 'win32' || p === 'darwin' || p === 'linux'
})

async function openSample(ext: 'md' | 'tex') {
  if (demoBlocked.value || !messageBridge.getIpc()?.invoke) return
  try {
    const res = (await messageBridge.invoke('open-file-association-sample', { ext })) as {
      ok?: boolean
      error?: string
    }
    if (res?.ok) {
      notifySuccess(t('setting.fileAssociation.openSampleOk'))
    } else {
      notifyError(t('setting.fileAssociation.openSampleFail'))
    }
  } catch {
    notifyError(t('setting.fileAssociation.openSampleFail'))
  }
}

async function openSystemSettings() {
  if (demoBlocked.value) return
  if (!messageBridge.getIpc()?.invoke) {
    notifyWarning(t('setting.fileAssociation.electronOnly'))
    return
  }
  try {
    const res = (await messageBridge.invoke('open-system-file-association-settings')) as {
      ok?: boolean
      error?: string
    }
    if (res?.ok) {
      notifySuccess(t('setting.fileAssociation.openSettingsOk'))
    } else if (res?.error === 'linux_no_control_panel') {
      notifyWarning(t('setting.fileAssociation.openSettingsLinuxManual'))
    } else if (res?.error === 'web_unsupported') {
      notifyWarning(t('setting.fileAssociation.electronOnly'))
    } else {
      notifyError(t('setting.fileAssociation.openSettingsFail'))
    }
  } catch {
    notifyError(t('setting.fileAssociation.openSettingsFail'))
  }
}

onMounted(() => {
  isElectronShell.value =
    typeof window !== 'undefined' && !!(window as Window & { electron?: unknown }).electron
  void (async () => {
    try {
      if (!messageBridge.getIpc()?.invoke) {
        runtimePlatform.value = ''
        return
      }
      const p = (await messageBridge.invoke('get-runtime-platform')) as string
      runtimePlatform.value = typeof p === 'string' ? p : ''
    } catch {
      runtimePlatform.value = ''
    }
  })()
})
</script>

<style scoped>
.file-association-block__title {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.file-association-block__cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

@media (max-width: 560px) {
  .file-association-block__cards {
    grid-template-columns: 1fr;
  }
}

.file-assoc-card {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 18px 16px;
  border-radius: 12px;
  border: 2px solid hsl(var(--border));
  background: hsl(var(--card));
  cursor: pointer;
  text-align: left;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    background-color 0.2s ease;
  font: inherit;
  color: hsl(var(--foreground));
}

.file-assoc-card:hover:not(:disabled) {
  border-color: hsl(var(--primary) / 0.45);
  box-shadow: 0 1px 3px hsl(var(--foreground) / 0.06);
}

.file-assoc-card:focus-visible {
  outline: none;
  border-color: hsl(var(--primary));
  box-shadow:
    0 0 0 2px hsl(var(--background)),
    0 0 0 4px hsl(var(--ring));
}

.file-assoc-card:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.file-assoc-card__icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 10px;
}

/* 用前景色 + muted 底，避免暗色主题下 primary 过亮导致蒙版对比度不足 */
.file-assoc-card__icon--md {
  background: hsl(var(--muted));
}

.file-assoc-card__icon--tex {
  background: hsl(var(--accent));
}

.file-assoc-card__icon-mask {
  display: block;
  width: 28px;
  height: 28px;
  background-color: hsl(var(--foreground));
  -webkit-mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: center;
  mask-size: contain;
  mask-repeat: no-repeat;
  mask-position: center;
}

.file-assoc-card__icon--tex .file-assoc-card__icon-mask {
  background-color: hsl(var(--accent-foreground));
}

.file-association-block--compact .file-assoc-card__icon-mask {
  width: 26px;
  height: 26px;
}

.file-assoc-card__label {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.45;
}

.file-association-block__footer {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.file-association-block--compact .file-association-block__title {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 10px;
}

.file-association-block--compact .file-assoc-card {
  padding: 16px 14px;
  gap: 12px;
}

.file-association-block--compact .file-assoc-card__icon {
  width: 44px;
  height: 44px;
  border-radius: 9px;
}

.file-association-block--compact .file-assoc-card__label {
  font-size: 12.5px;
}
</style>
