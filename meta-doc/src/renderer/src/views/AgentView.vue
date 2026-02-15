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
        <el-button type="primary" @click="workspace.openNewDocumentTab()">
          {{ t('common.create') }}
        </el-button>
      </div>
    </div>
    <!-- 否则显示正常的AgentView内容 -->
    <div v-else class="agent-view">
      <SessionList
        :title="t('agent.sessions.title')"
        :items="sessionListItems"
        :active-index="activeSessionId || ''"
        :disabled="isGenerating || workspace.uiLocked?.value"
        :create-button-tooltip="t('agent.sessions.new')"
        :rename-label="t('agent.sessions.rename')"
        :duplicate-label="t('agent.sessions.duplicate')"
        :delete-label="t('agent.sessions.delete')"
        :rename-dialog-title="t('agent.sessions.rename')"
        :rename-placeholder="t('agent.sessions.renamePlaceholder')"
        :cancel-label="t('common.cancel')"
        :confirm-label="t('common.confirm')"
        :show-duplicate="true"
        :group-by-date="true"
        @create="showCreateSessionDialog = true"
        @select="handleSessionListSelect"
        @rename="handleSessionListRename"
        @duplicate="handleSessionListDuplicate"
        @delete="handleSessionListDelete"
      >
        <template #sidebar-footer>
          <div class="sidebar-footer-content">
            <el-dropdown @command="handleManageCommand" style="flex-shrink: 0">
              <el-button size="small" type="info" :icon="Setting" circle />
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="tool-collection">{{
                    t('agent.manage.toolCollection.title')
                  }}</el-dropdown-item>
                  <el-dropdown-item command="workflow">{{
                    t('agent.manage.workflow.title')
                  }}</el-dropdown-item>
                  <el-dropdown-item command="agent-config">{{
                    t('agent.manage.agentConfig.title')
                  }}</el-dropdown-item>
                  <el-dropdown-item command="agent-engine">{{
                    t('agent.manage.agentEngine.title')
                  }}</el-dropdown-item>
                  <el-dropdown-item divided command="import-session">{{
                    t('agent.sessions.import')
                  }}</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-select
              v-model="selectedEngineId"
              :placeholder="t('agent.sessions.selectEngine')"
              size="small"
              filterable
              style="flex: 1; min-width: 0"
              :disabled="isGenerating || workspace.uiLocked?.value"
              @change="handleEngineChange"
            >
              <el-option
                v-for="engine in availableEngines"
                :key="engine.id"
                :label="getEngineLabel(engine)"
                :value="engine.id"
              >
                <div style="display: flex; align-items: center; justify-content: space-between">
                  <span>{{ getEngineLabel(engine) }}</span>
                  <el-tag v-if="engine.isBuiltIn" size="small" type="info" effect="plain">
                    {{ t('agent.manage.agentEngine.builtIn') }}
                  </el-tag>
                </div>
              </el-option>
            </el-select>
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
                <el-tag size="small" effect="plain">
                  {{ t('agent.conversation.messages', { count: messageCount }) }}
                </el-tag>
                <el-tooltip
                  :content="
                    showToolPane
                      ? t('agent.conversation.hideTools', '点击隐藏工具面板')
                      : t('agent.conversation.showTools', '点击显示工具面板')
                  "
                  placement="top"
                >
                  <el-tag
                    size="small"
                    effect="plain"
                    style="cursor: pointer"
                    @click="toggleToolPane"
                  >
                    {{ t('agent.conversation.tools', { count: activeToolCount }) }}
                  </el-tag>
                </el-tooltip>
                <el-tooltip
                  :content="t('agent.conversation.referencesTooltip', '点击管理引用')"
                  placement="top"
                >
                  <el-tag
                    size="small"
                    effect="plain"
                    style="cursor: pointer"
                    @click="handleOpenReferenceDialog"
                  >
                    {{ t('agent.conversation.references', { count: referenceCount }) }}
                  </el-tag>
                </el-tooltip>
                <el-dropdown @command="handleSessionAction" size="small">
                  <el-button text size="small" :icon="More" circle />
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="retry">{{
                        t('agent.sessions.retry')
                      }}</el-dropdown-item>
                      <el-dropdown-item command="export">{{
                        t('agent.sessions.export')
                      }}</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
            </header>

            <div v-if="activeSession" class="conversation-content">
              <el-scrollbar class="conversation-scroll">
                <AgentMessageRenderer
                  v-for="(message, index) in activeSession.messages"
                  :key="message.id"
                  :message="message"
                  :messages="activeSession.messages"
                  :message-index="index"
                  :user-name="'用户'"
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
              </el-scrollbar>
              <div class="composer-wrapper">
                <ReferenceDisplay
                  v-if="activeSession"
                  :references="activeSession.referenceStore || []"
                  :active-reference-ids="activeReferenceIds"
                  @toggle="handleToggleReference"
                />
                <ChatComposer
                  class="conversation-composer"
                  v-model="composerInput"
                  :loading="isGenerating"
                  :disabled="!activeSession"
                  :show-attach="true"
                  :show-voice="false"
                  :placeholder="t('aiChat.inputPlaceholder')"
                  :show-knowledge-base="false"
                  @submit="handleComposerSubmit"
                  @reset="handleComposerReset"
                  @attach="handleAttachFile"
                  @cancel="handleCancelGeneration"
                />
              </div>
            </div>
            <div v-else class="empty-placeholder">
              <el-empty :description="t('agent.conversation.none')" />
            </div>
          </section>

          <ResizableDivider
            v-if="showToolPane"
            direction="vertical"
            :size="5"
            @resize-start="handleToolPaneResizeStart"
            @resize="handleToolPaneResize"
            @resize-end="handleToolPaneResizeEnd"
          />
          <section
            v-if="showToolPane"
            class="tool-pane"
            :style="[panelStyle, { width: toolPaneWidth + 'px', flexShrink: 0 }]"
          >
            <header class="pane-header">
              <div class="tool-header-title">
                <h2>{{ t('agent.tools.title') }}</h2>
              </div>
              <!-- <div class="tool-legend">
            <el-tag size="small" type="info">{{ t('agent.tools.legend.available') }}</el-tag>
            <el-tag size="small" type="warning">{{ t('agent.tools.legend.running') }}</el-tag>
          </div> -->
            </header>
            <div class="tool-content">
              <el-card
                class="tool-panel tool-list-panel"
                shadow="never"
                :style="panelStyle"
                :body-style="{ padding: '0', height: '100%', overflow: 'hidden' }"
              >
                <el-scrollbar
                  class="tool-list-scroll"
                  :wrap-style="{ overflowX: 'hidden' }"
                  :view-style="{ width: '100%' }"
                >
                  <el-table
                    :data="tools"
                    border
                    height="100%"
                    row-key="id"
                    @row-click="selectTool"
                    :highlight-current-row="true"
                    :current-row-key="activeTool?.id"
                    :row-class-name="getToolRowClassName"
                    style="width: 100%; table-layout: fixed"
                  >
                    <el-table-column
                      :label="t('agent.tools.name')"
                      prop="name"
                      min-width="140"
                      show-overflow-tooltip
                    />
                    <el-table-column :label="t('agent.tools.state')" width="110">
                      <template #default="{ row }">
                        <el-tag v-if="row.running" type="warning" size="small">
                          {{ t('agent.tool.status.running') }}
                        </el-tag>
                        <el-tag
                          v-else-if="
                            activeSession?.activeToolIds &&
                            activeSession.activeToolIds.length > 0 &&
                            activeSession.activeToolIds.includes(row.id)
                          "
                          type="success"
                          size="small"
                        >
                          {{ t('agent.tools.enabled') }}
                        </el-tag>
                        <el-tag v-else size="small" type="info">
                          {{ t('agent.tools.available') }}
                        </el-tag>
                      </template>
                    </el-table-column>
                  </el-table>
                </el-scrollbar>
              </el-card>
              <el-scrollbar class="tool-detail-scroll" :wrap-style="{ overflowX: 'hidden' }">
                <div v-if="activeTool" class="tool-detail" :style="detailStyle">
                  <h3>{{ activeTool.name }}</h3>
                  <el-descriptions :column="1" size="small" border>
                    <el-descriptions-item :label="t('agent.tools.detail.name')">
                      {{ activeTool.name }}
                    </el-descriptions-item>
                    <el-descriptions-item :label="t('agent.tools.detail.description')">
                      <p>{{ activeTool.description }}</p>
                    </el-descriptions-item>
                    <el-descriptions-item :label="t('agent.tools.detail.origin')">
                      <el-tag size="small">{{
                        originLabel(activeTool.origin as ToolOrigin)
                      }}</el-tag>
                    </el-descriptions-item>
                    <el-descriptions-item
                      :label="t('agent.tools.detail.tags')"
                      v-if="activeTool.tags?.length"
                    >
                      <div class="tag-group">
                        <el-tag
                          v-for="tag in activeTool.tags"
                          :key="tag"
                          size="small"
                          effect="dark"
                        >
                          {{ tag }}
                        </el-tag>
                      </div>
                    </el-descriptions-item>
                  </el-descriptions>
                </div>
                <div v-else class="tool-detail placeholder" :style="detailStyle">
                  <el-empty :description="t('agent.tools.detail.placeholder')" />
                </div>
              </el-scrollbar>
            </div>
          </section>
        </div>
      </SessionList>
    </div>

    <!-- 创建会话对话框 -->
    <el-dialog
      v-model="showCreateSessionDialog"
      :title="t('agent.sessions.new')"
      width="80%"
      :style="dialogStyle"
    >
      <div style="height: 60vh; display: flex; flex-direction: column">
        <h3 style="margin: 0 0 16px 0; font-size: 14px; font-weight: 500; flex-shrink: 0">
          {{ t('agent.sessions.selectAgentConfig') }}
        </h3>
        <div style="flex: 1; min-height: 0">
          <CardGrid
            :items="availableAgentConfigs"
            :loading="false"
            :show-thumbnail="false"
            :show-actions="false"
            :get-item-id="(item) => item.id || ''"
            :get-item-title="
              (item) =>
                typeof item.name === 'string'
                  ? item.name
                  : item.name['zh_cn']?.name || item.id || ''
            "
            :get-item-description="
              (item) =>
                typeof item.description === 'string'
                  ? item.description
                  : item.description['zh_cn']?.description || ''
            "
            :get-item-meta="
              (item) => [
                t('agent.manage.agentConfig.toolCount') +
                  ': ' +
                  agentConfigManager.getAvailableToolIds(item.id || '').length,
                item.enabled !== false ? t('agent.manage.enabled') : t('agent.manage.disabled')
              ]
            "
            :get-badge="
              (item) =>
                item.id === 'default-agent-config' ? t('agent.manage.agentConfig.default') : null
            "
            :is-selected="(item) => item.id === selectedAgentConfigId"
            :is-disabled="() => false"
            @item-click="handleSelectAgentConfig"
            @item-double-click="handleDoubleClickAgentConfig"
          />
        </div>
      </div>
      <template #footer>
        <el-button @click="showCreateSessionDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button
          type="primary"
          @click="createSession(selectedAgentConfigId)"
          :disabled="!selectedAgentConfigId"
        >
          {{ t('common.create') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 管理界面对话框 -->
    <el-dialog
      v-model="showManageDialog"
      :title="
        manageDialogType === 'tool-collection'
          ? t('agent.manage.toolCollection.title')
          : manageDialogType === 'workflow'
            ? t('agent.manage.workflow.title')
            : manageDialogType === 'agent-engine'
              ? t('agent.manage.agentEngine.title')
              : t('agent.manage.agentConfig.title')
      "
      width="90%"
      :close-on-click-modal="false"
    >
      <ToolCollectionManager v-if="manageDialogType === 'tool-collection'" />
      <WorkflowManager v-else-if="manageDialogType === 'workflow'" />
      <AgentConfigManager v-else-if="manageDialogType === 'agent-config'" />
      <AgentEngineManager v-else-if="manageDialogType === 'agent-engine'" />
      <template #footer>
        <el-button @click="showManageDialog = false">{{ t('common.close') }}</el-button>
      </template>
    </el-dialog>

    <!-- 引用素材管理对话框 -->
    <el-dialog
      v-model="showReferenceDialog"
      :title="t('agent.reference.title')"
      width="800px"
      v-if="referenceSession"
      :body-style="{
        flex: '1',
        minHeight: '0',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        padding: '0'
      }"
      style="height: 80vh; display: flex; flex-direction: column"
    >
      <ReferenceManager :session="referenceSession" @update="handleReferenceUpdate" />
      <template #footer>
        <el-button @click="showReferenceDialog = false">{{ t('common.close') }}</el-button>
      </template>
    </el-dialog>

    <!-- 消息编辑对话框 -->
    <el-dialog
      v-model="showEditMessageDialog"
      :title="t('agent.message.editMessage')"
      width="600px"
    >
      <el-input
        v-model="editingMessageContent"
        type="textarea"
        :rows="10"
        :placeholder="t('agent.message.editPlaceholder')"
      />
      <template #footer>
        <el-button @click="showEditMessageDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="handleConfirmEditMessage">{{
          t('common.confirm')
        }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, reactive, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox, ElLoading } from 'element-plus'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { Plus, More, Setting } from '@element-plus/icons-vue'
import { themeState, mixColors } from '../utils/themes'
import AgentMessageRenderer from '../components/agent/AgentMessageRenderer.vue'
import ChatComposer from '../components/chat/ChatComposer.vue'
import ReferenceDisplay from '../components/agent/ReferenceDisplay.vue'
import type {
  AgentMessage,
  AgentSession,
  AgentTool,
  ChatAgentMessage,
  ToolOrigin
} from '../types/agent'
import { cloneDeep } from 'lodash'
import { useWorkspace, detectDocumentFormat } from '../stores/workspace'
import {
  agentConfigManager,
  agentSessionManager,
  agentEngineManager,
  AIContextManager
} from '../utils/agent-framework'
import { createRendererLogger } from '../utils/logger'
import { agentToolManager } from '../utils/agent-tool-manager'
import { recognizeIntent } from '../utils/agent-framework/intent-processor'
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
import ToolCollectionManager from '../components/agent/manage/ToolCollectionManager.vue'
import WorkflowManager from '../components/agent/manage/WorkflowManager.vue'
import AgentConfigManager from '../components/agent/manage/AgentConfigManager.vue'
import AgentEngineManager from '../components/agent/manage/AgentEngineManager.vue'
import ReferenceManager from '../components/agent/ReferenceManager.vue'
import CardGrid from '../components/common/CardGrid.vue'
import SessionList from '../components/common/SessionList.vue'
import type { SessionListItem } from '../components/common/SessionList.vue'
import ResizableDivider from '../components/base/ResizableDivider.vue'
import NewDocumentWorkspace from './NewDocumentWorkspace.vue'
import eventBus from '../utils/event-bus'
import type { Reference } from '../types/agent-framework'
dayjs.extend(relativeTime)

const { t } = useI18n()
const workspace = useWorkspace()
const {
  activeDocument,
  activeTabId,
  removeTab,
  moveTab,
  activateTab,
  updateDocumentAgentSessions,
  updateDocumentActiveAgentSessionId
} = workspace

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

const dialogStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

const agentViewStyle = computed(() => ({
  gridTemplateColumns: showToolPane.value ? '280px 1fr 360px' : '280px 1fr'
}))

const sampleTools: AgentTool[] = [
  {
    id: 'web-search',
    name: 'Web Search',
    description: '通过联网搜索最新信息，返回结构化摘要与引用。',
    origin: 'renderer',
    running: false,
    enabled: true,
    tags: ['search', 'internet'],
    lastUsed: dayjs().subtract(2, 'hour').toISOString()
  },
  {
    id: 'code-executor',
    name: 'Code Interpreter',
    description: '在安全沙箱运行代码，支持 Python 与 Node.js，生成图表与数据分析结果。',
    origin: 'main',
    running: true,
    enabled: true,
    tags: ['analysis', 'notebook'],
    lastUsed: dayjs().subtract(5, 'minute').toISOString()
  },
  {
    id: 'file-browser',
    name: 'File Browser',
    description: '浏览本地项目文件，并支持快速预览与生成摘要。',
    origin: 'renderer',
    running: false,
    enabled: false,
    tags: ['fs', 'project'],
    lastUsed: dayjs().subtract(1, 'day').toISOString()
  },
  {
    id: 'mcp-wordpress',
    name: 'WordPress MCP',
    description: '通过 MCP 协议与 WordPress 通讯，实现内容发布和评论管理。',
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
        name: agentToolManager.getLocalizedText(tool.config.name),
        description: agentToolManager.getLocalizedText(tool.config.description),
        origin:
          tool.config.origin === 'internal'
            ? 'renderer'
            : tool.config.origin === 'mcp'
              ? 'mcp'
              : 'main',
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
const sessionsState = ref<AgentSession[]>([])
const activeSessionId = ref<string | null>(null)
const activeToolId = ref<string | null>(null)
const syncingSessions = ref(false)
// 当前激活的引用ID列表（用于控制哪些引用会被发送给AI）
const activeReferenceIds = ref<string[]>([])
const shouldBootstrapDemoSessions = false // 不再使用示例会话
const demoAppliedDocs = new Set<string>()
const composerInput = ref('')
const openSessionMenuId = ref<string | null>(null)
// AgentView 不使用 RAG 功能（Agent tool 中已有知识库检索）
const showCreateSessionDialog = ref(false)
const showManageDialog = ref(false)
const manageDialogType = ref<
  'tool-collection' | 'workflow' | 'agent-config' | 'agent-engine' | null
>(null)
const availableAgentConfigs = ref(agentConfigManager.getAllConfigs())
const selectedAgentConfigId = ref<string>('')
const showReferenceDialog = ref(false)
const referenceSession = ref<AgentSession | null>(null)
const selectedEngineId = ref<string>('default-autogpt-engine')
const availableEngines = ref(agentEngineManager.getEnabledEngines())
const currentAiTaskHandle = ref<string | null>(null)
const aiTaskHandles = ref<Set<string>>(new Set()) // 保存所有AI任务的handle
const isGenerating = ref(false)
const showEditMessageDialog = ref(false)
const editingMessage = ref<ChatAgentMessage | null>(null)
const editingMessageContent = ref('')
const showToolPane = ref(false) // 默认隐藏工具面板
// 判断是否需要显示格式选择界面
const needsFormatSelection = computed(() => {
  const doc = activeDocument.value
  if (!doc) {
    // 没有活动文档，如果没有标签页，创建一个
    if (!activeTabId.value && workspace.tabs.length === 0) {
      workspace.openNewDocumentTab()
    }
    return true
  }

  // 检查文档格式是否已确定
  // 如果文档是新建的（kind === 'new'）且格式未确定（format为空或未设置），需要选择格式
  const tab = workspace.tabs.find((t) => t.id === doc.tabId)
  if (
    tab &&
    tab.kind === 'new' &&
    (!doc.format || (doc.markdown.trim().length === 0 && doc.tex.trim().length === 0))
  ) {
    return true
  }

  return false
})

const activeSession = computed(
  () => sessionsState.value.find((session) => session.id === activeSessionId.value) ?? null
)

// 初始化activeReferenceIds（当activeSession变化时）
watch(
  () => activeSession.value?.referenceStore,
  (newStore) => {
    if (newStore && newStore.length > 0) {
      // 获取所有引用ID，默认全部激活
      const allReferenceIds = newStore.map((ref) => ref.id)
      // 如果activeReferenceIds为空或者是新会话，则激活所有引用
      if (
        activeReferenceIds.value.length === 0 ||
        !activeReferenceIds.value.some((id) => allReferenceIds.includes(id))
      ) {
        activeReferenceIds.value = [...allReferenceIds]
      } else {
        // 否则，只保留仍然存在的引用ID
        activeReferenceIds.value = activeReferenceIds.value.filter((id) =>
          allReferenceIds.includes(id)
        )
      }
    } else {
      activeReferenceIds.value = []
    }
  },
  { immediate: true, deep: true }
)

const activeTool = computed(
  () => tools.value.find((tool) => tool.id === activeToolId.value) ?? null
)

const ensureActiveSessionId = () => {
  const list = sessionsState.value
  if (!list.length) {
    activeSessionId.value = null
    openSessionMenuId.value = null
    return
  }
  if (!list.some((session) => session.id === activeSessionId.value)) {
    activeSessionId.value = list[0].id
  }
}

const touchSession = (session: AgentSession) => {
  session.updatedAt = new Date().toISOString()
}

const applySessionsToDocument = (sessions: AgentSession[], skipDirtyCheck = false) => {
  const doc = activeDocument.value
  if (!doc) return
  syncingSessions.value = true
  updateDocumentAgentSessions(doc.tabId, cloneDeep(sessions), skipDirtyCheck)
  nextTick(() => {
    syncingSessions.value = false
  })
}

const persistSessions = () => {
  if (!activeDocument.value) return
  applySessionsToDocument(sessionsState.value, false)
}

watch(
  () => activeDocument.value?.agentSessions,
  (sessions) => {
    const doc = activeDocument.value
    if (!doc) {
      sessionsState.value = []
      activeSessionId.value = null
      return
    }
    if (syncingSessions.value) {
      syncingSessions.value = false
      return
    }

    // 关键：如果在流式输出期间，不要更新sessionsState，避免破坏reactive对象
    if (isGenerating.value) {
      const logger = createRendererLogger('AgentView')
      logger.debug('[watch agentSessions] 正在生成中，跳过会话更新以避免破坏reactive对象')
      return
    }

    let source = Array.isArray(sessions) ? cloneDeep(sessions as AgentSession[]) : []

    // 如果没有会话，创建默认会话
    if (!source.length) {
      try {
        const defaultConfigId = 'default-agent-config'
        const defaultSession = agentSessionManager.createSession(
          defaultConfigId,
          t('agent.sessions.defaultTitle'),
          ''
        )

        // 获取当前文档信息并设置到publicContext
        const doc = activeDocument.value
        if (doc) {
          // 确保文档格式已设置（如果未设置，默认为md）
          const docFormat = doc.format || 'md'
          defaultSession.publicContext = defaultSession.publicContext || {}
          defaultSession.publicContext.document = {
            id: activeTabId.value || '',
            path: doc.path || '',
            format: docFormat as 'md' | 'tex',
            title: doc.meta?.title || ''
          }
        }

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
          referenceStore: defaultSession.referenceStore || [],
          publicContext: defaultSession.publicContext || {},
          executionNodes: defaultSession.executionNodes || [],
          status: defaultSession.status || 'idle'
        }

        source = [legacySession]
        sessionsState.value = source
        ensureActiveSessionId()

        // 创建默认会话时不触发dirty状态
        applySessionsToDocument(source, true)
        return
      } catch (error) {
        console.error('创建默认会话失败:', error)
      }
    }

    sessionsState.value = source
    // 恢复迁移/保存的当前会话（文档 activeAgentSessionId）
    const savedId = doc.activeAgentSessionId
    if (savedId && source.some((s: AgentSession) => s.id === savedId)) {
      activeSessionId.value = savedId
    } else {
      ensureActiveSessionId()
    }
    openSessionMenuId.value = null

    // 如果有会话变更，持久化
    if (source.length > 0) {
      applySessionsToDocument(source)
    }
  },
  { immediate: true, deep: true }
)

watch(
  () => activeSessionId.value,
  (newId) => {
    activeToolId.value = null
    composerInput.value = ''
    openSessionMenuId.value = null
    if (activeTabId.value && newId) {
      updateDocumentActiveAgentSessionId(activeTabId.value, newId)
    }
    // 切换会话时，重置激活的引用ID列表，默认激活所有引用
    if (activeSession.value?.referenceStore) {
      activeReferenceIds.value = activeSession.value.referenceStore.map((ref) => ref.id)
    } else {
      activeReferenceIds.value = []
    }
  }
)

// 监听referenceStore变化，自动激活新添加的引用
watch(
  () => activeSession.value?.referenceStore,
  (newStore) => {
    if (newStore && newStore.length > 0) {
      // 获取所有引用ID
      const allReferenceIds = newStore.map((ref) => ref.id)
      // 合并到activeReferenceIds，保留已激活的引用
      activeReferenceIds.value = [...new Set([...activeReferenceIds.value, ...allReferenceIds])]
    }
  },
  { deep: true }
)

// 监听文档格式变化，同步更新所有会话的publicContext
watch(
  [() => activeDocument.value?.format, () => activeTabId.value],
  ([newFormat, newTabId]) => {
    if (!newFormat || !newTabId) return

    // 更新所有会话的publicContext中的文档格式信息
    sessionsState.value.forEach((session) => {
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
  [allTasks, () => activeSession.value?.id, isGenerating],
  ([tasks, sessionId, generating]) => {
    // 清除之前的定时器
    if (unlockCheckTimer) {
      clearTimeout(unlockCheckTimer)
      unlockCheckTimer = null
    }

    // 只有在生成中时才检查
    if (!generating || !sessionId) {
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
            (task.status.value === '已完成' ||
              task.status.value === '失败' ||
              task.status.value === '取消')
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
            (currentTask.status.value === '已完成' ||
              currentTask.status.value === '失败' ||
              currentTask.status.value === '取消')
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
const referenceCount = computed(() => activeSession.value?.referenceStore?.length ?? 0)

// 工具选择功能已移除，工具列表现在为只读模式

const formatRelativeTime = (timestamp: string) => dayjs(timestamp).fromNow()

const createSession = (agentConfigId?: string) => {
  if (!agentConfigId) {
    showCreateSessionDialog.value = true
    return
  }

  try {
    const session = agentSessionManager.createSession(
      agentConfigId,
      t('agent.sessions.newTitle', { index: sessionsState.value.length + 1 }),
      ''
    )

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
      referenceStore: session.referenceStore || [],
      publicContext: session.publicContext || {},
      executionNodes: session.executionNodes || [],
      status: session.status || 'idle'
    }

    sessionsState.value.unshift(legacySession)
    ensureActiveSessionId()
    activeSessionId.value = session.id
    persistSessions()
    showCreateSessionDialog.value = false
    selectedAgentConfigId.value = ''
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  }
}

const deleteSession = async (session?: AgentSession) => {
  const target = session ?? activeSession.value
  if (!target) return

  // 如果删除后没有会话了，不允许删除（需要至少保留一个）
  if (sessionsState.value.length <= 1) {
    ElMessage.warning(t('agent.sessions.atLeastOneRequired'))
    return
  }

  try {
    await ElMessageBox.confirm(
      t('agent.sessions.confirmDelete', { title: target.title }),
      t('agent.sessions.delete'),
      { type: 'warning' }
    )
    sessionsState.value = sessionsState.value.filter((item) => item.id !== target.id)
    ensureActiveSessionId()
    persistSessions()
    ElMessage.success(t('agent.sessions.deleteSuccess'))

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
    const defaultConfigId = 'default-agent-config'
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
      referenceStore: defaultSession.referenceStore || [],
      publicContext: defaultSession.publicContext || {},
      executionNodes: defaultSession.executionNodes || [],
      status: defaultSession.status || 'idle'
    }

    sessionsState.value = [legacySession]
    ensureActiveSessionId()
    activeSessionId.value = legacySession.id
    // 创建默认会话时不触发dirty状态
    applySessionsToDocument([legacySession], true)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  }
}

const renameSession = async (session: AgentSession) => {
  const { value } = await ElMessageBox.prompt(
    t('agent.sessions.renamePlaceholder'),
    t('agent.sessions.rename'),
    {
      inputValue: session.title,
      inputValidator: (val: string) => !!val.trim() || t('agent.sessions.renameRequired')
    }
  )
  session.title = value.trim()
  touchSession(session)
  persistSessions()
  ElMessage.success(t('agent.sessions.renameSuccess'))
}

// 工具选择功能已移除，工具列表现在为只读模式（显示当前会话可用的工具）
const selectTool = (tool: AgentTool) => {
  activeToolId.value = tool.id
}

// 获取工具行的CSS类名（用于高亮活跃工具）
// 只有在意图识别器选中工具后才高亮（activeToolIds 不为空且包含该工具）
const getToolRowClassName = ({ row }: { row: AgentTool }) => {
  if (
    activeSession.value?.activeToolIds &&
    activeSession.value.activeToolIds.length > 0 &&
    activeSession.value.activeToolIds.includes(row.id)
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

const handleComposerSubmit = async () => {
  const logger = createRendererLogger('AgentView')
  logger.debug('[handleComposerSubmit] 开始处理用户消息提交')

  // 在提交消息前检查文档格式
  if (needsFormatSelection.value) {
    // 格式未选择，不处理消息
    return
  }

  const session = activeSession.value
  if (!session) {
    logger.warn('[handleComposerSubmit] 没有活动的会话')
    return
  }

  const content = composerInput.value.trim()
  if (!content) {
    logger.warn('[handleComposerSubmit] 消息内容为空')
    return
  }

  logger.debug(`[handleComposerSubmit] 用户消息内容: ${content.substring(0, 50)}...`)

  // 清空之前的活跃工具（用户发送新消息时，等待意图识别结果）
  if (session.activeToolIds) {
    session.activeToolIds = []
    logger.debug('[handleComposerSubmit] 已清空activeToolIds，等待意图识别结果')
  }

  // 创建用户消息，保存当前激活的引用ID
  const message = createChatMessage('user', content, [...activeReferenceIds.value])
  session.messages.push(message)
  logger.debug(
    `[handleComposerSubmit] 用户消息已添加，ID: ${message.id}, 当前消息数量: ${session.messages.length}`
  )

  composerInput.value = ''
  touchSession(session)

  // AgentView 不使用 RAG 功能（Agent tool 中已有知识库检索）
  const shouldQueryKnowledgeBase = false

  // 注意：不要在创建消息后立即持久化，因为会破坏reactive对象的响应式
  // 只在用户消息创建时持久化一次（延迟持久化，不影响响应式）
  nextTick(() => {
    persistSessions()
  })

  // 滚动到底部
  nextTick(() => {
    const container = document.querySelector('.conversation-scroll .el-scrollbar__wrap')
    if (container) {
      container.scrollTop = container.scrollHeight
    }
  })

  // 执行Agent引擎
  try {
    const engineId = selectedEngineId.value || 'default-autogpt-engine'
    const engine = agentEngineManager.getEngine(engineId)
    logger.debug(`[handleComposerSubmit] 选择的引擎: ${engineId}, 引擎类型: ${engine?.engineType}`)

    // 对于SimpleChat引擎，在用户消息发送后立即创建空的assistant消息气泡
    if (engine?.engineType === 'simple-chat') {
      logger.debug('[handleComposerSubmit] 使用simple-chat引擎，准备创建流式输出消息气泡')

      // 创建空的assistant消息，使用reactive确保响应式更新
      const assistantMessage: ChatAgentMessage = reactive({
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'assistant',
        type: 'chat',
        timestamp: new Date().toISOString(),
        markdown: ''
      }) as ChatAgentMessage

      logger.debug(
        `[handleComposerSubmit] 创建了reactive assistantMessage, ID: ${assistantMessage.id}`
      )

      // 关键：确保直接操作sessionsState中的session，而不是computed返回的session
      // 因为computed返回的是新对象，直接操作它可能不会触发响应式更新
      const sessionIndex = sessionsState.value.findIndex((s) => s.id === session.id)
      if (sessionIndex === -1) {
        logger.error('[handleComposerSubmit] 找不到session在sessionsState中的索引')
        return
      }

      // 直接操作sessionsState中的session，确保响应式更新
      const actualSession = sessionsState.value[sessionIndex]
      actualSession.messages.push(assistantMessage)
      logger.debug(
        `[handleComposerSubmit] assistantMessage已添加到actualSession.messages, 当前消息数量: ${actualSession.messages.length}`
      )

      touchSession(actualSession)

      // 等待Vue完成响应式更新
      await nextTick()
      logger.debug('[handleComposerSubmit] nextTick完成，准备执行引擎')

      // 执行引擎，传入assistantMessage
      // 注意：使用actualSession而不是computed的session，确保响应式更新
      // 注意：SimpleChat引擎现在使用LlmAdapter.callChatViaTask，它会直接更新assistantMessage.markdown
      await executeAgentEngine(
        content,
        undefined,
        undefined,
        assistantMessage,
        actualSession,
        shouldQueryKnowledgeBase
      )

      logger.debug('[handleComposerSubmit] 引擎执行完成')
    } else {
      logger.debug('[handleComposerSubmit] 使用其他引擎类型')
      await executeAgentEngine(
        content,
        undefined,
        undefined,
        undefined,
        undefined,
        shouldQueryKnowledgeBase
      )
    }
  } catch (error) {
    logger.error('[handleComposerSubmit] 执行失败:', error)
    ElMessage.error(error instanceof Error ? error.message : String(error))
  }
}

// 执行Agent引擎
const executeAgentEngine = async (
  userMessage: string,
  assistantMessageRef?: Ref<string>, // 保留参数以保持兼容性，但SimpleChat引擎不再使用
  stopWatcher?: (() => void) | null, // 保留参数以保持兼容性，但SimpleChat引擎不再使用
  assistantMessage?: ChatAgentMessage,
  actualSession?: AgentSession,
  shouldQueryKnowledgeBase: boolean = false
) => {
  // 重要：在函数开始时就立即锁定UI并设置生成状态
  // 这样可以防止用户在异步验证之前发送新消息或切换会话
  workspace.lockUI?.()
  isGenerating.value = true

  // 使用传入的actualSession，如果没有则使用computed的session
  const session = actualSession || activeSession.value
  if (!session || !session.agentConfigId) {
    ElMessage.warning(t('agent.sessions.noAgentConfig'))
    // 确保状态正确，即使早期返回
    isGenerating.value = false
    workspace.unlockUI?.()
    return
  }

  const engineId = selectedEngineId.value || 'default-autogpt-engine'
  const engine = agentEngineManager.getEngine(engineId)
  if (!engine) {
    ElMessage.error(t('agent.sessions.engineNotFound'))
    // 确保状态正确，即使早期返回
    isGenerating.value = false
    workspace.unlockUI?.()
    return
  }

  const agentConfig = agentConfigManager.getConfig(session.agentConfigId)
  if (!agentConfig) {
    ElMessage.error(t('agent.sessions.agentConfigNotFound'))
    // 确保状态正确，即使早期返回
    isGenerating.value = false
    workspace.unlockUI?.()
    return
  }

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

  // 注意：UI锁和isGenerating状态已经在函数开始时设置（第1167-1168行）
  // 这里不需要重复设置

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
          nextTick(() => {
            const container = document.querySelector('.conversation-scroll .el-scrollbar__wrap')
            if (container) {
              container.scrollTop = container.scrollHeight
            }
          })
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
          userMessage,
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

      // 构建上下文消息，只包含激活的引用
      // 从用户消息中获取referenceIds（如果有），否则使用当前激活的引用
      const lastUserMessage = session.messages
        .filter((m) => m.role === 'user' && m.type === 'chat')
        .slice(-1)[0] as ChatAgentMessage | undefined
      const messageReferenceIds = lastUserMessage?.referenceIds || activeReferenceIds.value
      const contextMessages = AIContextManager.buildMessages(session, agentConfig, {
        activeReferenceIds: messageReferenceIds
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

      // 创建工具调用队列（用于执行检测到的工具调用）
      const { ToolCallQueue } = await import('../utils/agent-framework/tool-call-queue')
      const toolCallQueue = new ToolCallQueue(session as any, agentConfig)

      // 创建工具调用检测回调
      const onToolCallsDetected = async (
        toolCalls: Array<{ id: string; tool_id: string; parameters: Record<string, unknown> }>
      ) => {
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
        taskName: 'Agent对话',
        originKey,
        reactiveMessage: assistantMessage,
        onTaskCreated: (handle: string) => {
          currentAiTaskHandle.value = handle
          aiTaskHandles.value.add(handle)
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
      nextTick(() => {
        const container = document.querySelector('.conversation-scroll .el-scrollbar__wrap')
        if (container) {
          container.scrollTop = container.scrollHeight
        }
      })
    } catch (error) {
      const logger = createRendererLogger('AgentView')

      // 检查是否是用户取消的任务
      const isCancelled =
        error instanceof Error &&
        (error.message === '任务已取消' ||
          error.message.includes('任务已取消') ||
          error.name === 'AbortError')

      if (isCancelled) {
        // 用户手动取消，不记录为错误，只更新消息内容
        logger.debug('Agent引擎任务已取消')
        session.status = 'idle'
        // 注意：LlmAdapter.callChatViaTask已经通过reactiveMessage更新了markdown
        persistSessions()
        // 不抛出错误，正常返回
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
        AIContextManager.addAssistantMessage(session, `执行失败: ${errorMessage}`)
        persistSessions()
      }

      throw error
    } finally {
      // 清理watch监听器
      if (stopWatcher) {
        stopWatcher()
      }
      // 清理handle
      if (currentAiTaskHandle.value) {
        aiTaskHandles.value.delete(currentAiTaskHandle.value)
      }
      currentAiTaskHandle.value = null
      isGenerating.value = false
      workspace.unlockUI?.()
    }
  } else {
    // 对于其他引擎，使用现有的执行器逻辑
    try {
      const { AgentEngineExecutorFactory } = await import(
        '../utils/agent-framework/agent-engine-executor'
      )
      const executor = AgentEngineExecutorFactory.create(engine, session, agentConfig, {
        signal: abortController.signal,
        onProgress: (progress) => {
          session.status = progress.stage as any
          persistSessions()
        },
        onTaskCreated: (handle: string) => {
          // 保存所有AI任务的handle，以便取消
          aiTaskHandles.value.add(handle)
        }
      })

      await executor.execute(userMessage)

      session.status = 'idle'
      persistSessions()

      // 滚动到底部
      nextTick(() => {
        const container = document.querySelector('.conversation-scroll .el-scrollbar__wrap')
        if (container) {
          container.scrollTop = container.scrollHeight
        }
      })
    } catch (error) {
      const logger = createRendererLogger('AgentView')

      // 检查是否是用户取消的任务
      const isCancelled =
        error instanceof Error &&
        (error.message === '任务已取消' ||
          error.message.includes('任务已取消') ||
          error.name === 'AbortError')

      if (isCancelled) {
        // 用户手动取消，不记录为错误
        logger.debug('Agent引擎任务已取消')
        session.status = 'idle'
        persistSessions()
        // 不抛出错误，正常返回
        return
      }

      // 真正的错误才记录
      logger.error('Agent引擎执行失败:', error)
      session.status = 'error'
      persistSessions()

      const errorMessage = error instanceof Error ? error.message : String(error)
      AIContextManager.addAssistantMessage(session, `执行失败: ${errorMessage}`)
      persistSessions()

      throw error
    } finally {
      // 清理handle
      if (currentAiTaskHandle.value) {
        aiTaskHandles.value.delete(currentAiTaskHandle.value)
      }
      currentAiTaskHandle.value = null
      isGenerating.value = false
      workspace.unlockUI?.()
    }
  }
}

const handleComposerReset = () => {
  composerInput.value = ''
}

// 切换引用激活状态
const handleToggleReference = (referenceId: string) => {
  const index = activeReferenceIds.value.indexOf(referenceId)
  if (index > -1) {
    activeReferenceIds.value.splice(index, 1)
  } else {
    activeReferenceIds.value.push(referenceId)
  }
}

const handleAttachFile = async (fileOrFiles?: File | File[]) => {
  if (!activeSession.value) {
    return
  }

  try {
    const { processFileUpload, processUrlReference } = await import(
      '../utils/agent-framework/reference-processor'
    )

    // 检查输入框中是否是URL（用户可能粘贴了URL）
    const inputText = composerInput.value.trim()
    const isUrl = /^https?:\/\//.test(inputText)

    const files = Array.isArray(fileOrFiles) ? fileOrFiles : fileOrFiles ? [fileOrFiles] : []

    if (isUrl && files.length === 0) {
      // 处理URL（用户输入了URL但没有选择文件）
      const reference = await processUrlReference(inputText)
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
      ElMessage.success(t('agent.reference.addSuccess'))
      persistSessions()
    } else if (files.length > 0) {
      // 批量处理文件上传
      const loading = ElLoading.service({
        lock: true,
        text: files.length > 1 ? `正在处理 ${files.length} 个文件...` : '正在处理文件...',
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
                ? `正在处理文件 ${i + 1}/${files.length}: ${file.name}`
                : `正在处理: ${file.name}`
            )
            const reference = await processFileUpload(file)
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
            ElMessage.success(
              files.length > 1 ? `成功添加 ${successCount} 个引用` : t('agent.reference.addSuccess')
            )
          } else {
            ElMessage.warning(`成功添加 ${successCount} 个引用，${failCount} 个失败`)
          }
        } else {
          ElMessage.error('所有文件处理失败')
        }
      } finally {
        loading.close()
      }
    } else {
      // 既没有文件也没有URL
      return
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  }
}

const handleCancelGeneration = () => {
  const session = activeSession.value
  if (!session) {
    return
  }

  // 获取所有AI任务
  const allTasks = useAiTasks()

  // 根据session.id找到所有相关的任务（通过origin_key前缀匹配）
  const sessionPrefix = `agent-${session.id}-`
  const relatedTasks = allTasks.value.filter(
    (task) => task.origin_key && task.origin_key.startsWith(sessionPrefix)
  )

  // 取消所有相关的任务
  relatedTasks.forEach((task) => {
    cancelAiTask(task.handle, false)
  })

  // 取消所有由Agent发起的AI任务（通过handle集合）
  if (aiTaskHandles.value.size > 0) {
    const handlesToCancel = Array.from(aiTaskHandles.value)
    handlesToCancel.forEach((handle) => {
      cancelAiTask(handle, false)
    })
    aiTaskHandles.value.clear()
  }

  // 同时取消当前任务（如果有）
  if (currentAiTaskHandle.value) {
    cancelAiTask(currentAiTaskHandle.value, false)
    currentAiTaskHandle.value = null
  }

  isGenerating.value = false
  workspace.unlockUI?.()

  session.status = 'idle'
  persistSessions()
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
    ElMessage.warning(t('agent.sessions.noExecutionNode'))
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
        ElMessage.success(t('agent.sessions.retrySuccess'))
      }
    } else {
      ElMessage.warning(t('agent.sessions.noExecutionNode'))
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
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

    sessionsState.value.unshift(legacySession)
    ensureActiveSessionId()
    activeSessionId.value = duplicated.id
    persistSessions()
    ElMessage.success(t('agent.sessions.duplicateSuccess'))
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
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

    const serialized = agentSessionManager.serializeSession(newFormatSession, true)
    const json = JSON.stringify(serialized, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `agent-session-${session.id}.json`
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success(t('agent.sessions.exportSuccess'))
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  }
}

const handleImportSession = () => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'application/json'
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const data = JSON.parse(text)

      const session = agentSessionManager.deserializeSession(data, {
        importDependencies: true,
        overwriteDependencies: false
      })

      // 转换为旧格式
      const legacySession: AgentSession = {
        id: session.id,
        title: session.title,
        description: session.description,
        createdAt: new Date(session.createdAt).toISOString(),
        updatedAt: new Date(session.updatedAt).toISOString(),
        messages: session.messages,
        activeToolIds: [], // 初始状态：所有工具都不高亮，等待意图识别器判断
        agentConfigId: session.agentConfigId,
        messageQueue: session.messageQueue,
        referenceStore: session.referenceStore,
        publicContext: session.publicContext,
        executionNodes: session.executionNodes,
        status: session.status
      }

      sessionsState.value.unshift(legacySession)
      ensureActiveSessionId()
      activeSessionId.value = session.id
      persistSessions()
      ElMessage.success(t('agent.sessions.importSuccess'))
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : String(error))
    }
  }
  input.click()
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
  if (command === 'import-session') {
    handleImportSession()
  } else {
    manageDialogType.value = command as any
    showManageDialog.value = true
    // 如果是打开引擎管理，刷新引擎列表
    if (command === 'agent-engine') {
      availableEngines.value = agentEngineManager.getEnabledEngines()
    }
  }
}

const getEngineLabel = (engine: any) => {
  if (typeof engine.name === 'string') {
    return engine.name
  }
  return engine.name['zh_cn']?.name || engine.name['en_us']?.name || engine.id
}

const handleEngineChange = () => {
  // 引擎切换逻辑，后续在Agent执行时使用
  ElMessage.success(
    t('agent.sessions.engineChanged', {
      engine: getEngineLabel(agentEngineManager.getEngine(selectedEngineId.value)!)
    })
  )
}

// === SessionList 集成 ===
const sessionListItems = computed<SessionListItem[]>(() =>
  sessionsState.value.map((session) => ({
    id: session.id,
    title: session.title,
    updatedAt: session.updatedAt || session.createdAt || new Date().toISOString()
  }))
)

const handleSessionListSelect = (item: SessionListItem) => {
  activeSessionId.value = item.id
  openSessionMenuId.value = null
  if (activeTabId.value) {
    updateDocumentActiveAgentSessionId(activeTabId.value, item.id)
  }
}

const handleSessionListRename = (item: SessionListItem, newTitle: string) => {
  const session = sessionsState.value.find((s) => s.id === item.id)
  if (session) {
    session.title = newTitle
    touchSession(session)
    persistSessions()
    ElMessage.success(t('agent.sessions.renameSuccess'))
  }
}

const handleSessionListDuplicate = (item: SessionListItem) => {
  const session = sessionsState.value.find((s) => s.id === item.id)
  if (session) {
    handleDuplicateSession(session)
  }
}

const handleSessionListDelete = (item: SessionListItem) => {
  // SessionList 已经显示了确认对话框，直接删除即可
  const session = sessionsState.value.find((s) => s.id === item.id)
  if (!session) return

  if (sessionsState.value.length <= 1) {
    ElMessage.warning(t('agent.sessions.atLeastOneRequired'))
    return
  }

  sessionsState.value = sessionsState.value.filter((s) => s.id !== session.id)
  ensureActiveSessionId()
  persistSessions()
  ElMessage.success(t('agent.sessions.deleteSuccess'))

  if (sessionsState.value.length === 0) {
    createDefaultSession()
  }
}

// 对话头部的会话操作（retry / export）
const handleSessionAction = (command: string) => {
  const session = activeSession.value
  if (!session) return
  if (command === 'retry') {
    handleRetrySession(session)
  } else if (command === 'export') {
    handleExportSession(session)
  }
}

// === ResizableDivider 工具面板宽度 ===
const TOOL_PANE_WIDTH_KEY = 'agent-view-tool-pane-width'
const DEFAULT_TOOL_PANE_WIDTH = 360
const MIN_TOOL_PANE_WIDTH = 240
const MAX_TOOL_PANE_WIDTH = 600
const toolPaneWidth = ref(
  parseInt(localStorage.getItem(TOOL_PANE_WIDTH_KEY) || String(DEFAULT_TOOL_PANE_WIDTH))
)
let toolPaneWidthAtStart = DEFAULT_TOOL_PANE_WIDTH

const handleToolPaneResizeStart = () => {
  toolPaneWidthAtStart = toolPaneWidth.value
}

const handleToolPaneResize = (delta: number) => {
  // delta > 0 = 向右拖动 → 工具面板缩小; delta < 0 = 向左拖动 → 工具面板放大
  const newWidth = Math.max(
    MIN_TOOL_PANE_WIDTH,
    Math.min(MAX_TOOL_PANE_WIDTH, toolPaneWidthAtStart - delta)
  )
  toolPaneWidth.value = newWidth
}

const handleToolPaneResizeEnd = () => {
  localStorage.setItem(TOOL_PANE_WIDTH_KEY, String(toolPaneWidth.value))
}

const handleDocumentClick = () => {
  openSessionMenuId.value = null
}

const toggleToolPane = () => {
  showToolPane.value = !showToolPane.value
}

const handleSelectAgentConfig = (config: any) => {
  selectedAgentConfigId.value = config.id
}

const handleDoubleClickAgentConfig = (config: any) => {
  selectedAgentConfigId.value = config.id
  // 双击时直接创建会话
  createSession(config.id)
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

  const content = editingMessageContent.value.trim()
  if (!content) {
    ElMessage.warning(t('agent.message.editPlaceholder'))
    return
  }

  // 找到消息并更新
  const session = activeSession.value
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
    ElMessage.success(t('agent.message.editSuccess'))
    showEditMessageDialog.value = false
    editingMessage.value = null
    editingMessageContent.value = ''

    // 重新触发AI生成（AgentView 不使用 RAG 功能）
    await executeAgentEngine(content, undefined, undefined, undefined, undefined, false)
  }
}

const handleMessageRegenerate = async (message: AgentMessage) => {
  if (!activeSession.value) {
    return
  }

  // 找到消息在会话中的位置
  const session = activeSession.value
  const messageIndex = session.messages.findIndex((m) => m.id === message.id)
  if (messageIndex === -1) {
    return
  }

  // 如果是用户消息，重新触发AI生成
  if (message.role === 'user' && message.type === 'chat') {
    const userMessage = message as ChatAgentMessage
    // 删除此消息之后的所有消息
    session.messages = session.messages.slice(0, messageIndex + 1)
    touchSession(session)
    persistSessions()

    // 重新执行AI生成（AgentView 不使用 RAG 功能）
    await executeAgentEngine(
      userMessage.markdown,
      undefined,
      undefined,
      undefined,
      undefined,
      false
    )
  }
  // 如果是AI消息，重新生成回复
  else if (message.role === 'assistant' && message.type === 'chat') {
    // 找到此AI消息的上一个消息节点（可能是用户消息，也可能是其他AI消息）
    if (messageIndex === 0) {
      // 这是第一条消息，无法重新生成
      return
    }

    const previousMessageIndex = messageIndex - 1
    const previousMessage = session.messages[previousMessageIndex]

    // 删除从上一个消息节点之后的所有消息（包括当前AI消息）
    // 这样Agent会基于保留的消息历史重新生成
    session.messages = session.messages.slice(0, previousMessageIndex + 1)

    // 重要：清理所有保留消息中未完成的tool_calls
    // OpenAI API要求：如果assistant消息有tool_calls，必须紧接着有对应的tool消息
    // 由于我们删除了后续消息，如果某个assistant消息有tool_calls但对应的tool消息被删除了，
    // 需要清理这些tool_calls避免LLM API报错
    // 遍历所有保留的消息，检查是否有未完成的tool_calls
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

    // 清理所有未完成的tool_calls（有tool_call_id但没有对应tool消息的）
    if (toolCallIds.size > 0) {
      for (let i = 0; i < session.messages.length; i++) {
        const msg = session.messages[i]
        if (msg.role === 'assistant' && msg.type === 'chat') {
          const assistantMsg = msg as ChatAgentMessage
          const toolCalls = (assistantMsg as any).tool_calls
          if (toolCalls && Array.isArray(toolCalls) && toolCalls.length > 0) {
            // 检查是否有未完成的tool_calls
            const hasUnfinishedToolCalls = toolCalls.some(
              (tc: any) => tc.id && toolCallIds.has(tc.id)
            )
            if (hasUnfinishedToolCalls) {
              // 如果所有tool_calls都未完成，删除整个tool_calls
              // 如果部分完成，只保留已完成的（但这种情况不应该发生，因为tool消息应该在assistant消息之后）
              // 为了安全，如果发现任何未完成的tool_calls，就删除整个tool_calls
              delete (assistantMsg as any).tool_calls
            }
          }
        }
      }
    }

    touchSession(session)
    persistSessions()

    // 如果上一个消息是用户消息，直接重新执行AI生成
    if (previousMessage.role === 'user' && previousMessage.type === 'chat') {
      const userMessage = previousMessage as ChatAgentMessage
      await executeAgentEngine(userMessage.markdown)
    }
    // 如果上一个消息也是AI消息，需要找到触发这个AI消息链的用户消息
    // 因为Agent是基于整个消息历史生成的，需要从用户消息开始重新执行
    else if (previousMessage.role === 'assistant' && previousMessage.type === 'chat') {
      // 向上查找，找到最后一个用户消息
      let lastUserMessageIndex = -1
      for (let i = previousMessageIndex - 1; i >= 0; i--) {
        if (session.messages[i].role === 'user' && session.messages[i].type === 'chat') {
          lastUserMessageIndex = i
          break
        }
      }

      if (lastUserMessageIndex === -1) {
        // 没有找到用户消息，无法重新生成
        return
      }

      // 重新执行AI生成（从用户消息开始，Agent会基于整个消息历史继续生成）
      // AgentView 不使用 RAG 功能（Agent tool 中已有知识库检索）
      const userMessage = session.messages[lastUserMessageIndex] as ChatAgentMessage
      await executeAgentEngine(
        userMessage.markdown,
        undefined,
        undefined,
        undefined,
        undefined,
        false
      )
    } else {
      // 上一个消息是tool消息或其他类型，无法重新生成
      return
    }
  }
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

    sessionsState.value.unshift(legacySession)
    ensureActiveSessionId()
    activeSessionId.value = duplicated.id
    persistSessions()
    ElMessage.success(t('agent.sessions.duplicateSuccess'))
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  }
}

const handleMessageDelete = async (message: AgentMessage) => {
  if (!activeSession.value) {
    return
  }

  try {
    await ElMessageBox.confirm(t('agent.message.confirmDelete'), t('agent.message.delete'), {
      type: 'warning'
    })

    const session = activeSession.value
    const messageIndex = session.messages.findIndex((m) => m.id === message.id)
    if (messageIndex !== -1) {
      // 删除这条消息及其之后的所有消息
      session.messages = session.messages.slice(0, messageIndex)
      touchSession(session)
      persistSessions()
      ElMessage.success(t('agent.message.deleteSuccess'))
    }
  } catch {
    // canceled
  }
}

onMounted(() => {
  document.addEventListener('click', handleDocumentClick)

  // 初始化引擎选择器
  const defaultEngine = agentEngineManager.getDefaultEngine()
  if (defaultEngine) {
    selectedEngineId.value = defaultEngine.id
  }
  availableEngines.value = agentEngineManager.getEnabledEngines()
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

/* sidebar-footer 区域（管理按钮 + 引擎选择器） */
.sidebar-footer-content {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid var(--el-border-color-lighter);
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

.conversation-scroll :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
}

.conversation-scroll :deep(.el-scrollbar__view) {
  width: 100%;
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

.composer-wrapper {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
  padding: 0 8px;
  gap: 8px;
}

.composer-wrapper > * {
  pointer-events: auto;
}

.conversation-composer {
  pointer-events: auto;
  width: 100%;
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

.tool-panel :deep(.el-card__body) {
  display: flex;
  flex: 1;
  flex-direction: column;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  overflow: hidden;
}

.tool-list-scroll,
.tool-detail-scroll {
  flex: 1;
  min-height: 0;
  width: 100%;
}

.tool-list-scroll :deep(.el-scrollbar__wrap),
.tool-detail-scroll :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
}

.tool-list-panel :deep(.el-table) {
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  table-layout: fixed;
  box-sizing: border-box;
}

.tool-list-panel :deep(.el-table__inner-wrapper) {
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  box-sizing: border-box;
  overflow-x: auto;
}

.tool-list-panel :deep(.el-table__body-wrapper) {
  overflow-x: auto;
  overflow-y: auto;
}

/* 高亮活跃工具行 */
.tool-list-panel :deep(.el-table__row.active-tool-row) {
  background-color: rgba(64, 158, 255, 0.1) !important;
}

.tool-list-panel :deep(.el-table__row.active-tool-row:hover) {
  background-color: rgba(64, 158, 255, 0.15) !important;
}

/* 暗色主题下的高亮样式 */
@media (prefers-color-scheme: dark) {
  .tool-list-panel :deep(.el-table__row.active-tool-row) {
    background-color: rgba(64, 158, 255, 0.2) !important;
  }

  .tool-list-panel :deep(.el-table__row.active-tool-row:hover) {
    background-color: rgba(64, 158, 255, 0.25) !important;
  }
}

.tool-detail-scroll :deep(.el-scrollbar__view) {
  padding: 0;
  box-sizing: border-box;
  height: 100%;
}

.tool-detail {
  width: 100%;
  max-width: 100%;
  min-width: 0;

  border-radius: 12px;
  border: 1px solid;
  padding: 14px;
  box-sizing: border-box;
  overflow-x: hidden;

  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;
}

.tool-detail :deep(.el-descriptions__body) {
  background-color: transparent;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.tool-detail :deep(.el-descriptions) {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.tool-detail :deep(.el-descriptions__table) {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  table-layout: auto;
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
  min-height: 200px;
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
