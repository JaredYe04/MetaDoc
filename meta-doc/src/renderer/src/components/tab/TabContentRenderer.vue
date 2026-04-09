<template>
  <div class="tab-content-wrapper">
    <router-view v-if="tabs.length === 0" key="router-fallback" />
    <!-- 实体内层：KeepAlive 无 DOM 根，用 div 承接 flex，子树根节点用 > * 铺满宽（避免 :deep 选不中 / GlobalHome 被 overflow 裁没） -->
    <div v-else class="tab-content-inner">
      <div class="tab-active-pane-root">
        <keep-alive :max="48">
          <Editor
            v-if="isDocumentTab && activeWorkspaceTab"
            :key="`editor-${activeWorkspaceTab.id}`"
            :tab-id="activeWorkspaceTab.id"
          />
          <component
            v-else-if="activeMappedComponent && activeWorkspaceTab"
            :is="activeMappedComponent"
            :key="`${activeWorkspaceTab.kind}-${activeWorkspaceTab.route}-${activeWorkspaceTab.id}`"
          />
          <router-view
            v-else-if="useRouterFallback && activeWorkspaceTab"
            :key="`router-${activeWorkspaceTab.id}`"
          />
        </keep-alive>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch, onMounted, nextTick } from 'vue'
import { useWorkspace } from '../stores/workspace'
import { getTabComponent } from '../config/tab-content-config'
import Editor from '../views/Editor.vue'

const workspace = useWorkspace()
const { tabs, activeTabId } = workspace

const activeWorkspaceTab = computed(() => {
  const id = activeTabId.value
  if (!id) return null
  return tabs.find((t) => t.id === id) ?? null
})

const isDocumentTab = computed(() => {
  const t = activeWorkspaceTab.value
  return !!t && (t.kind === 'file' || t.kind === 'new')
})

const activeMappedComponent = computed(() => {
  const t = activeWorkspaceTab.value
  if (!t || (t.kind !== 'system' && t.kind !== 'tool')) return null
  if (!t.route) return null
  return getTabComponent(t.kind, t.route)
})

const useRouterFallback = computed(() => {
  const t = activeWorkspaceTab.value
  if (!t || (t.kind !== 'system' && t.kind !== 'tool')) return false
  return !!t.route && !activeMappedComponent.value
})

const ensureActiveTab = () => {
  if (tabs.length > 0 && !activeTabId.value) {
    workspace.activateTab(tabs[0].id)
  }
}
watch([() => tabs.length, activeTabId], ensureActiveTab)
onMounted(() => {
  nextTick(ensureActiveTab)
})
</script>

<style scoped>
.tab-content-wrapper {
  flex: 1 1 0%;
  min-height: 0;
  min-width: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.tab-content-inner {
  flex: 1 1 0%;
  min-height: 0;
  min-width: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.tab-active-pane-root {
  flex: 1 1 0%;
  min-height: 0;
  min-width: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
}

/*
 * scoped 下「> *」会带本组件 data-v，匹配不到子组件根节点 → 高度链断、GlobalHome 白屏。
 * 用 :deep 穿透到 Editor / GlobalHome 等根元素；勿加 overflow:hidden，避免裁掉主页 ScrollArea/背景。
 */
.tab-active-pane-root > :deep(*) {
  flex: 1 1 0%;
  min-height: 0;
  min-width: 0;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}
</style>
