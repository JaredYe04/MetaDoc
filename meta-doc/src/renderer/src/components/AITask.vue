<template>
  <el-card
    :body-style="{ padding: '10px' }"
    style="margin-bottom: 10px"
    :style="{
      backgroundColor: themeState.currentTheme.background2nd,
      borderColor: taskStatus === ai_task_status.FAILED ? 'var(--el-color-danger)' : undefined,
      borderWidth: taskStatus === ai_task_status.FAILED ? '2px' : undefined
    }"
  >
    <div style="display: flex; flex-direction: column; gap: 8px">
      <div style="display: flex; justify-content: space-between; align-items: center">
        <div style="flex: 1">
          <strong>{{
            task.name.length > 20 ? task.name.substring(0, 20) + '...' : task.name
          }}</strong
          ><br />
          <span
            :style="{
              color:
                taskStatus === ai_task_status.FAILED
                  ? 'var(--el-color-danger)'
                  : taskStatus === ai_task_status.CANCELLED
                    ? 'var(--el-color-warning)'
                    : taskStatus === ai_task_status.FINISHED
                      ? 'var(--el-color-success)'
                      : 'inherit'
            }"
          >
            {{ t('aiTask.status') + ': ' }} {{ taskStatus }}
          </span>
        </div>
        <div style="display: flex; gap: 6px">
          <el-button
            size="small"
            type="success"
            v-if="taskStatus === ai_task_status.READY"
            circle
            @click="$emit('start')"
          >
            <el-icon><PlayIcon /></el-icon>
          </el-button>
          <el-button size="small" type="danger" circle @click="$emit('cancel')">
            <el-icon><Close /></el-icon>
          </el-button>
        </div>
      </div>
      <!-- 显示错误信息 -->
      <div
        v-if="taskStatus === ai_task_status.FAILED && task.error"
        style="
          padding: 8px;
          background-color: var(--el-color-danger-light-9);
          border-radius: 4px;
          font-size: 12px;
          color: var(--el-color-danger);
        "
      >
        <el-icon style="vertical-align: middle; margin-right: 4px"><Warning /></el-icon>
        <strong>{{ t('aiTask.error') || '错误' }}:</strong> {{ task.error }}
      </div>
    </div>
  </el-card>
</template>

<script setup>
import { computed } from 'vue'
import { Close, Warning } from '@element-plus/icons-vue'
import { PlayIcon } from 'tdesign-icons-vue-next'
import { ai_task_status } from '../utils/consts'
import { useI18n } from 'vue-i18n'
import { themeState } from '../utils/themes'
const { t } = useI18n()

const props = defineProps({
  task: Object
})

// 计算属性：确保正确访问 Ref 类型的 status
const taskStatus = computed(() => {
  if (!props.task || !props.task.status) return ''
  // 如果是 Ref，需要访问 .value；如果不是，直接返回
  return typeof props.task.status === 'object' && 'value' in props.task.status
    ? props.task.status.value
    : props.task.status
})
</script>
