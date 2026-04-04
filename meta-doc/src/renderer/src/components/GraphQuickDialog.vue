<template>
  <Dialog v-model:open="dialogOpen">
    <DialogContent
      class="graph-quick-dialog graph-quick-dialog--shell w-[min(960px,92vw)] max-w-[min(960px,92vw)] gap-0 overflow-hidden p-0"
      :style="dialogSurfaceStyle"
    >
      <div
        class="graph-quick-dialog__root flex h-full max-h-[min(900px,92vh)] min-h-[520px] flex-col overflow-hidden p-4"
      >
        <DialogHeader class="shrink-0 space-y-1 pb-2">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <DialogTitle class="text-base">{{ t('graph.quickDialogTitle') }}</DialogTitle>
            <Button variant="outline" size="sm" :disabled="!sessionId" @click="openInGraphTool">
              {{ t('graph.openInGraphTool') }}
            </Button>
          </div>
          <p class="text-xs leading-relaxed opacity-80">{{ t('graph.quickDialogPersistHint') }}</p>
        </DialogHeader>

        <div
          v-if="preparing"
          class="flex min-h-[200px] flex-1 items-center justify-center text-sm opacity-70"
        >
          {{ t('common.loading', '加载中...') }}
        </div>

        <template v-else>
          <div class="graph-quick-dialog__body flex min-h-0 flex-1 flex-col overflow-hidden">
            <div class="dialog-container">
              <LoadingOverlay :show="loadingSession" :message="t('common.loading', '加载中...')" />
              <div class="conversation-scroll-host">
                <el-scrollbar
                  ref="conversationScrollbarRef"
                  class="conversation-scroll"
                  height="100%"
                  always
                >
                  <GraphMessageBubble
                    v-for="(msg, index) in messages.filter((m) => m.role !== 'system')"
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
              </div>
              <div class="composer-wrapper">
                <ChatComposer
                  v-model="currentPrompt"
                  class="conversation-composer graph-quick-dialog-composer"
                  :loading="generating || analyzingIntent"
                  :disabled="!sessionId"
                  :placeholder="t('graph.inputPlaceholder')"
                  :show-voice="false"
                  :show-attach="false"
                  :show-knowledge-base="false"
                  :show-reasoning="true"
                  :compact="false"
                  :show-primary-submit="!isFirstRound"
                  @submit="handleGenerate"
                  @cancel="handleCancel"
                />
              </div>
            </div>

            <DialogFooter
              class="shrink-0 flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3 sm:justify-end"
            >
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button variant="secondary" size="sm" :disabled="!latestChart">
                    {{ t('graph.copyCode') }}
                    <ChevronDown class="ml-1 h-4 w-4 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem :disabled="!latestChart" @click="copyMarkdown">
                    {{ t('graph.copyMarkdown') }}
                  </DropdownMenuItem>
                  <DropdownMenuItem :disabled="!latestChart" @click="copyLatexListing">
                    {{ t('graph.copyLatexCode') }}
                  </DropdownMenuItem>
                  <DropdownMenuItem :disabled="!latestChart" @click="copyLatexIncludegraphics">
                    {{ t('graph.copyLatexIncludegraphics') }}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="secondary" size="sm" :disabled="!latestChart" @click="handleExport()">
                {{ t('graph.exportChart') }}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                :disabled="!lastExportedFilePath"
                @click="openExportedFolder"
              >
                {{ t('graph.openExportFolder') }}
              </Button>
              <Button
                v-if="isFirstRound"
                :variant="generating || analyzingIntent ? 'destructive' : 'default'"
                size="sm"
                :disabled="footerFirstRoundDisabled"
                @click="onFooterFirstRoundPrimary"
              >
                {{
                  generating || analyzingIntent
                    ? t('aiChat.cancelTooltip')
                    : t('graph.quickDialogGenerateChart')
                }}
              </Button>
              <Button
                v-else
                variant="default"
                size="sm"
                :disabled="!latestChart"
                @click="insertIntoDocument"
              >
                {{ t('graph.insertIntoDocument') }}
              </Button>
            </DialogFooter>
          </div>
        </template>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronDown } from 'lucide-vue-next'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { LoadingOverlay } from '@renderer/components/ui/loading-overlay'
import { themeState } from '@renderer/utils/themes'
import { useGraphSessionFlow } from '@renderer/composables/useGraphSessionFlow'
import type { GraphMessage } from '@renderer/composables/useGraphSessionFlow'
import { graphSessionsDb } from '@renderer/utils/db/tool-sessions-db'
import { useWorkspace } from '@renderer/stores/workspace'
import GraphMessageBubble from '@renderer/components/GraphMessageBubble.vue'
import ChatComposer from '@renderer/components/chat/ChatComposer.vue'
import messageBridge from '@renderer/bridge/message-bridge'
import eventBus from '@renderer/utils/event-bus'
import { toast } from '@renderer/utils/toast'

const props = withDefaults(
  defineProps<{
    open: boolean
    selectionText: string
    documentKind?: 'md' | 'tex'
    documentTitle?: string
    /** 触发对话框的文档标签页，插入内容时直接写入该页 */
    sourceTabId?: string
  }>(),
  {
    documentKind: 'md',
    documentTitle: '',
    sourceTabId: ''
  }
)

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const { t } = useI18n()
const workspace = useWorkspace()

const dialogOpen = computed({
  get: () => props.open,
  set: (v: boolean) => emit('update:open', v)
})

const sessionId = ref<string | null>(null)
const quickSessionTitle = ref('')
const preparing = ref(false)
const conversationScrollbarRef = ref<{ wrapRef?: HTMLElement } | null>(null)

const dialogSurfaceStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd,
  color: themeState.currentTheme.textColor
}))

const {
  currentPrompt,
  generating,
  analyzingIntent,
  loadingSession,
  messages,
  lastExportedFilePath,
  streamingContent,
  streamingReasoning,
  isStreaming,
  handleGenerate,
  handleCancel,
  onMsgDelete,
  onMsgEdit,
  regenerate,
  handleExport,
  resetConversation
} = useGraphSessionFlow({
  activeSessionId: sessionId,
  getActiveSessionTitle: () => quickSessionTitle.value || t('graph.defaultTitle', '新绘图会话'),
  onPersisted: async () => {
    eventBus.emit('graph-sessions-changed')
  },
  persistEnabled: () => true
})

function scrollConversationToBottom() {
  nextTick(() => {
    const inst = conversationScrollbarRef.value as unknown as { wrapRef?: HTMLElement } | null
    const wrap = inst?.wrapRef
    if (wrap) {
      wrap.scrollTop = wrap.scrollHeight
    }
  })
}

watch(
  () => [
    messages.value.length,
    streamingContent.value,
    streamingReasoning.value,
    generating.value,
    analyzingIntent.value,
    isStreaming.value
  ],
  () => scrollConversationToBottom(),
  { flush: 'post' }
)

const latestChart = computed(() => {
  for (let i = messages.value.length - 1; i >= 0; i--) {
    const m = messages.value[i]
    if (m.role === 'assistant' && m.chartMarkdown) return m.chartMarkdown
  }
  return null
})

/** 尚未发出过用户消息（仅含欢迎语等）时为首轮，由页脚「生成图表」替代输入框发送按钮 */
const isFirstRound = computed(
  () => messages.value.filter((m) => m.role === 'user').length === 0
)

const promptHasContent = computed(() => (currentPrompt.value || '').trim().length > 0)

const footerFirstRoundDisabled = computed(() => {
  if (!sessionId.value) return true
  if (generating.value || analyzingIntent.value) return false
  return !promptHasContent.value
})

function onFooterFirstRoundPrimary() {
  if (generating.value || analyzingIntent.value) {
    handleCancel()
  } else {
    handleGenerate()
  }
}

function buildWelcomeMessage(): GraphMessage {
  return {
    role: 'assistant',
    content: t('graph.quickDialogWelcome'),
    timestamp: Date.now()
  }
}

function buildDefaultPrompt(selection: string): string {
  const intro = t('graph.quickDialogDefaultPromptIntro')
  return `${intro}\n\n---\n${selection.trim()}\n---`
}

async function prepareSession() {
  preparing.value = true
  try {
    resetConversation()
    const id = `graph-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
    const doc = (props.documentTitle || '').trim() || t('article.untitled_document', '未命名文档')
    const snippet = props.selectionText.trim().replace(/\s+/g, ' ').slice(0, 28)
    const title = t('graph.quickSessionTitle', { doc, snippet: snippet || '…' })
    const welcome = buildWelcomeMessage()
    const initialHistory: GraphMessage[] = [welcome]

    await graphSessionsDb.create({
      id,
      title,
      description: '',
      conversation_history: JSON.stringify(initialHistory),
      current_prompt: '',
      output_format: 'svg',
      output_path: undefined
    })

    sessionId.value = id
    quickSessionTitle.value = title
    messages.value = [...initialHistory]
    currentPrompt.value = buildDefaultPrompt(props.selectionText)
    eventBus.emit('graph-sessions-changed')
  } catch (e) {
    toast.error(t('graph.quickDialogSessionError'))
    dialogOpen.value = false
  } finally {
    preparing.value = false
    scrollConversationToBottom()
  }
}

watch(
  () => props.open,
  async (o) => {
    if (o) {
      await prepareSession()
      scrollConversationToBottom()
    } else {
      sessionId.value = null
      quickSessionTitle.value = ''
      resetConversation()
    }
  }
)

function openInGraphTool() {
  if (!sessionId.value) return
  const tab = workspace.openToolTab('graph')
  workspace.setTabToolState(tab.id, { activeSessionId: sessionId.value })
  dialogOpen.value = false
}

async function copyMarkdown() {
  const c = latestChart.value
  if (!c) return
  try {
    await navigator.clipboard.writeText(c)
    toast.success(t('common.copySuccess', '复制成功'))
  } catch {
    toast.error(t('common.copyFailed', '复制失败'))
  }
}

function escapeLatexVerb(s: string): string {
  return s
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
}

async function copyLatexListing() {
  const c = latestChart.value
  if (!c) return
  const body = escapeLatexVerb(c)
  const block = `\\begin{lstlisting}[basicstyle=\\ttfamily\\footnotesize]\n${body}\n\\end{lstlisting}`
  try {
    await navigator.clipboard.writeText(block)
    toast.success(t('common.copySuccess', '复制成功'))
  } catch {
    toast.error(t('common.copyFailed', '复制失败'))
  }
}

async function copyLatexIncludegraphics() {
  const path = lastExportedFilePath.value
  const normalized = path ? path.replace(/\\/g, '/') : 'figures/your-figure.png'
  const block = `\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=0.85\\linewidth]{${normalized}}\n  \\caption{}\n  \\label{fig:generated}\n\\end{figure}`
  try {
    await navigator.clipboard.writeText(block)
    toast.success(t('common.copySuccess', '复制成功'))
  } catch {
    toast.error(t('common.copyFailed', '复制失败'))
  }
}

async function openExportedFolder() {
  const p = lastExportedFilePath.value
  if (!p || !messageBridge.getIpc()) return
  try {
    await messageBridge.invoke('show-item-in-folder', p)
  } catch (e) {
    toast.error(String(e instanceof Error ? e.message : e))
  }
}

function insertIntoDocument() {
  const c = latestChart.value
  if (!c) return
  const tabId = (props.sourceTabId || '').trim()
  if (tabId) {
    eventBus.emit('ai-chat-insert-to-document', { content: c, tabId })
  } else {
    eventBus.emit('ai-chat-request-insert-to-document', { content: c })
  }
  dialogOpen.value = false
}
</script>

<style scoped>
.graph-quick-dialog__body {
  flex: 1 1 0;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dialog-container {
  /* flex: 1 1 0 + min-height:0 避免子项 min-height:auto 被内容撑爆，el-scrollbar 才能限高滚动 */
  flex: 1 1 0;
  width: 100%;
  min-width: 0;
  min-height: 0;
  background-color: rgba(170, 221, 255, 0.11);
  padding: 12px 20px 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.dialog-container .conversation-scroll {
  padding: 0;
}

.conversation-scroll-host {
  flex: 1 1 0;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* class 挂在 el-scrollbar 根节点上：必须 min-height:0，否则 flex 子项按内容高度撑开 */
.conversation-scroll {
  flex: 1 1 0;
  min-height: 0 !important;
  min-width: 0;
  height: 100%;
  max-height: 100%;
  overflow: hidden;
  align-self: stretch;
}

.conversation-scroll :deep(.el-scrollbar__wrap) {
  overflow-x: hidden !important;
  overflow-y: auto !important;
  max-height: 100%;
  box-sizing: border-box;
}

.conversation-bottom-spacer {
  min-height: 140px;
  height: 140px;
  flex-shrink: 0;
}

.composer-wrapper {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  padding: 10px 0 14px;
  gap: 8px;
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

/* 快速对话框：非 compact，略放大内边距与圆角 */
.graph-quick-dialog-composer :deep(.composer-shell) {
  position: relative;
  width: 100%;
  max-width: 100%;
  border-radius: 10px;
  padding: 10px 12px;
  gap: 8px;
  box-shadow: 0 0 8px rgba(0, 0, 0, 0.07);
}

.graph-quick-dialog-composer :deep(.composer-textarea) {
  font-size: 14px;
  line-height: 1.5;
  min-height: 26px;
}

.graph-quick-dialog-composer :deep(.composer-shell.is-multiline) {
  grid-template-columns: 1fr;
  align-items: stretch;
}

.graph-quick-dialog-composer :deep(.composer-shell.is-multiline .composer-leading) {
  position: absolute;
  bottom: 10px;
  left: 10px;
  z-index: 10;
}

.graph-quick-dialog-composer :deep(.composer-shell.is-multiline .composer-actions) {
  position: absolute;
  bottom: 10px;
  right: 10px;
}

.graph-quick-dialog-composer :deep(.composer-shell.is-multiline .composer-scroll) {
  padding-bottom: 44px;
  padding-left: 8px;
}

.graph-quick-dialog-composer :deep(.chat-composer) {
  width: 100%;
}

.graph-quick-dialog-composer :deep(.composer-scroll) {
  width: 100%;
  min-width: 0;
}

.graph-quick-dialog-composer :deep(.el-scrollbar) {
  width: 100%;
  min-width: 0;
}

.graph-quick-dialog-composer :deep(.el-scrollbar__wrap),
.graph-quick-dialog-composer :deep(.el-scrollbar__view) {
  width: 100%;
}
</style>
