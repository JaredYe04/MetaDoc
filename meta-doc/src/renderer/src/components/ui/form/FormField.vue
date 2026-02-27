<template>
  <!-- 水平布局 -->
  <div
    v-if="currentLayout === 'horizontal'"
    :class="cn('flex items-start justify-between gap-4', props.class)"
  >
    <!-- 左侧：Label -->
    <div class="flex items-center gap-2 flex-shrink-0 pt-2" style="width: 200px">
      <Label v-if="label" :for="name" class="flex items-center gap-1">
        {{ label }}
        <span v-if="required" class="text-destructive ml-1">*</span>
      </Label>
      <slot name="label-extra" />
    </div>

    <!-- 右侧：控件 + Hint -->
    <div class="flex-1 space-y-1">
      <slot />
      <!-- Hint 文字说明 -->
      <p v-if="hint" class="text-xs text-muted-foreground">
        {{ hint }}
      </p>
    </div>
  </div>

  <!-- 垂直布局（默认） -->
  <div v-else :class="cn('space-y-2', props.class)">
    <!-- Label -->
    <Label v-if="label" :for="name" class="flex items-center gap-1">
      {{ label }}
      <span v-if="required" class="text-destructive ml-1">*</span>
      <slot name="label-extra" />
    </Label>

    <!-- Content slot -->
    <div class="space-y-1">
      <slot />
    </div>

    <!-- Error message -->
    <p v-if="errorMessage" class="text-sm text-destructive">
      {{ errorMessage }}
    </p>

    <!-- Description -->
    <p v-else-if="description" class="text-sm text-muted-foreground">
      {{ description }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { inject, computed, watch, onMounted, onUnmounted } from 'vue'
import { cn } from '@renderer/lib/utils'
import { Label } from '../label'

import type { FormContext } from './types'

const props = defineProps<{
  name: string
  label?: string
  required?: boolean
  description?: string
  hint?: string
  layout?: 'vertical' | 'horizontal'
  rules?: any[]
  class?: string
}>()

// Default layout
const currentLayout = computed(() => props.layout || 'vertical')

// Inject form context
const formContext = inject<FormContext | null>('formContext', null)

// Computed error message
const errorMessage = computed(() => {
  if (!formContext) return null
  return formContext.errors.value.get(props.name) || null
})

// Register field on mount
onMounted(() => {
  if (formContext) {
    formContext.registerField(props.name, props.rules || [])
  }
})

// Unregister field on unmount
onUnmounted(() => {
  if (formContext) {
    formContext.unregisterField(props.name)
  }
})

// Watch for rule changes
watch(
  () => props.rules,
  (newRules) => {
    if (formContext) {
      formContext.registerField(props.name, newRules || [])
    }
  },
  { deep: true }
)

// Expose field methods
defineExpose({
  name: props.name,
  errorMessage
})
</script>
