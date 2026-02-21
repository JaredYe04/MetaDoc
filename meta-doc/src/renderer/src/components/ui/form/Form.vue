<template>
  <form :class="cn('space-y-6', props.class)" @submit.prevent>
    <slot />
  </form>
</template>

<script setup lang="ts">
import { provide, ref, computed } from 'vue'
import { cn } from '@renderer/lib/utils'
import type { FormContext, FormValidationError } from './types'

const props = defineProps<{
  class?: string
}>()

// Form validation state
const errors = ref<Map<string, string>>(new Map())
const fields = ref<Map<string, any>>(new Map())
const rules = ref<Map<string, any[]>>(new Map())

// Register field with form
const registerField = (name: string, fieldRules: any[] = []) => {
  fields.value.set(name, null)
  if (fieldRules.length > 0) {
    rules.value.set(name, fieldRules)
  }
}

// Unregister field
const unregisterField = (name: string) => {
  fields.value.delete(name)
  rules.value.delete(name)
  errors.value.delete(name)
}

// Set field error
const setFieldError = (name: string, error: string | null) => {
  if (error) {
    errors.value.set(name, error)
  } else {
    errors.value.delete(name)
  }
}

// Validate single field
const validateField = async (name: string, value: any): Promise<boolean> => {
  const fieldRules = rules.value.get(name)
  if (!fieldRules || fieldRules.length === 0) return true

  for (const rule of fieldRules) {
    const error = await validateRule(rule, value, name)
    if (error) {
      errors.value.set(name, error)
      return false
    }
  }
  errors.value.delete(name)
  return true
}

// Validate rule
const validateRule = async (rule: any, value: any, fieldName: string): Promise<string | null> => {
  // Required check
  if (rule.required) {
    const isEmpty = value === undefined || value === null || value === '' || 
      (Array.isArray(value) && value.length === 0)
    if (isEmpty) {
      return rule.message || `${fieldName} is required`
    }
  }

  // Pattern check
  if (rule.pattern && value) {
    const regex = new RegExp(rule.pattern)
    if (!regex.test(String(value))) {
      return rule.message || `${fieldName} format is invalid`
    }
  }

  // Min length check
  if (rule.min !== undefined && value) {
    if (String(value).length < rule.min) {
      return rule.message || `${fieldName} must be at least ${rule.min} characters`
    }
  }

  // Max length check
  if (rule.max !== undefined && value) {
    if (String(value).length > rule.max) {
      return rule.message || `${fieldName} must be at most ${rule.max} characters`
    }
  }

  // Custom validator
  if (typeof rule.validator === 'function') {
    try {
      const result = await rule.validator(rule, value, (error: Error) => error)
      if (result instanceof Error) {
        return result.message || rule.message || `${fieldName} is invalid`
      }
      if (result === false) {
        return rule.message || `${fieldName} is invalid`
      }
    } catch (error: any) {
      return error?.message || rule.message || `${fieldName} is invalid`
    }
  }

  return null
}

// Validate all fields
const validate = async (callback?: (valid: boolean, errors?: FormValidationError[]) => void): Promise<boolean> => {
  const validationErrors: FormValidationError[] = []
  
  for (const [name, fieldRules] of rules.value.entries()) {
    const value = fields.value.get(name)
    for (const rule of fieldRules) {
      const error = await validateRule(rule, value, name)
      if (error) {
        errors.value.set(name, error)
        validationErrors.push({ field: name, message: error })
        break
      }
    }
  }

  const isValid = validationErrors.length === 0
  
  if (callback) {
    callback(isValid, validationErrors.length > 0 ? validationErrors : undefined)
  }
  
  return isValid
}

// Reset all fields
const resetFields = () => {
  errors.value.clear()
  fields.value.forEach((_, key) => {
    fields.value.set(key, null)
  })
}

// Clear validation
const clearValidate = () => {
  errors.value.clear()
}

// Update field value
const updateFieldValue = (name: string, value: any) => {
  fields.value.set(name, value)
}

// Provide form context
const formContext: FormContext = {
  errors: computed(() => errors.value),
  registerField,
  unregisterField,
  setFieldError,
  validateField,
  updateFieldValue,
  validate,
  resetFields,
  clearValidate
}

provide('formContext', formContext)

// Expose methods for template ref
defineExpose({
  validate,
  resetFields,
  clearValidate,
  errors: computed(() => errors.value)
})
</script>
