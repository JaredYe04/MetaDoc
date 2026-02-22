<script setup>
import {
  inject,
  onMounted,
  onUnmounted,
  getCurrentInstance,
  computed,
  ref,
  watch,
  useSlots
} from 'vue'

defineOptions({
  name: 'DescriptionsItem'
})

const props = defineProps({
  label: {
    type: String,
    default: ''
  },
  span: {
    type: Number,
    default: 1
  },
  content: {
    type: String,
    default: ''
  }
})

const register = inject('registerDescriptionsItem')
const unregister = inject('unregisterDescriptionsItem')

// Generate unique slot name
const instance = getCurrentInstance()
const slotName = `item-${instance?.uid || Math.random().toString(36).substr(2, 9)}`

const slots = useSlots()

// Create a reactive item object
const item = ref({
  label: props.label,
  span: props.span,
  content: props.content,
  slotName,
  hasSlot: computed(() => !!slots.default)
})

// Watch for prop changes and update item
watch(
  () => [props.label, props.span, props.content],
  ([newLabel, newSpan, newContent]) => {
    item.value.label = newLabel
    item.value.span = newSpan
    item.value.content = newContent
  }
)

onMounted(() => {
  if (register) {
    register(item.value)
  }
})

onUnmounted(() => {
  if (unregister) {
    unregister(item.value)
  }
})
</script>

<template>
  <!-- This component doesn't render anything itself -->
  <!-- It registers itself with the parent Descriptions component -->
  <div style="display: none;">
    <slot />
  </div>
</template>
