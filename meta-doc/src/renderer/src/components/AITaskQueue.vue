<template>
  <ResizablePanel
    :visible="visible"
    :initial-width="360"
    :initial-height="320"
    :min-width="260"
    :min-height="220"
    :max-width="maxWidth"
    :max-height="maxHeight"
    :background-color="themeState.currentTheme.background"
    position="fixed"
    :bottom="30"
    :right="16"
    :enable-top-resize="true"
    :enable-left-resize="true"
    :content-padding="10"
    @resize="onResize"
  >
    <div class="queue-wrapper" :style="wrapperStyle">
      <div class="queue-header">
        <el-tooltip :content="t('aiTaskQueue.switchWarning')" placement="right">
          <h3>{{ t('aiTaskQueue.title') }}</h3>
        </el-tooltip>
        <div class="header-actions">
          <el-switch
            v-model="settings.autoCompletion"
            :active-text="$t('setting.autoCompletion')"
            class="auto-switch"
            @change="setSetting('autoCompletion', settings.autoCompletion)"
          />
        </div>
      </div>

      <el-scrollbar
        :style="{
          maxWidth: '100%',
          flex: 1,
          overflow: 'auto'
        }"
        min-size="5"
      >
        <AITask
          v-for="task in tasks"
          :key="task.handle"
          :task="task"
          @start="() => startAiTask(task.handle)"
          @cancel="() => cancelAiTask(task.handle)"
        />

        <div v-if="tasks.length === 0" class="empty-state">
          {{ t('aiTaskQueue.empty') }}
        </div>
      </el-scrollbar>
    </div>
  </ResizablePanel>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useAiTasks, startAiTask, cancelAiTask } from '../utils/ai_tasks.ts'
import AITask from './AITask.vue'
import ResizablePanel from './base/ResizablePanel.vue'
import eventBus from '../utils/event-bus'
import { themeState } from '../utils/themes'
import { useI18n } from 'vue-i18n'
import { setSetting, settings } from '../utils/settings'

const { t } = useI18n()

// 组件状态
const visible = ref(false)
const tasks = useAiTasks()

// 类型断言以解决类型问题
type TaskType = typeof tasks.value[0]

// 面板尺寸限制
const maxWidth = computed(() => Math.floor(window.innerWidth * 0.3))
const maxHeight = computed(() => Math.floor(window.innerHeight * 0.7))

const wrapperStyle = computed(() => {
  const isDark = themeState.currentTheme?.type === 'dark'
  return {
    color: themeState.currentTheme.textColor,
    '--queue-border-color': isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.1)',
    '--queue-item-bg': isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.02)',
    '--queue-item-hover-bg': isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.05)',
    '--queue-empty-opacity': isDark ? 0.6 : 0.4,
    '--queue-time-opacity': isDark ? 0.7 : 0.45
  }
})

// 面板尺寸变化处理
function onResize(width: number, height: number) {
  // 可以在这里处理尺寸变化的逻辑
  // 例如保存到本地存储等
  console.log(`AI任务队列面板尺寸调整为: ${width}x${height}`)
}

function toggleVisibility() {
  const next = !visible.value
  visible.value = next
  if (next) {
    eventBus.emit('close-notification-queue')
  }
}

function closePanel() {
  visible.value = false
}

// 组件挂载后设置事件监听
onMounted(() => {
  eventBus.on('toggle-ai-task-queue', toggleVisibility)
  eventBus.on('close-ai-task-queue', closePanel)
})

onBeforeUnmount(() => {
  eventBus.off('toggle-ai-task-queue', toggleVisibility)
  eventBus.off('close-ai-task-queue', closePanel)
})
</script>

<style scoped>
.queue-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  color: inherit;
}

.queue-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  user-select: none;
  border-bottom: 1px solid var(--queue-border-color);
  padding-bottom: 6px;
}

.queue-header h3 {
  margin: 0;
  font-size: 16px;
}

.header-actions {
  display: flex;
  align-items: center;
}

.auto-switch {
  --el-switch-on-color: #13ce66;
  --el-switch-off-color: #ff4949;
}

.empty-state {
  text-align: center;
  padding: 16px 8px;
  opacity: var(--queue-empty-opacity);
  color: inherit;
}

.empty-state {
  text-align: center;
  padding: 16px 8px;
  opacity: var(--queue-empty-opacity);
  color: inherit;
}
</style>