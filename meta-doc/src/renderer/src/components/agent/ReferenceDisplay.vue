<template>
  <ScrollArea
    v-if="references.length > 0"
    class="reference-display-wrapper w-full max-w-full"
    :style="wrapperStyle"
  >
    <div class="reference-display" :style="containerStyle">
      <div
        v-for="ref in displayReferences"
        :key="ref.id"
        class="reference-tag"
        :class="{
          'reference-tag--active': ref.active,
          'reference-tag--readonly': readonly
        }"
        :style="tagStyle(ref)"
        @click="!readonly && handleToggle(ref)"
      >
        <span class="reference-tag__name">{{ ref.name }}</span>
      </div>
    </div>
  </ScrollArea>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { themeState } from '../../utils/themes'
import type { Reference } from '../../types/agent-framework'

interface ReferenceDisplayItem {
  id: string
  name: string
  active: boolean
}

interface Props {
  references: Reference[]
  activeReferenceIds?: string[] // 激活的引用ID列表（可编辑模式）
  readonly?: boolean // 是否只读模式（消息中显示）
}

const props = withDefaults(defineProps<Props>(), {
  activeReferenceIds: () => [],
  readonly: false
})

const emit = defineEmits<{
  (e: 'toggle', referenceId: string): void
}>()

// 计算要显示的引用（排除内置0号reference）
const displayReferences = computed<ReferenceDisplayItem[]>(() => {
  // 过滤掉内置0号reference
  const filteredReferences = props.references.filter(
    (ref) => ref.id !== 'built-in-document-reference-0'
  )

  if (props.readonly) {
    // 只读模式：只显示激活的引用
    return filteredReferences
      .filter((ref) => props.activeReferenceIds.includes(ref.id))
      .map((ref) => ({
        id: ref.id,
        name: ref.name,
        active: true
      }))
  } else {
    // 可编辑模式：显示所有引用，根据activeReferenceIds判断是否激活
    return filteredReferences.map((ref) => ({
      id: ref.id,
      name: ref.name,
      active: props.activeReferenceIds.includes(ref.id)
    }))
  }
})

// 外层容器样式（el-scrollbar）
const wrapperStyle = computed(() => {
  const borderColor =
    themeState.currentTheme.referenceContainerBorderColor || themeState.currentTheme.borderColor
  const baseStyle: Record<string, string> = {
    borderRadius: '8px',
    border: borderColor ? `1px solid ${borderColor}` : 'none'
  }
  return baseStyle
})

// 内层容器样式
const containerStyle = computed(() => {
  const baseStyle: Record<string, string> = {
    backgroundColor: 'transparent',
    padding: '8px 12px',
    display: 'flex',
    flexWrap: 'nowrap', // 不换行，单行显示
    gap: '8px',
    width: 'fit-content', // 确保内容宽度自适应
    minWidth: '100%' // 至少占满容器宽度
  }

  return baseStyle
})

// 标签样式
const tagStyle = (ref: ReferenceDisplayItem) => {
  const baseStyle: Record<string, string> = {
    borderRadius: '6px',
    padding: '4px 12px',
    fontSize: '13px',
    cursor: props.readonly ? 'default' : 'pointer',
    transition: 'all 0.2s',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    userSelect: 'none'
  }

  if (ref.active) {
    // 优先使用referenceActiveBg，如果没有则使用primaryColor，最后才用fallback
    const activeBg = themeState.currentTheme.referenceActiveBg
    if (activeBg) {
      baseStyle.backgroundColor = activeBg
    } else {
      // 如果referenceActiveBg不存在，尝试使用primaryColor
      baseStyle.backgroundColor = themeState.currentTheme.primaryColor || '#409eff'
    }
    baseStyle.color =
      themeState.currentTheme.referenceActiveText || themeState.currentTheme.textColor
  } else {
    // 优先使用referenceInactiveBg，如果没有则使用background2nd，最后才用fallback
    const inactiveBg = themeState.currentTheme.referenceInactiveBg
    if (inactiveBg) {
      baseStyle.backgroundColor = inactiveBg
    } else {
      baseStyle.backgroundColor = themeState.currentTheme.background2nd || '#f5f5f5'
    }
    const inactiveText = themeState.currentTheme.referenceInactiveText
    if (inactiveText) {
      baseStyle.color = inactiveText
    } else {
      baseStyle.color =
        themeState.currentTheme.textColor2 || themeState.currentTheme.textColor || '#666666'
    }
    baseStyle.opacity = '0.6'
  }

  return baseStyle
}

// 切换引用状态
const handleToggle = (ref: ReferenceDisplayItem) => {
  if (!props.readonly) {
    emit('toggle', ref.id)
  }
}
</script>

<style scoped>
.reference-display-wrapper {
  pointer-events: auto;
}

.reference-display-wrapper :deep([data-radix-scroll-area-viewport]) {
  overflow-x: auto !important;
  overflow-y: hidden !important;
}

.reference-display {
  pointer-events: auto;
}

.reference-tag {
  position: relative;
  flex-shrink: 0; /* 防止标签被压缩 */
  white-space: nowrap; /* 防止标签内文字换行 */
}

.reference-tag--readonly {
  cursor: default !important;
  pointer-events: none !important;
}

.reference-tag:not(.reference-tag--readonly) {
  cursor: pointer;
}

.reference-tag:not(.reference-tag--readonly):hover {
  opacity: 1 !important;
  transform: scale(1.05);
}

.reference-tag__name {
  font-weight: 500;
}
</style>
