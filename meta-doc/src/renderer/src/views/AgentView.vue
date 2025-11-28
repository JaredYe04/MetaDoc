<template>
  <div class="agent-view-page" :style="pageStyle">
    <WorkspaceTabs
      class="agent-tabs"
      closable
      @update:activeId="handleTabChange"
      @close="handleCloseTab"
      @reorder="handleTabReorder"
    />
    <div class="agent-view">
      <section class="session-pane" :style="panelStyle">
        <header class="pane-header">
          <h2>{{ t('agent.sessions.title') }}</h2>
          <div class="actions">
            <el-dropdown @command="handleManageCommand">
              <el-button size="small" type="info" :icon="Setting" circle/>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="tool-collection">{{ t('agent.manage.toolCollection.title') }}</el-dropdown-item>
                  <el-dropdown-item command="workflow">{{ t('agent.manage.workflow.title') }}</el-dropdown-item>
                  <el-dropdown-item command="agent-config">{{ t('agent.manage.agentConfig.title') }}</el-dropdown-item>
                  <el-dropdown-item divided command="import-session">{{ t('agent.sessions.import') }}</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-tooltip :content="t('agent.sessions.new')">
              <el-button size="small" type="info" :icon="Plus" @click="showCreateSessionDialog = true" circle/> 
            </el-tooltip>
          </div>
        </header>
        <el-scrollbar class="session-scroll">
          <el-radio-group v-model="activeSessionId" class="session-list">
            <el-radio
              v-for="session in sessionsState"
              :key="session.id"
              :label="session.id"
              class="session-item"
            >
              <div class="session-item__content">
                <span class="session-title">{{ session.title }}</span>
              </div>
              <div class="session-item__actions">
                <el-button
                  text
                  circle
                  size="small"
                  class="more-btn"
                  @click.stop="toggleSessionMenu(session.id)"
                >
                  <el-icon><More /></el-icon>
                </el-button>
                <transition name="fade">
                  <div
                    v-if="openSessionMenuId === session.id"
                    class="session-menu"
                    :style="sessionMenuStyle"
                    @click.stop
                  >
                    <button type="button" class="session-menu__item" @click="handleSessionMenuAction('rename', session)">
                      {{ t('agent.sessions.rename') }}
                    </button>
                    <button type="button" class="session-menu__item" @click="handleSessionMenuAction('retry', session)">
                      {{ t('agent.sessions.retry') }}
                    </button>
                    <button type="button" class="session-menu__item" @click="handleSessionMenuAction('duplicate', session)">
                      {{ t('agent.sessions.duplicate') }}
                    </button>
                    <button type="button" class="session-menu__item" @click="handleSessionMenuAction('export', session)">
                      {{ t('agent.sessions.export') }}
                    </button>
                    <button type="button" class="session-menu__item" @click="handleSessionMenuAction('references', session)">
                      {{ t('agent.sessions.references') }}
                    </button>
                    <button type="button" class="session-menu__item danger" @click="handleSessionMenuAction('delete', session)">
                      {{ t('agent.sessions.delete') }}
                    </button>
                  </div>
                </transition>
              </div>
            </el-radio>
          </el-radio-group>
        </el-scrollbar>
      </section>

      <section class="conversation-pane" :style="panelStyle">
        <header class="pane-header conversation-header">
          <div>
            <h2>{{ activeSession?.title || t('agent.conversation.emptyTitle') }}</h2>
            <p class="subtitle" v-if="activeSession?.description">{{ activeSession.description }}</p>
          </div>
          <div class="conversation-stats" v-if="activeSession">
            <el-tag size="small" effect="plain">
              {{ t('agent.conversation.messages', { count: messageCount }) }}
            </el-tag>
            <el-tag size="small" effect="plain">
              {{ t('agent.conversation.tools', { count: activeToolCount }) }}
            </el-tag>
          </div>
        </header>

      <div v-if="activeSession" class="conversation-content">
        <el-scrollbar class="conversation-scroll">
          <AgentMessageRenderer
            v-for="message in activeSession.messages"
            :key="message.id"
            :message="message"
          />
          <div class="conversation-bottom-spacer" />
        </el-scrollbar>
        <div class="composer-wrapper">
          <ChatComposer
            class="conversation-composer"
            v-model="composerInput"
            :loading="false"
            :disabled="!activeSession"
            :show-attach="false"
            :show-voice="false"
            :placeholder="t('aiChat.inputPlaceholder')"
            @submit="handleComposerSubmit"
            @reset="handleComposerReset"
          />
        </div>
      </div>
      <div v-else class="empty-placeholder">
        <el-empty :description="t('agent.conversation.none')" />
      </div>
      </section>

      <section class="tool-pane" :style="panelStyle">
        <header class="pane-header">
          <div class="tool-header-title">
            <h2>{{ t('agent.tools.title') }}</h2>
            <el-checkbox
              v-model="allSelected"
              :indeterminate="isIndeterminate"
              :disabled="toolSelectionDisabled"
              @change="toggleAllTools"
            >
              {{ t('agent.tools.toggleAll') }}
            </el-checkbox>
          </div>
          <div class="tool-legend">
            <el-tag size="small" type="info">{{ t('agent.tools.legend.available') }}</el-tag>
            <el-tag size="small" type="warning">{{ t('agent.tools.legend.running') }}</el-tag>
          </div>
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
                style="width: 100%; table-layout: fixed;"
              >
                <el-table-column type="selection" width="50">
                  <template #default="{ row }">
                    <el-checkbox
                      :model-value="activeSession?.activeToolIds.includes(row.id)"
                      :disabled="toolSelectionDisabled"
                      @change="onToolToggle(row.id, $event)"
                    />
                  </template>
                </el-table-column>
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
                      v-else-if="activeSession?.activeToolIds.includes(row.id)"
                      type="success"
                      size="small"
                    >
                      {{ t('agent.tools.enabled') }}
                    </el-tag>
                    <el-tag v-else size="small" type="info">
                      {{ t('agent.tools.disabled') }}
                    </el-tag>
                  </template>
                </el-table-column>
              </el-table>
            </el-scrollbar>
          </el-card>
          <el-card
            class="tool-panel tool-detail-panel"
            shadow="never"
            :style="panelStyle"
            :body-style="{ padding: '0', height: '100%', overflow: 'hidden' }"
          >
            <el-scrollbar class="tool-detail-scroll" :wrap-style="{ overflowX: 'hidden' }">
              <div v-if="activeTool" class="tool-detail" :style="detailStyle">
                <h3>{{ activeTool.name }}</h3>
                <p>{{ activeTool.description }}</p>
                <el-descriptions :column="1" size="small" border>
                  <el-descriptions-item :label="t('agent.tools.detail.origin')">
                    <el-tag size="small">{{ originLabel(activeTool.origin as ToolOrigin) }}</el-tag>
                  </el-descriptions-item>
                  <el-descriptions-item :label="t('agent.tools.detail.status')">
                    <el-tag v-if="activeTool.running" type="warning" size="small">
                      {{ t('agent.tool.status.running') }}
                    </el-tag>
                    <el-tag v-else size="small" type="success">
                      {{ t('agent.tools.detail.idle') }}
                    </el-tag>
                  </el-descriptions-item>
                  <el-descriptions-item :label="t('agent.tools.detail.lastUsed')">
                    {{ activeTool.lastUsed ? formatRelativeTime(activeTool.lastUsed) : t('agent.tools.detail.never') }}
                  </el-descriptions-item>
                  <el-descriptions-item :label="t('agent.tools.detail.tags')" v-if="activeTool.tags?.length">
                    <div class="tag-group">
                      <el-tag v-for="tag in activeTool.tags" :key="tag" size="small" effect="dark">
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
          </el-card>
        </div>
      </section>
    </div>

    <!-- 创建会话对话框 -->
    <el-dialog
      v-model="showCreateSessionDialog"
      :title="t('agent.sessions.new')"
      width="500px"
    >
      <el-form>
        <el-form-item :label="t('agent.sessions.selectAgentConfig')">
          <el-select
            v-model="selectedAgentConfigId"
            style="width: 100%"
            :placeholder="t('agent.sessions.selectAgentConfigPlaceholder')"
          >
            <el-option
              v-for="config in availableAgentConfigs"
              :key="config.id"
              :label="typeof config.name === 'string' ? config.name : config.name['zh_cn']?.name || config.id"
              :value="config.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateSessionDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="createSession(selectedAgentConfigId)" :disabled="!selectedAgentConfigId">
          {{ t('common.create') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 管理界面对话框 -->
    <el-dialog
      v-model="showManageDialog"
      :title="manageDialogType === 'tool-collection' ? t('agent.manage.toolCollection.title') : 
              manageDialogType === 'workflow' ? t('agent.manage.workflow.title') : 
              t('agent.manage.agentConfig.title')"
      width="90%"
      :close-on-click-modal="false"
    >
      <ToolCollectionManager v-if="manageDialogType === 'tool-collection'" />
      <WorkflowManager v-else-if="manageDialogType === 'workflow'" />
      <AgentConfigManager v-else-if="manageDialogType === 'agent-config'" />
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
    >
      <ReferenceManager :session="referenceSession" @update="handleReferenceUpdate" />
      <template #footer>
        <el-button @click="showReferenceDialog = false">{{ t('common.close') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { Plus, More, Setting } from '@element-plus/icons-vue';
import { themeState } from '../utils/themes';
import AgentMessageRenderer from '../components/agent/AgentMessageRenderer.vue';
import ChatComposer from '../components/chat/ChatComposer.vue';
import type { AgentSession, AgentTool, ChatAgentMessage, ToolOrigin } from '../types/agent';
import { cloneDeep } from 'lodash';
import WorkspaceTabs from '../components/workspace/WorkspaceTabs.vue';
import { useWorkspace } from '../stores/workspace';
import { agentConfigManager, agentSessionManager } from '../utils/agent-framework';
import { agentToolManager } from '../utils/agent-tool-manager';
import ToolCollectionManager from '../components/agent/manage/ToolCollectionManager.vue';
import WorkflowManager from '../components/agent/manage/WorkflowManager.vue';
import AgentConfigManager from '../components/agent/manage/AgentConfigManager.vue';
import ReferenceManager from '../components/agent/ReferenceManager.vue';
dayjs.extend(relativeTime);

const { t } = useI18n();
const workspace = useWorkspace();
const { activeDocument, activeTabId, removeTab, moveTab, activateTab, updateDocumentAgentSessions } =
  workspace;

const borderColor = computed(() =>
  themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.12)',
);

const subtleBorderColor = computed(() =>
  themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
);

const pageStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor,
}));

const panelStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd,
  color: themeState.currentTheme.textColor,
  borderColor: borderColor.value,
}));

const detailStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor,
  borderColor: subtleBorderColor.value,
}));

const sessionMenuStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor,
  borderColor: subtleBorderColor.value,
}));

const sampleTools: AgentTool[] = [
  {
    id: 'web-search',
    name: 'Web Search',
    description: '通过联网搜索最新信息，返回结构化摘要与引用。',
    origin: 'renderer',
    running: false,
    enabled: true,
    tags: ['search', 'internet'],
    lastUsed: dayjs().subtract(2, 'hour').toISOString(),
  },
  {
    id: 'code-executor',
    name: 'Code Interpreter',
    description: '在安全沙箱运行代码，支持 Python 与 Node.js，生成图表与数据分析结果。',
    origin: 'main',
    running: true,
    enabled: true,
    tags: ['analysis', 'notebook'],
    lastUsed: dayjs().subtract(5, 'minute').toISOString(),
  },
  {
    id: 'file-browser',
    name: 'File Browser',
    description: '浏览本地项目文件，并支持快速预览与生成摘要。',
    origin: 'renderer',
    running: false,
    enabled: false,
    tags: ['fs', 'project'],
    lastUsed: dayjs().subtract(1, 'day').toISOString(),
  },
  {
    id: 'mcp-wordpress',
    name: 'WordPress MCP',
    description: '通过 MCP 协议与 WordPress 通讯，实现内容发布和评论管理。',
    origin: 'mcp',
    running: false,
    enabled: true,
    tags: ['cms', 'publish'],
    lastUsed: dayjs().subtract(3, 'day').toISOString(),
  },
];

const sampleSessions: AgentSession[] = [
  {
    id: 'session-1',
    title: '营销方案调研',
    description: 'AI Agent + 搜索工具联合收集竞品宣传物料。',
    createdAt: dayjs().subtract(1, 'day').toISOString(),
    updatedAt: dayjs().subtract(10, 'minute').toISOString(),
    activeToolIds: ['web-search', 'file-browser'],
    messages: [
      {
        id: 'msg-1',
        role: 'system',
        type: 'chat',
        timestamp: dayjs().subtract(55, 'minute').toISOString(),
        markdown: '你是一名资深市场分析师，请协助用户整理竞品营销方案。',
      },
      {
        id: 'msg-2',
        role: 'user',
        type: 'chat',
        timestamp: dayjs().subtract(50, 'minute').toISOString(),
        markdown: '请帮我调研「AI 写作助手」领域的竞品，把宣传物料收集一下。',
      },
      {
        id: 'msg-3',
        role: 'assistant',
        type: 'chat',
        timestamp: dayjs().subtract(48, 'minute').toISOString(),
        markdown: '好的，我将先检索相关产品列表，并拉取官网的主视觉素材与宣传语。',
      },
      {
        id: 'msg-4',
        role: 'assistant',
        type: 'thought',
        timestamp: dayjs().subtract(47, 'minute').toISOString(),
        markdown: '思考：先使用 **Web Search** 工具搜集候选列表，再用 **File Browser** 下载素材。',
      },
      {
        id: 'msg-5',
        role: 'tool',
        type: 'tool',
        timestamp: dayjs().subtract(45, 'minute').toISOString(),
        tool: { id: 'web-search', name: 'Web Search' },
        status: 'succeeded',
        summary: '检索到 4 个热门竞品，并抓取官网标题与核心卖点。',
        outputs: [
          {
            id: 'out-1',
            label: '搜索摘要',
            format: 'markdown',
            data: `| 产品 | 官网标题 | 核心卖点 |
| --- | --- | --- |
| Jasper | Create content that grows your business | AI 辅助内容策略 |
| Copy.ai | Copywriting Simplified | 提供海量模板 |
| Writesonic | AI that writes for you | 多语言支持 |
| QuillBot | Paraphrasing Tool & Grammar Checker | 语法润色与改写 |`,
          },
          {
            id: 'out-2',
            label: '原始响应',
            format: 'json',
            data: {
              total: 4,
              sources: [
                { url: 'https://www.jasper.ai/', title: 'Jasper' },
                { url: 'https://www.copy.ai/', title: 'Copy.ai' },
                { url: 'https://writesonic.com/', title: 'Writesonic' },
                { url: 'https://quillbot.com/', title: 'QuillBot' },
              ],
            },
          },
        ],
      },
      {
        id: 'msg-6',
        role: 'tool',
        type: 'tool',
        timestamp: dayjs().subtract(42, 'minute').toISOString(),
        tool: { id: 'file-browser', name: 'File Browser' },
        status: 'failed',
        summary: '尝试抓取 jasper.ai 主视觉失败。',
        outputs: [
          {
            id: 'out-1',
            label: '请求详情',
            format: 'text',
            data: 'GET https://www.jasper.ai/hero.png',
          },
        ],
        error: '网络请求被目标站点拒绝 (403)。',
      },
      {
        id: 'msg-7',
        role: 'assistant',
        type: 'chat',
        timestamp: dayjs().subtract(38, 'minute').toISOString(),
        markdown: '已经完成初步调研，成功获取 4 个竞品的核心卖点，并记录对应官网。主视觉素材需要进一步人工处理。',
      },
      {
        id: 'msg-8',
        role: 'user',
        type: 'chat',
        timestamp: dayjs().subtract(35, 'minute').toISOString(),
        markdown: '请把这些内容整理成 Markdown 报告，并附上链接。',
      },
    ],
  },
  {
    id: 'session-2',
    title: '产品路线规划',
    createdAt: dayjs().subtract(3, 'day').toISOString(),
    updatedAt: dayjs().subtract(1, 'day').toISOString(),
    activeToolIds: ['code-executor', 'mcp-wordpress'],
    messages: [
      {
        id: 'msg-1',
        role: 'assistant',
        type: 'chat',
        timestamp: dayjs().subtract(1, 'day').toISOString(),
        markdown: '我们正在规划 Q1 的产品路线，建议拆分为三条主线：编辑体验、AI 协作、分发链路。',
      },
      {
        id: 'msg-2',
        role: 'user',
        type: 'chat',
        timestamp: dayjs().subtract(1, 'day').add(5, 'minute').toISOString(),
        markdown: '帮我生成一个甘特图，并把结果同步到博客草稿里。',
      },
      {
        id: 'msg-3',
        role: 'tool',
        type: 'tool',
        timestamp: dayjs().subtract(1, 'day').add(6, 'minute').toISOString(),
        tool: { id: 'code-executor', name: 'Code Interpreter' },
        status: 'succeeded',
        summary: '生成产品路线甘特图 (PNG) 与关键里程碑表格。',
        outputs: [
          {
            id: 'chart',
            label: '甘特图 (Base64)',
            format: 'text',
            data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAA...',
          },
          {
            id: 'milestones',
            label: '里程碑表格',
            format: 'markdown',
            data: `| 里程碑 | 时间 | 负责人 |
| --- | --- | --- |
| 编辑器重构 | 2025-01 | 前端团队 |
| AI 工具集成 | 2025-02 | 产品体验组 |
| 发布渠道对接 | 2025-03 | 平台生态组 |`,
          },
        ],
      },
      {
        id: 'msg-4',
        role: 'tool',
        type: 'tool',
        timestamp: dayjs().subtract(1, 'day').add(8, 'minute').toISOString(),
        tool: { id: 'mcp-wordpress', name: 'WordPress MCP' },
        status: 'succeeded',
        summary: '已创建草稿《MetaDoc Q1 产品路线》。',
        outputs: [
          {
            id: 'draft',
            label: '草稿地址',
            format: 'text',
            data: 'https://blog.metadoc.dev/wp-admin/post.php?post=482&action=edit',
          },
        ],
      },
    ],
  },
];

// 从AgentToolManager获取工具
const tools = computed(() => {
  const allTools = agentToolManager.getAllTools();
  return allTools.map(tool => ({
    id: tool.config.id,
    name: agentToolManager.getLocalizedText(tool.config.name),
    description: agentToolManager.getLocalizedText(tool.config.description),
    origin: tool.config.origin === 'internal' ? 'renderer' : tool.config.origin === 'mcp' ? 'mcp' : 'main',
    tags: tool.config.tags || [],
    running: tool.running,
    enabled: tool.config.enabled !== false,
    lastUsed: tool.lastUsed
  }));
});
const sessionsState = ref<AgentSession[]>([]);
const activeSessionId = ref<string | null>(null);
const activeToolId = ref<string | null>(null);
const syncingSessions = ref(false);
const shouldBootstrapDemoSessions = true;
const demoAppliedDocs = new Set<string>();
const composerInput = ref('');
const openSessionMenuId = ref<string | null>(null);
const showCreateSessionDialog = ref(false);
const showManageDialog = ref(false);
const manageDialogType = ref<'tool-collection' | 'workflow' | 'agent-config' | null>(null);
const availableAgentConfigs = ref(agentConfigManager.getAllConfigs());
const selectedAgentConfigId = ref<string>('');
const showReferenceDialog = ref(false);
const referenceSession = ref<AgentSession | null>(null);

const activeSession = computed(() =>
  sessionsState.value.find((session) => session.id === activeSessionId.value) ?? null,
);

const activeTool = computed(() => tools.value.find((tool) => tool.id === activeToolId.value) ?? null);

const ensureActiveSessionId = () => {
  const list = sessionsState.value;
  if (!list.length) {
    activeSessionId.value = null;
    openSessionMenuId.value = null;
    return;
  }
  if (!list.some((session) => session.id === activeSessionId.value)) {
    activeSessionId.value = list[0].id;
  }
};

const touchSession = (session: AgentSession) => {
  session.updatedAt = new Date().toISOString();
};

const applySessionsToDocument = (sessions: AgentSession[]) => {
  const doc = activeDocument.value;
  if (!doc) return;
  syncingSessions.value = true;
  updateDocumentAgentSessions(doc.tabId, cloneDeep(sessions));
  nextTick(() => {
    syncingSessions.value = false;
  });
};

const persistSessions = () => {
  if (!activeDocument.value) return;
  applySessionsToDocument(sessionsState.value);
};

watch(
  () => activeDocument.value?.agentSessions,
  (sessions) => {
    const doc = activeDocument.value;
    if (!doc) {
      sessionsState.value = [];
      activeSessionId.value = null;
      return;
    }
    if (syncingSessions.value) {
      syncingSessions.value = false;
      return;
    }
    let source = Array.isArray(sessions) ? cloneDeep(sessions as AgentSession[]) : [];
    if (!source.length && shouldBootstrapDemoSessions && !demoAppliedDocs.has(doc.tabId)) {
      source = cloneDeep(sampleSessions);
      sessionsState.value = source;
      ensureActiveSessionId();
      applySessionsToDocument(source);
      demoAppliedDocs.add(doc.tabId);
      return;
    }
    sessionsState.value = source;
    ensureActiveSessionId();
    openSessionMenuId.value = null;
  },
  { immediate: true, deep: true },
);

watch(
  () => activeSessionId.value,
  () => {
    activeToolId.value = null;
    composerInput.value = '';
    openSessionMenuId.value = null;
  },
);

const messageCount = computed(() => activeSession.value?.messages.length ?? 0);
const activeToolCount = computed(() => activeSession.value?.activeToolIds.length ?? 0);

const toolSelectionDisabled = computed(() => {
  const session = activeSession.value;
  if (!session) return true;
  return session.messages.some(
    (message) =>
      message.type === 'tool' && (message.status === 'running' || message.status === 'pending'),
  );
});

const allSelected = computed({
  get() {
    const session = activeSession.value;
    if (!session) return false;
    return tools.value.every((tool) => session.activeToolIds.includes(tool.id));
  },
  set(value: boolean) {
    toggleAllTools(value);
  },
});

const isIndeterminate = computed(() => {
  const session = activeSession.value;
  if (!session || !tools.value.length) return false;
  const selectedCount = tools.value.filter((tool) => session.activeToolIds.includes(tool.id)).length;
  return selectedCount > 0 && selectedCount < tools.value.length;
});

const formatRelativeTime = (timestamp: string) => dayjs(timestamp).fromNow();

const createSession = (agentConfigId?: string) => {
  if (!agentConfigId) {
    showCreateSessionDialog.value = true;
    return;
  }

  try {
    const session = agentSessionManager.createSession(
      agentConfigId,
      t('agent.sessions.newTitle', { index: sessionsState.value.length + 1 }),
      ''
    );

    // 转换为旧的格式以保持兼容
    const legacySession: AgentSession = {
      id: session.id,
      title: session.title,
      description: session.description,
      createdAt: new Date(session.createdAt).toISOString(),
      updatedAt: new Date(session.updatedAt).toISOString(),
      messages: session.messages,
      activeToolIds: agentConfigManager.getAvailableToolIds(agentConfigId),
      agentConfigId: session.agentConfigId,
      messageQueue: session.messageQueue || [],
      referenceStore: session.referenceStore || [],
      publicContext: session.publicContext || {},
      executionNodes: session.executionNodes || [],
      status: session.status || 'idle'
    };

    sessionsState.value.unshift(legacySession);
    ensureActiveSessionId();
    activeSessionId.value = session.id;
    persistSessions();
    showCreateSessionDialog.value = false;
    selectedAgentConfigId.value = '';
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error));
  }
};

const deleteSession = async (session?: AgentSession) => {
  const target = session ?? activeSession.value;
  if (!target) return;
  try {
    await ElMessageBox.confirm(
      t('agent.sessions.confirmDelete', { title: target.title }),
      t('agent.sessions.delete'),
      { type: 'warning' },
    );
    sessionsState.value = sessionsState.value.filter((item) => item.id !== target.id);
    ensureActiveSessionId();
    persistSessions();
    ElMessage.success(t('agent.sessions.deleteSuccess'));
  } catch {
    // canceled
  }
};

const renameSession = async (session: AgentSession) => {
  const { value } = await ElMessageBox.prompt(
    t('agent.sessions.renamePlaceholder'),
    t('agent.sessions.rename'),
    {
      inputValue: session.title,
      inputValidator: (val: string) => !!val.trim() || t('agent.sessions.renameRequired'),
    },
  );
  session.title = value.trim();
  touchSession(session);
  persistSessions();
  ElMessage.success(t('agent.sessions.renameSuccess'));
};

const toggleTool = (toolId: string, enabled: boolean) => {
  const session = activeSession.value;
  if (!session) return;
  if (toolSelectionDisabled.value) return;
  const nextIds = new Set(session.activeToolIds);
  if (enabled) {
    nextIds.add(toolId);
  } else {
    nextIds.delete(toolId);
  }
  session.activeToolIds = Array.from(nextIds);
  touchSession(session);
  persistSessions();
};

const onToolToggle = (toolId: string, value: boolean | string | number) => {
  if (toolSelectionDisabled.value) return;
  toggleTool(toolId, Boolean(value));
};

const toggleAllTools = (value: boolean) => {
  const session = activeSession.value;
  if (!session) return;
  if (toolSelectionDisabled.value) return;
  if (!tools.value.length) return;
  session.activeToolIds = value
    ? Array.from(new Set([...session.activeToolIds, ...tools.value.map((tool) => tool.id)]))
    : [];
  touchSession(session);
  persistSessions();
};

const selectTool = (tool: AgentTool) => {
  activeToolId.value = tool.id;
};

const createChatMessage = (role: 'user' | 'assistant', markdown: string): ChatAgentMessage => ({
  id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  timestamp: new Date().toISOString(),
  role,
  type: 'chat',
  markdown,
});

const handleComposerSubmit = () => {
  const session = activeSession.value;
  if (!session) return;
  const content = composerInput.value.trim();
  if (!content) return;

  const message = createChatMessage('user', content);

  session.messages.push(message);
  composerInput.value = '';
  touchSession(session);
  persistSessions();
  nextTick(() => {
    const container = document.querySelector('.conversation-scroll .el-scrollbar__wrap');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  });
};

const handleComposerReset = () => {
  composerInput.value = '';
};

const originLabel = (origin: AgentTool['origin']) => {
  switch (origin) {
    case 'renderer':
      return t('agent.tools.origins.renderer');
    case 'main':
      return t('agent.tools.origins.main');
    case 'mcp':
      return t('agent.tools.origins.mcp');
    default:
      return origin;
  }
};

const handleTabChange = (id: string) => {
  if (id !== activeTabId.value) {
    activateTab(id);
  }
};

const handleCloseTab = (id: string) => {
  removeTab(id);
};

const handleTabReorder = ({ fromId, toId }: { fromId: string; toId: string }) => {
  moveTab(fromId, toId);
};

const toggleSessionMenu = (sessionId: string) => {
  openSessionMenuId.value = openSessionMenuId.value === sessionId ? null : sessionId;
};

const handleSessionMenuAction = async (
  action: 'rename' | 'delete' | 'retry' | 'duplicate' | 'export' | 'references',
  session: AgentSession,
) => {
  openSessionMenuId.value = null;
  if (action === 'rename') {
    await renameSession(session);
  } else if (action === 'delete') {
    await deleteSession(session);
  } else if (action === 'retry') {
    await handleRetrySession(session);
  } else if (action === 'duplicate') {
    await handleDuplicateSession(session);
  } else if (action === 'export') {
    await handleExportSession(session);
  } else if (action === 'references') {
    referenceSession.value = session;
    showReferenceDialog.value = true;
  }
};

const handleRetrySession = async (session: AgentSession) => {
  if (!session.currentExecutionNodeId && session.executionNodes && session.executionNodes.length > 0) {
    ElMessage.warning(t('agent.sessions.noExecutionNode'));
    return;
  }

  try {
    // 转换为新的AgentSession格式
    const newFormatSession: any = {
      ...session,
      entityType: 'agent-session',
      createdAt: typeof session.createdAt === 'string' ? new Date(session.createdAt).getTime() : session.createdAt,
      updatedAt: typeof session.updatedAt === 'string' ? new Date(session.updatedAt).getTime() : session.updatedAt,
      messageQueue: session.messageQueue || [],
      referenceStore: session.referenceStore || [],
      publicContext: session.publicContext || {},
      executionNodes: session.executionNodes || [],
      status: session.status || 'idle'
    };

    if (session.currentExecutionNodeId) {
      agentSessionManager.retryToNode(newFormatSession, session.currentExecutionNodeId);
      
      // 更新会话
      const index = sessionsState.value.findIndex(s => s.id === session.id);
      if (index !== -1) {
        sessionsState.value[index] = {
          ...sessionsState.value[index],
          ...newFormatSession,
          createdAt: new Date(newFormatSession.createdAt).toISOString(),
          updatedAt: new Date(newFormatSession.updatedAt).toISOString()
        };
        persistSessions();
        ElMessage.success(t('agent.sessions.retrySuccess'));
      }
    } else {
      ElMessage.warning(t('agent.sessions.noExecutionNode'));
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error));
  }
};

const handleDuplicateSession = async (session: AgentSession) => {
  try {
    // 转换为新的AgentSession格式
    const newFormatSession: any = {
      ...session,
      entityType: 'agent-session',
      createdAt: typeof session.createdAt === 'string' ? new Date(session.createdAt).getTime() : session.createdAt,
      updatedAt: typeof session.updatedAt === 'string' ? new Date(session.updatedAt).getTime() : session.updatedAt,
      messageQueue: session.messageQueue || [],
      referenceStore: session.referenceStore || [],
      publicContext: session.publicContext || {},
      executionNodes: session.executionNodes || [],
      status: session.status || 'idle'
    };

    const duplicated = agentSessionManager.duplicateSession(
      newFormatSession,
      session.currentExecutionNodeId
    );

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
    };

    sessionsState.value.unshift(legacySession);
    ensureActiveSessionId();
    activeSessionId.value = duplicated.id;
    persistSessions();
    ElMessage.success(t('agent.sessions.duplicateSuccess'));
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error));
  }
};

const handleExportSession = async (session: AgentSession) => {
  try {
    // 转换为新的AgentSession格式
    const newFormatSession: any = {
      ...session,
      entityType: 'agent-session',
      createdAt: typeof session.createdAt === 'string' ? new Date(session.createdAt).getTime() : session.createdAt,
      updatedAt: typeof session.updatedAt === 'string' ? new Date(session.updatedAt).getTime() : session.updatedAt,
      messageQueue: session.messageQueue || [],
      referenceStore: session.referenceStore || [],
      publicContext: session.publicContext || {},
      executionNodes: session.executionNodes || [],
      status: session.status || 'idle'
    };

    const serialized = agentSessionManager.serializeSession(newFormatSession, true);
    const json = JSON.stringify(serialized, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agent-session-${session.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    ElMessage.success(t('agent.sessions.exportSuccess'));
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error));
  }
};

const handleImportSession = () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      const session = agentSessionManager.deserializeSession(data, {
        importDependencies: true,
        overwriteDependencies: false
      });

      // 转换为旧格式
      const legacySession: AgentSession = {
        id: session.id,
        title: session.title,
        description: session.description,
        createdAt: new Date(session.createdAt).toISOString(),
        updatedAt: new Date(session.updatedAt).toISOString(),
        messages: session.messages,
        activeToolIds: session.agentConfigId 
          ? agentConfigManager.getAvailableToolIds(session.agentConfigId)
          : [],
        agentConfigId: session.agentConfigId,
        messageQueue: session.messageQueue,
        referenceStore: session.referenceStore,
        publicContext: session.publicContext,
        executionNodes: session.executionNodes,
        status: session.status
      };

      sessionsState.value.unshift(legacySession);
      ensureActiveSessionId();
      activeSessionId.value = session.id;
      persistSessions();
      ElMessage.success(t('agent.sessions.importSuccess'));
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : String(error));
    }
  };
  input.click();
};

const handleReferenceUpdate = () => {
  if (referenceSession.value) {
    // 更新会话
    const index = sessionsState.value.findIndex(s => s.id === referenceSession.value!.id);
    if (index !== -1) {
      // 转换为新的AgentSession格式以获取最新数据
      const newFormatSession: any = {
        ...referenceSession.value,
        entityType: 'agent-session',
        createdAt: typeof referenceSession.value.createdAt === 'string' 
          ? new Date(referenceSession.value.createdAt).getTime() 
          : referenceSession.value.createdAt,
        updatedAt: typeof referenceSession.value.updatedAt === 'string' 
          ? new Date(referenceSession.value.updatedAt).getTime() 
          : referenceSession.value.updatedAt,
        messageQueue: referenceSession.value.messageQueue || [],
        referenceStore: referenceSession.value.referenceStore || [],
        publicContext: referenceSession.value.publicContext || {},
        executionNodes: referenceSession.value.executionNodes || [],
        status: referenceSession.value.status || 'idle'
      };
      
      // 更新会话
      sessionsState.value[index] = {
        ...sessionsState.value[index],
        referenceStore: newFormatSession.referenceStore,
        updatedAt: new Date(newFormatSession.updatedAt).toISOString()
      };
      touchSession(sessionsState.value[index]);
      persistSessions();
    }
  }
};

const handleManageCommand = (command: string) => {
  if (command === 'import-session') {
    handleImportSession();
  } else {
    manageDialogType.value = command as any;
    showManageDialog.value = true;
  }
};

const handleDocumentClick = () => {
  openSessionMenuId.value = null;
};

onMounted(() => {
  document.addEventListener('click', handleDocumentClick);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick);
});
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
  display: grid;
  grid-template-columns: 280px 1fr 360px;
  gap: 18px;
  flex: 1;
  min-height: 0;
  padding: 0 16px 16px;
  box-sizing: border-box;
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

.session-pane,
.conversation-pane,
.tool-pane {
  border-radius: 16px;
  border: 1px solid;
  padding: 16px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.session-scroll {
  flex: 1;
  min-height: 0;
}

.session-scroll :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
}

.session-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.session-list :deep(.el-radio) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  margin: 0;
  padding: 8px 10px;
  box-sizing: border-box;
  border-radius: 10px;
  transition: background-color 0.2s ease;
}

.session-list :deep(.el-radio):hover {
  background-color: rgba(0, 0, 0, 0.06);
}

.session-list :deep(.el-radio.is-checked) {
  background-color: rgba(64, 158, 255, 0.18);
}

.session-list :deep(.el-radio__label) {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  min-width: 0;
}

.session-list :deep(.el-radio__input) {
  margin-right: 8px;
}

.session-item__content {
  flex: 1;
  display: flex;
  align-items: center;
  min-width: 0;
}

.session-title {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-item__actions {
  display: flex;
  align-items: center;
  position: relative;
}

.more-btn {
  margin-left: 6px;
}

.session-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  border: 1px solid;
  border-radius: 8px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
  min-width: 140px;
  padding: 4px;
  display: flex;
  flex-direction: column;
  z-index: 10;
}

.session-menu__item {
  background: transparent;
  border: none;
  padding: 8px 10px;
  text-align: left;
  color: inherit;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: background-color 0.2s ease;
}

.session-menu__item:hover {
  background-color: rgba(64, 158, 255, 0.16);
}

.session-menu__item.danger {
  color: #f56c6c;
}

.session-menu__item.danger:hover {
  background-color: rgba(245, 108, 108, 0.18);
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
  justify-content: center;
  pointer-events: none;
  padding: 0 8px;
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
}

.tool-panel {
  flex: 1;
  min-height: 0;
  
  display: flex;
  flex-direction: column;
}

.tool-panel :deep(.el-card__body) {
  display: flex;
  flex: 1;
  flex-direction: column;
}

.tool-list-scroll,
.tool-detail-scroll {
  flex: 1;
  min-height: 0;
}

.tool-list-scroll :deep(.el-scrollbar__wrap),
.tool-detail-scroll :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
}

.tool-list-panel :deep(.el-table) {
  width: 100% !important;
  table-layout: fixed;
}

.tool-detail-scroll :deep(.el-scrollbar__view) {
  padding: 14px;
  box-sizing: border-box;
}

.tool-detail {
  width: 100%;
  border-radius: 12px;
  border: 1px solid;
  padding: 14px;
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.tool-detail :deep(.el-descriptions__body) {
  background-color: transparent;
}

.tool-detail.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
}

.tag-group {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.tool-detail :deep(.el-descriptions__body) {
  background-color: transparent;
}

@media (max-width: 1440px) {
  .agent-view {
    grid-template-columns: 240px 1fr 320px;
  }
}

@media (max-width: 1200px) {
  .agent-view {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(220px, auto) 1fr minmax(280px, auto);
  }
}
</style>

