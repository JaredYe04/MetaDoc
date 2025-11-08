<template>
  <div
    class="bottom-menu"
    :style="{
      background: themeState.currentTheme.background,
      color: themeState.currentTheme.textColor
    }"
  >
    <div class="status-group">
      <span class="status-item">{{ $t('bottomMenu.wordCount') }} {{ wordCount }}</span>
      <span class="status-divider">|</span>
      <span class="status-item status-file">
        {{ $t('bottomMenu.currentFile') }}{{ current_file_path ? current_file_path : $t('bottomMenu.newFile') }}
      </span>
      

    </div>
    <div class="actions-group">
        <el-tooltip :content="$t('bottomMenu.logConsoleTooltip')" placement="top">
        <span class="status-item status-logger" @click.prevent="toggleLoggerConsole">
          <el-icon class="status-icon" size="14">
            <Document />
          </el-icon>
          <span class="status-text">{{ $t('bottomMenu.logConsoleLabel') }}</span>
        </span>
      </el-tooltip>
      <span class="status-divider">|</span>
        <el-tooltip :content="notificationTooltip" placement="top">
        <span class="status-item status-notification" @click.prevent="toggleNotificationQueue">
          <el-icon class="status-icon" size="14">
            <BellFilled />
          </el-icon>
          <span class="status-text">{{ notificationSummary }}</span>
          <span
            v-if="unreadCount > 0"
            class="status-badge"
            :style="{ backgroundColor: themeState.currentTheme.accentColor || '#f56c6c' }"
          >
            {{ unreadCount }}
          </span>
        </span>
      </el-tooltip>
      <span class="status-divider">|</span>
      <el-tooltip :content="$t('bottomMenu.aiTaskQueueTooltip')" placement="top">
        <span class="ai-task-menu" @click.prevent="eventBus.emit('toggle-ai-task-queue')">
          <img :src="themeState.currentTheme.AiLogo" alt="AI" />
          <span class="ai-task-label">{{ $t('bottomMenu.aiTaskQueueLabel') }}</span>
          <span v-if="tasks.length > 0" class="ai-task-count">{{ tasks.length }}</span>
        </span>
      </el-tooltip>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { current_article, current_file_path, current_format, current_tex_article } from '../utils/common-data'
import eventBus from '../utils/event-bus'
import { themeState } from '../utils/themes'
import { useNotificationStack, initializeNotificationListeners } from '../utils/notifications'


//wordCount计算当前文章的字数，通过监听current_article.value的变化来实现
const wordCount = computed(() => {
    if(current_format.value=='md'){
        if (current_article.value) {
            return current_article.value ? current_article.value.trim().length : 0
        }
    }
    else if(current_format.value=='tex'){
        return current_tex_article.value.trim().length
    }

    return 0
})

import { useI18n } from 'vue-i18n'
import { BellFilled, Document } from '@element-plus/icons-vue'
import { useAiTasks } from '../utils/ai_tasks'
const { t } = useI18n()
initializeNotificationListeners(t)
const tasks = useAiTasks()

const { latestNotification, unreadCount } = useNotificationStack()

const notificationSummary = computed(() => {
    if (!latestNotification.value) {
        return t('bottomMenu.notificationEmpty')
    }
    return latestNotification.value.message
})

const notificationTooltip = computed(() => {
    if (!latestNotification.value) {
        return t('bottomMenu.notificationTooltip')
    }
    return `${latestNotification.value.title} - ${latestNotification.value.message}`
})

function toggleNotificationQueue() {
    eventBus.emit('toggle-notification-queue')
}

function toggleLoggerConsole() {
    eventBus.emit('toggle-logger-console')
}
</script>
<style scoped>
.bottom-menu {
    height: 30px;
    width: 100%;
    border: 1px solid #cccccc44;
    /*字体加粗 */
    font-weight: bold;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 5%;
    font-size: 12px;
    box-sizing: border-box;
}

.status-group {
    display: flex;
    align-items: center;
    gap: 12px;
    overflow: hidden;
    flex: 1 1 auto;
    min-width: 0;
}

.status-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
}

.status-file {
    max-width: 40vw;
}

.status-divider {
    opacity: 0.4;
    user-select: none;
}

.status-notification {
    cursor: pointer;
    padding: 4px 6px;
    border-radius: 6px;
    transition: background-color 0.2s ease;
}

.status-notification:hover {
    background-color: rgba(0, 0, 0, 0.08);
}

.status-logger {
    cursor: pointer;
    padding: 4px 6px;
    border-radius: 6px;
    transition: background-color 0.2s ease;
}

.status-logger:hover {
    background-color: rgba(0, 0, 0, 0.08);
}

.status-icon {
    display: flex;
}

.status-text {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.status-badge {
    min-width: 16px;
    height: 16px;
    border-radius: 8px;
    font-size: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    padding: 0 4px;
}

.actions-group {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 0 0 auto;
    margin-left: 12px;
    flex-shrink: 0;
}

.ai-task-menu {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    user-select: none;
    padding: 4px 8px;
    border-radius: 6px;
    transition: background-color 0.2s ease;
}

.ai-task-menu:hover {
    background-color: rgba(0, 0, 0, 0.08);
}

.ai-task-menu img {
    width: 18px;
    height: 18px;
}

.ai-task-label {
    font-weight: 500;
}

.ai-task-count {
    font-weight: bold;
}
</style>