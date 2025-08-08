<template>
  <div v-if="visible" ref="taskQueueRef" class="ai-task-queue" :style="{
    background: themeState.currentTheme.background,
    width: width + 'px',
    height: height + 'px',
  }">
    <!-- 顶部拖拽条 -->
    <div class="resize-handle-top" @mousedown.prevent="startResizingTop"
      style="height: 6px; cursor: ns-resize; opacity: 0.6;"></div>
    <!-- 左侧拖拽条 -->
    <div class="resize-handle-left" @mousedown.prevent="startResizingLeft"
      style="width: 6px; height: 100%; cursor: ew-resize; position: absolute; left: 0; top: 0;"></div>
    <!-- 内容部分 -->
    <div style="flex: 1; overflow: hidden;">
      <h3 style="margin: 8px ;user-select: none;">{{ t('aiTaskQueue.title') }}</h3>
      <span style="text-align: center; display: block; user-select: none; opacity: 0.3;">
        {{ t('aiTaskQueue.switchWarning') }}
      </span>
      <el-scrollbar :style="{
        maxWidth: '100%',
        maxHeight: (height - 60) + 'px',
        height: (height - 60) + 'px',
        overflow: 'auto'
      }" min-size="5">
        <AITask v-for="task in tasks" :key="task.handle" :task="task" @start="() => startAiTask(task.handle)"
          @cancel="() => cancelAiTask(task.handle)" />
        <span v-if="tasks.length === 0"
          style="text-align: center; display: block; padding: 10px; user-select: none; opacity: 0.3;">
          {{ t('aiTaskQueue.empty') }}
        </span>
      </el-scrollbar>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useAiTasks, startAiTask, cancelAiTask } from '../utils/ai_tasks'
import AITask from './AITask.vue'
import eventBus from '../utils/event-bus'
import { themeState } from '../utils/themes'
import { useI18n } from 'vue-i18n'
const { t } = useI18n();

const visible = ref(false)
const tasks = useAiTasks()

const width = ref(350)
const height = ref(300)

const resizing = ref(false)
let startY = 0
let startHeight = 0

function startResizingTop(e) {
  resizing.value = true
  startY = e.clientY
  startHeight = height.value
  document.addEventListener('mousemove', resizeTop)
  document.addEventListener('mouseup', stopResizing)
}

function resizeTop(e) {
  if (!resizing.value) return
  const dy = e.clientY - startY
  height.value = Math.max(200, startHeight - dy)
}

function stopResizing() {
  resizing.value = false
  document.removeEventListener('mousemove', resizeTop)
  document.removeEventListener('mouseup', stopResizing)
}

let startX = 0
let startWidth = 0

function startResizingLeft(e) {
  resizing.value = true
  startX = e.clientX
  startWidth = width.value
  document.addEventListener('mousemove', resizeLeft)
  document.addEventListener('mouseup', stopResizing)
}

function resizeLeft(e) {
  if (!resizing.value) return
  const dx = e.clientX - startX
  width.value = Math.max(250, startWidth - dx)
}



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
  min-width: 250px;
  min-height: 200px;
  max-width: 30vw;
  max-height: 70vh;
  /*
    display: 'flex',
    flexDirection: 'column' */
}
</style>
