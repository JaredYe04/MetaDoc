export interface FormValidationError {
  field: string
  message: string
}

export interface FormValidationRule {
  required?: boolean
  message?: string
  pattern?: string | RegExp
  min?: number
  max?: number
  validator?: (rule: any, value: any, callback: (error?: Error) => void) => Promise<void | Error | boolean> | void | Error | boolean
  trigger?: 'blur' | 'change' | 'input'
}

export interface FormContext {
  errors: ComputedRef<Map<string, string>>
  registerField: (name: string, rules?: any[]) => void
  unregisterField: (name: string) => void
  setFieldError: (name: string, error: string | null) => void
  validateField: (name: string, value: any) => Promise<boolean>
  updateFieldValue: (name: string, value: any) => void
  validate: (callback?: (valid: boolean, errors?: FormValidationError[]) => void) => Promise<boolean>
  resetFields: () => void
  clearValidate: () => void
}

import type { ComputedRef } from 'vue'
