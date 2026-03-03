<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <DialogContent class="max-w-lg" :on-escape-key-down="preventClose" :on-pointer-down-outside="preventClose">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <el-icon class="warning-icon text-[var(--el-color-warning)]"><WarningFilled /></el-icon>
          {{ t('agent.display.terminalExecution.approvalTitle') }}
        </DialogTitle>
        <DialogDescription>
          {{ t('agent.display.terminalExecution.commandToExecute') }}
        </DialogDescription>
      </DialogHeader>
      <div class="space-y-4 py-2">
        <pre class="rounded-md bg-muted p-3 text-sm overflow-x-auto whitespace-pre-wrap break-all font-mono">{{ pendingCommand }}</pre>
        <div class="flex items-center gap-2">
          <Checkbox :checked="trustMode" @update:checked="trustMode = $event" />
          <span class="text-sm">{{ t('agent.display.terminalExecution.trustMode') }}</span>
        </div>
      </div>
      <DialogFooter class="gap-2 sm:gap-0">
        <Button variant="outline" @click="handleReject">
          {{ t('agent.display.terminalExecution.reject') }}
        </Button>
        <Button @click="handleApprove">
          {{ trustMode ? t('agent.display.terminalExecution.approveWithTrust') : t('agent.display.terminalExecution.approve') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { WarningFilled } from '@element-plus/icons-vue'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import eventBus from '../../utils/event-bus'

const { t } = useI18n()

const open = ref(false)
const pendingCommand = ref('')
const trustMode = ref(false)

const EVENT_SHOW = 'terminal-approval-show-dialog'

function preventClose() {
  // 不允许按 Esc 或点击外部关闭，必须点批准或拒绝
  return false
}

function handleOpenChange(value: boolean) {
  open.value = value
  if (!value) {
    pendingCommand.value = ''
  }
}

function handleApprove() {
  const cmd = pendingCommand.value
  if (!cmd) return
  eventBus.emit('terminal-command-approved', { command: cmd, trustMode: trustMode.value })
  open.value = false
  pendingCommand.value = ''
}

function handleReject() {
  const cmd = pendingCommand.value
  if (!cmd) return
  eventBus.emit('terminal-command-rejected', { command: cmd })
  open.value = false
  pendingCommand.value = ''
}

function onShow(payload: { command: string }) {
  const command = payload?.command ?? ''
  pendingCommand.value = command
  trustMode.value = false
  open.value = true
}

onMounted(() => {
  eventBus.on(EVENT_SHOW, onShow)
})

onBeforeUnmount(() => {
  eventBus.off(EVENT_SHOW, onShow)
})
</script>
