<template>
  <div
    v-if="visible"
    class="debug-ai-pipeline-switch border border-border rounded-md p-4 mb-4 bg-muted/30"
  >
    <h3 class="text-sm font-medium mb-1">{{ t('setting.debug.aiPipeline.title') }}</h3>
    <p class="text-xs text-muted-foreground mb-3">{{ t('setting.debug.aiPipeline.hint') }}</p>
    <div class="flex flex-col gap-2">
      <label class="flex items-center gap-2 cursor-pointer">
        <input
          type="radio"
          name="metadoc-dev-ai-pipeline"
          value="legacy"
          :checked="mode === 'legacy'"
          @change="onSelect('legacy')"
        />
        <span class="text-sm">{{ t('setting.debug.aiPipeline.legacy') }}</span>
      </label>
      <label class="flex items-center gap-2 cursor-pointer">
        <input
          type="radio"
          name="metadoc-dev-ai-pipeline"
          value="steam_cloud"
          :checked="mode === 'steam_cloud'"
          @change="onSelect('steam_cloud')"
        />
        <span class="text-sm">{{ t('setting.debug.aiPipeline.steamCloud') }}</span>
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { isSteamDistribution } from '@common/build-env'
import {
  getDevAiPipelineMode,
  setDevAiPipelineMode,
  type DevAiPipelineMode
} from '../../utils/dev-ai-pipeline'
import eventBus from '../../utils/event-bus.js'

const { t } = useI18n()

const mode = ref<DevAiPipelineMode>('legacy')

const visible = computed(() => import.meta.env.DEV && !isSteamDistribution())

function syncFromStorage() {
  mode.value = getDevAiPipelineMode()
}

function onSelect(m: DevAiPipelineMode) {
  setDevAiPipelineMode(m)
  mode.value = m
}

function onPipelineChanged() {
  syncFromStorage()
}

onMounted(() => {
  if (!import.meta.env.DEV || isSteamDistribution()) return
  syncFromStorage()
  eventBus.on('metadoc-dev-ai-pipeline-changed', onPipelineChanged)
})

onUnmounted(() => {
  if (!import.meta.env.DEV || isSteamDistribution()) return
  eventBus.off('metadoc-dev-ai-pipeline-changed', onPipelineChanged)
})
</script>
