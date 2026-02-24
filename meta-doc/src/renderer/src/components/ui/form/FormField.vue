<template>
  <div :class="cn('space-y-2', props.class)">
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
  rules?: any[]
  class?: string
}>()

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
