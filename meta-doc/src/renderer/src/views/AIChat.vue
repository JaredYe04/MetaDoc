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

        <div class="input-box input-area" :style="{
          backgroundColor: themeState.currentTheme.background,
          color: themeState.currentTheme.textColor

        }" style="height:120px;">
          <el-scrollbar style="height: 70px;">
            <el-input v-model="promptInput" :placeholder="t('aiChat.inputPlaceholder')" type="textarea"
              :autosize="{ minRows: 2, maxRows: 4 }" class="input-with-select" :disabled="responding" />
          </el-scrollbar>


          <el-button id="sendMsg" @click="onMsgSend" type="primary" round size="large" text bg
            :disabled="responding || promptInput.length === 0">
            {{ t('aiChat.send') }}
          </el-button>
          <el-button id="reset" @click="reset" round type="info" size="large" :disabled="responding" text bg>
            {{ t('aiChat.reset') }}
          </el-button>
        </div>

      </div>
    </div>
  </el-scrollbar>

</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch, type Ref } from 'vue';
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
import { updateTitlePrompt } from '../utils/prompts.js';
import { useI18n } from 'vue-i18n'
import { ai_types, createAiTask } from '../utils/ai_tasks.js';
import { getSetting } from '../utils/settings.js';
import { useActiveDocument } from '../composables/useActiveDocument';
import { DEFAULT_AI_CHAT_MESSAGES } from '../constants/document';
import type { AIDialog, AIDialogMessage } from '../../../types';
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
const createAssistantPlaceholder = (): AIDialogMessage => ({
  role: 'assistant',
  content: cur_resp.value,
});
const defaultTitle = t('aiChat.defaultTitle');

const { workspace, activeDocument } = useActiveDocument();
const targetTabId = computed(() => props.id || workspace.activeTabId.value);

const dialogs = ref<AIDialog[]>([]);
let isSyncingFromWorkspace = false;

const syncDialogsFromWorkspace = () => {
  isSyncingFromWorkspace = true;
  const tabId = targetTabId.value;
  if (!tabId) {
    dialogs.value = [];
    isSyncingFromWorkspace = false;
    return;
  }
  try {
    const doc = workspace.ensureDocument(tabId);
    if (!doc.aiDialogs || doc.aiDialogs.length === 0) {
      dialogs.value = [createDefaultDialog(defaultTitle)];
      workspace.updateDocumentAiDialogs(tabId, cloneDeep(dialogs.value));
    } else {
      dialogs.value = cloneDeep(doc.aiDialogs);
    }
  } catch (error) {
    logger.warn('Unable to sync AI dialogs from workspace', error);
    dialogs.value = [createDefaultDialog(defaultTitle)];
  }
  isSyncingFromWorkspace = false;
};

const commitDialogsToWorkspace = () => {
  if (isSyncingFromWorkspace) return;
  const tabId = targetTabId.value;
  if (!tabId) return;
  workspace.updateDocumentAiDialogs(tabId, cloneDeep(dialogs.value));
};

// 初始化当前对话
const initCurrentDialog = () => {
  syncDialogsFromWorkspace();
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
  commitDialogsToWorkspace();
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
  commitDialogsToWorkspace();
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
  commitDialogsToWorkspace();
  renameDialogVisible.value = false;
};

const title = ref(defaultTitle);

const reset = () => {
  promptInput.value = '';
}

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
    messageCopy[messageCopy.length - 2].content ?? "AI Chat", messageCopy, cur_resp, ai_types.chat, 'ai-chat',enableKnowledgeBase);
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
  //logger.log(messages.value);
  promptInput.value = '';
  cur_resp.value = '';

  await generateNextResponse(
    () => {
      messages.value.push(createAssistantPlaceholder());
    },
    cur_resp,
    async () => {
      messages.value.pop();
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

const updateTitle = async () => {
  const prompt = updateTitlePrompt(JSON.stringify(messages.value[messages.value.length - 1].content));
  //备注：因为标题撰写需要一定时间，而用户可能在这个时间切换到其他对话，因此首先要保存索引
  const index = activeDialogIndex.value;//当前对话索引

  const generatedText = ref('');
  const enableKnowledgeBase=await getSetting("enableKnowledgeBase")
  const { handle, done } = createAiTask(title.value || defaultTitle, prompt, generatedText, ai_types.answer, 'ai-chat-generate-title',enableKnowledgeBase);
  try {
    await done;
  } catch (err) {
    logger.error(err);
  }
  let newTitle = generatedText.value;
  newTitle = newTitle.trim();
  //如果开头是##，则去掉
  while (newTitle.startsWith('#')) {
    newTitle = newTitle.substring(1);
    newTitle = newTitle.trim();
  }
  if (newTitle.length > 10)
    newTitle = newTitle.substring(0, 10);
  if (dialogs.value[index] && dialogs.value[index].title === title.value) {
    title.value = newTitle;
  }
  if (dialogs.value[index]) {
    dialogs.value[index].title = newTitle;
  }
  updateCurrentDialog(index);
};

onMounted(() => {
  initCurrentDialog();
  eventBus.on('ai-dialogs-loaded', initCurrentDialog);
});

onBeforeUnmount(() => {
  eventBus.off('ai-dialogs-loaded', initCurrentDialog);
});

watch(
  () => [targetTabId.value, activeDocument.value?.aiDialogs],
  () => {
    isSyncingFromWorkspace = true;
    syncDialogsFromWorkspace();
    if (dialogs.value.length > 0) {
      const nextIndex = Math.min(activeDialogIndex.value, dialogs.value.length - 1);
      loadDialog(Math.max(nextIndex, 0));
    }
    isSyncingFromWorkspace = false;
  },
  { deep: true }
);

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
  await generateNextResponse(
    () => {
      messages.value.push(createAssistantPlaceholder());
    },
    cur_resp,
    () => {
      messages.value.pop();
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

.input-area {

  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.05);
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