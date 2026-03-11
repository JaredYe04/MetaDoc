<template>
  <Dialog v-model:open="open" @update:open="(v) => emit('update:open', v)">
    <DialogContent class="context-breakdown-dialog sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ t('agent.contextBreakdown.title') }}</DialogTitle>
        <p class="context-breakdown-desc text-sm text-muted-foreground">
          {{ t('agent.contextBreakdown.description') }}
        </p>
      </DialogHeader>
      <div v-if="breakdown" class="context-breakdown-body">
        <div class="context-breakdown-summary">
          <span class="context-breakdown-total">
            {{ t('agent.contextBreakdown.totalTokens', { used: formatK(breakdown.totalTokens), max: formatK(breakdown.maxTokens), pct: breakdown.percentage }) }}
          </span>
          <div class="context-breakdown-ring" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="48" height="48">
              <circle
                class="context-breakdown-ring-bg"
                cx="12"
                cy="12"
                r="10"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              />
              <circle
                class="context-breakdown-ring-fill"
                cx="12"
                cy="12"
                r="10"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-dasharray="62.83"
                :stroke-dashoffset="62.83 - (62.83 * breakdown.percentage) / 100"
                stroke-linecap="round"
                transform="rotate(-90 12 12)"
              />
            </svg>
          </div>
        </div>
        <ul class="context-breakdown-parts">
          <li
            v-for="part in breakdown.parts"
            :key="part.id"
            class="context-breakdown-part"
            :class="{ 'context-breakdown-part--empty': part.tokens === 0 }"
          >
            <span class="context-breakdown-part-label">{{ partLabel(part.id) }}</span>
            <span class="context-breakdown-part-size">
              {{ t('agent.contextBreakdown.tokensChars', { tokens: part.tokens, chars: part.chars }) }}
            </span>
          </li>
        </ul>
      </div>
      <p v-else class="context-breakdown-empty">{{ t('agent.contextBreakdown.noSession') }}</p>
      <DialogFooter>
        <Button variant="ghost" @click="open = false">
          {{ t('common.close') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import type { ContextBreakdown, ContextPartId } from '../../utils/agent-framework'

const props = withDefaults(
  defineProps<{
    open: boolean
    breakdown: ContextBreakdown | null
  }>(),
  { breakdown: null }
)

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
}>()

const { t } = useI18n()

const open = computed({
  get: () => props.open,
  set: (v) => emit('update:open', v)
})

function formatK(n: number): string {
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

function partLabel(id: ContextPartId): string {
  return t(`agent.contextBreakdown.parts.${id}`)
}
</script>

<style scoped>
.context-breakdown-body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.context-breakdown-summary {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.context-breakdown-total {
  font-size: 0.875rem;
  color: var(--el-text-color-regular);
}

.context-breakdown-ring {
  margin-left: auto;
  opacity: 0.9;
}

.context-breakdown-ring-bg {
  opacity: 0.25;
}

.context-breakdown-ring-fill {
  transition: stroke-dashoffset 0.2s ease;
}

.context-breakdown-parts {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.context-breakdown-part {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  background: var(--el-fill-color-light, rgba(0, 0, 0, 0.04));
  font-size: 0.8125rem;
}

.context-breakdown-part--empty {
  opacity: 0.65;
}

.context-breakdown-part-label {
  font-weight: 500;
}

.context-breakdown-part-size {
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}

.context-breakdown-empty {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 0.875rem;
}
</style>
