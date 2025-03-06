<template>
  <el-scrollbar>
    <div class="main-container">
      <!-- 左侧菜单 -->
      <el-menu class="side-menu" :default-active="activeDialogIndex.toString()">
        <div class="menu-header">
          <el-button type="primary" @click="addNewDialog">新建对话</el-button>
          <el-button type="danger" @click="deleteCurrentDialog">删除当前</el-button>
        </div>
        <el-menu-item v-for="(dialog, index) in current_ai_dialogs" :key="index" :index="index.toString()"
          @click="loadDialog(index)">
          {{ dialog.title }}
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

        }">
          <el-input v-model="promptInput" placeholder="在此处输入消息。" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }"
            class="input-with-select" :disabled="responding" />
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
import { bindCode, default_resp, generateDialogId, quickGenerate } from "../assets/aichat_legacy/utils";
import { ChatSquare } from "@element-plus/icons-vue/global";
import "../assets/input-box.css"
import "../assets/title.css"
import { model } from "../assets/aichat_legacy/consts.js";
import { ElMessage } from "element-plus";
import { useRoute } from 'vue-router';
import { current_ai_dialogs, addDialog, updateDialog, deleteDialog } from '../utils/common-data.js';
import eventBus from '../utils/event-bus.js';
import { themeState } from "../utils/themes.js";

const route = useRoute();
const responding = ref(false);
const activeDialogIndex = ref(0);

const props = defineProps({
  id: String
})

const defaultMessages = [
  {
    "role": "system",
    "content": "你是一个出色的AI文档编辑助手，现在你需要根据一篇现有的文档进行修改、优化，或者是撰写新的文档。按照对话的上下文来做出合适的回应。请按照用户需求进行回答。(用markdown语言）"
  },
  {
    "role": "assistant",
    "content": default_resp
  }
]

const messages = ref([...defaultMessages]);
const cur_resp = ref('')
const promptInput = ref('');
const temp_message = ref({
  "role": "assistant",
  "content": cur_resp
});

// 初始化当前对话
const initCurrentDialog = () => {
  addNewDialog();
};

const addNewDialog = () => {
  const newDialog = {
    title: '与AI助手对话',
    messages: [...defaultMessages]
  };
  addDialog(newDialog);
  activeDialogIndex.value = current_ai_dialogs.value.length - 1;
  messages.value = newDialog.messages;
};

const updateCurrentDialog = () => {
  const dialog = {
    title: title.value,
    messages: messages.value
  };
  updateDialog(activeDialogIndex.value, dialog);
};

const loadDialog = (index) => {
  activeDialogIndex.value = index;
  messages.value = current_ai_dialogs.value[index].messages;
  title.value = current_ai_dialogs.value[index].title;
};

const deleteCurrentDialog = () => {
  deleteDialog(activeDialogIndex.value);
  if (current_ai_dialogs.value.length > 0) {
    loadDialog(0);
  } else {
    addNewDialog();
  }
};

const title = ref('与AI助手对话');

const reset = () => {
  promptInput.value = '';
}

async function generateNextResponse(beforeGeneration, callbackRef, afterGeneration) {
  responding.value = true;
  beforeGeneration();

  const apiUrl = "http://localhost:11434/api/chat";  // 替换为你的 API 地址
  const payload = {
    model: model,  // 模型类型
    messages: messages.value,
  };
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const reader = response.body.getReader();  // 获取可读流
    const decoder = new TextDecoder('utf-8');  // UTF-8 解码器
    let ndjson = '';  // 保存流式数据的变量

    while (true) {
      const { done, value } = await reader.read();  // 从流中读取数据
      if (done) {
        break;  // 数据读取完成
      }
      // 解码字节流
      ndjson += decoder.decode(value, { stream: true });
      // 逐行解析 NDJSON
      let lines = ndjson.split('\n');  // 按换行符分割
      ndjson = lines.pop();  // 最后一个可能是未完整的 JSON 行，保留供下次读取
      for (const line of lines) {
        if (line.trim()) {  // 过滤空行
          try {
            const parsed = JSON.parse(line);  // 解析 JSON 行
            //console.log(parsed);
            callbackRef.value += parsed.message.content;
            //console.log(parsed.response);  // 输出响应内容
            // 可以在这里更新前端显示的内容
          } catch (err) {
            console.error('JSON 解析错误:', err);
          }
        }
      }
    }
  } catch (error) {
    console.error('请求出错:', error);
  }
  afterGeneration();
  responding.value = false;
}

const onMsgSend = async () => {
  messages.value.push({
    "role": "user",
    "content": promptInput.value
  })
  promptInput.value = '';
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
      updateTitle();
      bindCode(false);
      updateCurrentDialog();
    }
  );
};

// 其余方法保持原有实现，只需将localStorage操作替换为updateCurrentDialog()

const updateTitle = async () => {
  const newTitle = await quickGenerate('快速根据对话内容想一个对话标题，请直接输出标题，不超过10个字，不要包含其他多余内容：' + JSON.stringify(messages.value));
  title.value = newTitle.substring(0, Math.min(15, newTitle.length));
  updateCurrentDialog();
};

onMounted(async () => {
  eventBus.emit('fetch-ai-dialogs');//获取AI对话，因为对话保存在主渲染进程，所以需要主渲染进程发送给渲染进程
  initCurrentDialog();
})

watch([messages], () => {
  bindCode(false);
  updateCurrentDialog();
});

watch([title], () => {
  updateCurrentDialog();
});
const onMsgDelete = async (index) => {
  index++;//有偏移量
  await messages.value.splice(index, 1);
  bindCode(false);
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
      updateTitle();
      bindCode(false);
      updateCurrentDialog();
    }
  );

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
  border-right: 1px solid #e6e6e6;
}

.menu-header {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
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
  padding: 20px;
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.05);
}
</style>