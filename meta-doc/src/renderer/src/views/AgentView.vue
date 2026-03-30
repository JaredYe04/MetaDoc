<template>
  <div class="agent-view-page" :style="pageStyle">
    <!-- 如果文档格式未选择，显示格式选择界面 -->
    <div v-if="needsFormatSelection" class="format-selection-container">
      <NewDocumentWorkspace v-if="activeTabId" :tab-id="activeTabId" :active="true" />
      <div
        v-else
        style="
          padding: 40px;
          text-align: center;
          color: v-bind('themeState.currentTheme.textColor2');
        "
      >
        <p>{{ t('agent.formatSelection.noTab', '请先创建一个新文档') }}</p>
        <Button type="primary" @click="workspace.openNewDocumentTab()">
          {{ t('common.create') }}
        </Button>
      </div>
    </div>
    <!-- 否则显示正常的AgentView内容 -->
    <div v-else class="agent-view">
      <SessionList
        :title="t('agent.sessions.title')"
        :items="sessionListItems"
        :active-index="activeSessionId || ''"
        :create-button-tooltip="t('agent.sessions.new')"
        :rename-label="t('agent.sessions.rename')"
        :duplicate-label="t('agent.sessions.duplicate')"
        :delete-label="t('agent.sessions.delete')"
        :export-label="t('agent.sessions.export')"
        :rename-dialog-title="t('agent.sessions.rename')"
        :rename-placeholder="t('agent.sessions.renamePlaceholder')"
        :cancel-label="t('common.cancel')"
        :confirm-label="t('common.confirm')"
        :show-duplicate="true"
        :show-export="true"
        :group-by-date="true"
        @create="createSession(agentConfigManager.getDefaultConfigId())"
        @select="handleSessionListSelect"
        @rename="handleSessionListRename"
        @duplicate="handleSessionListDuplicate"
        @delete="handleSessionListDelete"
        @export="handleSessionListExport"
      >
        <template #sidebar-footer>
          <div class="sidebar-footer-content">
            <div class="sidebar-footer-menu">
              <DropdownMenu :modal="false">
                <DropdownMenuTrigger as-child>
                  <Button
                    size="small"
                    type="info"
                    class="w-full justify-start gap-1.5 [&_svg]:size-4"
                  >
                    <Setting class="h-4 w-4 shrink-0" />
                    <span class="min-w-0 flex-1 truncate">{{
                      t('agent.manage.settingsMenu')
                    }}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <AgentManageMenuItems @command="handleManageCommand($event)" />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <!-- 引擎固定为 AutoGPT，不向用户展示切换控件 -->
          </div>
        </template>
        <div class="agent-content">
          <section class="conversation-pane" :style="panelStyle">
            <header class="pane-header conversation-header">
              <div>
                <h2>{{ activeSession?.title || t('agent.conversation.emptyTitle') }}</h2>
                <p class="subtitle" v-if="activeSession?.description">
                  {{ activeSession.description }}
                </p>
              </div>
              <div class="conversation-stats" v-if="activeSession">
                <Badge variant="outline">
                  {{ t('agent.conversation.messages', { count: messageCount }) }}
                </Badge>
                <Tooltip>
                  <TooltipTrigger as-child>
                    <Badge variant="outline" class="cursor-pointer" @click="toolsDialogOpen = true">
                      {{ t('agent.conversation.tools', { count: activeToolCount }) }}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p>{{ t('agent.conversation.openToolsDialog', '点击查看可用工具列表') }}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </header>

            <div v-if="activeSession" class="conversation-content">
              <ScrollArea class="conversation-scroll">
                <AgentMessageRenderer
                  v-for="(message, index) in activeSession.messages"
                  :key="message.id"
                  :message="message"
                  :messages="activeSession.messages"
                  :message-index="index"
                  :user-name="t('agent.userLabel')"
                  :session-references="activeSession.referenceStore || []"
                  @edit="handleMessageEdit"
                  @regenerate="handleMessageRegenerate"
                  @duplicate="handleMessageDuplicate"
                  @delete="handleMessageDelete"
                />
                <div
                  class="conversation-bottom-spacer"
                  :class="{
                    'has-references':
                      activeSession &&
                      activeSession.referenceStore &&
                      activeSession.referenceStore.length > 0
                  }"
                />
              </ScrollArea>
              <div class="composer-wrapper">
                <ReferenceDisplay
                  v-if="activeSession"
                  :references="activeSession.referenceStore || []"
                  :active-reference-ids="(activeSession.referenceStore || []).map((r) => r.id)"
                  readonly
                  removable
                  :remove-aria-label="t('agent.reference.removeFromComposer', '移除附件')"
                  @remove="handleRemoveComposerReference"
                />
                <AgentComposerSendQueuePanel
                  v-if="activeSession && (activeSession.composerSendQueue?.length ?? 0) > 0"
                  :queue="activeSession.composerSendQueue || []"
                  @update:queue="onComposerSendQueueUpdate"
                />
                <ChatComposer
                  :key="activeSessionId || 'no-session'"
                  ref="composerRef"
                  class="conversation-composer agent-view-composer"
                  v-model="composerInput"
                  :loading="isActiveSessionGenerating"
                  :queue-while-loading="true"
                  :disabled="!activeSession"
                  :show-attach="false"
                  :show-voice="false"
                  :placeholder="t('aiChat.inputPlaceholder')"
                  :show-knowledge-base="false"
                  :show-reference-picker="true"
                  :get-at-label="getAtLabel"
                  @submit="(kb, content) => handleComposerSubmit(kb, content)"
                  @reset="handleComposerReset"
                  @attach="handleAttachFile"
                  @open-reference-picker="referencePickerOpen = true"
                  @cancel="handleCancelGeneration"
                >
                  <template v-if="activeSession" #leading>
                    <div class="agent-view-composer-leading">
                      <AgentReferencePicker
                        v-model:open="referencePickerOpen"
                        :disabled="!activeSession"
                        @select-file="handleReferencePickerFile"
                        @select-tab="handleReferencePickerTab"
                        @select-dir="handleReferencePickerDir"
                      />
                      <DropdownMenu>
                        <DropdownMenuTrigger as-child>
                          <Button
                            variant="ghost"
                            size="icon"
                            class="agent-view-composer-btn"
                            :disabled="!activeSession"
                            :title="t('aiChat.attachTooltip')"
                          >
                            <Paperclip class="agent-view-composer-btn-icon" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" class="agent-view-attach-dropdown">
                          <DropdownMenuItem @select="openAttachFilePicker">
                            {{ t('agent.compact.uploadAttachment', '上传附件') }}
                          </DropdownMenuItem>
                          <DropdownMenuItem @select="handleOpenReferenceDialog">
                            {{ t('agent.compact.manageAttachments', '管理附件') }}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Tooltip>
                        <TooltipTrigger as-child>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            class="agent-context-ring-btn agent-context-ring-wrap"
                            :disabled="!activeSession"
                            :title="t('agent.contextBreakdown.tooltip')"
                            @click="contextBreakdownDialogOpen = true"
                          >
                            <svg
                              class="agent-context-ring-svg"
                              viewBox="0 0 24 24"
                              width="20"
                              height="20"
                              aria-hidden="true"
                            >
                              <circle
                                class="agent-context-ring-bg"
                                cx="12"
                                cy="12"
                                r="10"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                              />
                              <circle
                                class="agent-context-ring-fill"
                                cx="12"
                                cy="12"
                                r="10"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-dasharray="62.83"
                                :stroke-dashoffset="62.83 - (62.83 * contextUsage.percentage) / 100"
                                stroke-linecap="round"
                                transform="rotate(-90 12 12)"
                              />
                            </svg>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          {{ contextUsageTooltip }}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </template>
                </ChatComposer>
              </div>
            </div>
            <div v-else class="empty-placeholder">
              <Empty :description="t('agent.conversation.none')" />
            </div>
          </section>
        </div>
      </SessionList>
    </div>

    <!-- 引用素材管理对话框 -->
    <Dialog v-model:open="showReferenceDialog" v-if="referenceSession">
      <DialogContent
        class="sm:max-w-[800px]"
        style="height: 80vh; display: flex; flex-direction: column"
      >
        <DialogHeader>
          <DialogTitle>{{ t('agent.reference.title') }}</DialogTitle>
        </DialogHeader>
        <div
          style="
            flex: 1;
            min-height: 0;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            padding: 0;
          "
        >
          <ReferenceManager :session="referenceSession" @update="handleReferenceUpdate" />
        </div>
        <DialogFooter>
          <Button variant="ghost" @click="showReferenceDialog = false">{{
            t('common.close')
          }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="toolsDialogOpen">
      <DialogContent
        class="sm:max-w-[900px] agent-tools-dialog-content"
        style="height: 80vh; display: flex; flex-direction: column"
      >
        <DialogHeader>
          <DialogTitle>{{ t('agent.tools.title') }}</DialogTitle>
        </DialogHeader>
        <div class="agent-tools-dialog-body flex flex-1 flex-col gap-3 min-h-0 overflow-hidden p-1">
          <div class="tool-content flex-1 min-h-0">
            <Card class="tool-panel tool-list-panel" :style="panelStyle">
              <CardContent class="p-0 h-full overflow-hidden">
                <ScrollArea class="tool-list-scroll">
                  <Table class="tool-table">
                    <TableHeader>
                      <TableRow>
                        <TableHead class="w-[140px]">{{ t('agent.tools.name') }}</TableHead>
                        <TableHead class="w-[110px]">{{ t('agent.tools.state') }}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow
                        v-for="tool in tools"
                        :key="tool.id"
                        :data-state="activeTool?.id === tool.id ? 'selected' : undefined"
                        :class="getToolRowClass(tool)"
                        class="cursor-pointer"
                        @click="selectTool(tool)"
                      >
                        <TableCell class="truncate max-w-[140px]">{{ tool.name }}</TableCell>
                        <TableCell>
                          <Badge v-if="tool.running" variant="warning">
                            {{ t('agent.tool.status.running') }}
                          </Badge>
                          <Badge
                            v-else-if="
                              activeSession?.activeToolIds &&
                              activeSession.activeToolIds.length > 0 &&
                              activeSession.activeToolIds.includes(tool.id)
                            "
                            variant="default"
                          >
                            {{ t('agent.tools.enabled') }}
                          </Badge>
                          <Badge v-else variant="secondary">
                            {{ t('agent.tools.available') }}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
            <div class="tool-detail-wrapper">
              <div v-if="activeTool" class="tool-detail" :style="detailStyle">
                <h3 class="tool-detail__title">{{ activeTool.name }}</h3>
                <dl class="tool-detail__list">
                  <dt class="tool-detail__label">{{ t('agent.tools.detail.name') }}</dt>
                  <dd class="tool-detail__value">{{ activeTool.name ?? '' }}</dd>
                  <dt class="tool-detail__label">{{ t('agent.tools.detail.description') }}</dt>
                  <dd class="tool-detail__value">{{ activeTool.description ?? '' }}</dd>
                  <dt class="tool-detail__label">{{ t('agent.tools.detail.origin') }}</dt>
                  <dd class="tool-detail__value">
                    <Badge>{{ originLabel(activeTool.origin as ToolOrigin) }}</Badge>
                  </dd>
                  <template v-if="activeTool.tags?.length">
                    <dt class="tool-detail__label">{{ t('agent.tools.detail.tags') }}</dt>
                    <dd class="tool-detail__value">
                      <div class="tag-group">
                        <Badge
                          v-for="tag in activeTool.tags"
                          :key="tag"
                          variant="default"
                          class="mr-1"
                        >
                          {{ tag }}
                        </Badge>
                      </div>
                    </dd>
                  </template>
                </dl>
              </div>
              <div v-else class="tool-detail placeholder" :style="detailStyle">
                <Empty :description="t('agent.tools.detail.placeholder')" />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" @click="toolsDialogOpen = false">{{
            t('common.close')
          }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 上下文组成对话框 -->
    <ContextBreakdownDialog
      v-model:open="contextBreakdownDialogOpen"
      :breakdown="contextBreakdown"
    />

    <!-- 消息编辑对话框 -->
    <Dialog v-model:open="showEditMessageDialog">
      <DialogContent class="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{{ t('agent.message.editMessage') }}</DialogTitle>
        </DialogHeader>
        <div class="grid gap-4 py-4">
          <Textarea
            v-model="editingMessageContent"
            :rows="10"
            :placeholder="t('agent.message.editPlaceholder')"
            class="w-full"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" @click="showEditMessageDialog = false">{{
            t('common.cancel')
          }}</Button>
          <Button @click="handleConfirmEditMessage">{{ t('common.confirm') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  reactive,
  type Ref
} from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { ai_task_status } from '../utils/consts'

// === Demo Mode Props ===
const props = defineProps<{
  mode?: string
}>()
const isDemo = computed(() => props.mode === 'demo')
import { ElLoading } from 'element-plus'
import { messageBox } from '../utils/messageBox'
import { notifySuccess, notifyError, notifyWarning, notifyInfo } from '../utils/notify'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { Plus, Setting } from '@element-plus/icons-vue'
import { Paperclip } from 'lucide-vue-next'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { Textarea } from '@renderer/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator
} from '@renderer/components/ui/dropdown-menu'
import { themeState, mixColors } from '../utils/themes'
import AgentComposerSendQueuePanel from '../components/agent/AgentComposerSendQueuePanel.vue'
import AgentMessageRenderer from '../components/agent/AgentMessageRenderer.vue'
import ChatComposer from '../components/chat/ChatComposer.vue'
import ReferenceDisplay from '../components/agent/ReferenceDisplay.vue'
import AgentReferencePicker from '../components/agent/AgentReferencePicker.vue'
import ContextBreakdownDialog from '../components/agent/ContextBreakdownDialog.vue'
import type {
  AgentMessage,
  AgentSession,
  AgentTool,
  ChatAgentMessage,
  ComposerSendQueueItem,
  ToolOrigin
} from '../types/agent'
import {
  applyComposerInterruptCleanup,
  clearComposerQueueDrainRetries,
  cloneReferenceStoreSnapshot,
  createComposerSendQueueItem,
  isAgentSessionReadyForNextLlmTurn,
  retryComposerQueueDrainLater
} from '../utils/agent-composer-send-queue'
import { cloneDeep } from 'lodash'
import { useWorkspace, detectDocumentFormat } from '../stores/workspace'
import { useAgentWorkspaceStore } from '../stores/agent-workspace-store'
import { useAgentManageUiStore } from '../stores/agent-manage-ui-store'
import {
  agentConfigManager,
  agentSessionManager,
  agentEngineManager,
  AIContextManager
} from '../utils/agent-framework'
import type { ContextBreakdown } from '../utils/agent-framework'
import { getSessionComposerDraft, isAgentSessionPristine } from '../utils/agent-session-pristine'
import { generateConversationTitleByAi } from '../utils/conversation-title'
import { createRendererLogger } from '../utils/logger'
import { agentToolManager } from '../utils/agent-tool-manager'
import { recognizeIntent } from '../utils/agent-framework/intent-processor'
import {
  processTextReference,
  resolveDirectoryToReference,
  resolveFilePathToReference
} from '../utils/agent-framework/reference-processor'
import { isLikelyFilesystemReferenceOrigin } from '../utils/agent-framework/reference-artifact-paths'
import messageBridge from '../bridge/message-bridge'
import {
  ai_types,
  createAiTask,
  cancelAiTask,
  useAiTasks,
  type CustomLlmConfigForTask
} from '../utils/ai_tasks'
import { sanitizeMessages } from '../utils/llm-api.js'
import { getLlmTemperature } from '../utils/settings.js'
import { LlmAdapter } from '../utils/agent-framework/llm-adapter'
import AgentManageMenuItems from '../components/agent/AgentManageMenuItems.vue'
import ReferenceManager from '../components/agent/ReferenceManager.vue'
import CardGrid from '../components/common/CardGrid.vue'
import SessionList from '../components/common/SessionList.vue'
import type { SessionListItem } from '../components/common/SessionList.vue'
import NewDocumentWorkspace from './NewDocumentWorkspace.vue'
import type { Reference } from '../types/agent-framework'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@renderer/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Card, CardContent } from '@renderer/components/ui/card'
import { Empty } from '@renderer/components/ui/empty'
dayjs.extend(relativeTime)

const { t } = useI18n()
const workspace = useWorkspace()
const { activeDocument, activeTabId, activeTab, removeTab, moveTab, activateTab } = workspace
const agentStore = useAgentWorkspaceStore()
const agentManageUi = useAgentManageUiStore()
/** Agent 全页已就绪（init 完成）后再消费「能力管理 → AI 草稿」，避免抢在 load 之前建会话 */
const agentViewReady = ref(false)
// 与紧凑面板共享的 UI 状态（输入框、生成状态、引擎选择、任务句柄）
const {
  composerInput,
  composerInputBySessionId,
  selectedEngineId,
  isGenerating,
  currentAiTaskHandle,
  aiTaskHandles,
  workspaceRoot
} = storeToRefs(agentStore)

const {
  addGeneratingSession,
  removeGeneratingSession,
  isSessionGenerating,
  registerAgentRunHandle,
  unregisterAgentRunSession,
  getAgentRunHandlesForSession,
  setOpenTabIds
} = agentStore

const isActiveSessionGenerating = computed(() =>
  isSessionGenerating(agentStore.activeSessionId)
)

const borderColor = computed(() =>
  themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.12)'
)

const subtleBorderColor = computed(() =>
  themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'
)

const pageStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

const panelStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor,
  borderColor: borderColor.value
}))

const sessionPaneStyle = computed(() => ({
  backgroundColor: mixColors(themeState.currentTheme.background2nd, '#000000', 0.02),
  color: themeState.currentTheme.textColor,
  borderColor: borderColor.value
}))

const detailStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor,
  borderColor: subtleBorderColor.value
}))

const sessionMenuStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor,
  borderColor: subtleBorderColor.value
}))

const agentViewStyle = computed(() => ({
  gridTemplateColumns: '280px 1fr'
}))

const sampleTools: AgentTool[] = [
  {
    id: 'web-search',
    name: 'Web Search',
    description: t(
      'agent.tools.webSearch.description',
      '通过联网搜索最新信息，返回结构化摘要与引用。'
    ),
    origin: 'renderer',
    running: false,
    enabled: true,
    tags: ['search', 'internet'],
    lastUsed: dayjs().subtract(2, 'hour').toISOString()
  },
  {
    id: 'code-executor',
    name: 'Code Interpreter',
    description: t(
      'agent.tools.codeExecutor.description',
      '在安全沙箱运行代码，支持 Python 与 Node.js，生成图表与数据分析结果。'
    ),
    origin: 'main',
    running: true,
    enabled: true,
    tags: ['analysis', 'notebook'],
    lastUsed: dayjs().subtract(5, 'minute').toISOString()
  },
  {
    id: 'file-browser',
    name: 'File Browser',
    description: t(
      'agent.tools.fileBrowser.description',
      '浏览本地项目文件，并支持快速预览与生成摘要。'
    ),
    origin: 'renderer',
    running: false,
    enabled: false,
    tags: ['fs', 'project'],
    lastUsed: dayjs().subtract(1, 'day').toISOString()
  },
  {
    id: 'mcp-wordpress',
    name: 'WordPress MCP',
    description: t(
      'agent.tools.wordpressMcp.description',
      '通过 MCP 协议与 WordPress 通讯，实现内容发布和评论管理。'
    ),
    origin: 'mcp',
    running: false,
    enabled: true,
    tags: ['cms', 'publish'],
    lastUsed: dayjs().subtract(3, 'day').toISOString()
  }
]

// 从AgentToolManager获取工具，只显示当前会话可用的工具
const tools = computed(() => {
  const session = activeSession.value
  if (!session || !session.agentConfigId) {
    return []
  }

  try {
    // 获取Agent配置
    const agentConfig = agentConfigManager.getConfig(session.agentConfigId)
    if (!agentConfig) {
      const logger = createRendererLogger('AgentView')
      logger.warn(`Agent配置未找到: ${session.agentConfigId}`)
      return []
    }

    // 获取当前会话配置可用工具ID列表
    let availableToolIds = agentConfigManager.getAvailableToolIds(session.agentConfigId)

    // 获取所有工具
    const allTools = agentToolManager.getAllTools()

    // 如果可用工具ID列表为空，尝试显示所有工具（用于调试）
    // 但如果AgentConfig有toolCollectionIds，说明应该有限制，需要检查工具集
    if (
      availableToolIds.length === 0 &&
      agentConfig.toolCollectionIds &&
      agentConfig.toolCollectionIds.length > 0
    ) {
      const logger = createRendererLogger('AgentView')
      logger.warn(
        `工具集交集为空: agentConfigId=${session.agentConfigId}, toolCollectionIds=${agentConfig.toolCollectionIds.join(', ')}`
      )
      // 如果有工具集但交集为空，返回空列表（这是正常情况，表示工具集配置有问题）
      return []
    }

    // 如果availableToolIds为空且没有工具集配置，显示所有工具（回退）
    if (availableToolIds.length === 0) {
      availableToolIds = allTools.map((tool) => tool.config.id)
    }

    // 调试日志（仅在开发环境）
    const logger = createRendererLogger('AgentView')
    if (process.env.NODE_ENV === 'development') {
      logger.debug(
        `工具列表计算: session=${session.id}, agentConfigId=${session.agentConfigId}, availableToolIds=${availableToolIds.length}, allTools=${allTools.length}, toolCollectionIds=${agentConfig.toolCollectionIds?.join(', ') || 'none'}`
      )
    }

    return allTools
      .filter((tool) => availableToolIds.includes(tool.config.id))
      .map((tool) => ({
        id: tool.config.id,
        name: agentToolManager.getLocalizedToolName(
          tool.config.id,
          String(tool.config.name ?? tool.config.id)
        ),
        description: agentToolManager.getLocalizedToolDescription(
          tool.config.id,
          String(tool.config.description ?? '')
        ),
        origin: (tool.config.origin === 'internal'
          ? 'renderer'
          : tool.config.origin === 'mcp'
            ? 'mcp'
            : 'main') as ToolOrigin,
        tags: tool.config.tags || [],
        running: tool.running,
        enabled: tool.config.enabled !== false,
        lastUsed: tool.lastUsed
      }))
  } catch (error) {
    const logger = createRendererLogger('AgentView')
    logger.error('获取工具列表失败:', error)
    return []
  }
})
// 工作区级会话：来自 agent-workspace-store，与 .metadoc 持久化同步
const sessionsState = computed(() => agentStore.sessions)
const activeSessionId = computed(() => agentStore.activeSessionId)
const activeToolId = ref<string | null>(null)
const syncingSessions = ref(false)
const shouldBootstrapDemoSessions = false // 不再使用示例会话
const demoAppliedDocs = new Set<string>()
const openSessionMenuId = ref<string | null>(null)
// AgentView 不使用 RAG 功能（Agent tool 中已有知识库检索）
const availableAgentConfigs = ref(agentConfigManager.getAllConfigs())
const showReferenceDialog = ref(false)
const toolsDialogOpen = ref(false)
const referenceSession = ref<AgentSession | null>(null)
const referencePickerOpen = ref(false)
const composerRef = ref<{
  insertAtCursor: (value: string) => void
  getContentForSubmit?: () => string
} | null>(null)
// === Demo Mode Data ===
const loadDemoData = () => {
  // 创建演示会话
  const demoSessions: AgentSession[] = [
    {
      id: 'demo-session-1',
      title: t('agent.demoSession1'),
      description: t('agent.demoSession1Description', '审查 Vue 组件代码'),
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [
        {
          id: 'demo-msg-1',
          role: 'user',
          type: 'chat',
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          markdown: t('agent.demo.message1', '请帮我审查这个 Vue 组件的代码质量')
        },
        {
          id: 'demo-msg-2',
          role: 'assistant',
          type: 'chat',
          timestamp: new Date(Date.now() - 3500000).toISOString(),
          markdown: t(
            'agent.demo.reply1',
            '我来帮您审查代码。从整体来看，组件结构清晰，但有几个方面可以优化：\n\n1. **Props 定义**：建议使用更严格的类型定义\n2. **Computed 属性**：有性能优化的空间\n3. **事件命名**：建议遵循 kebab-case 规范'
          )
        }
      ],
      activeToolIds: ['code-executor'],
      agentConfigId: 'default-agent-config',
      messageQueue: [],
      composerSendQueue: [],
      referenceStore: [],
      publicContext: {
        document: {
          id: 'demo-doc-1',
          path: '',
          format: 'md'
        }
      },
      executionNodes: [],
      status: 'idle'
    },
    {
      id: 'demo-session-2',
      title: t('agent.demoSession2'),
      description: t('agent.demoSession2Description', '翻译技术文档'),
      createdAt: new Date(Date.now() - 172800000).toISOString(),
      updatedAt: new Date(Date.now() - 86400000).toISOString(),
      messages: [
        {
          id: 'demo-msg-3',
          role: 'user',
          type: 'chat',
          timestamp: new Date(Date.now() - 90000000).toISOString(),
          markdown: t('agent.demo.message2', '将这段文档翻译成中文')
        }
      ],
      activeToolIds: [],
      agentConfigId: 'default-agent-config',
      messageQueue: [],
      composerSendQueue: [],
      referenceStore: [],
      publicContext: {},
      executionNodes: [],
      status: 'idle'
    },
    {
      id: 'demo-session-3',
      title: t('agent.demoSession3'),
      description: t('agent.demoSession3Description', '分析错误日志'),
      createdAt: new Date(Date.now() - 259200000).toISOString(),
      updatedAt: new Date(Date.now() - 172800000).toISOString(),
      messages: [],
      activeToolIds: [],
      agentConfigId: 'default-agent-config',
      messageQueue: [],
      composerSendQueue: [],
      referenceStore: [],
      publicContext: {},
      executionNodes: [],
      status: 'idle'
    }
  ]

  agentStore.setSessions(demoSessions)
  agentStore.setActiveSessionId(demoSessions[0].id)

  selectedEngineId.value = 'default-autogpt-engine'
}

// === Demo Mode Guards ===
const guardDemoAction = (actionName: string): boolean => {
  if (isDemo.value) {
    notifyInfo(t('agent.demo.modeHint', `演示模式: ${actionName} 操作仅用于展示`))
    return true
  }
  return false
}

async function resolveAtExtraReferences(content: string): Promise<Reference[]> {
  const log = createRendererLogger('AgentView')
  const refIdsInInput = [...content.matchAll(/@\[([^\]]+)\]/g)].map((m) => m[1])
  const extraRefs: Reference[] = []
  for (const rawId of refIdsInInput) {
    try {
      if (rawId.startsWith('dir:')) {
        const r = await resolveDirectoryToReference(rawId.slice(4))
        if (r) extraRefs.push(r)
      } else if (rawId.startsWith('tab:')) {
        const tabId = rawId.slice(4)
        const tab = workspace.tabs.find((t) => t.id === tabId)
        if (tab?.path) {
          const r = await resolveFilePathToReference(tab.path)
          if (r) extraRefs.push(r)
        }
      } else if (rawId.includes('/') || rawId.includes('\\')) {
        const r = await resolveFilePathToReference(rawId)
        if (r) extraRefs.push(r)
      }
    } catch (e) {
      log.warn('[resolveAtExtraReferences] 解析 @ 引用失败', rawId, e)
    }
  }
  return extraRefs
}

/** 意图识别阶段补充附件路径（referenceStore 可能在发送后已清空，依赖最后一条用户消息上的快照） */
function composeIntentUserText(session: AgentSession, base: string): string {
  const last = session.messages
    .filter((m) => m.role === 'user' && m.type === 'chat')
    .slice(-1)[0] as ChatAgentMessage | undefined
  const wa = last?.workspaceAttachments
  if (!wa?.length) return base
  return (
    base +
    '\n\n[User attachments on disk — read via workspace tool]\n' +
    wa.map((a) => `- ${a.name} (${a.format}): ${a.absolutePath}`).join('\n')
  )
}

const showEditMessageDialog = ref(false)
const editingMessage = ref<ChatAgentMessage | null>(null)
const editingMessageContent = ref('')
// 不再要求文章初始化后才能使用 Agent View，可直接打开使用
const needsFormatSelection = computed(() => false)

const activeSession = computed(
  () => sessionsState.value.find((session) => session.id === activeSessionId.value) ?? null
)

const contextUsage = computed(() => {
  const session = activeSession.value
  const configId = (session as any)?.agentConfigId
  if (!session || !configId) {
    return { estimatedTokens: 0, maxTokens: 120000, percentage: 0 }
  }
  const config = agentConfigManager.getConfig(configId)
  if (!config) return { estimatedTokens: 0, maxTokens: 120000, percentage: 0 }
  return AIContextManager.getContextUsage(session, config, {})
})
const contextUsageTooltip = computed(() => {
  const u = contextUsage.value
  const k = Math.round(u.estimatedTokens / 1000)
  const maxK = Math.round(u.maxTokens / 1000)
  return `Context: ${u.percentage}% (${k}k / ${maxK}k tokens)`
})

const contextBreakdown = computed<ContextBreakdown | null>(() => {
  const session = activeSession.value
  const configId = (session as any)?.agentConfigId
  if (!session || !configId) return null
  const config = agentConfigManager.getConfig(configId)
  if (!config) return null
  return AIContextManager.getContextBreakdown(session, config, {})
})
const contextBreakdownDialogOpen = ref(false)

const activeTool = computed(
  () => tools.value.find((tool) => tool.id === activeToolId.value) ?? null
)

const ensureActiveSessionId = () => {
  const list = agentStore.sessions
  if (!list.length) {
    agentStore.setActiveSessionId(null)
    openSessionMenuId.value = null
    return
  }
  if (!list.some((session) => session.id === agentStore.activeSessionId)) {
    agentStore.setActiveSessionId(list[0].id)
  }
}

const touchSession = (session: AgentSession) => {
  session.updatedAt = new Date().toISOString()
  agentStore.touchSession()
}

/** 工作区级：触发 store 持久化到 .metadoc */
const persistSessions = () => agentStore.touchSession()

watch(
  () => agentStore.activeSessionId,
  () => {
    activeToolId.value = null
    openSessionMenuId.value = null
  }
)

const scrollToBottom = () => {
  nextTick(() => {
    const container = document.querySelector(
      '.conversation-pane .conversation-scroll [data-reka-scroll-area-viewport]'
    ) as HTMLElement | null
    if (container) container.scrollTop = container.scrollHeight
  })
}

// AI 正在输出时，消息列表或最后一条助手消息内容变化则自动滚到底部，始终显示最新内容
watch(
  () => {
    if (!isSessionGenerating(agentStore.activeSessionId)) return null
    const msgs = activeSession.value?.messages
    if (!msgs?.length) return null
    const last = msgs[msgs.length - 1]
    const md =
      last?.role === 'assistant' && last?.type === 'chat'
        ? (last as ChatAgentMessage).markdown
        : undefined
    return [msgs.length, md] as const
  },
  () => {
    scrollToBottom()
  },
  { deep: true, flush: 'post' }
)

// 监听文档格式变化，同步更新所有会话的publicContext
watch(
  [() => activeDocument.value?.format, () => activeTabId.value],
  ([newFormat, newTabId]) => {
    if (!newFormat || !newTabId) return

    // 更新所有会话的 publicContext 中的文档格式信息（生成中的会话不修改，避免改写正在执行的上下文）
    sessionsState.value.forEach((session) => {
      if (isSessionGenerating(session.id)) return
      if (session.publicContext?.document?.id === newTabId) {
        session.publicContext.document.format = newFormat as 'md' | 'tex'
      }
    })
  },
  { immediate: true }
)

// 监听AI任务变化，当所有相关任务都已完成、失败、取消或被删除后，自动解锁UI
// 注意：这个watch用于处理在AITaskQueue中手动取消/完成任务的情况
// 正常情况下，任务完成或取消应该由executeAgentEngine的finally块处理
const allTasks = useAiTasks()
let unlockCheckTimer: ReturnType<typeof setTimeout> | null = null
watch(
  [
    allTasks,
    () => activeSession.value?.id,
    () => isSessionGenerating(activeSessionId.value)
  ],
  ([tasks, sessionId, activeSessionGenerating]) => {
    // 清除之前的定时器
    if (unlockCheckTimer) {
      clearTimeout(unlockCheckTimer)
      unlockCheckTimer = null
    }

    // 仅当「当前展示的会话」处于生成中时才检查（避免后台其他会话运行时的误判）
    if (!activeSessionGenerating || !sessionId) {
      return
    }

    // 延迟检查，避免任务刚创建时状态还没更新导致的误判
    // 增加延迟时间，确保任务已经创建并添加到列表中
    unlockCheckTimer = setTimeout(() => {
      // 首先检查是否有handle在管理（这是最可靠的判断方式）
      // 如果有handle在管理，说明任务正在运行或刚创建，不应该解锁
      if (aiTaskHandles.value.size > 0 || currentAiTaskHandle.value !== null) {
        // 清理已完成/失败/取消的任务handle
        const handlesToRemove: string[] = []
        aiTaskHandles.value.forEach((handle) => {
          const task = allTasks.value.find((t) => t.handle === handle)
          // 只有当任务确实已完成/失败/取消时，才从handle集合中移除
          if (
            task &&
            (task.status.value === ai_task_status.FINISHED ||
              task.status.value === ai_task_status.FAILED ||
              task.status.value === ai_task_status.CANCELLED)
          ) {
            handlesToRemove.push(handle)
          }
        })
        handlesToRemove.forEach((handle) => aiTaskHandles.value.delete(handle))

        // 清理currentAiTaskHandle（如果任务已完成/失败/取消）
        if (currentAiTaskHandle.value) {
          const currentTask = allTasks.value.find((t) => t.handle === currentAiTaskHandle.value)
          if (
            currentTask &&
            (currentTask.status.value === ai_task_status.FINISHED ||
              currentTask.status.value === ai_task_status.FAILED ||
              currentTask.status.value === ai_task_status.CANCELLED)
          ) {
            currentAiTaskHandle.value = null
          }
        }

        // 如果清理后还有handle，说明还有任务在运行，不应该解锁
        if (aiTaskHandles.value.size > 0 || currentAiTaskHandle.value !== null) {
          unlockCheckTimer = null
          return
        }
      }

      // 关键修复：如果没有handle在管理，说明主任务可能还没有创建（或者已经完成并被清理）
      // 在这种情况下，不应该通过检查origin_key来判断是否解锁，因为：
      // 1. 意图识别等辅助任务（schema-task-开头）不匹配 agent-${sessionId}- 前缀，不会被包含
      // 2. 主任务可能还没有创建（在执行意图识别之前）
      // 3. 如果主任务已经完成，finally块会正确处理解锁
      // 因此，当没有handle在管理时，直接返回，不进行后续检查，避免误判
      // 只有在主任务已经创建（有handle）且所有handle的任务都已完成的情况下，才应该解锁
      // 如果主任务确实已经创建并完成，finally块会正确处理解锁
      unlockCheckTimer = null
      return
    }, 500) // 增加延迟到500ms，确保任务已经创建并添加到列表中
  },
  { deep: true }
)

const messageCount = computed(() => activeSession.value?.messages.length ?? 0)
const activeToolCount = computed(() => tools.value.length ?? 0) // 计算所有可用工具的数量

// 工具选择功能已移除，工具列表现在为只读模式

const formatRelativeTime = (timestamp: string) => dayjs(timestamp).fromNow()

/** 当前激活会话若为「空白新会话」，复用并可选更新标题，避免连点产生多个空会话 */
function tryReusePristineActiveSession(sessionTitleOverride?: string): boolean {
  const cur = activeSession.value
  if (!cur) return false
  const draft = getSessionComposerDraft(
    cur.id,
    agentStore.activeSessionId,
    composerInput.value,
    composerInputBySessionId.value
  )
  if (!isAgentSessionPristine(cur, draft)) return false
  const title = sessionTitleOverride?.trim()
  if (title) {
    cur.title = title
    cur.titleUserEdited = false
    touchSession(cur)
    persistSessions()
  }
  return true
}

const createSession = (agentConfigId?: string, sessionTitleOverride?: string) => {
  if (tryReusePristineActiveSession(sessionTitleOverride)) {
    return
  }
  const configId = agentConfigId || agentConfigManager.getDefaultConfigId()
  const resolvedTitle =
    sessionTitleOverride?.trim() ||
    t('agent.sessions.newTitle', { index: sessionsState.value.length + 1 })
  // 演示模式：直接创建演示会话
  if (isDemo.value) {
    const demoSession: AgentSession = {
      id: `demo-session-${Date.now()}`,
      title:
        sessionTitleOverride?.trim() ||
        `${t('agent.demo.sessionTitle')} ${sessionsState.value.length + 1}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
      activeToolIds: [],
      agentConfigId: configId,
      messageQueue: [],
      composerSendQueue: [],
      referenceStore: [],
      publicContext: {},
      executionNodes: [],
      status: 'idle'
    }
    agentStore.setSessions([demoSession, ...agentStore.sessions])
    agentStore.setActiveSessionId(demoSession.id)
    setOpenTabIds([demoSession.id, ...agentStore.openTabIds.filter((id) => id !== demoSession.id)])
    notifySuccess(t('agent.sessions.createSuccess', '会话创建成功'))
    return
  }

  try {
    const session = agentSessionManager.createSession(configId, resolvedTitle, '')

    // 获取当前文档信息并设置到publicContext
    const doc = activeDocument.value
    if (doc) {
      // 确保文档格式已设置（如果未设置，默认为md）
      const docFormat = doc.format || 'md'
      session.publicContext = session.publicContext || {}
      session.publicContext.document = {
        id: activeTabId.value || '',
        path: doc.path || '',
        format: docFormat as 'md' | 'tex',
        title: doc.meta?.title || ''
      }
    }

    // 转换为旧的格式以保持兼容
    const legacySession: AgentSession = {
      id: session.id,
      title: session.title,
      description: session.description,
      createdAt: new Date(session.createdAt).toISOString(),
      updatedAt: new Date(session.updatedAt).toISOString(),
      messages: session.messages,
      activeToolIds: [], // 初始状态：所有工具都不高亮，等待意图识别器判断
      agentConfigId: session.agentConfigId,
      messageQueue: session.messageQueue || [],
      composerSendQueue: (session as { composerSendQueue?: AgentSession['composerSendQueue'] })
        .composerSendQueue ?? [],
      referenceStore: session.referenceStore || [],
      publicContext: session.publicContext || {},
      executionNodes: session.executionNodes || [],
      status: session.status || 'idle'
    }

    agentStore.setSessions([legacySession, ...agentStore.sessions])
    ensureActiveSessionId()
    agentStore.setActiveSessionId(session.id)
    setOpenTabIds([session.id, ...agentStore.openTabIds.filter((id) => id !== session.id)])
    persistSessions()
  } catch (error) {
    notifyError(error instanceof Error ? error.message : String(error))
  }
}

/** 能力管理「AI 辅助」写入草稿：由全局对话框设置 pending，全页 Agent 就绪后消费 */
function applyPendingAgentDraftPayload(pending: { draft: string; sessionTitle: string }) {
  nextTick(() => {
    createSession(agentConfigManager.getDefaultConfigId(), pending.sessionTitle)
    nextTick(() => {
      composerInput.value = pending.draft
    })
  })
}

watch(
  () => agentManageUi.pendingAgentDraft,
  (pending) => {
    if (!pending || !agentViewReady.value) return
    const p = agentManageUi.takePendingAgentDraft()
    if (!p) return
    applyPendingAgentDraftPayload(p)
  }
)

/** 主页暂存在 `_home_pending` 的附件迁入新建会话目录，并更新 Reference 的 origin */
async function migrateHomePendingRefsIfNeeded(
  session: AgentSession,
  pendingRefs: Reference[]
): Promise<Reference[]> {
  const needs = pendingRefs.some(
    (r) => r.metadata?.attachmentStorage === 'workspace' && r.metadata?.homePending === true
  )
  if (!needs) return pendingRefs
  let root = agentStore.workspaceRoot
  if (!root) {
    root = await agentStore.refreshWorkspaceRoot()
  }
  if (!root) return pendingRefs
  try {
    const migrations = (await messageBridge.invoke('migrate-home-pending-attachments', {
      workspaceRoot: root,
      toSessionId: session.id
    })) as Array<{ oldAbsolutePath: string; newAbsolutePath: string; relativePath: string }>
    const map = new Map(migrations.map((m) => [m.oldAbsolutePath, m]))
    return pendingRefs.map((ref) => {
      if (!(ref.metadata?.homePending && ref.metadata?.attachmentStorage === 'workspace')) {
        return ref
      }
      const m = map.get(ref.origin)
      if (!m) return ref
      const meta = { ...(ref.metadata as Record<string, unknown>) }
      delete meta.homePending
      meta.workspaceRelativePath = m.relativePath
      return {
        ...ref,
        origin: m.newAbsolutePath,
        metadata: meta
      }
    })
  } catch (e) {
    createRendererLogger('AgentView').warn('migrate home pending attachments failed', e)
    return pendingRefs
  }
}

/** 主页发送首条消息：新建会话、注入附件引用并提交 */
function applyHomeLaunchSubmit(content: string, pendingRefs: Reference[] = []) {
  nextTick(() => {
    createSession(agentConfigManager.getDefaultConfigId())
    void (async () => {
      await nextTick()
      const session = activeSession.value
      if (!session) return
      if (pendingRefs.length > 0) {
        const refs = await migrateHomePendingRefsIfNeeded(session, pendingRefs)
        for (const ref of refs) {
          agentSessionManager.addReferenceObject(session as any, ref)
        }
        touchSession(session)
        persistSessions()
      }
      composerInput.value = content
      await nextTick()
      void handleComposerSubmit(undefined, content)
    })()
  })
}

function consumeHomeSubmitIfReady() {
  if (!agentViewReady.value) return
  const tab = activeTab.value
  if (!tab || tab.kind !== 'system' || tab.route !== '/agent') return
  const pending = agentManageUi.takePendingHomeAgentSubmit()
  if (!pending) return
  applyHomeLaunchSubmit(pending.content, pending.references)
}

watch(
  () => activeTab.value?.route,
  () => {
    consumeHomeSubmitIfReady()
  }
)

/** 主页 setPending 后若本页已就绪，补一次消费；与 onMounted / route watch 互补 */
watch(
  () => agentManageUi.pendingHomeAgentSubmit,
  () => {
    nextTick(() => consumeHomeSubmitIfReady())
  },
  { flush: 'post', immediate: true }
)

const deleteSession = async (session?: AgentSession) => {
  const target = session ?? activeSession.value
  if (!target) return

  // 如果删除后没有会话了，不允许删除（需要至少保留一个）
  if (sessionsState.value.length <= 1) {
    notifyWarning(t('agent.sessions.atLeastOneRequired'))
    return
  }

  // 演示模式：直接删除不确认
  if (isDemo.value) {
    agentStore.setSessions(agentStore.sessions.filter((item) => item.id !== target.id))
    ensureActiveSessionId()
    if (sessionsState.value.length === 0) {
      loadDemoData()
    }
    return
  }

  try {
    await messageBox.confirm(
      t('agent.sessions.confirmDelete', { title: target.title }),
      t('agent.sessions.delete'),
      { type: 'warning' }
    )
    agentStore.setSessions(agentStore.sessions.filter((item) => item.id !== target.id))
    ensureActiveSessionId()
    persistSessions()
    notifySuccess(t('agent.sessions.deleteSuccess'))

    // 如果删除后没有会话了，创建一个默认会话
    if (sessionsState.value.length === 0) {
      createDefaultSession()
    }
  } catch {
    // canceled
  }
}

const createDefaultSession = () => {
  try {
    const defaultConfigId = agentConfigManager.getDefaultConfigId()
    const defaultSession = agentSessionManager.createSession(
      defaultConfigId,
      t('agent.sessions.defaultTitle'),
      ''
    )

    const legacySession: AgentSession = {
      id: defaultSession.id,
      title: defaultSession.title,
      description: defaultSession.description,
      createdAt: new Date(defaultSession.createdAt).toISOString(),
      updatedAt: new Date(defaultSession.updatedAt).toISOString(),
      messages: defaultSession.messages,
      activeToolIds: [], // 初始状态：所有工具都不高亮，等待意图识别器判断
      agentConfigId: defaultSession.agentConfigId,
      messageQueue: defaultSession.messageQueue || [],
      composerSendQueue: (defaultSession as { composerSendQueue?: AgentSession['composerSendQueue'] })
        .composerSendQueue ?? [],
      referenceStore: defaultSession.referenceStore || [],
      publicContext: defaultSession.publicContext || {},
      executionNodes: defaultSession.executionNodes || [],
      status: defaultSession.status || 'idle'
    }

    agentStore.setSessions([legacySession])
    ensureActiveSessionId()
    agentStore.setActiveSessionId(legacySession.id)
    agentStore.touchSession()
  } catch (error) {
    notifyError(error instanceof Error ? error.message : String(error))
  }
}

const renameSession = async (session: AgentSession) => {
  try {
    const { value } = await messageBox.prompt(
      t('agent.sessions.renamePlaceholder'),
      t('agent.sessions.rename'),
      {
        inputValue: session.title,
        inputValidator: (val: string) => !!val.trim() || t('agent.sessions.renameRequired')
      }
    )
    session.title = value.trim()
    session.titleUserEdited = true
    touchSession(session)
    persistSessions()
    notifySuccess(t('agent.sessions.renameSuccess'))
  } catch {
    // canceled
  }
}

// 工具选择功能已移除，工具列表现在为只读模式（显示当前会话可用的工具）
const selectTool = (tool: AgentTool) => {
  activeToolId.value = tool.id
}

// 获取工具行的CSS类名（用于高亮活跃工具）
// 只有在意图识别器选中工具后才高亮（activeToolIds 不为空且包含该工具）
const getToolRowClass = (tool: AgentTool) => {
  if (
    activeSession.value?.activeToolIds &&
    activeSession.value.activeToolIds.length > 0 &&
    activeSession.value.activeToolIds.includes(tool.id)
  ) {
    return 'active-tool-row'
  }
  return ''
}

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

/** 在 executeAgentEngine 定义之后赋值 */
let runComposerSendPipelineForSessionRef: ((s: AgentSession, c: string) => Promise<void>) | null = null

function onComposerSendQueueUpdate(next: ComposerSendQueueItem[]) {
  const s = activeSession.value
  if (!s) return
  s.composerSendQueue = next
  touchSession(s)
  persistSessions()
}

function scheduleComposerQueueDrain(sessionId: string) {
  void nextTick(async () => {
    await flushOneComposerSendQueueItem(sessionId)
  })
}

async function flushOneComposerSendQueueItem(sessionId: string): Promise<void> {
  if (isSessionGenerating(sessionId)) return
  const idx = sessionsState.value.findIndex((s) => s.id === sessionId)
  if (idx === -1) return
  const session = sessionsState.value[idx]
  const q = session.composerSendQueue
  if (!q?.length) return
  if (!isAgentSessionReadyForNextLlmTurn(session)) {
    retryComposerQueueDrainLater(sessionId, flushOneComposerSendQueueItem)
    return
  }
  clearComposerQueueDrainRetries(sessionId)
  const item = q.shift()!
  touchSession(session)
  persistSessions()
  session.referenceStore = cloneReferenceStoreSnapshot(item.referenceSnapshot) as AgentSession['referenceStore']
  if (!runComposerSendPipelineForSessionRef) return
  try {
    await runComposerSendPipelineForSessionRef(session, item.markdown)
  } catch (e) {
    createRendererLogger('AgentView').error('[composerSendQueue] flush failed', e)
  }
}

const handleComposerSubmit = async (_enableKB?: boolean, contentFromEvent?: string) => {
  if (guardDemoAction(t('agent.demo.action.sendMessage'))) {
    const session = activeSession.value
    if (session) {
      const message = createChatMessage(
        'user',
        composerInput.value.trim() || t('agent.demo.message')
      )
      session.messages.push(message)
      touchSession(session)
      composerInput.value = ''
      setTimeout(() => {
        const reply = createChatMessage(
          'assistant',
          t(
            'agent.demo.simulatedReply',
            '这是演示模式下的模拟回复。在实际使用中，AI会根据您的消息生成智能回复。'
          )
        )
        session.messages.push(reply)
        touchSession(session)
      }, 1000)
    }
    return
  }

  const logger = createRendererLogger('AgentView')
  if (needsFormatSelection.value) return

  const session = activeSession.value
  if (!session) {
    logger.warn('[handleComposerSubmit] 没有活动的会话')
    return
  }

  const rawContent =
    contentFromEvent ??
    (typeof composerRef.value?.getContentForSubmit === 'function'
      ? composerRef.value.getContentForSubmit()
      : composerInput.value)
  let content = rawContent.trim()
  const refStoreLen = session.referenceStore?.length ?? 0
  if (!content && refStoreLen > 0) {
    content = t(
      'agent.composer.attachmentsOnlyUserMessage',
      'Please answer based on the attached references.'
    )
  }
  if (!content) {
    logger.warn('[handleComposerSubmit] 消息内容为空')
    return
  }

  if (isSessionGenerating(session.id)) {
    if (!session.composerSendQueue) session.composerSendQueue = []
    session.composerSendQueue.push(
      createComposerSendQueueItem(content, cloneReferenceStoreSnapshot(session.referenceStore))
    )
    notifyInfo(t('agent.composer.queuedHint'))
    touchSession(session)
    nextTick(() => {
      composerInput.value = ''
      session.referenceStore = []
      persistSessions()
    })
    scrollToBottom()
    persistSessions()
    return
  }

  if (!runComposerSendPipelineForSessionRef) {
    logger.error('[handleComposerSubmit] 发送管线未初始化')
    return
  }
  await runComposerSendPipelineForSessionRef(session, content)
}

// 执行Agent引擎
const executeAgentEngine = async (
  userMessage: string,
  assistantMessageRef?: Ref<string>, // 保留参数以保持兼容性，但SimpleChat引擎不再使用
  stopWatcher?: (() => void) | null, // 保留参数以保持兼容性，但SimpleChat引擎不再使用
  assistantMessage?: ChatAgentMessage,
  actualSession?: AgentSession,
  shouldQueryKnowledgeBase: boolean = false,
  extraReferences?: Reference[]
) => {
  // 多会话并行时必须传入 actualSession；缺省仅兼容「单会话且当前 tab 即目标」的旧调用，否则易串到 activeSession
  const session = actualSession || activeSession.value
  if (!session || !session.agentConfigId) {
    notifyWarning(t('agent.sessions.noAgentConfig'))
    return
  }

  const engineId = selectedEngineId.value || 'default-autogpt-engine'
  const engine = agentEngineManager.getEngine(engineId)
  if (!engine) {
    notifyError(t('agent.sessions.engineNotFound'))
    return
  }

  const agentConfig = agentConfigManager.getConfig(session.agentConfigId)
  if (!agentConfig) {
    notifyError(t('agent.sessions.agentConfigNotFound'))
    return
  }

  addGeneratingSession(session.id)

  // // 确保文档格式已设置（如果文档格式未确定，自动检测）
  // // 同时更新session的publicContext，确保Agent知道当前文档格式
  // const currentTabId = session.activeTabId || activeTabId.value;
  // if (currentTabId) {
  //   const doc = workspace.ensureDocument(currentTabId);
  //   if (doc) {
  //     // 自动检测格式（如果未设置）
  //     if (!doc.format || (doc.markdown.trim().length === 0 && doc.tex.trim().length === 0)) {
  //       const currentContent = doc.markdown.trim().length > 0 ? doc.markdown : doc.tex;
  //       if (currentContent.length > 0) {
  //         const detectedFormat = detectDocumentFormat(currentContent);
  //         if (detectedFormat !== doc.format) {
  //           doc.format = detectedFormat;
  //           workspace.updateDocumentFormat(currentTabId, detectedFormat);
  //           const logger = createRendererLogger('AgentView');
  //           logger.info(`AgentView: 文档 ${currentTabId} 格式自动检测为 ${detectedFormat}`);
  //         }
  //       } else {
  //         // 如果内容为空，默认使用md
  //         if (!doc.format) {
  //           doc.format = 'md';
  //           workspace.updateDocumentFormat(currentTabId, 'md');
  //         }
  //       }
  //     }

  //     // 更新session的publicContext，确保文档格式信息被传递
  //     session.publicContext = session.publicContext || {};
  //     const detectedFormat = (doc.format || 'md') as 'md' | 'tex';
  //     session.publicContext.document = {
  //       id: currentTabId,
  //       path: doc.path || '',
  //       format: detectedFormat,
  //       title: doc.meta?.title || ''
  //     };

  //     // 记录日志：确保文档格式信息被正确设置
  //     const logger = createRendererLogger('AgentView');
  //     logger.info('[executeAgent] 更新session publicContext.document', {
  //       sessionId: session.id,
  //       documentId: currentTabId,
  //       documentFormat: detectedFormat,
  //       documentPath: doc.path || '',
  //       documentTitle: doc.meta?.title || '',
  //       publicContextDocument: session.publicContext.document
  //     });
  //   }
  // }

  // 创建AbortController用于取消
  const abortController = new AbortController()
  const originKey = `agent-${session.id}-${Date.now()}`

  // 更新会话状态
  session.status = 'thinking'
  // 注意：不要在流式输出期间持久化，会破坏reactive对象的响应式
  // persistSessions();

  // 对于SimpleChat引擎，使用createAiTask实现流式输出
  if (engine.engineType === 'simple-chat') {
    const logger = createRendererLogger('AgentView')
    logger.debug('[executeAgentEngine] 开始执行simple-chat引擎')
    try {
      // 如果已经传入了assistantMessage（在handleComposerSubmit中创建），使用它
      // 否则，在这里创建（兼容其他调用路径，如重新生成等）
      if (!assistantMessage) {
        assistantMessage = reactive({
          id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          role: 'assistant',
          type: 'chat',
          timestamp: new Date().toISOString(),
          markdown: ''
        }) as ChatAgentMessage
        session.messages.push(assistantMessage)
        // 注意：不要在流式输出期间持久化，会破坏reactive对象的响应式
        // persistSessions();
        await nextTick()
      }

      // 注意：simple-chat引擎现在使用LlmAdapter.callChatViaTask，它会直接更新assistantMessage.markdown
      // 不需要watch来同步，但需要设置滚动监听
      stopWatcher = watch(
        () => assistantMessage?.markdown,
        () => {
          scrollToBottom()
        },
        { immediate: false }
      )

      // 执行意图识别（用于更新activeToolIds和工具高亮）
      try {
        const intentOutputRef = ref('')
        // 类型转换：AgentView使用的是agent类型的AgentSession，但recognizeIntent期望agent-framework类型
        // 这两个类型兼容，可以安全转换
        const intentResult = await recognizeIntent(
          session as any,
          agentConfig,
          composeIntentUserText(session, userMessage),
          intentOutputRef,
          engine,
          {
            taskName: 'Intent Recognition',
            temperature: 0.3,
            maxTokens: 500
          }
        )

        // 更新session的activeToolIds（用于UI高亮显示）
        if (session.activeToolIds) {
          session.activeToolIds = [...intentResult.toolIds]
          logger.debug('[executeAgentEngine] 意图识别完成，已更新activeToolIds', {
            activeToolIds: session.activeToolIds,
            toolCount: intentResult.toolIds.length
          })
        }
      } catch (error) {
        logger.warn('[executeAgentEngine] 意图识别失败，继续执行', error)
        // 意图识别失败不影响主流程，继续执行
      }

      // 构建上下文消息：附件引用以最后一条用户消息的 referenceIds 为准（发送后 referenceStore 已清空）
      const lastUserMessage = session.messages
        .filter((m) => m.role === 'user' && m.type === 'chat')
        .slice(-1)[0] as ChatAgentMessage | undefined
      const messageReferenceIds =
        lastUserMessage?.referenceIds && lastUserMessage.referenceIds.length > 0
          ? lastUserMessage.referenceIds
          : (session.referenceStore || []).map((r) => r.id)
      const contextMessages = AIContextManager.buildMessages(session, agentConfig, {
        activeReferenceIds: messageReferenceIds,
        extraReferences
      })

      // 准备自定义LLM配置（如果引擎有自定义配置）
      let customLlmConfig: CustomLlmConfigForTask | undefined = undefined
      if (engine.llmConfigMode === 'custom' && engine.customLlmConfig) {
        customLlmConfig = {
          baseUrl: engine.customLlmConfig.baseUrl,
          apiKey: engine.customLlmConfig.apiKey,
          model: engine.customLlmConfig.model,
          temperature: engine.customLlmConfig.temperature,
          maxTokens: engine.customLlmConfig.maxTokens,
          type: 'openai-compatible',
          chatSuffix: '/chat/completions'
        }
      }

      // 使用LlmAdapter.callChatViaTask而不是createAiTask，以支持工具调用检测
      // 直接使用sanitizeMessages清理所有消息，确保所有content都是字符串
      // sanitizeMessages会处理所有消息格式问题，包括tool消息的content必须是字符串
      // 这确保了在发送到LLM API之前，所有消息格式都符合规范
      const formattedMessages = sanitizeMessages(contextMessages)
      logger.debug(`[executeAgentEngine] 消息已清理，消息数量: ${formattedMessages.length}`)

      // 获取LLM配置
      const llmConfig = await LlmAdapter.getLlmConfig(engine)

      // 获取温度配置（优先使用engine的自定义配置，否则使用全局配置）
      const temperature = engine.customLlmConfig?.temperature ?? (await getLlmTemperature())

      // 创建工具调用队列（用于执行检测到的工具调用）；传入 onTaskCreated 以便终止时取消工具型 AI 任务
      const { ToolCallQueue } = await import('../utils/agent-framework/tool-call-queue')
      const toolCallQueue = new ToolCallQueue(
        session as any,
        abortController.signal,
        undefined,
        undefined,
        (handle: string) => {
          registerAgentRunHandle(session.id, handle)
        }
      )

      // 创建工具调用检测回调
      const onToolCallsDetected = async (
        toolCalls: Array<{ id: string; tool_id: string; parameters: Record<string, unknown> }>
      ) => {
        if (!assistantMessage) return
        logger.debug('[executeAgentEngine] 检测到工具调用:', {
          toolCallsCount: toolCalls.length,
          toolCalls: toolCalls.map((tc) => ({ id: tc.id, tool_id: tc.tool_id }))
        })

        // 获取现有的tool_calls数组（如果存在）
        const existingToolCalls = (assistantMessage as any).tool_calls || []
        const existingToolCallIds = new Set(existingToolCalls.map((tc: any) => tc.id))

        // 过滤出新的工具调用（避免重复添加）
        const newToolCalls = toolCalls.filter((tc) => !existingToolCallIds.has(tc.id))

        if (newToolCalls.length === 0) {
          logger.debug('[executeAgentEngine] 所有工具调用都已存在，跳过添加')
          return
        }

        // 合并现有的和新的工具调用
        const toolCallsArray = [
          ...existingToolCalls,
          ...newToolCalls.map((tc) => ({
            id: tc.id,
            tool_id: tc.tool_id,
            parameters: tc.parameters
          }))
        ]

        // 更新assistantMessage的tool_calls
        Object.defineProperty(assistantMessage, 'tool_calls', {
          value: toolCallsArray,
          writable: true,
          enumerable: true,
          configurable: true
        })

        logger.info('[executeAgentEngine] 已添加tool_calls到assistantMessage（追加模式）', {
          messageId: assistantMessage.id,
          existingCount: existingToolCalls.length,
          newCount: newToolCalls.length,
          totalCount: toolCallsArray.length
        })

        // 将工具调用添加到队列（立即开始执行）
        for (const toolCall of newToolCalls) {
          toolCallQueue.addTask(toolCall)
        }

        logger.info('[executeAgentEngine] 已将新工具调用添加到队列，开始异步执行', {
          addedCount: newToolCalls.length
        })
      }

      logger.debug('[executeAgentEngine] 准备调用LlmAdapter.callChatViaTask')

      // 调用LlmAdapter.callChatViaTask，支持工具调用检测
      const response = await LlmAdapter.callChatViaTask(llmConfig, formattedMessages, {
        temperature,
        maxTokens: engine.customLlmConfig?.maxTokens,
        stream: true,
        signal: abortController.signal,
        taskName: t('agent.task.agentConversation'),
        originKey,
        reactiveMessage: assistantMessage,
        onTaskCreated: (handle: string) => {
          registerAgentRunHandle(session.id, handle)
          logger.debug(`[executeAgentEngine] AI任务已创建，handle: ${handle}`)
        },
        onToolCallsDetected
      })

      logger.debug('[executeAgentEngine] LlmAdapter.callChatViaTask完成')

      // 等待工具调用队列完成（如果队列中有任务）
      // 注意：需要先标记输入完成，然后等待队列完成
      // 这样可以确保所有在流式过程中检测到的工具调用都已添加到队列并执行完成
      toolCallQueue.setInputComplete()
      if (!toolCallQueue.isEmpty() || toolCallQueue.getIsRunning()) {
        logger.debug('[executeAgentEngine] 等待工具调用队列完成...')
        await toolCallQueue.waitForComplete()
        logger.debug('[executeAgentEngine] 工具调用队列已完成')
      }

      // 任务完成后，确保消息内容是最新的
      // 注意：LlmAdapter.callChatViaTask已经通过reactiveMessage更新了markdown
      // 但为了保险起见，如果response有内容且markdown为空，则使用response
      if (assistantMessage && response && !assistantMessage.markdown) {
        assistantMessage.markdown = response
      }
      logger.debug(
        `[executeAgentEngine] 任务完成，最终消息长度: ${assistantMessage?.markdown?.length || 0}`
      )

      session.status = 'idle'

      // 流式输出完成后，现在可以安全地持久化（此时消息已经完整）
      persistSessions()
      logger.debug('[executeAgentEngine] 会话已持久化')

      // 滚动到底部
      scrollToBottom()
    } catch (error) {
      const logger = createRendererLogger('AgentView')

      // 检查是否是用户取消的任务
      // - 原始 AbortError（如 fetch/AbortController）
      // - LlmError(type === 'ABORTED')，或其 originalError/cause 为 AbortError
      const anyError = error as any
      const isAbortErrorName =
        error instanceof Error &&
        (error.name === 'AbortError' || (error as any).cause?.name === 'AbortError')
      const isLlmAborted =
        anyError &&
        typeof anyError === 'object' &&
        (anyError.type === 'ABORTED' ||
          anyError.originalError?.name === 'AbortError' ||
          anyError.originalError?.type === 'ABORTED')
      const isCancelled = isAbortErrorName || isLlmAborted

      if (isCancelled) {
        logger.debug('Agent引擎任务已取消')
        applyComposerInterruptCleanup(session, t('agent.task.cancelled'))
        session.status = 'idle'
        persistSessions()
        return
      }

      // 真正的错误才记录
      logger.error('Agent引擎执行失败:', error)
      session.status = 'error'
      persistSessions()

      // 如果任务被取消或失败，也要更新消息内容
      // 注意：LlmAdapter.callChatViaTask已经通过reactiveMessage更新了markdown
      if (assistantMessage && assistantMessage.id) {
        // 移除空的响应式消息
        const messageIndex = session.messages.findIndex((m) => m.id === assistantMessage!.id)
        if (messageIndex !== -1) {
          session.messages.splice(messageIndex, 1)
          persistSessions()
        }
        const errorMessage = error instanceof Error ? error.message : String(error)
        AIContextManager.addAssistantMessage(
          session,
          t('agent.error.executionFailed', { message: errorMessage })
        )
        persistSessions()
      }

      throw error
    } finally {
      // 清理watch监听器
      if (stopWatcher) {
        stopWatcher()
      }
      unregisterAgentRunSession(session.id)
      removeGeneratingSession(session.id)
      scheduleComposerQueueDrain(session.id)
    }
  } else {
    // 对于其他引擎，使用现有的执行器逻辑
    try {
      const { AgentEngineExecutorFactory } = await import(
        '../utils/agent-framework/agent-engine-executor'
      )
      const lastUserMsg = session.messages
        .filter((m: any) => m.role === 'user' && m.type === 'chat')
        .slice(-1)[0] as ChatAgentMessage | undefined
      const messageRefIds =
        lastUserMsg?.referenceIds && lastUserMsg.referenceIds.length > 0
          ? lastUserMsg.referenceIds
          : (session.referenceStore || []).map((r) => r.id)
      const executor = AgentEngineExecutorFactory.create(engine, session, agentConfig, {
        signal: abortController.signal,
        activeReferenceIds: messageRefIds,
        extraReferences,
        onProgress: (progress) => {
          session.status = progress.stage as any
          persistSessions()
        },
        onTaskCreated: (handle: string) => {
          registerAgentRunHandle(session.id, handle)
        }
      })

      await executor.execute(userMessage)

      session.status = 'idle'
      persistSessions()

      // 滚动到底部
      scrollToBottom()
    } catch (error) {
      const logger = createRendererLogger('AgentView')

      // 检查是否是用户取消的任务
      const isCancelled =
        error instanceof Error &&
        (error.message === t('agent.task.cancelled') ||
          error.message.includes(t('agent.task.cancelled')) ||
          error.name === 'AbortError')

      if (isCancelled) {
        logger.debug('Agent引擎任务已取消')
        applyComposerInterruptCleanup(session, t('agent.task.cancelled'))
        session.status = 'idle'
        persistSessions()
        return
      }

      // 真正的错误才记录
      logger.error('Agent引擎执行失败:', error)
      session.status = 'error'
      persistSessions()

      const errorMessage = error instanceof Error ? error.message : String(error)
      AIContextManager.addAssistantMessage(
        session,
        t('agent.error.executionFailed', { message: errorMessage })
      )
      persistSessions()

      throw error
    } finally {
      unregisterAgentRunSession(session.id)
      removeGeneratingSession(session.id)
      scheduleComposerQueueDrain(session.id)
    }
  }
}

runComposerSendPipelineForSessionRef = async (session: AgentSession, content: string) => {
  const logger = createRendererLogger('AgentView')
  logger.debug(`[runComposerSendPipeline] ${content.substring(0, 50)}...`)

  const liveSession = sessionsState.value.find((s) => s.id === session.id)
  if (!liveSession) {
    logger.error('[runComposerSendPipeline] 会话不在工作区列表', session.id)
    return
  }

  if (liveSession.activeToolIds) {
    liveSession.activeToolIds = []
  }

  const refIdsInInput = [...content.matchAll(/@\[([^\]]+)\]/g)].map((m) => m[1])
  const extraRefs = await resolveAtExtraReferences(content)

  const storeRefs = [...(liveSession.referenceStore || [])]
  const storeIds = new Set(storeRefs.map((r) => r.id))
  const attachmentIdsInInput = refIdsInInput.filter((id) => storeIds.has(id))
  const messageRefIds =
    attachmentIdsInInput.length > 0 ? attachmentIdsInInput : storeRefs.map((r) => r.id)
  const workspaceAttachments = storeRefs
    .filter((r) => r.metadata?.attachmentStorage === 'workspace')
    .map((r) => ({
      name: r.name,
      absolutePath: r.origin,
      relativePath: String(r.metadata?.workspaceRelativePath ?? ''),
      format: r.format
    }))
  const inlineReferenceSnippets = storeRefs
    .filter(
      (r) =>
        r.metadata?.attachmentStorage !== 'workspace' &&
        typeof r.parsedContent === 'string' &&
        r.parsedContent.length > 0
    )
    .map((r) => ({
      name: r.name,
      format: r.format,
      text: r.parsedContent
    }))
  const isFirstUserMessage = liveSession.messages.length === 1
  const message = createChatMessage('user', content, messageRefIds) as ChatAgentMessage
  if (workspaceAttachments.length > 0) message.workspaceAttachments = workspaceAttachments
  if (inlineReferenceSnippets.length > 0) message.inlineReferenceSnippets = inlineReferenceSnippets
  liveSession.messages.push(message)
  liveSession.referenceStore = []
  touchSession(liveSession)

  const shouldQueryKnowledgeBase = false

  // 与 AIChat 一致：用户首条消息发出后即并行生成标题，不等待第一轮 Agent 回复结束
  if (isFirstUserMessage && !liveSession.titleUserEdited) {
    generateConversationTitleByAi(
      liveSession.messages,
      liveSession.title || t('agent.sessions.defaultTitle')
    )
      .then((newTitle) => {
        if (newTitle && !liveSession.titleUserEdited) {
          liveSession.title = newTitle
          persistSessions()
        }
      })
      .catch((err) => logger.debug('生成会话标题失败', err))
  }

  nextTick(() => {
    composerInput.value = ''
    persistSessions()
  })
  scrollToBottom()

  try {
    const engineId = selectedEngineId.value || 'default-autogpt-engine'
    const engine = agentEngineManager.getEngine(engineId)

    if (engine?.engineType === 'simple-chat') {
      const assistantMessage: ChatAgentMessage = reactive({
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'assistant',
        type: 'chat',
        timestamp: new Date().toISOString(),
        markdown: ''
      }) as ChatAgentMessage

      liveSession.messages.push(assistantMessage)
      touchSession(liveSession)
      await nextTick()

      await executeAgentEngine(
        content,
        undefined,
        undefined,
        assistantMessage,
        liveSession,
        shouldQueryKnowledgeBase,
        extraRefs
      )
    } else {
      await executeAgentEngine(
        content,
        undefined,
        undefined,
        undefined,
        liveSession,
        shouldQueryKnowledgeBase,
        extraRefs
      )
    }
  } catch (error) {
    logger.error('[runComposerSendPipeline] 执行失败:', error)
    notifyError(error instanceof Error ? error.message : String(error))
  }
}

const handleComposerReset = () => {
  composerInput.value = ''
}

const handleAttachFile = async (fileOrFiles?: File | File[]) => {
  if (!activeSession.value) {
    return
  }

  // 演示模式：显示提示
  if (isDemo.value) {
    notifyInfo(t('agent.demo.attachHint', '演示模式：附件功能仅用于展示'))
    return
  }

  try {
    const { processFileUpload, processUrlReference } = await import(
      '../utils/agent-framework/reference-processor'
    )

    let root = workspaceRoot.value
    if (!root) {
      root = await agentStore.refreshWorkspaceRoot()
    }
    if (!root) {
      notifyError(
        t(
          'agent.attachments.needWorkspace',
          '请先在侧栏打开工作区文件夹，以便将附件保存到 .metadoc/attachments。'
        )
      )
      return
    }
    const workspaceAttachmentOpts = {
      workspaceRoot: root,
      sessionId: activeSession.value.id
    }

    // 检查输入框中是否是URL（用户可能粘贴了URL）
    const inputText = composerInput.value.trim()
    const isUrl = /^https?:\/\//.test(inputText)

    const files = Array.isArray(fileOrFiles) ? fileOrFiles : fileOrFiles ? [fileOrFiles] : []

    if (isUrl && files.length === 0) {
      // 处理URL（用户输入了URL但没有选择文件）
      const reference = await processUrlReference(inputText, undefined, {
        workspaceAttachment: workspaceAttachmentOpts
      })
      composerInput.value = '' // 清空输入框

      const newFormatSession: any = {
        ...activeSession.value,
        entityType: 'agent-session',
        createdAt:
          typeof activeSession.value.createdAt === 'string'
            ? new Date(activeSession.value.createdAt).getTime()
            : activeSession.value.createdAt,
        updatedAt:
          typeof activeSession.value.updatedAt === 'string'
            ? new Date(activeSession.value.updatedAt).getTime()
            : activeSession.value.updatedAt,
        messageQueue: activeSession.value.messageQueue || [],
        referenceStore: activeSession.value.referenceStore || [],
        publicContext: activeSession.value.publicContext || {},
        executionNodes: activeSession.value.executionNodes || [],
        status: activeSession.value.status || 'idle'
      }
      agentSessionManager.addReferenceObject(newFormatSession, reference)
      notifySuccess(t('agent.reference.addSuccess'))
      persistSessions()
    } else if (files.length > 0) {
      // 批量处理文件上传
      const loading = ElLoading.service({
        lock: true,
        text:
          files.length > 1
            ? t('agent.reference.processingFiles', { count: files.length })
            : t('agent.reference.processingFile'),
        background: 'rgba(0, 0, 0, 0.7)'
      })

      try {
        const references: Reference[] = []
        let successCount = 0
        let failCount = 0

        // 逐个处理文件
        for (let i = 0; i < files.length; i++) {
          const file = files[i]
          try {
            loading.setText(
              files.length > 1
                ? t('agent.reference.processingFileN', {
                    current: i + 1,
                    total: files.length,
                    name: file.name
                  })
                : t('agent.reference.processingNamedFile', { name: file.name })
            )
            const reference = await processFileUpload(file, undefined, undefined, {
              workspaceAttachment: workspaceAttachmentOpts
            })
            references.push(reference)
            successCount++
          } catch (error) {
            failCount++
            console.error(`处理文件 ${file.name} 失败:`, error)
            // 继续处理其他文件
          }
        }

        // 批量添加到会话
        if (references.length > 0) {
          const newFormatSession: any = {
            ...activeSession.value,
            entityType: 'agent-session',
            createdAt:
              typeof activeSession.value.createdAt === 'string'
                ? new Date(activeSession.value.createdAt).getTime()
                : activeSession.value.createdAt,
            updatedAt:
              typeof activeSession.value.updatedAt === 'string'
                ? new Date(activeSession.value.updatedAt).getTime()
                : activeSession.value.updatedAt,
            messageQueue: activeSession.value.messageQueue || [],
            referenceStore: activeSession.value.referenceStore || [],
            publicContext: activeSession.value.publicContext || {},
            executionNodes: activeSession.value.executionNodes || [],
            status: activeSession.value.status || 'idle'
          }

          // 批量添加引用
          references.forEach((ref) => {
            agentSessionManager.addReferenceObject(newFormatSession, ref)
          })

          persistSessions()

          // 显示成功消息
          if (failCount === 0) {
            notifySuccess(
              files.length > 1
                ? t('agent.reference.addSuccessCount', { count: successCount })
                : t('agent.reference.addSuccess')
            )
          } else {
            notifyWarning(
              t('agent.reference.addPartialSuccess', { success: successCount, fail: failCount })
            )
          }
        } else {
          notifyError(t('agent.reference.allFilesFailed'))
        }
      } finally {
        loading.close()
      }
    } else {
      // 既没有文件也没有URL
      return
    }
  } catch (error) {
    notifyError(error instanceof Error ? error.message : String(error))
  }
}

function getAtLabel(rawValue: string): string {
  if (rawValue.startsWith('tab:')) {
    const tabId = rawValue.slice(4)
    const tab = workspace.tabs.find((t) => t.id === tabId)
    return tab?.title ?? t('agent.attachment.untitled', '未命名')
  }
  if (rawValue.startsWith('dir:')) {
    const dirPath = rawValue.slice(4)
    return dirPath.replace(/^.*[/\\]/, '') || dirPath || t('agent.reference.directory', '目录')
  }
  return rawValue.replace(/^.*[/\\]/, '') || rawValue
}

function handleReferencePickerFile(payload: { type: 'file'; path: string }) {
  if (payload.type !== 'file') return
  composerRef.value?.insertAtCursor(payload.path)
  referencePickerOpen.value = false
}

function handleReferencePickerTab(payload: { type: 'tab'; tabId: string }) {
  if (payload.type !== 'tab') return
  const tab = workspace.tabs.find((t) => t.id === payload.tabId)
  if (tab?.path) {
    composerRef.value?.insertAtCursor(tab.path)
  } else {
    composerRef.value?.insertAtCursor('tab:' + payload.tabId)
  }
  referencePickerOpen.value = false
}

function handleReferencePickerDir(payload: { type: 'dir'; path: string }) {
  if (payload.type !== 'dir') return
  composerRef.value?.insertAtCursor('dir:' + payload.path)
  referencePickerOpen.value = false
}

async function pathToFile(filePath: string): Promise<File> {
  const result = (await messageBridge.invoke('read-file-for-upload', filePath)) as {
    name: string
    data: string
    mimeType: string
  }
  const binaryString = atob(result.data)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  const blob = new Blob([bytes], { type: result.mimeType })
  return new File([blob], result.name, { type: result.mimeType })
}

const attachPickerOpenInProgress = ref(false)

async function openAttachFilePicker() {
  if (!activeSession.value) return
  if (attachPickerOpenInProgress.value) return
  attachPickerOpenInProgress.value = true
  try {
    const { selectReferenceFiles } = await import('../utils/agent-framework/reference-processor')
    const filePaths = await selectReferenceFiles('all', true, t('aiChat.attachTooltip'))
    if (filePaths.length === 0) return
    const files: File[] = []
    for (const filePath of filePaths) {
      try {
        files.push(await pathToFile(filePath))
      } catch (e) {
        console.error(`无法读取文件 ${filePath}:`, e)
      }
    }
    if (files.length > 0) {
      await handleAttachFile(files.length === 1 ? files[0] : files)
    }
  } catch (err) {
    notifyError(err instanceof Error ? err.message : String(err))
  } finally {
    attachPickerOpenInProgress.value = false
  }
}

const handleCancelGeneration = () => {
  const session = activeSession.value
  if (!session) {
    return
  }

  const allTasks = useAiTasks()

  const sessionPrefix = `agent-${session.id}-`
  const relatedTasks = allTasks.value.filter(
    (task) => task.origin_key && task.origin_key.startsWith(sessionPrefix)
  )
  relatedTasks.forEach((task) => {
    cancelAiTask(task.handle, false)
  })

  const runHandles = getAgentRunHandlesForSession(session.id)
  runHandles.forEach((handle) => {
    cancelAiTask(handle, false)
  })
  unregisterAgentRunSession(session.id)
  removeGeneratingSession(session.id)

  session.status = 'idle'
  applyComposerInterruptCleanup(session, t('agent.task.cancelled'))
  persistSessions()
  scheduleComposerQueueDrain(session.id)
}

const originLabel = (origin: AgentTool['origin']) => {
  switch (origin) {
    case 'renderer':
      return t('agent.tools.origins.renderer')
    case 'main':
      return t('agent.tools.origins.main')
    case 'mcp':
      return t('agent.tools.origins.mcp')
    default:
      return origin
  }
}

const toggleSessionMenu = (sessionId: string) => {
  openSessionMenuId.value = openSessionMenuId.value === sessionId ? null : sessionId
}

const handleOpenReferenceDialog = () => {
  if (activeSession.value) {
    referenceSession.value = activeSession.value
    showReferenceDialog.value = true
  }
}

const handleRemoveComposerReference = async (referenceId: string) => {
  const session = activeSession.value
  if (!session?.referenceStore?.length) {
    return
  }
  const ref = session.referenceStore.find((r) => r.id === referenceId)
  if (!ref) {
    return
  }
  if (isLikelyFilesystemReferenceOrigin(ref.origin) && messageBridge.getIpc()) {
    try {
      await messageBridge.invoke('delete-reference-artifact-file', {
        absolutePath: ref.origin,
        workspaceRoot: workspaceRoot.value || undefined
      })
    } catch (err) {
      createRendererLogger('AgentView').warn('[handleRemoveComposerReference] 删除引用文件失败', err)
    }
  }
  session.referenceStore = session.referenceStore.filter((r) => r.id !== referenceId)
  persistSessions()
}

const handleSessionMenuAction = async (
  action: 'rename' | 'delete' | 'retry' | 'duplicate' | 'export' | 'references',
  session: AgentSession
) => {
  openSessionMenuId.value = null
  if (action === 'rename') {
    await renameSession(session)
  } else if (action === 'delete') {
    await deleteSession(session)
  } else if (action === 'retry') {
    await handleRetrySession(session)
  } else if (action === 'duplicate') {
    await handleDuplicateSession(session)
  } else if (action === 'export') {
    await handleExportSession(session)
  } else if (action === 'references') {
    referenceSession.value = session
    showReferenceDialog.value = true
  }
}

const handleRetrySession = async (session: AgentSession) => {
  if (
    !session.currentExecutionNodeId &&
    session.executionNodes &&
    session.executionNodes.length > 0
  ) {
    notifyWarning(t('agent.sessions.noExecutionNode'))
    return
  }

  try {
    // 转换为新的AgentSession格式
    const newFormatSession: any = {
      ...session,
      entityType: 'agent-session',
      createdAt:
        typeof session.createdAt === 'string'
          ? new Date(session.createdAt).getTime()
          : session.createdAt,
      updatedAt:
        typeof session.updatedAt === 'string'
          ? new Date(session.updatedAt).getTime()
          : session.updatedAt,
      messageQueue: session.messageQueue || [],
      referenceStore: session.referenceStore || [],
      publicContext: session.publicContext || {},
      executionNodes: session.executionNodes || [],
      status: session.status || 'idle'
    }

    if (session.currentExecutionNodeId) {
      agentSessionManager.retryToNode(newFormatSession, session.currentExecutionNodeId)

      // 更新会话
      const index = sessionsState.value.findIndex((s) => s.id === session.id)
      if (index !== -1) {
        sessionsState.value[index] = {
          ...sessionsState.value[index],
          ...newFormatSession,
          createdAt: new Date(newFormatSession.createdAt).toISOString(),
          updatedAt: new Date(newFormatSession.updatedAt).toISOString()
        }
        persistSessions()
        notifySuccess(t('agent.sessions.retrySuccess'))
      }
    } else {
      notifyWarning(t('agent.sessions.noExecutionNode'))
    }
  } catch (error) {
    notifyError(error instanceof Error ? error.message : String(error))
  }
}

const handleDuplicateSession = async (session: AgentSession) => {
  try {
    // 转换为新的AgentSession格式
    const newFormatSession: any = {
      ...session,
      entityType: 'agent-session',
      createdAt:
        typeof session.createdAt === 'string'
          ? new Date(session.createdAt).getTime()
          : session.createdAt,
      updatedAt:
        typeof session.updatedAt === 'string'
          ? new Date(session.updatedAt).getTime()
          : session.updatedAt,
      messageQueue: session.messageQueue || [],
      referenceStore: session.referenceStore || [],
      publicContext: session.publicContext || {},
      executionNodes: session.executionNodes || [],
      status: session.status || 'idle'
    }

    const duplicated = agentSessionManager.duplicateSession(
      newFormatSession,
      session.currentExecutionNodeId
    )

    // 转换为旧格式
    const legacySession: AgentSession = {
      id: duplicated.id,
      title: duplicated.title,
      description: duplicated.description,
      createdAt: new Date(duplicated.createdAt).toISOString(),
      updatedAt: new Date(duplicated.updatedAt).toISOString(),
      messages: duplicated.messages,
      activeToolIds: duplicated.agentConfigId
        ? agentConfigManager.getAvailableToolIds(duplicated.agentConfigId)
        : session.activeToolIds,
      agentConfigId: duplicated.agentConfigId,
      messageQueue: duplicated.messageQueue,
      referenceStore: duplicated.referenceStore,
      publicContext: duplicated.publicContext,
      executionNodes: duplicated.executionNodes,
      status: duplicated.status
    }

    agentStore.setSessions([legacySession, ...agentStore.sessions])
    ensureActiveSessionId()
    agentStore.setActiveSessionId(duplicated.id)
    setOpenTabIds([duplicated.id, ...agentStore.openTabIds.filter((id) => id !== duplicated.id)])
    persistSessions()
    notifySuccess(t('agent.sessions.duplicateSuccess'))
  } catch (error) {
    notifyError(error instanceof Error ? error.message : String(error))
  }
}

const handleExportSession = async (session: AgentSession) => {
  try {
    // 转换为新的AgentSession格式
    const newFormatSession: any = {
      ...session,
      entityType: 'agent-session',
      createdAt:
        typeof session.createdAt === 'string'
          ? new Date(session.createdAt).getTime()
          : session.createdAt,
      updatedAt:
        typeof session.updatedAt === 'string'
          ? new Date(session.updatedAt).getTime()
          : session.updatedAt,
      messageQueue: session.messageQueue || [],
      referenceStore: session.referenceStore || [],
      publicContext: session.publicContext || {},
      executionNodes: session.executionNodes || [],
      status: session.status || 'idle'
    }

    const serialized = agentSessionManager.serializeSession(newFormatSession, false, {
      compact: true
    })
    const json = JSON.stringify(serialized, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `agent-session-${session.id}.json`
    a.click()
    URL.revokeObjectURL(url)
    notifySuccess(t('agent.sessions.exportSuccess'))
  } catch (error) {
    notifyError(error instanceof Error ? error.message : String(error))
  }
}

const handleReferenceUpdate = () => {
  if (referenceSession.value) {
    // 更新会话
    const index = sessionsState.value.findIndex((s) => s.id === referenceSession.value!.id)
    if (index !== -1) {
      // 转换为新的AgentSession格式以获取最新数据
      const newFormatSession: any = {
        ...referenceSession.value,
        entityType: 'agent-session',
        createdAt:
          typeof referenceSession.value.createdAt === 'string'
            ? new Date(referenceSession.value.createdAt).getTime()
            : referenceSession.value.createdAt,
        updatedAt:
          typeof referenceSession.value.updatedAt === 'string'
            ? new Date(referenceSession.value.updatedAt).getTime()
            : referenceSession.value.updatedAt,
        messageQueue: referenceSession.value.messageQueue || [],
        referenceStore: referenceSession.value.referenceStore || [],
        publicContext: referenceSession.value.publicContext || {},
        executionNodes: referenceSession.value.executionNodes || [],
        status: referenceSession.value.status || 'idle'
      }

      // 更新会话
      sessionsState.value[index] = {
        ...sessionsState.value[index],
        referenceStore: newFormatSession.referenceStore,
        updatedAt: new Date(newFormatSession.updatedAt).toISOString()
      }
      touchSession(sessionsState.value[index])
      persistSessions()
    }
  }
}

const handleManageCommand = (command: string) => {
  agentManageUi.openManage(command)
}

// === SessionList 集成 ===
const sessionListItems = computed<SessionListItem[]>(() =>
  sessionsState.value.map((session) => ({
    id: session.id,
    title: session.title,
    updatedAt: session.updatedAt || session.createdAt || new Date().toISOString(),
    generating: isSessionGenerating(session.id)
  }))
)

const handleSessionListSelect = (item: SessionListItem) => {
  agentStore.setActiveSessionId(item.id)
  openSessionMenuId.value = null
}

const handleSessionListRename = (item: SessionListItem, newTitle: string) => {
  const session = sessionsState.value.find((s) => s.id === item.id)
  if (session) {
    session.title = newTitle
    session.titleUserEdited = true
    touchSession(session)
    persistSessions()
    notifySuccess(t('agent.sessions.renameSuccess'))
  }
}

const handleSessionListDuplicate = (item: SessionListItem) => {
  const session = sessionsState.value.find((s) => s.id === item.id)
  if (session) {
    handleDuplicateSession(session)
  }
}

const handleSessionListExport = (item: SessionListItem) => {
  const session = sessionsState.value.find((s) => s.id === item.id)
  if (session) {
    void handleExportSession(session)
  }
}

const handleSessionListDelete = (item: SessionListItem) => {
  // SessionList 已经显示了确认对话框，直接删除即可
  const session = sessionsState.value.find((s) => s.id === item.id)
  if (!session) return

  if (sessionsState.value.length <= 1) {
    notifyWarning(t('agent.sessions.atLeastOneRequired'))
    return
  }

  agentStore.setSessions(agentStore.sessions.filter((s) => s.id !== session.id))
  ensureActiveSessionId()
  persistSessions()
  notifySuccess(t('agent.sessions.deleteSuccess'))

  if (sessionsState.value.length === 0) {
    createDefaultSession()
  }
}

const handleDocumentClick = () => {
  openSessionMenuId.value = null
}

// 消息操作方法
const handleMessageEdit = (message: AgentMessage) => {
  if (message.role !== 'user' || message.type !== 'chat') {
    return
  }
  editingMessage.value = message as ChatAgentMessage
  editingMessageContent.value = message.markdown || ''
  showEditMessageDialog.value = true
}

const handleConfirmEditMessage = async () => {
  if (!editingMessage.value || !activeSession.value) {
    return
  }

  const session = activeSession.value
  if (isSessionGenerating(session.id)) {
    notifyWarning(t('agent.sessions.alreadyGenerating'))
    return
  }

  const content = editingMessageContent.value.trim()
  if (!content) {
    notifyWarning(t('agent.message.editPlaceholder'))
    return
  }

  // 找到消息并更新
  const messageIndex = session.messages.findIndex((m) => m.id === editingMessage.value!.id)
  if (messageIndex !== -1) {
    const message = session.messages[messageIndex] as ChatAgentMessage
    message.markdown = content

    // 删除此消息之后的所有消息（包括AI回复和工具调用结果）
    session.messages = session.messages.slice(0, messageIndex + 1)

    // 清理所有保留消息中未完成的tool_calls
    // OpenAI API要求：如果assistant消息有tool_calls，必须紧接着有对应的tool消息
    // 由于我们删除了后续消息，如果某个assistant消息有tool_calls但对应的tool消息被删除了，
    // 需要清理这些tool_calls避免LLM API报错
    const toolCallIds = new Set<string>()
    for (let i = 0; i < session.messages.length; i++) {
      const msg = session.messages[i]
      if (msg.role === 'assistant' && msg.type === 'chat') {
        const assistantMsg = msg as ChatAgentMessage
        const toolCalls = (assistantMsg as any).tool_calls
        if (toolCalls && Array.isArray(toolCalls) && toolCalls.length > 0) {
          // 记录所有tool_call_ids
          for (const tc of toolCalls) {
            if (tc.id) {
              toolCallIds.add(tc.id)
            }
          }
        }
      } else if (msg.role === 'tool' && msg.type === 'tool') {
        // 如果找到对应的tool消息，从集合中移除
        const toolCallId = (msg as any).tool_call_id
        if (toolCallId && toolCallIds.has(toolCallId)) {
          toolCallIds.delete(toolCallId)
        }
      }
    }

    // 清理所有未完成的tool_calls
    if (toolCallIds.size > 0) {
      for (let i = 0; i < session.messages.length; i++) {
        const msg = session.messages[i]
        if (msg.role === 'assistant' && msg.type === 'chat') {
          const assistantMsg = msg as ChatAgentMessage
          const toolCalls = (assistantMsg as any).tool_calls
          if (toolCalls && Array.isArray(toolCalls) && toolCalls.length > 0) {
            // 过滤掉未完成的tool_calls
            const completedToolCalls = toolCalls.filter((tc: any) => {
              return tc.id && toolCallIds.has(tc.id)
            })
            if (completedToolCalls.length === 0) {
              // 如果没有已完成的tool_calls，删除整个tool_calls字段
              delete (assistantMsg as any).tool_calls
            } else {
              // 保留已完成的tool_calls
              ;(assistantMsg as any).tool_calls = completedToolCalls
            }
          }
        }
      }
    }

    touchSession(session)
    persistSessions()
    notifySuccess(t('agent.message.editSuccess'))
    showEditMessageDialog.value = false
    editingMessage.value = null
    editingMessageContent.value = ''

    // 重新触发AI生成（AgentView 不使用 RAG 功能）
    const extraRefs = await resolveAtExtraReferences(content)
    const liveSession = sessionsState.value.find((s) => s.id === session.id) ?? session
    await executeAgentEngine(content, undefined, undefined, undefined, liveSession, false, extraRefs)
  }
}

const handleMessageRegenerate = async (message: AgentMessage) => {
  if (!activeSession.value) return
  // 只允许在用户消息下重新生成，AI 与 tool 消息不提供重新生成以免造成状态错乱
  if (message.role !== 'user' || message.type !== 'chat') return

  const session = activeSession.value
  const messageIndex = session.messages.findIndex((m) => m.id === message.id)
  if (messageIndex === -1) return

  if (isSessionGenerating(session.id)) {
    notifyWarning(t('agent.sessions.alreadyGenerating'))
    return
  }

  try {
    await messageBox.confirm(
      t('agent.message.confirmRegenerate'),
      t('agent.message.confirmRegenerateTitle'),
      { type: 'warning' }
    )
  } catch {
    return
  }

  // 菜单关闭时的穿透点击可能误开编辑框；确认重新生成后一律关闭编辑态，避免与下方流程叠层
  showEditMessageDialog.value = false
  editingMessage.value = null
  editingMessageContent.value = ''

  const userMessage = message as ChatAgentMessage
  // 删除该条用户消息之后的所有内容（消息、工具调用、意图识别等），当作从未发生过
  session.messages = session.messages.slice(0, messageIndex + 1)
  if (session.messageQueue) session.messageQueue = []
  if (session.executionNodes) session.executionNodes = []
  touchSession(session)
  persistSessions()

  const extraRefs = await resolveAtExtraReferences(userMessage.markdown || '')
  const liveSession = sessionsState.value.find((s) => s.id === session.id) ?? session
  await executeAgentEngine(
    userMessage.markdown,
    undefined,
    undefined,
    undefined,
    liveSession,
    false,
    extraRefs
  )
}

const handleMessageDuplicate = async (message: AgentMessage) => {
  if (!activeSession.value) {
    return
  }

  // 找到消息在会话中的位置
  const session = activeSession.value
  const messageIndex = session.messages.findIndex((m) => m.id === message.id)
  if (messageIndex === -1) {
    return
  }

  // 复制会话到指定消息节点
  try {
    // 转换为新的AgentSession格式
    const newFormatSession: any = {
      ...session,
      entityType: 'agent-session',
      createdAt:
        typeof session.createdAt === 'string'
          ? new Date(session.createdAt).getTime()
          : session.createdAt,
      updatedAt:
        typeof session.updatedAt === 'string'
          ? new Date(session.updatedAt).getTime()
          : session.updatedAt,
      messageQueue: session.messageQueue || [],
      referenceStore: session.referenceStore || [],
      publicContext: session.publicContext || {},
      executionNodes: session.executionNodes || [],
      status: session.status || 'idle'
    }

    // 创建新的消息ID，用于标识Duplicate节点
    const duplicateMessageId = message.id

    const duplicated = agentSessionManager.duplicateSession(newFormatSession, duplicateMessageId)

    // 转换为旧格式
    const legacySession: AgentSession = {
      id: duplicated.id,
      title: duplicated.title,
      description: duplicated.description,
      createdAt: new Date(duplicated.createdAt).toISOString(),
      updatedAt: new Date(duplicated.updatedAt).toISOString(),
      messages: duplicated.messages,
      activeToolIds: [], // 初始状态：所有工具都不高亮，等待意图识别器判断
      agentConfigId: duplicated.agentConfigId,
      messageQueue: duplicated.messageQueue,
      referenceStore: duplicated.referenceStore,
      publicContext: duplicated.publicContext,
      executionNodes: duplicated.executionNodes,
      status: duplicated.status
    }

    agentStore.setSessions([legacySession, ...agentStore.sessions])
    ensureActiveSessionId()
    agentStore.setActiveSessionId(duplicated.id)
    setOpenTabIds([duplicated.id, ...agentStore.openTabIds.filter((id) => id !== duplicated.id)])
    persistSessions()
    notifySuccess(t('agent.sessions.duplicateSuccess'))
  } catch (error) {
    notifyError(error instanceof Error ? error.message : String(error))
  }
}

const handleMessageDelete = async (message: AgentMessage) => {
  if (!activeSession.value) {
    return
  }

  try {
    await messageBox.confirm(t('agent.message.confirmDelete'), t('agent.message.delete'), {
      type: 'warning'
    })

    const session = activeSession.value
    const messageIndex = session.messages.findIndex((m) => m.id === message.id)
    if (messageIndex !== -1) {
      // 删除这条消息及其之后的所有消息
      session.messages = session.messages.slice(0, messageIndex)
      touchSession(session)
      persistSessions()
      notifySuccess(t('agent.message.deleteSuccess'))
    }
  } catch {
    // canceled
  }
}

onMounted(async () => {
  document.addEventListener('click', handleDocumentClick)

  // 演示模式：加载演示数据
  if (isDemo.value) {
    loadDemoData()
    agentViewReady.value = true
    const p = agentManageUi.takePendingAgentDraft()
    if (p) applyPendingAgentDraftPayload(p)
    consumeHomeSubmitIfReady()
    selectedEngineId.value = 'default-autogpt-engine'
    return
  }

  try {
    await agentStore.init()
    ensureActiveSessionId()
  } catch (e) {
    createRendererLogger('AgentView').error('Agent 工作区 init 失败', e)
  } finally {
    agentViewReady.value = true
    const pendingDraft = agentManageUi.takePendingAgentDraft()
    if (pendingDraft) applyPendingAgentDraftPayload(pendingDraft)
    consumeHomeSubmitIfReady()
  }

  // 固定使用 AutoGPT 引擎（不暴露用户切换入口）
  selectedEngineId.value = 'default-autogpt-engine'
})

onActivated(() => {
  consumeHomeSubmitIfReady()
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick)
})
</script>

<style scoped>
.agent-view-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}

.agent-tabs {
  margin-bottom: 0;
}

.agent-view {
  flex: 1;
  min-height: 0;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.agent-content {
  display: flex;
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

.pane-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.pane-header h2 {
  font-size: 16px;
  margin: 0;
}

.actions {
  display: flex;
  gap: 8px;
}

.conversation-pane,
.tool-pane {
  padding: 16px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  overflow: hidden;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;
}

/* sidebar-footer 区域（管理按钮） */
.sidebar-footer-content {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid var(--el-border-color-lighter);
  width: 100%;
  box-sizing: border-box;
}

.sidebar-footer-menu {
  flex: 1;
  min-width: 0;
  width: 100%;
}

.tool-pane {
  border-left: none; /* 由 .tool-pane 主样式中的 border-left 控制 */
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.12s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.conversation-pane {
  padding: 16px 16px 0;
  border: none;
  flex: 1;
  min-width: 0;
}

.conversation-header {
  padding-right: 12px;
}

.conversation-header h2 {
  margin: 0;
  font-size: 18px;
}

.conversation-header .subtitle {
  margin: 4px 0 0;
  opacity: 0.7;
  font-size: 13px;
}

.conversation-stats {
  display: flex;
  gap: 8px;
}

.conversation-scroll {
  flex: 1;
  min-height: 0;
  padding-right: 4px;
}

.conversation-scroll :deep([data-reka-scroll-area-viewport]) {
  overflow-x: hidden;
}

.conversation-bottom-spacer {
  height: 10vh;
  flex-shrink: 0;
}

.conversation-bottom-spacer.has-references {
  height: 15vh; /* 如果有引用列表，增加底部空间 */
}

.conversation-content {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* 非绝对定位：输入区域为 panel 内正常流，左右边界为 panel，底部留空隙避免重叠 */
.composer-wrapper {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  padding: 4px 6px 8px;
  gap: 4px;
  border-top: 1px solid rgba(128, 128, 128, 0.22);
}

.conversation-composer {
  width: 100%;
  min-width: 0;
}

/* AgentView 专用：输入框占满 panel 宽度，长短文本模式与底部空隙 */
.agent-view-composer :deep(.composer-shell) {
  width: 100%;
  border-radius: 5px;
  padding: 4px 6px;
  gap: 4px;
  box-shadow: 0 0 6px rgba(0, 0, 0, 0.06);
}

.agent-view-composer :deep(.composer-shell.is-multiline) {
  grid-template-columns: 1fr;
  align-items: stretch;
}

.agent-view-composer :deep(.composer-shell.is-multiline .composer-leading) {
  position: absolute;
  bottom: 6px;
  left: 6px;
  z-index: 10;
}

.agent-view-composer :deep(.composer-shell.is-multiline .composer-actions) {
  position: absolute;
  bottom: 6px;
  right: 6px;
}

.agent-view-composer :deep(.composer-shell.is-multiline .composer-scroll) {
  padding-bottom: 20px;
  padding-left: 28px;
}

.agent-view-composer-leading {
  display: flex;
  align-items: center;
  gap: 2px;
  align-self: flex-end;
}

.agent-view-composer-btn {
  width: 22px;
  height: 22px;
  padding: 0;
}

.agent-view-composer-btn-icon {
  width: 12px;
  height: 12px;
}

.agent-context-ring-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  flex-shrink: 0;
}
.agent-context-ring-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  user-select: none;
}
.agent-context-ring-btn:hover .agent-context-ring-fill,
.agent-context-ring-btn:hover .agent-context-ring-bg {
  opacity: 1;
}
.agent-context-ring-btn:hover .agent-context-ring-bg {
  opacity: 0.4;
}
.agent-context-ring-svg {
  display: block;
}
.agent-context-ring-bg {
  opacity: 0.25;
}
.agent-context-ring-fill {
  opacity: 1;
  transition: stroke-dashoffset 0.2s ease;
}

.agent-view-attach-dropdown {
  font-size: 12px;
  min-width: 120px;
}

.empty-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tool-pane {
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 12px;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  overflow: hidden;
  flex-shrink: 0;
  border-left: 1px solid var(--el-border-color-lighter);
}

.tool-header-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.tool-legend {
  display: flex;
  gap: 6px;
}

.tool-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  gap: 12px;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  overflow: hidden;
}

.tool-panel {
  flex: 1;
  min-height: 0;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.tool-panel :deep(> div) {
  display: flex;
  flex: 1;
  flex-direction: column;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  overflow: hidden;
}

.tool-list-scroll {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
}

/* 工具详情区域：纯 div 占满剩余高度，不再用 ScrollArea 避免高度链断裂 */
.tool-detail-wrapper {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.tool-list-scroll :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
}

.tool-table {
  width: 100%;
  table-layout: fixed;
}

.tool-table :deep(table) {
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  box-sizing: border-box;
}

/* 高亮活跃工具行 */
.tool-table :deep(tr.active-tool-row) {
  background-color: rgba(64, 158, 255, 0.1) !important;
}

.tool-table :deep(tr.active-tool-row:hover) {
  background-color: rgba(64, 158, 255, 0.15) !important;
}

/* 暗色主题下的高亮样式 */
@media (prefers-color-scheme: dark) {
  .tool-table :deep(tr.active-tool-row) {
    background-color: rgba(64, 158, 255, 0.2) !important;
  }

  .tool-table :deep(tr.active-tool-row:hover) {
    background-color: rgba(64, 158, 255, 0.25) !important;
  }
}

.tool-detail {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: auto;

  border-radius: 12px;
  border: 1px solid;
  padding: 14px;
  box-sizing: border-box;

  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;
}

.tool-detail__title {
  margin: 0 0 12px 0;
  font-size: 16px;
  font-weight: 600;
  flex-shrink: 0;
}

.tool-detail__list {
  margin: 0;
  padding: 0;
  width: 100%;
  max-width: 100%;
  flex: 1;
  min-height: 0;
  box-sizing: border-box;
  border: 1px solid var(--el-border-color, #e5e7eb);
  border-radius: 8px;
  overflow: hidden;
  display: grid;
  grid-template-columns: 100px 1fr;
}

.tool-detail__label,
.tool-detail__value {
  margin: 0;
  padding: 8px 12px;
  font-size: 13px;
  line-height: 1.5;
  box-sizing: border-box;
  border-bottom: 1px solid var(--el-border-color-lighter, #f0f0f0);
}

.tool-detail__label {
  font-weight: 500;
  color: var(--el-text-color-regular, #606266);
  background-color: var(--el-fill-color-light, #f5f7fa);
}

.tool-detail__value {
  word-wrap: break-word;
  word-break: break-word;
  min-width: 0;
}

.tool-detail__list .tool-detail__label:last-of-type,
.tool-detail__list .tool-detail__value:last-of-type {
  border-bottom: none;
}

/* 确保工具详情内部的所有容器元素都不会溢出 */
.tool-detail :deep(div),
.tool-detail :deep(p),
.tool-detail :deep(span) {
  max-width: 100%;
  word-wrap: break-word;
  word-break: break-word;
}

.tool-detail.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100%;
}

.tag-group {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

/* 格式选择容器样式 */
.format-selection-container {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
