<template>
  <div class="agent-session-manager">
    <div class="manager-header">
      <h3 class="title">{{ t('agent.sessionManager.title', '会话管理') }}</h3>
      <Button size="small" type="primary" @click="handleCreateSession" :disabled="isCreating">
        <Plus class="h-4 w-4 mr-1" />
        {{ t('agent.sessionManager.newSession', '新建会话') }}
      </Button>
    </div>

    <div class="sessions-list">
      <Card
        v-for="session in sessions"
        :key="session.id"
        class="session-card"
        :class="{ active: activeSessionId === session.id }"
        @click="selectSession(session.id)"
      >
        <CardContent class="p-4">
          <div class="session-info">
            <div class="session-main">
              <div class="session-title-row">
                <MessageSquare class="h-4 w-4 session-icon" />
                <span class="session-title">{{ session.title }}</span>
                <Badge v-if="session.id === activeSessionId" variant="default" size="sm">
                  {{ t('agent.sessionManager.active', '当前') }}
                </Badge>
              </div>

              <p v-if="session.description" class="session-description">
                {{ session.description }}
              </p>

              <div class="session-meta">
                <span class="meta-item">
                  <Clock class="h-3 w-3" />
                  {{ formatTime(session.updatedAt) }}
                </span>
                <span class="meta-item">
                  <MessageCircle class="h-3 w-3" />
                  {{ session.messageCount }} {{ t('agent.sessionManager.messages', '条消息') }}
                </span>
              </div>
            </div>

            <div class="session-actions">
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button size="small" variant="ghost" class="h-8 w-8 p-0" @click.stop>
                    <MoreHorizontal class="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem @click.stop="renameSession(session)">
                    <Edit3 class="h-4 w-4 mr-2" />
                    {{ t('agent.sessionManager.rename', '重命名') }}
                  </DropdownMenuItem>
                  <DropdownMenuItem @click.stop="duplicateSession(session)">
                    <Copy class="h-4 w-4 mr-2" />
                    {{ t('agent.sessionManager.duplicate', '复制') }}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    @click.stop="deleteSession(session)"
                    class="text-destructive"
                    :disabled="sessions.length <= 1"
                  >
                    <Trash2 class="h-4 w-4 mr-2" />
                    {{ t('agent.sessionManager.delete', '删除') }}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- 空状态 -->
    <div v-if="sessions.length === 0" class="empty-state">
      <Inbox class="h-12 w-12 empty-icon" />
      <p class="empty-text">{{ t('agent.sessionManager.noSessions', '暂无会话') }}</p>
      <Button type="primary" @click="handleCreateSession">
        {{ t('agent.sessionManager.createFirst', '创建第一个会话') }}
      </Button>
    </div>

    <!-- 重命名对话框 -->
    <Dialog v-model:open="showRenameDialog">
      <DialogContent class="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{{ t('agent.sessionManager.renameTitle', '重命名会话') }}</DialogTitle>
          <DialogDescription>
            {{ t('agent.sessionManager.renameDesc', '请输入新的会话名称') }}
          </DialogDescription>
        </DialogHeader>
        <div class="grid gap-4 py-4">
          <Input
            v-model="renameValue"
            :placeholder="t('agent.sessionManager.namePlaceholder', '会话名称')"
            @keyup.enter="confirmRename"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" @click="showRenameDialog = false">
            {{ t('common.cancel', '取消') }}
          </Button>
          <Button @click="confirmRename">
            {{ t('common.confirm', '确认') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { notifySuccess, notifyInfo, notifyWarning } from '../utils/notify'
import { Card, CardContent } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Input } from '../../components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../../components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '../../components/ui/dropdown-menu'
import {
  Plus,
  MoreHorizontal,
  MessageSquare,
  Clock,
  MessageCircle,
  Edit3,
  Copy,
  Trash2,
  Inbox
} from 'lucide-vue-next'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)

// Session interface
interface Session {
  id: string
  title: string
  description?: string
  createdAt: string
  updatedAt: string
  messageCount: number
}

// Props definition
const props = defineProps<{
  mode?: string
}>()
const isDemo = computed(() => props.mode === 'demo')

const { t } = useI18n()

// State
const sessions = ref<Session[]>([])
const activeSessionId = ref<string | null>(null)
const isCreating = ref(false)
const showRenameDialog = ref(false)
const renameValue = ref('')
const renamingSessionId = ref<string | null>(null)

// Demo data loading
const loadDemoData = () => {
  const now = new Date()
  sessions.value = [
    {
      id: 'demo-session-1',
      title: '代码审查会话',
      description: '审查 Vue 组件代码质量',
      createdAt: new Date(now.getTime() - 86400000).toISOString(),
      updatedAt: now.toISOString(),
      messageCount: 12
    },
    {
      id: 'demo-session-2',
      title: '文档翻译助手',
      description: '翻译技术文档为中文',
      createdAt: new Date(now.getTime() - 172800000).toISOString(),
      updatedAt: new Date(now.getTime() - 86400000).toISOString(),
      messageCount: 5
    },
    {
      id: 'demo-session-3',
      title: 'Bug 分析',
      description: '分析错误日志和堆栈跟踪',
      createdAt: new Date(now.getTime() - 259200000).toISOString(),
      updatedAt: new Date(now.getTime() - 172800000).toISOString(),
      messageCount: 8
    },
    {
      id: 'demo-session-4',
      title: 'API 设计讨论',
      description: '设计 RESTful API 接口',
      createdAt: new Date(now.getTime() - 345600000).toISOString(),
      updatedAt: new Date(now.getTime() - 259200000).toISOString(),
      messageCount: 15
    }
  ]
  activeSessionId.value = sessions.value[0].id
}

// Format time
const formatTime = (timestamp: string): string => {
  return dayjs(timestamp).fromNow()
}

// Select session
const selectSession = (sessionId: string) => {
  activeSessionId.value = sessionId
  if (isDemo.value) {
    notifyInfo(t('agent.sessionManager.demoSelect', '演示模式：已选择会话'))
  }
}

// Create session
const handleCreateSession = () => {
  if (isDemo.value) {
    const newSession: Session = {
      id: `demo-session-${Date.now()}`,
      title: `演示会话 ${sessions.value.length + 1}`,
      description: t('agent.sessionManager.demoDesc', '这是一个演示会话'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0
    }
    sessions.value.unshift(newSession)
    activeSessionId.value = newSession.id
    notifySuccess(t('agent.sessionManager.createSuccess', '会话创建成功'))
    return
  }

  // Real implementation would open a dialog to select agent config
  isCreating.value = true
  // ... real implementation
  isCreating.value = false
}

// Rename session
const renameSession = (session: Session) => {
  renamingSessionId.value = session.id
  renameValue.value = session.title
  showRenameDialog.value = true
}

const confirmRename = () => {
  if (!renamingSessionId.value || !renameValue.value.trim()) {
    showRenameDialog.value = false
    return
  }

  const session = sessions.value.find((s) => s.id === renamingSessionId.value)
  if (session) {
    session.title = renameValue.value.trim()
    session.updatedAt = new Date().toISOString()
    notifySuccess(t('agent.sessionManager.renameSuccess', '重命名成功'))
  }

  showRenameDialog.value = false
  renamingSessionId.value = null
  renameValue.value = ''
}

// Duplicate session
const duplicateSession = (session: Session) => {
  if (isDemo.value) {
    const newSession: Session = {
      ...session,
      id: `demo-session-${Date.now()}`,
      title: `${session.title} (${t('agent.sessionManager.copy', '复制')})`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    sessions.value.unshift(newSession)
    notifySuccess(t('agent.sessionManager.duplicateSuccess', '会话复制成功'))
    return
  }

  // Real implementation
}

// Delete session
const deleteSession = (session: Session) => {
  if (sessions.value.length <= 1) {
    notifyWarning(t('agent.sessionManager.atLeastOne', '至少需要保留一个会话'))
    return
  }

  if (isDemo.value) {
    sessions.value = sessions.value.filter((s) => s.id !== session.id)
    if (activeSessionId.value === session.id) {
      activeSessionId.value = sessions.value[0]?.id || null
    }
    notifySuccess(t('agent.sessionManager.deleteSuccess', '会话已删除'))
    return
  }

  // Real implementation would show confirmation dialog
}

// Initialize
onMounted(() => {
  if (isDemo.value) {
    loadDemoData()
  } else {
    // Real implementation would load from store/API
  }
})
</script>

<style scoped>
.agent-session-manager {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 16px;
  box-sizing: border-box;
}

.manager-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--el-border-color-light);
}

.title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.sessions-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.session-card {
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid var(--el-border-color-light);
}

.session-card:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.session-card.active {
  border-color: var(--el-color-primary);
  background-color: rgba(64, 158, 255, 0.05);
}

.session-info {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.session-main {
  flex: 1;
  min-width: 0;
}

.session-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.session-icon {
  color: var(--el-color-primary);
  flex-shrink: 0;
}

.session-title {
  font-weight: 500;
  color: var(--el-text-color-primary);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-description {
  margin: 4px 0 8px 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-meta {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.session-actions {
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.session-card:hover .session-actions {
  opacity: 1;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--el-text-color-secondary);
}

.empty-icon {
  color: var(--el-text-color-placeholder);
}

.empty-text {
  font-size: 14px;
  margin: 0;
}

/* Dark mode adjustments */
@media (prefers-color-scheme: dark) {
  .session-card.active {
    background-color: rgba(64, 158, 255, 0.1);
  }

  .session-card:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }
}
</style>
