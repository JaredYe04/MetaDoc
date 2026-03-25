<template>
  <DropdownMenuItem @select="emit('command', 'tool-collection')">
    {{ t('agent.manage.toolCollection.title') }}
  </DropdownMenuItem>
  <DropdownMenuItem @select="emit('command', 'agent-capabilities-rules')">
    {{ t('agent.manage.capabilities.menuRules') }}
  </DropdownMenuItem>
  <DropdownMenuItem @select="emit('command', 'agent-capabilities-skills')">
    {{ t('agent.manage.capabilities.menuSkills') }}
  </DropdownMenuItem>
  <DropdownMenuItem @select="emit('command', 'agent-capabilities-mcp')">
    {{ t('agent.manage.capabilities.menuMcp') }}
  </DropdownMenuItem>
  <DropdownMenuSeparator />
  <DropdownMenuItem @select="emit('command', 'import-session')">
    {{ t('agent.sessions.import') }}
  </DropdownMenuItem>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { DropdownMenuItem, DropdownMenuSeparator } from '@renderer/components/ui/dropdown-menu'

const { t } = useI18n()

const emit = defineEmits<{
  command: [cmd: string]
}>()
</script>
