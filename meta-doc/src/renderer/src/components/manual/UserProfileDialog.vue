<template>
  <el-dialog
    v-model="visible"
    :title="$t('userManual.profile.title')"
    width="700px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    append-to-body
  >
    <div class="profile-form">
      <el-form :model="form" label-width="140px">
        <el-form-item :label="$t('userManual.profile.scenario')">
          <el-radio-group v-model="form.scenario" class="radio-button-group">
            <el-radio-button label="student">{{ $t('userManual.profile.scenarios.student') }}</el-radio-button>
            <el-radio-button label="researcher">{{ $t('userManual.profile.scenarios.researcher') }}</el-radio-button>
            <el-radio-button label="it">{{ $t('userManual.profile.scenarios.it') }}</el-radio-button>
            <el-radio-button label="office">{{ $t('userManual.profile.scenarios.office') }}</el-radio-button>
            <el-radio-button label="other">{{ $t('userManual.profile.scenarios.other') }}</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item :label="$t('userManual.profile.markdownLevel')">
          <el-radio-group v-model="form.markdownLevel" class="radio-button-group">
            <el-radio-button :label="0">{{ $t('userManual.profile.levels.none') }}</el-radio-button>
            <el-radio-button :label="1">{{ $t('userManual.profile.levels.basic') }}</el-radio-button>
            <el-radio-button :label="2">{{ $t('userManual.profile.levels.intermediate') }}</el-radio-button>
            <el-radio-button :label="3">{{ $t('userManual.profile.levels.advanced') }}</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item :label="$t('userManual.profile.latexLevel')">
          <el-radio-group v-model="form.latexLevel" class="radio-button-group">
            <el-radio-button :label="0">{{ $t('userManual.profile.levels.none') }}</el-radio-button>
            <el-radio-button :label="1">{{ $t('userManual.profile.levels.basic') }}</el-radio-button>
            <el-radio-button :label="2">{{ $t('userManual.profile.levels.intermediate') }}</el-radio-button>
            <el-radio-button :label="3">{{ $t('userManual.profile.levels.advanced') }}</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item :label="$t('userManual.profile.knowsAgent')">
          <el-radio-group v-model="form.knowsAgent" class="radio-button-group">
            <el-radio-button :label="true">{{ $t('userManual.profile.yes') }}</el-radio-button>
            <el-radio-button :label="false">{{ $t('userManual.profile.no') }}</el-radio-button>
          </el-radio-group>
        </el-form-item>
      </el-form>
    </div>

    <template #footer>
      <el-button @click="handleCancel">{{ $t('userManual.profile.skip') }}</el-button>
      <el-button type="primary" @click="handleSubmit">{{ $t('userManual.profile.submit') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { saveUserProfile } from '../../utils/user-profile'
import { useUserManual } from '../../stores/userManual'
import type { UserProfile } from '../../stores/userManual'

const { t } = useI18n()
const { setUserProfile } = useUserManual()

const visible = ref(false)

const form = reactive<Partial<UserProfile>>({
  scenario: undefined,
  markdownLevel: undefined,
  latexLevel: undefined,
  knowsAgent: undefined
})

const emit = defineEmits<{
  submitted: [profile: UserProfile]
  cancelled: []
}>()

const open = () => {
  visible.value = true
  // 重置表单
  form.scenario = undefined
  form.markdownLevel = undefined
  form.latexLevel = undefined
  form.knowsAgent = undefined
}

const handleSubmit = async () => {
  const profile: UserProfile = {
    scenario: form.scenario || 'other',
    markdownLevel: form.markdownLevel ?? 0,
    latexLevel: form.latexLevel ?? 0,
    knowsAgent: form.knowsAgent ?? false
  }

  try {
    await saveUserProfile(profile)
    setUserProfile(profile)
    visible.value = false
    emit('submitted', profile)
  } catch (error) {
    console.error('保存用户画像失败:', error)
  }
}

const handleCancel = () => {
  visible.value = false
  emit('cancelled')
}

defineExpose({
  open
})
</script>

<style scoped>
.profile-form {
  padding: 20px 0;
}

.profile-form :deep(.el-form-item) {
  margin-bottom: 24px;
}

.profile-form :deep(.radio-button-group) {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  width: 100%;
}

.profile-form :deep(.radio-button-group .el-radio-button) {
  flex: 1;
  min-width: 0;
  margin-right: 0;
}

.profile-form :deep(.radio-button-group .el-radio-button:not(:first-child)) {
  margin-left: -1px;
}

.profile-form :deep(.radio-button-group .el-radio-button:not(:first-child) .el-radio-button__inner) {
  border-left: none;
  margin-left: 0;
}

.profile-form :deep(.radio-button-group .el-radio-button:first-child .el-radio-button__inner) {
  border-top-left-radius: 4px;
  border-bottom-left-radius: 4px;
}

.profile-form :deep(.radio-button-group .el-radio-button:last-child .el-radio-button__inner) {
  border-top-right-radius: 4px;
  border-bottom-right-radius: 4px;
}

.profile-form :deep(.radio-button-group .el-radio-button__inner) {
  width: 100%;
  padding: 8px 16px;
  text-align: center;
  border-radius: 0;
}

.profile-form :deep(.radio-button-group .el-radio-button.is-active .el-radio-button__inner) {
  z-index: 1;
}
</style>
