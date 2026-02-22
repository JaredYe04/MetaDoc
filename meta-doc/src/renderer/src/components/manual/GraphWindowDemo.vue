<template>
  <div class="graph-window-demo" :style="containerStyle">
    <div class="main-container">
      <!-- 左侧会话列表 -->
      <div class="session-list-panel" :style="sessionListStyle">
        <div class="session-list-header">
          <span class="session-list-title">{{ t('graph.sessionsTitle', '绘图会话') }}</span>
          <Button variant="ghost" size="sm" class="new-session-btn">
            <Plus class="w-4 h-4" />
          </Button>
        </div>
        <div class="session-list">
          <div
            v-for="(session, index) in demoSessions"
            :key="index"
            class="session-item"
            :class="{ active: index === 0 }"
          >
            <span class="session-title">{{ session.title }}</span>
            <span class="session-time">{{ formatTime(session.updatedAt) }}</span>
          </div>
        </div>
      </div>

      <!-- 右侧内容区域 -->
      <div class="content-area" :style="panelStyle">
        <div class="dialog-container">
          <!-- 消息列表 -->
          <div class="messages-area">
            <div
              v-for="(msg, index) in demoMessages"
              :key="index"
              class="message-bubble"
              :class="msg.role"
            >
              <!-- 用户消息 -->
              <template v-if="msg.role === 'user'">
                <div class="message-content user-content">
                  {{ msg.content }}
                </div>
              </template>

              <!-- 助手消息 -->
              <template v-else>
                <div class="message-content assistant-content">
                  <div class="chart-preview" :style="chartPreviewStyle">
                    <div class="chart-icon">
                      <component :is="msg.chartType" class="w-12 h-12" />
                    </div>
                    <div class="chart-info">
                      <div class="chart-type">{{ msg.chartName }}</div>
                      <div class="chart-desc">{{ msg.chartDesc }}</div>
                    </div>
                  </div>
                  <div class="chart-actions">
                    <Button variant="outline" size="sm" disabled>
                      <Eye class="w-4 h-4 mr-1" />
                      {{ t('graph.preview', '预览') }}
                    </Button>
                    <Button variant="outline" size="sm" disabled>
                      <Download class="w-4 h-4 mr-1" />
                      {{ t('graph.export', '导出') }}
                    </Button>
                    <Button variant="outline" size="sm" disabled>
                      <Copy class="w-4 h-4 mr-1" />
                      {{ t('graph.copyCode', '复制代码') }}
                    </Button>
                  </div>
                  <!-- 代码预览 -->
                  <div class="code-preview" :style="codePreviewStyle">
                    <pre><code>{{ msg.code }}</code></pre>
                  </div>
                </div>
              </template>
            </div>
          </div>

          <!-- 输入区域 -->
          <div class="composer-wrapper">
            <div class="input-area" :style="inputStyle">
              <textarea
                class="chat-input"
                :placeholder="
                  t('graph.inputPlaceholder', '输入绘图需求，AI会自动选择合适的图表引擎...')
                "
                rows="3"
                disabled
              ></textarea>
              <div class="input-actions">
                <div class="hint-text">
                  <Sparkles class="w-4 h-4" />
                  <span>{{ t('graph.aiPowered', 'AI 自动生成图表') }}</span>
                </div>
                <Button size="sm" disabled>
                  <Send class="w-4 h-4 mr-1" />
                  {{ t('common.send', '发送') }}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '../components/ui/button'
import {
  Plus,
  Send,
  Eye,
  Download,
  Copy,
  Sparkles,
  GitGraph,
  BarChart3,
  Network
} from 'lucide-vue-next'
import { themeState } from '../utils/themes'

const { t } = useI18n()

// Demo 数据
const demoSessions = [
  {
    title: '流程图设计',
    updatedAt: Date.now() - 1000 * 60 * 15
  },
  {
    title: '系统架构图',
    updatedAt: Date.now() - 1000 * 60 * 60 * 3
  },
  {
    title: '数据可视化',
    updatedAt: Date.now() - 1000 * 60 * 60 * 24
  },
  {
    title: '类图设计',
    updatedAt: Date.now() - 1000 * 60 * 60 * 48
  }
]

const demoMessages = [
  {
    role: 'user',
    content: '帮我画一个用户登录流程的流程图'
  },
  {
    role: 'assistant',
    chartType: GitGraph,
    chartName: 'Mermaid 流程图',
    chartDesc: '用户登录流程',
    code: `graph TD
    A[开始] --> B{用户已登录?}
    B -->|是| C[进入主页]
    B -->|否| D[显示登录页]
    D --> E[输入用户名密码]
    E --> F{验证成功?}
    F -->|是| G[创建会话]
    G --> C
    F -->|否| H[显示错误]
    H --> E
    C --> I[结束]`
  },
  {
    role: 'user',
    content: '画一个销售数据的柱状图，显示第一季度各月的销售额'
  },
  {
    role: 'assistant',
    chartType: BarChart3,
    chartName: 'ECharts 柱状图',
    chartDesc: 'Q1销售数据',
    code: `{
  "xAxis": {
    "type": "category",
    "data": ["一月", "二月", "三月"]
  },
  "yAxis": {
    "type": "value"
  },
  "series": [{
    "data": [120, 200, 150],
    "type": "bar"
  }]
}`
  }
]

// 样式计算
const containerStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

const panelStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd,
  color: themeState.currentTheme.textColor
}))

const sessionListStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  borderRight: `1px solid ${themeState.currentTheme.borderColor || '#e0e0e0'}`
}))

const inputStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  borderColor: themeState.currentTheme.borderColor || '#e0e0e0'
}))

const chartPreviewStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  borderColor: themeState.currentTheme.borderColor || '#e0e0e0'
}))

const codePreviewStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background
}))

// 格式化时间
const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  if (diff < 1000 * 60) {
    return t('time.justNow', '刚刚')
  } else if (diff < 1000 * 60 * 60) {
    return t('time.minutesAgo', { n: Math.floor(diff / (1000 * 60)) })
  } else if (diff < 1000 * 60 * 60 * 24) {
    return t('time.hoursAgo', { n: Math.floor(diff / (1000 * 60 * 60)) })
  } else {
    return date.toLocaleDateString()
  }
}
</script>

<style scoped>
.graph-window-demo {
  width: 100%;
  height: 500px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid var(--el-border-color-light);
}

.main-container {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* 会话列表面板 */
.session-list-panel {
  width: 200px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.session-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-light);
}

.session-list-title {
  font-size: 14px;
  font-weight: 600;
}

.new-session-btn {
  padding: 4px 8px;
}

.session-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.session-item {
  display: flex;
  flex-direction: column;
  padding: 10px 12px;
  margin-bottom: 4px;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.session-item:hover {
  background-color: var(--el-color-primary-light-9);
}

.session-item.active {
  background-color: var(--el-color-primary-light-8);
}

.session-title {
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-time {
  font-size: 11px;
  opacity: 0.6;
}

/* 内容区域 */
.content-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

/* 对话容器 */
.dialog-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
  padding: 16px;
  background-color: rgba(170, 221, 255, 0.05);
}

/* 消息区域 */
.messages-area {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 160px;
}

.message-bubble {
  margin-bottom: 20px;
}

.message-bubble.user {
  display: flex;
  justify-content: flex-end;
}

/* 用户消息 */
.user-content {
  max-width: 80%;
  padding: 10px 16px;
  background-color: var(--el-color-primary);
  color: white;
  border-radius: 16px 16px 4px 16px;
  font-size: 14px;
  line-height: 1.5;
}

/* 助手消息 */
.assistant-content {
  max-width: 95%;
}

/* 图表预览 */
.chart-preview {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 12px;
  margin-bottom: 12px;
}

.chart-icon {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--el-color-primary-light-9);
  border-radius: 12px;
  color: var(--el-color-primary);
}

.chart-info {
  flex: 1;
}

.chart-type {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 4px;
}

.chart-desc {
  font-size: 12px;
  opacity: 0.7;
}

/* 图表操作 */
.chart-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

/* 代码预览 */
.code-preview {
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  overflow: hidden;
}

.code-preview pre {
  margin: 0;
  padding: 12px 16px;
  overflow-x: auto;
}

.code-preview code {
  font-family: 'JetBrains Mono', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.6;
  color: inherit;
}

/* 输入区域 */
.composer-wrapper {
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: 16px;
}

.input-area {
  border: 1px solid var(--el-border-color);
  border-radius: 12px;
  padding: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.chat-input {
  width: 100%;
  border: none;
  outline: none;
  resize: none;
  font-size: 14px;
  line-height: 1.5;
  background: transparent;
  color: inherit;
  font-family: inherit;
}

.input-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--el-border-color-light);
}

.hint-text {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  opacity: 0.7;
  color: var(--el-color-primary);
}
</style>
