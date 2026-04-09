<script setup lang="ts">
import '../assets/response-container.css'
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import {
  Trash2,
  Pencil,
  RefreshCw,
  User,
  MoreVertical,
  Copy,
  FilePlus,
  FolderPlus,
  Download
} from 'lucide-vue-next'
import { Button } from '@renderer/components/ui/button'
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent
} from '@renderer/components/ui/collapsible'
import { ChevronDown } from 'lucide-vue-next'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator
} from '@renderer/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Avatar, AvatarImage, AvatarFallback } from '@renderer/components/ui/avatar'
import { toast } from '@renderer/utils/notification/toast'
import { messageBox } from '@renderer/utils/notification/messageBox'
import { MdEditor, MdPreview } from 'md-editor-v3'
import { themeState } from '../utils/themes'
import '../assets/md-editor-v3-style.css'
import type { AIDialogMessage } from '../../../types'
import { useI18n } from 'vue-i18n'
import eventBus from '../utils/event-bus'
import { renderMarkdownPreview } from '../utils/md-utils'
import { createRendererLogger } from '../utils/common/logger'

const logger = createRendererLogger('GraphMessageBubble')

interface GraphMessage extends AIDialogMessage {
  chartMarkdown?: string
  code?: string
}

interface Props {
  message: GraphMessage
  index: number
  isStreaming?: boolean
  streamingContent?: string
  /** 流式 reasoning 文本（与 streamingContent 并行） */
  streamingReasoning?: string
}

interface MessageEditPayload {
  index: number
  message: string
}

const props = withDefaults(defineProps<Props>(), {
  isStreaming: false,
  streamingContent: '',
  streamingReasoning: ''
})

const emit = defineEmits<{
  delete: [index: number]
  edit: [payload: MessageEditPayload]
  regenerate: [index: number]
  export: [chartMarkdown?: string]
}>()

const { t } = useI18n()

const reasoningDisplay = computed(() => {
  if (props.isStreaming && props.streamingReasoning) return props.streamingReasoning
  return (props.message.reasoning || '').trim()
})

const isReasoningOpen = ref(true)
watch(
  () => props.isStreaming,
  (streaming) => {
    if (streaming) {
      isReasoningOpen.value = true
    } else if (reasoningDisplay.value) {
      isReasoningOpen.value = false
    }
  },
  { immediate: true }
)

const role = computed(() => {
  return props.message.role
})

const content = computed(() => {
  // 如果正在流式输出，使用流式内容
  if (props.isStreaming && props.message.role === 'assistant') {
    return props.streamingContent || props.message.content
  }
  return props.message.content
})

const hasChart = computed(() => {
  return props.message.role === 'assistant' && (props.message.chartMarkdown || props.message.code)
})

// 图表容器引用
const chartContainerRef = ref<HTMLElement | null>(null)

// 渲染图表
const renderChart = async () => {
  if (!hasChart.value || !chartContainerRef.value) return

  const chartMarkdown = props.message.chartMarkdown
  if (!chartMarkdown) return

  try {
    await renderMarkdownPreview(chartContainerRef.value, chartMarkdown)
  } catch (error) {
    logger.error('渲染图表失败:', error)
    if (chartContainerRef.value) {
      chartContainerRef.value.innerHTML = `<p style="color: var(--el-color-danger);">${t('graph.renderFailed')}: ${error instanceof Error ? error.message : String(error)}</p>`
    }
  }
}

// 监听图表变化 - 确保立即渲染
watch(
  () => [props.message.chartMarkdown, props.message.code, props.isStreaming],
  async (newVal, oldVal) => {
    // 如果正在流式输出，不渲染
    if (props.isStreaming) return

    // 如果有图表且容器存在，立即渲染
    if (hasChart.value && props.message.chartMarkdown) {
      await nextTick()
      // 确保容器已挂载
      const container = chartContainerRef.value
      if (container) {
        // 清空容器后重新渲染，确保更新
        container.innerHTML = ''
        await nextTick()
        // 立即渲染，不延迟
        await renderChart()
      }
    }
  },
  { immediate: true, deep: true }
)

onMounted(async () => {
  if (hasChart.value && !props.isStreaming) {
    await nextTick()
    // 等待容器挂载
    const container = chartContainerRef.value
    if (container) {
      // 清空容器后渲染
      container.innerHTML = ''
      await nextTick()
      await renderChart()
    } else {
      // 如果容器还没挂载，再等一次
      await nextTick()
      const container2 = chartContainerRef.value
      if (container2) {
        container2.innerHTML = ''
        await nextTick()
        await renderChart()
      }
    }
  }
})

const regenerateMsg = () => {
  emit('regenerate', props.index)
}

const onMsgDelete = () => {
  messageBox.confirm(
    t('messageBubble.deleteConfirmMessage'),
    t('messageBubble.deleteConfirmTitle'),
    {
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      type: 'warning'
    }
  )
    .then(() => {
      emit('delete', props.index)
    })
    .catch(() => {
      // 取消无操作
    })
}

const editDialogVisible = ref(false)
const onMsgEdit = () => {
  // 编辑时显示图表代码（如果有），否则显示普通内容
  // 优先使用 chartMarkdown（包含代码块标记），其次使用 code（纯代码），最后使用 content
  const graphMsg = props.message as GraphMessage
  editingText.value = graphMsg.chartMarkdown || graphMsg.code || props.message.content || ''
  editDialogVisible.value = true
}

const editingText = ref('')

const saveEdit = () => {
  editDialogVisible.value = false
  emit('edit', { index: props.index, message: editingText.value })
}

// 复制内容到剪切板
const copyContent = async () => {
  try {
    const textToCopy = props.message.chartMarkdown || props.message.code || content.value
    await navigator.clipboard.writeText(textToCopy)
    toast.success(t('common.copySuccess', '复制成功'))
  } catch (error) {
    console.error('复制失败:', error)
    toast.error(t('common.copyFailed', '复制失败'))
  }
}

// 导出图表
const exportChart = () => {
  emit('export', props.message.chartMarkdown)
}

// 请求插入到文档（触发选择对话框）
const requestInsertToDocument = () => {
  const contentToInsert = props.message.chartMarkdown || props.message.code || content.value
  eventBus.emit('ai-chat-request-insert-to-document', {
    content: contentToInsert
  })
}

// 导出到新文档
const exportToNewDocument = () => {
  const contentToExport = props.message.chartMarkdown || props.message.code || content.value
  eventBus.emit('ai-chat-export-to-document', {
    content: contentToExport
  })
  toast.success(t('aiChat.exportToDocumentSuccess', '已导出到新文档'))
}

// 处理下拉菜单命令
const handleActionCommand = (command: string, data?: any) => {
  switch (command) {
    case 'edit':
      onMsgEdit()
      break
    case 'delete':
      onMsgDelete()
      break
    case 'regenerate':
      regenerateMsg()
      break
    case 'copy':
      copyContent()
      break
    case 'export':
      exportChart()
      break
    case 'insert-to-document':
      requestInsertToDocument()
      break
    case 'export-to-document':
      exportToNewDocument()
      break
  }
}

// hover状态管理
const showActions = ref(false)
const isHoveringMessage = ref(false)
const isHoveringActions = ref(false)
const isHoveringDropdown = ref(false)
const dropdownVisible = ref(false)
let hideTimer: ReturnType<typeof setTimeout> | null = null

const HIDE_DELAY = 500

const shouldShow = computed(() => {
  return (
    isHoveringMessage.value ||
    isHoveringActions.value ||
    isHoveringDropdown.value ||
    dropdownVisible.value
  )
})

const clearHideTimer = () => {
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
}

const showActionsAndTimestamp = () => {
  clearHideTimer()
  showActions.value = true
}

const hideActionsAndTimestamp = () => {
  clearHideTimer()
  hideTimer = setTimeout(() => {
    if (!shouldShow.value) {
      showActions.value = false
    }
    hideTimer = null
  }, HIDE_DELAY)
}

const handleMouseEnter = () => {
  isHoveringMessage.value = true
  showActionsAndTimestamp()
}

const handleMouseLeave = () => {
  isHoveringMessage.value = false
  hideActionsAndTimestamp()
}

const handleActionsMouseEnter = () => {
  isHoveringActions.value = true
  showActionsAndTimestamp()
}

const handleActionsMouseLeave = () => {
  isHoveringActions.value = false
  hideActionsAndTimestamp()
}

const handleDropdownVisibleChange = (visible: boolean) => {
  dropdownVisible.value = visible
  if (visible) {
    showActionsAndTimestamp()
  } else {
    isHoveringDropdown.value = false
    hideActionsAndTimestamp()
  }
}

const handleDropdownMouseEnter = () => {
  isHoveringDropdown.value = true
  showActionsAndTimestamp()
}

const handleDropdownMouseLeave = () => {
  isHoveringDropdown.value = false
  hideActionsAndTimestamp()
}

onBeforeUnmount(() => {
  clearHideTimer()
})
</script>

<template>
  <div
    class="graph-message"
    :class="role === 'user' ? 'graph-message--user' : 'graph-message--assistant'"
  >
    <!-- 助手：与 AIChat MessageBubble 一致，底部始终显示 icon + Tooltip -->
    <template v-if="role === 'assistant'">
      <div
        class="graph-message__body graph-message__body--flat response-container"
        :class="{ 'graph-message__body--has-chart': hasChart }"
      >
        <Collapsible
          v-if="reasoningDisplay"
          v-model:open="isReasoningOpen"
          class="graph-assistant-reasoning-wrap"
          :class="{ 'graph-assistant-reasoning-wrap--open': isReasoningOpen }"
        >
          <CollapsibleTrigger class="graph-assistant-reasoning-trigger" :hide-icon="true">
            <ChevronDown class="graph-assistant-reasoning-chevron" />
            <span>{{ t('agent.message.reasoningBlock') }}</span>
          </CollapsibleTrigger>
          <CollapsibleContent class="graph-assistant-reasoning-body">
            <div class="graph-assistant-reasoning-text">{{ reasoningDisplay }}</div>
          </CollapsibleContent>
        </Collapsible>
        <div v-if="hasChart && !isStreaming" class="chart-container-wrapper">
          <div ref="chartContainerRef" class="chart-container"></div>
        </div>
        <div v-else-if="isStreaming" class="streaming-content graph-md-preview-wrap">
          <MdPreview
            :modelValue="content"
            previewTheme="github"
            codeStyleReverse
            style="text-align: left; color: v-bind('themeState.currentTheme.textColor')"
            :class="themeState.currentTheme.mdeditorClass"
            :codeFold="false"
            :autoFoldThreshold="300"
          />
        </div>
        <div v-else class="text-content graph-md-preview-wrap">
          <MdPreview
            :modelValue="content"
            previewTheme="github"
            codeStyleReverse
            style="text-align: left; color: v-bind('themeState.currentTheme.textColor')"
            :class="themeState.currentTheme.mdeditorClass"
            :codeFold="false"
            :autoFoldThreshold="300"
          />
        </div>
      </div>
      <div class="ai-message-actions graph-assistant-actions">
        <Tooltip v-if="hasChart">
          <TooltipTrigger as-child>
            <Button
              variant="ghost"
              size="sm"
              class="ai-action-btn"
              :disabled="isStreaming"
              @click.stop="exportChart"
            >
              <Download class="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>{{ t('graph.exportChart') }}</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button variant="ghost" size="sm" class="ai-action-btn" @click.stop="copyContent">
              <Copy class="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>{{ t('common.copy', '复制') }}</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              variant="ghost"
              size="sm"
              class="ai-action-btn"
              @click.stop="requestInsertToDocument"
            >
              <FilePlus class="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>{{ t('aiChat.insertToDocument', '插入到文档') }}</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button variant="ghost" size="sm" class="ai-action-btn" @click.stop="exportToNewDocument">
              <FolderPlus class="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>{{ t('aiChat.exportToDocument', '导出到新文档') }}</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button variant="ghost" size="sm" class="ai-action-btn" @click.stop="onMsgEdit">
              <Pencil class="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>{{ t('messageBubble.edit', '编辑') }}</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button variant="ghost" size="sm" class="ai-action-btn" @click.stop="onMsgDelete">
              <Trash2 class="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>{{ t('common.delete', '删除') }}</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </template>

    <!-- 用户：气泡 + 右侧头像，hover 显示「⋯」菜单（与 AIChat 用户消息一致） -->
    <template v-else>
      <div
        class="graph-message__user-stack"
        @mouseenter="handleMouseEnter"
        @mouseleave="handleMouseLeave"
      >
        <div class="graph-message__user-row">
          <div class="graph-message__body graph-message__body--user response-container">
            <div class="text-content text-content--user">
              <pre style="white-space: pre-wrap; word-wrap: break-word; margin: 0">{{ content }}</pre>
            </div>
          </div>
          <Avatar class="graph-message__avatar">
            <AvatarFallback><User class="w-6 h-6" /></AvatarFallback>
          </Avatar>
        </div>
        <transition name="fade">
          <div
            v-show="showActions"
            class="user-message-actions graph-message__user-actions"
            @mouseenter="handleActionsMouseEnter"
            @mouseleave="handleActionsMouseLeave"
          >
            <DropdownMenu @click.stop @update:open="handleDropdownVisibleChange">
              <DropdownMenuTrigger as-child>
                <Button variant="ghost" size="sm" class="ai-action-btn">
                  <MoreVertical class="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                @mouseenter="handleDropdownMouseEnter"
                @mouseleave="handleDropdownMouseLeave"
              >
                <DropdownMenuItem @click="handleActionCommand('copy')">
                  <Copy class="w-4 h-4 mr-2" />
                  {{ t('common.copy', '复制') }}
                </DropdownMenuItem>
                <DropdownMenuItem @click="handleActionCommand('insert-to-document')">
                  <FilePlus class="w-4 h-4 mr-2" />
                  {{ t('aiChat.insertToDocument', '插入到文档') }}
                </DropdownMenuItem>
                <DropdownMenuItem @click="handleActionCommand('export-to-document')">
                  <FolderPlus class="w-4 h-4 mr-2" />
                  {{ t('aiChat.exportToDocument', '导出到新文档') }}
                </DropdownMenuItem>
                <DropdownMenuItem @click="handleActionCommand('edit')">
                  <Pencil class="w-4 h-4 mr-2" />
                  {{ t('messageBubble.edit', '编辑') }}
                </DropdownMenuItem>
                <DropdownMenuItem @click="handleActionCommand('regenerate')">
                  <RefreshCw class="w-4 h-4 mr-2" />
                  {{ t('messageBubble.regenerate', '重新生成') }}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem @click="handleActionCommand('delete')">
                  <Trash2 class="w-4 h-4 mr-2" />
                  {{ t('common.delete', '删除') }}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </transition>
      </div>
    </template>
  </div>
  <Dialog v-model:open="editDialogVisible">
    <DialogContent class="sm:max-w-[80%]">
      <DialogHeader>
        <DialogTitle>{{ $t('messageBubble.editTitle') }}</DialogTitle>
      </DialogHeader>
      <div class="grid gap-4 py-4">
        <md-editor
          v-model="editingText"
          showCodeRowNumber
          previewTheme="github"
          codeStyleReverse
          style="text-align: left"
          :autoFoldThreshold="300"
          :theme="themeState.currentTheme.vditorTheme as any"
        />
      </div>
      <DialogFooter>
        <Button variant="ghost" @click="editDialogVisible = false">{{
          $t('common.cancel')
        }}</Button>
        <Button @click="saveEdit">{{ $t('common.save') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
/* 与 AgentMessageRenderer：扁平助手正文 + 底部 ai-message-actions / user-message-actions */
.graph-message {
  display: flex;
  flex-direction: column;
  position: relative;
  margin: 0 8px 12px;
  max-width: 100%;
}

.graph-message--user {
  align-items: flex-end;
}

.graph-message--assistant {
  align-items: stretch;
}

.graph-message__body {
  box-sizing: border-box;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB',
    'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif, 'Apple Color Emoji',
    'Segoe UI Emoji', 'Segoe UI Symbol';
  font-size: inherit;
}

.graph-message__body--flat {
  width: 100%;
  max-width: 100%;
  border: none !important;
  border-radius: 0;
  box-shadow: none;
  background: transparent !important;
  padding: 8px 4px;
}

.graph-message__body--has-chart {
  min-width: 0;
}

.graph-message__user-stack {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  max-width: 100%;
}

.graph-message__user-row {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  justify-content: flex-end;
  gap: 10px;
}

.graph-message__body--user {
  position: relative;
  width: min(75%, 750px);
  max-width: calc(100% - 52px);
  min-width: min(250px, 50%);
  min-height: 40px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 14px;
  padding: 16px 18px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  transition: box-shadow 0.2s ease;
}

.graph-message__body--user:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.graph-message__avatar {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
}

.graph-message__user-actions {
  justify-content: flex-end;
  align-self: stretch;
  padding-right: 2px;
}

.ai-message-actions,
.user-message-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px 4px;
  margin-bottom: 4px;
}

/* 与 AIChat 助手消息底栏对齐（扁平正文无左侧头像偏移） */
.graph-assistant-actions {
  margin-left: 4px;
  margin-bottom: 8px;
  padding: 2px 0;
}

.ai-action-btn {
  padding: 4px 6px;
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

.ai-action-btn:hover {
  color: v-bind('themeState.currentTheme.primaryColor');
}

.graph-md-preview-wrap :deep(.md-editor-preview),
.graph-md-preview-wrap :deep(.md-editor-preview-wrapper) {
  margin-top: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.chart-container-wrapper {
  width: 100%;
  padding: 8px 0 16px;
}

.chart-container {
  width: 100%;
  min-height: 100px;
}

.streaming-content {
  width: 100%;
}

.text-content {
  width: 100%;
  padding: 8px 0;
}

.text-content--user {
  padding: 0;
}

.text-content pre {
  margin: 0;
  padding: 0;
  font-family: inherit;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-size: inherit;
  line-height: inherit;
}

.graph-assistant-reasoning-wrap {
  margin-bottom: 8px;
}

.graph-assistant-reasoning-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start !important;
  gap: 4px;
  font-size: 12px;
  color: v-bind('themeState.currentTheme.textColor2');
  cursor: pointer;
  user-select: none;
  background: transparent;
  border: none;
  padding: 0 0 4px !important;
  width: auto !important;
}

.graph-assistant-reasoning-chevron {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  transition: transform 0.15s ease;
}

.graph-assistant-reasoning-wrap--open .graph-assistant-reasoning-chevron {
  transform: rotate(0deg);
}

.graph-assistant-reasoning-wrap:not(.graph-assistant-reasoning-wrap--open) .graph-assistant-reasoning-chevron {
  transform: rotate(-90deg);
}

.graph-assistant-reasoning-body {
  padding: 0 0 6px 2px;
}

.graph-assistant-reasoning-text {
  font-size: 12px;
  line-height: 1.45;
  color: v-bind('themeState.currentTheme.textColor2');
  opacity: 0.92;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
