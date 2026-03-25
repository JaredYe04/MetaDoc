<script setup lang="ts">
import { DialogRoot, useForwardPropsEmits, type DialogRootProps } from 'radix-vue'
import { provide, toRef } from 'vue'
import { DIALOG_OPEN_REF_KEY } from './dialogInjection'

const props = withDefaults(defineProps<DialogRootProps>(), {
  modal: true
})
const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const forwarded = useForwardPropsEmits(props, emit)

provide(DIALOG_OPEN_REF_KEY, toRef(props, 'open'))
</script>

<template>
  <DialogRoot v-bind="forwarded">
    <slot />
  </DialogRoot>
</template>
