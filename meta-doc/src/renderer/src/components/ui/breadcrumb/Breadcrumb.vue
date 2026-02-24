<script setup lang="ts">
import { computed, provide, readonly } from 'vue'
import { cn } from '@renderer/lib/utils'

interface Props {
  class?: string
  // Element Plus el-breadcrumb compatible props
  separator?: string
  separatorClass?: string
}

const props = withDefaults(defineProps<Props>(), {
  class: '',
  separator: '/',
  separatorClass: ''
})

// Provide separator config to child items
const separatorConfig = computed(() => ({
  separator: props.separator,
  separatorClass: props.separatorClass
}))

// Provide readonly separator config to breadcrumb items
provide('breadcrumbSeparator', readonly(separatorConfig))
</script>

<template>
  <nav
    aria-label="breadcrumb"
    :class="cn('flex flex-wrap items-center text-sm text-muted-foreground', props.class)"
  >
    <ol class="flex flex-wrap items-center gap-1.5 sm:gap-2.5">
      <slot />
    </ol>
  </nav>
</template>
