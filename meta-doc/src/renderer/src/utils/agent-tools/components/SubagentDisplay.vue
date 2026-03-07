<template>
  <div class="subagent-display" :class="{ 'subagent-display--compact': compact }">
    <Collapsible v-model:open="open" class="subagent-collapsible">
      <CollapsibleTrigger class="subagent-trigger">
        <ChevronRight v-if="!open" class="subagent-chevron" />
        <ChevronDown v-else class="subagent-chevron" />
        <span class="subagent-label">{{ label }}</span>
        <Badge v-if="messageCount > 0" variant="secondary" size="small" class="subagent-badge">
          {{ messageCount }} {{ $t('agent.display.subagent.messages', '条消息') }}
        </Badge>
      </CollapsibleTrigger>
      <CollapsibleContent class="subagent-content">
        <div v-if="subagentMessages && subagentMessages.length" class="subagent-messages">
          <div
            v-for="(msg, idx) in subagentMessages"
            :key="msg.id || idx"
            class="subagent-msg"
            :class="`subagent-msg--${msg.role}`"
          >
            <span class="subagent-msg-role">{{ roleLabel(msg.role) }}</span>
            <div class="subagent-msg-body">
              <template v-if="msg.type === 'tool'">
                <span class="subagent-msg-tool-name">{{ (msg as any).tool?.name || (msg as any).tool?.id }}</span>
                <Badge size="small" :type="getToolStatusType((msg as any).status)">
                  {{ (msg as any).status }}
                </Badge>
              </template>
              <template v-else>
                {{ preview((msg as any).markdown || (msg as any).content || '') }}
              </template>
            </div>
          </div>
        </div>
        <div v-if="resultText" class="subagent-result">
          <div class="subagent-result-label">{{ $t('agent.display.subagent.result', '返回结果') }}</div>
          <div class="subagent-result-text">{{ resultText }}</div>
        </div>
        <div v-else-if="!subagentMessages?.length" class="subagent-empty">
          <template v-if="status === 'running' || status === 'pending'">
            <el-icon class="is-loading"><Loading /></el-icon>
            {{ $t('agent.display.subagent.running', '执行中...') }}
          </template>
          <template v-else>{{ $t('agent.display.subagent.noMessages', '无消息') }}</template>
        </div>
      </CollapsibleContent>
    </Collapsible>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@renderer/components/ui/collapsible'
import { Badge } from '@renderer/components/ui/badge'
import { ChevronRight, ChevronDown } from 'lucide-vue-next'
import { Loading } from '@element-plus/icons-vue'
import type { AgentMessage } from '../../../types/agent'

const props = withDefaults(
  defineProps<{
    data?: { subagentMessages?: AgentMessage[]; result?: string }
    status?: string
    compact?: boolean
  }>(),
  { compact: false }
)

const { t } = useI18n()
const open = ref(!props.compact)

const subagentMessages = computed(() => props.data?.subagentMessages ?? [])
const resultText = computed(() => props.data?.result ?? '')
const messageCount = computed(() => subagentMessages.value.length)
const label = computed(() => t('agent.display.subagent.title', 'Subagent'))

function roleLabel(role: string) {
  if (role === 'user') return t('agent.display.subagent.roleUser', '用户')
  if (role === 'assistant') return t('agent.display.subagent.roleAssistant', '助手')
  if (role === 'tool') return t('agent.display.subagent.roleTool', '工具')
  return role
}

function preview(text: string, max = 120) {
  if (!text || typeof text !== 'string') return ''
  const s = text.trim()
  if (s.length <= max) return s
  return s.slice(0, max) + '…'
}

function getToolStatusType(status: string) {
  if (status === 'succeeded') return 'success'
  if (status === 'failed') return 'danger'
  return 'info'
}
</script>

<style scoped>
.subagent-display {
  width: 100%;
  font-size: 12px;
}

.subagent-display--compact .subagent-trigger {
  padding: 6px 8px;
}

.subagent-collapsible {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  overflow: hidden;
}

.subagent-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  width: 100%;
  text-align: left;
  background: var(--el-fill-color-light);
  cursor: pointer;
}

.subagent-chevron {
  width: 14px;
  height: 14px;
  opacity: 0.7;
}

.subagent-label {
  font-weight: 600;
  flex: 1;
}

.subagent-badge {
  margin-left: auto;
}

.subagent-content {
  padding: 8px 10px;
  background: var(--el-fill-color-blank);
  border-top: 1px solid var(--el-border-color-lighter);
}

.subagent-messages {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 8px;
}

.subagent-msg {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.subagent-msg-role {
  flex-shrink: 0;
  font-weight: 500;
  min-width: 48px;
}

.subagent-msg--user .subagent-msg-role { color: var(--el-color-primary); }
.subagent-msg--assistant .subagent-msg-role { color: var(--el-color-success); }
.subagent-msg--tool .subagent-msg-role { color: var(--el-color-info); }

.subagent-msg-body {
  flex: 1;
  word-break: break-word;
  white-space: pre-wrap;
  max-height: 80px;
  overflow: auto;
}

.subagent-msg-tool-name {
  margin-right: 6px;
}

.subagent-result-label {
  font-weight: 600;
  margin-bottom: 4px;
}

.subagent-result-text {
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow: auto;
  padding: 6px 8px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
}

.subagent-empty {
  color: var(--el-text-color-secondary);
  font-style: italic;
}
</style>
