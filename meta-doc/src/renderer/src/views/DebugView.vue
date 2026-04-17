<template>
  <div
    class="debug-view-container"
    :style="{
      backgroundColor: themeState.currentTheme.background,
      color: themeState.currentTheme.textColor
    }"
  >
    <ScrollArea class="debug-scrollbar h-full">
      <div class="debug-content-wrapper">
        <DebugAiPipelineSwitch />
        <SettingDebugSection />
      </div>
      <ScrollBar />
    </ScrollArea>
  </div>
</template>

<script setup lang="ts">
import { themeState } from '../utils/themes'
import SettingDebugSection from './setting/SettingDebugSection.vue'
import DebugAiPipelineSwitch from '../components/debug/DebugAiPipelineSwitch.vue'
import { ScrollArea, ScrollBar } from '@renderer/components/ui/scroll-area'
</script>

<style scoped>
.debug-view-container {
  height: 100vh;
  width: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.debug-scrollbar {
  flex: 1;
  height: 100%;
  width: 100%;
  min-height: 0;
}

.debug-content-wrapper {
  min-height: 100%;
  width: 100%;
}

/* 让 SettingDebugSection 在 DebugView 中可以根据内容自适应高度 */
.debug-content-wrapper :deep(.debug-section) {
  height: auto;
  min-height: 100%;
}
</style>
