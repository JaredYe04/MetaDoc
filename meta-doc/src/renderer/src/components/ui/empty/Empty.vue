<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@renderer/lib/utils'

interface Props {
  class?: string
  // Element Plus el-empty compatible props
  description?: string
  imageSize?: number
  image?: string
}

const props = withDefaults(defineProps<Props>(), {
  description: '',
  imageSize: undefined,
  image: undefined
})

const imageStyle = computed(() => {
  if (props.imageSize) {
    return {
      width: `${props.imageSize}px`,
      height: `${props.imageSize}px`
    }
  }
  return {}
})

// Default empty state SVG
const defaultImageSvg = `<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <path fill="currentColor" fill-opacity="0.2" d="M512 512m-448 0a448 448 0 1 0 896 0 448 448 0 1 0-896 0Z"/>
  <path fill="currentColor" fill-opacity="0.6" d="M512 192a64 64 0 0 1 64 64v256a64 64 0 0 1-128 0V256a64 64 0 0 1 64-64zM512 768a64 64 0 1 1 0-128 64 64 0 0 1 0 128z"/>
</svg>`
</script>

<template>
  <div
    :class="cn(
      'flex flex-col items-center justify-center py-12 px-4 text-center',
      props.class
    )"
  >
    <!-- Image Slot -->
    <div
      class="flex items-center justify-center mb-4 text-muted-foreground"
      :style="imageStyle"
    >
      <slot name="image">
        <img
          v-if="image"
          :src="image"
          alt="empty"
          class="w-full h-full object-contain"
        />
        <div
          v-else
          class="w-24 h-24 opacity-50"
          v-html="defaultImageSvg"
        />
      </slot>
    </div>

    <!-- Description Slot -->
    <div class="text-sm text-muted-foreground">
      <slot name="description">
        <slot>
          {{ description }}
        </slot>
      </slot>
    </div>
  </div>
</template>
