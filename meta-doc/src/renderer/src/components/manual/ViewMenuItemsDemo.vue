<template>
  <div class="view-menu-items-demo" :class="{ 'is-collapsed': collapsed }">
    <UIMenu
      class="modern-side-menu sub-view-menu"
      :collapse="collapsed"
      :background-color="themeState.currentTheme.background"
      :text-color="themeState.currentTheme.SideTextColor"
    >
      <UIMenuItem
        v-if="items.includes('home')"
        :tooltip="collapsed ? $t('headMenu.home') : ''"
        :icon-image="themeState.currentTheme.HomeIcon"
        :label="collapsed ? '' : $t('headMenu.home')"
        :class="{ 'is-active': activeMenuIndex === 'home' }"
        @click="handleSelect('home')"
      />

      <UIMenuItem
        v-if="items.includes('editor')"
        :tooltip="collapsed ? $t('headMenu.editor') : ''"
        :icon-image="themeState.currentTheme.EditorIcon"
        :label="collapsed ? '' : $t('headMenu.editor')"
        :class="{ 'is-active': activeMenuIndex === 'editor' }"
        @click="handleSelect('editor')"
      />

      <UIMenuItem
        v-if="items.includes('outline')"
        :tooltip="collapsed ? $t('headMenu.outline') : ''"
        :icon-image="themeState.currentTheme.OutlineIcon"
        :label="collapsed ? '' : $t('headMenu.outline')"
        :class="{ 'is-active': activeMenuIndex === 'outline' }"
        @click="handleSelect('outline')"
      />

      <UIMenuItem
        v-if="items.includes('agent')"
        :tooltip="collapsed ? $t('headMenu.agent') : ''"
        :icon-image="themeState.currentTheme.AgentIcon"
        :label="collapsed ? '' : $t('headMenu.agent')"
        :class="{ 'is-active': activeMenuIndex === 'agent' }"
        @click="handleSelect('agent')"
      />
    </UIMenu>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { themeState, mixColors } from '../../utils/themes'
import UIMenu from '../ui/UIMenu.vue'
import UIMenuItem from '../ui/UIMenuItem.vue'

const props = withDefaults(
  defineProps<{
    items: string[]
    collapsed?: boolean
    activeMenuIndex?: string
    mode?: 'normal' | 'demo'
  }>(),
  {
    items: () => [],
    collapsed: false,
    activeMenuIndex: '',
    mode: 'demo'
  }
)

const emit = defineEmits<{
  (e: 'select', index: string): void
}>()

const { t } = useI18n()

// 计算选中状态的背景色
const activeBackgroundColor = computed(() =>
  mixColors(themeState.currentTheme.background2nd, themeState.currentTheme.textColor, 0.3)
)
const activeTextColor = computed(() => themeState.currentTheme.textColor)

const handleSelect = (index: string): void => {
  emit('select', index)
}
</script>

<style scoped>
.view-menu-items-demo {
  display: inline-block;
  width: 100%;
  max-width: 200px;
}

/* 激活状态样式 */
.view-menu-items-demo :deep(.ui-menu-item.is-active) {
  background-color: v-bind('activeBackgroundColor') !important;
  color: v-bind('activeTextColor') !important;
  border-radius: 6px !important;
}

/* 确保 hover 状态也有圆角 */
.view-menu-items-demo :deep(.ui-menu-item:hover) {
  border-radius: 6px !important;
}

/* 图标容器 */
.view-menu-items-demo :deep(.icon-wrapper),
.view-menu-items-demo :deep(.ui-menu-item__icon-image) {
  width: 20px;
  height: 20px;
}

.view-menu-items-demo :deep(.icon-wrapper) {
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 覆盖 UIMenuItem 默认的 icon 大小 */
.view-menu-items-demo :deep(.ui-menu-item__icon-image) {
  width: 20px;
  height: 20px;
}

/* 组件特定的菜单样式 */
.view-menu-items-demo :deep(.ui-menu) {
  height: auto;
  min-height: unset;
}

.view-menu-items-demo :deep(.ui-menu:not(.is-collapsed)) {
  width: 120px;
  min-height: unset;
}

@media (max-width: 768px) {
  .view-menu-items-demo :deep(.ui-menu:not(.is-collapsed)) {
    width: 120px;
  }
}
</style>
