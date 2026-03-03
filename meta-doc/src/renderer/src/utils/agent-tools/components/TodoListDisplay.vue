<template>
  <div class="todolist-display" :style="containerStyle">
    <!-- 紧凑模式：仅列表 + 是否完成（类似 Cursor） -->
    <template v-if="compact">
      <div
        v-if="displayData.stage === 'analyzing' || displayData.stage === 'generating'"
        class="todolist-compact-status"
      >
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>{{
          displayData.stage === 'analyzing'
            ? $t('agent.display.todoList.analyzing')
            : $t('agent.display.todoList.generating')
        }}</span>
      </div>
      <div
        v-else-if="displayData.stage === 'completed' && displayData.todoList?.items?.length"
        class="todolist-compact-list"
      >
        <div
          v-for="item in displayData.todoList.items"
          :key="item.id"
          class="todolist-compact-item"
          :class="{ 'todolist-compact-item--done': item.status === 'completed' }"
        >
          <span class="todolist-compact-check">{{ item.status === 'completed' ? '✓' : '○' }}</span>
          <span class="todolist-compact-title">{{ item.title }}</span>
        </div>
      </div>
    </template>

    <template v-else>
    <div
      v-if="displayData.stage === 'analyzing'"
      class="status-message"
      :style="statusMessageStyle"
    >
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>{{ $t('agent.display.todoList.analyzing') }}</span>
    </div>

    <div
      v-else-if="displayData.stage === 'generating'"
      class="status-message"
      :style="statusMessageStyle"
    >
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>{{ $t('agent.display.todoList.generating') }}</span>
    </div>

    <div
      v-else-if="displayData.stage === 'completed' && displayData.todoList"
      class="completed-state"
      :style="completedStateStyle"
    >
      <div class="todolist-header" :style="headerStyle">
        <div class="header-left">
          <h3 class="todolist-title" :style="titleStyle">{{ displayData.todoList.title }}</h3>
          <p
            v-if="displayData.todoList.description"
            class="todolist-description"
            :style="descriptionStyle"
          >
            {{ displayData.todoList.description }}
          </p>
        </div>
        <div class="todolist-stats">
          <div class="stat-item" :style="statItemStyle">
            <span class="stat-value" :style="statValueStyle">{{
              displayData.todoList.items.length
            }}</span>
            <span class="stat-label" :style="statLabelStyle">{{
              $t('agent.display.todoList.totalTasks')
            }}</span>
          </div>
          <div class="stat-item success" :style="statItemStyle">
            <span class="stat-value" :style="statValueStyle">{{ completedCount }}</span>
            <span class="stat-label" :style="statLabelStyle">{{
              $t('agent.display.todoList.completed')
            }}</span>
          </div>
          <div class="stat-item warning" :style="statItemStyle">
            <span class="stat-value" :style="statValueStyle">{{ inProgressCount }}</span>
            <span class="stat-label" :style="statLabelStyle">{{
              $t('agent.display.todoList.inProgress')
            }}</span>
          </div>
          <div class="stat-item info" :style="statItemStyle">
            <span class="stat-value" :style="statValueStyle">{{ pendingCount }}</span>
            <span class="stat-label" :style="statLabelStyle">{{
              $t('agent.display.todoList.pending')
            }}</span>
          </div>
        </div>
      </div>

      <div class="todolist-items">
        <ScrollArea class="max-h-[500px]">
          <div
            v-for="item in displayData.todoList.items"
            :key="item.id"
            class="todo-item"
            :class="{
              'todo-completed': item.status === 'completed',
              'todo-in-progress': item.status === 'in_progress',
              'todo-cancelled': item.status === 'cancelled',
              'todo-pending': item.status === 'pending'
            }"
          >
            <div class="todo-item-main">
              <div class="todo-checkbox-wrapper">
                <Checkbox :checked="item.status === 'completed'" disabled class="todo-checkbox" />
                <div class="status-indicator" :class="`status-${item.status}`"></div>
              </div>
              <div class="todo-content">
                <div class="todo-item-header">
                  <span class="todo-title">{{ item.title }}</span>
                  <div class="todo-badges">
                    <Badge
                      v-if="item.priority"
                      :type="getPriorityType(item.priority)"
                      size="small"
                      effect="dark"
                      class="priority-tag"
                    >
                      {{ getPriorityLabel(item.priority) }}
                    </Badge>
                    <Badge
                      v-if="item.tags && item.tags.length === 0"
                      size="small"
                      effect="plain"
                      class="todo-tag"
                    >
                      {{ $t('agent.display.todoList.noTags') }}
                    </Badge>
                    <Badge
                      v-for="tag in item.tags"
                      :key="tag"
                      size="small"
                      effect="plain"
                      class="todo-tag"
                    >
                      {{ tag }}
                    </Badge>
                  </div>
                </div>

                <p v-if="item.description" class="todo-description">
                  {{ item.description }}
                </p>

                <div
                  v-if="
                    item.dueDate ||
                    item.estimatedTime ||
                    item.assignee ||
                    (item.dependencies && item.dependencies.length > 0)
                  "
                  class="todo-meta"
                  :style="todoMetaStyle"
                >
                  <span v-if="item.dueDate" class="todo-meta-item" :style="todoMetaItemStyle">
                    <el-icon><Calendar /></el-icon>
                    <span>{{ formatDate(item.dueDate) }}</span>
                  </span>
                  <span
                    v-else-if="
                      !item.dueDate &&
                      (item.estimatedTime ||
                        item.assignee ||
                        (item.dependencies && item.dependencies.length > 0))
                    "
                    class="todo-meta-item"
                    :style="todoMetaItemStyle"
                  >
                    <el-icon><Calendar /></el-icon>
                    <span>{{ $t('agent.display.todoList.noDueDate') }}</span>
                  </span>
                  <span v-if="item.estimatedTime" class="todo-meta-item" :style="todoMetaItemStyle">
                    <el-icon><Clock /></el-icon>
                    <span>{{ item.estimatedTime }}</span>
                  </span>
                  <span v-if="item.assignee" class="todo-meta-item" :style="todoMetaItemStyle">
                    <el-icon><User /></el-icon>
                    <span>{{ item.assignee }}</span>
                  </span>
                  <span
                    v-if="item.dependencies && item.dependencies.length > 0"
                    class="todo-meta-item dependencies"
                    :style="todoMetaItemStyle"
                  >
                    <el-icon><Connection /></el-icon>
                    <span>{{
                      $t('agent.display.todoList.dependencies', { count: item.dependencies.length })
                    }}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>

    <div v-else class="error-state">
      <Alert variant="destructive">
        <XCircle class="h-4 w-4" />
        <AlertTitle>{{
          displayData.error || $t('agent.display.todoList.generationFailed')
        }}</AlertTitle>
      </Alert>
    </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Loading, Calendar, Clock, User, Connection } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Alert, AlertTitle, AlertDescription } from '../../../components/ui/alert'
import { Badge } from '@renderer/components/ui/badge'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { XCircle } from 'lucide-vue-next'
import type { ToolDisplayComponentProps } from '../../../types/agent-tool'
import type { TodoList } from '../todolist-tool'
import { useToolDisplayRealtime, parseToolData } from '../composables/useToolDisplayRealtime'
import { themeState } from '../../themes'

const { t } = useI18n()

const props = withDefaults(defineProps<ToolDisplayComponentProps>(), { compact: false })

// 使用实时通信
const { realtimeData, realtimeStatus } = useToolDisplayRealtime(
  props.invocationId,
  props.data,
  props.status,
  props.progress
)

// 解析显示数据（优先使用实时数据）
const displayData = computed(() => {
  const data = realtimeData.value !== null ? realtimeData.value : props.data
  const parsed = parseToolData(data)

  if (typeof parsed === 'object' && parsed !== null) {
    return parsed as {
      stage: 'analyzing' | 'generating' | 'completed' | 'error'
      input?: string
      context?: string
      todoList?: TodoList
      error?: string
    }
  }
  return { stage: 'analyzing' }
})

const completedCount = computed(() => {
  return displayData.value.todoList?.items.filter((item) => item.status === 'completed').length || 0
})

const inProgressCount = computed(() => {
  return (
    displayData.value.todoList?.items.filter((item) => item.status === 'in_progress').length || 0
  )
})

const pendingCount = computed(() => {
  return displayData.value.todoList?.items.filter((item) => item.status === 'pending').length || 0
})

const getPriorityType = (priority: string) => {
  const map: Record<string, string> = {
    low: 'info',
    medium: 'success',
    high: 'warning',
    urgent: 'danger'
  }
  return map[priority] || 'success'
}

const getPriorityLabel = (priority: string) => {
  const map: Record<string, string> = {
    low: t('agent.display.todoList.low'),
    medium: t('agent.display.todoList.medium'),
    high: t('agent.display.todoList.high'),
    urgent: t('agent.display.todoList.urgent', { defaultValue: '紧急' })
  }
  return map[priority] || priority
}

// 主题样式
const containerStyle = computed(() => ({
  backgroundColor: 'transparent',
  color: themeState.currentTheme.textColor
}))

const statusMessageStyle = computed(() => ({
  color: themeState.currentTheme.textColor
}))

const completedStateStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

const headerStyle = computed(() => ({
  borderBottomColor:
    themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'
}))

const titleStyle = computed(() => ({
  color: themeState.currentTheme.textColor
}))

const descriptionStyle = computed(() => ({
  color: themeState.currentTheme.textColor
}))

const statItemStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd
}))

const statValueStyle = computed(() => ({
  color: themeState.currentTheme.textColor
}))

const statLabelStyle = computed(() => ({
  color: themeState.currentTheme.textColor
}))

const todoMetaStyle = computed(() => ({
  color: themeState.currentTheme.textColor
}))

const todoMetaItemStyle = computed(() => ({
  color: themeState.currentTheme.textColor
}))

const formatDate = (dateString: string) => {
  try {
    const date = new Date(dateString)
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  } catch {
    return dateString
  }
}
</script>

<style scoped>
.todolist-display {
  width: 100%;
}

.status-message {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
}

.completed-state {
  width: 100%;
}

.todolist-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 2px solid;
  gap: 20px;
}

.header-left {
  flex: 1;
}

.todolist-title {
  margin: 0 0 8px 0;
  font-size: 20px;
  font-weight: 600;
}

.todolist-description {
  margin: 0;
  line-height: 1.6;
  font-size: 14px;
}

.todolist-stats {
  display: flex;
  gap: 16px;
  flex-shrink: 0;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 12px;
  border-radius: 6px;
  min-width: 60px;
}

.stat-item.success {
  background-color: rgba(103, 194, 58, 0.1);
}

.stat-item.warning {
  background-color: rgba(230, 162, 60, 0.1);
}

.stat-item.info {
  background-color: rgba(144, 147, 153, 0.1);
}

.stat-value {
  font-size: 20px;
  font-weight: 600;
  line-height: 1;
}

.stat-item.success .stat-value {
  color: var(--el-color-success);
}

.stat-item.warning .stat-value {
  color: var(--el-color-warning);
}

.stat-item.info .stat-value {
  color: var(--el-color-info);
}

.stat-label {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}

.todolist-items {
  width: 100%;
}

.todo-item {
  padding: 16px;
  margin-bottom: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  background-color: var(--el-bg-color);
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

.todo-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background-color: transparent;
  transition: background-color 0.3s;
}

.todo-item:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  transform: translateY(-2px);
}

.todo-pending::before {
  background-color: var(--el-color-info);
}

.todo-in-progress::before {
  background-color: var(--el-color-warning);
}

.todo-completed::before {
  background-color: var(--el-color-success);
}

.todo-cancelled::before {
  background-color: var(--el-color-info);
}

.todo-completed {
  opacity: 0.75;
  background-color: var(--el-fill-color-light);
}

.todo-completed .todo-title {
  text-decoration: line-through;
  color: var(--el-text-color-secondary);
}

.todo-cancelled {
  opacity: 0.6;
  background-color: var(--el-fill-color-darker);
}

.todo-item-main {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.todo-checkbox-wrapper {
  position: relative;
  flex-shrink: 0;
  margin-top: 2px;
}

.todo-checkbox {
  flex-shrink: 0;
}

.status-indicator {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 8px;
  height: 8px;
  border-radius: 50%;
  pointer-events: none;
  z-index: 1;
}

.status-pending {
  background-color: var(--el-color-info);
}

.status-in_progress {
  background-color: var(--el-color-warning);
}

.status-completed {
  background-color: var(--el-color-success);
}

.status-cancelled {
  background-color: var(--el-color-info);
  opacity: 0.5;
}

.todo-content {
  flex: 1;
  min-width: 0;
}

.todo-item-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.todo-title {
  flex: 1;
  font-weight: 500;
  color: var(--el-text-color-primary);
  font-size: 15px;
  min-width: 0;
  word-break: break-word;
}

.todo-badges {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
}

.priority-tag {
  font-weight: 500;
}

.todo-tag {
  margin: 0;
}

.todo-description {
  margin: 8px 0;
  color: var(--el-text-color-regular);
  font-size: 14px;
  line-height: 1.6;
  word-break: break-word;
}

.todo-meta {
  display: flex;
  gap: 16px;
  margin-top: 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  flex-wrap: wrap;
}

.todo-meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.todo-meta-item .el-icon {
  font-size: 14px;
}

.todo-meta-item.dependencies {
  color: var(--el-color-info);
}

.error-state {
  padding: 12px;
}

/* 紧凑模式（Cursor 风格：仅列表 + 完成状态） */
.todolist-compact-status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  font-size: 12px;
}

.todolist-compact-list {
  max-height: 220px;
  overflow-y: auto;
  padding: 2px 0;
}

.todolist-compact-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  font-size: 12px;
  line-height: 1.4;
}

.todolist-compact-item--done .todolist-compact-title {
  text-decoration: line-through;
  color: var(--el-text-color-secondary);
}

.todolist-compact-check {
  flex-shrink: 0;
  width: 14px;
  text-align: center;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.todolist-compact-item--done .todolist-compact-check {
  color: var(--el-color-success);
}

.todolist-compact-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
