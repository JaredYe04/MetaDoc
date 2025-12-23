<template>
  <el-menu 
    class="modern-sidebar-menu" 
    :collapse="isCollapse" 
    @open="handleOpen" 
    @close="handleClose"
    :style="{
      height: '100%',
      borderRight: 'none',
      overflow: 'hidden',
      '--sub-menu-bg': themeState.currentTheme.background2nd,
      '--sub-menu-hover': subMenuHoverColor
    }"
    :background-color="themeState.currentTheme.background2nd"
    :text-color="themeState.currentTheme.SideTextColor"
    :active-text-color="themeState.currentTheme.SideTextColor">
    <!-- <el-tooltip :content="$t('leftMenu.metaDocTooltip')" placement="right">
      <el-sub-menu index="0">
        <template #title>
          <el-icon>
            <Document />
          </el-icon>
          <span></span>
        </template>
      </el-sub-menu>
    </el-tooltip> -->

    <el-sub-menu index="1">
      <template #title>
        <el-icon>
          <Document />
        </el-icon>
        <span>{{ $t('leftMenu.file') }}</span>
      </template>

      <!-- 标题项 -->
      <el-menu-item class="menu-title-item" disabled>
        <div class="menu-title-content">
          <el-icon>
            <Document />
          </el-icon>
          <span>{{ $t('leftMenu.fileTooltip') }}</span>
        </div>
      </el-menu-item>

      <el-menu-item index="1-1" @click="newDoc">
          <el-icon>
            <DocumentAdd />
          </el-icon>
          <span>{{ $t('leftMenu.new') }}</span>
        </el-menu-item>

        <el-menu-item index="1-2" @click="openDoc">
          <el-icon>
            <FolderOpened />
          </el-icon>
          <span>{{ $t('leftMenu.open') }}</span>
        </el-menu-item>

        <el-menu-item index="1-2-1" @click="saveAll">
          <el-icon>
            <FolderChecked />
          </el-icon>
          <span>{{ $t('leftMenu.saveAll') }}</span>
        </el-menu-item>

        <el-menu-item index="1-3" @click="eventBus.emit('save')">
          <el-icon>
            <FolderChecked />
          </el-icon>
          <span>{{ $t('leftMenu.save') }}</span>
        </el-menu-item>

        <el-menu-item index="1-4" @click="eventBus.emit('save-as')">
          <el-icon>
            <FolderAdd />
          </el-icon>
          <span>{{ $t('leftMenu.saveAs') }}</span>
        </el-menu-item>

        <el-sub-menu index="1-5">
          <template #title>
            <el-icon>
              <FirstAidKit />
            </el-icon>
            <span>{{ $t('leftMenu.export') }}</span>
          </template>

          <!-- 标题项 -->
          <el-menu-item class="menu-title-item" disabled>
            <div class="menu-title-content">
              <el-icon>
                <FirstAidKit />
              </el-icon>
              <span>{{ $t('leftMenu.export') }}</span>
            </div>
          </el-menu-item>

          <el-menu-item
            v-for="option in exportOptions"
            :key="option.format"
            :index="`1-5-${option.format}`"
            @click="handleExportClick(option.format)"
          >
            <span>{{ exportOptionLabel(option) }}</span>
          </el-menu-item>
        </el-sub-menu>

        <el-menu-item index="1-6" @click="eventBus.emit('close-active-tab')">
          <el-icon>
            <CircleClose />
          </el-icon>
          <span>{{ $t('leftMenu.closeFile') }}</span>
        </el-menu-item>
      </el-sub-menu>

    <el-sub-menu index="2">
      <template #title>
        <img :src="themeState.currentTheme.AiLogo" alt="AI" class="ai-logo-icon" />
        <span>{{ $t('leftMenu.aiAssistant') }}</span>
      </template>

      <!-- 标题项 -->
      <el-menu-item class="menu-title-item" disabled>
        <div class="menu-title-content">
          <img :src="themeState.currentTheme.AiLogo" alt="AI" class="menu-title-icon" />
          <span>{{ $t('leftMenu.aiToolTooltip') }}</span>
        </div>
      </el-menu-item>

      <el-menu-item index="2-1" @click="eventBus.emit('ai-chat')">
          <el-icon>
            <ChatDotRound />
          </el-icon>
          <span>{{ $t('leftMenu.chatWithAI') }}</span>
        </el-menu-item>
        <el-menu-item index="2-2" @click="eventBus.emit('fomula-recognition')">
          <el-icon>
            <Reading />
          </el-icon>
          <span>{{ $t('leftMenu.handwritingFormulaRecognition') }}</span>
        </el-menu-item>
        <el-menu-item index="2-3" @click="eventBus.emit('ai-graph')">
          <el-icon>
            <Picture />
          </el-icon>
          <span>{{ $t('leftMenu.smartDrawingAssistant') }}</span>
        </el-menu-item>
        <el-menu-item index="2-4" @click="eventBus.emit('data-analysis')">
          <el-icon>
            <DataAnalysis />
          </el-icon>
          <span>{{ $t('leftMenu.dataAnalysis') }}</span>
        </el-menu-item>
        <el-menu-item index="2-5" @click="eventBus.emit('ocr')">
          <el-icon>
            <View />
          </el-icon>
          <span>{{ $t('leftMenu.ocr') }}</span>
        </el-menu-item>
        <el-menu-item index="2-6" @click="eventBus.emit('attachment')">
          <el-icon>
            <Paperclip />
          </el-icon>
          <span>{{ $t('leftMenu.attachment') }}</span>
        </el-menu-item>
        <el-menu-item index="2-7" @click="eventBus.emit('graph')">
          <el-icon>
            <PieChart />
          </el-icon>
          <span>{{ $t('leftMenu.graph') }}</span>
        </el-menu-item>
      </el-sub-menu>

    <el-sub-menu index="3">
      <template #title>
        <el-icon>
          <Setting />
        </el-icon>
        <span>{{ $t('leftMenu.settings') }}</span>
      </template>

      <!-- 标题项 -->
      <el-menu-item class="menu-title-item" disabled>
        <div class="menu-title-content">
          <el-icon>
            <Setting />
          </el-icon>
          <span>{{ $t('leftMenu.settingsTooltip') }}</span>
        </div>
      </el-menu-item>

      <el-menu-item index="3-1" @click="eventBus.emit('setting')">
          <el-icon>
            <Setting />
          </el-icon>
          <span>{{ $t('leftMenu.settingsPanel') }}</span>
        </el-menu-item>
      </el-sub-menu>

    <el-sub-menu index="4" @click="refreshRecentDocs">
      <template #title>
        <el-icon>
          <Clock />
        </el-icon>
        <span>{{ $t('leftMenu.recentFiles') }}</span>
      </template>

      <!-- 标题项 -->
      <el-menu-item class="menu-title-item" disabled>
        <div class="menu-title-content">
          <el-icon>
            <Clock />
          </el-icon>
          <span>{{ $t('leftMenu.recentFilesTooltip') }}</span>
        </div>
      </el-menu-item>

      <div v-for="item in recentDocs.slice(0, 10)" :key="item">
          <el-menu-item :index="`4-${item}`" @click="
            askSave(() => {
              eventBus.emit('open-doc', item)
            })
            ">
            <el-icon>
              <Document />
            </el-icon>
            <span>{{ item }}</span>
          </el-menu-item>
        </div>
      </el-sub-menu>

    <el-sub-menu index="6">
      <template #title>
        <el-icon>
          <EarthIcon />
        </el-icon>
        <span>{{ $t('leftMenu.langTooltip') }}</span>
      </template>

      <!-- 标题项 -->
      <el-menu-item class="menu-title-item" disabled>
        <div class="menu-title-content">
          <el-icon>
            <EarthIcon />
          </el-icon>
          <span>{{ $t('leftMenu.langTooltip') }}</span>
        </div>
      </el-menu-item>

      <el-menu-item index="6-1" @click="changeLang('zh_CN')">
          <span>中文（简体）</span>
        </el-menu-item>

        <el-menu-item index="6-2" @click="changeLang('en_US')">
          <span>English (US)</span>
        </el-menu-item>
        <el-menu-item index="6-3" @click="changeLang('ja_JP')">
          <span>日本語</span>
        </el-menu-item>

        <el-menu-item index="6-4" @click="changeLang('ko_KR')">
          <span>한국어</span>
        </el-menu-item>
        
        <el-menu-item index="6-5" @click="changeLang('fr_FR')">
          <span>Français</span>
        </el-menu-item>
        
        <el-menu-item index="6-6" @click="changeLang('de_DE')">
          <span>Deutsch</span>
        </el-menu-item>
      </el-sub-menu>

    <el-menu-item @click="toggleUserProfile" class="bottom-menu">
      <img v-if="avatar" :src="avatar" width="25" height="25"
        style="border-radius: 50%; display: flex; align-items: center; align-self: center;" />
      <el-icon v-else>
        <UserFilled />
      </el-icon>
    </el-menu-item>
    <el-sub-menu index="5" class="bottom-menu">
      <template #title>
        <el-icon>
          <SwitchButton />
        </el-icon>
        <span>{{ $t('leftMenu.exit') }}</span>
      </template>

      <!-- 标题项 -->
      <el-menu-item class="menu-title-item" disabled>
        <div class="menu-title-content">
          <el-icon>
            <SwitchButton />
          </el-icon>
          <span>{{ $t('leftMenu.exitTooltip') }}</span>
        </div>
      </el-menu-item>

      <el-menu-item index="5-1" @click="saveAndQuit">
          <el-icon>
            <SwitchButton />
          </el-icon>
          <span>{{ $t('leftMenu.saveAndExit') }}</span>
        </el-menu-item>

        <el-menu-item index="5-1-1" @click="saveAllAndQuit">
          <el-icon>
            <SwitchButton />
          </el-icon>
          <span>{{ $t('leftMenu.saveAllAndExit') }}</span>
        </el-menu-item>

        <el-menu-item index="5-2" @click="quitWithoutSave">
          <el-icon>
            <SwitchButton />
          </el-icon>
          <span>{{ $t('leftMenu.exitWithoutSaving') }}</span>
        </el-menu-item>
      </el-sub-menu>
  </el-menu>

  <!-- 导出选项对话框 -->
  <ExportOptionsDialog
    v-model="showExportOptionsDialog"
    :adapter="currentExportAdapter"
    :source-format="(activeDocument?.format ?? 'md') as DocumentFormat"
    :target-format="currentExportFormat || 'pdf'"
    @confirm="handleExportOptionsConfirm"
  />
</template>


<script lang="ts" setup>


import UserProfileCard from './UserProfileCard.vue'


import { updateRecentDocs, getRecentDocs, getSetting } from '../utils/settings';
import { computed, onMounted, ref } from 'vue'
import {
  Document,
  FirstAidKit,
  Menu as IconMenu,
  Location,
  Setting,
  ChatDotRound,
  EditPen,
  UserFilled,
  User,
  DataAnalysis,
  DocumentAdd,
  FolderOpened,
  FolderChecked,
  FolderAdd,
  CircleClose,
  Clock,
  SwitchButton,
  Picture,
  ZoomIn,
  Connection
} from '@element-plus/icons-vue'
import eventBus, { sendBroadcast } from '../utils/event-bus';
import { ElMessage, ElMessageBox } from 'element-plus'
import { themeState, mixColors } from '../utils/themes';
import { avatar } from '../stores/user';
import { useActiveDocument } from '../composables/useActiveDocument';
import { EarthIcon } from 'tdesign-icons-vue-next';
import { getExportOptions } from '../services/export-manager.ts';
import type { DocumentFormat, ExportFormat } from '../../../types';
import { exportAdapterRegistry } from '../services/export-adapters';
import ExportOptionsDialog from './ExportOptionsDialog.vue';
import type { ExportOptions } from '../services/export-adapters/types';
const recentDocs = ref([])
const isCollapse = ref(true)
const showUserProfile = ref(false)
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
import { convertMarkdownToLatex } from '../utils/latex-utils';
import { createRendererLogger } from '../utils/logger';
const { locale } = useI18n()
const logger = createRendererLogger('LeftMenu')

// 计算弹出菜单的背景色和悬停颜色（参考 ContextMenu 设计）
const subMenuBackgroundColor = computed(() => themeState.currentTheme.background2nd)
const subMenuHoverColor = computed(() => {
  const baseBg = themeState.currentTheme.background2nd;
  return mixColors(baseBg, themeState.currentTheme.textColor, 0.5)
})

const changeLang = (lang: string) => {

  locale.value = lang
  localStorage.setItem('lang', lang)
  logger.info(`Language changed to ${lang}`)
  sendBroadcast('all', 'lang-changed', lang)
}
const toggleUserProfile = () => {
  eventBus.emit('toggle-user-profile')
}

const { activeDocument } = useActiveDocument()
const exportTitle = computed(() => {
  const title = activeDocument.value?.meta?.title?.trim()
  if (title && title.length > 0) {
    return title
  }
  const path = activeDocument.value?.path ?? ''
  if (path) {
    const segments = path.split(/[/\\]+/).filter(Boolean)
    return segments[segments.length - 1] ?? ''
  }
  return 'Untitled'
})
const exportOptions = computed(() => {
  const format = (activeDocument.value?.format ?? 'md') as DocumentFormat
  return getExportOptions(format)
})
const exportOptionLabel = (option: { labelKey?: string; label?: string; format: string }) => {
  if (option.labelKey) {
    return t(option.labelKey)
  }
  if (option.label) {
    return option.label
  }
  return option.format.toUpperCase()
}

const handleOpen = (_key: string, _keyPath: string[]) => {
  //console.log(key, keyPath)
}
const handleClose = (_key: string, _keyPath: string[]) => {
  //console.log(key, keyPath)
}
onMounted(async () => {
  await refreshRecentDocs()
})
const refreshRecentDocs = async () => {
  recentDocs.value = await getRecentDocs()
}

const askSave = async (callBack:any) => {
  const alwaysAskSave = await getSetting('alwaysAskSave');
  //console.log(alwaysAskSave)
  if (alwaysAskSave === false) {
    callBack()
    return
  }
  ElMessageBox.confirm(
    t('leftMenu.askSave'),
    t('leftMenu.tip'),
    {
      confirmButtonText: t('leftMenu.save'),
      cancelButtonText: t('leftMenu.discard'),
      type: 'info',
    }
  )
    .then(() => {
      eventBus.emit('save')
    })
    .catch(() => {
    }).finally(() => {
      callBack()
    })
}
const newDoc = () => {
  askSave(() => {
    eventBus.emit('new-doc')
  })
}

const openDoc = () => {

  askSave(() => {
    eventBus.emit('open-doc')
  })
}
const saveAll = () => {
  eventBus.emit('save-all')
}
const saveAndQuit = () => {
  eventBus.emit('save-and-quit')
}
const saveAllAndQuit = () => {
  eventBus.emit('save-all-and-quit')
}
const quitWithoutSave = () => {
  eventBus.emit('quit')
}

// 导出选项对话框相关
const showExportOptionsDialog = ref(false)
const currentExportFormat = ref<ExportFormat | null>(null)
const currentExportAdapter = ref<any>(null)

const handleExportClick = (format: ExportFormat) => {
  const sourceFormat = (activeDocument.value?.format ?? 'md') as DocumentFormat
  const adapter = exportAdapterRegistry.get(sourceFormat, format)
  
  if (adapter && adapter.getOptionFields().length > 0) {
    // 如果有导出选项，显示对话框
    currentExportFormat.value = format
    currentExportAdapter.value = adapter
    showExportOptionsDialog.value = true
  } else {
    // 如果没有选项，直接导出
    eventBus.emit('export', { format, filename: exportTitle.value })
  }
}

const handleExportOptionsConfirm = (options: ExportOptions) => {
  if (currentExportFormat.value) {
    eventBus.emit('export', { 
      format: currentExportFormat.value, 
      filename: exportTitle.value,
      options 
    })
  }
  showExportOptionsDialog.value = false
  currentExportFormat.value = null
  currentExportAdapter.value = null
}
</script>

<style scoped>
/* 现代桌面应用风格的侧边栏 */
.modern-sidebar-menu {
  width: 64px;
  transition: width 0.2s ease;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

.modern-sidebar-menu:not(.el-menu--collapse) {
  width: 180px;
  min-height: 400px;
}

/* 菜单项基础样式 */
.modern-sidebar-menu :deep(.el-menu-item),
.modern-sidebar-menu :deep(.el-sub-menu__title) {
  height: 40px;
  line-height: 40px;
  margin: 4px 8px;
  border-radius: 6px;
  transition: all 0.2s ease;
  position: relative;
  padding-left: 12px !important;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

/* 图标居中 */
.modern-sidebar-menu :deep(.el-menu-item .el-icon),
.modern-sidebar-menu :deep(.el-sub-menu__title .el-icon) {
  margin-right: 8px;
  font-size: 18px;
  width: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* AI Logo 图标居中 */
.modern-sidebar-menu .ai-logo-icon {
  width: 18px;
  height: 18px;
  margin-right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 悬停效果 - 圆角背景框 */
.modern-sidebar-menu :deep(.el-menu-item:hover),
.modern-sidebar-menu :deep(.el-sub-menu__title:hover) {
  background-color: var(--el-menu-hover-bg-color, rgba(0, 0, 0, 0.06)) !important;
  border-radius: 6px;
}

/* 激活状态 - 禁用高亮 */
.modern-sidebar-menu :deep(.el-menu-item.is-active) {
  background-color: transparent !important;
  border-radius: 6px;
  color: inherit !important;
}

/* 子菜单弹出框样式 - Windows 11 / QQ NT 风格圆角 */
/* 使用全局样式覆盖 Element Plus 的弹出菜单 */
.modern-sidebar-menu :deep(.el-popper[data-popper-placement^="right"]),
.modern-sidebar-menu :deep(.el-popper.is-pure),
.modern-sidebar-menu :deep(.el-sub-menu__popper) {
  border-radius: 10px !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15) !important;
  border: 1px solid var(--el-border-color-light, rgba(0, 0, 0, 0.08)) !important;
  overflow: visible !important;
  padding: 0 !important;
  margin-left: 14px !important;
}

/* 移除外层容器的 padding 和背景 */
.modern-sidebar-menu :deep(.el-popper .el-menu--popup-container),
.modern-sidebar-menu :deep(.el-sub-menu__popper .el-menu--popup-container) {
  padding: 0 !important;
  background-color: transparent !important;
  border-radius: 10px !important;
  overflow: visible !important;
}

/* 弹出菜单内部的 el-menu */
.modern-sidebar-menu :deep(.el-popper .el-menu),
.modern-sidebar-menu :deep(.el-sub-menu__popper .el-menu) {
  border-radius: 10px !important;
  background-color: v-bind('subMenuBackgroundColor') !important;
  border: none !important;
  padding: 4px !important;
  min-width: 180px !important;
  overflow: visible !important;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

/* 子菜单项样式 - 减小间距 */
.modern-sidebar-menu :deep(.el-sub-menu .el-menu .el-menu-item),
.modern-sidebar-menu :deep(.el-popper .el-menu .el-menu-item) {
  margin: 1px 4px !important;
  border-radius: 6px !important;
  height: 34px !important;
  line-height: 34px !important;
  padding: 0 12px !important;
  background-color: transparent !important;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

/* 嵌套子菜单项样式 */
.modern-sidebar-menu :deep(.el-sub-menu .el-menu .el-sub-menu),
.modern-sidebar-menu :deep(.el-popper .el-menu .el-sub-menu) {
  margin: 1px 4px !important;
}

.modern-sidebar-menu :deep(.el-sub-menu .el-menu .el-menu-item:hover),
.modern-sidebar-menu :deep(.el-popper .el-menu .el-menu-item:hover) {
  background-color: v-bind('subMenuHoverColor') !important;
  border-radius: 6px !important;
}

/* 嵌套子菜单的标题样式 */
.modern-sidebar-menu :deep(.el-sub-menu .el-menu .el-sub-menu .el-sub-menu__title),
.modern-sidebar-menu :deep(.el-popper .el-menu .el-sub-menu .el-sub-menu__title) {
  margin: 1px 4px !important;
  border-radius: 6px !important;
  height: 34px !important;
  line-height: 34px !important;
  padding: 0 12px !important;
  background-color: transparent !important;
}

.modern-sidebar-menu :deep(.el-sub-menu .el-menu .el-sub-menu .el-sub-menu__title:hover),
.modern-sidebar-menu :deep(.el-popper .el-menu .el-sub-menu .el-sub-menu__title:hover) {
  background-color: v-bind('subMenuHoverColor') !important;
  border-radius: 6px !important;
}

/* 子菜单项图标样式 */
.modern-sidebar-menu :deep(.el-sub-menu .el-menu .el-menu-item .el-icon) {
  margin-right: 8px;
  font-size: 16px;
  width: 16px;
}

/* 禁止滚动条 */
.modern-sidebar-menu {
  overflow: hidden !important;
}

.modern-sidebar-menu :deep(.el-menu) {
  overflow: hidden !important;
  overflow-y: hidden !important;
  overflow-x: hidden !important;
}

/* 折叠状态下的样式 */
.modern-sidebar-menu.el-menu--collapse {
  width: 64px;
}

.modern-sidebar-menu.el-menu--collapse :deep(.el-menu-item),
.modern-sidebar-menu.el-menu--collapse :deep(.el-sub-menu__title) {
  padding: 0 !important;
  justify-content: center;
  display: flex;
  align-items: center;
}

.modern-sidebar-menu.el-menu--collapse :deep(.el-menu-item .el-icon),
.modern-sidebar-menu.el-menu--collapse :deep(.el-sub-menu__title .el-icon),
.modern-sidebar-menu.el-menu--collapse :deep(.ai-logo-icon) {
  margin: 0 auto !important;
}

/* 底部菜单项 */
.bottom-menu {
  margin-top: auto;
}

/* 移除默认的边框和分隔线 */
.modern-sidebar-menu :deep(.el-menu) {
  border-right: none;
}

/* 菜单标题项样式 - 居中显示，不可点击 */
.modern-sidebar-menu :deep(.menu-title-item) {
  cursor: default !important;
  opacity: 1 !important;
  margin: 4px 4px 8px 4px !important;
  height: 34px !important;
  line-height: 34px !important;
  padding: 0 12px !important;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1) !important;
  border-radius: 0 !important;
}

.modern-sidebar-menu :deep(.menu-title-item:hover) {
  background-color: transparent !important;
}

.modern-sidebar-menu :deep(.menu-title-item.is-disabled) {
  opacity: 1 !important;
  cursor: default !important;
  color: inherit !important;
}

.menu-title-content {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: row;
  gap: 8px;
  width: 100%;
}

.menu-title-content .el-icon {
  font-size: 16px;
  margin: 0;
  width: 16px;
  height: 16px;
}

.menu-title-content .menu-title-icon {
  width: 16px;
  height: 16px;
  margin: 0;
}

.menu-title-content span {
  font-size: 12px;
  font-weight: 500;
  text-align: center;
  opacity: 0.8;
}

/* 用户头像和退出按钮区域 */
.modern-sidebar-menu :deep(.el-menu-item:last-child),
.modern-sidebar-menu :deep(.el-sub-menu:last-child) {
  margin-top: auto;
}

/* 子菜单箭头图标 */
.modern-sidebar-menu :deep(.el-sub-menu__icon-arrow) {
  margin-top: -1px;
  font-size: 12px;
}

/* 响应式调整 */
@media (max-width: 768px) {
  .modern-sidebar-menu:not(.el-menu--collapse) {
    width: 160px;
  }
}

</style>

<!-- 全局样式：覆盖 Element Plus 弹出菜单 - Windows 11 / QQ NT 风格 -->
<style>
/* 全局覆盖 Element Plus 弹出菜单样式 - Windows 11 / QQ NT 风格 */
/* 只作用于菜单相关的 popper，不影响 tooltip */
/* 使用类名选择器来区分菜单和 tooltip */
.el-menu--popup-container[data-popper-placement^="right"],
.el-sub-menu__popper[data-popper-placement^="right"],
.el-popper[data-popper-placement^="right"]:not(.el-tooltip__popper):has(.el-menu--popup),
.el-popper[data-popper-placement^="right"]:not(.el-tooltip__popper):has(.el-menu) {
  border-radius: 10px !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15) !important;
  border: 1px solid var(--el-border-color-light, rgba(0, 0, 0, 0.08)) !important;
  overflow: visible !important;
  padding: 0 !important;
  margin-left: 12px !important;
  background-color: var(--sub-menu-bg, var(--el-bg-color, #ffffff)) !important;
  z-index: 2000 !important;
}

/* 确保 tooltip 不受影响，恢复默认样式 */
/* tooltip 应该保持 Element Plus 的默认样式 */
.el-tooltip__popper[data-popper-placement^="right"],
.el-tooltip__popper[data-popper-placement^="top"],
.el-tooltip__popper[data-popper-placement^="bottom"],
.el-tooltip__popper[data-popper-placement^="left"] {
  border-radius: 4px !important;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1) !important;
  border: none !important;
  overflow: visible !important;
  padding: 8px 12px !important;
  margin-left: 0 !important;
  margin-top: 0 !important;
  margin-right: 0 !important;
  margin-bottom: 0 !important;
  background-color: var(--el-bg-color-overlay) !important;
  z-index: 3000 !important;
}

/* 确保嵌套子菜单可以显示 */
.el-popper[data-popper-placement^="right"] .el-menu--popup {
  overflow: visible !important;
}

/* 移除外层容器的 padding 和背景 - 只作用于菜单 */
.el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu--popup-container,
.el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu--popup-container,
.el-sub-menu__popper[data-popper-placement^="right"] .el-menu--popup-container {
  padding: 0 !important;
  background-color: transparent !important;
  border-radius: 10px !important;
  overflow: visible !important;
}

.el-popper[data-popper-placement^="right"] .el-menu {
  border-radius: 10px !important;
  background-color: var(--sub-menu-bg, var(--el-bg-color, #ffffff)) !important;
  border: none !important;
  padding: 4px !important;
  overflow: visible !important;
  min-width: 180px !important;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

/* 全局菜单标题项样式 - 只作用于菜单 */
.el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .menu-title-item,
.el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .menu-title-item,
.el-sub-menu__popper[data-popper-placement^="right"] .el-menu .menu-title-item {
  cursor: default !important;
  opacity: 1 !important;
  margin: 4px 4px 8px 4px !important;
  height: 34px !important;
  line-height: 34px !important;
  padding: 0 12px !important;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1) !important;
  border-radius: 0 !important;
  background-color: transparent !important;
}

.el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .menu-title-item:hover,
.el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .menu-title-item:hover,
.el-sub-menu__popper[data-popper-placement^="right"] .el-menu .menu-title-item:hover {
  background-color: transparent !important;
}

.el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .menu-title-item.is-disabled,
.el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .menu-title-item.is-disabled,
.el-sub-menu__popper[data-popper-placement^="right"] .el-menu .menu-title-item.is-disabled {
  opacity: 1 !important;
  cursor: default !important;
  color: inherit !important;
}

.el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .menu-title-content,
.el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .menu-title-content,
.el-sub-menu__popper[data-popper-placement^="right"] .el-menu .menu-title-content {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: row;
  gap: 8px;
  width: 100%;
}

.el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .menu-title-content .el-icon,
.el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .menu-title-content .el-icon,
.el-sub-menu__popper[data-popper-placement^="right"] .el-menu .menu-title-content .el-icon {
  font-size: 16px;
  margin: 0;
  width: 16px;
  height: 16px;
}

.el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .menu-title-content .menu-title-icon,
.el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .menu-title-content .menu-title-icon,
.el-sub-menu__popper[data-popper-placement^="right"] .el-menu .menu-title-content .menu-title-icon {
  width: 16px;
  height: 16px;
  margin: 0;
}

.el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .menu-title-content span,
.el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .menu-title-content span,
.el-sub-menu__popper[data-popper-placement^="right"] .el-menu .menu-title-content span {
  font-size: 12px;
  font-weight: 500;
  text-align: center;
  opacity: 0.8;
}

.el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .el-menu-item,
.el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .el-menu-item,
.el-sub-menu__popper[data-popper-placement^="right"] .el-menu .el-menu-item {
  margin: 1px 4px !important;
  border-radius: 6px !important;
  height: 34px !important;
  line-height: 34px !important;
  padding: 0 12px !important;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

.el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .el-menu-item:hover,
.el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .el-menu-item:hover,
.el-sub-menu__popper[data-popper-placement^="right"] .el-menu .el-menu-item:hover {
  border-radius: 6px !important;
}

/* 嵌套子菜单样式 - 确保嵌套子菜单也能正确显示 */
.el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .el-sub-menu,
.el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .el-sub-menu,
.el-sub-menu__popper[data-popper-placement^="right"] .el-menu .el-sub-menu {
  margin: 1px 4px !important;
}

.el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .el-sub-menu .el-sub-menu__title,
.el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .el-sub-menu .el-sub-menu__title,
.el-sub-menu__popper[data-popper-placement^="right"] .el-menu .el-sub-menu .el-sub-menu__title {
  margin: 0 !important;
  border-radius: 6px !important;
  height: 34px !important;
  line-height: 34px !important;
  padding: 0 12px !important;
  background-color: transparent !important;
}

.el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .el-sub-menu .el-sub-menu__title:hover,
.el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .el-sub-menu .el-sub-menu__title:hover,
.el-sub-menu__popper[data-popper-placement^="right"] .el-menu .el-sub-menu .el-sub-menu__title:hover {
  background-color: var(--sub-menu-hover, rgba(0, 0, 0, 0.06)) !important;
  border-radius: 6px !important;
}

/* 确保所有弹出菜单都有正确的 z-index - 只作用于菜单 */
.el-popper[data-popper-placement^="right"]:has(.el-menu),
.el-popper[data-popper-placement^="right"].el-menu--popup-container,
.el-sub-menu__popper[data-popper-placement^="right"] {
  z-index: 2000 !important;
}

/* 嵌套子菜单的弹出框 - 使用更通用的选择器 */
/* Element Plus 会将所有弹出框都添加到 body 下，嵌套子菜单是独立的弹出框 */
body > .el-popper[data-popper-placement^="right"]:has(.el-menu),
body > .el-popper[data-popper-placement^="right"].el-menu--popup-container,
body > .el-sub-menu__popper[data-popper-placement^="right"] {
  z-index: 3000 !important;
}

/* 确保嵌套子菜单的弹出框也有圆角和正确样式 */
body > .el-popper[data-popper-placement^="right"]:has(.el-menu),
body > .el-popper[data-popper-placement^="right"].el-menu--popup-container,
body > .el-sub-menu__popper[data-popper-placement^="right"] {
  border-radius: 10px !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15) !important;
  border: 1px solid var(--el-border-color-light, rgba(0, 0, 0, 0.08)) !important;
  overflow: visible !important;
  padding: 0 !important;
  margin-left: 12px !important;
  background-color: var(--sub-menu-bg, var(--el-bg-color, #ffffff)) !important;
}

/* 移除嵌套子菜单外层容器的 padding 和背景 */
body > .el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu--popup-container,
body > .el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu--popup-container,
body > .el-sub-menu__popper[data-popper-placement^="right"] .el-menu--popup-container {
  padding: 0 !important;
  background-color: transparent !important;
  border-radius: 10px !important;
  overflow: visible !important;
}

/* 嵌套子菜单内部的 el-menu - 确保所有嵌套子菜单都应用样式 */
body > .el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu,
body > .el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu,
body > .el-sub-menu__popper[data-popper-placement^="right"] .el-menu {
  border-radius: 10px !important;
  background-color: var(--sub-menu-bg, var(--el-bg-color, #ffffff)) !important;
  border: none !important;
  padding: 4px !important;
  overflow: visible !important;
  min-width: 180px !important;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

/* 嵌套子菜单的标题项样式 */
body > .el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .menu-title-item,
body > .el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .menu-title-item,
body > .el-sub-menu__popper[data-popper-placement^="right"] .el-menu .menu-title-item {
  cursor: default !important;
  opacity: 1 !important;
  margin: 4px 4px 8px 4px !important;
  height: 34px !important;
  line-height: 34px !important;
  padding: 0 12px !important;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1) !important;
  border-radius: 0 !important;
  background-color: transparent !important;
}

body > .el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .menu-title-item:hover,
body > .el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .menu-title-item:hover,
body > .el-sub-menu__popper[data-popper-placement^="right"] .el-menu .menu-title-item:hover {
  background-color: transparent !important;
}

body > .el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .menu-title-item.is-disabled,
body > .el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .menu-title-item.is-disabled,
body > .el-sub-menu__popper[data-popper-placement^="right"] .el-menu .menu-title-item.is-disabled {
  opacity: 1 !important;
  cursor: default !important;
  color: inherit !important;
}

body > .el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .menu-title-content,
body > .el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .menu-title-content,
body > .el-sub-menu__popper[data-popper-placement^="right"] .el-menu .menu-title-content {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: row;
  gap: 8px;
  width: 100%;
}

body > .el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .menu-title-content .el-icon,
body > .el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .menu-title-content .el-icon,
body > .el-sub-menu__popper[data-popper-placement^="right"] .el-menu .menu-title-content .el-icon {
  font-size: 16px;
  margin: 0;
  width: 16px;
  height: 16px;
}

body > .el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .menu-title-content .menu-title-icon,
body > .el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .menu-title-content .menu-title-icon,
body > .el-sub-menu__popper[data-popper-placement^="right"] .el-menu .menu-title-content .menu-title-icon {
  width: 16px;
  height: 16px;
  margin: 0;
}

body > .el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .menu-title-content span,
body > .el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .menu-title-content span,
body > .el-sub-menu__popper[data-popper-placement^="right"] .el-menu .menu-title-content span {
  font-size: 12px;
  font-weight: 500;
  text-align: center;
  opacity: 0.8;
}

body > .el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .el-menu-item,
body > .el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .el-menu-item,
body > .el-sub-menu__popper[data-popper-placement^="right"] .el-menu .el-menu-item {
  margin: 1px 4px !important;
  border-radius: 6px !important;
  height: 34px !important;
  line-height: 34px !important;
  padding: 0 12px !important;
  background-color: transparent !important;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

body > .el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .el-menu-item:hover,
body > .el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .el-menu-item:hover,
body > .el-sub-menu__popper[data-popper-placement^="right"] .el-menu .el-menu-item:hover {
  background-color: var(--sub-menu-hover, rgba(0, 0, 0, 0.06)) !important;
  border-radius: 6px !important;
}

/* 确保嵌套子菜单项也能正常显示 */
body > .el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .el-sub-menu,
body > .el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .el-sub-menu,
body > .el-sub-menu__popper[data-popper-placement^="right"] .el-menu .el-sub-menu {
  margin: 1px 4px !important;
}

body > .el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .el-sub-menu .el-sub-menu__title,
body > .el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .el-sub-menu .el-sub-menu__title,
body > .el-sub-menu__popper[data-popper-placement^="right"] .el-menu .el-sub-menu .el-sub-menu__title {
  margin: 0 !important;
  border-radius: 6px !important;
  height: 34px !important;
  line-height: 34px !important;
  padding: 0 12px !important;
  background-color: transparent !important;
}

body > .el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .el-sub-menu .el-sub-menu__title:hover,
body > .el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .el-sub-menu .el-sub-menu__title:hover,
body > .el-sub-menu__popper[data-popper-placement^="right"] .el-menu .el-sub-menu .el-sub-menu__title:hover {
  background-color: var(--sub-menu-hover, rgba(0, 0, 0, 0.06)) !important;
  border-radius: 6px !important;
}
</style>