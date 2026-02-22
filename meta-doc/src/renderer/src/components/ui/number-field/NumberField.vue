<script setup>
import { reactiveOmit } from '@vueuse/core'
import { NumberFieldRoot, useForwardPropsEmits } from 'reka-ui'
import { cn } from '@renderer/lib/utils'
import { computed } from 'vue'

const props = defineProps({
  defaultValue: { type: Number, required: false },
  modelValue: { type: [Number, null], required: false },
  min: { type: Number, required: false },
  max: { type: Number, required: false },
  step: { type: Number, required: false },
  stepSnapping: { type: Boolean, required: false },
  focusOnChange: { type: Boolean, required: false },
  formatOptions: { type: null, required: false },
  locale: { type: String, required: false },
  disabled: { type: Boolean, required: false },
  readonly: { type: Boolean, required: false },
  disableWheelChange: { type: Boolean, required: false },
  invertWheelChange: { type: Boolean, required: false },
  id: { type: String, required: false },
  asChild: { type: Boolean, required: false },
  as: { type: null, required: false },
  name: { type: String, required: false },
  required: { type: Boolean, required: false },
  class: { type: null, required: false },
  // Element UI compatible prop
  precision: { type: Number, required: false }
})
const emits = defineEmits(['update:modelValue'])

// Map Element UI precision to formatOptions
const computedFormatOptions = computed(() => {
  if (props.precision !== undefined) {
    return {
      minimumFractionDigits: props.precision,
      maximumFractionDigits: props.precision
    }
  }
  return props.formatOptions
})

const delegatedProps = reactiveOmit(props, 'class', 'precision', 'formatOptions')

const forwardedProps = computed(() => ({
  ...delegatedProps,
  formatOptions: computedFormatOptions.value
}))

const forwarded = useForwardPropsEmits(forwardedProps, emits)
</script>

<template>
  <NumberFieldRoot v-bind="forwarded" :class="cn('grid gap-1.5 relative', props.class)">
    <slot />
  </NumberFieldRoot>
</template>
