<template>
  <div
    class="wordcloud-detail-panel rounded-lg border shadow-lg flex flex-col overflow-hidden select-none"
    :style="panelStyle"
  >
    <!-- 仅在此标题栏上拖拽，避免与内容区点击/选中冲突 -->
    <div
      class="drag-handle flex items-center gap-2 px-3 py-2.5 shrink-0 border-b"
      :style="{
        background: themeState.currentTheme.background2nd,
        borderColor: themeState.currentTheme.borderColor,
        color: themeState.currentTheme.textColor
      }"
      @mousedown="onDragStart"
    >
      <GripVertical
        class="shrink-0 opacity-50"
        :style="{ color: themeState.currentTheme.textColor2 }"
        :size="16"
      />
      <div class="flex-1 min-w-0">
        <span class="font-semibold truncate block" :style="{ color: themeState.currentTheme.textColor }">
          {{ props.word ? props.word : t('wordCloudDetail.defaultWord') }}
        </span>
        <span
          class="text-xs mt-0.5 block"
          :style="{ color: themeState.currentTheme.textColor2 }"
        >
          {{ t('wordCloudDetail.frequency') }}: {{ props.frequency }}
        </span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        class="shrink-0 h-8 w-8 rounded-md"
        :style="{
          color: themeState.currentTheme.textColor2
        }"
        @click="handleClose"
        @mousedown.stop
      >
        <X class="h-4 w-4" />
      </Button>
    </div>

    <ScrollArea
      v-if="generated || generating"
      class="flex-1 min-h-0 max-h-[min(20vh,320px)] overflow-auto"
      :style="{
        background: themeState.currentTheme.background,
        color: themeState.currentTheme.textColor
      }"
    >
      <div class="p-3 text-sm wordcloud-detail-content">
        <MarkdownItEditor :source="generatedText" />
      </div>
    </ScrollArea>
    <div
      v-else
      class="flex-1 min-h-[80px] flex items-center justify-center text-sm"
      :style="{ color: themeState.currentTheme.textColor2 }"
    >
      {{ generating ? (t('wordCloudDetail.generating') || '…') : '' }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Button } from '@renderer/components/ui/button'
import { GripVertical, X } from 'lucide-vue-next'
// @ts-ignore - vue3-markdown-it没有类型定义
import MarkdownItEditor from 'vue3-markdown-it'
import { computed, onMounted, ref, watch } from 'vue'
import { explainWordPrompt } from '../utils/prompts'
import type { VisualizeAdapter } from '../utils/visualize-adapters'
import { themeState } from '../utils/themes'
import { useActiveDocument } from '../composables/useActiveDocument'
import { searchNode } from '../utils/outline-helpers'
const props = defineProps({
  word: {
    type: String,
    required: true
  },
  frequency: {
    type: Number,
    required: true
  },
  position: {
    type: Object,
    required: true
  },
  path: {
    type: String,
    required: false
  },
  documentContent: {
    type: String,
    required: false,
    default: ''
  },
  adapter: {
    type: Object,
    required: false,
    default: null
  }
})

const emit = defineEmits(['accept', 'close'])
import { useI18n } from 'vue-i18n'
import { ai_types, createAiTask } from '../utils/ai_tasks'
import type { AIDialogMessage } from '@/types'
const { t } = useI18n()

const handleClose = () => {
  emit('close')
}
const generate = async () => {
  generating.value = true

  let contexts: string[] = []
  if (props.adapter && props.documentContent && props.word) {
    try {
      contexts = props.adapter.searchWordContexts(
        props.documentContent,
        props.word,
        3,
        200
      )
    } catch (error) {
      console.error('[WordCloudDetail] 搜索上下文失败:', error)
    }
  }

  const prompt = explainWordPrompt(props.word, contexts)
  const messages: AIDialogMessage[] = [{ role: 'user', content: prompt }]
  const { done } = createAiTask(
    props.word,
    messages,
    generatedText,
    ai_types.chat,
    'word-cloud-detail'
  )

  try {
    await done
  } catch (err) {
    console.warn('任务失败或取消：', err)
  } finally {
    generated.value = true
    generating.value = false
  }
}

const reset = () => {
  generated.value = false
  generatedText.value = ''
}
const generating = ref(false)
const generatedText = ref('')
const generated = ref(false)
const { activeDocument } = useActiveDocument()
const currentOutline = computed(() => activeDocument.value?.outline ?? null)
const articleContent = ref('')

const menuPosition = ref({ top: props.position.top, left: props.position.left })
const panelStyle = computed(() => ({
  position: 'absolute' as const,
  top: `${menuPosition.value.top}px`,
  left: `${menuPosition.value.left}px`,
  width: 'min(320px, calc(100vw - 24px))',
  maxWidth: '380px',
  minWidth: '280px',
  zIndex: 1000,
  background: themeState.currentTheme.background,
  borderColor: themeState.currentTheme.borderColor,
  boxShadow:
    themeState.currentTheme.type === 'dark'
      ? '0 4px 20px rgba(0,0,0,0.4)'
      : '0 4px 16px rgba(0,0,0,0.08)'
}))

const refreshContent = () => {
  menuPosition.value = {
    top: props.position.top,
    left: props.position.left
  }
  reset()
  generate()
  if (props.path && currentOutline.value) {
    const node = searchNode(props.path, currentOutline.value)
    articleContent.value = node?.text ?? ''
  } else {
    articleContent.value = ''
  }
}

watch(
  () => props.word,
  () => {
    refreshContent()
  }
)

// 拖拽：仅在标题栏 mousedown 时开始，避免内容区误触
const dragStart = ref({ x: 0, y: 0 })
const onDragStart = (event: MouseEvent) => {
  dragStart.value = {
    x: event.clientX - menuPosition.value.left,
    y: event.clientY - menuPosition.value.top
  }
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

const onMouseMove = (event: MouseEvent) => {
  menuPosition.value = {
    top: event.clientY - dragStart.value.y,
    left: event.clientX - dragStart.value.x
  }
}

const onMouseUp = () => {
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
}

onMounted(() => {
  refreshContent()
})
</script>

<style scoped>
.wordcloud-detail-panel .drag-handle {
  cursor: grab;
  user-select: none;
}
.wordcloud-detail-panel .drag-handle:active {
  cursor: grabbing;
}

/* 释义内容与主题一致 */
.wordcloud-detail-content :deep(.vditor-reset),
.wordcloud-detail-content :deep(.md-editor-preview) {
  color: inherit;
  font-size: inherit;
}
.wordcloud-detail-content :deep(pre),
.wordcloud-detail-content :deep(code) {
  background: v-bind('themeState.currentTheme.background2nd');
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 0.9em;
}
</style>
