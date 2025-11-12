<template>
  <div :class="['agent-message', alignmentClass]">
    <div class="agent-message__body" :style="bubbleStyle">
      <header class="agent-message__meta">
        <span class="role">{{ roleLabel }}</span>
        <small>{{ formatTimestamp(message.timestamp) }}</small>
      </header>

      <component
        v-if="message.type === 'tool'"
        :is="AgentToolResultCard"
        :message="message"
      />

      <div v-else class="agent-message__content">
        <MdPreview
          v-if="messageMarkdown"
          :modelValue="messageMarkdown"
          previewTheme="github"
          :codeFold="false"
          :autoFoldThreshold="300"
          :style="{
            color: themeState.currentTheme.textColor
          }"
          :class="themeState.currentTheme.mdeditorClass"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { MdPreview } from 'md-editor-v3'
import { useI18n } from 'vue-i18n'
import type { AgentMessage } from '../../types/agent'
import AgentToolResultCard from './AgentToolResultCard.vue'
import { themeState } from '../../utils/themes'
import { dayjs } from 'element-plus'

const props = defineProps<{
  message: AgentMessage
}>()

const { t } = useI18n()

const alignmentClass = computed(() => {
  if (props.message.role === 'user') return 'align-right'
  return 'align-left'
})

const bubbleStyle = computed(() => {
  const currentTheme = themeState.currentTheme as Record<string, any>
  const primarySubtle = currentTheme.primarySubtle as string | undefined
  if (props.message.role === 'user') {
    return {
      backgroundColor: primarySubtle ?? 'rgba(64, 158, 255, 0.12)',
      borderColor: 'rgba(64, 158, 255, 0.45)',
      color: themeState.currentTheme.textColor
    }
  }
  if (props.message.type === 'tool') {
    return {
      backgroundColor: themeState.currentTheme.background2nd,
      borderColor: 'rgba(103, 194, 58, 0.3)',
      color: themeState.currentTheme.textColor
    }
  }
  return {
    backgroundColor: themeState.currentTheme.background2nd,
    borderColor: 'rgba(0,0,0,0.08)',
    color: themeState.currentTheme.textColor
  }
})

const roleLabel = computed(() => {
  switch (props.message.role) {
    case 'user':
      return t('agent.roles.user')
    case 'assistant':
      return t('agent.roles.assistant')
    case 'tool':
      return props.message.type === 'tool' ? props.message.tool.name : t('agent.roles.tool')
    case 'system':
      return t('agent.roles.system')
    default:
      return props.message.role
  }
})

const messageMarkdown = computed(() => {
  if (props.message.type === 'chat' || props.message.type === 'thought') {
    return props.message.markdown
  }
  return ''
})

const formatTimestamp = (timestamp: string) => {
  return dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss')
}
</script>

<style scoped>
.agent-message {
  display: flex;
  width: 100%;
  margin-bottom: 18px;
}

.agent-message.align-right {
  justify-content: flex-end;
}

.agent-message.align-left {
  justify-content: flex-start;
}

.agent-message__body {
  max-width: 720px;
  border: 1px solid transparent;
  border-radius: 14px;
  padding: 16px 18px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
  transition: transform 0.15s ease, box-shadow 0.2s ease;
}

.agent-message__body:hover {
  transform: translateY(-1px);
  box-shadow: 0 12px 26px rgba(0, 0, 0, 0.12);
}

.agent-message__meta {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 12px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.75;
}

.agent-message__content :deep(pre) {
  background: rgba(0, 0, 0, 0.05);
  border-radius: 8px;
  padding: 12px;
}
</style>

