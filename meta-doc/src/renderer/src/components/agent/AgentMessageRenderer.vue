<template>
  <div :class="['agent-message', alignmentClass]">
    <div class="agent-message__main">
    <!-- AI/Assistant/Tool消息：头像在左边 -->
    <div v-if="message.role !== 'user'" class="agent-message__avatar agent-message__avatar--left">
      <el-avatar 
        v-if="message.role === 'assistant'"
        :src="themeState.currentTheme.AiLogo" 
        class="avatar-with-mask"
      />
      <el-avatar 
        v-else-if="message.type === 'tool'"
        :src="themeState.currentTheme.ToolLogo" 
        class="avatar-with-mask"
      />
      <el-avatar v-else :icon="Avatar" class="avatar-fallback" />
    </div>

    <!-- 消息气泡 -->
    <div 
      class="agent-message__body" 
      :style="bubbleStyle"
      @mouseenter="handleMouseEnter"
      @mouseleave="handleMouseLeave"
    >
      <!-- 时间戳（用户消息显示在左边，AI消息显示在右边） -->
      <transition name="fade">
        <div 
          v-if="showTimestamp" 
          class="agent-message__timestamp"
          :class="{
            'agent-message__timestamp--left': message.role === 'user',
            'agent-message__timestamp--right': message.role !== 'user'
          }"
        >
          {{ formatTimestamp(message.timestamp) }}
        </div>
      </transition>

      <!-- 消息操作按钮（hover时显示） -->
      <transition name="fade">
        <div 
          v-if="showActions && (message.role === 'user' || (message.role === 'assistant' && message.type === 'chat'))" 
          class="agent-message__actions"
          :class="{
            'agent-message__actions--left': message.role === 'user',
            'agent-message__actions--right': message.role !== 'user'
          }"
          @mouseenter="handleActionsMouseEnter"
          @mouseleave="handleActionsMouseLeave"
        >
          <!-- 用户消息：显示编辑按钮 -->
          <el-tooltip v-if="message.role === 'user'" :content="t('agent.message.edit')" placement="top">
            <el-button
              circle
              size="small"
              :icon="Edit"
              @click.stop="handleEdit"
            />
          </el-tooltip>
          <el-dropdown @command="handleActionCommand" trigger="click" @click.stop @visible-change="handleDropdownVisibleChange">
            <el-button
              circle
              size="small"
              :icon="More"
            />
            <template #dropdown>
              <el-dropdown-menu @mouseenter="handleDropdownMouseEnter" @mouseleave="handleDropdownMouseLeave">
                <el-dropdown-item command="regenerate">{{ t('agent.message.regenerate') }}</el-dropdown-item>
                <el-dropdown-item v-if="message.role === 'user'" command="duplicate">{{ t('agent.message.duplicateSession') }}</el-dropdown-item>
                <el-dropdown-item command="delete" divided>{{ t('agent.message.delete') }}</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </transition>

      <!-- Tool结果 -->
      <div v-if="message.type === 'tool'" class="tool-message-wrapper">
        <el-collapse 
          v-model="toolMessageCollapseActive"
          class="tool-message-collapse"
        >
          <el-collapse-item :name="message.id">
            <template #title>
              <div class="tool-message-header-preview">
                <span class="tool-message-title">{{ (message as ToolAgentMessage).tool.name }}</span>
                <el-tag size="small" :type="getToolStatusTagType((message as ToolAgentMessage).status)">
                  {{ getToolStatusLabel((message as ToolAgentMessage).status) }}
                </el-tag>
                <small class="tool-message-timestamp">{{ formatTimestamp((message as ToolAgentMessage).timestamp) }}</small>
              </div>
            </template>
            <component
              :is="AgentToolResultCard"
              :message="message as ToolAgentMessage"
              :messages="messages"
              :message-index="messageIndex"
            />
          </el-collapse-item>
        </el-collapse>
      </div>

      <!-- 文本内容 -->
      <div v-else class="agent-message__content">
        <!-- 如果消息包含tool_calls，需要将工具调用标记替换为指示器 -->
        <template v-if="hasToolCalls && processedContentParts.length > 0">
          <template v-for="(part, index) in processedContentParts" :key="index">
            <!-- 如果是工具调用指示器 -->
            <div v-if="part.type === 'tool-call'" class="tool-calls-indicator tool-calls-completed">
              <el-icon class="tool-call-checkmark"><Check /></el-icon>
              <span>{{ part.text }}</span>
            </div>
            <!-- 如果是markdown内容 -->
            <MdPreview
              v-else-if="part.type === 'markdown' && part.content"
              :modelValue="part.content"
              previewTheme="github"
              :codeFold="false"
              :autoFoldThreshold="300"
              :style="{
                color: themeState.currentTheme.textColor
              }"
              :class="themeState.currentTheme.mdeditorClass"
            />
          </template>
        </template>
        <!-- 如果没有tool_calls，正常显示markdown -->
        <MdPreview
          v-else-if="messageMarkdown"
          :modelValue="messageMarkdown"
          previewTheme="github"
          :codeFold="false"
          :autoFoldThreshold="300"
          :style="{
            color: themeState.currentTheme.textColor
          }"
          :class="themeState.currentTheme.mdeditorClass"
        />
      </div>
    </div>

    <!-- 用户消息：头像在右边 -->
    <div v-if="message.role === 'user'" class="agent-message__avatar agent-message__avatar--right">
      <el-tooltip :content="userName" placement="left" :disabled="!userName">
        <el-avatar :icon="User" class="avatar-fallback" />
      </el-tooltip>
    </div>
    </div>

    <!-- 引用显示（只读模式，只显示用户消息的引用，放在气泡外面） -->
    <ReferenceDisplay
      v-if="message.role === 'user' && message.type === 'chat' && (message as ChatAgentMessage).referenceIds && (message as ChatAgentMessage).referenceIds!.length > 0 && sessionReferences && sessionReferences.length > 0"
      :references="sessionReferences"
      :active-reference-ids="(message as ChatAgentMessage).referenceIds || []"
      readonly
      class="agent-message__references"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onBeforeUnmount } from 'vue'
import { MdPreview } from 'md-editor-v3'
import { useI18n } from 'vue-i18n'
import { Avatar, User, Edit, More, Loading, Check } from '@element-plus/icons-vue'
import type { AgentMessage, ChatAgentMessage, ToolAgentMessage } from '../../types/agent'
import AgentToolResultCard from './AgentToolResultCard.vue'
import ReferenceDisplay from './ReferenceDisplay.vue'
import { themeState } from '../../utils/themes'
import type { Reference } from '../../types/agent-framework'
import { dayjs } from 'element-plus'
import { agentToolManager } from '../../utils/agent-tool-manager'
import { toolCallParserManager } from '../../utils/agent-framework/tool-call-parsers'

const props = defineProps<{
  message: AgentMessage
  messages?: AgentMessage[] // 传递整个消息数组，用于检查tool_calls是否已完成
  messageIndex?: number // 当前消息的索引
  userName?: string
  sessionReferences?: Reference[] // 会话的引用列表
}>()

const emit = defineEmits<{
  (e: 'edit', message: AgentMessage): void
  (e: 'regenerate', message: AgentMessage): void
  (e: 'duplicate', message: AgentMessage): void
  (e: 'delete', message: AgentMessage): void
}>()

const { t } = useI18n()

const showTimestamp = ref(false)
const showActions = ref(false)

// Tool消息折叠状态
const toolMessageCollapseActive = ref<string[]>([])

// 判断当前tool消息是否是最新的tool调用
const isLatestToolMessage = computed(() => {
  if (props.message.type !== 'tool' || !props.messages || props.messageIndex === undefined) {
    return true // 如果不是tool消息，默认展开
  }
  
  // 查找当前消息之后是否还有其他tool消息
  for (let i = props.messageIndex + 1; i < props.messages.length; i++) {
    if (props.messages[i].type === 'tool') {
      return false // 后面还有tool消息，说明不是最新的
    }
  }
  
  return true // 没有其他tool消息，说明是最新的
})

// 是否已初始化折叠状态（避免覆盖用户的手动操作）
const collapseInitialized = ref(false)

// 初始化tool消息折叠状态（仅在首次加载时）
const initToolMessageCollapse = () => {
  if (props.message.type === 'tool' && !collapseInitialized.value) {
    // 如果不是最新的tool消息，默认折叠
    if (!isLatestToolMessage.value) {
      toolMessageCollapseActive.value = []
    } else {
      // 如果是最新的，默认展开
      toolMessageCollapseActive.value = [props.message.id]
    }
    collapseInitialized.value = true
  }
}

// 监听messages变化，当有新的tool消息出现时，折叠之前的tool消息
watch(
  () => props.messages,
  (newMessages, oldMessages) => {
    if (!newMessages || props.messageIndex === undefined || props.message.type !== 'tool') {
      return
    }
    
    // 检查是否有新的tool消息出现在当前消息之后
    if (oldMessages && newMessages.length > oldMessages.length) {
      const currentIndex = props.messageIndex
      const currentMsgId = props.message.id
      
      // 查找当前消息之后是否有新的tool消息
      let hasNewToolAfter = false
      for (let i = currentIndex + 1; i < newMessages.length; i++) {
        if (newMessages[i].type === 'tool') {
          hasNewToolAfter = true
          break
        }
      }
      
      // 如果有新的tool消息在当前消息之后，折叠当前消息（强制折叠，因为这是自动行为）
      if (hasNewToolAfter) {
        toolMessageCollapseActive.value = []
      }
    }
    
    // 如果还未初始化，进行初始化
    if (!collapseInitialized.value) {
      initToolMessageCollapse()
    }
  },
  { deep: true, immediate: true }
)

// 监听isLatestToolMessage变化，当变成不是最新时，折叠当前消息
watch(
  isLatestToolMessage,
  (isLatest) => {
    if (props.message.type === 'tool' && collapseInitialized.value && !isLatest) {
      // 如果当前消息不再是最新的tool消息，折叠它
      toolMessageCollapseActive.value = []
    }
  },
  { immediate: false }
)

// 获取工具状态标签类型
const getToolStatusTagType = (status: ToolAgentMessage['status']) => {
  switch (status) {
    case 'pending':
      return 'info'
    case 'running':
      return 'warning'
    case 'succeeded':
      return 'success'
    case 'failed':
      return 'danger'
    default:
      return 'info'
  }
}

// 获取工具状态标签文本
const getToolStatusLabel = (status: ToolAgentMessage['status']) => {
  switch (status) {
    case 'pending':
      return t('agent.tool.status.pending')
    case 'running':
      return t('agent.tool.status.running')
    case 'succeeded':
      return t('agent.tool.status.success')
    case 'failed':
      return t('agent.tool.status.failed')
    default:
      return status
  }
}

const alignmentClass = computed(() => {
  if (props.message.role === 'user') return 'align-right'
  return 'align-left'
})

const bubbleStyle = computed(() => {
  const currentTheme = themeState.currentTheme as Record<string, any>
  const primarySubtle = currentTheme.primarySubtle as string | undefined
  if (props.message.role === 'user') {
    return {
      backgroundColor: primarySubtle ?? 'rgba(64, 158, 255, 0.12)',
      borderColor: 'rgba(64, 158, 255, 0.45)',
      color: themeState.currentTheme.textColor
    }
  }
  if (props.message.type === 'tool') {
    return {
      backgroundColor: themeState.currentTheme.background2nd,
      borderColor: 'rgba(103, 194, 58, 0.3)',
      color: themeState.currentTheme.textColor
    }
  }
  return {
    backgroundColor: themeState.currentTheme.background2nd,
    borderColor: 'rgba(0,0,0,0.08)',
    color: themeState.currentTheme.textColor
  }
})

/**
 * 清理多余的或不完整的工具调用标记
 * 保留完整的标记对，只清理单独的开始或结束标记
 * 支持多种格式的标记
 */
const cleanIncompleteToolCallTags = (content: string): string => {
  // 使用占位符保护完整的标记对
  const placeholders: Array<{ placeholder: string; original: string }> = []
  let placeholderIndex = 0
  
  // 1. 使用解析器管理器获取所有格式的完整标记，并替换为占位符
  const allPatterns = toolCallParserManager.getAllMarkerPatterns()
  for (const pattern of allPatterns) {
    content = content.replace(pattern, (match) => {
      const placeholder = `__TOOL_CALL_COMPLETE_${placeholderIndex}__`
      placeholders.push({ placeholder, original: match })
      placeholderIndex++
      return placeholder
    })
  }
  
  // 2. 替换完整的旧格式标记为占位符（兼容性）
  content = content.replace(/\<\|redacted_tool_calls_begin\|>[\s\S]*?\<\|redacted_tool_calls_end\|>/gi, (match) => {
    const placeholder = `__TOOL_CALL_COMPLETE_${placeholderIndex}__`
    placeholders.push({ placeholder, original: match })
    placeholderIndex++
    return placeholder
  })
  
  content = content.replace(/\<｜tools▁call▁begin｜>[\s\S]*?<｜tools▁call▁end｜>/gi, (match) => {
    const placeholder = `__TOOL_CALL_COMPLETE_${placeholderIndex}__`
    placeholders.push({ placeholder, original: match })
    placeholderIndex++
    return placeholder
  })
  
  // 3. 清理剩余的单独标记（不完整的标记）
  // 标准格式
  content = content.replace(/<tool_call>/gi, '')
  content = content.replace(/<\/tool_call>/gi, '')
  // DSML格式
  content = content.replace(/<｜DSML｜function_calls>/gi, '')
  content = content.replace(/<\/｜DSML｜function_calls>/gi, '')
  content = content.replace(/<｜DSML｜invoke/gi, '')
  content = content.replace(/<\/｜DSML｜invoke>/gi, '')
  // 旧格式（兼容性）
  content = content.replace(/\<\|redacted_tool_calls_begin\|>/gi, '')
  content = content.replace(/\<\|redacted_tool_calls_end\|>/gi, '')
  content = content.replace(/\<｜tools▁call▁begin｜>/gi, '')
  content = content.replace(/<｜tools▁call▁end｜>/gi, '')
  
  // 4. 恢复占位符（完整的标记）
  placeholders.forEach(({ placeholder, original }) => {
    content = content.replace(placeholder, original)
  })
  
  return content
}

const messageMarkdown = computed(() => {
  if (props.message.type === 'chat' || props.message.type === 'thought') {
    let content = props.message.markdown || '';
    
    // 如果没有tool_calls，清理所有标记（包括完整的和不完整的）
    if (!hasToolCalls.value) {
      // 使用解析器管理器清理所有格式的完整标记
      content = toolCallParserManager.cleanAllMarkers(content)
      
      // 清理旧的标记格式（兼容性）
      content = content.replace(/\<\|redacted_tool_calls_begin\|>[\s\S]*?\<\|redacted_tool_calls_end\|>/gi, '').trim()
      content = content.replace(/\<｜tools▁call▁begin｜>[\s\S]*?<｜tools▁call▁end｜>/gi, '').trim()
      
      // 清理不完整的标记
      content = cleanIncompleteToolCallTags(content)
    } else {
      // 如果有tool_calls，只清理不完整的标记（完整的标记会在processedContentParts中处理）
      content = cleanIncompleteToolCallTags(content)
    }
    
    return content;
  }
  return ''
})

// 处理后的内容部分（包含工具调用指示器和markdown内容）
const processedContentParts = computed(() => {
  if (props.message.type !== 'chat' && props.message.type !== 'thought') {
    return []
  }
  
  if (!hasToolCalls.value) {
    // 如果没有tool_calls，只返回markdown内容
    if (messageMarkdown.value) {
      return [{ type: 'markdown' as const, content: messageMarkdown.value }]
    }
    return []
  }
  
  const chatMsg = props.message as ChatAgentMessage
  if (!chatMsg.tool_calls || chatMsg.tool_calls.length === 0) {
    return []
  }
  
  // 获取原始markdown内容
  let content = props.message.markdown || ''
  
  // 先清理不完整的工具调用标记
  content = cleanIncompleteToolCallTags(content)
  
  // 创建工具调用映射（按在markdown中出现的顺序）
  const toolCallMap = new Map<string, { id: string; tool_id: string; text: string }>()
  for (const toolCall of chatMsg.tool_calls) {
    const tool = agentToolManager.getTool(toolCall.tool_id)
    const toolName = tool 
      ? agentToolManager.getLocalizedText(tool.config.name)
      : toolCall.tool_id
    const text = t('agent.message.toolCallInitiated', { tool: toolName })
    toolCallMap.set(toolCall.id, {
      id: toolCall.id,
      tool_id: toolCall.tool_id,
      text
    })
  }
  
  // 解析markdown，找到工具调用标记的位置
  const parts: Array<{ type: 'tool-call' | 'markdown'; content?: string; text?: string }> = []
  
  // 使用解析器管理器获取所有格式的标记模式
  // 优先匹配标准格式（因为processedContentParts主要用于显示标准格式）
  const toolCallRegex = /<tool_call>[\s\S]*?<\/tool_call>/gi
  // 也匹配DSML格式
  const dsmlRegex = /<｜DSML｜function_calls>[\s\S]*?<\/｜DSML｜function_calls>|<｜DSML｜invoke[\s\S]*?<\/｜DSML｜invoke>/gi
  
  let lastIndex = 0
  let match
  let toolCallIndex = 0
  
  // 先匹配标准格式
  while ((match = toolCallRegex.exec(content)) !== null) {
    // 添加标记前的markdown内容
    if (match.index > lastIndex) {
      const markdownPart = content.substring(lastIndex, match.index).trim()
      if (markdownPart) {
        parts.push({ type: 'markdown', content: markdownPart })
      }
    }
    
    // 尝试从工具调用标记中提取tool_call_id（如果可能）
    // 但通常我们按顺序匹配
    const toolCallIds = Array.from(toolCallMap.keys())
    if (toolCallIndex < toolCallIds.length) {
      const toolCallId = toolCallIds[toolCallIndex]
      const toolCallInfo = toolCallMap.get(toolCallId)
      if (toolCallInfo) {
        parts.push({ type: 'tool-call', text: toolCallInfo.text })
      }
      toolCallIndex++
    }
    
    lastIndex = match.index + match[0].length
  }
  
  // 添加剩余的markdown内容
  if (lastIndex < content.length) {
    const markdownPart = content.substring(lastIndex).trim()
    if (markdownPart) {
      parts.push({ type: 'markdown', content: markdownPart })
    }
  }
  
  // 如果还有未匹配的工具调用，在末尾添加
  while (toolCallIndex < toolCallMap.size) {
    const toolCallIds = Array.from(toolCallMap.keys())
    const toolCallId = toolCallIds[toolCallIndex]
    const toolCallInfo = toolCallMap.get(toolCallId)
    if (toolCallInfo) {
      parts.push({ type: 'tool-call', text: toolCallInfo.text })
    }
    toolCallIndex++
  }
  
  // 如果没有找到任何工具调用标记，但消息有tool_calls，在开头添加所有工具调用指示器
  if (parts.length === 0 && toolCallMap.size > 0) {
    for (const toolCallInfo of toolCallMap.values()) {
      parts.push({ type: 'tool-call', text: toolCallInfo.text })
    }
    // 如果有markdown内容，添加在后面
    if (content.trim()) {
      parts.push({ type: 'markdown', content: content.trim() })
    }
  }
  
  return parts
})

// 检查消息是否包含tool_calls
const hasToolCalls = computed(() => {
  if (props.message.type === 'chat' && props.message.role === 'assistant') {
    const chatMsg = props.message as ChatAgentMessage
    return chatMsg.tool_calls && chatMsg.tool_calls.length > 0
  }
  return false
})

// 检查tool_calls是否已完成（即是否有对应的tool消息）
const toolCallsCompleted = computed(() => {
  if (!hasToolCalls.value || !props.messages || props.messageIndex === undefined) {
    return false
  }
  
  const chatMsg = props.message as ChatAgentMessage
  if (!chatMsg.tool_calls || chatMsg.tool_calls.length === 0) {
    return false
  }
  
  // 获取所有tool_call的id
  const toolCallIds = new Set(chatMsg.tool_calls.map(tc => tc.id))
  
  // 检查当前消息之后是否有对应的tool消息
  // 找到第一个tool消息，检查它的tool_call_id是否匹配
  for (let i = props.messageIndex + 1; i < props.messages.length; i++) {
    const nextMsg = props.messages[i]
    if (nextMsg.type === 'tool' && nextMsg.role === 'tool') {
      const toolCallId = (nextMsg as any).tool_call_id
      if (toolCallId && toolCallIds.has(toolCallId)) {
        // 找到了对应的tool消息，说明tool_calls已完成
        return true
      }
    }
    // 如果遇到下一个assistant消息，说明tool调用已完成（工具结果已经被处理）
    if (nextMsg.role === 'assistant') {
      return true
    }
  }
  
  return false
})

// 生成工具调用提示文本
const toolCallsText = computed(() => {
  if (!hasToolCalls.value) return ''
  const chatMsg = props.message as ChatAgentMessage
  if (!chatMsg.tool_calls || chatMsg.tool_calls.length === 0) return ''
  
  const toolNames = chatMsg.tool_calls.map(tc => {
    const tool = agentToolManager.getTool(tc.tool_id)
    if (tool) {
      return agentToolManager.getLocalizedText(tool.config.name)
    }
    return tc.tool_id
  })
  
  // 如果已完成，显示"AI发起了xxx的调用"
  if (toolCallsCompleted.value) {
    if (toolNames.length === 1) {
      return t('agent.message.toolCallInitiated', { tool: toolNames[0] })
    } else {
      return t('agent.message.toolCallsInitiated', { count: toolNames.length, tools: toolNames.join('、') })
    }
  }
  
  // 如果未完成，显示"正在调用xxx"
  if (toolNames.length === 1) {
    return t('agent.message.callingTool', { tool: toolNames[0] })
  } else {
    return t('agent.message.callingTools', { count: toolNames.length, tools: toolNames.join('、') })
  }
})

const formatTimestamp = (timestamp: string) => {
  return dayjs(timestamp).format('HH:mm')
}

// 统一的hover状态管理
const isHoveringMessage = ref(false) // 鼠标是否在消息气泡上
const isHoveringActions = ref(false) // 鼠标是否在按钮区域上
const isHoveringDropdown = ref(false) // 鼠标是否在下拉菜单上
const dropdownVisible = ref(false) // 下拉菜单是否可见
let hideTimer: ReturnType<typeof setTimeout> | null = null

// 延迟隐藏时间（毫秒）
const HIDE_DELAY = 500

// 检查是否应该显示按钮
const shouldShow = computed(() => {
  return isHoveringMessage.value || isHoveringActions.value || isHoveringDropdown.value || dropdownVisible.value
})

// 清除隐藏定时器
const clearHideTimer = () => {
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
}

// 显示操作按钮和时间戳
const showActionsAndTimestamp = () => {
  clearHideTimer()
  showTimestamp.value = true
  // 用户消息和AI聊天消息都可以显示操作按钮
  if (props.message.role === 'user' || (props.message.role === 'assistant' && props.message.type === 'chat')) {
    showActions.value = true
  }
}

// 延迟隐藏操作按钮和时间戳
const hideActionsAndTimestamp = () => {
  clearHideTimer()
  hideTimer = setTimeout(() => {
    if (!shouldShow.value) {
      showActions.value = false
      showTimestamp.value = false
    }
    hideTimer = null
  }, HIDE_DELAY)
}

// 消息气泡hover进入
const handleMouseEnter = () => {
  isHoveringMessage.value = true
  showActionsAndTimestamp()
}

// 消息气泡hover离开
const handleMouseLeave = () => {
  isHoveringMessage.value = false
  hideActionsAndTimestamp()
}

// 按钮区域hover进入
const handleActionsMouseEnter = () => {
  isHoveringActions.value = true
  showActionsAndTimestamp()
}

// 按钮区域hover离开
const handleActionsMouseLeave = () => {
  isHoveringActions.value = false
  hideActionsAndTimestamp()
}

// 下拉菜单显示状态变化
const handleDropdownVisibleChange = (visible: boolean) => {
  dropdownVisible.value = visible
  if (visible) {
    // 菜单打开时，保持显示
    showActionsAndTimestamp()
  } else {
    // 菜单关闭时，检查是否需要隐藏
    isHoveringDropdown.value = false
    hideActionsAndTimestamp()
  }
}

// 下拉菜单hover进入
const handleDropdownMouseEnter = () => {
  isHoveringDropdown.value = true
  showActionsAndTimestamp()
}

// 下拉菜单hover离开
const handleDropdownMouseLeave = () => {
  isHoveringDropdown.value = false
  hideActionsAndTimestamp()
}

const handleEdit = () => {
  emit('edit', props.message)
}

const handleActionCommand = (command: string) => {
  switch (command) {
    case 'regenerate':
      emit('regenerate', props.message)
      break
    case 'duplicate':
      emit('duplicate', props.message)
      break
    case 'delete':
      emit('delete', props.message)
      break
  }
}

// 组件卸载时清理定时器
onBeforeUnmount(() => {
  clearHideTimer()
})
</script>

<style scoped>
.agent-message {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  margin-bottom: 28px;
  gap: 12px;
  box-sizing: border-box;
}

.agent-message__main {
  display: flex;
  align-items: flex-start;
  width: 100%;
  gap: 12px;
}

.agent-message.align-right {
  align-items: flex-end;
}

.agent-message.align-right .agent-message__main {
  justify-content: flex-end;
}

.agent-message__references {
  margin-top: 8px;
  box-sizing: border-box;
  /* 与消息气泡宽度一致 */
  width: min(75%, 750px);
  max-width: calc(100% - 60px);
  min-width: min(250px, 50%);
  /* 对齐方式 */
  display: flex;
  justify-content: flex-start;
  margin-left: 52px; /* 对齐到消息气泡的左边（头像40px + 间距12px） */
}

.agent-message.align-right .agent-message__references {
  margin-left: auto;
  margin-right: 52px; /* 对齐到消息气泡的右边（头像40px + 间距12px） */
  justify-content: flex-end;
}

.agent-message.align-right .agent-message__references :deep(.reference-display) {
  display: flex;
  justify-content: flex-end;
}

.agent-message.align-left {
  justify-content: flex-start;
}

.agent-message__avatar {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
}

.agent-message__avatar--left {
  order: 0;
}

.agent-message__avatar--right {
  order: 2;
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

.agent-message__body {
  position: relative;
  /* 使用 min() 函数确保不会溢出父容器，同时保持合理的宽度 */
  /* 策略：主要依赖父容器宽度的百分比（75%），实现等比例缩放，在宽屏上使用固定最大值（750px）限制 */
  /* 不使用视口宽度（vw），因为它会导致在窄屏上溢出 */
  width: min(75%, 750px);
  /* 双重保险：确保绝对不超过父容器可用宽度（考虑头像40px + 间距12px + 安全边距） */
  max-width: calc(100% - 60px);
  /* 设置合理的最小宽度，但也要考虑父容器宽度，确保在小屏幕上可读 */
  min-width: min(250px, 50%);
  /* 确保最小高度至少等于头像高度，以保证垂直居中对齐 */
  min-height: 40px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 14px;
  padding: 16px 18px;
  box-sizing: border-box;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  transition: box-shadow 0.2s ease, width 0.2s ease;
  order: 1;
}

.agent-message__body:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.agent-message__timestamp {
  position: absolute;
  bottom: 28px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  pointer-events: none;
}

.agent-message__timestamp--left {
  left: -80px;
  right: auto;
}

.agent-message__timestamp--right {
  left: auto;
  right: -80px;
}

.agent-message__actions {
  position: absolute;
  bottom: -8px;
  display: flex;
  gap: 4px;
  align-items: center;
  z-index: 5;
}

.agent-message__actions--left {
  left: -80px;
  right: auto;
}

.agent-message__actions--right {
  left: auto;
  right: -80px;
}

.agent-message__content {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
}

.agent-message__content :deep(.md-editor) {
  width: 100%;
}

.agent-message__content :deep(.md-editor-preview) {
  margin: 0;
  padding: 0;
}

.agent-message__content :deep(.md-editor-preview p) {
  margin: 0;
  line-height: 1.6;
}

.agent-message__content :deep(.md-editor-preview p:not(:last-child)) {
  margin-bottom: 0.5em;
}

.agent-message__content :deep(pre) {
  background: rgba(0, 0, 0, 0.05);
  border-radius: 8px;
  padding: 12px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.tool-calls-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background-color: rgba(64, 158, 255, 0.1);
  border-radius: 8px;
  color: var(--el-color-primary);
  font-size: 14px;
}

.tool-calls-indicator.tool-calls-completed {
  background-color: rgba(103, 194, 58, 0.1);
  color: var(--el-color-success);
}

.tool-calls-indicator .is-loading {
  animation: rotating 2s linear infinite;
}

.tool-call-checkmark {
  color: var(--el-color-success);
}

.tool-message-collapse {
  width: 100%;
}

.tool-message-wrapper {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.tool-message-collapse {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

/* 确保 el-collapse-item 的内容区域也能正确限制宽度 */
.tool-message-collapse :deep(.el-collapse-item__content) {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  overflow-x: auto;
}

/* 确保 AgentToolResultCard 不会超出父容器 */
.tool-message-collapse :deep(.tool-result-card) {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.tool-message-header-preview {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  width: 100%;
}

.tool-message-title {
  font-size: 14px;
  color: v-bind('themeState.currentTheme.textColor');
}

.tool-message-timestamp {
  margin-left: auto;
  opacity: 0.65;
  font-size: 12px;
  color: v-bind('themeState.currentTheme.textColor2');
}

@keyframes rotating {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
