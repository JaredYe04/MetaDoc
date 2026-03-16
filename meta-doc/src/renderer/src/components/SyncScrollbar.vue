<template>
  <div
    class="sync-scrollbar"
    ref="trackRef"
    @mousedown="onTrackMouseDown"
  >
    <div
      class="sync-scrollbar-thumb"
      :style="thumbStyle"
      @mousedown.stop="onThumbMouseDown"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'

export interface ScrollInfo {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}

const props = withDefaults(
  defineProps<{
    /** 获取当前滚动信息 */
    getScrollInfo: () => ScrollInfo
    /** 设置滚动位置 */
    setScrollTop: (top: number) => void
    /** 可滚动的 DOM 元素，用于监听 scroll 事件自动刷新 */
    scrollTarget?: HTMLElement | null
    /** 轮询刷新间隔（ms） */
    pollInterval?: number
  }>(),
  {
    scrollTarget: null,
    pollInterval: 0
  }
)

const trackRef = ref<HTMLDivElement | null>(null)
const scrollInfo = ref<ScrollInfo>({ scrollTop: 0, scrollHeight: 0, clientHeight: 0 })
const isDragging = ref(false)
let pollTimer: ReturnType<typeof setInterval> | null = null

const thumbRatio = computed(() => {
  const { scrollHeight, clientHeight } = scrollInfo.value
  if (scrollHeight <= clientHeight || clientHeight <= 0) return 1
  return Math.max(0.1, clientHeight / scrollHeight)
})

const thumbOffset = computed(() => {
  const { scrollTop, scrollHeight, clientHeight } = scrollInfo.value
  if (scrollHeight <= clientHeight) return 0
  const trackH = trackRef.value?.clientHeight ?? clientHeight
  const thumbH = trackH * thumbRatio.value
  const maxOffset = trackH - thumbH
  if (maxOffset <= 0) return 0
  const ratio = scrollTop / (scrollHeight - clientHeight)
  return ratio * maxOffset
})

const thumbStyle = computed(() => ({
  height: `${thumbRatio.value * 100}%`,
  transform: `translateY(${thumbOffset.value}px)`
}))

function refresh() {
  scrollInfo.value = props.getScrollInfo()
}

function onThumbMouseDown(e: MouseEvent) {
  e.preventDefault()
  isDragging.value = true
  const startY = e.clientY
  const startScrollTop = props.getScrollInfo().scrollTop

  const onMove = (ev: MouseEvent) => {
    const track = trackRef.value
    if (!track) return
    const rect = track.getBoundingClientRect()
    const trackH = rect.height
    const { scrollHeight, clientHeight } = props.getScrollInfo()
    const scrollable = scrollHeight - clientHeight
    if (scrollable <= 0) return

    const deltaY = ev.clientY - startY
    const thumbH = trackH * thumbRatio.value
    const maxThumbOffset = trackH - thumbH
    if (maxThumbOffset <= 0) return

    const deltaScroll = (deltaY / maxThumbOffset) * scrollable
    const newTop = Math.max(0, Math.min(scrollHeight - clientHeight, startScrollTop + deltaScroll))
    props.setScrollTop(newTop)
    refresh()
  }

  const onUp = () => {
    isDragging.value = false
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

function onTrackMouseDown(e: MouseEvent) {
  if ((e.target as HTMLElement).classList.contains('sync-scrollbar-thumb')) return
  const track = trackRef.value
  if (!track) return

  const rect = track.getBoundingClientRect()
  const clickY = e.clientY - rect.top
  const trackH = rect.height
  const thumbH = trackH * thumbRatio.value
  const maxThumbOffset = trackH - thumbH
  if (maxThumbOffset <= 0) return

  const { scrollHeight, clientHeight } = props.getScrollInfo()
  const scrollable = scrollHeight - clientHeight
  if (scrollable <= 0) return

  const ratio = Math.max(0, Math.min(1, (clickY - thumbH / 2) / maxThumbOffset))
  const newTop = ratio * scrollable
  props.setScrollTop(newTop)
  refresh()
}

const onTargetScroll = () => {
  if (!isDragging.value) refresh()
}

onMounted(() => {
  refresh()
  if (props.scrollTarget) {
    props.scrollTarget.addEventListener('scroll', onTargetScroll)
  }
  if (props.pollInterval > 0) {
    pollTimer = setInterval(refresh, props.pollInterval)
  }
})

onBeforeUnmount(() => {
  if (props.scrollTarget) {
    props.scrollTarget.removeEventListener('scroll', onTargetScroll)
  }
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
})

watch(() => props.scrollTarget, (el, prev) => {
  prev?.removeEventListener('scroll', onTargetScroll)
  el?.addEventListener('scroll', onTargetScroll)
  refresh()
})

defineExpose({ refresh })
</script>

<style scoped>
.sync-scrollbar {
  position: absolute;
  top: 0;
  right: 0;
  width: 10px;
  height: 100%;
  cursor: pointer;
  z-index: 100;
  pointer-events: auto;
}

.sync-scrollbar-thumb {
  position: absolute;
  top: 0;
  left: 1px;
  right: 1px;
  min-height: 24px;
  border-radius: 4px;
  background: rgba(128, 128, 128, 0.5);
  cursor: default;
  transition: background 0.15s;
}

.sync-scrollbar-thumb:hover {
  background: rgba(128, 128, 128, 0.55);
}

.sync-scrollbar-thumb:active {
  background: rgba(128, 128, 128, 0.65);
}
</style>
