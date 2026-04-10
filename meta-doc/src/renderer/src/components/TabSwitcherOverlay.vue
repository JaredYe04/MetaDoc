<template>
  <Teleport to="body">
    <Transition name="switcher-fade">
      <div
        v-show="isVisible && !isCapturing"
        class="tab-switcher-overlay"
        @click.self="confirmSelection"
      >
        <!-- 标签列表（左侧面板） -->
        <div class="switcher-panel">
          <div class="tab-list">
            <div class="tab-list-header">{{ $t('tabSwitcher.openEditors', '打开的编辑器') }}</div>
            <div class="tab-list-scroll">
              <div
                v-for="(tab, index) in orderedTabs"
                :key="tab.id"
                class="tab-item"
                :class="{ 'is-selected': index === selectedIndex }"
                @click="selectAndConfirm(index)"
                @mouseenter="selectedIndex = index"
              >
                <div class="tab-icon">
                  <span v-if="tab.kind === 'tool'">🛠️</span>
                  <span v-else-if="tab.kind === 'system'">🏠</span>
                  <span v-else-if="tab.format === 'tex'" class="format-badge">TeX</span>
                  <span v-else-if="tab.format === 'md'" class="format-badge">MD</span>
                  <span v-else-if="tab.format === 'txt'" class="format-badge">TXT</span>
                  <span v-else>📄</span>
                </div>
                <div class="tab-info">
                  <div class="tab-title">
                    {{ tab.title || $t('tabSwitcher.untitledDocument', '未命名文档') }}
                    <span v-if="tab.dirty" class="dirty-dot" />
                  </div>
                  <div v-if="tab.subtitle" class="tab-path">{{ tab.subtitle }}</div>
                </div>
              </div>
            </div>
          </div>
          <!-- 胶卷缩略图区域 -->
          <div class="filmstrip-container">
            <div class="filmstrip-track" :style="filmstripTransform">
              <div
                v-for="(tab, index) in orderedTabs"
                :key="tab.id"
                class="filmstrip-frame"
                :class="{ 'is-active': index === selectedIndex }"
                @click="selectAndConfirm(index)"
              >
                <div class="frame-label">
                  {{ tab.title || $t('tabSwitcher.untitledDocument', '未命名文档') }}
                </div>
                <div class="frame-thumbnail">
                  <img v-if="thumbnailCache[tab.id]" :src="thumbnailCache[tab.id]" alt="" />
                  <div v-else class="frame-placeholder">
                    <span class="placeholder-icon">{{ getPlaceholderIcon(tab) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useTabSwitcher } from '../composables/useTabSwitcher'
import type { WorkspaceTab } from '../stores/workspace'
const {
  isVisible,
  isCapturing,
  orderedTabs,
  selectedIndex,
  thumbnailCache,
  selectAndConfirm,
  confirmSelection
} = useTabSwitcher()

const getPlaceholderIcon = (tab: WorkspaceTab) => {
  if (tab.kind === 'tool') return '🛠️'
  if (tab.kind === 'system') return '🏠'
  if (tab.format === 'tex') return 'TeX'
  if (tab.format === 'md') return 'MD'
  return '📄'
}

const filmstripTransform = computed(() => {
  const frameWidth = 220 // 200px frame + 20px gap
  // Center the selected frame
  const containerWidth = 660 // shows ~3 frames
  const offset = containerWidth / 2 - frameWidth / 2 - selectedIndex.value * frameWidth
  return { transform: `translateX(${offset}px)` }
})
</script>

<style scoped>
.tab-switcher-overlay {
  position: fixed;
  top: 34px;
  left: 0;
  width: 100vw;
  height: calc(100vh - 34px);
  background-color: rgba(0, 0, 0, 0.4);
  z-index: 9999;
  display: flex;
  justify-content: center;
  align-items: center;
  backdrop-filter: blur(2px);
}

.switcher-panel {
  display: flex;
  max-width: 960px;
  width: 90vw;
  height: 400px;
  background-color: var(--el-bg-color);
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.2);
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
}

.tab-list {
  width: 280px;
  min-width: 280px;
  background-color: var(--el-bg-color-overlay);
  border-right: 1px solid var(--el-border-color-lighter);
  display: flex;
  flex-direction: column;
}

.tab-list-header {
  padding: 10px 16px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
}

.tab-list-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
}

.tab-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 2px;
  transition: background-color 0.1s;
}

.tab-item:hover {
  background-color: var(--el-fill-color-light);
}

.tab-item.is-selected {
  background-color: var(--el-color-primary-light-9);
  border-left: 3px solid var(--el-color-primary);
  padding-left: 9px;
}

.tab-icon {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 10px;
  font-size: 14px;
  color: var(--el-text-color-regular);
  flex-shrink: 0;
}

.format-badge {
  font-size: 10px;
  font-weight: 700;
  font-family: monospace;
  color: var(--el-text-color-secondary);
}

.tab-info {
  flex: 1;
  min-width: 0;
}

.tab-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  gap: 6px;
}

.dirty-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--el-color-warning);
  flex-shrink: 0;
}

.tab-path {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}

.filmstrip-container {
  flex: 1;
  overflow: hidden;
  background-color: var(--el-bg-color);
  display: flex;
  align-items: center;
  position: relative;
}

.filmstrip-track {
  display: flex;
  align-items: center;
  padding-left: 0;
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  will-change: transform;
}

.filmstrip-frame {
  width: 200px;
  height: 150px;
  margin-right: 20px;
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);
  background-color: hsl(var(--panel-bg, 0 0% 96%));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-shrink: 0;
  cursor: pointer;
  transition:
    transform 0.25s ease,
    border-color 0.25s ease,
    box-shadow 0.25s ease;
  position: relative;
}

.filmstrip-frame.is-active {
  transform: scale(1.05);
  border-color: var(--el-color-primary);
  box-shadow: 0 4px 12px rgba(var(--el-color-primary-rgb), 0.2);
  z-index: 2;
}

.frame-label {
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background-color: var(--el-bg-color-overlay);
  border-bottom: 1px solid var(--el-border-color-lighter);
  text-align: center;
}

.frame-thumbnail {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--el-fill-color-darker);
  overflow: hidden;
}

.frame-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.frame-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.placeholder-icon {
  font-size: 32px;
  opacity: 0.5;
}

.switcher-fade-enter-active,
.switcher-fade-leave-active {
  transition: opacity 0.15s ease;
}

.switcher-fade-enter-active .switcher-panel {
  transition: transform 0.15s ease;
}

.switcher-fade-leave-active .switcher-panel {
  transition: transform 0.1s ease;
}

.switcher-fade-enter-from,
.switcher-fade-leave-to {
  opacity: 0;
}

.switcher-fade-enter-from .switcher-panel {
  transform: scale(0.95);
}

.switcher-fade-leave-to .switcher-panel {
  transform: scale(0.98);
}
</style>
