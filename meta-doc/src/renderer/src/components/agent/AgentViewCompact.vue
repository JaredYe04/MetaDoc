<template>
  <div class="agent-compact" :style="panelStyle">
    <div class="agent-compact-header">
      <div class="agent-compact-tabs">
        <div
          v-for="s in displaySessions"
          :key="s.id"
          class="agent-compact-tab-wrap"
          draggable="true"
          @contextmenu.prevent="openTabContextMenu($event, s)"
          @dragstart="handleTabDragStart($event, s)"
          @dragover.prevent="handleTabDragOver($event, s)"
          @drop.prevent="handleTabDrop($event, s)"
        >
          <button
            type="button"
            class="agent-compact-tab"
            :class="{ active: s.id === activeSessionId }"
            @click="agentStore.setActiveSessionId(s.id)"
          >
            <Loader2
              v-if="isSessionGenerating(s.id)"
              class="agent-compact-tab-spinner"
              aria-hidden="true"
            />
            <span class="agent-compact-tab-label">{{
              s.title || t('agent.compact.untitled')
            }}</span>
          </button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="agent-compact-tab-close"
            :title="t('agent.compact.closeTab')"
            @click.stop="closeTab(s)"
          >
            <X class="h-3 w-3" />
          </Button>
        </div>
      </div>
      <!-- Tab 右键菜单 -->
      <div
        v-if="tabContextSession"
        class="agent-compact-tab-context"
        :style="{ left: tabContextX + 'px', top: tabContextY + 'px' }"
        @mouseleave="tabContextSession = null"
      >
        <button type="button" class="agent-compact-tab-context-item" @click="handleTabContextClose">
          {{ t('agent.compact.closeTab') }}
        </button>
        <button
          type="button"
          class="agent-compact-tab-context-item"
          @click="handleTabContextRename"
        >
          {{ t('agent.sessions.rename') }}
        </button>
        <button
          type="button"
          class="agent-compact-tab-context-item"
          @click="handleTabContextExport"
        >
          {{ t('agent.compact.exportJson') }}
        </button>
        <button
          type="button"
          class="agent-compact-tab-context-item"
          @click="handleTabContextDuplicate"
        >
          {{ t('agent.sessions.duplicate') }}
        </button>
        <button
          type="button"
          class="agent-compact-tab-context-item agent-compact-tab-context-item-danger"
          @click="handleTabContextDelete"
        >
          {{ t('agent.compact.deleteSession') }}
        </button>
      </div>
      <div class="agent-compact-header-actions">
        <DropdownMenu :modal="false">
          <Tooltip>
            <TooltipTrigger as-child>
              <DropdownMenuTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon"
                  class="agent-compact-header-btn"
                >
                  <Settings class="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>{{ t('agent.manage.settingsMenu') }}</p>
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" :side-offset="4">
            <AgentManageMenuItems @command="onCompactManageCommand" />
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu v-model:open="historyOpen" :modal="false">
          <Tooltip>
            <TooltipTrigger as-child>
              <DropdownMenuTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon"
                  class="agent-compact-header-btn"
                >
                  <Clock class="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>{{ t('agent.compact.recentSessions') }}</p>
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent class="agent-compact-history-dropdown" align="end" :side-offset="4">
            <div class="agent-compact-history-list-wrap">
              <el-scrollbar class="agent-compact-history-scrollbar" max-height="320px">
                <div class="agent-compact-history-list">
                  <template v-for="group in historyGroups" :key="group.label">
                    <div class="agent-compact-history-group-label">{{ group.label }}</div>
                    <DropdownMenuItem
                      v-for="s in group.sessions"
                      :key="s.id"
                      class="agent-compact-history-item"
                      @contextmenu.prevent="openHistoryContextMenu($event, s)"
                      @select="openSessionFromHistory(s), (historyOpen = false)"
                    >
                      <span class="agent-compact-history-row">
                        <span class="agent-compact-history-title">{{
                          s.title || t('agent.compact.untitled')
                        }}</span>
                        <span class="agent-compact-history-time">{{
                          formatHistoryTime(s.updatedAt)
                        }}</span>
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        class="agent-compact-history-item-close"
                        :title="t('agent.compact.deleteSession')"
                        @click.stop="confirmDeleteHistoryItem(s)"
                      >
                        <X class="h-3 w-3" />
                      </Button>
                    </DropdownMenuItem>
                  </template>
                  <div
                    v-if="hasMoreHistory"
                    class="agent-compact-history-more"
                    role="button"
                    tabindex="0"
                    @click="historyLimit += 10"
                    @keydown.enter.prevent="historyLimit += 10"
                    @keydown.space.prevent="historyLimit += 10"
                  >
                    {{ t('agent.compact.loadMore') }}
                  </div>
                </div>
              </el-scrollbar>
            </div>
          </DropdownMenuContent>
          <!-- 最近会话项右键菜单：modal=false 时 body 不设 pointer-events:none，Teleport 到 body 可正常显示和点击；下拉保持打开，仅点击外部/列表项/菜单项时关闭 -->
          <Teleport to="body">
            <div
              v-if="historyContextSession"
              class="agent-compact-tab-context agent-compact-history-context"
              :style="{
                left: historyContextX + 'px',
                top: historyContextY + 'px'
              }"
              @mouseleave="historyContextSession = null"
              @click.stop
            >
              <button
                type="button"
                class="agent-compact-tab-context-item"
                @click="handleHistoryContextRename"
              >
                {{ t('agent.sessions.rename') }}
              </button>
              <button
                type="button"
                class="agent-compact-tab-context-item"
                @click="handleHistoryContextExport"
              >
                {{ t('agent.compact.exportJson') }}
              </button>
              <button
                type="button"
                class="agent-compact-tab-context-item"
                @click="handleHistoryContextDuplicate"
              >
                {{ t('agent.sessions.duplicate') }}
              </button>
              <button
                type="button"
                class="agent-compact-tab-context-item agent-compact-tab-context-item-danger"
                @click="handleHistoryContextDelete"
              >
                {{ t('agent.compact.deleteSession') }}
              </button>
            </div>
          </Teleport>
        </DropdownMenu>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              variant="ghost"
              size="icon"
              class="agent-compact-header-btn"
              @click="createNewSession"
            >
              <Plus class="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>{{ t('agent.compact.newSession') }}</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>

    <div
      v-if="activeSession && openTabIds.includes(activeSession.id)"
      class="agent-compact-content"
    >
      <ScrollArea class="conversation-scroll agent-compact-selectable">
        <AgentMessageRenderer
          v-for="(message, index) in activeSession.messages"
          :key="message.id"
          :message="message"
          :messages="activeSession.messages"
          :message-index="index"
          :user-name="t('agentViewCompact.user')"
          :session-references="activeSession.referenceStore || []"
          :session-id="activeSession.id"
          :compact="true"
          @edit="handleMessageEdit"
          @regenerate="handleMessageRegenerate"
          @delete="handleMessageDelete"
          @duplicate="handleMessageDuplicate"
          @rollback="handleMessageRollback"
          @redo="handleMessageRedo"
        />
        <div class="conversation-bottom-spacer" />
      </ScrollArea>

      <!-- 编辑暂存：默认折叠，可上拉查看并逐条接受/拒绝 -->
      <Collapsible
        v-if="activeSession"
        v-model:open="stagingPanelOpen"
        class="agent-compact-staging"
      >
        <CollapsibleTrigger as-child>
          <button
            type="button"
            class="agent-compact-staging-trigger"
            :class="{ 'has-items': stagingEdits.length > 0 }"
          >
            <span class="agent-compact-staging-trigger-label">
              {{ t('agent.staging.title', '编辑暂存') }}
              <template v-if="stagingEdits.length"> ({{ stagingEdits.length }})</template>
            </span>
            <ChevronUp v-if="!stagingPanelOpen" class="agent-compact-staging-chevron" />
            <ChevronDown v-else class="agent-compact-staging-chevron" />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div class="agent-compact-staging-content">
            <template v-if="stagingEdits.length === 0">
              <div class="agent-compact-staging-empty">
                {{ t('agent.staging.empty', '暂无待审编辑') }}
              </div>
            </template>
            <template v-else>
              <div class="agent-compact-staging-actions">
                <Button
                  size="sm"
                  class="agent-staging-btn agent-staging-btn-accept"
                  :disabled="!hasPendingEdits"
                  @click="stagingAcceptAll"
                >
                  {{ t('agent.staging.acceptAll', '全部接受') }}
                </Button>
                <Button
                  size="sm"
                  class="agent-staging-btn agent-staging-btn-reject"
                  :disabled="!hasPendingEdits"
                  @click="stagingRejectAll"
                >
                  {{ t('agent.staging.rejectAll', '全部拒绝') }}
                </Button>
                <Button
                  size="sm"
                  class="agent-staging-btn agent-staging-btn-review"
                  @click="openReviewWindow"
                >
                  {{ t('agent.staging.openReview', '独立审阅') }}
                </Button>
              </div>
              <div class="agent-compact-staging-list">
                <div
                  v-for="edit in stagingEdits"
                  :key="edit.id"
                  class="agent-compact-staging-item"
                  :class="edit.status"
                >
                  <span class="agent-compact-staging-item-path" :title="edit.filePath">{{
                    edit.filePath.replace(/^.*[/\\]/, '') || edit.filePath
                  }}</span>
                  <span class="agent-compact-staging-item-diff">
                    <span class="add">+{{ edit.addedLines }}</span>
                    <span class="del">-{{ edit.removedLines }}</span>
                  </span>
                  <span v-if="edit.status === 'pending'" class="agent-compact-staging-item-btns">
                    <Button
                      size="sm"
                      variant="ghost"
                      class="h-6 text-xs"
                      @click="stagingAccept(edit)"
                    >
                      {{ t('agent.staging.accept', '接受') }}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      class="h-6 text-xs text-destructive"
                      @click="stagingReject(edit)"
                    >
                      {{ t('agent.staging.reject', '拒绝') }}
                    </Button>
                  </span>
                  <span v-else class="agent-compact-staging-item-status">
                    {{
                      edit.status === 'accepted'
                        ? t('agent.staging.accepted', '已接受')
                        : t('agent.staging.rejected', '已拒绝')
                    }}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    class="agent-compact-staging-item-close"
                    :title="t('agent.staging.dismiss', '关闭并拒绝')"
                    @click.stop="stagingDismiss(edit)"
                  >
                    <X class="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </template>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div class="agent-compact-composer">
        <ReferenceDisplay
          v-if="activeSession"
          class="agent-compact-ref-display"
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
          v-model="composerInput"
          :loading="isActiveSessionGenerating"
          :queue-while-loading="true"
          :disabled="!activeSession"
          :show-attach="false"
          :show-voice="false"
          :show-reset="false"
          :placeholder="t('aiChat.inputPlaceholder')"
          :show-knowledge-base="false"
          :compact="true"
          :show-reference-picker="true"
          :get-at-label="getAtLabel"
          @submit="(kb, content) => handleComposerSubmit(kb, content)"
          @reset="handleComposerReset"
          @attach="handleAttachFile"
          @open-reference-picker="referencePickerOpen = true"
          @cancel="handleCancelGeneration"
        >
          <template v-if="activeSession" #leading>
            <div class="agent-compact-composer-leading">
              <AgentReferencePicker
                v-model:open="referencePickerOpen"
                :disabled="!activeSession"
                compact
                @select-file="handleReferencePickerFile"
                @select-tab="handleReferencePickerTab"
                @select-dir="handleReferencePickerDir"
              />
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button
                    variant="ghost"
                    size="icon"
                    class="agent-compact-composer-btn"
                    :disabled="!activeSession"
                    :title="t('aiChat.attachTooltip')"
                  >
                    <Paperclip class="agent-compact-composer-btn-icon" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" class="agent-compact-attach-dropdown">
                  <DropdownMenuItem @select="openAttachFilePicker">
                    {{ t('agent.compact.uploadAttachment', '上传附件') }}
                  </DropdownMenuItem>
                  <DropdownMenuItem @select="openReferenceDialog">
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
    <div v-else class="agent-compact-empty">
      <Empty :description="t('agent.conversation.none', '请选择或新建一个会话开始对话。')">
        <template #image>
          <div
            class="agent-compact-empty-logo"
            :class="{ shake: emptyLogoShake }"
            @click="emptyLogoClick"
          >
            <div class="logo-animation-wrapper">
              <LogoIcon
                :size="96"
                :bg-color="emptyLogoBgColor"
                :symbol-color="emptyLogoSymbolColor"
                class="logo-image"
              />
            </div>
          </div>
        </template>
      </Empty>
    </div>

    <!-- 引用管理对话框 -->
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
          <Button variant="ghost" @click="showReferenceDialog = false">
            {{ t('common.close') }}
          </Button>
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
          <Button variant="ghost" @click="showEditMessageDialog = false">
            {{ t('common.cancel') }}
          </Button>
          <Button @click="handleConfirmEditMessage">{{ t('common.confirm') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 会话重命名对话框（避免 ElMessageBox.prompt 与 Monaco context 冲突导致卡住） -->
    <Dialog v-model:open="showRenameSessionDialog">
      <DialogContent class="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{{ t('agent.sessions.rename') }}</DialogTitle>
        </DialogHeader>
        <div class="grid gap-4 py-4">
          <input
            v-model="renameSessionTitle"
            type="text"
            class="agent-rename-input"
            :placeholder="t('agent.sessions.renamePlaceholder')"
            @keydown.enter.prevent="handleConfirmRenameSession"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" @click="showRenameSessionDialog = false">
            {{ t('common.cancel') }}
          </Button>
          <Button @click="handleConfirmRenameSession">{{ t('common.confirm') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import {
  Clock,
  ChevronDown,
  ChevronUp,
  Loader2,
  Paperclip,
  Plus,
  Settings,
  X
} from 'lucide-vue-next'
import { messageBox } from '@renderer/utils/messageBox'
import { Button } from '@renderer/components/ui/button'
import { Textarea } from '@renderer/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import {
  selectReferenceFiles,
  resolveDirectoryToReference,
  resolveFilePathToReference
} from '../../utils/agent-framework/reference-processor'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@renderer/components/ui/collapsible'
import { Empty } from '@renderer/components/ui/empty'
import LogoIcon from '../LogoIcon.vue'
import { themeState, FIXED_LOGO_COLORS } from '../../utils/themes'
import { useWorkspace } from '../../stores/workspace'
import { useAgentWorkspaceStore } from '../../stores/agent-workspace-store'
import { useAgentEditStagingStore } from '../../stores/agent-edit-staging-store'
import AgentMessageRenderer from './AgentMessageRenderer.vue'
import ChatComposer from '../chat/ChatComposer.vue'
import ReferenceDisplay from './ReferenceDisplay.vue'
import ReferenceManager from './ReferenceManager.vue'
import AgentComposerSendQueuePanel from './AgentComposerSendQueuePanel.vue'
import AgentReferencePicker from './AgentReferencePicker.vue'
import AgentManageMenuItems from './AgentManageMenuItems.vue'
import ContextBreakdownDialog from './ContextBreakdownDialog.vue'
import type { AgentMessage, AgentSession, ChatAgentMessage, ComposerSendQueueItem } from '../../types/agent'
import {
  applyComposerInterruptCleanup,
  clearComposerQueueDrainRetries,
  cloneReferenceStoreSnapshot,
  createComposerSendQueueItem,
  isAgentSessionReadyForNextLlmTurn,
  retryComposerQueueDrainLater
} from '../../utils/agent-composer-send-queue'
import type { StagingEditRecord } from '../../stores/agent-edit-staging-store'
import type { Reference } from '../../types/agent-framework'
import { createRendererLogger } from '../../utils/logger'
import { notifyError, notifyInfo, notifySuccess, notifyWarning } from '../../utils/notify'
import {
  agentEngineManager,
  agentConfigManager,
  agentSessionManager,
  AIContextManager
} from '../../utils/agent-framework'
import type { ContextBreakdown } from '../../utils/agent-framework'
import { generateConversationTitleByAi } from '../../utils/conversation-title'
import { cancelAiTask, useAiTasks } from '../../utils/ai_tasks'
import { processTextReference } from '../../utils/agent-framework/reference-processor'
import { isLikelyFilesystemReferenceOrigin } from '../../utils/agent-framework/reference-artifact-paths'
import messageBridge from '../../bridge/message-bridge'
import { useAgentManageUiStore } from '../../stores/agent-manage-ui-store'
import {
  getSessionComposerDraft,
  isAgentSessionPristine,
  pickLatestSessionIdAmongOpenTabs
} from '../../utils/agent-session-pristine'

const { t } = useI18n()
const workspace = useWorkspace()
const agentManageUi = useAgentManageUiStore()

function onCompactManageCommand(cmd: string) {
  agentManageUi.openManage(cmd)
}
const agentStore = useAgentWorkspaceStore()
const {
  sessions,
  activeSessionId,
  activeSession,
  openTabIds,
  composerInput,
  composerInputBySessionId,
  selectedEngineId,
  workspaceRoot
} = storeToRefs(agentStore)
const {
  setOpenTabIds,
  addGeneratingSession,
  removeGeneratingSession,
  isSessionGenerating,
  registerAgentRunHandle,
  unregisterAgentRunSession,
  getAgentRunHandlesForSession
} = agentStore

const isActiveSessionGenerating = computed(() =>
  isSessionGenerating(agentStore.activeSessionId)
)
const stagingStore = useAgentEditStagingStore()
const stagingPanelOpen = ref(false)
const stagingEdits = computed(() =>
  activeSession.value ? stagingStore.getEditsForSession(activeSession.value.id) : []
)
const hasPendingEdits = computed(() => stagingEdits.value.some((e) => e.status === 'pending'))

// 第一次出现 pending 编辑时自动展开暂存区，后续不再自动展开
watch(
  () => stagingEdits.value.filter((e) => e.status === 'pending').length,
  (pendingCount, prevPendingCount) => {
    if (pendingCount > 0 && (prevPendingCount ?? 0) === 0) {
      stagingPanelOpen.value = true
    }
  }
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

async function resolveAtExtraReferences(content: string): Promise<Reference[]> {
  const log = createRendererLogger('AgentViewCompact')
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

// 与 LeftMenu、ViewMenuContainer 及子面板一致：统一用 sidebarPanelBackground
const panelStyle = computed(() => ({
  backgroundColor:
    (themeState.currentTheme as { sidebarPanelBackground?: string }).sidebarPanelBackground ||
    themeState.currentTheme.background2nd ||
    themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

// 空状态 Logo 动画（与 DummyView 一致）
const emptyLogoShake = ref(false)
const emptyLogoBgColor = FIXED_LOGO_COLORS.bgColor
const emptyLogoSymbolColor = FIXED_LOGO_COLORS.symbolColor

function emptyLogoClick() {
  emptyLogoShake.value = true
  setTimeout(() => {
    emptyLogoShake.value = false
  }, 1500)
}

// openTabIds 来自 store（持久化）：校验 id、补全空 tab 列表；若有已打开 tab 但当前未选中任一 tab，则激活其中最近更新的会话
watch(
  () => ({
    sessionIds: sessions.value.map((s) => s.id),
    tabIds: [...openTabIds.value],
    activeId: activeSessionId.value
  }),
  ({ sessionIds, tabIds, activeId }) => {
    const set = new Set(sessionIds)
    let next = tabIds.filter((id) => set.has(id))
    if (next.length === 0 && sessionIds.length > 0) {
      const fallback = (activeId && set.has(activeId) ? activeId : null) ?? sessionIds[0] ?? null
      next = fallback ? [fallback] : []
    }
    if (
      next.length !== openTabIds.value.length ||
      next.some((id, i) => openTabIds.value[i] !== id)
    ) {
      setOpenTabIds(next)
    }
    const aid = activeSessionId.value
    if (next.length > 0 && (!aid || !next.includes(aid))) {
      const pick = pickLatestSessionIdAmongOpenTabs(next, sessions.value)
      if (pick) agentStore.setActiveSessionId(pick)
    }
  },
  { immediate: true }
)

// Tab 展示的会话列表（仅当前打开的 tab，按 openTabIds 顺序）
const displaySessions = computed(() => {
  const order = openTabIds.value
  return order
    .map((id) => sessions.value.find((s) => s.id === id))
    .filter((s): s is AgentSession => !!s)
})

// 历史下拉：按时间分组，最多展示 historyLimit 条
const historyLimit = ref(20)
const historyOpen = ref(false)

const HISTORY_LOAD_MORE = 10

const sortedSessionsForHistory = computed(() =>
  [...sessions.value].sort(
    (a, b) =>
      new Date(b.updatedAt || b.createdAt || 0).getTime() -
      new Date(a.updatedAt || a.createdAt || 0).getTime()
  )
)

function formatHistoryTime(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  if (dDay.getTime() === today.getTime()) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  if (dDay.getTime() === yesterday.getTime()) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  const weekAgo = new Date(today)
  weekAgo.setDate(weekAgo.getDate() - 7)
  if (dDay >= weekAgo) {
    return d.toLocaleDateString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

type HistoryGroup = { label: string; sessions: AgentSession[] }

const historyGroups = computed<HistoryGroup[]>(() => {
  const list = sortedSessionsForHistory.value.slice(0, historyLimit.value)
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterdayStart = new Date(todayStart)
  yesterdayStart.setDate(yesterdayStart.getDate() - 1)
  const weekStart = new Date(todayStart)
  weekStart.setDate(weekStart.getDate() - 7)
  const monthStart = new Date(todayStart)
  monthStart.setMonth(monthStart.getMonth() - 1)

  const today: AgentSession[] = []
  const yesterday: AgentSession[] = []
  const lastWeek: AgentSession[] = []
  const lastMonth: AgentSession[] = []
  const older: AgentSession[] = []

  for (const s of list) {
    const t = new Date(s.updatedAt || s.createdAt || 0)
    const dayStart = new Date(t.getFullYear(), t.getMonth(), t.getDate())
    if (dayStart.getTime() >= todayStart.getTime()) today.push(s)
    else if (dayStart.getTime() >= yesterdayStart.getTime()) yesterday.push(s)
    else if (dayStart.getTime() >= weekStart.getTime()) lastWeek.push(s)
    else if (dayStart.getTime() >= monthStart.getTime()) lastMonth.push(s)
    else older.push(s)
  }

  const groups: HistoryGroup[] = []
  if (today.length) groups.push({ label: t('agent.compact.today'), sessions: today })
  if (yesterday.length) groups.push({ label: t('agent.compact.yesterday'), sessions: yesterday })
  if (lastWeek.length) groups.push({ label: t('agent.compact.lastWeek'), sessions: lastWeek })
  if (lastMonth.length) groups.push({ label: t('agent.compact.lastMonth'), sessions: lastMonth })
  if (older.length) groups.push({ label: t('agent.compact.older'), sessions: older })
  return groups
})

const hasMoreHistory = computed(() => sortedSessionsForHistory.value.length > historyLimit.value)

// 最近会话下拉关闭时同步关闭右键菜单
watch(historyOpen, (open) => {
  if (!open) historyContextSession.value = null
})

// Tab 右键菜单
const tabContextSession = ref<AgentSession | null>(null)
const tabContextX = ref(0)
const tabContextY = ref(0)

function openTabContextMenu(e: MouseEvent, session: AgentSession) {
  tabContextSession.value = session
  tabContextX.value = e.clientX
  tabContextY.value = e.clientY
}

// 最近会话列表右键菜单（无关闭标签页）
const historyContextSession = ref<AgentSession | null>(null)
const historyContextX = ref(0)
const historyContextY = ref(0)

function openHistoryContextMenu(e: MouseEvent, session: AgentSession) {
  historyContextSession.value = session
  historyContextX.value = e.clientX
  historyContextY.value = e.clientY
}

async function confirmDeleteHistoryItem(session: AgentSession) {
  await deleteSession(session)
  historyOpen.value = false
}

function handleHistoryContextRename() {
  const s = historyContextSession.value
  historyContextSession.value = null
  historyOpen.value = false
  if (!s) return
  tabContextSession.value = s
  handleTabContextRename()
  tabContextSession.value = null
}

function handleHistoryContextExport() {
  const s = historyContextSession.value
  historyContextSession.value = null
  historyOpen.value = false
  if (!s) return
  tabContextSession.value = s
  handleTabContextExport()
  tabContextSession.value = null
}

function handleHistoryContextDuplicate() {
  const s = historyContextSession.value
  historyContextSession.value = null
  historyOpen.value = false
  if (!s) return
  tabContextSession.value = s
  handleTabContextDuplicate()
  tabContextSession.value = null
}

async function handleHistoryContextDelete() {
  const s = historyContextSession.value
  historyContextSession.value = null
  historyOpen.value = false
  if (!s) return
  await deleteSession(s)
}

function ensureActiveSessionId() {
  tabContextSession.value = null
  const open = displaySessions.value
  if (!open.length) {
    agentStore.setActiveSessionId(null)
    return
  }
  const current = agentStore.activeSessionId
  if (!current || !open.some((s) => s.id === current)) {
    agentStore.setActiveSessionId(open[0].id)
  }
}

/** 关闭 tab：仅从 tab 栏移除，会话仍保留，可从最近会话打开 */
function closeTab(session: AgentSession) {
  const idx = openTabIds.value.indexOf(session.id)
  if (idx === -1) return
  setOpenTabIds(openTabIds.value.filter((id) => id !== session.id))
  ensureActiveSessionId()
}

/** 从最近会话中打开：加入 tab 并选中 */
function openSessionFromHistory(session: AgentSession) {
  if (!openTabIds.value.includes(session.id)) {
    setOpenTabIds([session.id, ...openTabIds.value.filter((id) => id !== session.id)])
  }
  agentStore.setActiveSessionId(session.id)
}

// Tab 拖拽排序
const dragTabSession = ref<AgentSession | null>(null)

function handleTabDragStart(e: DragEvent, session: AgentSession) {
  dragTabSession.value = session
  e.dataTransfer?.setData('text/plain', session.id)
  e.dataTransfer!.effectAllowed = 'move'
}

function handleTabDragOver(e: DragEvent, session: AgentSession) {
  e.dataTransfer!.dropEffect = 'move'
}

function handleTabDrop(_e: DragEvent, targetSession: AgentSession) {
  const src = dragTabSession.value
  dragTabSession.value = null
  if (!src || src.id === targetSession.id) return
  const ids = [...openTabIds.value]
  const srcIdx = ids.indexOf(src.id)
  const tgtIdx = ids.indexOf(targetSession.id)
  if (srcIdx === -1 || tgtIdx === -1) return
  ids.splice(srcIdx, 1)
  ids.splice(tgtIdx, 0, src.id)
  setOpenTabIds(ids)
}

/** 删除会话：从 store 和 openTabIds 中移除，需至少保留一个会话 */
async function deleteSession(session: AgentSession) {
  if (sessions.value.length <= 1) {
    notifyWarning(t('agent.sessions.atLeastOneRequired'))
    return
  }
  try {
    await messageBox.confirm(
      t('agent.sessions.confirmDelete', { title: session.title }),
      t('agent.sessions.delete'),
      { type: 'warning' }
    )
    setOpenTabIds(openTabIds.value.filter((id) => id !== session.id))
    agentStore.setSessions(agentStore.sessions.filter((s) => s.id !== session.id))
    ensureActiveSessionId()
    persistSessions()
    notifySuccess(t('agent.sessions.deleteSuccess'))
    if (sessions.value.length === 0) createDefaultSession()
  } catch {
    /* cancel */
  }
}

function createDefaultSession() {
  try {
    const session = agentSessionManager.createSession(
      agentConfigManager.getDefaultConfigId(),
      t('agent.sessions.defaultTitle'),
      ''
    )
    const legacySession: AgentSession = {
      id: session.id,
      title: session.title,
      titleUserEdited: session.titleUserEdited ?? false,
      description: session.description,
      createdAt: new Date(session.createdAt).toISOString(),
      updatedAt: new Date(session.updatedAt).toISOString(),
      messages: session.messages,
      activeToolIds: [],
      agentConfigId: session.agentConfigId,
      messageQueue: session.messageQueue || [],
      referenceStore: session.referenceStore || [],
      publicContext: session.publicContext || {},
      executionNodes: session.executionNodes || [],
      status: session.status || 'idle'
    }
    agentStore.setSessions([legacySession])
    agentStore.setActiveSessionId(legacySession.id)
    setOpenTabIds([legacySession.id])
    persistSessions()
  } catch (err) {
    notifyError(err instanceof Error ? err.message : String(err))
  }
}

function handleTabContextClose() {
  const s = tabContextSession.value
  tabContextSession.value = null
  if (!s) return
  closeTab(s)
}

async function handleTabContextDelete() {
  const s = tabContextSession.value
  tabContextSession.value = null
  if (!s) return
  await deleteSession(s)
}

function handleTabContextRename() {
  const s = tabContextSession.value
  tabContextSession.value = null
  if (!s) return
  renameSession.value = s
  renameSessionTitle.value = s.title ?? ''
  showRenameSessionDialog.value = true
}

function handleConfirmRenameSession() {
  const s = renameSession.value
  if (!s) {
    showRenameSessionDialog.value = false
    return
  }
  const value = renameSessionTitle.value.trim()
  if (!value) {
    notifyWarning(t('agent.sessions.renameRequired'))
    return
  }
  s.title = value
  s.titleUserEdited = true
  touchSession(s)
  persistSessions()
  notifySuccess(t('agent.sessions.renameSuccess'))
  showRenameSessionDialog.value = false
  renameSession.value = null
  renameSessionTitle.value = ''
}

async function handleTabContextExport() {
  const s = tabContextSession.value
  tabContextSession.value = null
  if (!s) return
  try {
    const newFormatSession: any = {
      ...s,
      entityType: 'agent-session',
      createdAt: typeof s.createdAt === 'string' ? new Date(s.createdAt).getTime() : s.createdAt,
      updatedAt: typeof s.updatedAt === 'string' ? new Date(s.updatedAt).getTime() : s.updatedAt,
      messageQueue: s.messageQueue || [],
      referenceStore: s.referenceStore || [],
      publicContext: s.publicContext || {},
      executionNodes: s.executionNodes || [],
      status: s.status || 'idle'
    }
    const serialized = agentSessionManager.serializeSession(newFormatSession, false, {
      compact: true
    })
    const json = JSON.stringify(serialized, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `agent-session-${s.id}.json`
    a.click()
    URL.revokeObjectURL(url)
    notifySuccess(t('agent.sessions.exportSuccess'))
  } catch (err) {
    notifyError(err instanceof Error ? err.message : String(err))
  }
}

function handleTabContextDuplicate() {
  const s = tabContextSession.value
  tabContextSession.value = null
  if (!s) return
  try {
    const newFormatSession: any = {
      ...s,
      entityType: 'agent-session',
      createdAt: typeof s.createdAt === 'string' ? new Date(s.createdAt).getTime() : s.createdAt,
      updatedAt: typeof s.updatedAt === 'string' ? new Date(s.updatedAt).getTime() : s.updatedAt,
      messageQueue: s.messageQueue || [],
      referenceStore: s.referenceStore || [],
      publicContext: s.publicContext || {},
      executionNodes: s.executionNodes || [],
      status: s.status || 'idle'
    }
    const duplicated = agentSessionManager.duplicateSession(newFormatSession, undefined)
    const legacySession: AgentSession = {
      id: duplicated.id,
      title: duplicated.title,
      description: duplicated.description,
      createdAt: new Date(duplicated.createdAt).toISOString(),
      updatedAt: new Date(duplicated.updatedAt).toISOString(),
      messages: duplicated.messages,
      activeToolIds: [],
      agentConfigId: duplicated.agentConfigId,
      messageQueue: duplicated.messageQueue || [],
      referenceStore: duplicated.referenceStore || [],
      publicContext: duplicated.publicContext || {},
      executionNodes: duplicated.executionNodes || [],
      status: duplicated.status || 'idle'
    }
    agentStore.setSessions([legacySession, ...agentStore.sessions])
    agentStore.setActiveSessionId(duplicated.id)
    setOpenTabIds([legacySession.id, ...openTabIds.value.filter((id) => id !== legacySession.id)])
    persistSessions()
    notifySuccess(t('agent.sessions.duplicateSuccess'))
  } catch (err) {
    notifyError(err instanceof Error ? err.message : String(err))
  }
}

function createNewSession() {
  const cur = activeSession.value
  if (cur) {
    const draft = getSessionComposerDraft(
      cur.id,
      activeSessionId.value,
      composerInput.value,
      composerInputBySessionId.value
    )
    if (isAgentSessionPristine(cur, draft)) {
      agentStore.setActiveSessionId(cur.id)
      return
    }
  }
  try {
    const defaultConfigId = agentConfigManager.getDefaultConfigId()
    const session = agentSessionManager.createSession(
      defaultConfigId,
      t('agent.compact.newSessionTitle'),
      ''
    )
    const legacySession: AgentSession = {
      id: session.id,
      title: session.title,
      titleUserEdited: session.titleUserEdited ?? false,
      description: session.description,
      createdAt: new Date(session.createdAt).toISOString(),
      updatedAt: new Date(session.updatedAt).toISOString(),
      messages: session.messages,
      activeToolIds: [],
      agentConfigId: session.agentConfigId,
      messageQueue: session.messageQueue || [],
      referenceStore: session.referenceStore || [],
      publicContext: session.publicContext || {},
      executionNodes: session.executionNodes || [],
      status: session.status || 'idle'
    }
    agentStore.setSessions([legacySession, ...agentStore.sessions])
    agentStore.setActiveSessionId(session.id)
    setOpenTabIds([...openTabIds.value.filter((id) => id !== legacySession.id), legacySession.id])
    persistSessions()
  } catch (err) {
    notifyError(err instanceof Error ? err.message : String(err))
  }
}

const referencePickerOpen = ref(false)
const showReferenceDialog = ref(false)
const referenceSession = ref<AgentSession | null>(null)
const composerRef = ref<{
  insertAtCursor: (value: string) => void
  getContentForSubmit?: () => string
} | null>(null)

async function handleAttachFile(fileOrFiles?: File | File[]) {
  const session = activeSession.value
  if (!session) return
  try {
    const { processFileUpload } = await import('../../utils/agent-framework/reference-processor')
    const files = Array.isArray(fileOrFiles) ? fileOrFiles : fileOrFiles ? [fileOrFiles] : []
    if (files.length === 0) return
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
    const workspaceAttachmentOpts = { workspaceRoot: root, sessionId: session.id }
    const references: Reference[] = []
    for (const file of files) {
      try {
        const ref = await processFileUpload(file, undefined, undefined, {
          workspaceAttachment: workspaceAttachmentOpts
        })
        references.push(ref)
      } catch (e) {
        console.error(`处理文件 ${file.name} 失败:`, e)
      }
    }
    if (references.length > 0) {
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
      references.forEach((ref) => agentSessionManager.addReferenceObject(newFormatSession, ref))
      persistSessions()
      notifySuccess(
        references.length > 1
          ? t('agent.reference.addSuccessCount', { count: references.length })
          : t('agent.reference.addSuccess')
      )
    }
  } catch (err) {
    notifyError(err instanceof Error ? err.message : String(err))
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

async function handleReferencePickerFile(payload: { type: 'file'; path: string }) {
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

function openReferenceDialog() {
  if (activeSession.value) {
    referenceSession.value = activeSession.value
    showReferenceDialog.value = true
  }
}

const compactLogger = createRendererLogger('AgentViewCompact')

async function handleRemoveComposerReference(referenceId: string) {
  const session = activeSession.value
  if (!session?.referenceStore?.length) return
  const ref = session.referenceStore.find((r) => r.id === referenceId)
  if (!ref) return
  if (isLikelyFilesystemReferenceOrigin(ref.origin) && messageBridge.getIpc()) {
    try {
      await messageBridge.invoke('delete-reference-artifact-file', {
        absolutePath: ref.origin,
        workspaceRoot: workspaceRoot.value || undefined
      })
    } catch (err) {
      compactLogger.warn('[handleRemoveComposerReference] 删除引用文件失败', err)
    }
  }
  session.referenceStore = session.referenceStore.filter((r) => r.id !== referenceId)
  persistSessions()
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
  const session = activeSession.value
  if (!session) return
  if (attachPickerOpenInProgress.value) return
  attachPickerOpenInProgress.value = true
  try {
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

function handleReferenceUpdate() {
  persistSessions()
}

function stagingAccept(edit: StagingEditRecord) {
  stagingStore.acceptEdit(edit.id)
}

async function stagingReject(edit: StagingEditRecord) {
  try {
    await stagingStore.rejectEdit(edit)
  } catch (e) {
    notifyError(e instanceof Error ? e.message : String(e))
  }
}

async function stagingDismiss(edit: StagingEditRecord) {
  try {
    await stagingStore.removeEdit(edit)
  } catch (e) {
    notifyError(e instanceof Error ? e.message : String(e))
  }
}

function stagingAcceptAll() {
  if (activeSession.value) stagingStore.acceptAll(activeSession.value.id)
}

async function stagingRejectAll() {
  if (!activeSession.value) return
  try {
    await stagingStore.rejectAll(activeSession.value.id)
  } catch (e) {
    notifyError(e instanceof Error ? e.message : String(e))
  }
}

function openReviewWindow() {
  workspace.openToolTab('agentReview')
}

async function handleMessageRollback(message: AgentMessage) {
  const session = activeSession.value
  if (!session || message.role !== 'user') return
  try {
    const { rollbackByUserMessage } = stagingStore
    const { rolled } = await rollbackByUserMessage(session.id, message.id)
    if (rolled > 0) notifySuccess(t('agent.staging.rollbackDone', { count: rolled }))
  } catch (e) {
    notifyError(e instanceof Error ? e.message : String(e))
  }
}

async function handleMessageRedo(message: AgentMessage) {
  const session = activeSession.value
  if (!session || message.role !== 'user') return
  try {
    const { redoByUserMessage } = stagingStore
    const { redone } = await redoByUserMessage(session.id, message.id)
    if (redone > 0) notifySuccess(t('agent.staging.redoDone', { count: redone }))
  } catch (e) {
    notifyError(e instanceof Error ? e.message : String(e))
  }
}

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
    const container = document.querySelector(
      '.agent-compact-content .conversation-scroll [data-reka-scroll-area-viewport]'
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
  const idx = sessions.value.findIndex((s) => s.id === sessionId)
  if (idx === -1) return
  const session = sessions.value[idx]
  const q = session.composerSendQueue
  if (!q?.length) return
  const item = q.shift()!
  touchSession(session)
  persistSessions()
  session.referenceStore = cloneReferenceStoreSnapshot(item.referenceSnapshot) as AgentSession['referenceStore']
  if (!runComposerSendPipelineForSessionRef) return
  try {
    await runComposerSendPipelineForSessionRef(session, item.markdown)
  } catch (e) {
    createRendererLogger('AgentViewCompact').error('[composerSendQueue] flush failed', e)
  }
}

const handleComposerReset = () => {
  agentStore.setComposerInput('')
}

const executeAgentEngine = async (
  userMessage: string,
  actualSession?: AgentSession,
  extraReferences?: Reference[]
) => {
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

  const abortController = new AbortController()

  session.status = 'thinking'

  try {
    const { AgentEngineExecutorFactory } = await import(
      '../../utils/agent-framework/agent-engine-executor'
    )
    const lastUserMsg = session.messages
      .filter((m: any) => m.role === 'user' && m.type === 'chat')
      .slice(-1)[0] as ChatAgentMessage | undefined
    const refIds =
      lastUserMsg?.referenceIds && lastUserMsg.referenceIds.length > 0
        ? lastUserMsg.referenceIds
        : (session.referenceStore || []).map((r) => r.id)
    const executor = AgentEngineExecutorFactory.create(engine, session as any, agentConfig, {
      signal: abortController.signal,
      activeReferenceIds: refIds,
      extraReferences,
      onProgress: (progress: any) => {
        session.status = progress.stage as any
        // 注意：不要在流式输出期间频繁持久化（可能破坏 reactive 对象）
      },
      onTaskCreated: (handle: string) => {
        registerAgentRunHandle(session.id, handle)
      }
    })

    await executor.execute(composeIntentUserText(session, userMessage))

    session.status = 'idle'
    persistSessions()
    scrollToBottom()
  } catch (error) {
    const logger = createRendererLogger('AgentViewCompact')
    const isCancelled =
      error instanceof Error &&
      (error.message === t('agentViewCompact.cancelled') ||
        error.message.includes(t('agentViewCompact.cancelled')) ||
        error.name === 'AbortError')

    if (isCancelled) {
      logger.debug('Agent引擎任务已取消')
      applyComposerInterruptCleanup(session, t('agent.task.cancelled'))
      session.status = 'idle'
      persistSessions()
      return
    }

    logger.error('Agent引擎执行失败:', error)
    session.status = 'error'
    persistSessions()
    throw error
  } finally {
    unregisterAgentRunSession(session.id)
    removeGeneratingSession(session.id)
    scheduleComposerQueueDrain(session.id)
  }
}

runComposerSendPipelineForSessionRef = async (session: AgentSession, content: string) => {
  const logger = createRendererLogger('AgentViewCompact')
  const liveSession = sessions.value.find((s) => s.id === session.id)
  if (!liveSession) {
    logger.error('[runComposerSendPipeline] 会话不在列表中', session.id)
    return
  }

  if (liveSession.activeToolIds) liveSession.activeToolIds = []

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
      .catch(() => {})
  }

  agentStore.setComposerInput('')
  nextTick(() => agentStore.setComposerInput(''))
  persistSessions()
  scrollToBottom()

  try {
    await executeAgentEngine(content, liveSession, extraRefs)
  } catch (error) {
    logger.error('[runComposerSendPipeline] 执行失败:', error)
    notifyError(error instanceof Error ? error.message : String(error))
  }
}

const handleComposerSubmit = async (_enableKB?: boolean, contentFromEvent?: string) => {
  const logger = createRendererLogger('AgentViewCompact')
  const session = activeSession.value
  if (!session) return

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
  if (!content) return

  if (isSessionGenerating(session.id)) {
    if (!session.composerSendQueue) session.composerSendQueue = []
    session.composerSendQueue.push(
      createComposerSendQueueItem(content, cloneReferenceStoreSnapshot(session.referenceStore))
    )
    notifyInfo(t('agent.composer.queuedHint'))
    touchSession(session)
    agentStore.setComposerInput('')
    nextTick(() => agentStore.setComposerInput(''))
    session.referenceStore = []
    persistSessions()
    scrollToBottom()
    return
  }

  if (!runComposerSendPipelineForSessionRef) {
    logger.error('[handleComposerSubmit] 发送管线未初始化')
    return
  }
  await runComposerSendPipelineForSessionRef(session, content)
}

const handleCancelGeneration = () => {
  const session = activeSession.value
  if (!session) return

  const allTasks = useAiTasks()
  const relatedTasks = allTasks.value.filter((task) => {
    const key = (task as any).origin_key
    return (
      key &&
      typeof key === 'string' &&
      (key.includes(session.id) || key.startsWith(`agent-${session.id}-`))
    )
  })

  relatedTasks.forEach((task: { handle: string }) => cancelAiTask(task.handle, false))

  getAgentRunHandlesForSession(session.id).forEach((handle) => cancelAiTask(handle, false))
  unregisterAgentRunSession(session.id)
  removeGeneratingSession(session.id)

  session.status = 'idle'
  applyComposerInterruptCleanup(session, t('agent.task.cancelled'))
  persistSessions()
  scheduleComposerQueueDrain(session.id)
}

// 消息编辑
const showEditMessageDialog = ref(false)
const editingMessage = ref<ChatAgentMessage | null>(null)
const editingMessageContent = ref('')

// 会话重命名（用自有 Dialog 替代 ElMessageBox.prompt，避免与 Monaco context 冲突）
const showRenameSessionDialog = ref(false)
const renameSession = ref<AgentSession | null>(null)
const renameSessionTitle = ref('')

watch(showRenameSessionDialog, (open) => {
  if (!open) {
    renameSession.value = null
    renameSessionTitle.value = ''
  }
})

function handleMessageEdit(message: AgentMessage) {
  if (message.role !== 'user' || message.type !== 'chat') return
  editingMessage.value = message as ChatAgentMessage
  editingMessageContent.value = message.markdown || ''
  showEditMessageDialog.value = true
}

function cleanupUnfinishedToolCalls(session: AgentSession) {
  const toolCallIds = new Set<string>()
  for (let i = 0; i < session.messages.length; i++) {
    const msg = session.messages[i]
    if (msg.role === 'assistant' && msg.type === 'chat') {
      const toolCalls = (msg as any).tool_calls
      if (toolCalls?.length) {
        for (const tc of toolCalls) {
          if (tc.id) toolCallIds.add(tc.id)
        }
      }
    } else if (msg.role === 'tool' && msg.type === 'tool') {
      const tid = (msg as any).tool_call_id
      if (tid) toolCallIds.delete(tid)
    }
  }
  if (toolCallIds.size === 0) return
  for (let i = 0; i < session.messages.length; i++) {
    const msg = session.messages[i]
    if (msg.role === 'assistant' && msg.type === 'chat') {
      const toolCalls = (msg as any).tool_calls
      if (toolCalls?.length) {
        const completed = toolCalls.filter((tc: any) => tc.id && toolCallIds.has(tc.id))
        if (completed.length === 0) delete (msg as any).tool_calls
        else (msg as any).tool_calls = completed
      }
    }
  }
}

async function handleConfirmEditMessage() {
  const session = activeSession.value
  if (!editingMessage.value || !session) return
  if (isSessionGenerating(session.id)) {
    notifyWarning(t('agent.sessions.alreadyGenerating'))
    return
  }
  const content = editingMessageContent.value.trim()
  if (!content) {
    notifyWarning(t('agent.message.editPlaceholder'))
    return
  }
  const messageIndex = session.messages.findIndex((m) => m.id === editingMessage.value!.id)
  if (messageIndex === -1) return
  const message = session.messages[messageIndex] as ChatAgentMessage
  message.markdown = content
  session.messages = session.messages.slice(0, messageIndex + 1)
  cleanupUnfinishedToolCalls(session)
  touchSession(session)
  persistSessions()
  notifySuccess(t('agent.message.editSuccess'))
  showEditMessageDialog.value = false
  editingMessage.value = null
  editingMessageContent.value = ''
  try {
    const live = sessions.value.find((s) => s.id === session.id) ?? session
    await executeAgentEngine(content, live)
  } catch (err) {
    notifyError(err instanceof Error ? err.message : String(err))
  }
}

async function handleMessageRegenerate(message: AgentMessage) {
  const session = activeSession.value
  if (!session) return
  // 只允许在用户消息下重新生成，AI 与 tool 消息不提供重新生成以免造成状态错乱
  if (message.role !== 'user' || message.type !== 'chat') return
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

  showEditMessageDialog.value = false
  editingMessage.value = null
  editingMessageContent.value = ''

  // 删除该条用户消息之后的所有内容（消息、工具调用、意图识别等），当作从未发生过
  session.messages = session.messages.slice(0, messageIndex + 1)
  cleanupUnfinishedToolCalls(session)
  if (session.messageQueue) session.messageQueue = []
  if (session.executionNodes) session.executionNodes = []
  touchSession(session)
  persistSessions()

  try {
    const live = sessions.value.find((s) => s.id === session.id) ?? session
    await executeAgentEngine((message as ChatAgentMessage).markdown, live)
  } catch (err) {
    notifyError(err instanceof Error ? err.message : String(err))
  }
}

async function handleMessageDelete(message: AgentMessage) {
  const session = activeSession.value
  if (!session) return
  try {
    await messageBox.confirm(t('agent.message.confirmDelete'), t('agent.message.delete'), {
      type: 'warning'
    })
    const messageIndex = session.messages.findIndex((m) => m.id === message.id)
    if (messageIndex !== -1) {
      session.messages = session.messages.slice(0, messageIndex)
      touchSession(session)
      persistSessions()
      notifySuccess(t('agent.message.deleteSuccess'))
    }
  } catch {
    /* cancel */
  }
}

async function handleMessageDuplicate(message: AgentMessage) {
  const session = activeSession.value
  if (!session) return
  const messageIndex = session.messages.findIndex((m) => m.id === message.id)
  if (messageIndex === -1) return
  try {
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
    const duplicated = agentSessionManager.duplicateSession(newFormatSession, message.id)
    const legacySession: AgentSession = {
      id: duplicated.id,
      title: duplicated.title,
      description: duplicated.description,
      createdAt: new Date(duplicated.createdAt).toISOString(),
      updatedAt: new Date(duplicated.updatedAt).toISOString(),
      messages: duplicated.messages,
      activeToolIds: [],
      agentConfigId: duplicated.agentConfigId,
      messageQueue: duplicated.messageQueue || [],
      referenceStore: duplicated.referenceStore || [],
      publicContext: duplicated.publicContext || {},
      executionNodes: duplicated.executionNodes || [],
      status: duplicated.status || 'idle'
    }
    agentStore.setSessions([legacySession, ...agentStore.sessions])
    agentStore.setActiveSessionId(duplicated.id)
    setOpenTabIds([legacySession.id, ...openTabIds.value.filter((id) => id !== legacySession.id)])
    persistSessions()
    notifySuccess(t('agent.sessions.duplicateSuccess'))
  } catch (err) {
    notifyError(err instanceof Error ? err.message : String(err))
  }
}

onMounted(async () => {
  // 紧凑面板：确保工作区会话已加载（openTabIds / active 由上方 watch 与 store 加载逻辑统一校正）
  if (!sessions.value.length) {
    await agentStore.init()
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
  font-size: 13px;
}

.agent-compact-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.22);
  flex-shrink: 0;
  min-height: 28px;
}

.agent-compact-tabs {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 2px;
  overflow-x: auto;
  scrollbar-width: none;
}

.agent-compact-tabs::-webkit-scrollbar {
  display: none;
}

.agent-compact-tab-wrap {
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  max-width: 140px;
}

.agent-compact-tab {
  flex: 1;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px 2px 8px;
  font-size: 12px;
  line-height: 1.3;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  opacity: 0.75;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-compact-tab-spinner {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  opacity: 0.85;
  animation: agent-compact-tab-spin 0.85s linear infinite;
}

@keyframes agent-compact-tab-spin {
  to {
    transform: rotate(360deg);
  }
}

.agent-compact-tab:hover:not(:disabled) {
  opacity: 1;
  background: rgba(128, 128, 128, 0.12);
}

.agent-compact-tab.active {
  opacity: 1;
  font-weight: 600;
  background: rgba(128, 128, 128, 0.18);
}

.agent-compact-tab:disabled {
  cursor: not-allowed;
}

.agent-compact-tab-label {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-compact-tab-close {
  position: absolute;
  right: 2px;
  width: 16px;
  height: 16px;
  padding: 0;
  opacity: 0;
  flex-shrink: 0;
  border-radius: 3px;
  background: var(--el-fill-color, #e8e8e8);
}

.agent-compact-tab-wrap:hover .agent-compact-tab-close {
  opacity: 1;
}

.agent-compact-tab-close:hover {
  background: var(--el-fill-color-dark, #d0d0d0);
}

.agent-compact-tab-close svg {
  width: 10px;
  height: 10px;
}

.agent-compact-tab-context {
  position: fixed;
  z-index: 1000;
  min-width: 140px;
  padding: 4px 0;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  box-shadow: var(--el-box-shadow-light);
}

/* 最近会话内右键菜单：高于下拉层 z-[10001] */
.agent-compact-history-context {
  z-index: 10002;
}

.agent-compact-tab-context-item {
  display: block;
  width: 100%;
  padding: 6px 12px;
  font-size: 12px;
  text-align: left;
  border: none;
  background: transparent;
  color: var(--el-text-color-primary);
  cursor: pointer;
}

.agent-compact-tab-context-item:hover {
  background: var(--el-fill-color-light);
}

.agent-compact-tab-context-item-danger {
  color: var(--el-color-danger);
}

.agent-compact-header-actions {
  display: flex;
  align-items: center;
  gap: 0;
  flex-shrink: 0;
}

.agent-compact-header-btn {
  width: 22px;
  height: 22px;
  padding: 0;
}

.agent-compact-header-btn svg {
  width: 14px;
  height: 14px;
}

.agent-compact-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 允许对话区域文字选中、复制 */
.agent-compact-selectable,
.agent-compact-selectable :deep(.md-editor),
.agent-compact-selectable :deep(.md-editor-preview),
.agent-compact-selectable :deep(.agent-message__content) {
  user-select: text !important;
  -webkit-user-select: text !important;
}

/* 紧凑模式：Markdown 渲染字号缩小 */
.agent-compact-selectable :deep(.md-editor-preview),
.agent-compact-selectable :deep(.md-editor-preview-wrapper) {
  font-size: 13px;
  line-height: 1.45;
}

.agent-compact-selectable :deep(.md-editor-preview h1) {
  font-size: 1.25em;
}
.agent-compact-selectable :deep(.md-editor-preview h2) {
  font-size: 1.15em;
}
.agent-compact-selectable :deep(.md-editor-preview h3) {
  font-size: 1.08em;
}
.agent-compact-selectable :deep(.md-editor-preview h4),
.agent-compact-selectable :deep(.md-editor-preview h5),
.agent-compact-selectable :deep(.md-editor-preview h6) {
  font-size: 1em;
}
.agent-compact-selectable :deep(.md-editor-preview p),
.agent-compact-selectable :deep(.md-editor-preview li) {
  font-size: 13px;
}
.agent-compact-selectable :deep(.md-editor-preview pre),
.agent-compact-selectable :deep(.md-editor-preview code) {
  font-size: 12px;
}

.conversation-scroll {
  flex: 1;
  min-height: 0;
  padding: 6px 8px;
  font-size: 13px;
}

.conversation-bottom-spacer {
  height: 8px;
}

.agent-compact-composer {
  padding: 4px 6px;
  border-top: 1px solid rgba(128, 128, 128, 0.22);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.agent-compact-ref-display {
  min-height: 0;
}

.agent-compact-composer-leading {
  display: flex;
  align-items: center;
  gap: 2px;
  align-self: flex-end;
}

.agent-compact-composer-btn {
  width: 22px;
  height: 22px;
  padding: 0;
}

.agent-compact-composer-btn-icon {
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

.agent-compact-composer :deep(.chat-composer) {
  width: 100%;
}

.agent-compact-attach-dropdown {
  font-size: 12px;
  min-width: 120px;
}

.agent-compact-attach-dropdown [data-reka-menu-item] {
  font-size: 12px;
  padding: 6px 10px;
}

/* 编辑暂存面板 */
.agent-compact-staging {
  flex-shrink: 0;
  border-top: 1px solid rgba(128, 128, 128, 0.2);
}

.agent-compact-staging-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
}

.agent-compact-staging-trigger:hover,
.agent-compact-staging-trigger.has-items {
  color: var(--el-text-color-primary);
}

.agent-compact-staging-chevron {
  width: 12px;
  height: 12px;
}

.agent-compact-staging-content {
  max-height: 180px;
  overflow-y: auto;
  padding: 4px 8px 8px;
  font-size: 11px;
}

.agent-compact-staging-empty {
  padding: 6px 0;
  color: var(--el-text-color-secondary);
}

.agent-compact-staging-actions {
  display: flex;
  gap: 4px;
  margin-bottom: 4px;
}

/* 底部按钮：紧凑高度，背景色区分，文字颜色一致 */
.agent-staging-btn {
  height: 24px;
  min-height: 24px;
  padding: 0 8px;
  font-size: 11px;
  line-height: 22px;
  color: #fff !important;
}
.agent-staging-btn-accept {
  background: var(--el-color-success) !important;
}
.agent-staging-btn-accept:hover {
  opacity: 0.9;
  color: #fff !important;
}
.agent-staging-btn-reject {
  background: var(--el-color-danger) !important;
}
.agent-staging-btn-reject:hover {
  opacity: 0.9;
  color: #fff !important;
}
.agent-staging-btn-review {
  background: var(--el-fill-color) !important;
  color: var(--el-text-color-primary) !important;
}
.agent-staging-btn-review:hover {
  background: var(--el-fill-color-dark) !important;
  color: var(--el-text-color-primary) !important;
}

.agent-compact-staging-item-close {
  flex-shrink: 0;
  margin-left: auto;
  opacity: 0.6;
}
.agent-compact-staging-item-close:hover {
  opacity: 1;
}

.agent-compact-staging-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.agent-compact-staging-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 4px;
  background: rgba(128, 128, 128, 0.06);
}

.agent-compact-staging-item-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-compact-staging-item-diff {
  display: flex;
  gap: 4px;
}

.agent-compact-staging-item-diff .add {
  color: var(--el-color-success);
}

.agent-compact-staging-item-diff .del {
  color: var(--el-color-danger);
}

.agent-compact-staging-item-btns {
  display: flex;
  gap: 2px;
}

.agent-compact-staging-item-status {
  font-size: 10px;
  color: var(--el-text-color-secondary);
}

.agent-compact-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
}

.agent-compact-empty-logo {
  display: inline-block;
  transition: transform 0.3s ease;
  cursor: pointer;
}

.agent-compact-empty-logo:hover {
  transform: scale(1.2);
}

.agent-compact-empty-logo.shake {
  transform: scale(1.2);
}

.agent-compact-empty-logo.shake:hover {
  transform: scale(1.2);
}

.agent-compact-empty .logo-animation-wrapper {
  display: inline-block;
}

.agent-compact-empty .logo-image {
  display: block;
  filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.15));
}

@keyframes agent-compact-shake {
  0%,
  100% {
    transform: translateX(0) rotate(0deg);
  }
  10%,
  30%,
  50%,
  70%,
  90% {
    transform: translateX(-10px) rotate(-5deg);
  }
  20%,
  40%,
  60%,
  80% {
    transform: translateX(10px) rotate(5deg);
  }
}

.agent-compact-empty-logo.shake .logo-animation-wrapper {
  animation: agent-compact-shake 1.5s ease-in-out;
}

/* 历史下拉：固定最大高度，内部用 el-scrollbar 滚动 */
.agent-compact-history-dropdown {
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-width: 200px;
}

.agent-compact-history-list-wrap {
  min-width: 200px;
  overflow: hidden;
}

.agent-compact-history-scrollbar {
  flex: 1;
  min-height: 0;
}

.agent-compact-history-scrollbar :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
}

.agent-compact-history-list {
  min-width: 200px;
  padding: 4px 0;
}

.agent-compact-history-group-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  padding: 4px 8px 2px;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.agent-compact-history-item {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  padding: 2px 6px 2px 8px;
  font-size: 12px;
  min-height: 24px;
  cursor: pointer;
}

.agent-compact-history-row {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
}

.agent-compact-history-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.agent-compact-history-time {
  font-size: 10px;
  opacity: 0.7;
  flex-shrink: 0;
}

.agent-compact-history-item-close {
  width: 18px;
  height: 18px;
  padding: 0;
  opacity: 0.6;
  flex-shrink: 0;
  border-radius: 3px;
}

.agent-compact-history-item:hover .agent-compact-history-item-close {
  opacity: 1;
}

.agent-compact-history-item-close:hover {
  background: var(--el-fill-color-dark, rgba(128, 128, 128, 0.2));
}

.agent-compact-history-item-close svg {
  width: 10px;
  height: 10px;
}

.agent-compact-history-more {
  font-size: 12px;
  border-top: 1px solid rgba(128, 128, 128, 0.15);
  margin-top: 4px;
  padding: 6px 8px 6px 12px;
  cursor: pointer;
  color: var(--el-text-color-primary);
  background: transparent;
  border: none;
  border-radius: 0;
  width: 100%;
  text-align: left;
  outline: none;
}

.agent-compact-history-more:hover {
  background: var(--el-fill-color-light, rgba(128, 128, 128, 0.08));
}

.agent-rename-input {
  width: 100%;
  padding: 8px 12px;
  font-size: 14px;
  line-height: 1.5;
  border: 1px solid var(--el-border-color, #dcdfe6);
  border-radius: 6px;
  background: var(--el-fill-color-blank, #fff);
  color: var(--el-text-color-primary);
}
.agent-rename-input:focus {
  outline: none;
  border-color: var(--el-color-primary);
}
</style>
