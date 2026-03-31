<template>
  <div class="graph-window" :style="containerStyle">
    <div class="main-container">
      <!-- 左侧会话列表（含右侧 resize 与折叠，主内容通过默认 slot 传入） -->
      <SessionList
        :title="t('graph.sessionsTitle', '绘图会话')"
        :items="sessions"
        :active-index="activeSessionId || undefined"
        :disabled="generating || loadingSession || analyzingIntent"
        :create-button-tooltip="t('graph.newSession', '新建会话')"
        :rename-label="t('common.rename', '重命名')"
        :duplicate-label="t('common.duplicate', '复制')"
        :delete-label="t('common.delete', '删除')"
        :rename-dialog-title="t('graph.renameTitle', '重命名会话')"
        :rename-placeholder="t('graph.renamePlaceholder', '请输入会话名称')"
        :cancel-label="t('common.cancel', '取消')"
        :confirm-label="t('common.confirm', '确认')"
        @create="handleCreateSession"
        @select="handleSelectSession"
        @rename="handleRenameSession"
        @duplicate="handleDuplicateSession"
        @delete="handleDeleteSession"
      >
        <!-- 右侧内容区域 -->
        <div class="content-area" :style="panelStyle" style="position: relative">
          <LoadingOverlay :show="loadingSession" :message="t('common.loading', '加载中...')" />
          <div v-if="!activeSession" class="empty-state" :style="emptyStateStyle">
            <p>{{ t('graph.noSessionSelected', '请选择一个会话或创建新会话') }}</p>
          </div>

          <div v-else class="dialog-container">
            <el-scrollbar class="conversation-scroll" height="100%">
              <GraphMessageBubble
                v-for="(msg, index) in messages.filter((item) => item.role !== 'system')"
                :key="index"
                :message="msg"
                :index="index"
                :is-streaming="
                  index === messages.length - 1 && isStreaming && msg.role === 'assistant'
                "
                :streaming-content="
                  index === messages.length - 1 && isStreaming ? streamingContent : ''
                "
                :streaming-reasoning="
                  index === messages.length - 1 && isStreaming ? streamingReasoning : ''
                "
                @delete="onMsgDelete"
                @edit="onMsgEdit"
                @regenerate="regenerate"
                @export="handleExport"
              />
              <div class="conversation-bottom-spacer" />
            </el-scrollbar>
            <div class="composer-wrapper">
              <ChatComposer
                v-model="currentPrompt"
                class="conversation-composer graph-window-composer"
                :loading="generating || analyzingIntent"
                :disabled="false"
                :placeholder="
                  t('graph.inputPlaceholder', '输入绘图需求，AI会自动选择合适的图表引擎...')
                "
                :show-voice="false"
                :show-attach="false"
                :show-knowledge-base="false"
                :compact="true"
                @submit="handleGenerate"
                @cancel="handleCancel"
              />
            </div>
          </div>
        </div>
      </SessionList>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { notifySuccess, notifyError } from '@renderer/utils/notify'

// Demo mode support
const props = defineProps({
  mode: {
    type: String,
    default: 'normal'
  }
})
const isDemo = computed(() => props.mode === 'demo')
import SessionList from '../components/common/SessionList.vue'
import type { SessionListItem } from '../components/common/SessionList.vue'
import { LoadingOverlay } from '@renderer/components/ui/loading-overlay'
import { graphSessionsDb } from '../utils/db/tool-sessions-db'
import { themeState } from '../utils/themes'
import GraphMessageBubble from '../components/GraphMessageBubble.vue'
import ChatComposer from '../components/chat/ChatComposer.vue'
import { useWorkspace } from '../stores/workspace'
import { useGraphSessionFlow } from '../composables/useGraphSessionFlow'
import { createRendererLogger } from '../utils/logger'
import eventBus from '../utils/event-bus'

const { t } = useI18n()
const logger = createRendererLogger('GraphWindow')
const workspace = useWorkspace()

const GRAPH_ROUTES = ['/graph', '/ai-graph', '/smart-drawing-assistant']
const ourTabId = computed(
  () =>
    workspace.tabs.find((tab) => tab.kind === 'tool' && GRAPH_ROUTES.includes(tab.route ?? ''))
      ?.id ?? null
)

const sessions = ref<SessionListItem[]>([])
const activeSessionId = ref<string | null>(null)
const activeSession = computed(() => {
  if (!activeSessionId.value) return null
  return sessions.value.find((s) => s.id === activeSessionId.value) as any
})

const loadSessions = async () => {
  try {
    const dbSessions = await graphSessionsDb.getAll()
    sessions.value = dbSessions.map((s) => ({
      id: s.id,
      title: s.title,
      updatedAt: s.updated_at
    }))
  } catch (error) {
    notifyError('加载会话列表失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

const {
  currentPrompt,
  generating,
  analyzingIntent,
  loadingSession,
  manuallyRenamedSessions,
  messages,
  lastGeneratedChartCode,
  streamingContent,
  streamingReasoning,
  isStreaming,
  handleGenerate,
  handleCancel,
  onMsgDelete,
  onMsgEdit,
  regenerate,
  handleExport,
  resetConversation,
  hydrateFromSession
} = useGraphSessionFlow({
  activeSessionId,
  getActiveSessionTitle: () =>
    (activeSession.value?.title as string) ?? t('graph.defaultTitle', '新绘图会话'),
  onPersisted: loadSessions,
  persistEnabled: () => !isDemo.value
})

/** 新建会话并选中；可选预填输入框与会话标题（用于从编辑器「插入绘图」打开） */
const createNewGraphSessionAndSelect = async (options?: {
  initialPrompt?: string
  sessionTitle?: string
}) => {
  if (isDemo.value) return
  try {
    const id = `graph-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const title =
      options?.sessionTitle?.trim() ||
      t('graph.defaultTitle', '新绘图会话')

    await graphSessionsDb.create({
      id,
      title,
      description: '',
      conversation_history: JSON.stringify([]),
      current_prompt: '',
      output_format: 'svg',
      output_path: undefined
    })

    await loadSessions()
    activeSessionId.value = id
    const tid = ourTabId.value
    if (tid) workspace.setTabToolState(tid, { activeSessionId: id })
    resetConversation()
    if (options?.initialPrompt != null && options.initialPrompt !== '') {
      currentPrompt.value = options.initialPrompt
    }
  } catch (error) {
    notifyError('创建会话失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

const handleCreateSession = async () => {
  await createNewGraphSessionAndSelect()
}

const onGraphOpenInsertMode = async (payload?: unknown) => {
  if (isDemo.value) return
  const p = payload as { context?: string } | undefined
  const ctx = (p?.context ?? '').trim()
  const intro = t(
    'graph.insertFromEditorDefaultPrompt',
    '请根据以下光标附近的文档上下文，生成适合插入当前文档的插图（流程图、示意图、数据图等）。可补充图表类型与重点：'
  )
  const initial = ctx ? `${intro}\n\n---\n${ctx}\n---` : intro
  await createNewGraphSessionAndSelect({
    initialPrompt: initial,
    sessionTitle: t('graph.insertFromEditorSessionTitle', '插图（来自编辑器）')
  })
}

// 选择会话
const handleSelectSession = async (item: SessionListItem) => {
  if (loadingSession.value) {
    return
  }

  try {
    activeSessionId.value = item.id
    const tid = ourTabId.value
    if (tid) workspace.setTabToolState(tid, { activeSessionId: item.id })
    const session = await graphSessionsDb.getById(item.id)
    await hydrateFromSession(session, item.id)
  } catch (error) {
    notifyError('加载会话失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 重命名会话
const handleRenameSession = async (item: SessionListItem, newTitle: string) => {
  try {
    await graphSessionsDb.update(item.id, { title: newTitle })
    // 标记为手动重命名
    manuallyRenamedSessions.value.add(item.id)
    await loadSessions()
  } catch (error) {
    notifyError('重命名失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 复制会话
const handleDuplicateSession = async (item: SessionListItem) => {
  try {
    const session = await graphSessionsDb.getById(item.id)
    if (!session) return

    const id = `graph-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    await graphSessionsDb.create({
      id,
      title: session.title + ' (副本)',
      description: session.description,
      conversation_history: session.conversation_history,
      current_prompt: session.current_prompt || '',
      output_format: session.output_format,
      output_path: session.output_path
    })

    await loadSessions()
    notifySuccess(t('common.duplicateSuccess', '复制成功'))
  } catch (error) {
    notifyError('复制失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 删除会话
const handleDeleteSession = async (item: SessionListItem) => {
  try {
    await graphSessionsDb.delete(item.id)
    await loadSessions()
    if (activeSessionId.value === item.id) {
      activeSessionId.value = null
      resetConversation()
    }
    notifySuccess(t('common.deleteSuccess', '删除成功'))
  } catch (error) {
    notifyError('删除失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}


// 主题样式
const containerStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

const panelStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd,
  color: themeState.currentTheme.textColor,
  flex: 1,
  display: 'flex',
  flexDirection: 'column' as const,
  minHeight: 0,
  overflow: 'hidden' as const,
  padding: 0,
  boxSizing: 'border-box' as const,
  transition: 'background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease'
}))

const emptyStateStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  opacity: 0.6,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%'
}))

// 窗口迁移后恢复当前选中的会话
watch(
  [() => workspace.activeTabId.value, ourTabId, () => sessions.value],
  () => {
    const tid = ourTabId.value
    if (!tid || workspace.activeTabId.value !== tid || sessions.value.length === 0) return
    const state = workspace.getTabToolState(tid)
    const savedId = state.activeSessionId
    if (!savedId || !sessions.value.some((s) => s.id === savedId)) return
    if (activeSessionId.value === savedId) return
    const item = sessions.value.find((s) => s.id === savedId)!
    activeSessionId.value = savedId
    handleSelectSession(item)
  },
  { immediate: true, deep: true }
)

const onGraphSessionsChanged = () => {
  if (!isDemo.value) {
    loadSessions()
  }
}

onMounted(() => {
  eventBus.on('graph-sessions-changed', onGraphSessionsChanged as (payload?: unknown) => void)
  eventBus.on('graph-open-insert-mode', onGraphOpenInsertMode as (payload?: unknown) => void)
  if (isDemo.value) {
    // Demo mode: use mock data only
    sessions.value = [
      { id: 'demo-1', title: '流程图示例', updatedAt: Date.now() },
      { id: 'demo-2', title: '数据可视化', updatedAt: Date.now() - 3600000 }
    ]
    activeSessionId.value = 'demo-1'
    return
  }
  loadSessions()
})

onUnmounted(() => {
  eventBus.off('graph-sessions-changed', onGraphSessionsChanged as (payload?: unknown) => void)
  eventBus.off('graph-open-insert-mode', onGraphOpenInsertMode as (payload?: unknown) => void)
})
</script>

<style scoped>
.graph-window {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.main-container {
  display: flex;
  flex: 1;
  min-height: 0;
  box-sizing: border-box;
  overflow: hidden;
}

.content-area {
  flex: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.dialog-container {
  flex: 1;
  width: 100%;
  min-width: 0;
  background-color: rgba(170, 221, 255, 0.11);
  padding: 12px 20px 0;
  margin: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dialog-container .conversation-scroll {
  padding: 0;
}

.conversation-scroll {
  flex: 1;
  min-height: 0;
  height: 100%;
}

.conversation-scroll :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
}

.conversation-bottom-spacer {
  height: 24px;
  flex-shrink: 0;
}

.composer-wrapper {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  padding: 4px 0 12px;
  gap: 4px;
  border-top: 1px solid rgba(128, 128, 128, 0.22);
  box-sizing: border-box;
}

.composer-wrapper > * {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.conversation-composer {
  width: 100%;
  min-width: 0;
}

/* 与 AgentView 输入区一致：占满宽、多行时底部工具条、可滚动 */
.graph-window-composer :deep(.composer-shell) {
  position: relative;
  width: 100%;
  max-width: 100%;
  border-radius: 5px;
  padding: 4px 6px;
  gap: 4px;
  box-shadow: 0 0 6px rgba(0, 0, 0, 0.06);
}

.graph-window-composer :deep(.composer-shell.is-multiline) {
  grid-template-columns: 1fr;
  align-items: stretch;
}

.graph-window-composer :deep(.composer-shell.is-multiline .composer-leading) {
  position: absolute;
  bottom: 6px;
  left: 6px;
  z-index: 10;
}

.graph-window-composer :deep(.composer-shell.is-multiline .composer-actions) {
  position: absolute;
  bottom: 6px;
  right: 6px;
}

.graph-window-composer :deep(.composer-shell.is-multiline .composer-scroll) {
  padding-bottom: 20px;
  padding-left: 28px;
}

.graph-window-composer :deep(.chat-composer) {
  width: 100%;
}

.graph-window-composer :deep(.composer-scroll) {
  width: 100%;
  min-width: 0;
}

.graph-window-composer :deep(.el-scrollbar) {
  width: 100%;
  min-width: 0;
}

.graph-window-composer :deep(.el-scrollbar__wrap),
.graph-window-composer :deep(.el-scrollbar__view) {
  width: 100%;
}
</style>
