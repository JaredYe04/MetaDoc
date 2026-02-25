<template>
  <div
    :class="
      cn(
        'form-item group/form-item space-y-2',
        isError && 'form-item--error',
        isRequired && 'form-item--required',
        props.class
      )
    "
  >
    <!-- Label section -->
    <div
      v-if="showLabel"
      :class="
        cn(
          'form-item__label-wrapper flex items-center gap-1',
          labelPosition === 'top' && 'flex-col items-start gap-1',
          labelPosition === 'left' && 'flex-row gap-3',
          labelPosition === 'right' && 'flex-row-reverse gap-3 justify-end'
        )
      "
    >
      <Label
        v-if="label || $slots.label"
        :for="prop"
        :class="
          cn(
            'form-item__label text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
            labelClass
          )
        "
      >
        <slot name="label">{{ label }}</slot>
        <span v-if="isRequired" class="form-item__required-marker text-destructive ml-0.5">
          *
        </span>
      </Label>
    </div>

    <!-- Content section -->
    <div class="form-item__content space-y-1 flex-1 w-full">
      <slot />
    </div>

    <!-- Error message section -->
    <div
      v-if="(isError || $slots.error) && showError"
      :class="
        cn(
          'form-item__error text-sm text-destructive animate-in fade-in slide-in-from-top-1 duration-200',
          errorClass
        )
      "
    >
      <slot name="error">
        {{ errorMessage }}
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { inject, computed, watch, onMounted, onUnmounted, provide } from 'vue'
import { cn } from '@renderer/lib/utils'
import { Label } from '../label'
import type { FormContext, FormValidationRule } from './types'

const props = defineProps<{
  /** Field name/path - maps to form field */
  prop?: string
  /** Label text */
  label?: string
  /** Whether field is required */
  required?: boolean
  /** Validation rules */
  rules?: FormValidationRule[]
  /** Error message (overrides validation errors) */
  error?: string
  /** Label position: top, left, right */
  labelPosition?: 'top' | 'left' | 'right'
  /** Custom class for label */
  labelClass?: string
  /** Custom class for error */
  errorClass?: string
  /** Whether to show error message */
  showError?: boolean
  /** Additional CSS class */
  class?: string
}>()

const slots = defineSlots<{
  default: () => any
  label?: () => any
  error?: () => any
}>()

// Provide field context to child inputs
const fieldContext = computed(() => ({
  name: props.prop,
  required: props.required,
  hasError: isError.value
}))
provide('formItemContext', fieldContext)

// Inject form context
const formContext = inject<FormContext | null>('formContext', null)

// Computed field name (use prop as field identifier)
const fieldName = computed(() => props.prop || '')

// Computed whether to show label
const showLabel = computed(() => {
  return !!(props.label || slots.label)
})

// Computed whether field is required (from props or rules)
const isRequired = computed(() => {
  if (props.required !== undefined) return props.required
  if (props.rules) {
    return props.rules.some((rule) => rule.required === true)
  }
  return false
})

// Computed error state
const isError = computed(() => {
  if (props.error) return true
  if (!formContext || !fieldName.value) return false
  return formContext.errors.value.has(fieldName.value)
})

// Computed error message
const errorMessage = computed(() => {
  if (props.error) return props.error
  if (!formContext || !fieldName.value) return null
  return formContext.errors.value.get(fieldName.value) || null
})

// Default label position
const labelPosition = computed(() => props.labelPosition || 'top')

// Default show error
const showError = computed(() => props.showError !== false)

// Register field on mount
onMounted(() => {
  if (formContext && fieldName.value) {
    formContext.registerField(fieldName.value, props.rules || [])
  }
})

// Unregister field on unmount
onUnmounted(() => {
  if (formContext && fieldName.value) {
    formContext.unregisterField(fieldName.value)
  }
})

// Watch for rule changes
watch(
  () => props.rules,
  (newRules) => {
    if (formContext && fieldName.value) {
      formContext.registerField(fieldName.value, newRules || [])
    }
  },
  { deep: true }
)

// Watch for external error prop changes
watch(
  () => props.error,
  (newError) => {
    if (formContext && fieldName.value) {
      formContext.setFieldError(fieldName.value, newError || null)
    }
  }
)

// Expose field methods and state for template ref access
defineExpose({
  /** Field name/prop */
  prop: props.prop,
  /** Whether field has error */
  isError,
  /** Current error message */
  errorMessage,
  /** Whether field is required */
  isRequired,
  /** Validate this field */
  validate: async () => {
    if (formContext && fieldName.value) {
      return formContext.validateField(fieldName.value, null)
    }
    return true
  },
  /** Clear validation for this field */
  clearValidate: () => {
    if (formContext && fieldName.value) {
      formContext.setFieldError(fieldName.value, null)
    }
  }
})
</script>

<style scoped>
.form-item {
  transition: all 0.2s ease;
}

.form-item--error :deep(.form-item__content input),
.form-item--error :deep(.form-item__content textarea),
.form-item--error :deep(.form-item__content select) {
  border-color: hsl(var(--destructive));
}

.form-item__error {
  min-height: 1.25rem;
}
</style>
