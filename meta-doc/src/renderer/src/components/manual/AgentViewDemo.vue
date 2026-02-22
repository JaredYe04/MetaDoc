<template>
  <div class="agent-view-demo" :style="containerStyle">
    <!-- 左侧工具栏 -->
    <div class="sidebar" :style="sidebarStyle">
      <div class="sidebar-header">
        <span class="sidebar-title">{{ t('agent.title', 'AI Agent') }}</span>
      </div>
      <div class="tool-list">
        <div
          v-for="(tool, index) in demoTools"
          :key="tool.id"
          class="tool-item"
          :class="{ active: activeTool === index }"
        >
          <component :is="tool.icon" class="w-5 h-5 tool-icon" />
          <span class="tool-name">{{ tool.name }}</span>
        </div>
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="main-content" :style="mainContentStyle">
      <!-- Agent 头部 -->
      <div class="agent-header">
        <div class="agent-info">
          <div class="agent-avatar">
            <Bot class="w-6 h-6" />
          </div>
          <div class="agent-details">
            <div class="agent-name">{{ t('agent.defaultName', '智能助手') }}</div>
            <div class="agent-status">
              <span class="status-dot active"></span>
              <span>{{ t('agent.status.ready', '就绪') }}</span>
            </div>
          </div>
        </div>
        <div class="agent-actions">
          <Button variant="outline" size="sm" disabled>
            <Settings class="w-4 h-4 mr-1" />
            {{ t('agent.config', '配置') }}
          </Button>
        </div>
      </div>

      <!-- 对话区域 -->
      <div class="chat-area" :style="chatAreaStyle">
        <!-- 欢迎消息 -->
        <div class="welcome-message">
          <div class="welcome-icon">
            <Sparkles class="w-8 h-8" />
          </div>
          <h3>{{ t('agent.welcome.title', '我是您的 AI 助手') }}</h3>
          <p>
            {{
              t(
                'agent.welcome.desc',
                '我可以帮您完成各种任务，包括文档编辑、代码编写、数据分析等。'
              )
            }}
          </p>
          <div class="suggestion-chips">
            <Button
              v-for="(suggestion, index) in demoSuggestions"
              :key="index"
              variant="outline"
              size="sm"
              disabled
              class="suggestion-chip"
            >
              {{ suggestion }}
            </Button>
          </div>
        </div>

        <!-- 消息列表 -->
        <div class="messages-list">
          <div
            v-for="(msg, index) in demoMessages"
            :key="index"
            class="message-item"
            :class="msg.role"
          >
            <div class="message-avatar">
              <User v-if="msg.role === 'user'" class="w-5 h-5" />
              <Bot v-else class="w-5 h-5" />
            </div>
            <div class="message-content" :style="messageContentStyle">
              <div class="message-text" v-html="renderMarkdown(msg.content)"></div>
              <div v-if="msg.toolCalls" class="tool-calls">
                <div
                  v-for="(tool, toolIndex) in msg.toolCalls"
                  :key="toolIndex"
                  class="tool-call-item"
                  :style="toolCallItemStyle"
                >
                  <Wrench class="w-4 h-4 tool-call-icon" />
                  <span class="tool-call-name">{{ tool.name }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 输入区域 -->
      <div class="input-area" :style="inputAreaStyle">
        <div class="input-container">
          <textarea
            class="chat-input"
            :placeholder="t('agent.inputPlaceholder', '输入您的问题或任务...')"
            rows="2"
            disabled
          ></textarea>
          <div class="input-actions">
            <Button variant="ghost" size="sm" disabled>
              <Paperclip class="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" disabled>
              <Mic class="w-4 h-4" />
            </Button>
            <Button size="sm" disabled>
              <Send class="w-4 h-4 mr-1" />
              {{ t('common.send', '发送') }}
            </Button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@renderer/components/ui/button'
import {
  Bot,
  User,
  Settings,
  Sparkles,
  Wrench,
  Paperclip,
  Mic,
  Send,
  FileText,
  Search,
  Edit3,
  Terminal,
  BarChart3
} from 'lucide-vue-next'
import { themeState } from '@renderer/utils/themes'
import { marked } from 'marked'

const { t } = useI18n()

const activeTool = 0

const demoTools = [
  { id: 'chat', name: t('agent.tools.chat', '对话'), icon: Bot },
  { id: 'edit', name: t('agent.tools.edit', '编辑'), icon: Edit3 },
  { id: 'search', name: t('agent.tools.search', '搜索'), icon: Search },
  { id: 'terminal', name: t('agent.tools.terminal', '终端'), icon: Terminal },
  { id: 'analysis', name: t('agent.tools.analysis', '分析'), icon: BarChart3 },
  { id: 'document', name: t('agent.tools.document', '文档'), icon: FileText }
]

const demoSuggestions = [
  t('agent.suggestions.editDoc', '帮我编辑这段文字'),
  t('agent.suggestions.writeCode', '写一段 Python 代码'),
  t('agent.suggestions.analyzeData', '分析这个表格数据')
]

const demoMessages = [
  {
    role: 'user',
    content: '请帮我优化这个文档的标题层级结构'
  },
  {
    role: 'assistant',
    content: '我来帮您分析和优化文档的标题层级结构。',
    toolCalls: [
      { name: t('agent.tools.analyzeOutline', '分析大纲结构') },
      { name: t('agent.tools.optimizeTitles', '优化标题层级') }
    ]
  },
  {
    role: 'assistant',
    content:
      '分析完成！我发现以下问题：\n\n1. **第一章** 下的二级标题层级过深，建议将 1.1.1.1 提升到 1.2\n2. **第三章** 缺少必要的二级标题\n3. 部分标题编号不连续\n\n已为您自动优化，您可以查看修改后的结构。'
  }
]

// 样式计算
const containerStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

const sidebarStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd || themeState.currentTheme.background,
  borderRight: `1px solid ${themeState.currentTheme.borderColor || '#e0e0e0'}`
}))

const mainContentStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background
}))

const chatAreaStyle = computed(() => ({
  backgroundColor: 'transparent'
}))

const messageContentStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd || themeState.currentTheme.background
}))

const toolCallItemStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background
}))

const inputAreaStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  borderTop: `1px solid ${themeState.currentTheme.borderColor || '#e0e0e0'}`
}))

const renderMarkdown = (content: string): string => {
  return marked(content, { breaks: true })
}
</script>

<style scoped>
.agent-view-demo {
  width: 100%;
  height: 500px;
  display: flex;
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid var(--el-border-color-light);
}

/* 侧边栏 */
.sidebar {
  width: 200px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid var(--el-border-color-light);
}

.sidebar-title {
  font-size: 14px;
  font-weight: 600;
}

.tool-list {
  flex: 1;
  padding: 8px;
  overflow-y: auto;
}

.tool-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 4px;
}

.tool-item:hover {
  background-color: var(--el-color-primary-light-9);
}

.tool-item.active {
  background-color: var(--el-color-primary-light-8);
}

.tool-icon {
  opacity: 0.7;
}

.tool-name {
  font-size: 13px;
}

/* 主内容区 */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* Agent 头部 */
.agent-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--el-border-color-light);
}

.agent-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.agent-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background-color: var(--el-color-primary-light-9);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-color-primary);
}

.agent-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.agent-name {
  font-size: 15px;
  font-weight: 600;
}

.agent-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  opacity: 0.7;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: #10b981;
}

.agent-actions {
  display: flex;
  gap: 8px;
}

/* 对话区域 */
.chat-area {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

/* 欢迎消息 */
.welcome-message {
  text-align: center;
  padding: 30px 20px;
  margin-bottom: 20px;
}

.welcome-icon {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: linear-gradient(
    135deg,
    var(--el-color-primary-light-7),
    var(--el-color-primary-light-5)
  );
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
  color: var(--el-color-primary);
}

.welcome-message h3 {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 8px;
}

.welcome-message p {
  font-size: 14px;
  opacity: 0.7;
  margin-bottom: 16px;
  max-width: 400px;
  margin-left: auto;
  margin-right: auto;
}

.suggestion-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.suggestion-chip {
  font-size: 12px;
}

/* 消息列表 */
.messages-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.message-item {
  display: flex;
  gap: 12px;
}

.message-item.user {
  flex-direction: row-reverse;
}

.message-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background-color: var(--el-bg-color-page);
  border: 1px solid var(--el-border-color-light);
}

.message-item.user .message-avatar {
  background-color: var(--el-color-primary);
  color: white;
  border-color: var(--el-color-primary);
}

.message-content {
  max-width: 80%;
  padding: 12px 16px;
  border-radius: 12px;
  border: 1px solid var(--el-border-color-light);
}

.message-item.user .message-content {
  background-color: var(--el-color-primary);
  color: white;
  border-color: var(--el-color-primary);
}

.message-text {
  font-size: 14px;
  line-height: 1.6;
}

.message-text :deep(p) {
  margin: 0 0 8px 0;
}

.message-text :deep(p:last-child) {
  margin-bottom: 0;
}

.message-text :deep(strong) {
  font-weight: 600;
}

/* 工具调用 */
.tool-calls {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tool-call-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
}

.tool-call-icon {
  opacity: 0.7;
}

.tool-call-name {
  font-weight: 500;
}

/* 输入区域 */
.input-area {
  padding: 16px 20px;
}

.input-container {
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
  margin-bottom: 8px;
}

.input-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.input-actions > div {
  display: flex;
  gap: 8px;
}
</style>
