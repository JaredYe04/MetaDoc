import { cva } from 'class-variance-authority'

export { default as Link } from './Link.vue'

export const linkVariants = cva(
  'inline-flex items-center gap-1 transition-all duration-200 ease-out font-medium',
  {
    variants: {
      type: {
        primary: 'text-primary hover:text-primary/80',
        success:
          'text-emerald-600 hover:text-emerald-700 dark:text-emerald-500 dark:hover:text-emerald-400',
        warning:
          'text-amber-600 hover:text-amber-700 dark:text-amber-500 dark:hover:text-amber-400',
        danger: 'text-destructive hover:text-destructive/80',
        info: 'text-sky-600 hover:text-sky-700 dark:text-sky-500 dark:hover:text-sky-400'
      },
      underline: {
        true: 'relative after:absolute after:bottom-0 after:left-0 after:h-[1px] after:w-0 hover:after:w-full after:transition-all after:duration-300 after:ease-out',
        false: 'no-underline'
      }
    },
    compoundVariants: [
      {
        type: 'primary',
        underline: true,
        class: 'after:bg-primary'
      },
      {
        type: 'success',
        underline: true,
        class: 'after:bg-emerald-600 dark:after:bg-emerald-500'
      },
      {
        type: 'warning',
        underline: true,
        class: 'after:bg-amber-600 dark:after:bg-amber-500'
      },
      {
        type: 'danger',
        underline: true,
        class: 'after:bg-destructive'
      },
      {
        type: 'info',
        underline: true,
        class: 'after:bg-sky-600 dark:after:bg-sky-500'
      }
    ],
    defaultVariants: {
      type: 'primary',
      underline: true
    }
  }
)
