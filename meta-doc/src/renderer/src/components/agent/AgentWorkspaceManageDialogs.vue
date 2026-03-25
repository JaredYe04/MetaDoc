<template>
  <Dialog
    :open="showManageDialog"
    @update:open="
      (open) => {
        if (!open) manageUi.closeManageDialog()
      }
    "
  >
    <DialogContent class="sm:max-w-[90%]" :style="dialogStyle">
      <DialogHeader>
        <DialogTitle>{{ manageDialogTitle }}</DialogTitle>
      </DialogHeader>
      <ToolCollectionManager v-if="manageDialogType === 'tool-collection'" />
      <AgentConfigManager v-else-if="manageDialogType === 'agent-config'" />
      <AgentEngineManager v-else-if="manageDialogType === 'agent-engine'" />
      <AgentCapabilitiesManager
        v-else-if="isAgentCapabilitiesManageDialog"
        :key="manageDialogType ?? ''"
        :initial-panel="agentCapabilitiesInitialPanel"
        @request-agent-draft="onCapabilitiesRequestAgentDraft"
      />
      <DialogFooter>
        <Button variant="ghost" @click="manageUi.closeManageDialog()">{{
          t('common.close')
        }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useAgentManageUiStore } from '../../stores/agent-manage-ui-store'
import { themeState } from '../../utils/themes'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import ToolCollectionManager from './manage/ToolCollectionManager.vue'
import AgentConfigManager from './manage/AgentConfigManager.vue'
import AgentEngineManager from './manage/AgentEngineManager.vue'
import AgentCapabilitiesManager from './manage/AgentCapabilitiesManager.vue'

const { t } = useI18n()
const manageUi = useAgentManageUiStore()
const { showManageDialog, manageDialogType } = storeToRefs(manageUi)

const dialogStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

const isAgentCapabilitiesManageDialog = computed(
  () =>
    manageDialogType.value === 'agent-capabilities-rules' ||
    manageDialogType.value === 'agent-capabilities-skills' ||
    manageDialogType.value === 'agent-capabilities-mcp'
)

const agentCapabilitiesInitialPanel = computed<'rules' | 'skills' | 'mcp'>(() => {
  if (manageDialogType.value === 'agent-capabilities-rules') return 'rules'
  if (manageDialogType.value === 'agent-capabilities-skills') return 'skills'
  return 'mcp'
})

const manageDialogTitle = computed(() => {
  const d = manageDialogType.value
  if (d === 'tool-collection') return t('agent.manage.toolCollection.title')
  if (d === 'agent-engine') return t('agent.manage.agentEngine.title')
  if (d === 'agent-config') return t('agent.manage.agentConfig.title')
  if (d === 'agent-capabilities-rules') return t('agent.manage.capabilities.titleRules')
  if (d === 'agent-capabilities-skills') return t('agent.manage.capabilities.titleSkills')
  if (d === 'agent-capabilities-mcp') return t('agent.manage.capabilities.titleMcp')
  return ''
})

function onCapabilitiesRequestAgentDraft(payload: {
  draft: string
  sessionTitle: string
  focusAgentTab: boolean
}) {
  manageUi.requestAgentDraftFromCapabilities(payload)
}
</script>
