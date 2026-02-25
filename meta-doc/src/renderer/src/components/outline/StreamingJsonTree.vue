<template>
  <div class="streaming-json-tree">
    <template v-if="parsed">
      <ul class="streaming-json-tree__list">
        <li v-for="(node, i) in parsed.nodes" :key="i" class="streaming-json-tree__item">
          <span class="streaming-json-tree__title">{{ node.title || '(无标题)' }}</span>
          <StreamingJsonTree
            v-if="node.children?.length"
            :raw="jsonStringify(node.children)"
            class="streaming-json-tree__children"
          />
        </li>
      </ul>
    </template>
    <div v-else-if="rawTrim" class="streaming-json-tree__raw">{{ rawTrim }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ raw: string }>()

/** 尝试将可能未闭合的流式 JSON 补全并解析为大纲节点数组 */
function tryParseStreamingOutlineJson(raw: string): { title: string; children?: any[] }[] | null {
  if (!raw || typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  const first = trimmed[0]
  if (first !== '[' && first !== '{') return null

  const stack: ('[' | '{')[] = []
  for (let i = 0; i < trimmed.length; i++) {
    const c = trimmed[i]
    if (c === '[' || c === '{') stack.push(c === '[' ? '[' : '{')
    else if (c === ']' || c === '}') {
      if (
        stack.length &&
        ((c === ']' && stack[stack.length - 1] === '[') ||
          (c === '}' && stack[stack.length - 1] === '{'))
      )
        stack.pop()
    }
  }
  const closers = stack
    .map((b) => (b === '[' ? ']' : '}'))
    .reverse()
    .join('')
  const closed = trimmed + closers

  try {
    const parsed = JSON.parse(closed) as any
    const arr = Array.isArray(parsed)
      ? parsed
      : (parsed?.children ?? (parsed && typeof parsed === 'object' ? [parsed] : []))
    if (!Array.isArray(arr)) return null
    return arr.map((item: any) => ({
      title:
        typeof item?.title === 'string'
          ? item.title
          : typeof item?.name === 'string'
            ? item.name
            : '',
      children:
        Array.isArray(item?.children) && item.children.length > 0 ? item.children : undefined
    }))
  } catch {
    return null
  }
}

function jsonStringify(children: any[]): string {
  try {
    return JSON.stringify(children)
  } catch {
    return '[]'
  }
}

const rawTrim = computed(() => props.raw?.trim() || '')

const parsed = computed(() => {
  const nodes = tryParseStreamingOutlineJson(props.raw)
  if (!nodes || nodes.length === 0) return null
  return { nodes }
})
</script>

<style scoped lang="less">
.streaming-json-tree {
  font-size: 12px;
  line-height: 1.4;
  color: var(--el-text-color-regular);
}

.streaming-json-tree__list {
  margin: 0;
  padding-left: 14px;
  list-style: none;
  border-left: 1px solid rgba(128, 128, 128, 0.25);
}

.streaming-json-tree__item {
  margin: 2px 0;
}

.streaming-json-tree__title {
  display: block;
}

.streaming-json-tree__children {
  margin-top: 2px;
  margin-left: 4px;
}

.streaming-json-tree__raw {
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--el-font-family-mono);
  font-size: 11px;
  opacity: 0.85;
  max-height: 160px;
  overflow-y: auto;
}
</style>
