<template>
  <div :class="['agent-message', alignmentClass]">
    <!-- AI/Assistant消息：头像在左边 -->
    <div v-if="message.role !== 'user'" class="agent-message__avatar agent-message__avatar--left">
      <img 
        v-if="message.role === 'assistant'"
        :src="themeState.currentTheme.AiLogo" 
        alt="AI"
        class="avatar-img"
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

      <!-- 用户消息操作按钮（hover时显示） -->
      <transition name="fade">
        <div 
          v-if="message.role === 'user' && showActions" 
          class="agent-message__actions"
          :class="{
            'agent-message__actions--left': message.role === 'user',
            'agent-message__actions--right': message.role !== 'user'
          }"
          @mouseenter="handleActionsMouseEnter"
          @mouseleave="handleActionsMouseLeave"
        >
          <el-tooltip :content="t('agent.message.edit')" placement="top">
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
                <el-dropdown-item command="duplicate">{{ t('agent.message.duplicateSession') }}</el-dropdown-item>
                <el-dropdown-item command="delete" divided>{{ t('agent.message.delete') }}</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </transition>

      <!-- Tool结果 -->
      <component
        v-if="message.type === 'tool'"
        :is="AgentToolResultCard"
        :message="message"
      />

      <!-- 文本内容 -->
      <div v-else class="agent-message__content">
        <!-- 如果消息包含tool_calls，显示友好的工具调用提示 -->
        <div v-if="hasToolCalls" class="tool-calls-indicator" :class="{ 'tool-calls-completed': toolCallsCompleted }">
          <el-icon v-if="!toolCallsCompleted" class="is-loading"><Loading /></el-icon>
          <el-icon v-else class="tool-call-checkmark"><Check /></el-icon>
          <span>{{ toolCallsText }}</span>
        </div>
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
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { MdPreview } from 'md-editor-v3'
import { useI18n } from 'vue-i18n'
import { Avatar, User, Edit, More, Loading, Check } from '@element-plus/icons-vue'
import type { AgentMessage, ChatAgentMessage } from '../../types/agent'
import AgentToolResultCard from './AgentToolResultCard.vue'
import { themeState } from '../../utils/themes'
import { dayjs } from 'element-plus'
import { agentToolManager } from '../../utils/agent-tool-manager'

const props = defineProps<{
  message: AgentMessage
  messages?: AgentMessage[] // 传递整个消息数组，用于检查tool_calls是否已完成
  messageIndex?: number // 当前消息的索引
  userName?: string
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

const messageMarkdown = computed(() => {
  if (props.message.type === 'chat' || props.message.type === 'thought') {
    // 如果消息包含tool_calls，不显示原始内容
    if (hasToolCalls.value) {
      return ''
    }
    // 直接返回消息的markdown（如果是响应式对象，会自动响应变化）
    // 参考AIChat.vue：MessageBubble直接读取message.content，因为placeholder是reactive的
    // 在AgentView中，assistantMessage也是reactive的，所以markdown的变化会触发UI更新
    // 关键：直接访问props.message.markdown，Vue会自动追踪reactive对象属性的变化
    return props.message.markdown || ''
  }
  return ''
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

const actionsHovered = ref(false)
const dropdownVisible = ref(false)

const handleMouseEnter = () => {
  showTimestamp.value = true
  if (props.message.role === 'user') {
    showActions.value = true
  }
}

const handleMouseLeave = () => {
  // 如果按钮或菜单正在被hover，不隐藏
  if (actionsHovered.value || dropdownVisible.value) {
    return
  }
  showTimestamp.value = false
  showActions.value = false
}

const handleActionsMouseEnter = () => {
  actionsHovered.value = true
}

const handleActionsMouseLeave = () => {
  actionsHovered.value = false
  // 延迟检查，给菜单时间显示
  setTimeout(() => {
    if (!dropdownVisible.value) {
      showActions.value = false
      showTimestamp.value = false
    }
  }, 100)
}

const handleDropdownVisibleChange = (visible: boolean) => {
  dropdownVisible.value = visible
  if (!visible) {
    // 菜单关闭时，如果按钮也不在hover状态，隐藏操作按钮
    setTimeout(() => {
      if (!actionsHovered.value) {
        showActions.value = false
        showTimestamp.value = false
      }
    }, 100)
  }
}

const handleDropdownMouseEnter = () => {
  // 菜单被hover时，保持操作按钮显示
  showActions.value = true
}

const handleDropdownMouseLeave = () => {
  // 菜单离开时，延迟检查
  setTimeout(() => {
    if (!actionsHovered.value && !dropdownVisible.value) {
      showActions.value = false
      showTimestamp.value = false
    }
  }, 100)
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
</script>

<style scoped>
.agent-message {
  display: flex;
  align-items: flex-start;
  width: 100%;
  margin-bottom: 18px;
  gap: 12px;
}

.agent-message.align-right {
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

.avatar-fallback {
  width: 40px;
  height: 40px;
}

.agent-message__body {
  position: relative;
  max-width: 720px;
  border: 1px solid transparent;
  border-radius: 14px;
  padding: 16px 18px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  transition: box-shadow 0.2s ease;
  order: 1;
}

.agent-message__body:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.agent-message__timestamp {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
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
  top: -8px;
  display: flex;
  gap: 4px;
  align-items: center;
  z-index: 10;
}

.agent-message__actions--left {
  left: -80px;
  right: auto;
}

.agent-message__actions--right {
  left: auto;
  right: -80px;
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

@keyframes rotating {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
