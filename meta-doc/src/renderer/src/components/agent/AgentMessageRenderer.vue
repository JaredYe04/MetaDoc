<template>
  <div :class="['agent-message', alignmentClass, { 'agent-message--compact': compact }]">
    <div class="agent-message__main">
      <!-- 非紧凑用户：时间戳与「…」在气泡左侧（时间戳在左，菜单在时间戳与气泡之间） -->
      <div
        v-if="message.role === 'user' && !compact && message.type === 'chat'"
        class="agent-message__user-leading"
        @mouseenter="handleActionsMouseEnter"
        @mouseleave="handleActionsMouseLeave"
      >
        <transition name="fade">
          <span v-if="showTimestamp" class="agent-message__timestamp-flow">
            {{ formatTimestamp(message.timestamp) }}
          </span>
        </transition>
        <transition name="fade">
          <div
            v-if="showActions"
            class="agent-message__user-leading-more"
            @mouseenter="handleActionsMouseEnter"
            @mouseleave="handleActionsMouseLeave"
          >
            <DropdownMenu
              :modal="false"
              @click.stop
              @update:open="handleDropdownVisibleChange"
            >
              <DropdownMenuTrigger as-child>
                <Button
                  variant="ghost"
                  size="small"
                  class="ai-action-btn"
                  @click.stop.prevent
                  @mouseenter="handleDropdownMouseEnter"
                  @mouseleave="handleDropdownMouseLeave"
                >
                  <el-icon><More /></el-icon>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                @mouseenter="handleDropdownMouseEnter"
                @mouseleave="handleDropdownMouseLeave"
                @close-auto-focus="preventDropdownCloseAutoFocus"
              >
                <DropdownMenuItem @select="handleActionCommand('edit')">
                  {{ t('agent.message.edit') }}
                </DropdownMenuItem>
                <DropdownMenuItem @select="handleActionCommand('regenerate')">
                  {{ t('agent.message.regenerate') }}
                </DropdownMenuItem>
                <DropdownMenuItem @select="handleActionCommand('duplicate')">
                  {{ t('agent.message.duplicateSession') }}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem @select="handleActionCommand('delete')">
                  {{ t('agent.message.delete') }}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </transition>
      </div>

      <!-- 消息气泡（用户消息保持气泡样式，AI消息平铺） -->
      <div
        :class="[
          'agent-message__body',
          {
            'agent-message__body--flat': message.role !== 'user',
            'agent-message__body--user-compact': compact && message.role === 'user'
          }
        ]"
        :style="bubbleStyle"
        @mouseenter="handleMouseEnter"
        @mouseleave="handleMouseLeave"
        @click="message.role === 'user' ? handleUserMessageBodyClick($event) : undefined"
      >
        <!-- 时间戳：助手在气泡内绝对定位；紧凑用户仍在左侧绝对定位；非紧凑用户时间戳在气泡外 agent-message__user-leading -->
        <transition name="fade">
          <div
            v-if="showTimestamp && (message.role !== 'user' || compact)"
            class="agent-message__timestamp"
            :class="{
              'agent-message__timestamp--left': message.role === 'user',
              'agent-message__timestamp--right': message.role !== 'user'
            }"
          >
            {{ formatTimestamp(message.timestamp) }}
          </div>
        </transition>

        <!-- 用户消息右下角：回滚 / 恢复（依赖 sessionId 与编辑暂存） -->
        <transition name="fade">
          <div
            v-if="
              showActions &&
              message.role === 'user' &&
              message.type === 'chat' &&
              sessionId &&
              (canRollback || canRedo)
            "
            class="agent-message__actions agent-message__actions--right"
            @mouseenter="handleActionsMouseEnter"
            @mouseleave="handleActionsMouseLeave"
          >
            <Tooltip v-if="canRollback" :content="t('agent.staging.rollback')" placement="top">
              <Button circle size="small" @click.stop="emit('rollback', message)">
                <el-icon><Refresh /></el-icon>
              </Button>
            </Tooltip>
            <Tooltip v-if="canRedo" :content="t('agent.staging.redo')" placement="top">
              <Button circle size="small" @click.stop="emit('redo', message)">
                <el-icon><Check /></el-icon>
              </Button>
            </Tooltip>
          </div>
        </transition>

        <!-- 意图识别消息 -->
        <div v-if="message.type === 'intent-recognition'" class="intent-recognition-message">
          <div class="intent-recognition-header">
            <el-icon class="intent-icon"><Search /></el-icon>
            <span class="intent-title">{{ t('agent.message.intentRecognition') }}</span>
          </div>
          <div class="intent-content">
            <div
              v-if="(message as IntentRecognitionAgentMessage).toolIds.length > 0"
              class="intent-tools"
            >
              <div class="intent-tools-label">{{ t('agent.message.selectedTools') }}</div>
              <div class="intent-tools-list">
                <Badge
                  v-for="toolId in (message as IntentRecognitionAgentMessage).toolIds"
                  :key="toolId"
                  size="small"
                  variant="secondary"
                  class="intent-tool-tag"
                >
                  {{ getToolName(toolId) }}
                </Badge>
              </div>
            </div>
            <div v-else class="intent-no-tools">
              {{ t('agent.message.noToolsNeeded') }}
            </div>
            <div
              v-if="(message as IntentRecognitionAgentMessage).reasoning"
              class="intent-reasoning"
            >
              <div class="intent-reasoning-label">{{ t('agent.message.reasoning') }}</div>
              <div class="intent-reasoning-text">
                {{ (message as IntentRecognitionAgentMessage).reasoning }}
              </div>
            </div>
          </div>
        </div>

        <!-- Tool结果：统一使用极简容器，仅根据 compact 区分样式 -->
        <div
          v-else-if="message.type === 'tool'"
          class="tool-message-wrapper"
          :class="{ 'tool-message-wrapper--compact': compact }"
        >
          <Collapsible
            v-if="!compact"
            v-model:open="isToolMessageOpen"
            class="tool-message-collapsible"
          >
            <CollapsibleTrigger class="tool-message-trigger">
              <div class="tool-message-header-preview">
                <span class="tool-message-title">{{
                  getToolDisplayName(message as ToolAgentMessage)
                }}</span>
                <Badge
                  class="tool-status-badge"
                  size="small"
                  :type="getToolStatusTagType((message as ToolAgentMessage).status)"
                >
                  {{ getToolStatusLabel((message as ToolAgentMessage).status) }}
                </Badge>
                <small class="tool-message-timestamp">{{
                  formatTimestamp((message as ToolAgentMessage).timestamp)
                }}</small>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent class="tool-message-content">
              <AgentToolResultSimple :message="message as ToolAgentMessage" :compact="false" />
            </CollapsibleContent>
          </Collapsible>
          <AgentToolResultSimple v-else :message="message as ToolAgentMessage" :compact="true" />
        </div>

        <!-- 文本内容 -->
        <div v-else class="agent-message__content">
          <Collapsible
            v-if="assistantReasoningText"
            v-model:open="isReasoningBlockOpen"
            class="assistant-reasoning-wrap"
            :class="{ 'assistant-reasoning-wrap--open': isReasoningBlockOpen }"
          >
            <CollapsibleTrigger class="assistant-reasoning-trigger" :hide-icon="true">
              <ChevronDown class="assistant-reasoning-chevron" />
              <span>{{ t('agent.message.reasoningBlock') }}</span>
            </CollapsibleTrigger>
            <CollapsibleContent class="assistant-reasoning-body">
              <div class="assistant-reasoning-text">{{ assistantReasoningText }}</div>
            </CollapsibleContent>
          </Collapsible>
          <!-- 如果消息包含tool_calls，需要将工具调用标记替换为指示器 -->
          <template v-if="hasToolCalls && processedContentParts.length > 0">
            <template v-for="(part, index) in processedContentParts" :key="index">
              <!-- 如果是工具调用指示器 -->
              <div
                v-if="part.type === 'tool-call'"
                class="tool-calls-indicator tool-calls-completed"
              >
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
                :sanitize="sanitizePreviewHtml"
                :style="{
                  color: themeState.currentTheme.textColor
                }"
                :class="themeState.currentTheme.mdeditorClass"
              />
            </template>
          </template>
          <!-- 用户消息：@[xxx] 以 tag 样式展示，单行内联避免 chip 与文字间多余换行 -->
          <template
            v-else-if="
              message.role === 'user' &&
              message.type === 'chat' &&
              userMessageContentSegments.length > 0
            "
          >
            <span class="user-message-segments-inline">
              <span
                v-for="(seg, segIdx) in userMessageContentSegments"
                :key="segIdx"
                class="user-message-segment"
              >
                <template v-if="seg.type === 'text'">{{ seg.value }}</template>
                <span v-else class="user-message-at-tag" :title="seg.atValue">
                  {{ getUserMessageAtLabel(seg.atValue) }}
                </span>
              </span>
            </span>
          </template>
          <!-- 如果没有tool_calls且非用户消息，或用户消息无 @，正常显示markdown -->
          <MdPreview
            v-else-if="messageMarkdown"
            :modelValue="messageMarkdown"
            previewTheme="github"
            :codeFold="false"
            :autoFoldThreshold="300"
            :sanitize="sanitizePreviewHtml"
            :style="{
              color: themeState.currentTheme.textColor
            }"
            :class="themeState.currentTheme.mdeditorClass"
          />
        </div>
      </div>

      <!-- 用户消息：头像在右边（紧凑模式不显示） -->
      <div
        v-if="message.role === 'user' && !compact"
        class="agent-message__avatar agent-message__avatar--right"
      >
        <Tooltip :content="userName" placement="left" :disabled="!userName">
          <Avatar class="avatar-fallback user-avatar">
            <AvatarFallback class="user-avatar-fallback">
              <el-icon class="user-avatar-icon"><User /></el-icon>
            </AvatarFallback>
          </Avatar>
        </Tooltip>
      </div>
    </div>

    <!-- 紧凑模式用户消息：「…」在气泡下方（非紧凑时在气泡左侧 agent-message__user-leading） -->
    <transition name="fade">
      <div
        v-if="compact && message.role === 'user' && message.type === 'chat'"
        class="user-message-actions user-message-actions--compact"
        @mouseenter="handleActionsMouseEnter"
        @mouseleave="handleActionsMouseLeave"
      >
        <DropdownMenu
          :modal="false"
          @click.stop
          @update:open="handleDropdownVisibleChange"
        >
          <DropdownMenuTrigger as-child>
            <Button
              variant="ghost"
              size="small"
              class="ai-action-btn"
              @click.stop.prevent
              @mouseenter="handleDropdownMouseEnter"
              @mouseleave="handleDropdownMouseLeave"
            >
              <el-icon><More /></el-icon>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            @mouseenter="handleDropdownMouseEnter"
            @mouseleave="handleDropdownMouseLeave"
            @close-auto-focus="preventDropdownCloseAutoFocus"
          >
            <DropdownMenuItem @select="handleActionCommand('edit')">
              {{ t('agent.message.edit') }}
            </DropdownMenuItem>
            <DropdownMenuItem @select="handleActionCommand('regenerate')">
              {{ t('agent.message.regenerate') }}
            </DropdownMenuItem>
            <DropdownMenuItem @select="handleActionCommand('duplicate')">
              {{ t('agent.message.duplicateSession') }}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem @select="handleActionCommand('delete')">
              {{ t('agent.message.delete') }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </transition>

    <!-- AI 消息：复制 / 插入文档 / 导出（与 AIChat 一致，不可编辑） / 删除 -->
    <div
      v-if="
        message.role === 'assistant' &&
        (message.type === 'chat' || message.type === 'thought')
      "
      class="ai-message-actions"
    >
      <Tooltip :content="t('common.copy', '复制')" placement="bottom">
        <Button
          variant="ghost"
          size="small"
          class="ai-action-btn"
          :disabled="!assistantDocumentMarkdown"
          @click.stop="copyAssistantContent"
        >
          <Copy class="h-4 w-4" />
        </Button>
      </Tooltip>
      <Tooltip :content="t('aiChat.insertToDocument', '插入到文档')" placement="bottom">
        <Button
          variant="ghost"
          size="small"
          class="ai-action-btn"
          :disabled="!assistantDocumentMarkdown"
          @click.stop="requestInsertAssistantToDocument"
        >
          <FilePlus class="h-4 w-4" />
        </Button>
      </Tooltip>
      <Tooltip :content="t('aiChat.exportToDocument', '导出到新文档')" placement="bottom">
        <Button
          variant="ghost"
          size="small"
          class="ai-action-btn"
          :disabled="!assistantDocumentMarkdown"
          @click.stop="exportAssistantToNewDocument"
        >
          <FolderPlus class="h-4 w-4" />
        </Button>
      </Tooltip>
      <Tooltip :content="t('agent.message.delete')" placement="bottom">
        <Button
          variant="ghost"
          size="small"
          class="ai-action-btn"
          @click.stop="emit('delete', message)"
        >
          <el-icon><Delete /></el-icon>
        </Button>
      </Tooltip>
    </div>

    <!-- 引用显示（只读模式，只显示用户消息的引用，放在气泡外面） -->
    <ReferenceDisplay
      v-if="
        message.role === 'user' &&
        message.type === 'chat' &&
        userMessageReferenceList.length > 0
      "
      :references="userMessageReferenceList"
      :active-reference-ids="userMessageReferenceActiveIds"
      readonly
      :class="['agent-message__references', { 'agent-message__references--compact': compact }]"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { MdPreview } from 'md-editor-v3'
import { useI18n } from 'vue-i18n'
import { User, More, Check, Search, Refresh, Delete } from '@element-plus/icons-vue'
import { ChevronDown, Copy, FilePlus, FolderPlus } from 'lucide-vue-next'
import { Button } from '@renderer/components/ui/button'
import { Avatar, AvatarFallback } from '@renderer/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator
} from '@renderer/components/ui/dropdown-menu'
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent
} from '@renderer/components/ui/collapsible'
import { Badge } from '@renderer/components/ui/badge'
import { Tooltip } from '@renderer/components/ui/tooltip'
import type {
  AgentMessage,
  ChatAgentMessage,
  ThoughtAgentMessage,
  ToolAgentMessage,
  IntentRecognitionAgentMessage
} from '../../types/agent'
import AgentToolResultSimple from './AgentToolResultSimple.vue'
import ReferenceDisplay from './ReferenceDisplay.vue'
import { themeState, mixColors } from '../../utils/themes'
import type { Reference } from '../../types/agent-framework'
import { dayjs } from 'element-plus'
import { agentToolManager } from '../../utils/agent-tool-manager'
import { toolCallParserManager } from '../../utils/agent-framework/tool-call-parsers'
import { useAgentEditStagingStore } from '../../stores/agent-edit-staging-store'
import eventBus from '../../utils/event-bus'
import { toast } from '@renderer/utils/toast'

const props = withDefaults(
  defineProps<{
    message: AgentMessage
    messages?: AgentMessage[] // 传递整个消息数组，用于检查tool_calls是否已完成
    messageIndex?: number // 当前消息的索引
    userName?: string
    sessionReferences?: Reference[] // 会话的引用列表
    /** 紧凑模式：用户消息无头像、占满宽、小边距小圆角小字号 */
    compact?: boolean
    /** 当前会话 id，用于显示回滚/恢复按钮（依赖编辑暂存 store） */
    sessionId?: string | null
    /** 最后一条助手消息是否正在流式生成（用于 reasoning 区块展开；结束后默认折叠） */
    isAssistantStreaming?: boolean
  }>(),
  { compact: false, sessionId: null, isAssistantStreaming: false }
)

const emit = defineEmits<{
  (e: 'edit', message: AgentMessage): void
  (e: 'regenerate', message: AgentMessage): void
  (e: 'duplicate', message: AgentMessage): void
  (e: 'delete', message: AgentMessage): void
  (e: 'rollback', message: AgentMessage): void
  (e: 'redo', message: AgentMessage): void
}>()

const { t } = useI18n()
const stagingStore = useAgentEditStagingStore()

const assistantReasoningText = computed(() => {
  if (props.message.role !== 'assistant') return ''
  if (props.message.type === 'chat') {
    return ((props.message as ChatAgentMessage).reasoning || '').trim()
  }
  if (props.message.type === 'thought') {
    return ((props.message as ThoughtAgentMessage).reasoning || '').trim()
  }
  return ''
})

const isReasoningBlockOpen = ref(true)
watch(
  () => props.isAssistantStreaming,
  (streaming) => {
    if (streaming) {
      isReasoningBlockOpen.value = true
    } else if (assistantReasoningText.value) {
      isReasoningBlockOpen.value = false
    }
  },
  { immediate: true }
)

/** 只保留真实 URL 链接：排除含 % 的 href（编码乱码）、排除主机名为文件名（如 xxx.md） */
function sanitizePreviewHtml(html: string): string {
  if (!html || typeof html !== 'string') return html
  return html.replace(
    /<a\s+[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (match, href, content) => {
      if (!/^https?:\/\//i.test(href)) return content
      if (href.includes('%')) return content
      const hostMatch = href.match(/^https?:\/\/([^/#?]+)/i)
      const host = hostMatch ? hostMatch[1] : ''
      if (/\.(md|txt|html|json)$/i.test(host)) return content
      return match
    }
  )
}

/** 该用户消息产生的编辑：可回滚（未拒绝的）与可恢复（已拒绝的） */
const editsForThisMessage = computed(() => {
  if (!props.sessionId || props.message.role !== 'user') return []
  return stagingStore.getEditsByUserMessage(props.sessionId, props.message.id)
})
const canRollback = computed(() => editsForThisMessage.value.some((r) => r.status !== 'rejected'))
const canRedo = computed(() => editsForThisMessage.value.some((r) => r.status === 'rejected'))

/** 历史用户消息上的附件：优先 workspaceAttachments 快照，否则从 session referenceStore 按 referenceIds 解析 */
const userMessageReferenceList = computed((): Reference[] => {
  if (props.message.role !== 'user' || props.message.type !== 'chat') return []
  const m = props.message as ChatAgentMessage
  const now = Date.now()
  const wa = m.workspaceAttachments
  const out: Reference[] = []
  if (wa && wa.length > 0) {
    for (let i = 0; i < wa.length; i++) {
      const a = wa[i]!
      out.push({
        id: `wa:${i}:${a.absolutePath}`,
        name: a.name,
        origin: a.relativePath || a.absolutePath,
        format: a.format,
        parsedContent: '',
        createdAt: now,
        updatedAt: now
      })
    }
  }
  const inline = m.inlineReferenceSnippets
  if (inline && inline.length > 0) {
    for (let i = 0; i < inline.length; i++) {
      const s = inline[i]!
      out.push({
        id: `inline:${i}:${s.name}`,
        name: s.name,
        origin: s.format,
        format: s.format,
        parsedContent: '',
        createdAt: now,
        updatedAt: now
      })
    }
  }
  if (out.length > 0) return out
  const ids = m.referenceIds || []
  const store = props.sessionReferences || []
  if (ids.length === 0 || !store.length) return []
  return store.filter((r) => ids.includes(r.id))
})

const userMessageReferenceActiveIds = computed(() =>
  userMessageReferenceList.value.map((r) => r.id)
)

const showTimestamp = ref(false)
const showActions = ref(false)

// Tool消息折叠状态 - shadcn-vue Collapsible uses boolean
const isToolMessageOpen = ref(true)

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
      isToolMessageOpen.value = false
    } else {
      // 如果是最新的，默认展开
      isToolMessageOpen.value = true
    }
    collapseInitialized.value = true
  }
}

// 监听 messages 数量变化（仅当有新消息追加时处理折叠），避免 deep watch 导致任意消息内容更新时所有 AgentMessageRenderer 都触发回调造成卡顿
watch(
  () => props.messages?.length ?? 0,
  (newLen, oldLen) => {
    if (!props.messages || props.messageIndex === undefined || props.message.type !== 'tool') {
      return
    }

    // 仅当消息数量增加（新消息追加）时，检查当前消息之后是否有新 tool 消息并折叠
    if (oldLen !== undefined && newLen > oldLen) {
      const currentIndex = props.messageIndex
      let hasNewToolAfter = false
      for (let i = currentIndex + 1; i < props.messages.length; i++) {
        if (props.messages[i].type === 'tool') {
          hasNewToolAfter = true
          break
        }
      }
      if (hasNewToolAfter) {
        isToolMessageOpen.value = false
      }
    }

    if (!collapseInitialized.value) {
      initToolMessageCollapse()
    }
  },
  { immediate: true }
)

// 监听isLatestToolMessage变化，当变成不是最新时，折叠当前消息
watch(
  isLatestToolMessage,
  (isLatest) => {
    if (props.message.type === 'tool' && collapseInitialized.value && !isLatest) {
      // 如果当前消息不再是最新的tool消息，折叠它
      isToolMessageOpen.value = false
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
      return 'info'
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
  const theme = themeState.currentTheme
  if (props.message.role === 'user') {
    // 用户消息气泡：深色稍浅一点、浅色稍深一点（不要过头）
    const isDark = theme.type === 'dark'
    const bg = isDark
      ? mixColors(theme.background2nd, '#000000', 0.28)
      : mixColors(theme.background2nd, '#ffffff', 0.25)
    const border = isDark
      ? mixColors(theme.background2nd, '#000000', 0.42)
      : mixColors(theme.background2nd, '#000000', 0.1)
    return {
      backgroundColor: bg,
      borderColor: border,
      color: theme.textColor
    }
  }
  if (props.message.type === 'tool') {
    return {
      backgroundColor: theme.background2nd,
      borderColor:
        theme.borderColor || (theme.type === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'),
      color: theme.textColor
    }
  }
  // AI消息：透明背景，无边框
  return {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    color: theme.textColor
  }
})

// 中性块（意图识别等）背景/边框：深色稍浅一点、浅色稍深一点
const neutralBlockBg = computed(() => {
  const theme = themeState.currentTheme
  const isDark = theme.type === 'dark'
  return isDark
    ? mixColors(theme.background2nd, '#000000', 0.25)
    : mixColors(theme.background2nd, '#ffffff', 0.28)
})
const neutralBlockBorder = computed(() => {
  const theme = themeState.currentTheme
  const isDark = theme.type === 'dark'
  return isDark
    ? mixColors(theme.background2nd, '#000000', 0.4)
    : mixColors(theme.background2nd, '#000000', 0.1)
})

// 意图识别内 tag：深色用深底白字、浅色用浅底黑字（避免反了导致看不清）
const intentTagBg = computed(() => {
  const theme = themeState.currentTheme
  const isDark = theme.type === 'dark'
  return isDark
    ? mixColors(theme.background2nd, '#000000', 0.2)
    : mixColors(theme.background2nd, '#000000', 0.08)
})
const intentTagColor = computed(() => themeState.currentTheme.textColor)

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
  content = content.replace(
    /\<\|redacted_tool_calls_begin\|>[\s\S]*?\<\|redacted_tool_calls_end\|>/gi,
    (match) => {
      const placeholder = `__TOOL_CALL_COMPLETE_${placeholderIndex}__`
      placeholders.push({ placeholder, original: match })
      placeholderIndex++
      return placeholder
    }
  )

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
  // DSML 格式：移除完整开始标签（含属性），避免残留 name="..." 等
  content = content.replace(/<｜DSML｜invoke[^>]*>/gi, '')
  content = content.replace(/<｜DSML｜function_calls>\s*>/gi, '')
  content = content.replace(/<｜DSML｜function_calls>/gi, '')
  content = content.replace(/<\/｜DSML｜function_calls>/gi, '')
  content = content.replace(/<\/｜DSML｜invoke>/gi, '')
  content = content.replace(/<｜DSML｜_call>/gi, '')
  content = content.replace(/<\/｜DSML｜_call>/gi, '')
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

const USER_MSG_AT_PATTERN = /@\[([^\]]+)\]/g

type UserMessageSegment = { type: 'text'; value: string } | { type: 'at'; atValue: string }

const userMessageContentSegments = computed(() => {
  if (props.message.role !== 'user' || props.message.type !== 'chat') return []
  const raw = (props.message as ChatAgentMessage).markdown || ''
  if (!raw) return []
  const segments: UserMessageSegment[] = []
  let lastIndex = 0
  let m: RegExpExecArray | null
  USER_MSG_AT_PATTERN.lastIndex = 0
  while ((m = USER_MSG_AT_PATTERN.exec(raw)) !== null) {
    if (m.index > lastIndex) {
      segments.push({ type: 'text', value: raw.slice(lastIndex, m.index) })
    }
    segments.push({ type: 'at', atValue: m[1] })
    lastIndex = m.index + m[0].length
  }
  if (lastIndex < raw.length) {
    segments.push({ type: 'text', value: raw.slice(lastIndex) })
  }
  return segments
})

function getUserMessageAtLabel(rawValue: string): string {
  if (rawValue.startsWith('tab:')) return rawValue.slice(4)
  return rawValue.replace(/^.*[/\\]/, '') || rawValue
}

const messageMarkdown = computed(() => {
  if (props.message.type === 'chat' || props.message.type === 'thought') {
    let content = props.message.markdown || ''

    // 如果没有tool_calls，清理所有标记（包括完整的和不完整的）
    if (!hasToolCalls.value) {
      // 使用解析器管理器清理所有格式的完整标记
      content = toolCallParserManager.cleanAllMarkers(content)

      // 清理旧的标记格式（兼容性）
      content = content
        .replace(/\<\|redacted_tool_calls_begin\|>[\s\S]*?\<\|redacted_tool_calls_end\|>/gi, '')
        .trim()
      content = content.replace(/\<｜tools▁call▁begin｜>[\s\S]*?<｜tools▁call▁end｜>/gi, '').trim()

      // 清理不完整的标记
      content = cleanIncompleteToolCallTags(content)
    } else {
      // 如果有tool_calls，只清理不完整的标记（完整的标记会在processedContentParts中处理）
      content = cleanIncompleteToolCallTags(content)
    }

    return content
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
      ? agentToolManager.getLocalizedToolName(tool.config.id, String(tool.config.name ?? tool.config.id))
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
  const dsmlRegex =
    /<｜DSML｜function_calls>[\s\S]*?<\/｜DSML｜function_calls>|<｜DSML｜invoke[\s\S]*?<\/｜DSML｜invoke>/gi

  let lastIndex = 0
  let match
  let toolCallIndex = 0

  // 先匹配标准格式
  while ((match = toolCallRegex.exec(content)) !== null) {
    // 添加标记前的markdown内容（用 cleanAllMarkers 清除可能残留的 DSML 等，避免重新打开时显示原始标记）
    if (match.index > lastIndex) {
      const markdownPart = content.substring(lastIndex, match.index).trim()
      if (markdownPart) {
        parts.push({
          type: 'markdown',
          content: toolCallParserManager.cleanAllMarkers(markdownPart)
        })
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

  // 添加剩余的markdown内容（用 cleanAllMarkers 清除可能残留的 DSML 等）
  if (lastIndex < content.length) {
    const markdownPart = content.substring(lastIndex).trim()
    if (markdownPart) {
      parts.push({
        type: 'markdown',
        content: toolCallParserManager.cleanAllMarkers(markdownPart)
      })
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

  // 如果没有找到任何工具调用标记，但消息有 tool_calls（如原生 SDK tool calling），先显示 AI 纯文本，再显示工具调用指示器
  if (parts.length === 0 && toolCallMap.size > 0) {
    if (content.trim()) {
      parts.push({
        type: 'markdown',
        content: toolCallParserManager.cleanAllMarkers(content.trim())
      })
    }
    for (const toolCallInfo of toolCallMap.values()) {
      parts.push({ type: 'tool-call', text: toolCallInfo.text })
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

/** 复制 / 插入 / 导出使用的 Markdown（与预览语义一致：含工具调用占位说明） */
const assistantDocumentMarkdown = computed(() => {
  if (props.message.role !== 'assistant') return ''
  if (props.message.type !== 'chat' && props.message.type !== 'thought') return ''
  if (props.message.type === 'chat' && hasToolCalls.value && processedContentParts.value.length > 0) {
    return processedContentParts.value
      .map((p) => {
        if (p.type === 'markdown') return (p.content || '').trim()
        if (p.type === 'tool-call') return (p.text || '').trim()
        return ''
      })
      .filter((s) => s.length > 0)
      .join('\n\n')
      .trim()
  }
  return (messageMarkdown.value || '').trim()
})

const copyAssistantContent = async () => {
  const text = assistantDocumentMarkdown.value
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    toast.success(t('common.copySuccess', '复制成功'))
  } catch (error) {
    console.error('复制失败:', error)
    toast.error(t('common.copyFailed', '复制失败'))
  }
}

const requestInsertAssistantToDocument = () => {
  const text = assistantDocumentMarkdown.value
  if (!text) return
  eventBus.emit('ai-chat-request-insert-to-document', { content: text })
}

const exportAssistantToNewDocument = () => {
  const text = assistantDocumentMarkdown.value
  if (!text) return
  eventBus.emit('ai-chat-export-to-document', { content: text })
  toast.success(t('aiChat.exportToDocumentSuccess', '已导出到新文档'))
}

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
  const toolCallIds = new Set(chatMsg.tool_calls.map((tc) => tc.id))

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

  const toolNames = chatMsg.tool_calls.map((tc) => {
    const tool = agentToolManager.getTool(tc.tool_id)
    if (tool) {
      return agentToolManager.getLocalizedToolName(tool.config.id, String(tool.config.name ?? tool.config.id))
    }
    return tc.tool_id
  })

  // 如果已完成，显示"AI发起了xxx的调用"
  if (toolCallsCompleted.value) {
    if (toolNames.length === 1) {
      return t('agent.message.toolCallInitiated', { tool: toolNames[0] })
    } else {
      return t('agent.message.toolCallsInitiated', {
        count: toolNames.length,
        tools: toolNames.join('、')
      })
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
  return (
    isHoveringMessage.value ||
    isHoveringActions.value ||
    isHoveringDropdown.value ||
    dropdownVisible.value
  )
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
  if (
    props.message.role === 'user' ||
    (props.message.role === 'assistant' && props.message.type === 'chat')
  ) {
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

/** 阻止菜单关闭时把焦点移回触发器，避免随后一次“穿透”点击落到气泡上误开编辑框 */
const preventDropdownCloseAutoFocus = (e: Event) => {
  e.preventDefault()
}

// 点击用户消息气泡内容区时等同于点编辑按钮（点击链接、操作区、按钮不触发）
const handleUserMessageBodyClick = (e: MouseEvent) => {
  const el = e.target as HTMLElement
  if (el.closest('a')) return
  if (el.closest('.agent-message__actions')) return
  if (el.closest('button')) return
  handleEdit()
}

const handleActionCommand = (command: string) => {
  switch (command) {
    case 'edit':
      handleEdit()
      break
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

// 获取工具名称（用于显示，使用 locales 中的 toolLabels 以支持界面本地化）
const getToolName = (toolId: string): string => {
  const tool = agentToolManager.getTool(toolId)
  if (tool) {
    return agentToolManager.getLocalizedToolName(tool.config.id, String(tool.config.name ?? tool.config.id))
  }
  return toolId
}

// 工具消息的展示用名称（按当前语言解析，使切换语言后标题显示对应翻译）
function getToolDisplayName(msg: ToolAgentMessage): string {
  return agentToolManager.getLocalizedToolName(msg.tool.id, msg.tool.name || msg.tool.id)
}

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

/* AI/tool messages: tight spacing between consecutive ones */
.agent-message.align-left {
  margin-bottom: 4px;
  gap: 4px;
}

/* Add breathing room before a user message that follows AI/tool messages */
.agent-message.align-left + .agent-message.align-right {
  margin-top: 24px;
}

/* Add breathing room before AI/tool messages that follow a user message */
.agent-message.align-right + .agent-message.align-left {
  margin-top: 24px;
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
  /* 与消息气泡宽度一致（用户行右侧头像 40px + gap 12px） */
  width: min(75%, 750px);
  max-width: calc(100% - 52px);
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
  background-color: rgba(64, 158, 255, 0.08);
  border: 2px solid rgba(64, 158, 255, 0.2);
}

.avatar-fallback {
  width: 40px;
  height: 40px;
  background-color: rgba(64, 158, 255, 0.08) !important;
}

/* 用户头像：确保 Fallback 与图标可见，背景浅色 */
.user-avatar {
  width: 40px;
  height: 40px;
  min-width: 40px;
  min-height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(64, 158, 255, 0.08) !important;
}

.user-avatar :deep(span) {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.user-avatar-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.user-avatar-icon {
  font-size: 20px;
  width: 20px;
  height: 20px;
  color: var(--el-text-color-regular);
}

.agent-message__body {
  position: relative;
  width: min(75%, 750px);
  max-width: calc(100% - 60px);
  min-width: min(250px, 50%);
  min-height: 40px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 14px;
  padding: 16px 18px;
  box-sizing: border-box;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  transition:
    box-shadow 0.2s ease,
    width 0.2s ease;
  order: 1;
}

.agent-message__body:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

/* AI消息：平铺展示，无气泡效果，无头像，占满宽度，左侧无细线 */
.agent-message__body--flat {
  width: 100%;
  max-width: min(100%, var(--tool-message-max-width, 860px));
  min-width: 0;
  align-self: flex-start;
  border: none !important;
  border-left: none !important;
  border-radius: 0;
  box-shadow: none;
  background: transparent !important;
  padding: 8px 4px;
  border-color: transparent !important;
}

.agent-message__body--flat:hover {
  box-shadow: none;
}

/* 确保 AI 消息内容区域左侧无装饰线 */
.agent-message.align-left .agent-message__body--flat,
.agent-message.align-left .agent-message__body--flat .agent-message__content {
  border-left: none !important;
}

/* 紧凑模式：用户消息气泡占满宽、小边距小圆角小字号、可选中文字 */
.agent-message--compact.agent-message.align-right
  .agent-message__body:not(.agent-message__body--flat) {
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

/* 用户消息气泡可点击，等同编辑；预留宽度与头像列一致（40px + 12px gap），避免右侧莫名留白 */
.agent-message.align-right .agent-message__body:not(.agent-message__body--flat) {
  cursor: pointer;
  max-width: calc(100% - 52px);
}

.agent-message__body--user-compact {
  padding: 6px 10px;
  border-radius: 5px;
  font-size: 13px;
  line-height: 1.4;
}

.agent-message__body--user-compact .agent-message__content :deep(.md-editor-preview),
.agent-message__body--user-compact .agent-message__content :deep(.md-editor-preview p) {
  font-size: 13px;
  line-height: 1.4;
}

.agent-message__references.agent-message__references--compact {
  width: 100%;
  max-width: 100%;
  margin-left: 0;
}

.agent-message--compact.align-right .agent-message__references {
  margin-right: 0;
}

/* AI消息底部操作按钮 */
.ai-message-actions,
.user-message-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px 4px;
  margin-bottom: 4px;
}

/* 非紧凑用户：时间戳 +「…」在气泡左侧（agent-message__user-leading） */
.agent-message.align-right .agent-message__user-leading {
  display: flex;
  flex-direction: row;
  align-items: center;
  flex-shrink: 0;
  gap: 4px;
  margin-right: 8px;
  align-self: flex-end;
  margin-bottom: 6px;
}

.agent-message__timestamp-flow {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  line-height: 1;
  pointer-events: none;
  user-select: none;
}

.agent-message__user-leading-more {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.agent-message--compact .user-message-actions--compact {
  align-self: stretch;
  width: 100%;
  margin-right: 0;
}

.ai-action-btn {
  padding: 4px 6px;
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

.ai-action-btn:hover {
  color: v-bind('themeState.currentTheme.primaryColor');
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

.agent-message__actions--right {
  left: auto;
  right: 8px;
  bottom: 6px;
}

.agent-message__content {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  user-select: text;
  -webkit-user-select: text;
}

.user-message-segments-inline {
  display: inline;
  white-space: pre-wrap;
  word-break: break-word;
}

.user-message-segments-inline .user-message-segment {
  white-space: pre-wrap;
  word-break: break-word;
}

.user-message-at-tag {
  display: inline-flex;
  align-items: center;
  padding: 1px 4px 1px 6px;
  margin: 0 2px;
  font-size: 12px;
  line-height: 1.3;
  border-radius: 4px;
  background: var(--el-fill-color-light, rgba(0, 0, 0, 0.06));
  color: var(--el-text-color-primary);
  vertical-align: baseline;
  border: 1px solid var(--el-border-color-lighter, rgba(0, 0, 0, 0.08));
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  gap: 6px;
  padding: 6px 12px;
  background-color: v-bind('neutralBlockBg');
  border-radius: 8px;
  color: v-bind('themeState.currentTheme.textColor');
  font-size: 13px;
  margin: 2px 0;
}

.tool-calls-indicator.tool-calls-completed {
  background-color: rgba(103, 194, 58, 0.08);
  color: var(--el-color-success);
}

.tool-calls-indicator .is-loading {
  animation: rotating 2s linear infinite;
}

.tool-call-checkmark {
  color: var(--el-color-success);
  font-size: 14px;
}

.tool-message-compact-outputs {
  width: 100%;
  padding: 6px 8px;
  box-sizing: border-box;
}

.tool-message-compact-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid
    v-bind(
      'themeState.currentTheme.type === "dark" ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)"'
    );
}

.tool-message-compact-title {
  font-size: 12px;
  font-weight: 600;
  color: v-bind('themeState.currentTheme.primaryColor');
}

/* 工具状态 Badge：无 hover、不可点击感 */
.tool-status-badge {
  cursor: default !important;
  pointer-events: none;
}
.tool-status-badge:hover {
  opacity: 1;
}

.tool-message-compact-body {
  overflow: hidden;
  transition: max-height 0.2s ease;
}
.tool-message-compact-body-collapsed {
  max-height: 6em; /* ~4 行，line-height 1.5 */
}

.tool-message-compact-toggle {
  display: block;
  width: 100%;
  margin-top: 4px;
  padding: 2px 0;
  font-size: 11px;
  color: v-bind('themeState.currentTheme.primaryColor');
  background: none;
  border: none;
  cursor: pointer;
  text-align: center;
  opacity: 0.85;
}
.tool-message-compact-toggle:hover {
  opacity: 1;
}

.tool-message-compact-chevron {
  width: 14px;
  height: 14px;
  display: block;
  margin: 0 auto;
}

.tool-message-compact-raw {
  margin: 0;
  padding: 4px 8px;
  font-size: 12px;
  white-space: pre-wrap;
  overflow: auto;
  color: v-bind('themeState.currentTheme.textColor');
}

.tool-message-wrapper {
  width: 100%;
  max-width: min(100%, var(--tool-message-max-width, 860px));
  margin: 0;
  box-sizing: border-box;
  min-width: 0;
  border: 1px solid
    v-bind(
      'themeState.currentTheme.type === "dark" ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.1)"'
    );
  border-radius: 8px;
  overflow: hidden;
  /*
   * LaTeX 内嵌 PDF 可调参数（子树继承，可在用户 CSS 或主题里覆盖 .tool-message-wrapper）：
   * --latex-agent-pdf-width-scale: 相对卡片内容区宽度比例（默认 0.9，保留适度边距）
   * --latex-agent-pdf-min-width / --latex-agent-pdf-max-width: 预览宽度上下限
   * --latex-agent-pdf-height-* / --latex-agent-pdf-min-h-*: 嵌入框高度，供 LaTeXCompileDisplay 使用
   */
  --latex-agent-pdf-width-scale: 0.9;
  --latex-agent-pdf-min-width: 280px;
  --latex-agent-pdf-max-width: 680px;
  --latex-agent-pdf-height-compact: min(280px, 46vh);
  --latex-agent-pdf-min-h-compact: 200px;
  --latex-agent-pdf-height-expanded: min(360px, 52vh);
  --latex-agent-pdf-min-h-expanded: 240px;
}

.tool-message-collapsible {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.tool-message-content {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

/* Collapsible触发区域样式 */
.tool-message-trigger {
  background-color: transparent;
  color: v-bind('themeState.currentTheme.textColor');
  border-bottom: 1px solid
    v-bind(
      'themeState.currentTheme.type === "dark" ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)"'
    );
  padding: 0;
  font-size: 13px;
}

.tool-message-trigger:hover {
  background-color: v-bind(
    'themeState.currentTheme.type === "dark" ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.02)"'
  ) !important;
}

/* 折叠内容区域 */
.tool-message-content :deep([data-state]) {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  overflow: hidden;
}

.tool-message-content :deep(.pb-4) {
  width: 100%;
  max-width: 100%;

  padding: 6px 12px 8px 12px;
  overflow: hidden;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
  background-color: transparent;
}

/* LaTeX 内嵌 PDF：自身纵向滚动，避免外层 pb-4 的 overflow-x 拉出横向滚动条 */
.tool-message-content :deep(.latex-compile-pdf-embed) {
  overflow: hidden;
  max-width: 100%;
}

/* 确保 AgentToolResultSimple 不会超出父容器 */
.tool-message-content :deep(.tool-result-simple) {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  overflow: hidden;
  background-color: transparent !important;
  border-radius: 0 !important;
  border: none !important;
  padding: 4px 0 !important;
  box-shadow: none !important;
}

.tool-message-content :deep(.tool-result-simple-body) {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  overflow: hidden;
}

.tool-message-header-preview {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  width: 100%;
  padding: 6px 0;
  margin: 0;
  line-height: 1;
}

.tool-message-header-preview::before {
  content: '⚙';
  font-size: 13px;
  opacity: 0.6;
}

.tool-message-title {
  font-size: 13px;
  color: v-bind('themeState.currentTheme.primaryColor');
  font-weight: 600;
}

.tool-message-timestamp {
  margin-left: auto;
  opacity: 0.5;
  font-size: 11px;
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

.intent-recognition-message {
  width: 100%;
  padding: 12px 16px;
  background-color: v-bind('neutralBlockBg');
  border: 1px solid v-bind('neutralBlockBorder');
  border-radius: 8px;
  margin-bottom: 8px;
}

.intent-recognition-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-weight: 500;
  font-size: 14px;
  color: v-bind('themeState.currentTheme.textColor');
}

.intent-icon {
  color: v-bind('themeState.currentTheme.primaryColor');
}

.intent-title {
  color: v-bind('themeState.currentTheme.primaryColor');
}

.intent-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.intent-tools {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.intent-tools-label {
  font-size: 13px;
  color: v-bind('themeState.currentTheme.textColor2');
  font-weight: 500;
}

.intent-tools-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.intent-tool-tag {
  margin: 0;
  background-color: v-bind('intentTagBg') !important;
  color: v-bind('intentTagColor') !important;
  border: none;
}

.intent-tool-tag :deep(*) {
  color: inherit;
}

.intent-no-tools {
  font-size: 13px;
  color: v-bind('themeState.currentTheme.textColor2');
  font-style: italic;
}

.intent-reasoning {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
}

.intent-reasoning-label {
  font-size: 12px;
  color: v-bind('themeState.currentTheme.textColor2');
  font-weight: 500;
}

.intent-reasoning-text {
  font-size: 13px;
  color: v-bind('themeState.currentTheme.textColor');
  line-height: 1.5;
}

.assistant-reasoning-wrap {
  margin-bottom: 10px;
}

.assistant-reasoning-trigger {
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

.assistant-reasoning-chevron {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  transition: transform 0.15s ease;
}

.assistant-reasoning-wrap--open .assistant-reasoning-chevron {
  transform: rotate(0deg);
}

.assistant-reasoning-wrap:not(.assistant-reasoning-wrap--open) .assistant-reasoning-chevron {
  transform: rotate(-90deg);
}

.assistant-reasoning-body {
  padding: 0 0 8px 2px;
}

.assistant-reasoning-text {
  font-size: 12px;
  line-height: 1.45;
  color: v-bind('themeState.currentTheme.textColor2');
  opacity: 0.92;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
