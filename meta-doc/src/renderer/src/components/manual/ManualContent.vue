<template>
  <div class="manual-content">
    <el-scrollbar class="content-scrollbar">
      <div class="content-wrapper">
        <div v-if="content && content.trim()" class="markdown-wrapper">
          <VditorPreview
            :markdown="content"
            :key="`content-${currentSection}-${locale}`"
            class="markdown-preview"
          />
        </div>
        <div v-else class="empty-content">
          <el-empty :description="$t('userManual.emptyContent')" />
        </div>
      </div>
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUserManual } from '../../stores/userManual'
import VditorPreview from '../VditorPreview.vue'

const { t, locale } = useI18n()
const { getCurrentSectionContent, currentSection } = useUserManual()

const content = computed(() => {
  const c = getCurrentSectionContent.value
  console.log('ManualContent - currentSection:', currentSection.value, 'content长度:', c?.length || 0, '内容预览:', c?.substring(0, 50) || '空')
  return c
})

// 监听语言和章节变化，确保内容更新
watch([locale, currentSection], () => {
  console.log('ManualContent watch - locale或section变化')
})
</script>

<style scoped>
.manual-content {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: v-bind('themeState.currentTheme.background');
}

.content-scrollbar {
  flex: 1;
  height: 100%;
}

.content-wrapper {
  min-height: 100%;
  padding: 24px;
  max-width: 900px;
  margin: 0 auto;
}

.markdown-wrapper {
  width: 100%;
}

.markdown-preview {
  width: 100%;
  min-height: 200px;
}

.empty-content {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 400px;
}
</style>

<script lang="ts">
import { themeState } from '../../utils/themes'
export { themeState }
</script>
