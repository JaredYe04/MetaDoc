<template>
  <div
    ref="rootRef"
    class="agent-ref-composer-input"
    contenteditable="true"
    :data-placeholder="placeholder"
    :class="{ 'is-disabled': disabled }"
    @input="onInput"
    @keydown="onKeydown"
  >
    <template v-for="(seg, i) in segments" :key="segmentKey(i)">
      <span v-if="seg.type === 'text'" class="ref-input-text">{{ seg.value }}</span>
      <AtTag
        v-else
        :raw-value="seg.atValue!"
        :label="getAtLabel(seg.atValue!)"
        @remove="removeAt(seg.atValue!)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import AtTag from './AtTag.vue'

/**
 * Tag 以闭合形式存储：@[path] 或 @[tab:id]
 * 方括号内为 tag 的唯一边界，前后任意文字都不会影响 tag 范围，tag 作为只读的闭合符号存在。
 * 路径中不应包含 ]，否则需转义（常见路径通常不包含 ]）。
 */
const AT_PATTERN = /@\[([^\]]+)\]/g

export type Segment = { type: 'text'; value: string } | { type: 'at'; atValue: string }

function parseSegments(value: string): Segment[] {
  if (!value) return [{ type: 'text', value: '' }]
  const parts: Segment[] = []
  let lastIndex = 0
  let m: RegExpExecArray | null
  AT_PATTERN.lastIndex = 0
  while ((m = AT_PATTERN.exec(value)) !== null) {
    if (m.index > lastIndex) {
      parts.push({ type: 'text', value: value.slice(lastIndex, m.index) })
    }
    parts.push({ type: 'at', atValue: m[1] })
    lastIndex = m.index + m[0].length
  }
  if (lastIndex < value.length) {
    parts.push({ type: 'text', value: value.slice(lastIndex) })
  }
  if (parts.length === 0) parts.push({ type: 'text', value: '' })
  return parts
}

function serializeSegments(segs: Segment[]): string {
  return segs
    .map((s) => (s.type === 'text' ? s.value : `@[${s.atValue}]`))
    .join('')
}

const props = withDefaults(
  defineProps<{
    modelValue: string
    /** 根据 @ 的原始值（path 或 tab:id）返回展示文案，如文件名或标签页标题 */
    getAtLabel?: (rawValue: string) => string
    placeholder?: string
    disabled?: boolean
  }>(),
  { getAtLabel: undefined, placeholder: '', disabled: false }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'open-reference-picker'): void
  (e: 'keydown', event: KeyboardEvent): void
}>()

const rootRef = ref<HTMLDivElement | null>(null)
const segments = ref<Segment[]>(parseSegments(props.modelValue))
const lastEmitted = ref(props.modelValue)
const isInternal = ref(false)
const skipNextInput = ref(false)
/** 从 props 同步后一段时间内不根据 DOM 回写，避免切换会话时 DOM 未就绪导致只保留 tag 丢失文字 */
const lastSyncedFromPropsAt = ref<number>(0)
const savedInsertOffset = ref<number | null>(null)
const SYNC_GUARD_MS = 200

function getAtLabel(rawValue: string): string {
  if (props.getAtLabel) return props.getAtLabel(rawValue)
  if (rawValue.startsWith('tab:')) return rawValue.slice(4)
  return rawValue.replace(/^.*[/\\]/, '') || rawValue
}

function segmentKey(i: number): string {
  const seg = segments.value[i]
  if (!seg) return `seg-${i}`
  if (seg.type === 'at') return `at-${seg.atValue}-${i}`
  return `text-${i}`
}

watch(
  () => props.modelValue,
  (val) => {
    if (isInternal.value) {
      isInternal.value = false
      return
    }
    if (val === lastEmitted.value) return
    segments.value = parseSegments(val)
    lastEmitted.value = val
    lastSyncedFromPropsAt.value = Date.now()
    skipNextInput.value = true
    nextTick(removeStrayTextNodes)
    setTimeout(() => {
      skipNextInput.value = false
    }, 80)
  },
  { immediate: true }
)

function saveSelection(): { anchorNode: Node; anchorOffset: number; focusNode: Node; focusOffset: number } | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  return {
    anchorNode: sel.anchorNode!,
    anchorOffset: sel.anchorOffset,
    focusNode: sel.focusNode!,
    focusOffset: sel.focusOffset
  }
}

function restoreSelection(saved: { anchorNode: Node; anchorOffset: number; focusNode: Node; focusOffset: number } | null) {
  if (!saved) return
  const sel = window.getSelection()
  if (!sel) return
  try {
    const range = document.createRange()
    range.setStart(saved.anchorNode, saved.anchorOffset)
    range.setEnd(saved.focusNode, saved.focusOffset)
    sel.removeAllRanges()
    sel.addRange(range)
  } catch (_) {
    /* ignore */
  }
}

function collectFromDom(): { segments: Segment[]; value: string } {
  const el = rootRef.value
  if (!el) return { segments: [], value: '' }
  const segs: Segment[] = []
  for (let i = 0; i < el.childNodes.length; i++) {
    const node = el.childNodes[i]
    if (node.nodeType === Node.ELEMENT_NODE) {
      const elNode = node as HTMLElement
      if (elNode.classList?.contains('at-tag')) {
        const val = elNode.getAttribute?.('data-at-value')
        if (val) segs.push({ type: 'at', atValue: val })
        continue
      }
      if (elNode.classList?.contains('ref-input-text')) {
        const t = elNode.textContent || ''
        segs.push({ type: 'text', value: t })
        continue
      }
      // 未知元素或浏览器插入的节点：按纯文本收集，避免丢失内容
      const t = elNode.textContent || ''
      if (t.length > 0) segs.push({ type: 'text', value: t })
      continue
    }
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent || '').replace(/\u200b/g, '') // 零宽字符忽略
      if (t.length > 0) segs.push({ type: 'text', value: t })
    }
  }
  if (segs.length === 0) segs.push({ type: 'text', value: '' })
  const value = serializeSegments(segs)
  return { segments: segs, value }
}

function onInput() {
  if (props.disabled) return
  if (skipNextInput.value) {
    skipNextInput.value = false
    return
  }
  // 切换会话后刚从 props 恢复时，DOM 可能尚未渲染完整，若此时用 DOM 回写会只保留 tag 丢失文字
  if (Date.now() - lastSyncedFromPropsAt.value < SYNC_GUARD_MS) {
    return
  }
  const saved = saveSelection()
  const { value } = collectFromDom()
  if (value === lastEmitted.value) {
    nextTick(() => restoreSelection(saved))
    return
  }
  segments.value = parseSegments(value)
  lastEmitted.value = value
  isInternal.value = true
  emit('update:modelValue', value)
  nextTick(() => {
    removeStrayTextNodes()
    restoreSelection(saved)
  })
}

/** 移除 contenteditable 内由浏览器插入的裸文本节点，避免与 Vue 渲染的 .ref-input-text 重复被 collectFromDom 收集导致内容重复 */
function removeStrayTextNodes() {
  const el = rootRef.value
  if (!el) return
  const toRemove: ChildNode[] = []
  for (let i = 0; i < el.childNodes.length; i++) {
    const node = el.childNodes[i]
    if (node.nodeType === Node.TEXT_NODE) {
      toRemove.push(node)
    }
  }
  toRemove.forEach((n) => n.remove())
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === '@') {
    savedInsertOffset.value = getCursorOffset()
    emit('open-reference-picker')
    e.preventDefault()
    return
  }
  if (e.key === 'Backspace' && !props.disabled) {
    const el = rootRef.value
    const sel = window.getSelection()
    if (!el || !sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    if (!range.collapsed) return
    let targetAtTag: HTMLElement | null = null
    const startContainer = range.startContainer
    const startOffset = range.startOffset
    if (startOffset === 0) {
      let node: Node | null = startContainer
      const parent = node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode
      if (parent) {
        let prev: Node | null = parent.previousSibling
        while (prev) {
          if (prev.nodeType === Node.ELEMENT_NODE && (prev as HTMLElement).classList?.contains('at-tag')) {
            targetAtTag = prev as HTMLElement
            break
          }
          if (prev.nodeType === Node.TEXT_NODE && (prev.textContent || '').trim().length > 0) break
          if (prev.nodeType === Node.ELEMENT_NODE && (prev as HTMLElement).classList?.contains('ref-input-text') && ((prev as HTMLElement).textContent || '').trim().length > 0) break
          prev = prev.previousSibling
        }
      }
    } else if (startContainer === el && startOffset >= 1) {
      const prevChild = el.childNodes[startOffset - 1]
      if (prevChild && prevChild.nodeType === Node.ELEMENT_NODE && (prevChild as HTMLElement).classList?.contains('at-tag')) {
        targetAtTag = prevChild as HTMLElement
      }
    }
    if (targetAtTag) {
      const val = targetAtTag.getAttribute('data-at-value')
      if (val) {
        e.preventDefault()
        removeAt(val)
      }
    }
  }
  emit('keydown', e)
}

function removeAt(atValue: string) {
  const segs = segments.value.filter((s) => !(s.type === 'at' && s.atValue === atValue))
  if (segs.length === 0) segs.push({ type: 'text', value: '' })
  const value = serializeSegments(segs)
  segments.value = parseSegments(value)
  lastEmitted.value = value
  isInternal.value = true
  emit('update:modelValue', value)
}

function getCursorOffset(): number {
  const el = rootRef.value
  const sel = window.getSelection()
  if (!el || !sel || sel.rangeCount === 0) return lastEmitted.value.length
  const range = sel.getRangeAt(0)
  const target = range.startContainer
  const targetOff = range.startOffset
  let offset = 0
  const walk = (node: Node): boolean => {
    if (node === target) {
      if (node.nodeType === Node.TEXT_NODE) offset += targetOff
      return true
    }
    if (node.nodeType === Node.TEXT_NODE) {
      offset += (node.textContent || '').length
      return false
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return false
    const elNode = node as HTMLElement
    if (elNode.classList?.contains('at-tag')) {
      const val = elNode.getAttribute('data-at-value') || ''
      offset += 2 + val.length + 1
      return false
    }
    for (let i = 0; i < node.childNodes.length; i++) {
      if (walk(node.childNodes[i])) return true
    }
    return false
  }
  walk(el)
  if (target.nodeType === Node.ELEMENT_NODE) {
    for (let i = 0; i < targetOff && i < target.childNodes.length; i++) {
      const c = target.childNodes[i]
      if (c.nodeType === Node.TEXT_NODE) offset += (c.textContent || '').length
      else if ((c as HTMLElement).classList?.contains('at-tag')) {
        const val = (c as HTMLElement).getAttribute('data-at-value') || ''
        offset += 2 + val.length + 1
      }
    }
  }
  return offset
}

/** 在光标处插入闭合 tag：@[path] 或 @[tab:id]。打开 @ 选择器时焦点会移走，故用按 @ 时保存的偏移。 */
function insertAtCursor(rawValue: string) {
  const value = lastEmitted.value
  const offset =
    savedInsertOffset.value !== null ? savedInsertOffset.value : getCursorOffset()
  savedInsertOffset.value = null
  const insertText = `@[${rawValue}]`
  const newValue = value.slice(0, offset) + insertText + value.slice(offset)
  segments.value = parseSegments(newValue)
  lastEmitted.value = newValue
  isInternal.value = true
  emit('update:modelValue', newValue)
}

defineExpose({ insertRefAtCursor: insertAtCursor, insertAtCursor })
</script>

<style scoped>
.agent-ref-composer-input {
  width: 100%;
  min-height: 24px;
  padding: 0;
  font-size: inherit;
  line-height: 1.5;
  color: inherit;
  background: transparent;
  border: none;
  outline: none;
  white-space: pre-wrap;
  word-break: break-word;
}

.agent-ref-composer-input:empty::before,
.agent-ref-composer-input[data-placeholder]:empty::before {
  content: attr(data-placeholder);
  color: rgba(128, 128, 128, 0.8);
}

.agent-ref-composer-input.is-disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.ref-input-text {
  white-space: pre-wrap;
}
</style>
