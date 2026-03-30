<template>
  <!-- contenteditable 上 ::before 占位在浏览器中极不可靠，用独立层绘制 placeholder -->
  <div
    ref="wrapRef"
    class="agent-ref-composer-root"
    @focusin="onWrapFocusIn"
    @focusout="onWrapFocusOut"
  >
    <div
      v-show="showPlaceholderLayer"
      class="agent-ref-composer-placeholder-layer"
      aria-hidden="true"
    >
      {{ placeholder }}
    </div>
    <div
      ref="rootRef"
      class="agent-ref-composer-input"
      :contenteditable="!disabled"
      :class="{ 'is-disabled': disabled }"
      @input="onInput"
      @paste="onPaste"
      @keydown="onKeydown"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted, computed } from 'vue'
import eventBus from '../../utils/event-bus.js'
import { parseSegments, serializeSegments } from '../../utils/ref-composer-segments'
import type { Segment } from '../../utils/ref-composer-segments'

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

const wrapRef = ref<HTMLDivElement | null>(null)
const rootRef = ref<HTMLDivElement | null>(null)
const lastEmitted = ref(props.modelValue)
const isInternal = ref(false)
const savedInsertOffset = ref<number | null>(null)
const composerFocused = ref(false)

const isLogicallyEmpty = computed(() => !(props.modelValue ?? '').trim().length)

const showPlaceholderLayer = computed(
  () =>
    isLogicallyEmpty.value &&
    !!(props.placeholder ?? '').trim() &&
    !composerFocused.value &&
    !props.disabled
)

function onWrapFocusIn() {
  composerFocused.value = true
}

function onWrapFocusOut() {
  nextTick(() => {
    const w = wrapRef.value
    const ae = document.activeElement
    if (w && ae && w.contains(ae)) return
    composerFocused.value = false
  })
}

function getAtLabel(rawValue: string): string {
  if (props.getAtLabel) return props.getAtLabel(rawValue)
  if (rawValue.startsWith('tab:')) return rawValue.slice(4)
  if (rawValue.startsWith('dir:')) {
    const dirPath = rawValue.slice(4)
    return dirPath.replace(/^.*[/\\]/, '') || dirPath || '目录'
  }
  return rawValue.replace(/^.*[/\\]/, '') || rawValue
}

watch(
  () => props.modelValue,
  (val) => {
    if (isInternal.value) {
      isInternal.value = false
      return
    }
    if (val === lastEmitted.value) return
    lastEmitted.value = val
    nextTick(() => renderFromValue(val))
  },
  { immediate: true }
)

/** 保存当前光标位置为字符偏移（重渲染后用偏移恢复，因节点会变） */
function saveCursorOffset(): number {
  return getCursorOffset()
}

/** 在重渲染后的 DOM 上按字符偏移恢复光标并保持 focus */
function setCursorOffset(offset: number) {
  const el = rootRef.value
  const sel = window.getSelection()
  if (!el || !sel) return
  el.focus()
  let current = 0
  const walk = (node: Node): { node: Node; offset: number } | null => {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = (node.textContent || '').length
      if (current + len >= offset) return { node, offset: offset - current }
      current += len
      return null
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return null
    const elNode = node as HTMLElement
    if (elNode.classList?.contains('at-tag')) {
      const val = elNode.getAttribute('data-at-value') || ''
      const len = 2 + val.length + 1
      if (current + len >= offset) return { node: elNode, offset: 0 }
      current += len
      return null
    }
    for (let i = 0; i < node.childNodes.length; i++) {
      const found = walk(node.childNodes[i])
      if (found) return found
    }
    return null
  }
  const found = walk(el)
  if (!found) {
    const last = el.lastChild
    if (last) {
      const range = document.createRange()
      range.selectNodeContents(last)
      range.collapse(false)
      sel.removeAllRanges()
      sel.addRange(range)
    }
    return
  }
  try {
    const range = document.createRange()
    if (found.node.nodeType === Node.TEXT_NODE) {
      const maxOff = (found.node.textContent || '').length
      range.setStart(found.node, Math.min(found.offset, maxOff))
      range.collapse(true)
    } else {
      range.setStart(found.node, 0)
      range.collapse(true)
    }
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

  const pushWrapNode = (wrap: HTMLElement) => {
    let textBuf = ''
    const flushText = () => {
      if (!textBuf) return
      segs.push({ type: 'text', value: textBuf.replace(/\u200b/g, '') })
      textBuf = ''
    }
    for (let i = 0; i < wrap.childNodes.length; i++) {
      const child = wrap.childNodes[i]
      if (child.nodeType === Node.ELEMENT_NODE) {
        const childEl = child as HTMLElement
        if (childEl.classList?.contains('at-tag')) {
          const val = childEl.getAttribute?.('data-at-value')
          if (val) {
            flushText()
            segs.push({ type: 'at', atValue: val })
          }
          continue
        }
        if (childEl.classList?.contains('ref-input-text')) {
          textBuf += childEl.textContent || ''
          continue
        }
        // 其他元素：忽略，避免与 Vue 自身结构或浏览器插入节点混在一起导致重复/错位
      } else if (child.nodeType === Node.TEXT_NODE) {
        // 包裹内部裸文本：忽略，统一依赖 .ref-input-text 来读取文本
        continue
      }
    }
    flushText()
  }

  for (let i = 0; i < el.childNodes.length; i++) {
    const node = el.childNodes[i]
    if (node.nodeType === Node.ELEMENT_NODE) {
      const elNode = node as HTMLElement
      if (elNode.classList?.contains('ref-segment-wrap')) {
        pushWrapNode(elNode)
        continue
      }
      if (elNode.classList?.contains('at-tag')) {
        const val = elNode.getAttribute?.('data-at-value')
        if (val) segs.push({ type: 'at', atValue: val })
        continue
      }
      if (elNode.classList?.contains('ref-input-text')) {
        const t = elNode.textContent || ''
        segs.push({ type: 'text', value: t.replace(/\u200b/g, '') })
        continue
      }
      // 浏览器插入的未知元素：按纯文本收集，避免 tag 后输入的文字丢失
      const t = (elNode.textContent || '').replace(/\u200b/g, '')
      if (t.length > 0) segs.push({ type: 'text', value: t })
      continue
    }
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent || '').replace(/\u200b/g, '')
      if (t.length > 0) segs.push({ type: 'text', value: t })
    }
  }
  if (segs.length === 0) segs.push({ type: 'text', value: '' })
  const value = serializeSegments(segs)
  return { segments: segs, value }
}

function clearRoot() {
  const el = rootRef.value
  if (!el) return
  while (el.firstChild) {
    el.removeChild(el.firstChild)
  }
}

function createTextSpan(text: string): HTMLSpanElement {
  const span = document.createElement('span')
  span.className = 'ref-input-text'
  span.textContent = text
  return span
}

function createAtTagSpan(atValue: string): HTMLSpanElement {
  const span = document.createElement('span')
  span.className = 'at-tag'
  span.setAttribute('data-at-value', atValue)
  span.contentEditable = 'false'

  const labelSpan = document.createElement('span')
  labelSpan.className = 'at-tag-label'
  labelSpan.textContent = getAtLabel(atValue)
  span.appendChild(labelSpan)

  const removeBtn = document.createElement('button')
  removeBtn.type = 'button'
  removeBtn.className = 'at-tag-remove'
  removeBtn.textContent = '×'
  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    removeAt(atValue)
  })
  span.appendChild(removeBtn)

  span.addEventListener('click', () => {
    if (!atValue) return
    if (atValue.startsWith('tab:')) {
      const tabId = atValue.slice(4)
      eventBus.emit('workspace-open-document', { tabId })
    } else if (atValue.startsWith('dir:')) {
      const dirPath = atValue.slice(4)
      eventBus.emit('workspace-open-document', { path: dirPath })
    } else {
      eventBus.emit('workspace-open-document', { path: atValue })
    }
  })

  return span
}

function renderFromValue(value: string) {
  const el = rootRef.value
  if (!el) return
  clearRoot()
  const segs = parseSegments(value)
  for (const seg of segs) {
    if (seg.type === 'text') {
      el.appendChild(createTextSpan(seg.value))
    } else {
      el.appendChild(createAtTagSpan(seg.atValue))
    }
  }
  // 末尾始终保留一个可编辑空 span，避免在 tag 后打字时浏览器创建无 class 节点导致 collectFromDom 漏收
  el.appendChild(createTextSpan(''))
}

/** 粘贴时只插入纯文本，避免从外部复制的富文本（背景色等）被保留，并避免重复插入导致内容重复 */
function onPaste(e: ClipboardEvent) {
  e.preventDefault()
  if (props.disabled) return
  const text = e.clipboardData?.getData('text/plain') ?? ''
  if (!text) return
  document.execCommand('insertText', false, text)
}

function onInput() {
  if (props.disabled) return
  const { value } = collectFromDom()
  if (value === lastEmitted.value) {
    return
  }
  lastEmitted.value = value
  isInternal.value = true
  emit('update:modelValue', value)
}

function removeStrayTextNodes() {
  // 已由 renderFromValue 完全控制 DOM 结构，这里无需额外处理
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
    const getAtTagFromNode = (n: Node | null): HTMLElement | null => {
      if (!n || n.nodeType !== Node.ELEMENT_NODE) return null
      const h = n as HTMLElement
      if (h.classList?.contains('at-tag')) return h
      if (
        h.classList?.contains('ref-segment-wrap') &&
        h.firstElementChild?.classList?.contains('at-tag')
      )
        return h.firstElementChild as HTMLElement
      return null
    }
    let targetAtTag: HTMLElement | null = null
    const startContainer = range.startContainer
    const startOffset = range.startOffset
    if (startOffset === 0) {
      let node: Node | null = startContainer
      const parent = node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode
      if (parent) {
        let prev: Node | null = parent.previousSibling
        while (prev) {
          targetAtTag = getAtTagFromNode(prev)
          if (targetAtTag) break
          if (prev.nodeType === Node.TEXT_NODE && (prev.textContent || '').trim().length > 0) break
          if (
            prev.nodeType === Node.ELEMENT_NODE &&
            (prev as HTMLElement).classList?.contains('ref-input-text') &&
            ((prev as HTMLElement).textContent || '').trim().length > 0
          )
            break
          if (
            prev.nodeType === Node.ELEMENT_NODE &&
            (prev as HTMLElement).classList?.contains('ref-segment-wrap')
          ) {
            const inner = (prev as HTMLElement).firstElementChild as HTMLElement | null
            if (
              inner?.classList?.contains('ref-input-text') &&
              (inner.textContent || '').trim().length > 0
            )
              break
          }
          prev = prev.previousSibling
        }
      }
    } else if (startContainer === el && startOffset >= 1) {
      targetAtTag = getAtTagFromNode(el.childNodes[startOffset - 1])
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
  const segs = parseSegments(lastEmitted.value).filter(
    (s) => !(s.type === 'at' && s.atValue === atValue)
  )
  if (segs.length === 0) segs.push({ type: 'text', value: '' })
  const value = serializeSegments(segs)
  lastEmitted.value = value
  isInternal.value = true
  emit('update:modelValue', value)
  nextTick(() => renderFromValue(value))
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
  const offset = savedInsertOffset.value !== null ? savedInsertOffset.value : getCursorOffset()
  savedInsertOffset.value = null
  const insertText = `@[${rawValue}]`
  const newValue = value.slice(0, offset) + insertText + value.slice(offset)
  lastEmitted.value = newValue
  isInternal.value = true
  emit('update:modelValue', newValue)
  nextTick(() => {
    if (!rootRef.value) return
    renderFromValue(newValue)
  })
}

/** 供提交前刷新：从 DOM 收集当前内容并返回；取 DOM 与 lastEmitted 中更长的，避免漏掉 chip 外的普通文字 */
function getValue(): string {
  const { value: domVal } = collectFromDom()
  const last = lastEmitted.value || ''
  if (!domVal || domVal.length === 0) return last
  return domVal.length >= last.length ? domVal : last
}

defineExpose({ insertRefAtCursor: insertAtCursor, insertAtCursor, getValue })

onMounted(() => {
  renderFromValue(lastEmitted.value)
})
</script>

<style scoped>
.agent-ref-composer-root {
  position: relative;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.agent-ref-composer-placeholder-layer {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  box-sizing: border-box;
  padding: 0;
  font-size: inherit;
  line-height: 1.5;
  color: var(--el-text-color-placeholder, rgba(128, 128, 128, 0.88));
  white-space: pre-wrap;
  word-break: break-word;
  pointer-events: none;
  user-select: none;
  /* 叠在输入框之上，否则整块 contenteditable 会盖住下层占位（透明底也会挡） */
  z-index: 2;
}

.agent-ref-composer-input {
  position: relative;
  z-index: 1;
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

.agent-ref-composer-input.is-disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.ref-input-text {
  white-space: pre-wrap;
}

/* 动态插入的 chip 在根节点内，用 :deep 使样式生效；X 按钮默认隐藏，hover 时显示、居中、圆角 */
.agent-ref-composer-input :deep(.at-tag) {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 4px 1px 6px;
  margin: 0 2px;
  font-size: 12px;
  line-height: 1.3;
  border-radius: 4px;
  background: var(--el-fill-color-light, rgba(0, 0, 0, 0.06));
  color: var(--el-text-color-primary);
  cursor: pointer;
  user-select: none;
  vertical-align: baseline;
  border: 1px solid var(--el-border-color-lighter, rgba(0, 0, 0, 0.08));
}

.agent-ref-composer-input :deep(.at-tag:hover) {
  background: var(--el-fill-color, rgba(0, 0, 0, 0.08));
}

.agent-ref-composer-input :deep(.at-tag-label) {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-ref-composer-input :deep(.at-tag-remove) {
  display: none;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin: 0;
  margin-left: 2px;
  border: none;
  border-radius: 2px;
  background: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
}

.agent-ref-composer-input :deep(.at-tag:hover .at-tag-remove) {
  display: inline-flex;
}

.agent-ref-composer-input :deep(.at-tag-remove:hover) {
  background: var(--el-fill-color-dark, rgba(0, 0, 0, 0.12));
  color: var(--el-text-color-primary);
}
</style>
