<template>
  <div class="agent-compact" :style="panelStyle">
    <div class="agent-compact-header">
      <Select
        v-if="sessions.length > 1"
        v-model="activeSessionIdModel"
        :disabled="isGenerating || workspace.uiLocked?.value"
      >
        <SelectTrigger class="h-8 text-sm w-full">
          <SelectValue :placeholder="t('agent.sessions.title', '会话')" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="s in sessions" :key="s.id" :value="s.id">
            {{ s.title }}
          </SelectItem>
        </SelectContent>
      </Select>
      <div v-else class="agent-compact-title">
        {{ activeSession?.title || t('agent.conversation.emptyTitle', '会话') }}
      </div>
    </div>

    <div v-if="activeSession" class="agent-compact-content">
      <ScrollArea class="conversation-scroll">
        <AgentMessageRenderer
          v-for="(message, index) in activeSession.messages"
          :key="message.id"
          :message="message"
          :messages="activeSession.messages"
          :message-index="index"
          :user-name="'用户'"
          :session-references="activeSession.referenceStore || []"
        />
        <div class="conversation-bottom-spacer" />
      </ScrollArea>

      <div class="agent-compact-composer">
        <ChatComposer
          v-model="composerInput"
          :loading="isGenerating"
          :disabled="!activeSession"
          :show-attach="false"
          :show-voice="false"
          :placeholder="t('aiChat.inputPlaceholder')"
          :show-knowledge-base="false"
          @submit="handleComposerSubmit"
          @reset="handleComposerReset"
          @cancel="handleCancelGeneration"
        />
      </div>
    </div>
    <div v-else class="agent-compact-empty">
      <Empty :description="t('agent.conversation.none', '暂无对话')" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Empty } from '@renderer/components/ui/empty'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@renderer/components/ui/select'
import { themeState } from '../../utils/themes'
import { useWorkspace } from '../../stores/workspace'
import { useAgentWorkspaceStore } from '../../stores/agent-workspace-store'
import AgentMessageRenderer from './AgentMessageRenderer.vue'
import ChatComposer from '../chat/ChatComposer.vue'
import type { AgentSession, ChatAgentMessage } from '../../types/agent'
import { createRendererLogger } from '../../utils/logger'
import { notifyError, notifyWarning } from '../../utils/notify'
import { agentEngineManager, agentConfigManager } from '../../utils/agent-framework'
import { cancelAiTask, useAiTasks } from '../../utils/ai_tasks'

const { t } = useI18n()
const workspace = useWorkspace()
const agentStore = useAgentWorkspaceStore()
const { sessions, activeSessionId, activeSession, isGenerating, composerInput, selectedEngineId, currentAiTaskHandle, aiTaskHandles } =
  storeToRefs(agentStore)

const panelStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

const activeSessionIdModel = computed({
  get: () => activeSessionId.value || '',
  set: (v: string) => agentStore.setActiveSessionId(v || null)
})

// 当前激活的引用ID（紧凑模式不提供 UI，但默认激活全部引用）
const activeReferenceIds = ref<string[]>([])

watch(
  () => activeSession.value?.referenceStore,
  (newStore) => {
    if (newStore && newStore.length > 0) {
      activeReferenceIds.value = newStore.map((r: { id: string }) => r.id)
    } else {
      activeReferenceIds.value = []
    }
  },
  { immediate: true, deep: true }
)

const touchSession = (session: AgentSession) => {
  session.updatedAt = new Date().toISOString()
  agentStore.touchSession()
}

const persistSessions = () => agentStore.touchSession()

const createChatMessage = (
  role: 'user' | 'assistant',
  markdown: string,
  referenceIds?: string[]
): ChatAgentMessage => ({
  id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  timestamp: new Date().toISOString(),
  role,
  type: 'chat',
  markdown,
  referenceIds: referenceIds || []
})

const scrollToBottom = () => {
  nextTick(() => {
    const container = document.querySelector('.conversation-scroll .el-scrollbar__wrap') as HTMLElement | null
    if (container) container.scrollTop = container.scrollHeight
  })
}

const handleComposerReset = () => {
  composerInput.value = ''
}

const executeAgentEngine = async (userMessage: string, actualSession?: AgentSession) => {
  // 立即锁定 UI 与生成状态，确保跨视图一致
  workspace.lockUI?.()
  isGenerating.value = true

  const session = actualSession || activeSession.value
  if (!session || !session.agentConfigId) {
    notifyWarning(t('agent.sessions.noAgentConfig'))
    isGenerating.value = false
    workspace.unlockUI?.()
    return
  }

  const engineId = selectedEngineId.value || 'default-autogpt-engine'
  const engine = agentEngineManager.getEngine(engineId)
  if (!engine) {
    notifyError(t('agent.sessions.engineNotFound'))
    isGenerating.value = false
    workspace.unlockUI?.()
    return
  }

  const agentConfig = agentConfigManager.getConfig(session.agentConfigId)
  if (!agentConfig) {
    notifyError(t('agent.sessions.agentConfigNotFound'))
    isGenerating.value = false
    workspace.unlockUI?.()
    return
  }

  const abortController = new AbortController()

  session.status = 'thinking'

  try {
    const { AgentEngineExecutorFactory } = await import('../../utils/agent-framework/agent-engine-executor')
    const executor = AgentEngineExecutorFactory.create(engine, session as any, agentConfig, {
      signal: abortController.signal,
      onProgress: (progress: any) => {
        session.status = progress.stage as any
        // 注意：不要在流式输出期间频繁持久化（可能破坏 reactive 对象）
      },
      onTaskCreated: (handle: string) => {
        currentAiTaskHandle.value = handle
        aiTaskHandles.value.add(handle)
      }
    })

    await executor.execute(userMessage)

    session.status = 'idle'
    persistSessions()
    scrollToBottom()
  } catch (error) {
    const logger = createRendererLogger('AgentViewCompact')
    const isCancelled =
      error instanceof Error &&
      (error.message === '任务已取消' ||
        error.message.includes('任务已取消') ||
        error.name === 'AbortError')

    if (isCancelled) {
      logger.debug('Agent引擎任务已取消')
      session.status = 'idle'
      persistSessions()
      return
    }

    logger.error('Agent引擎执行失败:', error)
    session.status = 'error'
    persistSessions()
    throw error
  } finally {
    // 清理 handle
    if (currentAiTaskHandle.value) {
      aiTaskHandles.value.delete(currentAiTaskHandle.value)
    }
    currentAiTaskHandle.value = null
    isGenerating.value = false
    workspace.unlockUI?.()
  }
}

const handleComposerSubmit = async () => {
  const logger = createRendererLogger('AgentViewCompact')
  const session = activeSession.value
  if (!session) return

  const content = composerInput.value.trim()
  if (!content) return

  if (session.activeToolIds) session.activeToolIds = []

  // 用户消息：默认携带当前会话的全部引用（若有）
  const message = createChatMessage('user', content, [...activeReferenceIds.value])
  session.messages.push(message)

  composerInput.value = ''
  touchSession(session)

  // 延迟持久化一次（避免破坏 reactive 流式更新）
  nextTick(() => persistSessions())
  scrollToBottom()

  try {
    await executeAgentEngine(content, session)
  } catch (error) {
    logger.error('[handleComposerSubmit] 执行失败:', error)
    notifyError(error instanceof Error ? error.message : String(error))
  }
}

const handleCancelGeneration = () => {
  const session = activeSession.value
  if (!session) return

  const allTasks = useAiTasks()
  const relatedTasks = allTasks.value.filter((task) => {
    const key = (task as any).origin_key
    return key && typeof key === 'string' && (key.includes(session.id) || key.startsWith(`agent-${session.id}-`))
  })

  relatedTasks.forEach((task: { handle: string }) => cancelAiTask(task.handle, false))

  if (aiTaskHandles.value.size > 0) {
    Array.from(aiTaskHandles.value).forEach((handle) => cancelAiTask(handle, false))
    aiTaskHandles.value.clear()
  }

  if (currentAiTaskHandle.value) {
    cancelAiTask(currentAiTaskHandle.value, false)
    currentAiTaskHandle.value = null
  }

  isGenerating.value = false
  workspace.unlockUI?.()
  session.status = 'idle'
  persistSessions()
}

onMounted(async () => {
  // 紧凑面板：确保工作区会话已加载
  if (!sessions.value.length) {
    await agentStore.init()
  }
  if (!activeSessionId.value && sessions.value[0]) {
    agentStore.setActiveSessionId(sessions.value[0].id)
  }
  scrollToBottom()
})
</script>

<style scoped>
.agent-compact {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.agent-compact-header {
  padding: 8px 10px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.22);
  flex-shrink: 0;
}

.agent-compact-title {
  font-size: 12px;
  font-weight: 600;
  opacity: 0.9;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-compact-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.conversation-scroll {
  flex: 1;
  min-height: 0;
  padding: 8px 10px;
}

.conversation-bottom-spacer {
  height: 12px;
}

.agent-compact-composer {
  padding: 8px 10px;
  border-top: 1px solid rgba(128, 128, 128, 0.22);
  flex-shrink: 0;
}

.agent-compact-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>

