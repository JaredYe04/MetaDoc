<script setup>
import { computed } from 'vue'
import { toRaw } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { SliderRoot, SliderTrack, SliderRange, SliderThumb, useForwardPropsEmits } from 'reka-ui'
import { cn } from '@renderer/lib/utils'

const props = defineProps({
  modelValue: { type: [Number, Array], required: false },
  defaultValue: { type: [Number, Array], required: false },
  min: { type: Number, required: false, default: 0 },
  max: { type: Number, required: false, default: 100 },
  step: { type: Number, required: false, default: 1 },
  disabled: { type: Boolean, required: false },
  orientation: { type: String, required: false, default: 'horizontal' },
  dir: { type: String, required: false },
  inverted: { type: Boolean, required: false },
  minStepsBetweenThumbs: { type: Number, required: false },
  name: { type: String, required: false },
  asChild: { type: Boolean, required: false },
  as: { type: null, required: false },
  class: { type: null, required: false },
  // Element Plus compatible props
  range: { type: Boolean, required: false, default: false },
  showInput: { type: Boolean, required: false, default: false },
  showStops: { type: Boolean, required: false, default: false },
  showTooltip: { type: Boolean, required: false, default: true },
  formatTooltip: { type: Function, required: false },
  debounce: { type: Number, required: false, default: 300 },
  tooltipClass: { type: String, required: false },
  marks: { type: Object, required: false },
  validateEvent: { type: Boolean, required: false, default: true }
})

const emits = defineEmits(['update:modelValue', 'value-commit'])

// 计算当前值，确保是数组格式（reka-ui 需要）
const computedModelValue = computed(() => {
  const rawValue = toRaw(props.modelValue)
  if (rawValue !== undefined && rawValue !== null) {
    // 如果是 range 模式，确保是数组
    if (props.range) {
      return Array.isArray(rawValue) ? rawValue : [rawValue]
    }
    // 非 range 模式，reka-ui 期望数组格式
    return [rawValue]
  }
  // 使用默认值
  const rawDefault = toRaw(props.defaultValue)
  const defaultVal =
    rawDefault !== undefined && rawDefault !== null ? rawDefault : (props.min + props.max) / 2
  return props.range && Array.isArray(defaultVal) ? defaultVal : [defaultVal]
})

// 处理值更新，将数组转换回数字，确保返回原始值
const handleUpdate = (val) => {
  // 使用 toRaw 确保返回的是原始值而不是 Proxy
  const rawVal = toRaw(val)
  if (props.range) {
    emits('update:modelValue', rawVal)
  } else {
    // 非 range 模式，取第一个值并确保是数字
    const numVal = Array.isArray(rawVal) ? Number(rawVal[0]) : Number(rawVal)
    emits('update:modelValue', numVal)
  }
}

const delegatedProps = reactiveOmit(props, 'class', 'modelValue')

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <SliderRoot
    v-bind="forwarded"
    :model-value="computedModelValue"
    :class="
      cn(
        'relative flex w-full touch-none select-none items-center',
        props.orientation === 'vertical' && 'h-full flex-col',
        props.class
      )
    "
    @update:model-value="handleUpdate"
  >
    <SliderTrack
      :class="
        cn(
          'relative w-full grow overflow-hidden rounded-full bg-secondary',
          props.orientation === 'horizontal' ? 'h-2' : 'h-full w-2'
        )
      "
    >
      <SliderRange
        :class="cn('absolute bg-primary', props.orientation === 'horizontal' ? 'h-full' : 'w-full')"
      />
    </SliderTrack>
    <SliderThumb
      v-for="(_, index) in computedModelValue"
      :key="index"
      :class="
        cn(
          'block h-5 w-5 rounded-full border-2 border-primary bg-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50'
        )
      "
    />
  </SliderRoot>
</template>
