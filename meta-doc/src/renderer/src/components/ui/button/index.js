import { cva } from 'class-variance-authority'

export { default as Button } from './Button.vue'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80',
        outline:
          'border border-input bg-background hover:bg-accent hover:text-accent-foreground active:bg-accent/80',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80 active:bg-secondary/70',
        ghost: 'hover:bg-accent hover:text-accent-foreground active:bg-accent/80',
        link: 'text-primary underline-offset-4 hover:underline active:opacity-80'
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
        'icon-sm': 'size-9',
        'icon-lg': 'size-11'
      },
      circle: {
        true: '',
        false: ''
      }
    },
    compoundVariants: [
      // 圆形按钮：统一缩小 + 明确 hover/active 反馈（过渡与按下缩放）
      {
        circle: true,
        class:
          '!size-8 !min-h-8 !min-w-8 !h-8 !w-8 !p-0 [&_svg]:size-4 shrink-0 transition-transform duration-150 ease-out hover:brightness-95 active:!scale-[0.94]'
      },
      // 默认/primary 圆形：浅色下不用黑底白字，改为柔和灰底灰字
      {
        circle: true,
        variant: 'default',
        class:
          '!bg-muted/80 !text-muted-foreground hover:!bg-muted hover:!text-foreground active:!bg-muted/90 active:!text-foreground border-0'
      },
      // ghost 圆形：与整体一致的自然色
      {
        circle: true,
        variant: 'ghost',
        class:
          '!text-muted-foreground hover:!bg-muted hover:!text-foreground active:!bg-muted/90 active:!text-foreground border-0'
      },
      // outline/info 圆形：柔和边框风格
      {
        circle: true,
        variant: 'outline',
        class:
          '!bg-muted/50 !text-muted-foreground hover:!bg-muted hover:!text-foreground active:!bg-muted/90 active:!text-foreground border border-border/80'
      },
      // secondary 圆形：稍弱化
      {
        circle: true,
        variant: 'secondary',
        class:
          '!bg-muted/80 !text-muted-foreground hover:!bg-muted hover:!text-foreground active:!bg-muted/90 active:!text-foreground border-0'
      }
    ],
    defaultVariants: {
      variant: 'default',
      size: 'default',
      circle: false
    }
  }
)
