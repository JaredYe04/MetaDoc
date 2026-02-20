<template>
  <div class="view-menu-items-demo" :class="{ 'is-collapsed': collapsed }">
    <el-menu
      :class="[
        'modern-side-menu',
        'sub-view-menu',
        { 'is-collapsed': collapsed }
      ]"
      mode="vertical"
      menu-trigger="hover"
      :default-active="activeMenuIndex"
      :background-color="themeState.currentTheme.background"
      :text-color="themeState.currentTheme.SideTextColor"
      :active-text-color="themeState.currentTheme.SideTextColor"
    >
      <el-tooltip
        v-if="collapsed && items.includes('home')"
        :content="$t('headMenu.home')"
        placement="right"
      >
        <el-menu-item index="home">
          <div class="icon-wrapper">
            <img :src="themeState.currentTheme.HomeIcon" class="menu-icon" alt="home" />
          </div>
        </el-menu-item>
      </el-tooltip>
      <el-menu-item v-if="!collapsed && items.includes('home')" index="home">
        <div class="icon-wrapper">
          <img :src="themeState.currentTheme.HomeIcon" class="menu-icon" alt="home" />
        </div>
        <span>{{ $t('headMenu.home') }}</span>
      </el-menu-item>

      <el-tooltip
        v-if="collapsed && items.includes('editor')"
        :content="$t('headMenu.editor')"
        placement="right"
      >
        <el-menu-item index="editor">
          <div class="icon-wrapper">
            <img :src="themeState.currentTheme.EditorIcon" class="menu-icon" alt="editor" />
          </div>
        </el-menu-item>
      </el-tooltip>
      <el-menu-item v-if="!collapsed && items.includes('editor')" index="editor">
        <div class="icon-wrapper">
          <img :src="themeState.currentTheme.EditorIcon" class="menu-icon" alt="editor" />
        </div>
        <span>{{ $t('headMenu.editor') }}</span>
      </el-menu-item>

      <el-tooltip
        v-if="collapsed && items.includes('outline')"
        :content="$t('headMenu.outline')"
        placement="right"
      >
        <el-menu-item index="outline">
          <div class="icon-wrapper">
            <img :src="themeState.currentTheme.OutlineIcon" class="menu-icon" alt="outline" />
          </div>
        </el-menu-item>
      </el-tooltip>
      <el-menu-item v-if="!collapsed && items.includes('outline')" index="outline">
        <div class="icon-wrapper">
          <img :src="themeState.currentTheme.OutlineIcon" class="menu-icon" alt="outline" />
        </div>
        <span>{{ $t('headMenu.outline') }}</span>
      </el-menu-item>

      <el-tooltip
        v-if="collapsed && items.includes('agent')"
        :content="$t('headMenu.agent')"
        placement="right"
      >
        <el-menu-item index="agent">
          <div class="icon-wrapper">
            <img :src="themeState.currentTheme.AgentIcon" class="menu-icon" alt="agent" />
          </div>
        </el-menu-item>
      </el-tooltip>
      <el-menu-item v-if="!collapsed && items.includes('agent')" index="agent">
        <div class="icon-wrapper">
          <img :src="themeState.currentTheme.AgentIcon" class="menu-icon" alt="agent" />
        </div>
        <span>{{ $t('headMenu.agent') }}</span>
      </el-menu-item>
    </el-menu>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { themeState } from '../../utils/themes'

const props = withDefaults(
  defineProps<{
    items: string[]
    collapsed?: boolean
    mode?: 'normal' | 'demo'
  }>(),
  {
    items: () => [],
    collapsed: false,
    mode: 'demo'
  }
)

const { t } = useI18n()
const activeMenuIndex = ref('')
</script>

<style scoped>
.view-menu-items-demo {
  display: inline-block;
  width: 100%;
  max-width: 200px;
}

.view-menu-items-demo :deep(.menu-icon) {
  width: 20px;
  height: 20px;
}

.view-menu-items-demo :deep(.icon-wrapper) {
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
