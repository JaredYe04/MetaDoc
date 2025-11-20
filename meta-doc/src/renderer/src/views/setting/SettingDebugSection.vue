<template>
  <div class="debug-section">
    <el-tabs v-model="activeTab" type="border-card">
      <!-- EventBus 事件测试 -->
      <el-tab-pane :label="$t('setting.debug.eventBus')" name="eventbus">
        <div class="test-panel">
          <el-form :model="eventBusForm" label-width="140px">
            <el-form-item :label="$t('setting.debug.eventName')">
              <el-input
                v-model="eventBusForm.eventName"
                :placeholder="$t('setting.debug.eventNamePlaceholder')"
              />
            </el-form-item>
            <el-form-item :label="$t('setting.debug.eventData')">
              <el-input
                v-model="eventBusForm.eventData"
                type="textarea"
                :rows="6"
                :placeholder="$t('setting.debug.eventDataPlaceholder')"
              />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="sendEventBusEvent">
                {{ $t('setting.debug.sendEvent') }}
              </el-button>
            </el-form-item>
          </el-form>
        </div>
      </el-tab-pane>

      <!-- 广播事件测试 -->
      <el-tab-pane :label="$t('setting.debug.broadcast')" name="broadcast">
        <div class="test-panel">
          <el-form :model="broadcastForm" label-width="140px">
            <el-form-item :label="$t('setting.debug.targetWindow')">
              <el-select v-model="broadcastForm.to" style="width: 100%">
                <el-option :label="$t('setting.debug.targetAll')" value="all" />
                <el-option
                  v-for="windowType in availableWindowTypes"
                  :key="windowType"
                  :label="getWindowTypeLabel(windowType)"
                  :value="windowType"
                />
              </el-select>
            </el-form-item>
            <el-form-item :label="$t('setting.debug.eventName')">
              <el-input
                v-model="broadcastForm.eventName"
                :placeholder="$t('setting.debug.eventNamePlaceholder')"
              />
            </el-form-item>
            <el-form-item :label="$t('setting.debug.eventData')">
              <el-input
                v-model="broadcastForm.eventData"
                type="textarea"
                :rows="6"
                :placeholder="$t('setting.debug.eventDataPlaceholder')"
              />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="sendBroadcastEvent">
                {{ $t('setting.debug.sendBroadcast') }}
              </el-button>
            </el-form-item>
          </el-form>
        </div>
      </el-tab-pane>

      <!-- 单元测试 -->
      <el-tab-pane :label="$t('setting.debug.unitTest')" name="unittest">
        <div class="test-panel">
          <el-form :model="testForm" label-width="140px">
            <el-form-item :label="$t('setting.debug.module')">
              <el-select
                v-model="testForm.module"
                :placeholder="$t('setting.debug.selectModule')"
                style="width: 100%"
                @change="handleModuleChange"
              >
                <el-option
                  v-for="module in modules"
                  :key="module"
                  :label="module"
                  :value="module"
                />
              </el-select>
            </el-form-item>
            <el-form-item :label="$t('setting.debug.testFunction')">
              <el-select
                v-model="testForm.testId"
                :placeholder="$t('setting.debug.selectTestFunction')"
                style="width: 100%"
                @change="handleTestChange"
              >
                <el-option
                  v-for="test in availableTests"
                  :key="test.id"
                  :label="`${test.name}${test.description ? ' - ' + test.description : ''}`"
                  :value="test.id"
                />
              </el-select>
            </el-form-item>

            <!-- 参数编辑区域 -->
            <template v-if="selectedTest && selectedTest.params && selectedTest.params.length > 0">
              <el-divider>{{ $t('setting.debug.parameters') }}</el-divider>
              <el-form-item
                v-for="param in selectedTest.params"
                :key="param.name"
                :label="`${param.name} (${param.type})`"
              >
                <template v-if="param.type === 'string' || param.type === 'number' || param.type === 'boolean'">
                  <el-input
                    v-if="param.type === 'string'"
                    v-model="testForm.params[param.name]"
                    :placeholder="param.description || param.name"
                  />
                  <el-input-number
                    v-else-if="param.type === 'number'"
                    v-model="testForm.params[param.name]"
                    style="width: 100%"
                  />
                  <el-switch
                    v-else-if="param.type === 'boolean'"
                    v-model="testForm.params[param.name]"
                  />
                </template>
                <el-input
                  v-else
                  v-model="testForm.params[param.name]"
                  type="textarea"
                  :rows="4"
                  :placeholder="$t('setting.debug.jsonPlaceholder')"
                />
              </el-form-item>
            </template>

            <el-form-item>
              <el-button type="primary" @click="executeTest" :loading="testExecuting">
                {{ $t('setting.debug.executeTest') }}
              </el-button>
              <el-button @click="clearTestHistory">
                {{ $t('setting.debug.clearHistory') }}
              </el-button>
            </el-form-item>
          </el-form>

          <!-- 测试结果 -->
          <el-divider>{{ $t('setting.debug.testResult') }}</el-divider>
          <div class="test-result">
            <el-scrollbar height="300px">
              <div
                v-for="(entry, index) in testHistory"
                :key="index"
                class="test-history-item"
                :class="{ 'test-error': entry.error }"
              >
                <div class="test-history-header">
                  <span class="test-name">{{ entry.name }}</span>
                  <span class="test-time">{{ formatTime(entry.timestamp) }}</span>
                </div>
                <div v-if="entry.params && entry.params.length > 0" class="test-params">
                  <strong>{{ $t('setting.debug.parameters') }}:</strong>
                  <pre>{{ JSON.stringify(entry.params, null, 2) }}</pre>
                </div>
                <div v-if="entry.error" class="test-error-message">
                  <strong>{{ $t('setting.debug.error') }}:</strong>
                  <pre>{{ entry.error }}</pre>
                </div>
                <div v-else-if="entry.result !== undefined" class="test-result-data">
                  <strong>{{ $t('setting.debug.result') }}:</strong>
                  <pre>{{ formatResult(entry.result) }}</pre>
                </div>
              </div>
              <div v-if="testHistory.length === 0" class="test-empty">
                {{ $t('setting.debug.noHistory') }}
              </div>
            </el-scrollbar>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import eventBus, { sendBroadcast } from '../../utils/event-bus';
import { testFramework, type TestFunction } from '../../utils/test-framework';
import { dayjs } from 'element-plus';
import localIpcRenderer from '../../utils/web-adapter/local-ipc-renderer';
import { webMainCalls } from '../../utils/web-adapter/web-main-calls';

const { t } = useI18n();

let ipcRenderer: typeof localIpcRenderer | null = null;
if (typeof window !== 'undefined') {
  if (window.electron?.ipcRenderer) {
    ipcRenderer = window.electron.ipcRenderer;
  } else {
    webMainCalls();
    ipcRenderer = localIpcRenderer;
  }
}

const activeTab = ref('eventbus');

// EventBus 表单
const eventBusForm = reactive({
  eventName: '',
  eventData: ''
});

// 广播表单
const broadcastForm = reactive({
  to: 'all',
  eventName: '',
  eventData: ''
});

// 测试表单
const testForm = reactive({
  module: '',
  testId: '',
  params: {} as Record<string, any>
});

const testExecuting = ref(false);
const modules = ref<string[]>([]);
const availableTests = ref<TestFunction[]>([]);
const selectedTest = ref<TestFunction | null>(null);
const availableWindowTypes = ref<string[]>([]);
const testHistory = ref<Array<{
  id: string;
  name: string;
  timestamp: number;
  params: any[];
  result?: any;
  error?: string;
}>>([]);

// 发送 EventBus 事件
const sendEventBusEvent = () => {
  if (!eventBusForm.eventName.trim()) {
    ElMessage.warning(t('setting.debug.eventNameRequired'));
    return;
  }

  try {
    let data: any = undefined;
    if (eventBusForm.eventData.trim()) {
      data = JSON.parse(eventBusForm.eventData);
    }
    eventBus.emit(eventBusForm.eventName, data);
    ElMessage.success(t('setting.debug.eventSent'));
  } catch (error) {
    ElMessage.error(t('setting.debug.invalidJson'));
  }
};

// 发送广播事件
const sendBroadcastEvent = () => {
  if (!broadcastForm.eventName.trim()) {
    ElMessage.warning(t('setting.debug.eventNameRequired'));
    return;
  }

  try {
    let data: any = {};
    if (broadcastForm.eventData.trim()) {
      data = JSON.parse(broadcastForm.eventData);
    }
    sendBroadcast(broadcastForm.to, broadcastForm.eventName, data);
    ElMessage.success(t('setting.debug.broadcastSent'));
  } catch (error) {
    ElMessage.error(t('setting.debug.invalidJson'));
  }
};

// 处理模块变化
const handleModuleChange = () => {
  testForm.testId = '';
  testForm.params = {};
  selectedTest.value = null;
  if (testForm.module) {
    availableTests.value = testFramework.getTestsByModule(testForm.module);
  } else {
    availableTests.value = [];
  }
};

// 处理测试函数变化
const handleTestChange = () => {
  testForm.params = {};
  if (testForm.testId) {
    selectedTest.value = testFramework.getAllTests().find(t => t.id === testForm.testId) || null;
    if (selectedTest.value?.params) {
      selectedTest.value.params.forEach(param => {
        if (param.defaultValue !== undefined) {
          testForm.params[param.name] = param.defaultValue;
        }
      });
    }
  } else {
    selectedTest.value = null;
  }
};

// 执行测试
const executeTest = async () => {
  if (!testForm.testId) {
    ElMessage.warning(t('setting.debug.selectTestFunctionFirst'));
    return;
  }

  testExecuting.value = true;
  try {
    const test = testFramework.getAllTests().find(t => t.id === testForm.testId);
    if (!test) {
      throw new Error(t('setting.debug.testNotFound'));
    }

    // 解析参数
    let params: any[] = [];
    if (test.params && test.params.length > 0) {
      params = testFramework.parseParams(test.params, testForm.params);
    }

    const result = await testFramework.execute(testForm.testId, params);
    ElMessage.success(t('setting.debug.testExecuted'));
    refreshTestHistory();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    ElMessage.error(`${t('setting.debug.testFailed')}: ${errorMessage}`);
    refreshTestHistory();
  } finally {
    testExecuting.value = false;
  }
};

// 刷新测试历史
const refreshTestHistory = () => {
  testHistory.value = testFramework.getHistory();
};

// 清空测试历史
const clearTestHistory = () => {
  testFramework.clearHistory();
  refreshTestHistory();
};

// 格式化时间
const formatTime = (timestamp: number) => {
  return dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss');
};

// 格式化结果
const formatResult = (result: any) => {
  if (result === undefined || result === null) {
    return t('setting.debug.undefined');
  }
  if (typeof result === 'object') {
    return JSON.stringify(result, null, 2);
  }
  return String(result);
};

// 获取窗口类型标签
const getWindowTypeLabel = (windowType: string): string => {
  const labelMap: Record<string, string> = {
    'home': t('setting.debug.targetHome'),
    'ai-chat': t('setting.debug.targetAiChat'),
    'setting': t('setting.debug.targetSetting'),
    'fomula-recognition': t('setting.debug.targetFormulaRecognition'),
    'ai-graph': t('setting.debug.targetAiGraph')
  };
  return labelMap[windowType] || windowType;
};

// 获取所有窗口类型
const fetchWindowTypes = async () => {
  if (!ipcRenderer) return;
  try {
    const windowTypes = await ipcRenderer.invoke('get-all-window-types') as string[];
    availableWindowTypes.value = windowTypes || ['home'];
  } catch (error) {
    console.error('获取窗口类型失败:', error);
    // 如果获取失败，使用默认值
    availableWindowTypes.value = ['home', 'ai-chat'];
  }
};

onMounted(async () => {
  modules.value = testFramework.getModules();
  refreshTestHistory();
  await fetchWindowTypes();
  
  // 定期刷新窗口类型列表（每5秒）
  const interval = setInterval(fetchWindowTypes, 5000);
  // 组件卸载时清除定时器
  onBeforeUnmount(() => {
    clearInterval(interval);
  });
});
</script>

<style scoped>
.debug-section {
  max-width: 900px;
}

.test-panel {
  padding: 20px 0;
}

.test-result {
  margin-top: 20px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 8px;
  padding: 16px;
  background-color: rgba(0, 0, 0, 0.02);
}

.test-history-item {
  margin-bottom: 16px;
  padding: 12px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 6px;
  background-color: #fff;
}

.test-history-item.test-error {
  border-color: #f56c6c;
  background-color: #fef0f0;
}

.test-history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-weight: 600;
}

.test-time {
  font-size: 12px;
  color: #909399;
  font-weight: normal;
}

.test-params,
.test-result-data,
.test-error-message {
  margin-top: 8px;
  font-size: 13px;
}

.test-params pre,
.test-result-data pre,
.test-error-message pre {
  margin: 4px 0 0 0;
  padding: 8px;
  background-color: rgba(0, 0, 0, 0.05);
  border-radius: 4px;
  overflow-x: auto;
  font-size: 12px;
  line-height: 1.5;
}

.test-error-message pre {
  background-color: #fef0f0;
  color: #f56c6c;
}

.test-empty {
  text-align: center;
  color: #909399;
  padding: 40px 0;
}
</style>

