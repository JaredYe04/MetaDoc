<template>
  <div class="ai-chat-container" :style="containerStyle">
    <div class="main-container">
      <SessionList
        :title="t('aiChat.sessionsTitle', 'AI会话')"
        :items="sessionListItems"
        :active-index="activeDialogIndex.toString()"
        :disabled="responding"
        :create-button-tooltip="t('aiChat.newDialog')"
        :rename-label="t('aiChat.rename')"
        :duplicate-label="t('aiChat.duplicate')"
        :delete-label="t('aiChat.delete')"
        :rename-dialog-title="t('aiChat.renameTitle')"
        :rename-placeholder="t('aiChat.renamePlaceholder')"
        :cancel-label="t('common.cancel')"
        :confirm-label="t('common.confirm')"
        :show-duplicate="true"
        :group-by-date="true"
        @create="addNewDialog"
        @select="handleSessionSelect"
        @rename="handleSessionRename"
        @duplicate="handleSessionDuplicate"
        @delete="handleSessionDelete"
      >
        <!-- 右侧内容 -->
        <div class="content-area" :style="panelStyle">
          <header class="conversation-header">
            <h1 class="title">{{ title }}</h1>
            <div class="conversation-stats">
              <Tooltip>
                <TooltipTrigger as-child>
                  <Badge
                    size="small"
                    effect="plain"
                    class="cursor-pointer"
                    @click="handleOpenReferenceDialog"
                  >
                    {{ t('agent.conversation.references', { count: referenceStore.length }) }}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>{{ t('agent.conversation.referencesTooltip', '点击管理引用') }}</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </header>
          <div class="dialog-container">
            <ScrollArea class="conversation-scroll">
              <MessageBubble
                v-for="(message, index) in messages.filter((item) => item.role !== 'system')"
                :key="index"
                :message="message"
                :session-references="referenceStore"
                :is-assistant-streaming="
                  responding &&
                  message.role === 'assistant' &&
                  index === messages.filter((item) => item.role !== 'system').length - 1
                "
                @delete="onMsgDelete"
                @edit="onMsgEdit"
                @regenerate="regenerate"
                :index="index"
              />
              <div
                class="conversation-bottom-spacer"
                :class="{ 'has-references': referenceStore && referenceStore.length > 0 }"
              />
              <ScrollBar />
            </ScrollArea>
            <div class="composer-wrapper">
              <ReferenceDisplay
                v-if="referenceStore.length > 0"
                :references="referenceStore"
                :active-reference-ids="activeReferenceIds"
                @toggle="handleToggleReference"
              />
              <ChatComposer
                v-model="promptInput"
                :loading="responding"
                :disabled="false"
                :placeholder="t('aiChat.inputPlaceholder')"
                :show-voice="false"
                :show-attach="true"
                :show-knowledge-base="true"
                :show-reasoning="true"
                v-model:enable-knowledge-base-query="enableKnowledgeBaseQuery"
                @submit="onMsgSend"
                @reset="reset"
                @attach="handleAttach"
                @cancel="handleCancel"
              />
            </div>
          </div>
        </div>
      </SessionList>
    </div>

    <!-- 引用管理对话框 -->
    <Dialog v-model:open="showReferenceDialog">
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
          <ReferenceManager
            :session="{
              id: `ai-chat-${activeDialogIndex}`,
              title: title,
              description: '',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              messages: [],
              activeToolIds: [],
              agentConfigId: '',
              messageQueue: [],
              referenceStore: referenceStore,
              publicContext: {},
              executionNodes: [],
              status: 'idle'
            }"
            @update="handleReferenceUpdate"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showReferenceDialog = false">{{
            t('common.close')
          }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  onMounted,
  onBeforeUnmount,
  reactive,
  ref,
  watch,
  type Ref,
  type WatchStopHandle
} from 'vue'
import MessageBubble from '../components/MessageBubble.vue'
//import { bindCode } from "../assets/aichat_legacy/utils";
import SessionList from '../components/common/SessionList.vue'
import { Button } from '@renderer/components/ui/button'
import { ScrollArea, ScrollBar } from '@renderer/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Badge } from '@renderer/components/ui/badge'
import type { SessionListItem } from '../components/common/SessionList.vue'
import '../assets/input-box.css'
import '../assets/title.css'

import { notifySuccess, notifyError, notifyWarning, notifyInfo } from '@renderer/utils/notify'
import eventBus from '../utils/event-bus.js'
import { themeState } from '../utils/themes.js'
import { answerQuestion } from '../utils/llm-api.js'
import '../assets/tool-group.css'
import { updateTitlePrompt } from '../utils/prompts'
import { useI18n } from 'vue-i18n'
import { ai_types, createAiTask, cancelAiTask } from '../utils/ai_tasks.ts'
import { getSetting } from '../utils/settings.js'
// import { useActiveDocument } from '../composables/useActiveDocument';
import { getDefaultAiChatMessages } from '../constants/document'
import { useWorkspace } from '../stores/workspace'
import type { AIDialog, AIDialogMessage } from '../../../types'
import type { AgentSession } from '../types/agent'
import ChatComposer from '../components/chat/ChatComposer.vue'
import { readAiChatDialogs, writeAiChatDialogs } from '../utils/ai-chat-storage'
import {
  parseSchemaJson,
  DOCUMENT_TITLE_SCHEMA,
  type DocumentTitleSchemaResult
} from '../utils/schemas'
import ReferenceDisplay from '../components/agent/ReferenceDisplay.vue'
import ReferenceManager from '../components/agent/ReferenceManager.vue'
import type { Reference } from '../types/agent-framework'
import {
  processFileUpload,
  processUrlReference
} from '../utils/agent-framework/reference-processor'
import { ElLoading } from 'element-plus'
const { t } = useI18n()
const workspace = useWorkspace()
const responding = ref(false)
const activeDialogIndex = ref<number>(0)

const ourTabId = computed(
  () => workspace.tabs.find((tab) => tab.kind === 'tool' && tab.route === '/ai-chat')?.id ?? null
)

import { createRendererLogger } from '../utils/logger.ts'
const logger = createRendererLogger('AIChat')

const props = defineProps({
  id: String,
  mode: {
    type: String,
    default: 'normal'
  }
})

const isDemo = computed(() => props.mode === 'demo')

const cloneDeep = <T,>(value: T): T => JSON.parse(JSON.stringify(value))

const createDefaultMessages = (): AIDialogMessage[] =>
  getDefaultAiChatMessages().map((message) => ({ ...message }))

const createDefaultDialog = (title: string): AIDialog => {
  const now = Date.now()
  return {
    title,
    messages: createDefaultMessages(),
    createdAt: now,
    updatedAt: now,
    referenceStore: []
  }
}

const messages = ref<AIDialogMessage[]>(createDefaultMessages())
const cur_resp = ref('')
const cur_reasoning = ref('')
const promptInput = ref('')
const currentAiTaskHandle = ref<string | null>(null)
const createAssistantPlaceholder = (): AIDialogMessage =>
  reactive({
    role: 'assistant',
    content: '',
    reasoning: ''
  }) as AIDialogMessage
const defaultTitle = t('aiChat.defaultTitle')

// const { workspace, activeDocument } = useActiveDocument();
// const targetTabId = computed(() => props.id || workspace.activeTabId.value);

const dialogs = ref<AIDialog[]>([])

const loadDialogsFromStorage = () => {
  const stored = readAiChatDialogs()
  if (!stored.length) {
    dialogs.value = [createDefaultDialog(defaultTitle)]
    persistDialogsToStorage()
    return
  }
  // 为没有时间戳的对话添加时间戳
  const now = Date.now()
  dialogs.value = stored.map((dialog) => {
    if (!dialog.createdAt) {
      dialog.createdAt = now
    }
    if (!dialog.updatedAt) {
      dialog.updatedAt = now
    }
    return dialog
  })
  persistDialogsToStorage()
}

const persistDialogsToStorage = () => {
  writeAiChatDialogs(dialogs.value)
}

// 初始化当前对话
const initCurrentDialog = () => {
  loadDialogsFromStorage()
  if (dialogs.value && dialogs.value.length > 0) {
    loadDialog(0)
  } else {
    addNewDialog()
    loadDialog(0)
  }
}

const addNewDialog = () => {
  const newDialog = createDefaultDialog(defaultTitle)
  dialogs.value.unshift(newDialog) // 新建的会话排在第一位
  activeDialogIndex.value = 0
  messages.value = cloneDeep(newDialog.messages)
  title.value = newDialog.title
  // 新建会话时清空引用
  referenceStore.value = []
  activeReferenceIds.value = []
  updateCurrentDialog()
}

const updateCurrentDialog = (index: number | null = null, shouldMoveToTop: boolean = false) => {
  if (dialogs.value.length === 0) {
    dialogs.value.push(createDefaultDialog(defaultTitle))
  }
  const targetIndex = index == null ? activeDialogIndex.value : index
  const existingDialog = dialogs.value[targetIndex]

  // 计算AI最后一次回复时间（用于排序）
  const lastAssistantMessage = messages.value.filter((msg) => msg.role === 'assistant').slice(-1)[0]
  const lastAssistantTime = lastAssistantMessage?.timestamp
    ? typeof lastAssistantMessage.timestamp === 'string'
      ? new Date(lastAssistantMessage.timestamp).getTime()
      : lastAssistantMessage.timestamp
    : null

  // 优先使用AI最后一次回复时间，如果没有则使用原有对话的updatedAt，最后才使用当前时间
  const updatedAt = lastAssistantTime ?? existingDialog?.updatedAt ?? Date.now()

  const dialog: AIDialog = {
    title: title.value,
    messages: cloneDeep(messages.value),
    createdAt: existingDialog?.createdAt || Date.now(),
    updatedAt: updatedAt, // 使用AI最后一次回复时间，如果没有则保持原有的updatedAt
    referenceStore: cloneDeep(referenceStore.value) // 保存引用
  }

  if (index == null) {
    const currentIndex = activeDialogIndex.value
    dialogs.value[currentIndex] = dialog

    // 如果AI生成了新回复（shouldMoveToTop为true），将该会话移到最前面
    if (shouldMoveToTop && currentIndex > 0) {
      dialogs.value.splice(currentIndex, 1)
      dialogs.value.unshift(dialog)
      activeDialogIndex.value = 0
    }
  } else {
    dialogs.value[index] = dialog

    // 如果AI生成了新回复（shouldMoveToTop为true），将该会话移到最前面
    if (shouldMoveToTop && index > 0) {
      dialogs.value.splice(index, 1)
      dialogs.value.unshift(dialog)
      activeDialogIndex.value = 0
    }
  }
  persistDialogsToStorage()
}

const loadDialog = (index: number) => {
  activeDialogIndex.value = index
  const dialog = dialogs.value[index]
  messages.value = cloneDeep(dialog.messages)
  title.value = dialog.title
  // 加载对话的引用（会话级别持久化）
  if (dialog.referenceStore && Array.isArray(dialog.referenceStore)) {
    referenceStore.value = cloneDeep(dialog.referenceStore) as Reference[]
    // 默认激活所有引用
    activeReferenceIds.value = referenceStore.value.map((ref) => ref.id)
  } else {
    referenceStore.value = []
    activeReferenceIds.value = []
  }
  // 注意：加载对话时不应该更新updatedAt，只有AI生成新回复时才更新
  //logger.log(dialogs.value[index])
}

const deleteDialog = (index: number) => {
  if (dialogs.value.length === 0) return

  // 如果删除后没有对话了，不允许删除（需要至少保留一个）
  if (dialogs.value.length <= 1) {
    notifyWarning(t('aiChat.atLeastOneRequired', '至少需要保留一个对话'))
    return
  }

  dialogs.value.splice(index, 1)
  if (dialogs.value.length > 0) {
    const nextIndex = Math.min(index, dialogs.value.length - 1)
    activeDialogIndex.value = Math.max(nextIndex, 0)
    loadDialog(activeDialogIndex.value)
  } else {
    addNewDialog()
  }
  persistDialogsToStorage()
}

// 选择文档对话框相关
const panelStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd,
  color: themeState.currentTheme.textColor
}))

const containerStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

const duplicateDialog = (index: number) => {
  const dialog = dialogs.value[index]
  if (!dialog) return

  const duplicated: AIDialog = {
    title: dialog.title + ' (副本)',
    messages: cloneDeep(dialog.messages),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    referenceStore: cloneDeep(dialog.referenceStore || [])
  }

  dialogs.value.unshift(duplicated)
  activeDialogIndex.value = 0
  loadDialog(0)
  persistDialogsToStorage()
  notifySuccess(t('aiChat.duplicateSuccess', '对话已复制'))
}

const title = ref(defaultTitle)
const enableKnowledgeBaseQuery = ref(false)

const reset = () => {
  promptInput.value = ''
}

const handleCancel = () => {
  if (currentAiTaskHandle.value) {
    cancelAiTask(currentAiTaskHandle.value, false)
    currentAiTaskHandle.value = null
  }
  responding.value = false
  // 不清空cur_resp，保留已生成的内容
  // 如果当前有placeholder消息，将其替换为实际内容
  if (messages.value.length > 0) {
    const lastMessage = messages.value[messages.value.length - 1]
    if (lastMessage.role === 'assistant' && lastMessage.content === '') {
      // 这是一个placeholder，用cur_resp的内容替换它
      lastMessage.content = cur_resp.value
      if (cur_resp.value.trim()) {
        // 如果有内容，更新对话
        updateCurrentDialog(null, true)
      } else {
        // 如果没有内容，移除placeholder消息
        messages.value.pop()
      }
    }
  }
  notifyInfo(t('aiChat.generationCancelled'))
}

// 引用管理（临时存储，不持久化）
const referenceStore = ref<Reference[]>([])
const activeReferenceIds = ref<string[]>([])
const showReferenceDialog = ref(false)

// 监听引用变化，自动激活新添加的引用
watch(
  () => referenceStore.value,
  (newStore) => {
    if (newStore && newStore.length > 0) {
      const allReferenceIds = newStore.map((ref) => ref.id)
      if (
        activeReferenceIds.value.length === 0 ||
        !activeReferenceIds.value.some((id) => allReferenceIds.includes(id))
      ) {
        activeReferenceIds.value = [...allReferenceIds]
      } else {
        activeReferenceIds.value = activeReferenceIds.value.filter((id) =>
          allReferenceIds.includes(id)
        )
      }
    } else {
      activeReferenceIds.value = []
    }
  },
  { deep: true }
)

// 切换引用激活状态
const handleToggleReference = (referenceId: string) => {
  const index = activeReferenceIds.value.indexOf(referenceId)
  if (index > -1) {
    activeReferenceIds.value.splice(index, 1)
  } else {
    activeReferenceIds.value.push(referenceId)
  }
}

// 处理附件上传
const handleAttach = async (fileOrFiles?: File | File[]) => {
  try {
    // 检查输入框中是否是URL（用户可能粘贴了URL）
    const inputText = promptInput.value.trim()
    const isUrl = /^https?:\/\//.test(inputText)

    const files = Array.isArray(fileOrFiles) ? fileOrFiles : fileOrFiles ? [fileOrFiles] : []

    if (isUrl && files.length === 0) {
      // 处理URL（用户输入了URL但没有选择文件）
      const reference = await processUrlReference(inputText)
      promptInput.value = '' // 清空输入框

      referenceStore.value.push(reference)
      notifySuccess(t('agent.reference.addSuccess'))
      // 同步更新对话持久化
      updateCurrentDialog()
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

        // 批量添加到引用列表
        if (references.length > 0) {
          referenceStore.value.push(...references)

          // 同步更新对话持久化
          updateCurrentDialog()

          // 显示成功消息
          if (failCount === 0) {
            notifySuccess(
              files.length > 1 ? `成功添加 ${successCount} 个引用` : t('agent.reference.addSuccess')
            )
          } else {
            notifyWarning(`成功添加 ${successCount} 个引用，${failCount} 个失败`)
          }
        } else {
          notifyError('所有文件处理失败')
        }
      } finally {
        loading.close()
      }
    } else {
      // 既没有文件也没有URL，不处理（ChatComposer 会处理文件选择）
      return
    }
  } catch (error) {
    notifyError(error instanceof Error ? error.message : String(error))
  }
}

// 打开引用管理对话框
const handleOpenReferenceDialog = () => {
  showReferenceDialog.value = true
}

// 处理引用更新（从 ReferenceManager 触发）
const handleReferenceUpdate = () => {
  // ReferenceManager 会直接修改传入的 session.referenceStore
  // 由于我们传入的是 referenceStore，所以会自动同步
  // 同步更新对话持久化（包括添加、删除、清空等操作）
  updateCurrentDialog()
}

// 创建一个简单的引用管理器，直接操作 referenceStore
const aiChatReferenceManager = {
  addReference: (reference: Reference) => {
    referenceStore.value.push(reference)
  },
  removeReference: (referenceId: string) => {
    const index = referenceStore.value.findIndex((ref) => ref.id === referenceId)
    if (index > -1) {
      referenceStore.value.splice(index, 1)
    }
  },
  updateReference: (referenceId: string, updates: { name?: string; description?: string }) => {
    const reference = referenceStore.value.find((ref) => ref.id === referenceId)
    if (reference) {
      if (updates.name !== undefined) {
        reference.name = updates.name
      }
      if (updates.description !== undefined) {
        reference.description = updates.description
      }
    }
  },
  clearAll: () => {
    referenceStore.value = []
    activeReferenceIds.value = []
  }
}

/**
 * 构建引用内容（类似 AIContextManager.buildReferencesContent）
 */
function buildReferencesContent(references: Reference[]): string {
  if (references.length === 0) return ''

  let content = '=== 引用素材 ===\n\n'
  for (const ref of references) {
    content += `[${ref.name}] (格式: ${ref.format}, 来源: ${ref.origin})\n`
    if (ref.description) {
      content += `描述: ${ref.description}\n`
    }
    // 添加解析后的内容（供AI直接参考，上传时已解析）
    if (ref.parsedContent) {
      content += `\n解析后的内容（已进行数据分析/文本提取）:\n\`\`\`\n${ref.parsedContent}\n\`\`\`\n`
    }
    content += '\n'
  }

  return content
}

async function generateNextResponse(
  beforeGeneration: () => void | Promise<void>,
  callbackRef: Ref<string>,
  afterGeneration: () => void | Promise<void>,
  shouldQueryKnowledgeBase: boolean = false,
  enableReasoning: boolean = false
) {
  responding.value = true
  await Promise.resolve(beforeGeneration())
  cur_reasoning.value = ''
  //logger.log(messages.value)
  const messageCopy: AIDialogMessage[] = JSON.parse(JSON.stringify(messages.value)) // 深拷贝消息列表，因为Proxy不能直接拷贝

  // DeepSeek（及部分 OpenAI-compatible）会严格校验 messages：不允许出现连续 assistant。
  // 我们的 UI 会先 push 一个 assistant placeholder（content=''）用于流式渲染，但该占位不应参与请求。
  while (messageCopy.length > 0) {
    const last = messageCopy[messageCopy.length - 1]
    const isAssistant = last?.role === 'assistant'
    const c = typeof last?.content === 'string' ? last.content.trim() : ''
    const r = typeof (last as any)?.reasoning === 'string' ? String((last as any).reasoning).trim() : ''
    if (isAssistant && !c && !r) {
      messageCopy.pop()
      continue
    }
    break
  }

  // 构建包含引用信息的消息数组
  // 1. 如果有激活的引用，构建引用内容作为系统消息
  const activeReferences = referenceStore.value.filter((ref) =>
    activeReferenceIds.value.includes(ref.id)
  )
  if (activeReferences.length > 0) {
    const referencesContent = buildReferencesContent(activeReferences)
    // 在消息数组开头插入系统消息（如果还没有系统消息）
    const hasSystemMessage = messageCopy.some((msg) => msg.role === 'system')
    if (!hasSystemMessage) {
      messageCopy.unshift({
        role: 'system',
        content: referencesContent
      })
    } else {
      // 如果有系统消息，将引用内容追加到第一个系统消息
      const firstSystemIndex = messageCopy.findIndex((msg) => msg.role === 'system')
      if (firstSystemIndex !== -1) {
        messageCopy[firstSystemIndex].content =
          (messageCopy[firstSystemIndex].content || '') + '\n\n' + referencesContent
      }
    }
  }

  //logger.log(messageCopy)
  // taskName 仅用于展示；避免 messageCopy 太短时访问越界
  const taskName =
    messageCopy.length >= 2 ? messageCopy[messageCopy.length - 2].content ?? 'AI Chat' : 'AI Chat'
  const { handle, done } = createAiTask(
    taskName,
    messageCopy,
    cur_resp,
    ai_types.chat,
    'ai-chat',
    {
      stream: true,
      enableKnowledgeBase: shouldQueryKnowledgeBase,
      reasoningRef: cur_reasoning,
      ...(enableReasoning ? { enableReasoning: true } : {})
    }
  )
  currentAiTaskHandle.value = handle
  let wasCancelled = false
  try {
    await done
  } catch (err) {
    wasCancelled = true
    logger.warn('任务失败或取消：', err)
    // 如果取消，不清空cur_resp，保留已生成的内容
    // afterGeneration会处理placeholder的替换
  } finally {
    currentAiTaskHandle.value = null
    await Promise.resolve(afterGeneration())
    responding.value = false
  }
}

const onMsgSend = async (
  enableKnowledgeBaseQueryParam?: boolean,
  _content?: string,
  enableReasoningParam?: boolean
) => {
  const userMessage: AIDialogMessage & { referenceIds?: string[] } = {
    role: 'user',
    content: promptInput.value,
    referenceIds: [...activeReferenceIds.value] // 保存当前激活的引用ID
  }
  messages.value.push(userMessage)
  updateTitle(userMessage.content).catch((error) => {
    logger.debug('update title failed', error)
  })
  //logger.log(messages.value);
  promptInput.value = ''
  cur_resp.value = ''
  cur_reasoning.value = ''

  // 使用传入的参数或当前状态
  const shouldQueryKnowledgeBase =
    enableKnowledgeBaseQueryParam !== undefined
      ? enableKnowledgeBaseQueryParam
      : enableKnowledgeBaseQuery.value

  const enableReasoning = enableReasoningParam === true

  let stopStream: WatchStopHandle | undefined
  let stopReasoning: WatchStopHandle | undefined
  await generateNextResponse(
    () => {
      const placeholder = createAssistantPlaceholder()
      messages.value.push(placeholder)
      stopStream = watch(
        cur_resp,
        (value) => {
          placeholder.content = value
        },
        { immediate: true }
      )
      stopReasoning = watch(
        cur_reasoning,
        (value) => {
          placeholder.reasoning = value
        },
        { immediate: true }
      )
    },
    cur_resp,
    async () => {
      stopStream?.()
      stopReasoning?.()
      // 如果最后一个消息是placeholder（空内容），用实际内容替换它
      if (messages.value.length > 0) {
        const lastMessage = messages.value[messages.value.length - 1]
        if (lastMessage.role === 'assistant' && lastMessage.content === '') {
          // 这是一个placeholder，用cur_resp的内容替换它
          lastMessage.content = cur_resp.value
          lastMessage.reasoning = cur_reasoning.value
          if (!cur_resp.value.trim() && !cur_reasoning.value.trim()) {
            // 如果没有内容，移除placeholder消息
            messages.value.pop()
          }
        } else {
          // 不是placeholder，正常处理（这种情况不应该发生，但为了安全起见）
          messages.value.pop()
          const assistantMessage: AIDialogMessage = {
            role: 'assistant',
            content: cur_resp.value,
            reasoning: cur_reasoning.value || undefined
          }
          messages.value.push(assistantMessage)
        }
      }

      //bindCode(false);
      //logger.log(messages.value);
      if (cur_resp.value.trim() || cur_reasoning.value.trim()) {
        updateCurrentDialog(null, true) // AI生成新回复时，移到最前面
        updateTitle()
      }
    },
    shouldQueryKnowledgeBase,
    enableReasoning
  )
}

// 其余方法保持原有实现，只需将localStorage操作替换为updateCurrentDialog()

const MAX_TITLE_LENGTH = 20
const TITLE_CONTEXT_LIMIT = 6

const buildTitleSource = (seedText?: string): string => {
  // 获取最近的对话消息（不包括系统消息）
  const recentMessages = messages.value
    .filter((msg) => msg.role !== 'system')
    .slice(-TITLE_CONTEXT_LIMIT)

  // 如果传入了 seedText（用户刚发送的消息），确保它包含在上下文中
  // 由于 messages.value.push(userMessage) 是同步的，最后一条消息应该就是用户刚发送的消息
  if (seedText && seedText.trim()) {
    // 检查最后一条消息是否是用户消息，且内容匹配 seedText
    const lastMessage = recentMessages[recentMessages.length - 1]
    if (
      lastMessage &&
      lastMessage.role === 'user' &&
      lastMessage.content.trim() === seedText.trim()
    ) {
      // 如果最后一条消息就是用户刚发送的消息，使用完整的对话上下文（包括用户消息）
      return recentMessages.map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n')
    }
    // 如果最后一条消息不匹配（理论上不应该发生），仍然使用 seedText 和之前的消息
    const previousMessages = recentMessages.slice(0, -1)
    const contextMessages =
      previousMessages.length > 0
        ? [...previousMessages, { role: 'user', content: seedText.trim() }]
        : [{ role: 'user', content: seedText.trim() }]
    return contextMessages.map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n')
  }

  // 如果没有传入 seedText，使用最近的对话消息
  return recentMessages.map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n')
}

const sanitizeGeneratedTitle = (raw: string): string => {
  let next = raw.trim()
  while (next.startsWith('#')) {
    next = next.slice(1).trim()
  }
  next = next.replace(/\s+/g, ' ')
  if (next.length > MAX_TITLE_LENGTH) {
    next = next
      .slice(0, MAX_TITLE_LENGTH)
      .replace(/[，。,;:!?、．…-]+$/, '')
      .trim()
  }
  if (!next) {
    next = defaultTitle
  }
  return next
}

const updateTitle = async (seedText?: string) => {
  const titleSource = buildTitleSource(seedText)
  const prompt = updateTitlePrompt(JSON.stringify(titleSource))
  //备注：因为标题撰写需要一定时间，而用户可能在这个时间切换到其他对话，因此首先要保存索引
  const index = activeDialogIndex.value //当前对话索引

  // 构建消息数组，将 prompt 转换为对话格式
  const messages: AIDialogMessage[] = []
  messages.push({
    role: 'user',
    content: prompt
  })

  const generatedText = ref('')
  const enableKnowledgeBase = await getSetting('enableKnowledgeBase')
  const { handle, done } = createAiTask(
    title.value || defaultTitle,
    messages,
    generatedText,
    ai_types.chat,
    'ai-chat-generate-title',
    { stream: true, enableKnowledgeBase: Boolean(enableKnowledgeBase) }
  )
  try {
    await done
  } catch (err) {
    logger.error('生成标题失败', err)
    // 如果生成失败，使用默认标题或保留原标题
    return
  }

  let schemaTitle: string | undefined
  let fallbackTitle: string | undefined

  try {
    const parsed = parseSchemaJson<DocumentTitleSchemaResult>(
      generatedText.value,
      DOCUMENT_TITLE_SCHEMA
    )
    schemaTitle = parsed.title
  } catch (error) {
    logger.warn('解析标题JSON失败，尝试从文本中提取', error, generatedText.value)

    // 尝试从生成的文本中提取标题
    // 1. 尝试提取 JSON 中的 title 字段（即使整体解析失败）
    const titleMatch = generatedText.value.match(/"title"\s*:\s*"([^"]+)"/)
    if (titleMatch) {
      fallbackTitle = titleMatch[1]
    } else {
      // 2. 尝试提取引号中的文本（可能是标题）
      const quotedMatch = generatedText.value.match(/"([^"]{4,40})"/)
      if (quotedMatch) {
        fallbackTitle = quotedMatch[1]
      } else {
        // 3. 尝试提取第一行非空文本
        const lines = generatedText.value
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l)
        if (lines.length > 0) {
          // 移除可能的 JSON 标记和多余字符
          const firstLine = lines[0]
            .replace(/^[{\[]/, '')
            .replace(/[}\]]$/, '')
            .replace(/^"title"\s*:\s*"?/, '')
            .replace(/^"|"$/g, '')
            .trim()
          if (firstLine.length >= 2 && firstLine.length <= 40) {
            fallbackTitle = firstLine
          }
        }
      }
    }
  }

  // 优先使用 schema 解析的标题，其次使用回退标题，最后使用原始文本或种子文本
  let newTitle = sanitizeGeneratedTitle(
    schemaTitle ?? fallbackTitle ?? generatedText.value ?? titleSource
  )

  // 确保标题不为空
  if (!newTitle || newTitle.trim() === '') {
    newTitle = defaultTitle
  }

  if (dialogs.value[index] && dialogs.value[index].title === title.value) {
    title.value = newTitle
  }
  if (dialogs.value[index]) {
    dialogs.value[index].title = newTitle
  }
  updateCurrentDialog(index)
}

const handleExternalDialogsUpdate = () => {
  initCurrentDialog()
}

// 窗口迁移后恢复当前选中的对话索引
watch(
  [() => workspace.activeTabId.value, ourTabId, () => dialogs.value.length],
  () => {
    const tid = ourTabId.value
    if (!tid || workspace.activeTabId.value !== tid || dialogs.value.length === 0) return
    const state = workspace.getTabToolState(tid)
    const savedIndex = state.activeDialogIndex
    if (savedIndex == null || savedIndex < 0 || savedIndex >= dialogs.value.length) return
    if (activeDialogIndex.value === savedIndex) return
    loadDialog(savedIndex)
  },
  { immediate: true }
)

onMounted(() => {
  if (isDemo.value) {
    // Demo mode: use mock data only, no real initialization
    return
  }
  initCurrentDialog()
  eventBus.on('ai-dialogs-loaded', initCurrentDialog)
  eventBus.on('ai-chat-dialogs-updated', handleExternalDialogsUpdate)
})

onBeforeUnmount(() => {
  eventBus.off('ai-dialogs-loaded', initCurrentDialog)
  eventBus.off('ai-chat-dialogs-updated', handleExternalDialogsUpdate)
})

watch([messages], () => {
  if (isDemo.value) return
  //bindCode(false);
  // 注意：这里不移动会话到最前面，只有AI生成新回复时才移动
  updateCurrentDialog()
})

watch([title], () => {
  if (isDemo.value) return
  // 注意：这里不移动会话到最前面，只有AI生成新回复时才移动
  updateCurrentDialog()
})

const onMsgDelete = (index: number) => {
  let targetIndex = index + 1 //有偏移量
  if (targetIndex < 0 || targetIndex >= messages.value.length) return
  messages.value.splice(targetIndex, 1)
  //bindCode(false);
  notifySuccess(t('common.deleteSuccess'))
  updateCurrentDialog()
}
const regenerate = async (index: number) => {
  messages.value.splice(index + 1)
  cur_resp.value = ''
  cur_reasoning.value = ''
  let stopStream: WatchStopHandle | undefined
  let stopReasoning: WatchStopHandle | undefined
  await generateNextResponse(
    () => {
      const placeholder = createAssistantPlaceholder()
      messages.value.push(placeholder)
      stopStream = watch(
        cur_resp,
        (value) => {
          placeholder.content = value
        },
        { immediate: true }
      )
      stopReasoning = watch(
        cur_reasoning,
        (value) => {
          placeholder.reasoning = value
        },
        { immediate: true }
      )
    },
    cur_resp,
    () => {
      stopStream?.()
      stopReasoning?.()
      // 如果最后一个消息是placeholder（空内容），用实际内容替换它
      if (messages.value.length > 0) {
        const lastMessage = messages.value[messages.value.length - 1]
        if (lastMessage.role === 'assistant' && lastMessage.content === '') {
          // 这是一个placeholder，用cur_resp的内容替换它
          lastMessage.content = cur_resp.value
          lastMessage.reasoning = cur_reasoning.value
          if (!cur_resp.value.trim() && !cur_reasoning.value.trim()) {
            // 如果没有内容，移除placeholder消息
            messages.value.pop()
          }
        } else {
          // 不是placeholder，正常处理（这种情况不应该发生，但为了安全起见）
          messages.value.pop()
          const assistantMessage: AIDialogMessage = {
            role: 'assistant',
            content: cur_resp.value,
            reasoning: cur_reasoning.value || undefined,
            timestamp: Date.now() // 记录AI回复时间
          }
          messages.value.push(assistantMessage)
        }
      }
      if (cur_resp.value.trim()) {
        updateCurrentDialog(null, true) // AI生成新回复时，移到最前面
      }
    },
    enableKnowledgeBaseQuery.value
  )
  //await updateTitle();
}
type MessageEditPayload = {
  index: number
  message: string
}

const onMsgEdit = async (data: MessageEditPayload) => {
  let index = data.index + 1 //有偏移量
  const newText = data.message
  const message = messages.value[index]
  if (!message) return
  message.content = newText
  //logger.log(message)

  if (message.role === 'user') {
    await regenerate(index)
  }
  updateCurrentDialog()
}

// SessionList 集成
const sessionListItems = computed<SessionListItem[]>(() =>
  dialogs.value.map((dialog, index) => ({
    id: index.toString(),
    title: dialog.title,
    updatedAt: dialog.updatedAt || dialog.createdAt || Date.now()
  }))
)

const handleSessionSelect = (item: SessionListItem) => {
  const index = parseInt(item.id)
  loadDialog(index)
  const tid = ourTabId.value
  if (tid != null) workspace.setTabToolState(tid, { activeDialogIndex: index })
}

const handleSessionRename = (item: SessionListItem, newTitle: string) => {
  const index = parseInt(item.id)
  if (index >= 0 && index < dialogs.value.length) {
    dialogs.value[index] = {
      ...dialogs.value[index],
      title: newTitle
    }
    if (activeDialogIndex.value === index) {
      title.value = newTitle
    }
    persistDialogsToStorage()
  }
}

const handleSessionDuplicate = (item: SessionListItem) => {
  duplicateDialog(parseInt(item.id))
}

const handleSessionDelete = (item: SessionListItem) => {
  deleteDialog(parseInt(item.id))
}
</script>

<style scoped>
.ai-chat-container {
  width: 100%;
  height: 100%;
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
  display: flex;
  flex-direction: column;
  min-width: 0; /* 允许收缩 */
  min-height: 0; /* 允许收缩 */
  overflow: hidden; /* 防止内容溢出 */
  padding: 16px;
  box-sizing: border-box;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;
}

.conversation-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 4px;
  margin-bottom: 12px;
}

.conversation-header .title {
  margin: 0;
  font-size: 18px;
}

.conversation-stats {
  display: flex;
  gap: 8px;
}

.dialog-container {
  flex: 1;
  background-color: rgba(170, 221, 255, 0.11);
  padding: 20px;
  margin: 0;
  min-height: 0;
  position: relative;
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
  padding-right: 4px;
}

.conversation-scroll :deep([data-radix-scroll-area-viewport]) {
  overflow-x: hidden;
}

.conversation-bottom-spacer {
  height: 120px;
  flex-shrink: 0;
}

.conversation-bottom-spacer.has-references {
  height: 160px; /* 如果有引用列表，增加底部空间 */
}

.composer-wrapper {
  position: absolute;
  left: 20px;
  right: 20px;
  bottom: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
  padding: 0;
  gap: 8px;
}

.composer-wrapper > * {
  pointer-events: auto;
  width: 100%;
  max-width: min(960px, 100%);
  min-width: 0;
  box-sizing: border-box;
}

</style>
