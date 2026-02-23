<template>
  <div
    class="detailed-outline-node"
    :style="[containerStyle, { width: panelWidthPx, height: panelHeightPx }]"
    @mousedown.stop
    @pointerdown.stop
    @click.stop
  >
    <!-- 标题行：含折叠按钮 -->
    <div class="detailed-outline-node__header">
      <h3 class="detailed-outline-node__title" :title="node.title">
        {{ displayTitle }}
      </h3>
      <el-tooltip :content="$t('outline.collapse')" placement="top">
        <button
          type="button"
          class="detailed-outline-node__collapse-btn"
          @click="emit('collapse')"
          aria-label="Collapse"
        >
          <el-icon>
            <ArrowUp />
          </el-icon>
        </button>
      </el-tooltip>
    </div>

    <!-- 内容区域：可滚动，可拖动右下角改变大小 -->
    <div class="detailed-outline-node__content-wrapper">
      <ScrollArea class="h-full w-full">
        <div class="detailed-outline-node__content">
          <!-- AI 执行中：直接绑定流式内容 ref，便于响应流式更新 -->
          <template v-if="isGenerating">
            <div v-if="displayStreamingText" class="detailed-outline-node__streaming-box">
              <el-scrollbar class="streaming-scroll">
                <pre class="streaming-pre">{{ displayStreamingText }}</pre>
              </el-scrollbar>
            </div>
            <div v-else class="detailed-outline-node__streaming-placeholder">
              {{ $t('outline.generating') || '生成中...' }}
            </div>
          </template>

          <!-- 待确认：显示本次生成的新内容（使用 pendingContent 确保是修改后文字） -->
          <VditorPreview
            v-else-if="pendingAccept"
            :markdown="pendingContent || ''"
            :docPath="docPath"
          />

          <!-- 正常显示：当前节点正文 -->
          <VditorPreview v-else :markdown="node.text || ''" :docPath="docPath" />
        </div>
      </ScrollArea>
    </div>

    <!-- 右下角拖拽：仅 mousedown 开始，mouseup 结束，用 capture 确保收到事件 -->
    <div
      class="detailed-outline-node__resize-handle"
      @mousedown.capture.prevent="onResizeHandleMouseDown"
      title="拖动调整大小"
    />

    <!-- 操作按钮区域 -->
    <div class="detailed-outline-node__actions">
      <!-- AI执行中 -->
      <template v-if="isGenerating">
        <Button type="danger" size="small" circle @click="handleCancel">
          <el-icon>
            <CloseBold />
          </el-icon>
        </Button>
      </template>

      <!-- AI执行完成，等待确认 -->
      <template v-else-if="pendingAccept">
        <Button type="success" size="small" circle @click="handleAccept">
          <el-icon>
            <Check />
          </el-icon>
        </Button>
        <Button type="danger" size="small" circle @click="handleReject">
          <el-icon>
            <Close />
          </el-icon>
        </Button>
      </template>

      <!-- 正常状态：显示操作按钮 -->
      <template v-else>
        <Tooltip :content="$t('outline.expandContent')" placement="top">
          <Button
            type="primary"
            size="small"
            circle
            @click="handleExpand"
            :disabled="isGenerating"
          >
            <el-icon>
              <EditPen />
            </el-icon>
          </Button>
        </Tooltip>
        <Tooltip :content="$t('outline.abridge')" placement="top">
          <Button
            type="warning"
            size="small"
            circle
            @click="handleAbridge"
            :disabled="isGenerating"
          >
            <el-icon>
              <Minus />
            </el-icon>
          </Button>
        </Tooltip>
        <Tooltip :content="$t('outline.polish')" placement="top">
          <Button type="info" size="small" circle @click="handlePolish" :disabled="isGenerating">
            <el-icon>
              <Star />
            </el-icon>
          </Button>
        </Tooltip>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElIcon } from 'element-plus'
import { Tooltip } from '@renderer/components/ui/tooltip'
import { CloseBold, Check, Close, EditPen, Minus, Star, ArrowUp } from '@element-plus/icons-vue'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Button } from '@renderer/components/ui/button'
import type { DocumentOutlineNode } from '../../../types'
import { themeState } from '../../utils/themes'
import VditorPreview from '../VditorPreview.vue'
import { expandContent, abridgeContent, polishContent } from '../../utils/outline-ai-utils'

const { t } = useI18n()

interface Props {
  node: DocumentOutlineNode
  outlineTree: DocumentOutlineNode
  docPath?: string
  docFormat?: 'md' | 'tex'
  userPrompt?: string
  temperature?: number
  wordCount?: number
}

const props = withDefaults(defineProps<Props>(), {
  docPath: '',
  docFormat: 'md',
  userPrompt: '',
  temperature: undefined,
  wordCount: undefined
})

const emit = defineEmits<{
  (e: 'content-updated', content: string): void
  (e: 'cancel'): void
  (e: 'collapse'): void
  (e: 'size-change', width: number, height: number): void
}>()

// 状态管理
const isGenerating = ref(false)
const pendingAccept = ref(false)
const streamingContentRef = ref('')
/** 待确认时展示的新内容（与拖拽/流式解耦，确保界面显示正确） */
const pendingContent = ref('')
const generationDone = ref<Promise<any> | null>(null)
const backupContent = ref('')

// 面板可调整大小
const DEFAULT_PANEL_WIDTH = 520
const DEFAULT_PANEL_HEIGHT = 380
const MIN_PANEL_WIDTH = 320
const MIN_PANEL_HEIGHT = 220
const MAX_PANEL_WIDTH = 680
const MAX_PANEL_HEIGHT = 560

const panelWidth = ref(DEFAULT_PANEL_WIDTH)
const panelHeight = ref(DEFAULT_PANEL_HEIGHT)
const panelWidthPx = computed(() => `${panelWidth.value}px`)
const panelHeightPx = computed(() => `${panelHeight.value}px`)

const isResizing = ref(false)
let resizeStartX = 0
let resizeStartY = 0
let resizeStartW = 0
let resizeStartH = 0

const CAPTURE = true

function onResizeHandleMouseDown(e: MouseEvent) {
  if (e.button !== 0) return
  if (isResizing.value) return
  e.stopPropagation()
  e.preventDefault()
  isResizing.value = true
  resizeStartX = e.clientX
  resizeStartY = e.clientY
  resizeStartW = panelWidth.value
  resizeStartH = panelHeight.value
  window.addEventListener('mousemove', onResizeMove, CAPTURE)
  window.addEventListener('mouseup', stopResize, CAPTURE)
}

function onResizeMove(e: MouseEvent) {
  if (!isResizing.value) return
  const dx = e.clientX - resizeStartX
  const dy = e.clientY - resizeStartY
  panelWidth.value = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, resizeStartW + dx))
  panelHeight.value = Math.max(MIN_PANEL_HEIGHT, Math.min(MAX_PANEL_HEIGHT, resizeStartH + dy))
}

function stopResize() {
  if (!isResizing.value) return
  isResizing.value = false
  window.removeEventListener('mousemove', onResizeMove, CAPTURE)
  window.removeEventListener('mouseup', stopResize, CAPTURE)
  emit('size-change', panelWidth.value, panelHeight.value)
}

onMounted(() => {
  nextTick(() => emit('size-change', panelWidth.value, panelHeight.value))
})

onUnmounted(() => {
  if (isResizing.value) {
    window.removeEventListener('mousemove', onResizeMove, CAPTURE)
    window.removeEventListener('mouseup', stopResize, CAPTURE)
  }
})

// 计算显示标题（过长时截断）
const displayTitle = computed(() => {
  const title = props.node.title || ''
  if (title.length > 50) {
    return title.substring(0, 50) + '...'
  }
  return title
})

// 流式展示用：用 watch 同步到独立 ref，flush: 'sync' 确保流式回调里改 ref 后立刻更新视图
const displayStreamingText = ref('')
watch(
  streamingContentRef,
  (v) => {
    displayStreamingText.value = v || ''
  },
  { immediate: true, flush: 'sync' }
)

// 容器样式
const containerStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd || themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

// 扩写
const handleExpand = async () => {
  if (!props.node.text) {
    return
  }

  isGenerating.value = true
  pendingAccept.value = false
  backupContent.value = props.node.text
  streamingContentRef.value = ''
  generationDone.value = null

  try {
    // 从父组件获取配置（通过props传递）
    const result = await expandContent(
      props.node,
      props.outlineTree,
      props.userPrompt || '', // userPrompt
      undefined, // signal
      props.docFormat,
      streamingContentRef,
      undefined, // onUpdate
      props.temperature, // temperature
      props.wordCount // wordCount
    )

    // 保存生成的内容，等待用户确认（同时写入 pendingContent 供界面展示）
    streamingContentRef.value = result
    pendingContent.value = result
    generationDone.value = Promise.resolve()
    pendingAccept.value = true
  } catch (error) {
    console.error('扩写失败:', error)
    streamingContentRef.value = backupContent.value
    pendingContent.value = ''
    pendingAccept.value = false
  } finally {
    isGenerating.value = false
  }
}

// 略写
const handleAbridge = async () => {
  if (!props.node.text) {
    return
  }

  isGenerating.value = true
  pendingAccept.value = false
  backupContent.value = props.node.text
  streamingContentRef.value = ''
  generationDone.value = null

  try {
    const result = await abridgeContent(
      props.node,
      props.outlineTree,
      props.userPrompt || '', // userPrompt
      undefined, // signal
      props.docFormat,
      streamingContentRef,
      undefined, // onUpdate
      props.temperature, // temperature
      props.wordCount // wordCount
    )

    streamingContentRef.value = result
    pendingContent.value = result
    generationDone.value = Promise.resolve()
    pendingAccept.value = true
  } catch (error) {
    console.error('略写失败:', error)
    streamingContentRef.value = backupContent.value
    pendingContent.value = ''
    pendingAccept.value = false
  } finally {
    isGenerating.value = false
  }
}

// 润色
const handlePolish = async () => {
  if (!props.node.text) {
    return
  }

  isGenerating.value = true
  pendingAccept.value = false
  backupContent.value = props.node.text
  streamingContentRef.value = ''
  generationDone.value = null

  try {
    const result = await polishContent(
      props.node,
      props.outlineTree,
      props.userPrompt || '', // userPrompt
      undefined, // signal
      props.docFormat,
      streamingContentRef,
      undefined, // onUpdate
      props.temperature // temperature
    )

    streamingContentRef.value = result
    pendingContent.value = result
    generationDone.value = Promise.resolve()
    pendingAccept.value = true
  } catch (error) {
    console.error('润色失败:', error)
    streamingContentRef.value = backupContent.value
    pendingContent.value = ''
    pendingAccept.value = false
  } finally {
    isGenerating.value = false
  }
}

// 接受生成的内容
const handleAccept = () => {
  const newContent = pendingContent.value || streamingContentRef.value || backupContent.value
  emit('content-updated', newContent)
  resetState()
}

// 拒绝生成的内容
const handleReject = () => {
  streamingContentRef.value = backupContent.value
  pendingContent.value = ''
  resetState()
}

// 取消生成
const handleCancel = () => {
  streamingContentRef.value = backupContent.value
  pendingContent.value = ''
  resetState()
  emit('cancel')
}

// 重置状态
const resetState = () => {
  isGenerating.value = false
  pendingAccept.value = false
  streamingContentRef.value = ''
  pendingContent.value = ''
  generationDone.value = null
  backupContent.value = ''
}

// 暴露方法供父组件调用（用于传递配置参数）
defineExpose({
  expand: handleExpand,
  abridge: handleAbridge,
  polish: handlePolish,
  cancel: handleCancel
})
</script>

<style scoped lang="less">
.detailed-outline-node {
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  padding: 16px;
  gap: 12px;
  min-width: 300px;
  box-sizing: border-box;
  position: relative;
  z-index: 10000;
}

.detailed-outline-node__header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.detailed-outline-node__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.detailed-outline-node__collapse-btn {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: rgba(128, 128, 128, 0.2);
  color: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.15s ease;
}

.detailed-outline-node__collapse-btn:hover {
  background: rgba(128, 128, 128, 0.35);
}

.detailed-outline-node__collapse-btn .el-icon {
  font-size: 14px;
}

.detailed-outline-node__content-wrapper {
  flex: 1;
  min-height: 0;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(145, 145, 145, 0.3);
  display: flex;
  flex-direction: column;
}

.detailed-outline-node__content {
  padding: 12px;
  min-height: 160px;
}

.detailed-outline-node__streaming-box {
  min-height: 160px;
  width: 100%;
  border-radius: 8px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.03);
}

.detailed-outline-node__streaming-box .streaming-scroll {
  max-height: 300px;
}

.detailed-outline-node__streaming-box .streaming-scroll :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
}

.detailed-outline-node__streaming-box .streaming-pre {
  margin: 0;
  padding: 12px;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-size: 14px;
  line-height: 1.6;
}

.detailed-outline-node__streaming-placeholder {
  min-height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

.detailed-outline-node__resize-handle {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
  background: linear-gradient(135deg, transparent 50%, rgba(128, 128, 128, 0.35) 50%);
  border-radius: 0 0 4px 0;
}

.detailed-outline-node__resize-handle:hover {
  background: linear-gradient(135deg, transparent 50%, rgba(128, 128, 128, 0.5) 50%);
}

.detailed-outline-node__actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  align-items: center;
  flex-shrink: 0;
}
</style>
