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
  FolderPlus
} from 'lucide-vue-next'
import { Button } from '@renderer/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator
} from '@renderer/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Avatar, AvatarImage, AvatarFallback } from '@renderer/components/ui/avatar'
import { ElMessage } from 'element-plus'
import { ElMessageBox } from 'element-plus'
import { MdEditor, MdPreview } from 'md-editor-v3'
import { themeState } from '../utils/themes'
import '../assets/md-editor-v3-style.css'
import type { AIDialogMessage } from '../../../types'
import { useI18n } from 'vue-i18n'
import eventBus from '../utils/event-bus'
import { renderMarkdownPreview } from '../utils/md-utils'
import { createRendererLogger } from '../utils/logger'

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
}

interface MessageEditPayload {
  index: number
  message: string
}

const props = withDefaults(defineProps<Props>(), {
  isStreaming: false,
  streamingContent: ''
})

const emit = defineEmits<{
  delete: [index: number]
  edit: [payload: MessageEditPayload]
  regenerate: [index: number]
  export: [chartMarkdown?: string]
}>()

const { t } = useI18n()

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

const roleClass = computed(() => {
  return props.message.role === 'user' ? 'user-role' : 'ai-role'
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
      chartContainerRef.value.innerHTML = `<p style="color: var(--el-color-danger);">渲染失败: ${error instanceof Error ? error.message : String(error)}</p>`
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
  ElMessageBox.confirm(
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
    ElMessage.success(t('common.copySuccess', '复制成功'))
  } catch (error) {
    console.error('复制失败:', error)
    ElMessage.error(t('common.copyFailed', '复制失败'))
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
  ElMessage.success(t('aiChat.exportToDocumentSuccess', '已导出到新文档'))
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
    :class="['message-bubble', roleClass]"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <Avatar class="avatar-with-mask" v-if="role !== 'user'">
      <AvatarImage :src="(themeState.currentTheme as any).AiLogo" />
      <AvatarFallback>AI</AvatarFallback>
    </Avatar>
    <!-- 用户消息的操作按钮（在左侧） -->
    <transition name="fade">
      <DropdownMenu
        v-if="role === 'user' && showActions"
        @click.stop
        @update:open="handleDropdownVisibleChange"
        class="side-button"
      >
        <DropdownMenuTrigger
          as-child
          @mouseenter="handleActionsMouseEnter"
          @mouseleave="handleActionsMouseLeave"
        >
          <Button circle size="small"><MoreVertical class="w-4 h-4" /></Button>
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
    </transition>
    <div
      class="bubble-content response-container"
      :class="{ 'has-chart': hasChart && role === 'assistant' }"
      style="max-height: none"
    >
      <!-- 如果是助手消息且有图表，优先显示图表 -->
      <div v-if="role === 'assistant' && hasChart && !isStreaming" class="chart-container-wrapper">
        <div ref="chartContainerRef" class="chart-container"></div>
      </div>
      <!-- 如果正在流式输出，显示流式内容 -->
      <div v-else-if="role === 'assistant' && isStreaming" class="streaming-content">
        <MdPreview
          :modelValue="content"
          previewTheme="github"
          codeStyleReverse
          style="
            text-align: left;
            margin-top: 20px;
            color: v-bind('themeState.currentTheme.textColor');
          "
          :class="themeState.currentTheme.mdeditorClass"
          :codeFold="false"
          :autoFoldThreshold="300"
        />
      </div>
      <!-- 普通文本内容 -->
      <div v-else-if="role === 'user' || (!hasChart && !isStreaming)" class="text-content">
        <MdPreview
          v-if="role === 'assistant'"
          :modelValue="content"
          previewTheme="github"
          codeStyleReverse
          style="
            text-align: left;
            margin-top: 20px;
            color: v-bind('themeState.currentTheme.textColor');
          "
          :class="themeState.currentTheme.mdeditorClass"
          :codeFold="false"
          :autoFoldThreshold="300"
        />
        <pre v-else style="white-space: pre-wrap; word-wrap: break-word; margin: 0">{{
          content
        }}</pre>
      </div>
    </div>
    <!-- AI消息的操作按钮（在右侧） -->
    <transition name="fade">
      <DropdownMenu
        v-if="role !== 'user' && showActions"
        @click.stop
        @update:open="handleDropdownVisibleChange"
        class="side-button"
      >
        <DropdownMenuTrigger
          as-child
          @mouseenter="handleActionsMouseEnter"
          @mouseleave="handleActionsMouseLeave"
        >
          <Button circle size="small"><MoreVertical class="w-4 h-4" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          @mouseenter="handleDropdownMouseEnter"
          @mouseleave="handleDropdownMouseLeave"
        >
          <DropdownMenuItem v-if="hasChart" @click="handleActionCommand('export')">
            <FilePlus class="w-4 h-4 mr-2" />
            {{ t('graph.export', '导出图表') }}
          </DropdownMenuItem>
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
          <DropdownMenuSeparator />
          <DropdownMenuItem @click="handleActionCommand('delete')">
            <Trash2 class="w-4 h-4 mr-2" />
            {{ t('common.delete', '删除') }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </transition>
    <Avatar class="avatar-fallback" v-if="role === 'user'">
      <AvatarFallback><User class="w-6 h-6" /></AvatarFallback>
    </Avatar>
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
.side-button {
  align-self: flex-end;
  margin-top: auto;
  z-index: 10;
  position: relative;
  flex-shrink: 0;
}

.message-bubble {
  display: flex;
  align-items: flex-start;
  position: relative;
  margin-left: 30px;
  margin-right: 30px;
}

.bubble-content {
  min-width: 10px;
  min-height: 10px;
  border-radius: 10px;
  transition:
    transform 0.3s ease,
    border-color 0.3s,
    box-shadow 0.3s;
  margin: 10px 10px;
  margin-top: 10px;
  margin-bottom: 10px;
  padding: 0 25px;
  max-width: 61.8%;
  flex-grow: 1;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB',
    'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif, 'Apple Color Emoji',
    'Segoe UI Emoji', 'Segoe UI Symbol';
  font-size: inherit;
}

/* 图表消息使用更宽的最大宽度，由父容器决定 */
.bubble-content.has-chart {
  max-width: min(95%, calc(100% - 100px));
}

.bubble-content:hover {
  border-color: rgba(48, 162, 255, 0.42);
  box-shadow: 0 0 8px rgba(83, 109, 254, 0.46);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.user-role {
  justify-content: flex-end;
}

.ai-role {
  justify-content: flex-start;
}

.avatar-with-mask {
  width: 40px;
  height: 40px;
  background-color: rgba(64, 158, 255, 0.15);
  border: 2px solid rgba(64, 158, 255, 0.3);
}

.avatar-fallback {
  width: 40px;
  height: 40px;
}

.chart-container-wrapper {
  width: 100%;
  padding: 16px 0;
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
  padding: 20px 0;
}

.text-content pre {
  margin: 0;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB',
    'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif, 'Apple Color Emoji',
    'Segoe UI Emoji', 'Segoe UI Symbol';
  white-space: pre-wrap;
  word-wrap: break-word;
  font-size: inherit;
  line-height: inherit;
}
</style>
