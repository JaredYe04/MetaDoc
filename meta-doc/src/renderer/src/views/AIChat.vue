<template>
  <el-scrollbar>
    <el-dialog v-model="renameDialogVisible" :title="t('aiChat.renameTitle')" width="500">
      <el-input v-model="editingTitle" style="width: 100%" :placeholder="t('aiChat.renamePlaceholder')" />
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="renameDialogVisible = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" @click="finishRename">
            {{ t('common.confirm') }}
          </el-button>
        </div>
      </template>
    </el-dialog>

    <div class="main-container">
      <!-- 左侧菜单 -->
      <el-menu class="side-menu" :default-active="activeDialogIndex.toString()">
        <div class="menu-header">

          <el-tooltip :content="t('aiChat.newDialog')">
            <el-button type="primary" :icon="AddIcon" circle @click="addNewDialog" :disabled="responding"></el-button>
          </el-tooltip>
          <el-tooltip :content="t('aiChat.deleteCurrent')">
            <el-button type="danger" :icon="Delete" circle @click="deleteCurrentDialog" :disabled="responding"></el-button>
          </el-tooltip>


        </div>
        <el-menu-item v-for="(dialog, index) in dialogs" :key="index" :index="index.toString()"
          @click="loadDialog(index)" :disabled="responding">
          <div class="menu-item-wrapper">
            <span class="dialog-title">{{ dialog.title }}</span>
            <el-button circle :icon="Edit" @click.stop="renameDialog(index)" class="rename-button" type="default">

            </el-button>
          </div>
        </el-menu-item>
      </el-menu>

      <!-- 右侧内容 -->
      <div class="content-area">
        <h1 class="title">{{ title }}</h1>
        <div class="dialog-container">
          <el-scrollbar>
            <MessageBubble v-for="(message, index) in messages.filter(item => item.role !== 'system')" :key="index"
              :message="message" @delete="onMsgDelete" @edit="onMsgEdit" @regenerate="regenerate" :index="index" />
          </el-scrollbar>

        </div>

        <div class="composer-wrapper">
          <ChatComposer
            v-model="promptInput"
            :loading="responding"
            :disabled="responding"
            :placeholder="t('aiChat.inputPlaceholder')"
            :show-voice="false"
            @submit="onMsgSend"
            @reset="reset"
            @attach="handleAttach"
          />
        </div>

      </div>
    </div>
  </el-scrollbar>

</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch, type Ref, type WatchStopHandle } from 'vue';
import MessageBubble from "../components/MessageBubble.vue";
//import { bindCode } from "../assets/aichat_legacy/utils";
import { ChatSquare, Delete, Edit } from "@element-plus/icons-vue/global";
import "../assets/input-box.css"
import "../assets/title.css"

import { ElMessage } from "element-plus";
import eventBus from '../utils/event-bus.js';
import { themeState } from "../utils/themes.js";
import { AddIcon } from 'tdesign-icons-vue-next';
import { answerQuestion } from '../utils/llm-api.js';
import '../assets/tool-group.css'
import { updateTitlePrompt } from '../utils/prompts';
import { useI18n } from 'vue-i18n'
import { ai_types, createAiTask } from '../utils/ai_tasks.ts';
import { getSetting } from '../utils/settings.js';
// import { useActiveDocument } from '../composables/useActiveDocument';
import { DEFAULT_AI_CHAT_MESSAGES } from '../constants/document';
import type { AIDialog, AIDialogMessage } from '../../../types';
import ChatComposer from '../components/chat/ChatComposer.vue';
import { readAiChatDialogs, writeAiChatDialogs } from '../utils/ai-chat-storage';
import { parseSchemaJson, DOCUMENT_TITLE_SCHEMA, type DocumentTitleSchemaResult } from '../utils/schemas';
const { t } = useI18n()
const responding = ref(false);
const activeDialogIndex = ref<number>(0);

import { createRendererLogger } from '../utils/logger.ts';
const logger = createRendererLogger('AIChat');

const props = defineProps({
  id: String
})

const cloneDeep = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const createDefaultMessages = (): AIDialogMessage[] =>
  DEFAULT_AI_CHAT_MESSAGES.map((message) => ({ ...message }));

const createDefaultDialog = (title: string): AIDialog => ({
  title,
  messages: createDefaultMessages(),
});

const messages = ref<AIDialogMessage[]>(createDefaultMessages());
const cur_resp = ref('')
const promptInput = ref('');
const createAssistantPlaceholder = (): AIDialogMessage =>
  reactive({
    role: 'assistant',
    content: '',
  }) as AIDialogMessage;
const defaultTitle = t('aiChat.defaultTitle');

// const { workspace, activeDocument } = useActiveDocument();
// const targetTabId = computed(() => props.id || workspace.activeTabId.value);

const dialogs = ref<AIDialog[]>([]);

const loadDialogsFromStorage = () => {
  const stored = readAiChatDialogs();
  if (!stored.length) {
    dialogs.value = [createDefaultDialog(defaultTitle)];
    persistDialogsToStorage();
    return;
  }
  dialogs.value = stored;
};

const persistDialogsToStorage = () => {
  writeAiChatDialogs(dialogs.value);
};

// 初始化当前对话
const initCurrentDialog = () => {
  loadDialogsFromStorage();
  if (dialogs.value && dialogs.value.length > 0) {
    loadDialog(0);
  } else {
    addNewDialog();
    loadDialog(0);
  }
};

const addNewDialog = () => {
  const newDialog = createDefaultDialog(defaultTitle);
  dialogs.value.push(newDialog);
  activeDialogIndex.value = dialogs.value.length - 1;
  messages.value = cloneDeep(newDialog.messages);
  title.value = newDialog.title;
  updateCurrentDialog();
};

const updateCurrentDialog = (index: number | null = null) => {
  if (dialogs.value.length === 0) {
    dialogs.value.push(createDefaultDialog(defaultTitle));
  }
  const dialog: AIDialog = {
    title: title.value,
    messages: cloneDeep(messages.value),
  };
  if (index == null) {
    dialogs.value[activeDialogIndex.value] = dialog;
  }
  else {
    dialogs.value[index] = dialog;
  }
  persistDialogsToStorage();
};

const loadDialog = (index: number) => {
  activeDialogIndex.value = index;
  const dialog = dialogs.value[index];
  messages.value = cloneDeep(dialog.messages);
  title.value = dialog.title;
  //logger.log(dialogs.value[index])
};

const deleteCurrentDialog = () => {
  if (dialogs.value.length === 0) return;
  dialogs.value.splice(activeDialogIndex.value, 1);
  if (dialogs.value.length > 0) {
    const nextIndex = Math.min(activeDialogIndex.value, dialogs.value.length - 1);
    activeDialogIndex.value = Math.max(nextIndex, 0);
    loadDialog(activeDialogIndex.value);
  } else {
    addNewDialog();
  }
  persistDialogsToStorage();
};
const renameDialog = (index: number) => {
  editingIndex.value = index;
  renameDialogVisible.value = true;
  editingTitle.value = dialogs.value[index]?.title ?? '';
};
const renameDialogVisible = ref(false);
const editingTitle = ref('');
const editingIndex = ref<number>(0);
const finishRename = () => {
  const index = editingIndex.value;
  if (index < 0 || index >= dialogs.value.length) {
    renameDialogVisible.value = false;
    return;
  }
  dialogs.value[index] = {
    title: editingTitle.value,
    messages: cloneDeep(messages.value),
  };
  if (activeDialogIndex.value === editingIndex.value) {
    title.value = editingTitle.value;
  }
  renameDialogVisible.value = false;
};

const title = ref(defaultTitle);

const reset = () => {
  promptInput.value = '';
}

const handleAttach = () => {
  eventBus.emit('ai-chat-attach');
};

async function generateNextResponse(
  beforeGeneration: () => void | Promise<void>,
  callbackRef: Ref<string>,
  afterGeneration: () => void | Promise<void>,
) {
  responding.value = true;
  await Promise.resolve(beforeGeneration());
  //logger.log(messages.value)
  const messageCopy: AIDialogMessage[] = JSON.parse(JSON.stringify(messages.value));// 深拷贝消息列表，因为Proxy不能直接拷贝
  //logger.log(messageCopy)
  const enableKnowledgeBase=await getSetting("enableKnowledgeBase");
  const { handle, done } = createAiTask(
    messageCopy[messageCopy.length - 2].content ?? "AI Chat", 
    messageCopy, 
    cur_resp, 
    ai_types.chat, 
    'ai-chat',
    { stream: true, enableKnowledgeBase: Boolean(enableKnowledgeBase) }
  );
  try {
    await done;
  } catch (err) {
    logger.warn('任务失败或取消：', err);
  } finally {
    await Promise.resolve(afterGeneration());
    responding.value = false;
  }



}

const onMsgSend = async () => {
  const userMessage: AIDialogMessage = {
    role: 'user',
    content: promptInput.value,
  };
  messages.value.push(userMessage);
  updateTitle(userMessage.content).catch((error) => {
    logger.debug('update title failed', error);
  });
  //logger.log(messages.value);
  promptInput.value = '';
  cur_resp.value = '';

  let stopStream: WatchStopHandle | undefined;
  await generateNextResponse(
    () => {
      const placeholder = createAssistantPlaceholder();
      messages.value.push(placeholder);
      stopStream = watch(
        cur_resp,
        (value) => {
          placeholder.content = value;
        },
        { immediate: true },
      );
    },
    cur_resp,
    async () => {
      messages.value.pop();
      stopStream?.();
      const assistantMessage: AIDialogMessage = {
        role: 'assistant',
        content: cur_resp.value,
      };
      messages.value.push(assistantMessage);

      //bindCode(false);
      //logger.log(messages.value);
      updateCurrentDialog();
      updateTitle();

    }
  );


};

// 其余方法保持原有实现，只需将localStorage操作替换为updateCurrentDialog()

const MAX_TITLE_LENGTH = 20;
const TITLE_CONTEXT_LIMIT = 6;

const buildTitleSource = (seedText?: string): string => {
  if (seedText && seedText.trim()) {
    return seedText.trim();
  }
  const recentMessages = messages.value
    .filter((msg) => msg.role !== 'system')
    .slice(-TITLE_CONTEXT_LIMIT);
  return recentMessages
    .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
    .join('\n');
};

const sanitizeGeneratedTitle = (raw: string): string => {
  let next = raw.trim();
  while (next.startsWith('#')) {
    next = next.slice(1).trim();
  }
  next = next.replace(/\s+/g, ' ');
  if (next.length > MAX_TITLE_LENGTH) {
    next = next.slice(0, MAX_TITLE_LENGTH).replace(/[，。,;:!?、．…-]+$/, '').trim();
  }
  if (!next) {
    next = defaultTitle;
  }
  return next;
};

const updateTitle = async (seedText?: string) => {
  const titleSource = buildTitleSource(seedText);
  const prompt = updateTitlePrompt(JSON.stringify(titleSource));
  //备注：因为标题撰写需要一定时间，而用户可能在这个时间切换到其他对话，因此首先要保存索引
  const index = activeDialogIndex.value;//当前对话索引

  const generatedText = ref('');
  const enableKnowledgeBase=await getSetting("enableKnowledgeBase")
  const { handle, done } = createAiTask(
    title.value || defaultTitle, 
    prompt, 
    generatedText, 
    ai_types.answer, 
    'ai-chat-generate-title',
    { stream: false, enableKnowledgeBase: Boolean(enableKnowledgeBase) }
  );
  try {
    await done;
  } catch (err) {
    logger.error('生成标题失败', err);
    // 如果生成失败，使用默认标题或保留原标题
    return;
  }

  let schemaTitle: string | undefined;
  let fallbackTitle: string | undefined;

  try {
    const parsed = parseSchemaJson<DocumentTitleSchemaResult>(
      generatedText.value,
      DOCUMENT_TITLE_SCHEMA,
    );
    schemaTitle = parsed.title;
  } catch (error) {
    logger.warn('解析标题JSON失败，尝试从文本中提取', error, generatedText.value);
    
    // 尝试从生成的文本中提取标题
    // 1. 尝试提取 JSON 中的 title 字段（即使整体解析失败）
    const titleMatch = generatedText.value.match(/"title"\s*:\s*"([^"]+)"/);
    if (titleMatch) {
      fallbackTitle = titleMatch[1];
    } else {
      // 2. 尝试提取引号中的文本（可能是标题）
      const quotedMatch = generatedText.value.match(/"([^"]{4,40})"/);
      if (quotedMatch) {
        fallbackTitle = quotedMatch[1];
      } else {
        // 3. 尝试提取第一行非空文本
        const lines = generatedText.value.split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length > 0) {
          // 移除可能的 JSON 标记和多余字符
          const firstLine = lines[0]
            .replace(/^[{\[]/, '')
            .replace(/[}\]]$/, '')
            .replace(/^"title"\s*:\s*"?/, '')
            .replace(/^"|"$/g, '')
            .trim();
          if (firstLine.length >= 2 && firstLine.length <= 40) {
            fallbackTitle = firstLine;
          }
        }
      }
    }
  }

  // 优先使用 schema 解析的标题，其次使用回退标题，最后使用原始文本或种子文本
  let newTitle = sanitizeGeneratedTitle(
    schemaTitle ?? fallbackTitle ?? generatedText.value ?? titleSource
  );
  
  // 确保标题不为空
  if (!newTitle || newTitle.trim() === '') {
    newTitle = defaultTitle;
  }

  if (dialogs.value[index] && dialogs.value[index].title === title.value) {
    title.value = newTitle;
  }
  if (dialogs.value[index]) {
    dialogs.value[index].title = newTitle;
  }
  updateCurrentDialog(index);
};

const handleExternalDialogsUpdate = () => {
  initCurrentDialog();
};

onMounted(() => {
  initCurrentDialog();
  eventBus.on('ai-dialogs-loaded', initCurrentDialog);
  eventBus.on('ai-chat-dialogs-updated', handleExternalDialogsUpdate);
});

onBeforeUnmount(() => {
  eventBus.off('ai-dialogs-loaded', initCurrentDialog);
  eventBus.off('ai-chat-dialogs-updated', handleExternalDialogsUpdate);
});

watch([messages], () => {
  //bindCode(false);
  updateCurrentDialog();
});

watch([title], () => {
  updateCurrentDialog();
});

const onMsgDelete = (index: number) => {
  let targetIndex = index + 1;//有偏移量
  if (targetIndex < 0 || targetIndex >= messages.value.length) return;
  messages.value.splice(targetIndex, 1);
  //bindCode(false);
  ElMessage({
    type: 'success',
    message: t('common.deleteSuccess'),
  })
  updateCurrentDialog();
}
const regenerate = async (index: number) => {
  messages.value.splice(index + 1);
  cur_resp.value = '';
  let stopStream: WatchStopHandle | undefined;
  await generateNextResponse(
    () => {
      const placeholder = createAssistantPlaceholder();
      messages.value.push(placeholder);
      stopStream = watch(
        cur_resp,
        (value) => {
          placeholder.content = value;
        },
        { immediate: true },
      );
    },
    cur_resp,
    () => {
      messages.value.pop();
      stopStream?.();
      const assistantMessage: AIDialogMessage = {
        role: 'assistant',
        content: cur_resp.value,
      };
      messages.value.push(assistantMessage);

      //bindCode(false);
      updateCurrentDialog();
    }
  );
  //await updateTitle();

}
type MessageEditPayload = {
  index: number;
  message: string;
};

const onMsgEdit = async (data: MessageEditPayload) => {
  let index = data.index + 1;//有偏移量
  const newText = data.message;
  const message = messages.value[index];
  if (!message) return;
  message.content = newText;
  //logger.log(message)


  if (message.role === 'user') {
    await regenerate(index)
  }
  updateCurrentDialog();

}
// 样式部分添加左侧菜单




</script>

<style scoped>
.main-container {
  display: flex;
  height: 100vh;
}

.side-menu {
  width: 250px;
  height: 100%;

}

.menu-header {
  align-self: center;
  padding: 10px;
  display: flex;
  flex-direction: row;


}

.content-area {
  flex: 1;

  display: flex;
  flex-direction: column;
}

.dialog-container {
  flex: 1;
  background-color: rgba(170, 221, 255, 0.11);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  border: #606060 1px solid;
  border-radius: 20px;
  padding: 20px;
  margin: 20px;
  overflow: auto;
}

.composer-wrapper {
  padding: 12px 24px 32px;
  display: flex;
  justify-content: center;
}

.menu-item-wrapper {
  position: relative;
  /* 让子元素绝对定位时以该元素为参考 */
  width: 100%;
  /* 占满整个菜单项 */
  padding-right: 40px;
  /* 给按钮留出空间，防止文字覆盖按钮 */
  box-sizing: border-box;
  /* 防止padding撑开宽度 */
  overflow: hidden;
  /* 超出部分隐藏 */
  white-space: nowrap;
  /* 禁止文字换行 */
  text-overflow: ellipsis;
  /* 超出部分显示省略号 */
}

.dialog-title {
  display: inline-block;
  max-width: calc(95%);
  /* 避免文字覆盖按钮 */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rename-button {
  position: absolute;
  /* 绝对定位 */
  right: 0px;
  /* 始终固定在右侧 */
  top: 50%;
  transform: translateY(-50%);
  /* 垂直居中 */

}
</style>