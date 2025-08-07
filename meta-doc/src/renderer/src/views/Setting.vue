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
          <el-menu-item index="basic">{{ $t('setting.basic') }}</el-menu-item>
          <el-menu-item index="llm">{{ $t('setting.llm') }}</el-menu-item>
          <el-menu-item index="themes">{{ $t('setting.themes') }}</el-menu-item>
        </el-menu>
      </el-aside>

      <!-- 右侧设置内容 -->
      <el-main :style="{ textColor: themeState.currentTheme.textColor }">
        <el-form label-width="160px" class="settings-form">
          <template v-if="activeMenu === 'basic'">
            <el-form-item :label="$t('setting.startupOption')">
              <el-select v-model="settings.startupOption"
                @change="saveSetting('startupOption', settings.startupOption)">
                <el-option :label="$t('setting.openNewFile')" value="newFile"></el-option>
                <el-option :label="$t('setting.openLastFile')" value="lastFile"></el-option>
              </el-select>
            </el-form-item>
            <el-form-item :label="$t('setting.askBeforeSave')">
              <el-switch v-model="settings.alwaysAskSave" class="mb-2"
                style="--el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949"
                :active-text="$t('setting.enabled')" :inactive-text="$t('setting.disabled')"
                @change="saveSetting('alwaysAskSave', settings.alwaysAskSave)" />
            </el-form-item>
            <el-tooltip :content="$t('setting.particleEffectHint')" placement="bottom">
              <el-form-item :label="$t('setting.particleEffect')">
                <el-switch v-model="settings.particleEffect" class="mb-2"
                  style="--el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949"
                  :active-text="$t('setting.enabled')" :inactive-text="$t('setting.disabled')" @change="saveSetting('particleEffect', settings.particleEffect);
                  eventBus.emit('send-broadcast', {
                    to: 'home',
                    eventName: 'toggle-particle-effect',
                    data: {}
                  });
                  " />
              </el-form-item>
            </el-tooltip>


            <el-form-item :label="$t('setting.autoSave')">
              <el-select v-model="settings.autoSave" @change="saveSetting('autoSave', settings.autoSave)">
                <el-option :label="$t('setting.off')" value="never"></el-option>
                <el-option :label="$t('setting.minute1')" value="1"></el-option>
                <el-option :label="$t('setting.minute5')" value="5"></el-option>
                <el-option :label="$t('setting.minute10')" value="10"></el-option>
                <el-option :label="$t('setting.minute30')" value="30"></el-option>
                <el-option :label="$t('setting.minute60')" value="60"></el-option>
              </el-select>
            </el-form-item>


            <el-form-item :label="$t('setting.microphoneTest')">
              <div>
                <el-tooltip :content="$t('setting.microphoneHint')" placement="bottom">
                  <MicrophoneTest />
                </el-tooltip>
              </div>
            </el-form-item>

            <el-form-item :label="$t('setting.excludeCodeBlocks')">
              <el-tooltip :content="$t('setting.excludeCodeHint')" placement="bottom">
                <el-switch v-model="settings.bypassCodeBlock" class="mb-2"
                  style="--el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949"
                  :active-text="$t('setting.enabled')" :inactive-text="$t('setting.disabled')"
                  @change="saveSetting('bypassCodeBlock', settings.bypassCodeBlock);" />
              </el-tooltip>
            </el-form-item>

            <el-form-item :label="$t('setting.autoDownloadImage')">
              <el-tooltip :content="$t('setting.autoDownloadHint')" placement="bottom">
                <el-switch v-model="settings.autoSaveExternalImage" class="mb-2"
                  style="--el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949"
                  :active-text="$t('setting.enabled')" :inactive-text="$t('setting.disabled')"
                  @change="saveSetting('autoSaveExternalImage', settings.autoSaveExternalImage);" />
              </el-tooltip>
            </el-form-item>
          </template>

          <template v-if="activeMenu === 'llm'">
            <div>
              <!-- 启用/禁用 LLM -->
              <el-switch v-model="settings.llmEnabled" class="mb-2"
                style="--el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949"
                :active-text="$t('setting.enabled')" :inactive-text="$t('setting.disabled')"
                @change="handleLlmToggle" />

              <!-- 配置界面 -->
              <div v-if="settings.llmEnabled">
                <el-form-item :label="$t('setting.llmType')">
                  <el-select v-model="settings.selectedLlm" :placeholder="$t('setting.chooseLlm')"
                    @change="saveSetting('selectedLlm', settings.selectedLlm)">
                    <el-tooltip :content="$t('setting.metadocHint')" placement="left">
                      <el-option :label="$t('setting.metadoc')" value="metadoc"></el-option>
                    </el-tooltip>
                    <el-tooltip :content="$t('setting.ollamaHint')" placement="left">
                      <el-option :label="$t('setting.ollama')" value="ollama"></el-option>
                    </el-tooltip>
                    <el-tooltip :content="$t('setting.openaiHint')" placement="left">
                      <el-option :label="$t('setting.openai')" value="openai"></el-option>
                    </el-tooltip>
                  </el-select>
                </el-form-item>

                <!-- Ollama 配置 -->
                <div v-if="settings.selectedLlm === 'ollama'">
                  <el-form-item :label="$t('setting.apiBaseUrl')">
                    <el-input v-model="settings.ollama.apiUrl" :placeholder="$t('setting.ollamaApiUrl')"
                      @change="updateLlmInfo" />
                  </el-form-item>
                  <el-form-item :label="$t('setting.chooseModel')">
                    <el-select v-model="settings.ollama.selectedModel" :placeholder="$t('setting.chooseModel')"
                      @click="fetchOllamaModels" @change="updateLlmInfo">
                      <el-option v-for="model in ollamaModels" :key="model" :label="model.name" :value="model.model" />
                    </el-select>
                  </el-form-item>
                </div>

                <!-- OpenAI 配置 -->
                <div v-else-if="settings.selectedLlm === 'openai'">
                  <el-form-item :label="$t('setting.apiBaseUrl')">
                    <el-input v-model="settings.openai.apiUrl" :placeholder="$t('setting.openaiApiUrl')"
                      @change="updateLlmInfo" />
                  </el-form-item>
                  <el-form-item :label="$t('setting.apiKey')">
                    <el-input v-model="settings.openai.apiKey" type="password"
                      :placeholder="$t('setting.apiKeyPlaceholder')" @change="updateLlmInfo" />
                  </el-form-item>
                  <el-form-item :label="$t('setting.chooseModel')">
                    <el-select v-model="settings.openai.selectedModel" :placeholder="$t('setting.chooseModel')"
                      @click="fetchOpenAIModels" @change="updateLlmInfo">
                      <el-option v-for="model in openaiModels" :key="model" :label="model.id" :value="model.id" />
                    </el-select>
                  </el-form-item>
                  <el-form-item :label="$t('setting.apiSuffix')">
                    <el-input v-model="settings.openai.completionSuffix" :placeholder="$t('setting.completionSuffix')"
                      @change="updateLlmInfo" />
                    <div style="height:40px;"></div>
                    <el-input v-model="settings.openai.chatSuffix" :placeholder="$t('setting.chatSuffix')"
                      @change="updateLlmInfo" />
                  </el-form-item>
                </div>

                <!-- MetaDoc 配置 -->
                <div v-else-if="settings.selectedLlm === 'metadoc'">
                  <el-form-item :label="$t('setting.chooseModel')">
                    <el-select v-model="settings.metadoc.selectedModel" :placeholder="$t('setting.chooseModel')"
                      @click="fetchMetaDocModels" @change="updateLlmInfo">
                      <el-option v-for="model in metadocModels" :key="model" :label="model.label"
                        :value="model.label" />
                    </el-select>
                  </el-form-item>
                </div>

                <el-form-item :label="$t('setting.removeThinkTag')">
                  <el-switch v-model="settings.autoRemoveThinkTag" class="mb-2"
                    style="--el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949"
                    :active-text="$t('setting.enabled')" :inactive-text="$t('setting.disabled')"
                    @change="saveSetting('autoRemoveThinkTag', settings.autoRemoveThinkTag)" />
                </el-form-item>

                <div class="aero-divider">
                  <el-form-item>
                    <el-button type="primary" @click="testLlmApi" class="aero-btn">{{ $t('setting.testLlm')
                    }}</el-button>
                  </el-form-item>
                  <el-form-item :label="$t('setting.testResult')">
                    <el-input v-model="testResult" type="textarea" readonly
                      :placeholder="$t('setting.resultPlaceholder')" :autosize="{ minRows: 5, maxRows: 7 }" />
                  </el-form-item>
                </div>
              </div>
            </div>
          </template>
          <template v-if="activeMenu === 'themes'">
            <el-form-item :label="$t('setting.globalTheme')">
              <el-radio-group v-model="settings.globalTheme"
                @change="saveSetting('globalTheme', settings.globalTheme); eventBus.emit('sync-theme'); eventBus.emit('theme-changed')">
                <el-radio label="sync">{{ $t('setting.themeSync') }}</el-radio>
                <el-radio label="light">{{ $t('setting.themeLight') }}</el-radio>
                <el-radio label="dark">{{ $t('setting.themeDark') }}</el-radio>
                <el-radio label="custom">{{ $t('setting.themeCustom') }}</el-radio>
                <el-color-picker v-if="settings.globalTheme === 'custom'" v-model="settings.customThemeColor"
                  :predefine="predefineColors" @change="
                    changeCustomTheme(settings.customThemeColor);
                  " @active-change="
                    settings.customThemeColor = $event;
                  changeCustomTheme(settings.customThemeColor);
                  " />
              </el-radio-group>
            </el-form-item>
            <!-- 文档内容主题设置 -->
            <el-form-item :label="$t('setting.contentTheme')">
              <el-select v-model="settings.contentTheme" placeholder="Select Content Theme" @change="saveSetting('contentTheme', settings.contentTheme)
              eventBus.emit('send-broadcast', { to: 'all', eventName: 'sync-vditor-theme', data: {} });
              ">
              <el-option key="auto" :label="t('setting.auto')" :value="'auto'" />
              <el-option v-for="item in contentThemes" :key="item.value" :label="t(item.label)" :value="item.value" />
              </el-select>
            </el-form-item>

            <!-- 代码主题设置 -->
            <el-form-item :label="$t('setting.codeTheme')">
              <el-select v-model="settings.codeTheme" filterable placeholder="Select Code Theme" @change="saveSetting('codeTheme', settings.codeTheme)
              eventBus.emit('send-broadcast', { to: 'all', eventName: 'sync-vditor-theme', data: {} });
              ">
              <el-option key="auto" :label="t('setting.auto')" :value="'auto'" />
                <el-option v-for="item in codeThemes" :key="item" :label="item" :value="item" />
              </el-select>
            </el-form-item>
            <el-form-item :label="$t('setting.lineNumber')">
              <el-switch v-model="settings.lineNumber" class="mb-2"
                style="--el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949"
                :active-text="$t('setting.enabled')" :inactive-text="$t('setting.disabled')"
                @change="saveSetting('lineNumber', settings.lineNumber);"/>
            </el-form-item>
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
import MicrophoneTest from "../components/MicrophoneTest.vue";
import "../assets/aero-btn.css";
import "../assets/aero-div.css";
import { codeThemes, contentThemes, predefineColors, themeState } from "../utils/themes.js";
import { settings } from "../utils/settings.js";
//computed
import { computed } from "vue";
import { getMetaDocLlmModels } from "../utils/web-utils.ts";
import localIpcRenderer from "../utils/web-adapter/local-ipc-renderer.ts";
import { webMainCalls } from "../utils/web-adapter/web-main-calls.js";
import { useI18n } from 'vue-i18n'
import { ai_types, createAiTask } from "../utils/ai_tasks.js";
const { t } = useI18n()
let ipcRenderer = null
if (window && window.electron) {
  ipcRenderer = window.electron.ipcRenderer
} else {
  webMainCalls();
  ipcRenderer = localIpcRenderer
  //todo 说明当前环境不是electron环境，需要另外适配
}


// 定义响应式状态
const activeMenu = ref("basic"); // 当前菜单

const ollamaModels = ref([]); // Ollama 模型列表
const openaiModels = ref([]); // OpenAI 模型列表
const metadocModels = ref([]); // MetaDoc 模型列表
const testResult = ref(""); // 测试结果

// 方法定义
const fetchSettings = async () => {
  const keys = Object.keys(settings);
  // console.log(settings)
  // console.log("正在加载设置：", keys);
  for (const key of keys) {
    //如果settings的某个key含有子属性，则跳过
    if (settings[key] && typeof settings[key] === 'object' && !Array.isArray(settings[key])) {
      continue;
    }
    const value = await getSetting(key);
    if (value !== undefined) {
      settings[key] = value;
    }
  }

  if (settings.llmEnabled) {
    fetchLlmSettings();
  }
};
const changeCustomTheme = (color) => {
  saveSetting('customThemeColor', color);
  eventBus.emit('sync-theme');
  eventBus.emit('theme-changed')
}

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
const fetchMetaDocModels = async () => {
  const models = await getMetaDocLlmModels();
  console.log("MetaDoc模型列表：", models);
  metadocModels.value = models;
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
    const prompt = t('setting.testPrompt');
    createAiTask('AI Test', prompt, testResult, ai_types.answer, 'setting-test');
  } catch (error) {
    console.error(t('setting.testFailed'), error);

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