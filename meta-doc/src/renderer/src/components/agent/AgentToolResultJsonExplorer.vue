<template>
  <div class="tool-result-json-explorer">
    <div v-if="normalized.kind === 'text'" class="tool-result-json-explorer-fallback">
      <p class="tool-result-json-explorer-hint">{{ t('agent.jsonExplorer.nonJsonHint') }}</p>
      <el-scrollbar :max-height="scrollMaxHeight" class="tool-result-json-explorer-scroll rounded-md border border-input">
        <pre class="tool-result-json-explorer-pre">{{ normalized.text }}</pre>
      </el-scrollbar>
    </div>
    <template v-else>
      <div class="tool-result-json-explorer-tabs" role="tablist">
        <button
          v-if="canShowTree"
          type="button"
          class="tool-result-json-explorer-tab"
          :class="{ 'is-active': viewMode === 'tree' }"
          role="tab"
          :aria-selected="viewMode === 'tree'"
          @click="viewMode = 'tree'"
        >
          {{ t('agent.jsonExplorer.tree') }}
        </button>
        <button
          type="button"
          class="tool-result-json-explorer-tab"
          :class="{ 'is-active': viewMode === 'json' }"
          role="tab"
          :aria-selected="viewMode === 'json'"
          @click="viewMode = 'json'"
        >
          {{ t('agent.jsonExplorer.json') }}
        </button>
      </div>
      <div v-show="viewMode === 'tree' && canShowTree" class="tool-result-json-explorer-panel">
        <el-scrollbar :max-height="scrollMaxHeight" class="tool-result-json-explorer-scroll rounded-md border border-input">
          <Tree
            :data="treeData"
            node-key="id"
            :default-expand-all="false"
            class="tool-result-json-tree p-2"
            :expand-on-click-node="true"
          >
            <template #default="{ data: nodeData }">
              <span class="tool-result-json-tree-label font-mono text-xs truncate">{{ nodeData.label }}</span>
            </template>
          </Tree>
        </el-scrollbar>
      </div>
      <div v-show="viewMode === 'json' || !canShowTree" class="tool-result-json-explorer-panel">
        <ReadonlyJsonMonacoBlock :model-value="jsonText" :max-height="monacoHeight" :compact="compact" />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Tree, type TreeNode } from '@renderer/components/ui/tree'
import ReadonlyJsonMonacoBlock from './ReadonlyJsonMonacoBlock.vue'

const props = withDefaults(
  defineProps<{
    data: unknown
    compact?: boolean
  }>(),
  { compact: false }
)

const { t } = useI18n()

const scrollMaxHeight = computed(() => (props.compact ? 200 : 280))
const monacoHeight = computed(() => (props.compact ? '200px' : '280px'))

type Normalized =
  | { kind: 'json'; value: unknown }
  | { kind: 'text'; text: string }

const normalized = computed<Normalized>(() => {
  const raw = props.data
  if (raw === null || raw === undefined) {
    return { kind: 'json', value: null }
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (trimmed === '') {
      return { kind: 'json', value: '' }
    }
    try {
      return { kind: 'json', value: JSON.parse(trimmed) }
    } catch {
      return { kind: 'text', text: raw }
    }
  }
  return { kind: 'json', value: raw }
})

const jsonText = computed(() => {
  const n = normalized.value
  if (n.kind === 'text') {
    return n.text
  }
  try {
    return JSON.stringify(n.value, null, 2)
  } catch {
    return String(n.value)
  }
})

const canShowTree = computed(() => {
  const n = normalized.value
  if (n.kind !== 'json') return false
  const v = n.value
  return v !== null && typeof v === 'object'
})

const viewMode = ref<'tree' | 'json'>('tree')

watch(
  canShowTree,
  (c) => {
    if (!c) {
      viewMode.value = 'json'
    }
  },
  { immediate: true }
)

let jsonTreeIdCounter = 0

function jsonValueToNode(value: unknown, key: string): TreeNode {
  const id = `jt-${jsonTreeIdCounter++}`
  const prefix = key === '' ? '' : `${key}: `

  if (value === null) {
    return { id, label: `${prefix}null`, isLeaf: true }
  }
  if (typeof value === 'boolean' || typeof value === 'number') {
    return { id, label: `${prefix}${String(value)}`, isLeaf: true }
  }
  if (typeof value === 'string') {
    const s = value.length > 100 ? `${value.slice(0, 97)}…` : value
    return { id, label: `${prefix}"${s.replace(/\r?\n/g, '↵')}"`, isLeaf: true }
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return { id, label: key === '' ? '[]' : `${prefix}[]`, isLeaf: true }
    }
    return {
      id,
      label: key === '' ? `Array (${value.length})` : `${prefix}[${value.length}]`,
      children: value.map((item, i) => jsonValueToNode(item, `[${i}]`))
    }
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>
    const keys = Object.keys(o)
    if (keys.length === 0) {
      return { id, label: key === '' ? '{}' : `${prefix}{}`, isLeaf: true }
    }
    return {
      id,
      label: key === '' ? `Object (${keys.length})` : `${prefix}{${keys.length}}`,
      children: keys.map((k) => jsonValueToNode(o[k], k))
    }
  }
  return { id, label: `${prefix}${String(value)}`, isLeaf: true }
}

const treeData = computed<TreeNode[]>(() => {
  const n = normalized.value
  if (n.kind !== 'json') {
    return []
  }
  jsonTreeIdCounter = 0
  return [jsonValueToNode(n.value, '')]
})
</script>

<style scoped>
.tool-result-json-explorer {
  width: 100%;
  min-width: 0;
}

.tool-result-json-explorer-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
}

.tool-result-json-explorer-tab {
  padding: 4px 10px;
  font-size: 12px;
  border-radius: 6px;
  border: 1px solid var(--el-border-color);
  background: transparent;
  color: inherit;
  cursor: pointer;
  opacity: 0.85;
}

.tool-result-json-explorer-tab:hover {
  opacity: 1;
}

.tool-result-json-explorer-tab.is-active {
  font-weight: 600;
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}

.tool-result-json-explorer-panel {
  min-height: 0;
}

.tool-result-json-explorer-scroll :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
}

.tool-result-json-tree :deep(.el-tree-node__content) {
  border-radius: 4px;
  min-height: 28px;
}

.tool-result-json-explorer-hint {
  margin: 0 0 6px;
  font-size: 11px;
  opacity: 0.75;
}

.tool-result-json-explorer-pre {
  margin: 0;
  padding: 8px 10px;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'JetBrains Mono', Consolas, monospace;
}

.tool-result-json-explorer-fallback {
  min-height: 0;
}
</style>
