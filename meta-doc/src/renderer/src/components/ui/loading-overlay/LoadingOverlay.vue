<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-all duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="show"
        :class="
          cn(
            'absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm',
            props.class
          )
        "
      >
        <div class="flex flex-col items-center gap-2">
          <Loader2 class="h-8 w-8 animate-spin text-primary" />
          <p v-if="message" class="text-sm text-muted-foreground">{{ message }}</p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'
import { cn } from '../../../lib/utils'

interface Props {
  show: boolean
  message?: string
  class?: string
}

const props = withDefaults(defineProps<Props>(), {
  show: false,
  message: ''
})
</script>
