import { cva } from 'class-variance-authority'

export { default as Text } from './Text.vue'

export const textVariants = cva('transition-colors', {
  variants: {
    type: {
      primary: 'text-primary',
      success: 'text-green-600 dark:text-green-400',
      warning: 'text-amber-600 dark:text-amber-400',
      danger: 'text-destructive',
      info: 'text-blue-600 dark:text-blue-400'
    }
  },
  defaultVariants: {
    type: null
  }
})
