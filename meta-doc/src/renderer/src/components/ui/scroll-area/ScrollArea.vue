<script setup>
import { reactiveOmit } from '@vueuse/core'
import { ScrollAreaCorner, ScrollAreaRoot, ScrollAreaViewport } from 'reka-ui'
import { cn } from '@renderer/lib/utils'
import ScrollBar from './ScrollBar.vue'

const props = defineProps({
  type: { type: String, required: false },
  dir: { type: String, required: false },
  scrollHideDelay: { type: Number, required: false },
  asChild: { type: Boolean, required: false },
  as: { type: null, required: false },
  class: { type: null, required: false },
  /**
   * 为 false 时不挂载横向 ScrollBar。reka-ui 在存在横向条时会给内容根设置内联 min-width: fit-content，
   * 窄容器下会撑破布局（如 GlobalHome）；仅纵向滚动时应关横条。
   */
  showHorizontalScrollbar: { type: Boolean, default: true }
})

const delegatedProps = reactiveOmit(props, 'class', 'showHorizontalScrollbar')
</script>

<template>
  <ScrollAreaRoot v-bind="delegatedProps" :class="cn('relative overflow-hidden', props.class)">
    <ScrollAreaViewport class="h-full w-full rounded-[inherit]">
      <slot />
    </ScrollAreaViewport>
    <ScrollBar v-if="showHorizontalScrollbar" orientation="horizontal" />
    <ScrollBar />
    <ScrollAreaCorner v-if="showHorizontalScrollbar" />
  </ScrollAreaRoot>
</template>
