<template>
  <div class="agent-start-section">
    <div class="composer-wrapper-home">
      <ReferenceDisplay
        v-if="homeUploadedAttachments.length > 0"
        class="home-reference-display"
        readonly
        removable
        :remove-aria-label="t('common.delete')"
        :references="homeUploadedAttachments"
        :active-reference-ids="homeUploadedAttachmentIds"
        @remove="removeHomeUploadedAttachment"
      />
      <ChatComposer
        ref="homeComposerRef"
        class="home-agent-composer"
        v-model="homeComposerInput"
        :loading="false"
        :disabled="false"
        :show-attach="false"
        :show-voice="false"
        :show-llm-config-switch="true"
        :placeholder="homeAgentComposerPlaceholder"
        :show-knowledge-base="false"
        :show-reasoning="true"
        :show-reference-picker="true"
        :get-at-label="getAtLabel"
        :force-multiline-layout="true"
        :allow-send-without-composer-text="homeUploadedAttachments.length > 0"
        @submit="handleHomeAgentSubmit"
        @composer-keydown="onHomeComposerKeydown"
      >
        <template #leading>
          <div class="home-agent-composer-leading">
            <AgentReferencePicker
              v-model:open="referencePickerOpen"
              :disabled="false"
              @select-file="handleHomeRefFile"
              @select-tab="handleHomeRefTab"
              @select-dir="handleHomeRefDir"
            />
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon"
                  class="home-composer-attach-btn"
                  type="button"
                  :title="t('aiChat.attachTooltip')"
                >
                  <Paperclip class="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem @select="openHomeAttachFilePicker">
                  {{ t('agent.compact.uploadAttachment', '上传附件') }}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </template>
      </ChatComposer>
    </div>

    <div class="suggested-prompts">
      <div class="suggested-prompts-toolbar">
        <span class="suggested-prompts-hint">{{ t('home.suggestedPromptsHint') }}</span>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          class="suggested-prompts-refresh h-7 gap-1 px-2"
          :title="t('home.suggestedPromptsRefresh')"
          @click="refreshSuggestedPrompts"
        >
          <RefreshCw class="h-3.5 w-3.5" />
          <span class="text-xs">{{ t('home.suggestedPromptsRefresh') }}</span>
        </Button>
      </div>
      <div class="suggested-prompts-chips" role="list">
        <button
          v-for="slot in promptSlots"
          :key="slot.uid"
          type="button"
          class="prompt-chip"
          role="listitem"
          @click="applyPromptKey(slot.key)"
        >
          <Transition name="prompt-roll" mode="out-in">
            <span :key="slot.animKey" class="prompt-chip-label">{{
              t(`home.agentPrompts.${slot.key}`)
            }}</span>
          </Transition>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@renderer/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import ChatComposer from '../chat/ChatComposer.vue'
import AgentReferencePicker from '../agent/AgentReferencePicker.vue'
import ReferenceDisplay from '../agent/ReferenceDisplay.vue'
import { themeState } from '../../utils/themes'
import { ElLoading } from 'element-plus'
import messageBridge from '../../bridge/message-bridge'
import {
  processFileUpload,
  selectReferenceFiles,
  AGENT_HOME_PENDING_ATTACHMENT_SESSION_ID
} from '../../utils/agent-framework/reference-processor'
import type { Reference } from '../../types/agent-framework'
import { notifyError, notifySuccess, notifyWarning } from '../../utils/notify'
import { createRendererLogger } from '../../utils/logger'
import { RefreshCw, Paperclip } from 'lucide-vue-next'
import { useWorkspace } from '../../stores/workspace'
import { useAgentWorkspaceStore } from '../../stores/agent-workspace-store'
import { useAgentManageUiStore } from '../../stores/agent-manage-ui-store'
import { storeToRefs } from 'pinia'

const PROMPT_KEYS = Array.from({ length: 100 }, (_, i) => `p${String(i + 1).padStart(2, '0')}`)
const VISIBLE_PROMPT_SLOTS = 7

type PromptSlot = { uid: string; key: string; animKey: number }

const { t, tm, locale } = useI18n()
const logger = createRendererLogger('GlobalHomeAgentSection')
const workspace = useWorkspace()
const agentManageUi = useAgentManageUiStore()
const agentWorkspaceStore = useAgentWorkspaceStore()
const { workspaceRoot } = storeToRefs(agentWorkspaceStore)

const homeAgentPlaceholderIndex = ref(0)
function pickHomeAgentPlaceholderIndex() {
  const list = tm('home.agentComposerPlaceholders')
  const n = Array.isArray(list) ? list.length : 0
  homeAgentPlaceholderIndex.value = n > 0 ? Math.floor(Math.random() * n) : 0
}
const homeAgentComposerPlaceholder = computed(() => {
  const list = tm('home.agentComposerPlaceholders') as unknown[]
  if (!Array.isArray(list) || list.length === 0) return ''
  const raw = list[homeAgentPlaceholderIndex.value % list.length]
  return typeof raw === 'string' ? raw : String(raw ?? '')
})

const homeComposerRef = ref<InstanceType<typeof ChatComposer> | null>(null)
const homeComposerInput = ref('')
const referencePickerOpen = ref(false)
const homeUploadedAttachments = ref<Reference[]>([])
const homeUploadedAttachmentIds = computed(() => homeUploadedAttachments.value.map((r) => r.id))

function removeHomeUploadedAttachment(id: string) {
  homeUploadedAttachments.value = homeUploadedAttachments.value.filter((r) => r.id !== id)
}

let applyingPromptFromChip = false
let restoringComposerUndo = false
const snapshotBeforeChip = ref<string | null>(null)

const promptSlots = ref<PromptSlot[]>([])
const slotTimers = ref<(ReturnType<typeof setTimeout> | null)[]>([])

function sampleDistinctPromptKeys(count: number): string[] {
  const shuffled = [...PROMPT_KEYS]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled.slice(0, count)
}

function pickUniqueKeyForSlot(slotIndex: number, currentKey: string): string {
  const others = new Set(
    promptSlots.value
      .map((s, i) => (i === slotIndex ? null : s.key))
      .filter((k): k is string => !!k)
  )
  let pool = PROMPT_KEYS.filter((k) => !others.has(k) && k !== currentKey)
  if (pool.length === 0) {
    pool = PROMPT_KEYS.filter((k) => !others.has(k))
  }
  if (pool.length === 0) {
    return currentKey
  }
  return pool[Math.floor(Math.random() * pool.length)]
}

function initPromptSlots() {
  const keys = sampleDistinctPromptKeys(VISIBLE_PROMPT_SLOTS)
  promptSlots.value = keys.map((key) => ({
    uid: `ps-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    key,
    animKey: 0
  }))
}

function refreshSuggestedPrompts() {
  const keys = sampleDistinctPromptKeys(VISIBLE_PROMPT_SLOTS)
  promptSlots.value = promptSlots.value.map((s, i) => ({
    uid: s.uid,
    key: keys[i] ?? s.key,
    animKey: s.animKey + 1
  }))
}

function scheduleSlotRotation(index: number) {
  const prev = slotTimers.value[index]
  if (prev) clearTimeout(prev)
  const delay = 10000 + Math.random() * 10000
  slotTimers.value[index] = setTimeout(() => {
    const row = promptSlots.value[index]
    if (row) {
      row.key = pickUniqueKeyForSlot(index, row.key)
      row.animKey += 1
    }
    scheduleSlotRotation(index)
  }, delay)
}

function clearSlotTimers() {
  slotTimers.value.forEach((tid) => {
    if (tid) clearTimeout(tid)
  })
  slotTimers.value = []
}

function applyPromptKey(key: string) {
  snapshotBeforeChip.value = homeComposerInput.value
  applyingPromptFromChip = true
  homeComposerInput.value = t(`home.agentPrompts.${key}`)
  nextTick(() => {
    applyingPromptFromChip = false
  })
}

watch(homeComposerInput, () => {
  if (applyingPromptFromChip || restoringComposerUndo) return
  snapshotBeforeChip.value = null
})

function onHomeComposerKeydown(e: KeyboardEvent) {
  if (
    (e.ctrlKey || e.metaKey) &&
    e.key === 'z' &&
    !e.shiftKey &&
    snapshotBeforeChip.value !== null
  ) {
    e.preventDefault()
    restoringComposerUndo = true
    homeComposerInput.value = snapshotBeforeChip.value
    snapshotBeforeChip.value = null
    nextTick(() => {
      restoringComposerUndo = false
    })
  }
}

function getAtLabel(rawValue: string): string {
  if (rawValue.startsWith('tab:')) {
    const tabId = rawValue.slice(4)
    const tab = workspace.tabs.find((x) => x.id === tabId)
    return tab?.title ?? t('agent.attachment.untitled', '未命名')
  }
  if (rawValue.startsWith('dir:')) {
    const dirPath = rawValue.slice(4)
    return dirPath.replace(/^.*[/\\]/, '') || dirPath || t('agent.reference.directory', '目录')
  }
  return rawValue.replace(/^.*[/\\]/, '') || rawValue
}

function handleHomeRefFile(payload: { type: 'file'; path: string }) {
  if (payload.type !== 'file') return
  homeComposerRef.value?.insertAtCursor?.(payload.path)
  referencePickerOpen.value = false
}

function handleHomeRefTab(payload: { type: 'tab'; tabId: string }) {
  if (payload.type !== 'tab') return
  const tab = workspace.tabs.find((x) => x.id === payload.tabId)
  if (tab?.path) {
    homeComposerRef.value?.insertAtCursor?.(tab.path)
  } else {
    homeComposerRef.value?.insertAtCursor?.(`tab:${payload.tabId}`)
  }
  referencePickerOpen.value = false
}

function handleHomeRefDir(payload: { type: 'dir'; path: string }) {
  if (payload.type !== 'dir') return
  homeComposerRef.value?.insertAtCursor?.(`dir:${payload.path}`)
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

const homeAttachPickerInProgress = ref(false)

async function openHomeAttachFilePicker() {
  if (homeAttachPickerInProgress.value) return
  homeAttachPickerInProgress.value = true
  try {
    const filePaths = await selectReferenceFiles('all', true, t('aiChat.attachTooltip'))
    if (filePaths.length === 0) return
    const files: File[] = []
    for (const filePath of filePaths) {
      try {
        files.push(await pathToFile(filePath))
      } catch (e) {
        logger.warn('读取待上传文件失败', { filePath, error: e })
      }
    }
    if (files.length === 0) {
      notifyError(t('agent.reference.allFilesFailed'))
      return
    }
    let root = workspaceRoot.value
    if (!root) {
      root = await agentWorkspaceStore.refreshWorkspaceRoot()
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
    const homePendingAttachmentOpts = {
      workspaceRoot: root,
      sessionId: AGENT_HOME_PENDING_ATTACHMENT_SESSION_ID
    }
    const loading = ElLoading.service({
      lock: true,
      text:
        files.length > 1
          ? t('agent.reference.processingFiles', { count: files.length })
          : t('agent.reference.processingFile'),
      background: 'rgba(0, 0, 0, 0.7)'
    })
    try {
      const newRefs: Reference[] = []
      let failCount = 0
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        loading.setText(
          files.length > 1
            ? t('agent.reference.processingFileN', {
                current: i + 1,
                total: files.length,
                name: file.name
              })
            : t('agent.reference.processingNamedFile', { name: file.name })
        )
        try {
          newRefs.push(
            await processFileUpload(file, undefined, undefined, {
              workspaceAttachment: homePendingAttachmentOpts
            })
          )
        } catch {
          failCount++
        }
      }
      if (newRefs.length === 0) {
        notifyError(t('agent.reference.allFilesFailed'))
        return
      }
      const existingIds = new Set(homeUploadedAttachments.value.map((r) => r.id))
      for (const ref of newRefs) {
        if (existingIds.has(ref.id)) continue
        existingIds.add(ref.id)
        homeUploadedAttachments.value.push(ref)
      }
      if (failCount === 0) {
        notifySuccess(
          files.length > 1
            ? t('agent.reference.addSuccessCount', { count: newRefs.length })
            : t('agent.reference.addSuccess')
        )
      } else {
        notifyWarning(
          t('agent.reference.addPartialSuccess', {
            success: newRefs.length,
            fail: failCount
          })
        )
      }
    } finally {
      loading.close()
    }
  } catch (err) {
    notifyError(err instanceof Error ? err.message : String(err))
  } finally {
    homeAttachPickerInProgress.value = false
  }
}

function handleHomeAgentSubmit(_kb?: boolean, content?: string, enableReasoning?: boolean) {
  const raw =
    (typeof content === 'string' ? content : homeComposerRef.value?.getContentForSubmit?.()) ??
    homeComposerInput.value
  const text = String(raw || '').trim()
  const uploadRefs = [...homeUploadedAttachments.value]
  const textOnly = text.replace(/@\[[^\]]*\]/g, '').trim()
  const hasAtTokens = /@\[[^\]]+\]/.test(text)
  if (!textOnly && !hasAtTokens && uploadRefs.length === 0) return
  agentManageUi.setPendingHomeAgentSubmit({
    content: text,
    references: uploadRefs,
    ...(enableReasoning === true ? { enableReasoning: true } : {})
  })
  homeComposerInput.value = ''
  homeUploadedAttachments.value = []
  snapshotBeforeChip.value = null
  workspace.openSystemTab('/agent', t('headMenu.agent', 'Agent'))
}

watch(locale, () => {
  pickHomeAgentPlaceholderIndex()
})

onMounted(() => {
  pickHomeAgentPlaceholderIndex()
  initPromptSlots()
  promptSlots.value.forEach((_, i) => scheduleSlotRotation(i))
})

onBeforeUnmount(() => {
  clearSlotTimers()
})
</script>

<style scoped>
.agent-start-section {
  width: 100%;
  max-width: min(920px, 100%);
  margin-inline: auto;
  min-width: 0;
  box-sizing: border-box;
  animation: fadeIn 0.45s ease-out 0.04s both;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.home-reference-display {
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

.composer-wrapper-home {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: 6px 8px 8px;
  gap: 4px;
  border-radius: 10px;
  border: 1px solid
    v-bind(
      'themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"'
    );
  background: v-bind(
    'themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.72)"'
  );
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.home-agent-composer {
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

.home-agent-composer :deep(.chat-composer) {
  min-width: 0;
  max-width: 100%;
}

.home-agent-composer :deep(.composer-shell) {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  border-radius: 5px;
  padding: 4px 6px;
  gap: 4px;
  box-shadow: 0 0 6px rgba(0, 0, 0, 0.06);
}

.home-agent-composer :deep(.composer-shell.is-multiline) {
  grid-template-columns: 1fr;
  align-items: stretch;
}

.home-agent-composer :deep(.composer-shell.is-multiline .composer-leading) {
  position: absolute;
  bottom: 6px;
  left: 6px;
  z-index: 10;
}

.home-agent-composer :deep(.composer-shell.is-multiline .composer-actions) {
  position: absolute;
  bottom: 6px;
  right: 6px;
  z-index: 11;
  pointer-events: auto;
}

.home-agent-composer :deep(.composer-shell.is-multiline .composer-scroll) {
  position: relative;
  z-index: 0;
  padding-bottom: 20px;
  padding-left: 28px;
  padding-right: min(148px, 38vw);
}

.home-agent-composer :deep(.agent-ref-composer-input) {
  min-height: calc(1.5em * 3);
}

.home-agent-composer-leading {
  display: flex;
  align-items: center;
  gap: 2px;
  align-self: flex-end;
}

.suggested-prompts {
  margin-top: 8px;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.suggested-prompts-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.suggested-prompts-hint {
  font-size: 12px;
  color: v-bind('themeState.currentTheme.textColor');
  opacity: 0.5;
}

.suggested-prompts-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.prompt-chip {
  max-width: 100%;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid
    v-bind(
      'themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"'
    );
  background: v-bind(
    'themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.55)"'
  );
  color: v-bind('themeState.currentTheme.textColor');
  font-size: 12px;
  line-height: 1.35;
  cursor: pointer;
  text-align: left;
  transition:
    border-color 0.15s ease,
    background 0.15s ease;
}

.prompt-chip:hover {
  border-color: v-bind(
    'themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.14)"'
  );
}

.prompt-chip-label {
  display: inline-block;
}

.prompt-roll-enter-active,
.prompt-roll-leave-active {
  transition:
    opacity 0.22s ease,
    transform 0.22s ease;
}

.prompt-roll-enter-from {
  opacity: 0;
  transform: translateY(4px);
}

.prompt-roll-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (max-width: 640px) {
  .suggested-prompts-toolbar {
    flex-wrap: wrap;
  }
}
</style>
