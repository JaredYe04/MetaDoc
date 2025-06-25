<template>
  
  <div v-if="visible" class="ai-task-queue" :style="{
    background: themeState.currentTheme.background,
    }">
    <h3>AI任务队列</h3>
    <el-scrollbar height="200px" style="max-width: 400px;">
      <AITask
        v-for="task in tasks"
        :key="task.handle"
        :task="task"
        @start="() => startAiTask(task.handle)"
        @cancel="() => cancelAiTask(task.handle)"
      />
      <span v-if="tasks.length === 0" style="text-align: center; display: block; padding: 10px; user-select: none; opacity: 0.3;">
        暂无任务
      </span>
    </el-scrollbar>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useAiTasks, startAiTask, cancelAiTask } from '../utils/ai_tasks'
import AITask from './AITask.vue'
import eventBus from '../utils/event-bus'
import { themeState } from '../utils/themes'

const visible = ref(false)
const tasks = useAiTasks()

onMounted(() => {
  eventBus.on('toggle-ai-task-queue', () => {
    visible.value = !visible.value
  })
})
</script>

<style scoped>
.ai-task-queue {
  width: 300px;
  position: fixed;
  bottom: 30px;
  right: 20px;
  border: 1px solid #cccccc44;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 2000;
  padding: 10px;
}
</style>
