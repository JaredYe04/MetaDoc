<template>

  <div

    v-if="props.zone"

    class="tab-drag-split-overlay"

    aria-hidden="true"

  >

    <div

      class="tab-drag-split-overlay__region tab-drag-split-overlay__region--top"

      :class="{ 'is-active': props.zone === 'top' }"

    />

    <div

      class="tab-drag-split-overlay__region tab-drag-split-overlay__region--bottom"

      :class="{ 'is-active': props.zone === 'bottom' }"

    />

    <div

      class="tab-drag-split-overlay__region tab-drag-split-overlay__region--left"

      :class="{ 'is-active': props.zone === 'left' }"

    />

    <div

      class="tab-drag-split-overlay__region tab-drag-split-overlay__region--right"

      :class="{ 'is-active': props.zone === 'right' }"

    />

  </div>

</template>



<script setup lang="ts">

import type { EditorContentDropZone } from '../composables/useTabDrag'



const props = defineProps<{

  zone: EditorContentDropZone

}>()

</script>



<style scoped>

.tab-drag-split-overlay {

  position: absolute;

  inset: 0;

  z-index: 12000;

  pointer-events: none;

}



/* 四块各覆盖整半区，仅一块 is-active，避免「上半」被拆成左右两格 */

.tab-drag-split-overlay__region {

  position: absolute;

  box-sizing: border-box;

  border: 2px solid transparent;

  background: transparent;

  transition: background 0.06s ease, border-color 0.06s ease;

}



.tab-drag-split-overlay__region--top {

  left: 0;

  right: 0;

  top: 0;

  height: 50%;

}



.tab-drag-split-overlay__region--bottom {

  left: 0;

  right: 0;

  bottom: 0;

  top: 50%;

}



.tab-drag-split-overlay__region--left {

  left: 0;

  top: 0;

  bottom: 0;

  width: 50%;

}



.tab-drag-split-overlay__region--right {

  right: 0;

  top: 0;

  bottom: 0;

  width: 50%;

}



.tab-drag-split-overlay__region.is-active {

  background: hsl(var(--primary) / 0.18);

  border-color: hsl(var(--primary) / 0.55);

}

</style>

