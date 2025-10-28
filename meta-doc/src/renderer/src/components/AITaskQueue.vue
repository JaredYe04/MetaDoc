<template>
  <ResizablePanel
    :visible="visible"
    :initial-width="350"
    :initial-height="300"
    :min-width="250"
    :min-height="200"
    :max-width="maxWidth"
    :max-height="maxHeight"
    :background-color="themeState.currentTheme.background"
    position="fixed"
    :bottom="30"
    :right="20"
    :enable-top-resize="true"
    :enable-left-resize="true"
    :content-padding="10"
    @resize="onResize"
  >
    <!-- 标题栏 -->
    <el-tooltip :content="t('aiTaskQueue.switchWarning')" placement="right">
      <h3 style="margin: 8px; user-select: none;">{{ t('aiTaskQueue.title') }}</h3>
    </el-tooltip>

    <!-- 自动补全开关 -->
    <el-switch 
      v-model="settings.autoCompletion" 
      class="mb-2"
      style="--el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949; text-align: center;"
      :active-text="$t('setting.autoCompletion')"
      @change="setSetting('autoCompletion', settings.autoCompletion)" 
    />

    <!-- 任务列表滚动区域 -->
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
      
      <!-- 空状态 -->
      <div 
        v-if="tasks.length === 0"
        class="empty-state"
      >
        {{ t('aiTaskQueue.empty') }}
      </div>
    </el-scrollbar>
  </ResizablePanel>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
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

// 面板尺寸变化处理
function onResize(width: number, height: number) {
  // 可以在这里处理尺寸变化的逻辑
  // 例如保存到本地存储等
  console.log(`AI任务队列面板尺寸调整为: ${width}x${height}`)
}

// 组件挂载后设置事件监听
onMounted(() => {
  eventBus.on('toggle-ai-task-queue', () => {
    visible.value = !visible.value
  })
})
</script>

<style scoped>
.empty-state {
  text-align: center;
  display: block;
  padding: 10px;
  user-select: none;
  opacity: 0.3;
}

.mb-2 {
  margin-bottom: 8px;
}
</style>