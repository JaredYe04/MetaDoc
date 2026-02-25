<template>
  <div class="menu-items-demo" :class="{ 'is-collapsed': collapsed }">
    <UIMenu
      :collapse="collapsed"
      :background-color="themeState.currentTheme.background2nd"
      :text-color="themeState.currentTheme.SideTextColor"
      :style="{ '--sub-menu-hover': activeBackgroundColor }"
    >
      <!-- 根据items配置渲染菜单项 -->
      <template v-for="item in menuItems" :key="item.id">
        <!-- 文件菜单 -->
        <UISubMenu
          v-if="item.id === 'file' && item.items"
          :title="$t('leftMenu.file')"
          :tooltip="$t('leftMenu.file')"
          :icon-image="(themeState.currentTheme as any).FileIcon"
          trigger="click"
          :level="1"
        >
          <template #title>
            <img
              :src="(themeState.currentTheme as any).FileIcon"
              class="menu-icon-image"
              alt="file"
            />
            <span>{{ $t('leftMenu.file') }}</span>
          </template>

          <!-- 标题项 -->
          <UISubMenuItem :is-title="true" :disabled="true">
            <template #icon>
              <img
                :src="(themeState.currentTheme as any).FileIcon"
                class="menu-title-icon"
                alt="file"
              />
            </template>
            {{ $t('leftMenu.fileTooltip') }}
          </UISubMenuItem>

          <UISubMenuItem v-if="item.items.includes('new')" :icon="DocumentAdd">
            {{ $t('leftMenu.new') }}
          </UISubMenuItem>

          <UISubMenuItem v-if="item.items.includes('open')" :icon="FolderOpened">
            {{ $t('leftMenu.open') }}
          </UISubMenuItem>

          <UISubMenuItem v-if="item.items.includes('save')" :icon="FolderChecked">
            {{ $t('leftMenu.save') }}
          </UISubMenuItem>

          <UISubMenuItem v-if="item.items.includes('save-as')" :icon="FolderAdd">
            {{ $t('leftMenu.saveAs') }}
          </UISubMenuItem>

          <UISubMenuItem v-if="item.items.includes('save-all')" :icon="FolderChecked">
            {{ $t('leftMenu.saveAll') }}
          </UISubMenuItem>

          <UISubMenu
            v-if="item.items.includes('export')"
            :icon="FirstAidKit"
            :title="$t('leftMenu.export')"
            trigger="hover"
            :level="2"
          >
            <template #title>
              <span>{{ $t('leftMenu.export') }}</span>
            </template>
            <UISubMenuItem :is-title="true" :disabled="true">
              <template #icon>
                <el-icon>
                  <FirstAidKit />
                </el-icon>
              </template>
              {{ $t('leftMenu.export') }}
            </UISubMenuItem>
          </UISubMenu>

          <UISubMenuItem v-if="item.items.includes('close')" :icon="CircleClose">
            {{ $t('leftMenu.closeFile') }}
          </UISubMenuItem>
        </UISubMenu>

        <!-- AI助手菜单 -->
        <UISubMenu
          v-if="item.id === 'ai-assistant' && item.items"
          :title="$t('leftMenu.aiAssistant')"
          :tooltip="$t('leftMenu.aiAssistant')"
          :icon-image="themeState.currentTheme.AiLogo"
          trigger="click"
          :level="1"
        >
          <template #title>
            <img :src="themeState.currentTheme.AiLogo" alt="AI" class="ai-logo-icon" />
            <span>{{ $t('leftMenu.aiAssistant') }}</span>
          </template>

          <UISubMenuItem :is-title="true" :disabled="true">
            <template #icon>
              <img :src="themeState.currentTheme.AiLogo" alt="AI" class="menu-title-icon" />
            </template>
            {{ $t('leftMenu.aiToolTooltip') }}
          </UISubMenuItem>

          <UISubMenuItem v-if="item.items.includes('ai-chat')" :icon="ChatDotRound">
            {{ $t('leftMenu.chatWithAI') }}
          </UISubMenuItem>

          <UISubMenuItem v-if="item.items.includes('proofread')" :icon="EditPen">
            {{ $t('leftMenu.proofread') }}
          </UISubMenuItem>

          <UISubMenuItem v-if="item.items.includes('formula-recognition')" :icon="Reading">
            {{ $t('leftMenu.handwritingFormulaRecognition') }}
          </UISubMenuItem>
        </UISubMenu>

        <!-- 设置菜单 -->
        <UIMenuItem
          v-if="item.id === 'settings'"
          :label="$t('leftMenu.settings')"
          :tooltip="$t('leftMenu.settings')"
          :icon="Setting"
          class="bottom-menu"
        />
      </template>
    </UIMenu>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import UIMenu from '../ui/UIMenu.vue'
import UISubMenu from '../ui/UISubMenu.vue'
import UISubMenuItem from '../ui/UISubMenuItem.vue'
import UIMenuItem from '../ui/UIMenuItem.vue'
import {
  DocumentAdd,
  FolderOpened,
  FolderChecked,
  FolderAdd,
  CircleClose,
  FirstAidKit,
  ChatDotRound,
  EditPen,
  Reading,
  Setting
} from '@element-plus/icons-vue'
import { themeState, mixColors } from '../../utils/themes'

const props = withDefaults(
  defineProps<{
    items: Array<{
      id: string
      items?: string[]
    }>
    collapsed?: boolean
    mode?: 'normal' | 'demo'
  }>(),
  {
    items: () => [],
    collapsed: true,
    mode: 'demo'
  }
)

const { t } = useI18n()

const menuItems = computed(() => props.items)

const activeBackgroundColor = computed(() => {
  return mixColors(themeState.currentTheme.background2nd, themeState.currentTheme.primary, 0.1)
})
</script>

<style scoped>
.menu-items-demo {
  display: inline-block;
  width: 100%;
  max-width: 300px;
}

.menu-items-demo :deep(.menu-icon-image) {
  width: 20px;
  height: 20px;
  margin-right: 8px;
}

.menu-items-demo :deep(.ai-logo-icon) {
  width: 20px;
  height: 20px;
  margin-right: 8px;
}

.menu-items-demo :deep(.menu-title-icon) {
  width: 16px;
  height: 16px;
}
</style>
