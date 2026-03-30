<template>
  <Dialog v-model:open="dialogOpen">
    <DialogContent
      class="graph-quick-dialog graph-quick-dialog--shell w-[min(960px,92vw)] max-w-[min(960px,92vw)] gap-0 overflow-hidden p-0"
      :style="dialogSurfaceStyle"
    >
      <div
        class="graph-quick-dialog__root flex max-h-[min(720px,85vh)] min-h-[440px] flex-col gap-2 overflow-hidden p-4"
      >
        <DialogHeader class="shrink-0 space-y-2">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <DialogTitle class="text-base">{{ t('graph.quickDialogTitle', '根据选中文本生成插图') }}</DialogTitle>
            <Button variant="outline" size="sm" :disabled="!sessionId" @click="openInGraphTool">
              {{ t('graph.openInGraphTool', '在绘图工具中打开') }}
            </Button>
          </div>
        </DialogHeader>

        <Collapsible
          v-model:open="selectionPreviewOpen"
          class="shrink-0 rounded-md border border-border px-2 py-1"
        >
          <CollapsibleTrigger
            class="flex w-full items-center gap-2 text-left text-sm font-medium hover:opacity-80"
          >
            <ChevronRight
              class="h-4 w-4 shrink-0 transition-transform"
              :class="{ 'rotate-90': selectionPreviewOpen }"
            />
            {{ t('graph.quickDialogSelectionPreview', '选中文本') }}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre
              class="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/50 p-2 text-xs font-mono"
              >{{ selectionText }}</pre
            >
          </CollapsibleContent>
        </Collapsible>

        <div
          v-if="preparing"
          class="flex min-h-[200px] flex-1 items-center justify-center text-sm opacity-70"
        >
          {{ t('common.loading', '加载中...') }}
        </div>

        <template v-else>
          <div class="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
            <div
              class="graph-quick-dialog__thread flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border"
              :style="threadStyle"
            >
              <LoadingOverlay :show="loadingSession" :message="t('common.loading', '加载中...')" />
              <div class="graph-quick-dialog__scroll-host">
                <el-scrollbar class="graph-quick-dialog__scroll" height="100%">
                  <div class="p-3 pb-4">
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
                      @delete="onMsgDelete"
                      @edit="onMsgEdit"
                      @regenerate="regenerate"
                      @export="handleExport"
                    />
                  </div>
                </el-scrollbar>
              </div>
              <div
                class="graph-quick-dialog__composer shrink-0 border-t border-border px-2 pb-2 pt-2"
                :style="composerBarStyle"
              >
                <p class="graph-quick-dialog__composer-hint mb-2 text-xs leading-relaxed opacity-80">
                  {{ t('graph.quickDialogComposerHint') }}
                </p>
                <ChatComposer
                  v-model="currentPrompt"
                  class="graph-quick-dialog-composer w-full max-w-full"
                  :loading="generating || analyzingIntent"
                  :disabled="!sessionId"
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

            <DialogFooter
              class="shrink-0 flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3 sm:justify-end"
            >
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button variant="secondary" size="sm" :disabled="!latestChart">
                    {{ t('graph.copyCode', '复制代码') }}
                    <ChevronDown class="ml-1 h-4 w-4 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem :disabled="!latestChart" @click="copyMarkdown">
                    {{ t('graph.copyMarkdown', '复制 Markdown') }}
                  </DropdownMenuItem>
                  <DropdownMenuItem :disabled="!latestChart" @click="copyLatexListing">
                    {{ t('graph.copyLatexCode', '复制 LaTeX 代码环境') }}
                  </DropdownMenuItem>
                  <DropdownMenuItem :disabled="!latestChart" @click="copyLatexIncludegraphics">
                    {{ t('graph.copyLatexIncludegraphics', '复制 \\includegraphics 模板') }}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="secondary" size="sm" :disabled="!latestChart" @click="handleExport()">
                {{ t('graph.exportChart', '导出') }}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                :disabled="!lastExportedFilePath"
                @click="openExportedFolder"
              >
                {{ t('graph.openExportFolder', '打开所在文件夹') }}
              </Button>
              <Button variant="default" size="sm" :disabled="!latestChart" @click="insertIntoDocument">
                {{ t('graph.insertIntoDocument', '插入到文档') }}
              </Button>
            </DialogFooter>
          </div>
        </template>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronDown, ChevronRight } from 'lucide-vue-next'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@renderer/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { LoadingOverlay } from '@renderer/components/ui/loading-overlay'
import { themeState } from '@renderer/utils/themes'
import { useGraphSessionFlow } from '@renderer/composables/useGraphSessionFlow'
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
  }>(),
  {
    documentKind: 'md',
    documentTitle: ''
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
const selectionPreviewOpen = ref(true)

const dialogSurfaceStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd,
  color: themeState.currentTheme.textColor
}))

const threadStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

const composerBarStyle = computed(() => ({
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

const latestChart = computed(() => {
  for (let i = messages.value.length - 1; i >= 0; i--) {
    const m = messages.value[i]
    if (m.role === 'assistant' && m.chartMarkdown) return m.chartMarkdown
  }
  return null
})

function buildDefaultPrompt(selection: string): string {
  const intro = t(
    'graph.quickDialogDefaultPromptIntro',
    '请根据以下选中文档内容生成合适的插图（流程图、示意图、数据图等），风格与文档一致：'
  )
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

    await graphSessionsDb.create({
      id,
      title,
      description: '',
      conversation_history: JSON.stringify([]),
      current_prompt: '',
      output_format: 'svg',
      output_path: undefined
    })

    sessionId.value = id
    quickSessionTitle.value = title
    currentPrompt.value = buildDefaultPrompt(props.selectionText)
    eventBus.emit('graph-sessions-changed')
  } catch (e) {
    toast.error(t('graph.quickDialogSessionError', '创建绘图会话失败'))
    dialogOpen.value = false
  } finally {
    preparing.value = false
  }
}

watch(
  () => props.open,
  async (o) => {
    if (o) {
      await prepareSession()
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
  eventBus.emit('ai-chat-request-insert-to-document', { content: c })
  dialogOpen.value = false
}
</script>

<style scoped>
.graph-quick-dialog__scroll-host {
  flex: 1 1 0;
  min-height: 120px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.graph-quick-dialog__scroll {
  min-height: 0;
  flex: 1;
  width: 100%;
}

.graph-quick-dialog__scroll :deep(.el-scrollbar) {
  height: 100%;
}

.graph-quick-dialog__scroll :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
}

.graph-quick-dialog__composer-hint {
  color: inherit;
}

.graph-quick-dialog-composer :deep(.chat-composer) {
  width: 100%;
  max-width: 100%;
}

.graph-quick-dialog-composer :deep(.composer-shell) {
  position: relative;
  width: 100%;
  max-width: 100%;
}

.graph-quick-dialog-composer :deep(.composer-shell.is-multiline) {
  grid-template-columns: 1fr;
  align-items: stretch;
}

.graph-quick-dialog-composer :deep(.composer-shell.is-multiline .composer-actions) {
  position: absolute;
  bottom: 6px;
  right: 6px;
}

.graph-quick-dialog-composer :deep(.composer-shell.is-multiline .composer-scroll) {
  padding-bottom: 28px;
  padding-right: 8px;
}

.graph-quick-dialog-composer :deep(.composer-scroll) {
  width: 100%;
  min-width: 0;
}

.graph-quick-dialog-composer :deep(.el-scrollbar),
.graph-quick-dialog-composer :deep(.el-scrollbar__wrap),
.graph-quick-dialog-composer :deep(.el-scrollbar__view) {
  width: 100%;
  min-width: 0;
}
</style>
