<script setup lang="ts">
import { computed, useSlots } from 'vue'
import { cn } from '@renderer/lib/utils'

type ProgressStatus = 'success' | 'exception' | 'warning' | ''

interface Props {
  // shadcn-vue compatible props
  modelValue?: number
  max?: number
  class?: string
  // Element Plus el-progress compatible props
  percentage?: number
  status?: ProgressStatus
  strokeWidth?: number
  textInside?: boolean
  showText?: boolean
  color?: string
  format?: (percentage: number) => string
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: 0,
  max: 100,
  class: '',
  percentage: undefined,
  status: '',
  strokeWidth: 6,
  textInside: false,
  showText: true,
  color: '',
  format: undefined
})

const slots = useSlots()

// 计算百分比进度（兼容 shadcn-vue 的 modelValue/max 和 el-progress 的 percentage）
const computedPercentage = computed(() => {
  // 如果提供了 percentage 属性，优先使用（el-progress 模式）
  if (props.percentage !== undefined) {
    return Math.max(0, Math.min(100, props.percentage))
  }
  // 否则使用 modelValue/max（shadcn-vue 模式）
  const value = Math.max(0, Math.min(props.max, props.modelValue))
  return Math.round((value / props.max) * 100)
})

// 根据状态获取颜色类名
const statusColorClass = computed(() => {
  switch (props.status) {
    case 'success':
      return 'bg-green-500'
    case 'exception':
      return 'bg-red-500'
    case 'warning':
      return 'bg-yellow-500'
    default:
      return 'bg-primary'
  }
})

// 根据状态获取文字颜色类名
const statusTextClass = computed(() => {
  switch (props.status) {
    case 'success':
      return 'text-green-600 dark:text-green-400'
    case 'exception':
      return 'text-red-600 dark:text-red-400'
    case 'warning':
      return 'text-yellow-600 dark:text-yellow-400'
    default:
      return 'text-primary'
  }
})

// 格式化显示的文本
const displayText = computed(() => {
  if (props.format) {
    return props.format(computedPercentage.value)
  }
  return `${computedPercentage.value}%`
})

// 是否有自定义内容插槽
const hasDefaultSlot = computed(() => !!slots.default)

// 进度条样式
const progressStyle = computed(() => {
  const style: Record<string, string> = {
    width: `${computedPercentage.value}%`,
    height: `${props.strokeWidth}px`
  }
  if (props.color) {
    style.backgroundColor = props.color
  }
  return style
})

// 容器高度样式
const containerStyle = computed(() => {
  return {
    height: `${props.strokeWidth}px`
  }
})
</script>

<template>
  <div
    :class="cn('w-full', props.class)"
    role="progressbar"
    :aria-valuenow="computedPercentage"
    aria-valuemin="0"
    aria-valuemax="100"
  >
    <div class="flex items-center gap-3">
      <!-- 进度条容器 -->
      <div
        :class="
          cn(
            'relative flex-1 overflow-hidden rounded-full bg-secondary',
            textInside && 'flex items-center'
          )
        "
        :style="containerStyle"
      >
        <!-- 进度条填充 -->
        <div
          :class="
            cn(
              'absolute left-0 top-0 transition-all duration-300 ease-in-out rounded-full',
              statusColorClass,
              computedPercentage === 0 && 'opacity-0'
            )
          "
          :style="progressStyle"
        />

        <!-- 内置文字（textInside 模式） -->
        <span
          v-if="showText && textInside"
          :class="
            cn(
              'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-xs font-medium text-white z-10 whitespace-nowrap',
              computedPercentage === 0 && 'opacity-0'
            )
          "
        >
          <slot :percentage="computedPercentage">{{ displayText }}</slot>
        </span>
      </div>

      <!-- 外部文字（非 textInside 模式） -->
      <template v-if="showText && !textInside">
        <span
          v-if="!hasDefaultSlot"
          :class="cn('text-sm font-medium min-w-[3rem] text-right', statusTextClass)"
        >
          {{ displayText }}
        </span>

        <span
          v-else
          :class="cn('text-sm font-medium min-w-[3rem] text-right', statusTextClass)"
        >
          <slot :percentage="computedPercentage" />
        </span>
      </template>
    </div>
  </div>
</template>
