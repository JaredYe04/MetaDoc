<template>
  <div class="settings-container"
    :style="{ backgroundColor: themeState.currentTheme.backgroundColor, color: themeState.currentTheme.textColor }">
    <el-container>
      <!-- 左侧菜单 -->
      <el-aside width="200px">
        <el-menu default-active="basic" @select="handleMenuSelect"
          :background-color="themeState.currentTheme.sidebarBackground2"
          :text-color="themeState.currentTheme.SideTextColor"
          :active-text-color="themeState.currentTheme.SideActiveTextColor" style="height: 100vh;">
          <el-menu-item index="basic">基本设置</el-menu-item>
          <el-menu-item index="llm">LLM设置</el-menu-item>
        </el-menu>
      </el-aside>

      <!-- 右侧设置内容 -->
      <el-main :style="{ textColor: themeState.currentTheme.textColor }">
        <el-form label-width="160px" class="settings-form">
          <template v-if="activeMenu === 'basic'">
            <el-form-item label="启动选项">
              <el-select v-model="settings.startupOption"
                @change="saveSetting('startupOption', settings.startupOption)">
                <el-option label="打开新文件" value="newFile"></el-option>
                <el-option label="打开上次编辑的文件" value="lastFile"></el-option>
              </el-select>
            </el-form-item>
            <el-form-item label="总是询问保存">
              <el-switch v-model="settings.alwaysAskSave" class="mb-2"
                style="--el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949" active-text="启用"
                inactive-text="关闭" @change="saveSetting('alwaysAskSave', settings.alwaysAskSave)" />

            </el-form-item>


            <el-form-item label="自动保存">
              <el-select v-model="settings.autoSave" @change="saveSetting('autoSave', settings.autoSave)">
                <el-option label="关闭" value="never"></el-option>
                <el-option label="1分钟" value="1"></el-option>
                <el-option label="5分钟" value="5"></el-option>
                <el-option label="10分钟" value="10"></el-option>
                <el-option label="30分钟" value="30"></el-option>
                <el-option label="1小时" value="60"></el-option>
              </el-select>
            </el-form-item>

            <el-form-item label="主题">

              <el-radio-group v-model="settings.theme"
                @change="saveSetting('theme', settings.theme); eventBus.emit('sync-theme'); eventBus.emit('theme-changed')">
                <el-radio label="sync">跟随系统</el-radio>
                <el-radio label="light">亮色</el-radio>
                <el-radio label="dark">暗色</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="语音测试">
              <div>
                <el-tooltip content="检测麦克风是否能正常录音。" placement="bottom">
                  <MicrophoneTest />
                </el-tooltip>

              </div>
            </el-form-item>

            <el-form-item label="导出图片选项">
              <el-select v-model="settings.exportImageMode"
                @change="saveSetting('exportImageMode', settings.exportImageMode)">

                <el-tooltip content="简便快捷，但只有在MetaDoc打开时才能正确预览文件" placement="left">
                  <el-option label="MetaDoc内置服务器" value="none"></el-option>
                </el-tooltip>
                <el-tooltip content="将文件存入md中，可直接拷贝到别处，但文件体积较大，加载较慢" placement="left">
                  <el-option label="Base64编码" value="base64"></el-option>
                </el-tooltip>
                <el-tooltip content="将图片链接到本地图片目录" placement="left">
                  <el-option label="本地链接" value="local"></el-option>
                </el-tooltip>
              </el-select>
            </el-form-item>

            <el-form-item label="统计文本时排除代码块">
              <el-tooltip content="代码的内容会影响词频统计的准确性，因此可选择是否排除。" placement="bottom">
                <el-switch v-model="settings.bypassCodeBlock" class="mb-2"
                  style="--el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949" active-text="启用"
                  inactive-text="关闭" @change="saveSetting('bypassCodeBlock', settings.bypassCodeBlock);" />
              </el-tooltip>
            </el-form-item>



          </template>

          <!-- <template v-if="activeMenu === 'llm'">
            <el-switch v-model="settings.llmEnabled" class="mb-2"
              style="--el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949" active-text="启用"
              inactive-text="关闭"
              @change="saveSetting('llmEnabled', settings.llmEnabled)"
              />

            <el-form-item label="大模型 API URL" v-if="settings.llmEnabled">
              <el-input v-model="settings.llmApiUrl" placeholder="输入模型的 API 地址"
                @change="updateLlmInfo" />
            </el-form-item>

          </template> -->

          <template v-if="activeMenu === 'llm'">
            <div>
              <!-- 启用/禁用 LLM -->
              <el-switch v-model="settings.llmEnabled" class="mb-2"
                style="--el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949" active-text="启用"
                inactive-text="关闭" @change="handleLlmToggle" />
              <!-- 配置界面 -->
              <div v-if="settings.llmEnabled">

                <!-- 模型选择 -->
                <el-form-item label="选择大模型类型">
                  <el-select v-model="settings.selectedLlm" placeholder="选择大模型"
                    @change="saveSetting('selectedLlm', settings.selectedLlm)">
                    <el-tooltip content="MetaDoc官方提供的AI大模型，支持多种模型" placement="left">
                      <el-option label="MetaDoc" value="metadoc"></el-option>
                    </el-tooltip>
                    <el-tooltip content="本地部署的大模型平台，支持多种模型" placement="left">
                      <el-option label="Ollama" value="ollama"></el-option>
                    </el-tooltip>
                    <el-tooltip content="任何兼容OpenAI API标准的外部大模型，均可兼容" placement="left">
                      <el-option label="OpenAI兼容 API" value="openai"></el-option>
                    </el-tooltip>

                  </el-select>
                </el-form-item>
                <!-- 根据选择的模型显示不同的配置项 -->
                <div v-if="settings.selectedLlm === 'ollama'">
                  <!-- Ollama 配置 -->
                  <el-form-item label="API BaseURL">
                    <el-input v-model="settings.ollama.apiUrl" placeholder="输入 Ollama 的 API 地址"
                      @change="updateLlmInfo" />
                  </el-form-item>
                  <el-form-item label="选择模型">
                    <el-select v-model="settings.ollama.selectedModel" placeholder="选择模型" @click="fetchOllamaModels"
                      @change="updateLlmInfo">
                      <el-option v-for="model in ollamaModels" :key="model" :label="model.name" :value="model.model">
                      </el-option>
                    </el-select>
                  </el-form-item>
                </div>

                <div v-else-if="settings.selectedLlm === 'openai'">
                  <!-- OpenAI 配置 -->
                  <el-form-item label="API BaseURL">
                    <el-input v-model="settings.openai.apiUrl" placeholder="输入兼容OpenAI规范的 API 地址"
                      @change="updateLlmInfo" />
                  </el-form-item>
                  <el-form-item label="API 秘钥">
                    <el-input v-model="settings.openai.apiKey" type="password" placeholder="输入兼容OpenAI规范的 API 秘钥"
                      @change="updateLlmInfo" />
                  </el-form-item>
                  <el-form-item label="选择模型">
                    <el-select v-model="settings.openai.selectedModel" placeholder="选择模型" @click="fetchOpenAIModels"
                      @change="updateLlmInfo">
                      <el-option v-for="model in openaiModels" :key="model" :label="model.id" :value="model.id">
                      </el-option>
                    </el-select>
                  </el-form-item>
                  <el-form-item label="API URL后缀">
                    <el-input v-model="settings.openai.completionSuffix" placeholder="问答补全功能(Completions)的URL后缀（可选）"
                      @change="updateLlmInfo" />
                    <div style="height:40px;"></div>
                    <el-input v-model="settings.openai.chatSuffix" placeholder="对话补全功能(Chat)的URL后缀（可选）"
                      @change="updateLlmInfo" />
                  </el-form-item>

                </div>
                <div v-else-if="settings.selectedLlm === 'metadoc'">
                  <el-form-item label="选择模型">
                    <el-select v-model="settings.metadoc.selectedModel" placeholder="选择模型" @click="fetchMetaDocModels"
                      @change="updateLlmInfo">
                      <el-option v-for="model in metadocModels" :key="model" :label="model.label" :value="model.label">
                      </el-option>
                    </el-select>
                  </el-form-item>

                </div>


                <el-form-item label="去除think标签">
                  <el-switch v-model="settings.autoRemoveThinkTag" class="mb-2"
                    style="--el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949" active-text="启用"
                    inactive-text="关闭" @change="saveSetting('autoRemoveThinkTag', settings.autoRemoveThinkTag)" />
                </el-form-item>
                <div class="aero-divider">
                  <el-form-item>
                    <el-button type="primary" @click="testLlmApi" class="aero-btn">测试大模型</el-button>
                  </el-form-item>
                  <el-form-item label="测试结果">
                    <el-input v-model="testResult" type="textarea" readonly placeholder="测试结果将显示在此处"
                      :autosize="{ minRows: 5, maxRows: 7 }" />
                  </el-form-item>


                </div>
                <!-- 测试按钮和结果显示 -->

              </div>
            </div>
          </template>
        </el-form>
      </el-main>
    </el-container>
  </div>
</template>


<script setup>
import { ref, reactive, onMounted } from "vue";
import eventBus from "../utils/event-bus.js";
import { getSetting, setSetting } from "../utils/settings.js";
import axios from "axios";
import { answerQuestionStream } from "../utils/llm-api.js";
import MicrophoneTest from "../components/MicrophoneTest.vue";
import "../assets/aero-btn.css";
import "../assets/aero-div.css";
import { themeState } from "../utils/themes.js";

//computed
import { computed } from "vue";
import { getMetaDocLlmModels } from "../utils/web-utils.ts";

const ipcRenderer = window.electron.ipcRenderer
// 定义响应式状态
const activeMenu = ref("basic"); // 当前菜单
const settings = reactive({
  startupOption: "newFile", // 启动选项
  autoSave: "never", // 自动保存
  theme: "light", // 主题
  llmEnabled: false, // 是否启用 LLM
  selectedLlm: "", // 选择的大模型类型
  exportImageMode: "none", // 导出图片选项
  autoRemoveThinkTag: true,//自动去除推理过程
  bypassCodeBlock: true, // 统计文字信息时排除代码块
  ollama: {
    apiUrl: "http://localhost:11434/api", // Ollama 默认 API URL
    selectedModel: "",
  },
  openai: {
    apiUrl: "https://api.openai.com/v1", // BaseURL
    apiKey: "",//API Key
    selectedModel: "",//模型名称
    completionSuffix: "", // 补全模式url后缀
    chatSuffix: "", // 聊天模式url后缀
  },
  metadoc:{
    selectedModel: "",//模型名称
  },
  alwaysAskSave: true, // 是否总是询问保存
});
const ollamaModels = ref([]); // Ollama 模型列表
const openaiModels = ref([]); // OpenAI 模型列表
const metadocModels = ref([]); // MetaDoc 模型列表
const testResult = ref(""); // 测试结果

// 方法定义
const fetchSettings = async () => {
  const keys = Object.keys(settings);
  for (const key of keys) {
    const value = await getSetting(key);
    if (value !== undefined) {
      settings[key] = value;
    }
  }

  if (settings.llmEnabled) {
    fetchLlmSettings();
  }
};

const fetchLlmSettings = async () => {
  settings.metadoc.selectedModel = await getSetting("metadocSelectedModel");
//
  settings.ollama.apiUrl = await getSetting("ollamaApiUrl");
  settings.ollama.selectedModel = await getSetting("ollamaSelectedModel");
//
  settings.openai.apiUrl = await getSetting("openaiApiUrl");
  settings.openai.apiKey = await getSetting("openaiApiKey");
  settings.openai.selectedModel = await getSetting("openaiSelectedModel");
  settings.openai.completionSuffix = await getSetting("openaiCompletionSuffix");
  settings.openai.chatSuffix = await getSetting("openaiChatSuffix");
};
const updateLlmInfo = () => {
  const { selectedLlm } = settings;
    setSetting("metadocSelectedModel", settings.metadoc.selectedModel);
//
    setSetting("ollamaApiUrl", settings.ollama.apiUrl);
    setSetting("ollamaSelectedModel", settings.ollama.selectedModel);
//
    setSetting("openaiApiUrl", settings.openai.apiUrl);
    setSetting("openaiApiKey", settings.openai.apiKey);
    setSetting("openaiSelectedModel", settings.openai.selectedModel);
    setSetting("openaiCompletionSuffix", settings.openai.completionSuffix);
    setSetting("openaiChatSuffix", settings.openai.chatSuffix);
  eventBus.emit("llm-api-updated");
};
const fetchMetaDocModels=async()=>{
  const models=await getMetaDocLlmModels();
  console.log("MetaDoc模型列表：", models);
  metadocModels.value=models; 
}
const fetchOllamaModels = async () => {
  const apiUrl = settings.ollama.apiUrl;
  if (!apiUrl) return;

  try {
    const response = await axios.get(`${apiUrl}/tags`);
    if (response.data && response.data.models) {
      ollamaModels.value = response.data.models;
    } else {
      ollamaModels.value = [];
      console.warn("未能获取 Ollama 模型列表，响应数据为空。");
    }
  } catch (error) {
    console.error("无法获取 Ollama 模型列表:", error);
  }
};
const fetchOpenAIModels = async () => {
  const apiUrl = settings.openai.apiUrl;
  if (!apiUrl) return;
  try {
    let config = {
      method: 'get',
      maxBodyLength: Infinity,
      url: `${apiUrl}/models`,
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${settings.openai.apiKey}`,
      }
    };

    const response = await axios(config)
    //console.log("OpenAI模型列表：", response);
    if (response.data) {
      openaiModels.value = response.data.data;
    } else {
      openaiModels.value = [];
      console.warn("未能获取模型列表，响应数据为空。");
    }
  } catch (error) {
    console.error("无法获取模型列表:", error);
  }
}


const saveSetting = (key, value) => {
  setSetting(key, value);
};

const handleMenuSelect = (index) => {
  activeMenu.value = index;
};

const handleLlmToggle = (enabled) => {
  if (!enabled) {
    settings.selectedLlm = "";
  }
  setSetting("llmEnabled", enabled);
};

const testLlmApi = async () => {
  try {
    const prompt = "你好！请介绍一下你自己。";
    await answerQuestionStream(prompt, testResult); // 流式回答
  } catch (error) {
    console.error("测试失败：", error);
    testResult.value = `测试失败：${error.message}`;
  }
};

// 挂载时加载设置
onMounted(() => {
  fetchSettings();

});


</script>

<style scoped>
.settings-container {
  height: 100%;
  display: flex;
}

.settings-form {
  width: 100%;
  padding-top: 10%;
}
</style>