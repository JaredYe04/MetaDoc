<template>
  <AgentToolResultSimple :message="message" :compact="compact" />
</template>

<script setup lang="ts">
import type { AgentMessage, ToolAgentMessage } from '../../types/agent'
import AgentToolResultSimple from './AgentToolResultSimple.vue'

withDefaults(
  defineProps<{
    message: ToolAgentMessage
    messages?: AgentMessage[]
    messageIndex?: number
    compact?: boolean
  }>(),
  { compact: false }
)
</script>
