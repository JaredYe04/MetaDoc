<template>
  <WorkspacePaneGroup v-if="isLayoutTabGroup(node)" :group="node" />
  <div
    v-else
    ref="branchRef"
    class="workspace-split-branch"
    :class="node.direction === 'row' ? 'is-row' : 'is-col'"
  >
    <WorkspaceSplitRenderer :node="node.children[0]" class="split-pane" :style="paneStyle(0)" />
    <div
      class="split-gutter"
      :class="node.direction === 'row' ? 'gutter-col' : 'gutter-row'"
      @mousedown.prevent="onGutterDown(node)"
    />
    <WorkspaceSplitRenderer :node="node.children[1]" class="split-pane" :style="paneStyle(1)" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { LayoutNode, LayoutSplit } from '../stores/workspace-layout'
import { isLayoutTabGroup } from '../stores/workspace-layout'
import WorkspacePaneGroup from './WorkspacePaneGroup.vue'
import WorkspaceSplitRenderer from './WorkspaceSplitRenderer.vue'

const props = defineProps<{
  node: LayoutNode
}>()

const branchRef = ref<HTMLElement | null>(null)

function paneStyle(index: 0 | 1): Record<string, string> {
  const n = props.node
  if (!isLayoutTabGroup(n)) {
    const r = index === 0 ? n.ratio : 1 - n.ratio
    return { flex: `${r} 1 0%`, minWidth: '0', minHeight: '0' }
  }
  return {}
}

function onGutterDown(split: LayoutSplit): void {
  const el = branchRef.value
  if (!el) return

  const onMove = (ev: MouseEvent): void => {
    const rect = el.getBoundingClientRect()
    let r: number
    if (split.direction === 'row') {
      r = (ev.clientX - rect.left) / rect.width
    } else {
      r = (ev.clientY - rect.top) / rect.height
    }
    split.ratio = Math.min(0.92, Math.max(0.08, r))
  }

  const onUp = (): void => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}
</script>

<style scoped>
.workspace-split-branch {
  display: flex;
  flex: 1 1 0%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.workspace-split-branch.is-row {
  flex-direction: row;
}

.workspace-split-branch.is-col {
  flex-direction: column;
}

.split-pane {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.split-gutter {
  flex-shrink: 0;
  background: hsl(var(--border));
  opacity: 0.65;
}

.split-gutter:hover {
  opacity: 1;
}

.gutter-col {
  width: 5px;
  cursor: col-resize;
}

.gutter-row {
  height: 5px;
  cursor: row-resize;
}
</style>
