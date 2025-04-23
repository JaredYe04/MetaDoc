<template>
  <el-scrollbar>
    <el-dialog v-model="renameDialogVisible" title="重命名" width="500">
      <el-input v-model="editingTitle" style="width: 100%" placeholder="请输入新标题" />
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="renameDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="finishRename">
            确定
          </el-button>
        </div>
      </template>
    </el-dialog>
    <div class="main-container">
      <!-- 左侧菜单 -->
      <el-menu class="side-menu" :default-active="activeDialogIndex.toString()">
        <div class="menu-header">

          <el-tooltip content="新建对话">
            <el-button type="primary" :icon="AddIcon" circle @click="addNewDialog"></el-button>
          </el-tooltip>
          <el-tooltip content="删除当前对话">
            <el-button type="danger" :icon="Delete" circle @click="deleteCurrentDialog"></el-button>
          </el-tooltip>

        </div>
        <el-menu-item v-for="(dialog, index) in current_ai_dialogs" :key="index" :index="index.toString()"
          @click="loadDialog(index)">
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
            <el-input v-model="promptInput" placeholder="在此处输入消息。" type="textarea"
              :autosize="{ minRows: 2, maxRows: 4 }" class="input-with-select" :disabled="responding" />
          </el-scrollbar>


          <el-button id="sendMsg" @click="onMsgSend" type="primary" round size="large" text bg
            :disabled="responding || promptInput.length === 0">
            发送
          </el-button>
          <el-button id="reset" @click="reset" round type="info" size="large" :disabled="responding" text bg>
            重置
          </el-button>
        </div>

      </div>
    </div>
  </el-scrollbar>

</template>

<script setup>
import { defineProps, ref, onMounted, watch, reactive } from 'vue';
import MessageBubble from "../components/MessageBubble.vue";
//import { bindCode } from "../assets/aichat_legacy/utils";
import { ChatSquare, Delete, Edit } from "@element-plus/icons-vue/global";
import "../assets/input-box.css"
import "../assets/title.css"

import { ElMessage } from "element-plus";
import { useRoute } from 'vue-router';
import { current_ai_dialogs, addDialog, updateDialog, deleteDialog, defaultAiChatMessages } from '../utils/common-data.js';
import eventBus from '../utils/event-bus.js';
import { themeState } from "../utils/themes.js";
import { AddIcon } from 'tdesign-icons-vue-next';
import { answerQuestion, continueConversationStream } from '../utils/llm-api.js';
import '../assets/tool-group.css'
const route = useRoute();
const responding = ref(false);
const activeDialogIndex = ref(0);

const props = defineProps({
  id: String
})

const messages = ref([...defaultAiChatMessages]);
const cur_resp = ref('')
const promptInput = ref('');
const temp_message = ref({
  "role": "assistant",
  "content": cur_resp
});
const defaultTitle = '与AI助手对话';
// 初始化当前对话
const initCurrentDialog = () => {
  //console.log(current_ai_dialogs.value);
  if (current_ai_dialogs.value.length > 0) {
    loadDialog(0);
  } else {
    addNewDialog();
    loadDialog(0);
  }
};

const addNewDialog = () => {
  const newDialog = {
    title: '与AI助手对话',
    messages: [...defaultAiChatMessages]
  };
  addDialog(newDialog);
  activeDialogIndex.value = current_ai_dialogs.value.length - 1;
  messages.value = newDialog.messages;
  title.value = newDialog.title;
  updateCurrentDialog();
};

const updateCurrentDialog = (index=null) => {
  const dialog = {
    title: title.value,
    messages: messages.value
  };
  if(index==null){
    updateDialog(activeDialogIndex.value, dialog);
  }
  else{
    updateDialog(index, dialog);
  }
};

const loadDialog = (index) => {
  activeDialogIndex.value = index;
  messages.value = current_ai_dialogs.value[index].messages;
  title.value = current_ai_dialogs.value[index].title;
  //console.log(current_ai_dialogs.value[index])
};

const deleteCurrentDialog = () => {
  deleteDialog(activeDialogIndex.value);
  if (current_ai_dialogs.value.length > 0) {
    loadDialog(0);
  } else {
    addNewDialog();
  }
};
const renameDialog = (index) => {
  editingIndex.value = index;
  renameDialogVisible.value = true;
  editingTitle.value = current_ai_dialogs.value[index].title;
};
const renameDialogVisible = ref(false);
const editingTitle = ref('');
const editingIndex = ref(0);
const finishRename = () => {
  const dialog = {
    title: editingTitle.value,
    messages: messages.value
  };
  updateDialog(editingIndex.value, dialog);
  if (activeDialogIndex.value === editingIndex.value) {
    title.value = editingTitle.value;
  }
  renameDialogVisible.value = false;
};

const title = ref('与AI助手对话');

const reset = () => {
  promptInput.value = '';
}

async function generateNextResponse(beforeGeneration, callbackRef, afterGeneration) {
  responding.value = true;
  await beforeGeneration();
  console.log(messages.value)
  await continueConversationStream(messages.value, cur_resp)
  await afterGeneration();
  responding.value = false;
}

const onMsgSend = async () => {
  messages.value.push({
    "role": "user",
    "content": promptInput.value
  })
  console.log(messages.value);
  promptInput.value = '';
  cur_resp.value = '';

  await generateNextResponse(
    () => {
      messages.value.push(temp_message.value);
    },
    cur_resp,
    async () => {
      messages.value.pop();
      messages.value.push({
        "role": "assistant",
        "content": cur_resp.value
      });

      //bindCode(false);
      console.log(messages.value);
      updateCurrentDialog();
      updateTitle();
      
    }
  );
  

};

// 其余方法保持原有实现，只需将localStorage操作替换为updateCurrentDialog()

const updateTitle = async () => {
  const prompt = '快速根据对话内容想一个对话标题，请直接输出标题，不超过10个字，不要包含其他多余内容：' + JSON.stringify(messages.value[messages.value.length - 1].content);
  //备注：因为标题撰写需要一定时间，而用户可能在这个时间切换到其他对话，因此首先要保存索引
  const index=activeDialogIndex.value;//当前对话索引
  let newTitle = await answerQuestion(prompt)
  newTitle = newTitle.trim();
  //如果开头是##，则去掉
  while (newTitle.startsWith('#')) {
    newTitle = newTitle.substring(1);
    newTitle = newTitle.trim();
  }
  if(newTitle.length>10)
    newTitle = newTitle.substring(0, 10);
  if(current_ai_dialogs.value[index].title===title.value){
    title.value = newTitle;
  }
  current_ai_dialogs.value[index].title = newTitle;
  updateCurrentDialog(index);
};

onMounted(async () => {
  eventBus.emit('fetch-ai-dialogs');//获取AI对话，因为对话保存在主渲染进程，所以需要主渲染进程发送给渲染进程
  initCurrentDialog();
  eventBus.on('ai-dialogs-loaded', initCurrentDialog);
})

watch([messages], () => {
  //bindCode(false);
  updateCurrentDialog();
});

watch([title], () => {
  updateCurrentDialog();
});

const onMsgDelete = async (index) => {
  index++;//有偏移量
  await messages.value.splice(index, 1);
  //bindCode(false);
  ElMessage({
    type: 'success',
    message: '删除成功！',
  })
  updateCurrentDialog();
}
const regenerate = async (index) => {
  messages.value.splice(index + 1);
  cur_resp.value = '';
  await generateNextResponse(
    () => {
      messages.value.push(temp_message.value);
    },
    cur_resp,
    () => {
      messages.value.pop();
      messages.value.push({
        "role": "assistant",
        "content": cur_resp.value
      });

      //bindCode(false);
      updateCurrentDialog();
    }
  );
  //await updateTitle();

}
const onMsgEdit = async (data) => {
  let index = data.index;
  let newText = data.message;
  index++;//有偏移量


  const message = await messages.value[index]
  message.content = newText;
  //console.log(message)


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
  position: relative; /* 让子元素绝对定位时以该元素为参考 */
  width: 100%; /* 占满整个菜单项 */
  padding-right: 40px; /* 给按钮留出空间，防止文字覆盖按钮 */
  box-sizing: border-box; /* 防止padding撑开宽度 */
  overflow: hidden; /* 超出部分隐藏 */
  white-space: nowrap; /* 禁止文字换行 */
  text-overflow: ellipsis; /* 超出部分显示省略号 */
}

.dialog-title {
  display: inline-block;
  max-width: calc(95%); /* 避免文字覆盖按钮 */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rename-button{
  position: absolute; /* 绝对定位 */
  right: 0px; /* 始终固定在右侧 */
  top: 50%; 
  transform: translateY(-50%); /* 垂直居中 */

}
</style>