<script setup lang="ts">
import { DialogRoot, useForwardPropsEmits, type DialogRootProps } from 'radix-vue'

const props = withDefaults(defineProps<DialogRootProps>(), {
  modal: true
})
const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const forwarded = useForwardPropsEmits(props, emit)
</script>

<template>
  <DialogRoot v-bind="forwarded">
    <slot />
  </DialogRoot>
</template>
