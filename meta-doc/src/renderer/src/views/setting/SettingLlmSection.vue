<template>
  <div class="llm-settings">
    <el-switch v-model="settings.llmEnabled" class="mb-2"
      style="--el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949"
      :active-text="t('setting.enabled')" :inactive-text="t('setting.disabled')"
      @change="handleLlmToggle" />

    <div v-if="settings.llmEnabled" class="llm-settings__content">
      <el-form label-width="160px" class="settings-form">
        <el-form-item :label="t('setting.llmType')">
          <el-select v-model="settings.selectedLlm" :placeholder="t('setting.chooseLlm')"
            @change="saveSetting('selectedLlm', settings.selectedLlm)">
            <el-tooltip :content="t('setting.metadocHint')" placement="left">
              <el-option :label="t('setting.metadoc')" value="metadoc" />
            </el-tooltip>
            <el-tooltip :content="t('setting.ollamaHint')" placement="left">
              <el-option :label="t('setting.ollama')" value="ollama" />
            </el-tooltip>
            <el-tooltip :content="t('setting.openaiHint')" placement="left">
              <el-option :label="t('setting.openai')" value="openai" />
            </el-tooltip>
          </el-select>
        </el-form-item>

        <template v-if="settings.selectedLlm === 'ollama'">
          <el-form-item :label="t('setting.apiBaseUrl')">
            <el-input v-model="settings.ollama.apiUrl" :placeholder="t('setting.ollamaApiUrl')"
              @change="updateLlmInfo" />
          </el-form-item>
          <el-form-item :label="t('setting.chooseModel')">
            <el-select v-model="settings.ollama.selectedModel" :placeholder="t('setting.chooseModel')"
              @click="fetchOllamaModels" @change="updateLlmInfo">
              <el-option v-for="model in ollamaModels" :key="model.model" :label="model.name" :value="model.model" />
            </el-select>
          </el-form-item>
        </template>

        <template v-else-if="settings.selectedLlm === 'openai'">
          <el-form-item :label="t('setting.apiBaseUrl')">
            <el-input v-model="settings.openai.apiUrl" :placeholder="t('setting.openaiApiUrl')"
              @change="updateLlmInfo" />
          </el-form-item>
          <el-form-item :label="t('setting.apiKey')">
            <el-input v-model="settings.openai.apiKey" type="password"
              :placeholder="t('setting.apiKeyPlaceholder')" @change="updateLlmInfo" />
          </el-form-item>
          <el-form-item :label="t('setting.chooseModel')">
            <el-select v-model="settings.openai.selectedModel" :placeholder="t('setting.chooseModel')"
              @click="fetchOpenAIModels" @change="updateLlmInfo">
              <el-option v-for="model in openaiModels" :key="model.id" :label="model.id" :value="model.id" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('setting.apiSuffix')">
            <el-input v-model="settings.openai.completionSuffix" :placeholder="t('setting.completionSuffix')"
              @change="updateLlmInfo" />
            <div style="height:40px;"></div>
            <el-input v-model="settings.openai.chatSuffix" :placeholder="t('setting.chatSuffix')"
              @change="updateLlmInfo" />
          </el-form-item>
        </template>

        <template v-else-if="settings.selectedLlm === 'metadoc'">
          <el-form-item :label="t('setting.chooseModel')">
            <el-select v-model="settings.metadoc.selectedModel" :placeholder="t('setting.chooseModel')"
              @click="fetchMetaDocModels" @change="updateLlmInfo">
              <el-option v-for="model in metadocModels" :key="model.label" :label="model.label" :value="model.label" />
            </el-select>
          </el-form-item>
        </template>

        <el-form-item :label="t('setting.removeThinkTag')">
          <el-switch v-model="settings.autoRemoveThinkTag" class="mb-2"
            style="--el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949"
            :active-text="t('setting.enabled')" :inactive-text="t('setting.disabled')"
            @change="saveSetting('autoRemoveThinkTag', settings.autoRemoveThinkTag)" />
        </el-form-item>

        <el-form-item :label="t('setting.autoCompletion')">
          <el-switch v-model="settings.autoCompletion" class="mb-2"
            style="--el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949"
            :active-text="t('setting.enabled')" :inactive-text="t('setting.disabled')"
            @change="saveSetting('autoCompletion', settings.autoCompletion)" />
        </el-form-item>

        <el-form-item v-if="settings.autoCompletion" :label="t('setting.autoCompletionMode')">
          <el-select v-model="settings.autoCompletionMode" :placeholder="t('setting.chooseAutoCompletionMode')"
            @change="saveSetting('autoCompletionMode', settings.autoCompletionMode)">
            <el-tooltip :content="t('setting.autoCompletionFullModeHint')" placement="left">
              <el-option :label="t('setting.autoCompletionFullMode')" value="full" />
            </el-tooltip>
            <el-tooltip :content="t('setting.autoCompletionStreamModeHint')" placement="left">
              <el-option :label="t('setting.autoCompletionStreamMode')" value="stream" />
            </el-tooltip>
          </el-select>
        </el-form-item>

        <el-form-item :label="t('setting.enableKnowledgeBase')">
          <el-tooltip :content="t('setting.knowledgeBaseTooltip')" placement="bottom">
            <el-switch v-model="settings.enableKnowledgeBase" class="mb-2"
              style="--el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949"
              :active-text="t('setting.enabled')" :inactive-text="t('setting.disabled')"
              @change="handleKnowledgeBaseToggle" />
          </el-tooltip>
        </el-form-item>

        <el-form-item v-if="settings.enableKnowledgeBase" :label="t('setting.knowledgeBaseScoreThreshold')">
          <el-tooltip :content="t('setting.knowledgeBaseScoreThresholdTooltip')" placement="top">
            <el-slider v-model="settings.knowledgeBaseScoreThreshold" show-input :min="0.01" :max="0.99"
              :step="0.01" @change="handleKnowledgeBaseThresholdChange"
              :marks="sliderMarks" style="margin-bottom: 10px;" />
          </el-tooltip>
        </el-form-item>

        <div class="aero-divider">
          <el-form-item>
            <el-button type="primary" @click="testLlmApi" class="aero-btn">{{ t('setting.testLlm') }}</el-button>
          </el-form-item>
          <el-form-item :label="t('setting.testResult')">
            <el-input v-model="testResult" type="textarea" readonly
              :placeholder="t('setting.resultPlaceholder')" :autosize="{ minRows: 5, maxRows: 7 }" />
          </el-form-item>
        </div>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import axios from 'axios';
import { useI18n } from 'vue-i18n';
import { settings, setSetting, getSetting } from '../../utils/settings.js';
import eventBus, { sendBroadcast } from '../../utils/event-bus.js';
import { getMetaDocLlmModels } from '../../utils/web-utils.ts';
import { ai_types, createAiTask } from '../../utils/ai_tasks.ts';
import { createRendererLogger } from '../../utils/logger.ts';

interface OllamaModel {
  name: string;
  model: string;
}

interface OpenAIModel {
  id: string;
}

interface MetaDocModel {
  label: string;
}

const { t } = useI18n();
const logger = createRendererLogger('SettingLlm');

const ollamaModels = ref<OllamaModel[]>([]);
const openaiModels = ref<OpenAIModel[]>([]);
const metadocModels = ref<MetaDocModel[]>([]);
const testResult = ref('');

const sliderMarks = computed(() => ({
  0.3: {
    style: {
      color: '#1989FA'
    },
    label: t('setting.lowPrecision')
  },
  0.5: {
    style: {
      color: '#1989FA'
    },
    label: t('setting.recommended')
  },
  0.8: {
    style: {
      color: '#1989FA'
    },
    label: t('setting.highPrecision')
  }
}));

const saveSetting = (key: string, value: unknown) => {
  setSetting(key, value);
};

const fetchLlmSettings = async () => {
  settings.metadoc.selectedModel = await getSetting('metadocSelectedModel');
  settings.ollama.apiUrl = await getSetting('ollamaApiUrl');
  settings.ollama.selectedModel = await getSetting('ollamaSelectedModel');
  settings.openai.apiUrl = await getSetting('openaiApiUrl');
  settings.openai.apiKey = await getSetting('openaiApiKey');
  settings.openai.selectedModel = await getSetting('openaiSelectedModel');
  settings.openai.completionSuffix = await getSetting('openaiCompletionSuffix');
  settings.openai.chatSuffix = await getSetting('openaiChatSuffix');
};

const updateLlmInfo = () => {
  setSetting('metadocSelectedModel', settings.metadoc.selectedModel);
  setSetting('ollamaApiUrl', settings.ollama.apiUrl);
  setSetting('ollamaSelectedModel', settings.ollama.selectedModel);
  setSetting('openaiApiUrl', settings.openai.apiUrl);
  setSetting('openaiApiKey', settings.openai.apiKey);
  setSetting('openaiSelectedModel', settings.openai.selectedModel);
  setSetting('openaiCompletionSuffix', settings.openai.completionSuffix);
  setSetting('openaiChatSuffix', settings.openai.chatSuffix);
  eventBus.emit('llm-api-updated');
};

const fetchMetaDocModels = async () => {
  try {
    const models = await getMetaDocLlmModels();
    logger.debug('MetaDoc 模型列表', models?.length ?? 0);
    metadocModels.value = models ?? [];
  } catch (error) {
    logger.error('获取 MetaDoc 模型失败', error);
  }
};

const fetchOllamaModels = async () => {
  const apiUrl = settings.ollama.apiUrl;
  if (!apiUrl) {
    return;
  }

  try {
    const response = await axios.get(`${apiUrl}/tags`);
    if (response.data && response.data.models) {
      ollamaModels.value = response.data.models;
    } else {
      ollamaModels.value = [];
      logger.warn('未能获取 Ollama 模型列表，响应数据为空');
    }
  } catch (error) {
    logger.error('无法获取 Ollama 模型列表', error);
  }
};

const fetchOpenAIModels = async () => {
  const apiUrl = settings.openai.apiUrl;
  if (!apiUrl) {
    return;
  }

  try {
    const response = await axios.get(`${apiUrl}/models`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${settings.openai.apiKey}`
      }
    });

    if (response.data?.data) {
      openaiModels.value = response.data.data;
    } else {
      openaiModels.value = [];
      logger.warn('未能获取 OpenAI 模型列表，响应数据为空');
    }
  } catch (error) {
    logger.error('无法获取 OpenAI 模型列表', error);
  }
};

const handleKnowledgeBaseToggle = () => {
  saveSetting('enableKnowledgeBase', settings.enableKnowledgeBase);
  sendBroadcast('home', 'knowledge-base-toggle', { enabled: settings.enableKnowledgeBase });
};

const handleKnowledgeBaseThresholdChange = () => {
  saveSetting('knowledgeBaseScoreThreshold', settings.knowledgeBaseScoreThreshold);
};

const handleLlmToggle = (enabled: boolean) => {
  if (!enabled) {
    settings.selectedLlm = '';
  }
  setSetting('llmEnabled', enabled);
};

const testLlmApi = async () => {
  try {
    const prompt = t('setting.testPrompt');
    const enableKnowledgeBase = await getSetting('enableKnowledgeBase');
    createAiTask('AI Test', prompt, testResult, ai_types.answer, 'setting-test', enableKnowledgeBase);
  } catch (error) {
    logger.error(t('setting.testFailed'), error);
  }
};

onMounted(async () => {
  await fetchLlmSettings();
  if (settings.selectedLlm === 'metadoc') {
    fetchMetaDocModels();
  }
});
</script>

<style scoped>
.llm-settings {
  max-width: 820px;
}

.llm-settings__content {
  margin-top: 16px;
}

.settings-form :deep(.el-form-item) {
  margin-bottom: 24px;
}
</style>

