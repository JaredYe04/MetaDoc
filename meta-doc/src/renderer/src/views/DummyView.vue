<template>
  <div class="dummy-view">
    <el-empty :description="t('dummyView.emptyDescription')" />
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<style scoped>
.dummy-view {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--el-bg-color, #ffffff);
}
</style>

