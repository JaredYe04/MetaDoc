<script setup lang="ts">
import '../assets/response-container.css'
import { ref, computed, onMounted, onBeforeMount, nextTick, watch } from 'vue'
import {
  User,
  MoreVertical,
  Copy,
  FilePlus,
  FolderPlus,
  Pencil,
  RefreshCw,
  Trash2
} from 'lucide-vue-next'
import { ElMessage } from 'element-plus'
import { ElMessageBox } from 'element-plus'
import { MdEditor, MdPreview, MdCatalog } from 'md-editor-v3'
import { themeState } from '../utils/themes'
import '../assets/md-editor-v3-style.css'
import ReferenceDisplay from './agent/ReferenceDisplay.vue'
import type { Reference } from '../types/agent-framework'
import type { AIDialogMessage } from '../../../types'
import { useI18n } from 'vue-i18n'
import eventBus from '../utils/event-bus'
import { Button } from '@renderer/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator
} from '@renderer/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@renderer/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@renderer/components/ui/dialog'
import {
  Avatar,
  AvatarFallback,
} from '@renderer/components/ui/avatar'

interface MessageWithReferences extends AIDialogMessage {
  referenceIds?: string[]
}

interface Props {
  message: MessageWithReferences
  index: number
  sessionReferences?: Reference[]
}

interface MessageEditPayload {
  index: number
  message: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  delete: [index: number]
  edit: [payload: MessageEditPayload]
  regenerate: [index: number]
}>()

const { t } = useI18n()

const role = computed(() => {
  return props.message.role
})

const content = computed(() => {
  return props.message.content
})

const roleClass = computed(() => {
  return props.message.role === 'user' ? 'user-role' : 'ai-role'
})

onBeforeMount(() => {
  //console.log(props.message)
})

const regenerateMsg = () => {
  emit('regenerate', props.index + 1)
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
  editingText.value = content.value
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
    await navigator.clipboard.writeText(content.value)
    ElMessage.success(t('common.copySuccess', '复制成功'))
  } catch (error) {
    console.error('复制失败:', error)
    ElMessage.error(t('common.copyFailed', '复制失败'))
  }
}

// 请求插入到文档（触发选择对话框）
const requestInsertToDocument = () => {
  eventBus.emit('ai-chat-request-insert-to-document', {
    content: content.value
  })
}

// 注意：getDocumentDisplayName 已不再使用，显示名称现在在 documentTabs computed 中预先计算

// 导出到新文档
const exportToNewDocument = () => {
  eventBus.emit('ai-chat-export-to-document', {
    content: content.value
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
    case 'insert-to-document':
      // 触发选择文档对话框
      requestInsertToDocument()
      break
    case 'export-to-document':
      exportToNewDocument()
      break
  }
}

// 子菜单hover状态
const showDocumentSubmenu = ref(false)

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

// 引用容器的ref和样式
const referencesContainerRef = ref<HTMLElement | null>(null)
const messageBubbleRef = ref<HTMLElement | null>(null)
const bubbleContentRef = ref<HTMLElement | null>(null)
const referencesStyle = ref<Record<string, string>>({})

// 计算引用容器的右边缘位置和宽度
const calculateReferencesPosition = () => {
  nextTick(() => {
    if (!referencesContainerRef.value || !messageBubbleRef.value) return

    // 获取消息气泡元素
    const messageBubble = messageBubbleRef.value
    const bubbleContent =
      bubbleContentRef.value || (messageBubble.querySelector('.bubble-content') as HTMLElement)

    if (!bubbleContent) return

    // 获取气泡内容的实际宽度（包括padding）
    const bubbleContentRect = bubbleContent.getBoundingClientRect()
    const bubbleContentWidth = bubbleContentRect.width

    // 获取引用容器的位置
    const referencesRect = referencesContainerRef.value.getBoundingClientRect()

    // 计算右边缘位置：窗口右边缘 - 气泡内容右边缘
    // 需要减去气泡内容的padding-right
    const windowWidth = window.innerWidth
    const bubbleContentRight = bubbleContentRect.right
    const bubbleContentStyle = window.getComputedStyle(bubbleContent)
    const paddingRight = parseFloat(bubbleContentStyle.paddingRight) || 0
    // 计算margin-right，稍微减少一点（减去5px）来补偿可能的计算误差
    const marginRight = windowWidth - bubbleContentRight - paddingRight - 30

    // 设置宽度和margin-right，确保宽度与气泡内容一致
    referencesStyle.value = {
      width: `${bubbleContentWidth}px`,
      marginRight: `${Math.max(0, marginRight)}px`
    }
  })
}

// 监听窗口大小变化和内容变化
watch(
  () => [props.message, content.value],
  () => {
    calculateReferencesPosition()
  },
  { deep: true }
)

onMounted(() => {
  calculateReferencesPosition()
  window.addEventListener('resize', calculateReferencesPosition)
})

onBeforeMount(() => {
  window.removeEventListener('resize', calculateReferencesPosition)
  clearHideTimer()
})
</script>

<template>
  <div
    ref="messageBubbleRef"
    :class="['message-bubble', roleClass]"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
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
          <Button variant="ghost" size="icon" class="h-8 w-8 rounded-full">
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
    </transition>
    <div
      ref="bubbleContentRef"
      :class="['bubble-content', 'response-container', { 'ai-flat-content': role !== 'user' }]"
      style="max-height: none"
    >
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
      <!-- <markdown-it :source="content" /> -->
    </div>
    <Avatar v-if="role === 'user'" class="avatar-fallback">
      <AvatarFallback><User class="w-6 h-6" /></AvatarFallback>
    </Avatar>
  </div>
  <!-- AI消息的操作按钮（平铺在消息下方，始终显示） -->
  <div v-if="role !== 'user'" class="ai-message-actions">
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
        <Button variant="ghost" size="sm" class="ai-action-btn" @click.stop="requestInsertToDocument">
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
  <!-- 引用显示（只读模式，只显示用户消息的引用） -->
  <div
    v-if="
      role === 'user' &&
      props.message.referenceIds &&
      props.message.referenceIds.length > 0 &&
      props.sessionReferences &&
      props.sessionReferences.length > 0
    "
    ref="referencesContainerRef"
    class="message-bubble__references"
    :style="referencesStyle"
  >
    <ReferenceDisplay
      :references="props.sessionReferences"
      :active-reference-ids="props.message.referenceIds || []"
      readonly
    />
  </div>
  <Dialog v-model:open="editDialogVisible">
    <DialogContent class="sm:max-w-[80vw]">
      <DialogHeader>
        <DialogTitle>{{ $t('messageBubble.editTitle') }}</DialogTitle>
      </DialogHeader>
      <md-editor
        v-model="editingText"
        showCodeRowNumber
        previewTheme="github"
        codeStyleReverse
        style="text-align: left"
        :autoFoldThreshold="300"
        :theme="themeState.currentTheme.vditorTheme as any"
      />
      <DialogFooter>
        <Button variant="secondary" @click="editDialogVisible = false">{{ $t('common.cancel') }}</Button>
        <Button @click="saveEdit">{{ $t('common.save') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.side-button {
  align-self: flex-end; /* 将按钮对齐到容器的底部 */
  margin-top: auto; /* 自动填充上方的空间，贴到底部 */
  z-index: 10; /* 确保按钮在内容之上 */
  position: relative; /* 建立定位上下文 */
  flex-shrink: 0; /* 防止按钮被压缩 */
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
  padding: 0 25px; /* 内边距，增加空间 */
  max-width: 61.8%;
  flex-grow: 1;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
}

.bubble-content:hover {
  border-color: rgba(48, 162, 255, 0.42); /* 改变边框颜色 */
  box-shadow: 0 0 8px rgba(83, 109, 254, 0.46); /* 加入阴影 */
}

/* AI消息：平铺展示，无气泡效果 */
.bubble-content.ai-flat-content {
  box-shadow: none;
  border-radius: 0;
  border: none;
  background: transparent !important;
  margin: 0;
  padding: 0 8px;
  max-width: 100%;
}

.bubble-content.ai-flat-content:hover {
  border-color: transparent;
  box-shadow: none;
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

.avatar-img {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
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

.message-bubble__references {
  margin-top: 8px;
  margin-left: auto;
  /* 宽度由 JavaScript 动态设置，与消息气泡宽度一致 */
}

/* AI消息底部操作按钮 */
.ai-message-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: 38px;
  margin-bottom: 8px;
  padding: 2px 0;
}

.ai-action-btn {
  padding: 4px 6px;
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

.ai-action-btn:hover {
  color: var(--el-color-primary);
}
</style>
