<template>
  <div id="particle-bg" class="homepage">
    <DynamicBackgroundAnimation />

    <div class="grid-decoration"></div>

    <ScrollArea class="center-content" :show-horizontal-scrollbar="false">
      <div class="center-content-wrapper">
        <div class="hero-section">
          <div class="distortion-wrapper">
            <DistortionBanner />
          </div>
          <p class="subtitle">
            {{ $t('home.subtitle') || '现代文档编辑与创作工具' }}
          </p>
        </div>

        <!-- 主页 Agent 输入：仅本地草稿，发送后打开 Agent 并新建会话 -->
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
              :show-reset="false"
              :placeholder="homeAgentComposerPlaceholder"
              :show-knowledge-base="false"
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

        <div class="action-section action-section--row3">
          <div class="action-card" @click="openNewDoc">
            <div class="action-icon">
              <FilePlus class="h-5 w-5" />
            </div>
            <div class="action-content">
              <h3 class="action-title">{{ $t('home.button.newDoc') }}</h3>
              <p class="action-desc">{{ $t('home.tooltip.newDoc') || '创建一篇新文档' }}</p>
            </div>
            <ChevronRight class="h-4 w-4" />
          </div>

          <div class="action-card" @click="openFile">
            <div class="action-icon">
              <FolderOpen class="h-5 w-5" />
            </div>
            <div class="action-content">
              <h3 class="action-title">{{ $t('home.button.openFile') }}</h3>
              <p class="action-desc">{{ $t('home.tooltip.openFile') || '打开现有文档' }}</p>
            </div>
            <ChevronRight class="h-4 w-4" />
          </div>

          <div
            class="action-card manual-card"
            :class="{ 'highlight-pulse': showManualHighlight }"
            @click="openUserManual"
          >
            <div class="action-icon">
              <BookOpen class="h-5 w-5" />
            </div>
            <div class="action-content">
              <h3 class="action-title">{{ $t('home.button.userManual') || '用户手册' }}</h3>
              <p class="action-desc">
                {{ $t('home.tooltip.userManual') || '学习如何使用MetaDoc' }}
              </p>
            </div>
            <ChevronRight class="h-4 w-4" />
          </div>
        </div>

        <div v-if="recentDocs.length > 0" class="recent-section">
          <div class="recent-header">
            <h3 class="recent-title">
              <FileText class="h-4 w-4" />
              {{ $t('home.recentDocuments') || '最近文档' }}
            </h3>
          </div>
          <div class="recent-docs-container">
            <ElScrollbar class="recent-docs-scrollbar">
              <div class="recent-docs-grid">
                <div
                  v-for="(docPath, index) in recentDocs.slice(0, RECENT_DOCS_MAX)"
                  :key="docPath"
                  class="recent-doc-card"
                  :style="{ animationDelay: `${index * 0.03}s` }"
                  @click="openRecentDoc(docPath)"
                >
                  <div class="doc-card-indicator"></div>
                  <span class="doc-card-name">
                    {{ getFileName(docPath) }}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    class="doc-card-delete-btn h-6 w-6 rounded-full"
                    @click.stop="removeRecentDoc(docPath)"
                  >
                    <X class="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </ElScrollbar>
          </div>
        </div>
      </div>
      <ScrollBar />
    </ScrollArea>

    <UserProfileDialog ref="profileDialogRef" @submitted="handleProfileSubmitted" />
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
import ChatComposer from '../components/chat/ChatComposer.vue'
import AgentReferencePicker from '../components/agent/AgentReferencePicker.vue'
import ReferenceDisplay from '../components/agent/ReferenceDisplay.vue'
import DistortionBanner from '../components/home/DistortionBanner.vue'
import DynamicBackgroundAnimation from '../components/home/DynamicBackgroundAnimation.vue'
import '../assets/aero-div.css'
import '../assets/aero-btn.css'
import '../assets/aero-input.css'
import { ScrollArea, ScrollBar } from '@renderer/components/ui/scroll-area'
import eventBus from '../utils/event-bus'
import { createRendererLogger } from '../utils/logger'
import { themeState, mixColors } from '../utils/themes'
import { ElLoading, ElScrollbar } from 'element-plus'
import messageBridge from '../bridge/message-bridge'
import {
  processFileUpload,
  selectReferenceFiles,
  AGENT_HOME_PENDING_ATTACHMENT_SESSION_ID
} from '../utils/agent-framework/reference-processor'
import type { Reference } from '../types/agent-framework'
import { notifyError, notifySuccess, notifyWarning } from '../utils/notify'
import { getRecentDocs, removeRecentDoc as removeRecentDocFromStorage } from '../utils/settings'
import {
  FileText,
  FolderOpen,
  FilePlus,
  BookOpen,
  ChevronRight,
  X,
  RefreshCw,
  Paperclip
} from 'lucide-vue-next'
import { basename, extname } from '../utils/path-utils'
import { formatRegistry } from '../utils/format-registry'
import { hasCompletedProfile } from '../utils/user-profile'
import { useWorkspace } from '../stores/workspace'
import { useAgentWorkspaceStore } from '../stores/agent-workspace-store'
import { useAgentManageUiStore } from '../stores/agent-manage-ui-store'
import { storeToRefs } from 'pinia'
import UserProfileDialog from '../components/manual/UserProfileDialog.vue'

const PROMPT_KEYS = Array.from({ length: 100 }, (_, i) => `p${String(i + 1).padStart(2, '0')}`)
const VISIBLE_PROMPT_SLOTS = 7

type PromptSlot = { uid: string; key: string; animKey: number }

/** 主页最近文档列表最多展示条数 */
const RECENT_DOCS_MAX = 20
const { t, tm, locale } = useI18n()

/** 主页 Agent 输入框 placeholder：从 i18n 多条里随机一条 */
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
const workspace = useWorkspace()
const agentManageUi = useAgentManageUiStore()
const agentWorkspaceStore = useAgentWorkspaceStore()
const { workspaceRoot } = storeToRefs(agentWorkspaceStore)

const homepageBackgroundColor = computed(() => {
  const baseBackground = themeState.currentTheme.background
  const isDark = themeState.currentTheme.type === 'dark'
  if (isDark) {
    return mixColors(baseBackground, '#111111', 0.3)
  }
  return mixColors(baseBackground, '#fafafa', 0.5)
})

const recentDocs = ref<string[]>([])
const showManualHighlight = ref(false)
const profileDialogRef = ref<InstanceType<typeof UserProfileDialog> | null>(null)

const homeComposerRef = ref<InstanceType<typeof ChatComposer> | null>(null)
const homeComposerInput = ref('')
const referencePickerOpen = ref(false)
/** 回形针上传的附件（不写入提示词框 chip；发送时一并注入会话 referenceStore） */
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

/** 无放回随机取 count 个互不相同的 prompt key（7≤100 恒可满足） */
function sampleDistinctPromptKeys(count: number): string[] {
  const shuffled = [...PROMPT_KEYS]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled.slice(0, count)
}

/** 为某一槽位换新 key：与当前屏幕上其它槽位均不重复；尽量与当前槽旧值不同 */
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
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey && snapshotBeforeChip.value !== null) {
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

function handleHomeAgentSubmit(_kb?: boolean, content?: string) {
  const raw =
    (typeof content === 'string' ? content : homeComposerRef.value?.getContentForSubmit?.()) ??
    homeComposerInput.value
  const text = String(raw || '').trim()
  const uploadRefs = [...homeUploadedAttachments.value]
  const textOnly = text.replace(/@\[[^\]]*\]/g, '').trim()
  const hasAtTokens = /@\[[^\]]+\]/.test(text)
  if (!textOnly && !hasAtTokens && uploadRefs.length === 0) return
  agentManageUi.setPendingHomeAgentSubmit({ content: text, references: uploadRefs })
  homeComposerInput.value = ''
  homeUploadedAttachments.value = []
  snapshotBeforeChip.value = null
  workspace.openSystemTab('/agent', t('headMenu.agent', 'Agent'))
}

const openNewDoc = () => {
  workspace.openNewDocumentTab()
}

const openFile = () => {
  eventBus.emit('open-doc')
}

const openUserManual = () => {
  workspace.openSystemTab('/user-manual', t('userManual.title') || '用户手册')
  checkAndShowProfileDialog()
}

const checkAndShowProfileDialog = async () => {
  const completed = await hasCompletedProfile()
  if (!completed && profileDialogRef.value) {
    profileDialogRef.value.open()
  }
}

const handleProfileSubmitted = () => {
  showManualHighlight.value = false
}

const getFileName = (filePath: string): string => {
  if (!filePath) return ''
  try {
    return basename(filePath)
  } catch {
    const segments = filePath.split(/[/\\]+/).filter(Boolean)
    return segments[segments.length - 1] || filePath
  }
}

const openRecentDoc = (filePath: string) => {
  const fileExt = extname(filePath)
  const formatId = formatRegistry.getFormatByExtension(fileExt) || 'txt'
  eventBus.emit('workspace-open-document', {
    path: filePath,
    format: formatId,
    content: '',
    preview: false
  })
}

const removeRecentDoc = async (filePath: string) => {
  try {
    await removeRecentDocFromStorage(filePath)
    await loadRecentDocs()
    logger.debug('删除最近文档成功', { filePath })
  } catch (error) {
    logger.warn('删除最近文档失败', error)
  }
}

const logger = createRendererLogger('GlobalHome')

const loadRecentDocs = async () => {
  try {
    recentDocs.value = await getRecentDocs()
  } catch (error) {
    logger.warn('加载最近文档失败', error)
    recentDocs.value = []
  }
}

const handleDocOpenSuccess = () => {
  loadRecentDocs()
}

const handleDocOpen = () => {
  setTimeout(() => {
    loadRecentDocs()
  }, 100)
}

watch(locale, () => {
  pickHomeAgentPlaceholderIndex()
})

onMounted(async () => {
  pickHomeAgentPlaceholderIndex()
  initPromptSlots()
  promptSlots.value.forEach((_, i) => scheduleSlotRotation(i))

  loadRecentDocs()
  const completed = await hasCompletedProfile()
  if (!completed) {
    showManualHighlight.value = true
  }

  eventBus.on('open-doc-success', handleDocOpenSuccess)
  eventBus.on('open-doc', handleDocOpen)
})

onBeforeUnmount(() => {
  clearSlotTimers()
  eventBus.off('open-doc-success', handleDocOpenSuccess)
  eventBus.off('open-doc', handleDocOpen)
})
</script>

<style scoped>
#particle-bg {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  z-index: 0;
}

.homepage {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: v-bind('homepageBackgroundColor');
  /* 随主内容区（标签页区域）宽高变化，而不仅依赖视口 media */
  container-name: global-home;
  container-type: size;
}

#particle-bg.homepage {
  background-color: v-bind('homepageBackgroundColor');
}

.grid-decoration {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-image: linear-gradient(
      v-bind(
          'themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)"'
        )
        1px,
      transparent 1px
    ),
    linear-gradient(
      90deg,
      v-bind(
          'themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)"'
        )
        1px,
      transparent 1px
    );
  background-size: 64px 64px;
  z-index: 0;
  pointer-events: none;
  mask-image: radial-gradient(ellipse 70% 60% at 50% 40%, black 10%, transparent 70%);
  -webkit-mask-image: radial-gradient(ellipse 70% 60% at 50% 40%, black 10%, transparent 70%);
}

.center-content {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  flex: 1;
  position: relative;
  z-index: 2;
}

/* reka-ui 视口 data 属性为 data-reka-scroll-area-viewport（非 radix），原先选择器未命中 */
.center-content :deep([data-reka-scroll-area-viewport]),
.center-content :deep([data-radix-scroll-area-viewport]) {
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  overflow-x: hidden !important;
  overflow-y: auto !important;
}

/* 横条存在时 reka 会给该子节点内联 min-width: fit-content；主页已关横条，此处再兜底防止回退 */
.center-content :deep([data-reka-scroll-area-viewport] > *) {
  min-width: 0 !important;
  max-width: 100%;
  box-sizing: border-box;
}

.center-content-wrapper {
  display: flex;
  flex-direction: column;
  /* stretch：子项占满滚动区宽度，避免 align-items:center 时随「内容最小宽度」撑开导致无法随容器变窄 */
  align-items: stretch;
  justify-content: flex-start;
  gap: clamp(14px, min(2.2vh, 2.5cqh), 28px);
  min-height: 100%;
  min-width: 0;
  padding: clamp(12px, min(2.5vh, 2.5cqh), 32px) clamp(16px, min(4vw, 4cqi), 56px);
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  overflow-x: hidden;
}

.hero-section {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  animation: fadeIn 0.45s ease-out;
}

.distortion-wrapper {
  width: 100%;
  max-width: min(1400px, 100%);
  height: clamp(72px, min(16vh, 14cqh), 160px);
}

.subtitle {
  font-size: clamp(13px, min(2.2vw, 2.2cqi), 18px);
  font-weight: 500;
  margin: 0;
  padding: 0;
  color: v-bind('themeState.currentTheme.textColor');
  opacity: 0.45;
  letter-spacing: 0.1em;
  user-select: none;
  -webkit-user-select: none;
}

/* ----- 主页 Agent 输入 ----- */
.agent-start-section {
  width: 100%;
  max-width: min(920px, 100%);
  margin-inline: auto;
  min-width: 0;
  box-sizing: border-box;
  animation: fadeIn 0.45s ease-out 0.04s both;
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
}

.home-agent-composer :deep(.composer-shell.is-multiline .composer-scroll) {
  padding-bottom: 20px;
  padding-left: 28px;
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

/* ----- 推荐提示词 ----- */
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

/* ----- 三列操作 ----- */
.action-section {
  width: 100%;
  max-width: min(920px, 100%);
  min-width: 0;
  margin-inline: auto;
  box-sizing: border-box;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: clamp(8px, 1.5cqi, 12px);
  animation: fadeIn 0.45s ease-out 0.08s both;
}

.action-section--row3 {
  max-width: min(920px, 100%);
}

.action-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid
    v-bind(
      'themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"'
    );
  background: v-bind(
    'themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.6)"'
  );
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  user-select: none;
  overflow: hidden;
  min-width: 0;
}

.action-card::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 10px;
  opacity: 0;
  transition: opacity 0.2s ease;
  background: v-bind(
    'themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)"'
  );
  pointer-events: none;
}

.action-card:hover {
  border-color: v-bind(
    'themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)"'
  );
  transform: translateY(-2px);
  box-shadow: 0 4px 12px
    v-bind('themeState.currentTheme.type === "dark" ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.06)"');
}

.action-card:hover::after {
  opacity: 1;
}

.action-card:active {
  transform: translateY(-1px);
}

.action-icon {
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: v-bind(
    'themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"'
  );
  color: v-bind(
    'themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.45)"'
  );
  transition: all 0.2s ease;
}

.action-card:hover .action-icon {
  background: v-bind(
    'themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)"'
  );
  color: v-bind(
    'themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.6)"'
  );
}

.action-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.action-title {
  font-size: 13px;
  font-weight: 500;
  margin: 0;
  padding: 0;
  color: v-bind('themeState.currentTheme.textColor');
  line-height: 1.35;
}

.action-desc {
  font-size: 11px;
  margin: 0;
  padding: 0;
  color: v-bind('themeState.currentTheme.textColor2 || "rgba(0,0,0,0.5)"');
  opacity: 0.65;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ----- 最近文档（卡片式 + 仅 5 条可视高度，超出 el-scrollbar） ----- */
.recent-section {
  width: 100%;
  max-width: min(920px, 100%);
  min-width: 0;
  margin-inline: auto;
  box-sizing: border-box;
  animation: fadeIn 0.45s ease-out 0.12s both;
}

.recent-header {
  margin-bottom: 16px;
  display: flex;
  align-items: center;
}

.recent-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  padding: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  color: v-bind('themeState.currentTheme.textColor');
  user-select: none;
  -webkit-user-select: none;
}

.recent-docs-container {
  border-radius: 10px;
  border: 1px solid
    v-bind(
      'themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)"'
    );
  background-color: v-bind(
    'themeState.currentTheme.type === "dark" ? "rgb(40,40,42)" : "rgb(255,255,255)"'
  );
  box-shadow: v-bind(
    'themeState.currentTheme.type === "dark" ? "0 2px 8px rgba(0,0,0,0.3)" : "0 1px 4px rgba(0,0,0,0.04)"'
  );
  overflow: hidden;
}

.recent-docs-scrollbar {
  width: 100%;
}

.recent-docs-scrollbar :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
  /* 约 5 行卡片高，并随视口 / 主页容器高度收缩 */
  max-height: min(235px, 40vh, 32cqh);
}

.recent-docs-grid {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.recent-doc-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 16px;
  cursor: pointer;
  transition: all 0.05s ease;
  background: v-bind('themeState.currentTheme.background2nd');
  user-select: none;
  animation: fadeIn 0.3s ease-out both;
  border-bottom: 1px solid v-bind('themeState.currentTheme.borderColor + "40"');
}

.recent-doc-card:last-child {
  border-bottom: none;
}

.recent-doc-card:hover {
  background: v-bind('themeState.currentTheme.background');
}

.recent-doc-card:active {
  background: v-bind('themeState.currentTheme.background');
}

.doc-card-indicator {
  flex-shrink: 0;
  width: 3px;
  height: 16px;
  border-radius: 1.5px;
  background: v-bind('themeState.currentTheme.primaryColor + "30"');
  transition: all 0.05s ease;
}

.recent-doc-card:hover .doc-card-indicator {
  background: v-bind('themeState.currentTheme.primaryColor');
  height: 20px;
}

.doc-card-name {
  flex: 1;
  font-size: 13px;
  font-weight: 400;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: v-bind('themeState.currentTheme.textColor');
  opacity: 0.75;
  transition: opacity 0.05s ease;
}

.recent-doc-card:hover .doc-card-name {
  opacity: 1;
}

.doc-card-delete-btn {
  opacity: 0;
  transition: opacity 0.05s ease;
  z-index: 10;
  flex-shrink: 0;
  color: v-bind('themeState.currentTheme.textColor2 || "rgba(0,0,0,0.3)"') !important;
}

.recent-doc-card:hover .doc-card-delete-btn {
  opacity: 0.5;
}

.doc-card-delete-btn:hover {
  opacity: 1 !important;
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

.manual-card.highlight-pulse {
  animation: highlightPulse 2s ease-in-out infinite;
  box-shadow: 0 0 20px rgba(64, 158, 255, 0.4);
}

@keyframes highlightPulse {
  0%,
  100% {
    transform: translateY(0) scale(1);
    box-shadow: 0 0 20px rgba(64, 158, 255, 0.4);
  }
  50% {
    transform: translateY(-3px) scale(1.01);
    box-shadow: 0 0 28px rgba(64, 158, 255, 0.55);
  }
}

/* 窄主内容区：单列（容器查询优先于纯视口，便于侧栏较宽时仍适配） */
@container global-home (max-width: 900px) {
  .action-section--row3 {
    grid-template-columns: 1fr;
  }
}

@container global-home (min-width: 560px) and (max-width: 900px) {
  .action-section--row3 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@container global-home (max-width: 640px) {
  .center-content-wrapper {
    padding-left: 16px;
    padding-right: 16px;
  }

  .suggested-prompts-toolbar {
    flex-wrap: wrap;
  }
}

@container global-home (max-height: 520px) {
  .center-content-wrapper {
    gap: clamp(10px, 2cqh, 18px);
    padding-top: clamp(8px, 1.5cqh, 20px);
    padding-bottom: clamp(8px, 1.5cqh, 20px);
  }

  .distortion-wrapper {
    height: clamp(64px, min(12vh, 10cqh), 120px);
  }
}

@media (max-width: 900px) {
  .action-section--row3 {
    grid-template-columns: 1fr;
  }
}

@media (min-width: 561px) and (max-width: 900px) {
  .action-section--row3 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .center-content-wrapper {
    padding-left: 16px;
    padding-right: 16px;
  }

  .suggested-prompts-toolbar {
    flex-wrap: wrap;
  }
}

@media (max-height: 520px) {
  .center-content-wrapper {
    gap: clamp(10px, 2vh, 18px);
    padding-top: clamp(8px, 1.5vh, 20px);
    padding-bottom: clamp(8px, 1.5vh, 20px);
  }

  .distortion-wrapper {
    height: clamp(64px, 12vh, 120px);
  }
}
</style>
