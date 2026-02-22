<template>
  <div class="ai-chat-demo" :style="containerStyle">
    <div class="main-container">
      <!-- 左侧会话列表 -->
      <div class="session-list-panel" :style="sessionListStyle">
        <div class="session-list-header">
          <span class="session-list-title">{{ t('aiChat.sessionsTitle', 'AI会话') }}</span>
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
        <header class="conversation-header">
          <h1 class="title">{{ demoSessions[0]?.title || t('aiChat.defaultTitle', '新对话') }}</h1>
          <div class="conversation-stats">
            <Badge variant="outline" class="cursor-pointer">
              {{ t('agent.conversation.references', { count: 2 }) }}
            </Badge>
          </div>
        </header>

        <div class="dialog-container">
          <!-- 消息列表 -->
          <div class="messages-area">
            <div
              v-for="(msg, index) in demoMessages"
              :key="index"
              class="message-bubble"
              :class="msg.role"
            >
              <div class="message-content" v-html="renderMarkdown(msg.content)"></div>
            </div>
          </div>

          <!-- 输入区域 -->
          <div class="composer-wrapper">
            <!-- 引用显示 -->
            <div class="reference-bar">
              <span class="reference-tag"
                >{{ t('agent.reference.document', '文档') }}: README.md</span
              >
              <span class="reference-tag">{{ t('agent.reference.url', '网页') }}: example.com</span>
            </div>

            <!-- 输入框 -->
            <div class="input-area" :style="inputStyle">
              <textarea
                class="chat-input"
                :placeholder="t('aiChat.inputPlaceholder', '输入消息...')"
                rows="3"
                disabled
              ></textarea>
              <div class="input-actions">
                <div class="left-actions">
                  <Button variant="ghost" size="sm" disabled>
                    <Paperclip class="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" disabled>
                    <Database class="w-4 h-4" />
                  </Button>
                </div>
                <div class="right-actions">
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
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { Plus, Paperclip, Database, Send } from 'lucide-vue-next'
import { themeState } from '@renderer/utils/themes'
import { marked } from 'marked'

const { t } = useI18n()

// Demo 数据
const demoSessions = [
  {
    title: '关于文档编辑的讨论',
    updatedAt: Date.now() - 1000 * 60 * 5 // 5分钟前
  },
  {
    title: 'LaTeX公式编写',
    updatedAt: Date.now() - 1000 * 60 * 30 // 30分钟前
  },
  {
    title: '图表生成',
    updatedAt: Date.now() - 1000 * 60 * 60 * 2 // 2小时前
  },
  {
    title: '大纲规划',
    updatedAt: Date.now() - 1000 * 60 * 60 * 24 // 1天前
  }
]

const demoMessages = [
  {
    role: 'user',
    content: '请帮我优化这个段落的表达'
  },
  {
    role: 'assistant',
    content:
      '好的，我会帮您优化这段文字。请您将需要优化的段落发送给我，我会从以下几个方面进行改进：\n\n1. **语言流畅度** - 使句子更加通顺自然\n2. **逻辑清晰** - 调整段落结构，让论点更清晰\n3. **用词精准** - 选择更恰当的词汇表达\n4. **简洁有力** - 去除冗余表达，保留核心内容\n\n请发送您需要优化的文本，我会为您提供优化建议。'
  },
  {
    role: 'user',
    content: '如何在 Markdown 中插入表格？'
  },
  {
    role: 'assistant',
    content:
      '在 Markdown 中插入表格非常简单，使用以下语法：\\n\\n| 表头1 | 表头2 | 表头3 |\\n|-------|-------|-------|\\n| 内容1 | 内容2 | 内容3 |\\n| 内容4 | 内容5 | 内容6 |\\n\\n渲染效果如上所示。\\n\\n**对齐方式**：\\n- `:---` 左对齐（默认）\\n- `:---:` 居中对齐\\n- `---:` 右对齐'
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

// Markdown 渲染
const renderMarkdown = (content: string): string => {
  return marked(content, { breaks: true })
}

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
.ai-chat-demo {
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
  width: 240px;
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

.conversation-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-light);
}

.conversation-header .title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.conversation-stats {
  display: flex;
  gap: 8px;
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
  padding-bottom: 180px;
}

.message-bubble {
  margin-bottom: 16px;
  max-width: 85%;
}

.message-bubble.user {
  margin-left: auto;
  text-align: right;
}

.message-bubble.assistant {
  margin-right: auto;
}

.message-content {
  padding: 12px 16px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.6;
  text-align: left;
}

.message-bubble.user .message-content {
  background-color: var(--el-color-primary);
  color: white;
}

.message-bubble.assistant .message-content {
  background-color: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
}

.message-content :deep(p) {
  margin: 0 0 8px 0;
}

.message-content :deep(p:last-child) {
  margin-bottom: 0;
}

.message-content :deep(code) {
  background-color: rgba(0, 0, 0, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
}

.message-content :deep(pre) {
  background-color: var(--el-bg-color-page);
  padding: 12px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 8px 0;
}

.message-content :deep(pre code) {
  background: none;
  padding: 0;
}

.message-content :deep(table) {
  border-collapse: collapse;
  margin: 8px 0;
  font-size: 13px;
}

.message-content :deep(th),
.message-content :deep(td) {
  border: 1px solid var(--el-border-color);
  padding: 6px 12px;
  text-align: left;
}

.message-content :deep(th) {
  background-color: var(--el-bg-color-page);
  font-weight: 600;
}

/* 输入区域 */
.composer-wrapper {
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.reference-bar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.reference-tag {
  font-size: 12px;
  padding: 4px 10px;
  background-color: var(--el-color-primary-light-9);
  border: 1px solid var(--el-color-primary-light-5);
  border-radius: 4px;
  color: var(--el-color-primary);
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

.left-actions {
  display: flex;
  gap: 8px;
}

.right-actions {
  display: flex;
  gap: 8px;
}
</style>
