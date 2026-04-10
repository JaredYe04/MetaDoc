<template>
  <Dialog
    v-model:open="visible"
    :modal="true"
    class="profile-dialog-wrapper"
    :close-on-escape="false"
    :close-on-interact-outside="false"
  >
    <DialogContent class="max-w-[900px] w-[90vw]" @interact-outside="(e) => e.preventDefault()">
      <DialogHeader>
        <DialogTitle>{{ $t('userManual.profile.title') }}</DialogTitle>
      </DialogHeader>

      <UserProfileWizardSteps
        ref="stepsRef"
        :show-skip-button="true"
        @submitted="onSubmitted"
        @cancelled="onCancelled"
      />
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@renderer/components/ui/dialog'
import UserProfileWizardSteps from './UserProfileWizardSteps.vue'
import type { UserProfile } from '../../stores/userManual'

const visible = ref(false)
const stepsRef = ref<InstanceType<typeof UserProfileWizardSteps> | null>(null)

const emit = defineEmits<{
  submitted: [profile: UserProfile]
  cancelled: []
}>()

const open = () => {
  visible.value = true
  stepsRef.value?.open()
}

const onSubmitted = (profile: UserProfile) => {
  visible.value = false
  emit('submitted', profile)
}

const onCancelled = () => {
  visible.value = false
  emit('cancelled')
}

defineExpose({
  open
})
</script>

<style scoped>
.profile-dialog-wrapper :deep(.dialog-footer) {
  border-top: none;
  margin-top: 0;
  padding-top: 8px;
}
</style>
