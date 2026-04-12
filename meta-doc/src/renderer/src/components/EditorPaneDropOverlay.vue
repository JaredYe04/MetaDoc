<template>
  <div v-if="show" class="editor-pane-drop-overlay" aria-hidden="true">
    <div
      class="editor-pane-drop-overlay__region editor-pane-drop-overlay__region--top"
      :class="{ 'is-active': activeZone === 'top' }"
    />
    <div
      class="editor-pane-drop-overlay__region editor-pane-drop-overlay__region--bottom"
      :class="{ 'is-active': activeZone === 'bottom' }"
    />
    <div
      class="editor-pane-drop-overlay__region editor-pane-drop-overlay__region--left"
      :class="{ 'is-active': activeZone === 'left' }"
    />
    <div
      class="editor-pane-drop-overlay__region editor-pane-drop-overlay__region--right"
      :class="{ 'is-active': activeZone === 'right' }"
    />
    <div
      class="editor-pane-drop-overlay__region editor-pane-drop-overlay__region--full"
      :class="{ 'is-active': activeZone === 'full' }"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { editorPaneDropUi, type EditorPaneContentZone } from '../composables/useTabDrag'

const props = defineProps<{
  paneKey: string
}>()

const show = computed(() => {
  const ui = editorPaneDropUi.value
  return !!(ui && ui.paneKey === props.paneKey)
})

const activeZone = computed<EditorPaneContentZone | null>(() => {
  if (!show.value || !editorPaneDropUi.value) return null
  return editorPaneDropUi.value.zone
})
</script>

<style scoped>
.editor-pane-drop-overlay {
  position: absolute;
  inset: 0;
  z-index: 12000;
  pointer-events: none;
}

.editor-pane-drop-overlay__region {
  position: absolute;
  box-sizing: border-box;
  border: 2px solid transparent;
  background: transparent;
  transition:
    background 0.06s ease,
    border-color 0.06s ease;
}

.editor-pane-drop-overlay__region--top {
  left: 0;
  right: 0;
  top: 0;
  height: 50%;
}

.editor-pane-drop-overlay__region--bottom {
  left: 0;
  right: 0;
  bottom: 0;
  height: 50%;
}

.editor-pane-drop-overlay__region--left {
  left: 0;
  top: 0;
  bottom: 0;
  width: 50%;
}

.editor-pane-drop-overlay__region--right {
  right: 0;
  top: 0;
  bottom: 0;
  width: 50%;
}

.editor-pane-drop-overlay__region--full {
  inset: 0;
}

.editor-pane-drop-overlay__region.is-active {
  background: hsl(var(--primary) / 0.18);
  border-color: hsl(var(--primary) / 0.55);
}
</style>
