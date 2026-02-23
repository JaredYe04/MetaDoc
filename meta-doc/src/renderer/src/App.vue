<!-- App.vue -->
<template>
  <div
    :style="{
      backgroundColor: themeState.currentTheme.background,
      color: themeState.currentTheme.textColor
    }"
  >
    <!-- 布局仅在需要时显示 -->
    <Main v-if="requiresLayout" />
    <!-- 如果不需要布局，则直接渲染路由页面 -->
    <router-view v-else />
    <!-- Element Plus 输入框全局右键菜单（剪切/复制/粘贴/全选） -->
    <InputContextMenu />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, nextTick, watch } from 'vue'
import { useRoute } from 'vue-router'
import Main from './views/Main.vue'
import InputContextMenu from './components/common/InputContextMenu.vue'

import eventBus, { getWindowType, initWindowType } from './utils/event-bus'
import {
  getRecentDocs,
  getSetting,
  initCriticalSettings,
  initNonCriticalSettings
} from './utils/settings'
import { themeState, applyTheme } from './utils/themes'
import { clearAiTasks } from './utils/ai_tasks'
import { useI18n } from 'vue-i18n'
import { createRendererLogger } from './utils/logger'
import { initMonacoEnvironment } from './utils/monaco-worker-config'
import { getRuntimeServerBaseUrl } from './config/runtime-server'
import { aiCompletionService } from './utils/ai-completion-service'
import { autoMigrateAIChatSessions } from './utils/db/migrate-ai-chat'
import { useWorkspace } from './stores/workspace'
import './assets/hide-native-scrollbar.css'

const route = useRoute()
const { locale, t } = useI18n()
const logger = createRendererLogger('App', {
  windowTypeProvider: () => getWindowType()
})

// 获取当前路由信息

// 根据路由的 meta 信息判断是否需要顶部菜单和侧边菜单
const requiresLayout = computed(() => route.meta.requiresLayout !== false)
const initialLoad = ref(true)

/**
 * 注册全局事件监听器
 * 这些事件与具体的编辑器适配器无关，应该在整个应用生命周期内都可用
 */
const cleanupGlobalListeners: (() => void)[] = []

function initGlobalEventListeners() {
  // AI补全延迟相关事件监听（全局，与编辑器适配器无关）
  eventBus.on('ai-completion-delay', (minutes: unknown) => {
    aiCompletionService.delay(typeof minutes === 'number' ? minutes : 5)
  })

  eventBus.on('ai-completion-cancel-delay', () => {
    aiCompletionService.cancelDelay()
  })

  // AI补全取消事件（全局，与编辑器适配器无关）
  eventBus.on('cancel-suggestion', () => {
    aiCompletionService.cancelCurrentCompletion()
  })

  // 监听语言切换事件（全局）
  eventBus.on('lang-changed', (lang: unknown) => {
    const langStr = typeof lang === 'string' ? lang : 'zh-CN'
    locale.value = langStr
    localStorage.setItem('lang', langStr)
  })

  // 用户模板增删后刷新新建文档模板列表
  eventBus.on('refresh-template-formats', () => {
    loadTemplateFormats()
  })

  // 监听主题同步事件（全局）
  eventBus.on('sync-theme', async () => {
    await applyTheme()
    eventBus.emit('sync-editor-theme') //触发vditor主题同步事件
  })

  // 全局键盘快捷键监听（F1 用户手册；Ctrl+F/H 查找替换）
  // 注意：使用 capture 阶段确保在编辑器内部处理之前捕获
  const handleGlobalKeyDown = (e: KeyboardEvent) => {
    // F1：打开用户手册（任意界面生效）
    if (e.key === 'F1') {
      e.preventDefault()
      eventBus.emit('open-system-tab', {
        route: '/user-manual',
        title: t('userManual.title') || '用户手册'
      })
      return
    }

    const isMac = /Mac|iPhone|iPod|iPad/i.test(navigator.platform)
    const modifierKey = isMac ? e.metaKey : e.ctrlKey

    // 只处理 Ctrl+F 和 Ctrl+H
    if (modifierKey && (e.key === 'f' || e.key === 'F' || e.key === 'h' || e.key === 'H')) {
      // 检查是否在输入框、文本域等可编辑元素中（排除编辑器区域）
      const target = e.target as HTMLElement
      const isInInput =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

      // 如果焦点在输入框中，且不在编辑器区域，则不处理（让浏览器默认行为处理）
      if (isInInput && !target.closest('.vditor, .monaco-editor, .editor, [data-editor]')) {
        return
      }

      // Ctrl+F 或 Command+F：打开查找替换菜单
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        e.stopPropagation()
        eventBus.emit('search-replace')
        return
      }

      // Ctrl+H 或 Command+H：打开查找替换菜单（展开替换部分）
      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault()
        e.stopPropagation()
        eventBus.emit('search-replace', { expandReplace: true })
        return
      }
    }
  }

  // 使用 capture 阶段，确保在编辑器内部处理之前捕获
  window.addEventListener('keydown', handleGlobalKeyDown, true)

  // 清理函数
  cleanupGlobalListeners.push(
    () => eventBus.off('ai-completion-delay'),
    () => eventBus.off('ai-completion-cancel-delay'),
    () => eventBus.off('cancel-suggestion'),
    () => eventBus.off('lang-changed'),
    () => eventBus.off('sync-theme'),
    () => eventBus.off('refresh-template-formats'),
    () => window.removeEventListener('keydown', handleGlobalKeyDown, true)
  )
}

const autoOpenDoc = async () => {
  //首先要判断一下自己是哪个窗口，只有主窗口才需要自动打开文档
  const windowType = route.query.windowType
  initWindowType(windowType)
  //console.log("当前窗口类型是：", windowType);
  if (windowType !== 'home') return // 如果不是主窗口，则不执行自动打开文档

  // 检查是否通过外部参数打开文件（URL中的file参数）
  const hash = window.location.hash // e.g. "#/home?file=xxx.md"
  const [path, query] = hash.split('?')
  const queryParams = query ? Object.fromEntries(new URLSearchParams(query)) : {}
  const file = queryParams.file || ''

  let hasExternalFileParam = false
  if (file) {
    // 如果有文件参数，直接打开该文件（这是外部启动）
    eventBus.emit('open-doc', file)
    initialLoad.value = false
    hasExternalFileParam = true
    // 外部参数启动时，不打开主页
    return
  }

  // 处理启动选项（打开最近文档等）
  let willOpenDocument = false
  const enabled = (await getSetting('startupOption')) === 'lastFile'
  if (enabled) {
    const recentDocs = await getRecentDocs()

    if (recentDocs.length > 0 && initialLoad.value) {
      willOpenDocument = true
      // 在打开最近文档之前，先删除所有新文档Tab
      // 这样可以确保只有一个Tab，并且是最近文档
      const workspace = useWorkspace()
      const newDocTabs = workspace.tabs.filter(
        (t) => t.kind === 'new' && (!t.path || t.path === '') && !t.dirty
      )
      // 删除所有新文档Tab
      newDocTabs.forEach((newTab) => {
        workspace.removeTab(newTab.id)
      })

      // 然后打开最近文档
      eventBus.emit('open-doc', recentDocs[0])
      initialLoad.value = false
    }
  }

  // 检查是否需要自动打开主页
  // 由 Tab 拖出创建的新窗口（skipAutoHome=1）不执行，避免多出主页 Tab
  const skipAutoHome = route.query.skipAutoHome === '1'
  if (!hasExternalFileParam && !skipAutoHome) {
    const autoOpenHomeOnStartup = await getSetting('autoOpenHomeOnStartup')
    if (autoOpenHomeOnStartup) {
      const workspace = useWorkspace()

      // 如果打开了文档，等待文档打开完成后再打开主页
      if (willOpenDocument) {
        // 使用 Promise 等待 open-doc-success 事件
        const openHomeAfterDocOpen = () => {
          const existingHomeTab = workspace.tabs.find(
            (tab) => tab.kind === 'system' && tab.route === '/global-home'
          )
          if (existingHomeTab) {
            workspace.activateTab(existingHomeTab.id)
          } else {
            workspace.openSystemTab('/global-home', t('leftMenu.home', '主页'))
          }
        }

        // 监听一次 open-doc-success 事件
        const handler = () => {
          eventBus.off('open-doc-success', handler)
          // 使用 nextTick 确保在下一个事件循环中执行，让文档 tab 完全创建完成
          nextTick(() => {
            openHomeAfterDocOpen()
          })
        }
        eventBus.on('open-doc-success', handler)
      } else {
        // 如果没有打开文档，直接打开主页
        // 使用 nextTick 确保 workspace 已经初始化
        nextTick(() => {
          const existingHomeTab = workspace.tabs.find(
            (tab) => tab.kind === 'system' && tab.route === '/global-home'
          )
          if (existingHomeTab) {
            workspace.activateTab(existingHomeTab.id)
          } else {
            workspace.openSystemTab('/global-home', t('leftMenu.home', '主页'))
          }
        })
      }
    }
  }
}

// 按当前语言加载文档模板（md/tex），供新建文档使用
async function loadTemplateFormats() {
  const ws = useWorkspace()
  const normalizedLocale = (locale.value || 'zh_CN').replace('-', '_')
  await ws.initTemplateFormats(normalizedLocale, t)
}

onMounted(async () => {
  // 初始化运行时服务器地址缓存（供 getRuntimeServerBaseUrlSync 等使用）
  await getRuntimeServerBaseUrl()

  // 初始化全局事件监听器（必须在其他初始化之前）
  initGlobalEventListeners()

  // 按当前语言加载文档模板
  await loadTemplateFormats()

  // 初始化 Monaco 环境（Worker 配置和 LaTeX 语言支持）
  initMonacoEnvironment()

  // 自动迁移AIChat历史会话（从localStorage到SQLite）
  // 只在主窗口执行迁移，避免在辅助窗口中重复执行
  const windowType = getWindowType()
  if (windowType === 'home') {
    autoMigrateAIChatSessions().catch((error) => {
      logger.error('AIChat会话迁移失败:', error)
    })
  }

  window.addEventListener('beforeunload', () => {
    clearAiTasks()
  })
  window.addEventListener('error', (e) => {
    // 提取详细的错误信息
    const errorInfo = {
      message: e.message,
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
      error: e.error,
      isTrusted: e.isTrusted,
      // 尝试从 error 对象中提取更多信息
      errorMessage: e.error?.message,
      errorStack: e.error?.stack,
      errorName: e.error?.name
    }

    // 过滤掉一些无害的错误
    // 1. 资源加载失败（图片、字体等）
    if (e.message?.includes('Failed to load resource') || e.message?.includes('net::ERR_')) {
      return // 静默忽略资源加载错误
    }

    // 2. 跨域错误
    if (e.message?.includes('CORS') || e.message?.includes('Cross-Origin')) {
      return // 静默忽略跨域错误
    }

    // 3. 脚本加载错误（可能是外部资源）
    if (
      e.filename &&
      !e.filename.includes(window.location.origin) &&
      !e.filename.startsWith('/') &&
      !e.filename.startsWith('./')
    ) {
      logger.debug('External script error (ignored)', errorInfo)
      return
    }

    // 记录其他错误
    logger.error('Global error', errorInfo)
  })
  window.addEventListener('unhandledrejection', (e) => {
    const errorInfo = {
      reason: e.reason,
      // 尝试提取更多信息
      errorMessage: e.reason?.message,
      errorStack: e.reason?.stack,
      errorName: e.reason?.name,
      toString: String(e.reason)
    }

    // 过滤 PDF.js 相关的错误（这些错误已经在组件中处理）
    if (
      e.reason?.name === 'ResponseException' ||
      e.reason?.name === 'MissingPDFException' ||
      (e.reason?.message && e.reason.message.includes('retrieving PDF'))
    ) {
      logger.debug('PDF 加载错误（已在组件中处理）', errorInfo)
      return
    }

    // 过滤 Monaco Editor 的 "Canceled" 错误（编辑器销毁时的正常行为）
    if (
      e.reason?.name === 'Canceled' ||
      e.reason?.message === 'Canceled' ||
      (e.reason?.stack && e.reason.stack.includes('Delayer.cancel'))
    ) {
      // 这是 Monaco Editor 在 dispose 时取消内部延迟操作的正常行为，静默忽略
      return
    }

    logger.error('Unhandled rejection', errorInfo)
  })
  // const windowType=route.query.windowType
  // initWindowType(windowType);

  // 先加载关键设置（主题相关等，需要在窗口显示前完成）
  await initCriticalSettings()

  // // 触发一次主题同步事件（用于同步其他组件，如编辑器主题等）
  // // 注意：主题已经在 main.js 中应用过了，这里只需要同步其他组件
  // eventBus.emit('sync-theme')

  // 自动打开文档（只在主窗口加载时执行一次）
  await autoOpenDoc()

  // 异步加载非关键设置（不阻塞窗口显示）
  initNonCriticalSettings()
})

// 语言切换时重新加载当前语言的文档模板
watch(locale, () => {
  loadTemplateFormats()
})

// 组件卸载时清理全局事件监听器
onUnmounted(() => {
  cleanupGlobalListeners.forEach((cleanup) => cleanup())
  cleanupGlobalListeners.length = 0
})
</script>

<style scoped>
/* App.vue 样式（可以为空） */
</style>

<style>
/* 全局样式：UI 组件文本不可选择 */
/* 为常见的 UI 组件设置不可选择，但排除可编辑区域 */

/* Element Plus 组件 */
.el-menu,
.el-menu-item,
.el-sub-menu,
.el-sub-menu__title,
.el-button,
.el-tag,
.el-card,
.el-card__header,
.el-card__body,
.el-card__footer,
.el-tabs,
.el-tabs__item,
.el-tabs__header,
.el-tabs__nav,
.el-breadcrumb,
.el-breadcrumb__item,
.el-steps,
.el-step,
.el-step__title,
.el-step__description,
.el-alert,
.el-alert__title,
.el-alert__content,
.el-notification,
.el-notification__title,
.el-notification__content,
.el-message,
.el-message-box,
.el-dialog,
.el-dialog__header,
.el-dialog__title,
.el-dialog__body,
.el-drawer,
.el-drawer__header,
.el-drawer__title,
.el-drawer__body,
.el-popover,
.el-popconfirm,
.el-tooltip__popper,
.el-descriptions,
.el-descriptions__label,
.el-descriptions__content,
.el-table,
.el-table__header,
.el-table__body,
.el-table th,
.el-table td,
.el-pagination,
.el-pagination__total,
.el-pagination__sizes,
.el-pagination__jump,
.el-cascader,
.el-select,
.el-select__tags,
.el-time-picker,
.el-date-picker,
.el-rate,
.el-switch,
.el-radio,
.el-radio__label,
.el-checkbox,
.el-checkbox__label,
.el-slider,
.el-slider__runway,
.el-slider__button,
.el-color-picker,
.el-upload,
.el-upload__tip,
.el-form,
.el-form-item,
.el-form-item__label,
.el-form-item__error,
.el-cascader-panel,
.el-tree,
.el-tree-node,
.el-tree-node__label,
.el-tree-node__content,
.el-collapse,
.el-collapse-item,
.el-collapse-item__header,
.el-collapse-item__content,
.el-timeline,
.el-timeline-item,
.el-timeline-item__content,
.el-badge,
.el-badge__content,
.el-empty,
.el-empty__description,
.el-skeleton,
.el-skeleton__item,
.el-result,
.el-result__title,
.el-result__subtitle,
.el-image,
.el-image__error,
.el-image__placeholder,
.el-avatar,
.el-backtop,
.el-page-header,
.el-page-header__content,
.el-page-header__title,
.el-divider,
.el-link,
.el-text,
.el-space,
.el-space__item,
.el-config-provider,
.el-row,
.el-col {
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

/* 通用 UI 组件类名 */
.header,
.footer,
.sidebar,
.nav,
.navbar,
.menu,
.menu-item,
.menu-list,
.toolbar,
.toolbar-item,
.status-bar,
.status-item,
.breadcrumb,
.breadcrumb-item,
.card,
.card-header,
.card-body,
.card-footer,
.panel,
.panel-header,
.panel-body,
.tabs,
.tab,
.tab-item,
.badge,
.tag,
.label,
.help-text,
.hint,
.tip,
.info,
.warning,
.error,
.success,
.notification,
.alert,
.modal,
.modal-header,
.modal-body,
.modal-footer,
.drawer,
.drawer-header,
.drawer-body,
.popover,
.tooltip,
.tooltip-content,
.dropdown,
.dropdown-menu,
.dropdown-item,
.context-menu,
.context-menu-item,
.stepper,
.step,
.step-title,
.step-description,
.timeline,
.timeline-item,
.descriptions,
.descriptions-item,
.skeleton,
.skeleton-item,
.empty,
.empty-description,
.result,
.result-title,
.result-subtitle,
.pagination,
.pagination-item,
.filter,
.filter-item,
.search,
.search-input-wrapper,
.actions,
.action-item,
.actions-bar,
.btn-group,
.btn-toolbar,
.list,
.list-item,
.list-group,
.list-group-item,
.table,
.table-header,
.table-body,
.table-footer,
.table-cell,
.grid,
.grid-item,
.flex,
.flex-item,
.container,
.section,
.article,
.aside,
.main,
.content,
.wrapper,
.layout,
.layout-header,
.layout-footer,
.layout-sidebar,
.layout-content {
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

/* 排除可编辑区域 - 这些元素应该允许选择 */
input,
textarea,
[contenteditable],
[contenteditable='true'],
[contenteditable='contenteditable'],
.el-input__inner,
.el-textarea__inner,
.el-input__wrapper,
.el-input__wrapper-inner,
.el-textarea__inner,
.el-autocomplete,
.el-autocomplete-suggestion,
.editor,
.editor-content,
.editor-wrapper,
.vditor,
.vditor-reset,
.vditor-content,
.vditor-preview,
.monaco-editor,
.monaco-editor *,
.monaco-editor .view-lines,
.monaco-editor .view-line,
.monaco-editor .mtk1,
.code-editor,
.code-editor *,
.ace_editor,
.ace_editor *,
.cm-editor,
.cm-editor *,
.cm-content,
.cm-line,
.markdown-body,
.markdown-body *:not(pre),
[data-editable='true'],
[role='textbox'],
[role='textbox'] *,
.ql-editor,
.ql-editor *,
.tox-tinymce,
.tox-tinymce *,
.tox-edit-area,
.tox-edit-area *,
.DraftEditor-root,
.DraftEditor-root *,
.public-DraftEditor-content,
.public-DraftEditor-content * {
  user-select: text !important;
  -webkit-user-select: text !important;
  -moz-user-select: text !important;
  -ms-user-select: text !important;
}

/* 代码块应该可以选择 */
pre,
code,
pre *,
code *,
.hljs,
.hljs *,
.highlight,
.highlight *,
.code-block,
.code-block *,
.syntax-highlighter,
.syntax-highlighter * {
  user-select: text !important;
  -webkit-user-select: text !important;
  -moz-user-select: text !important;
  -ms-user-select: text !important;
}

/* 链接和按钮中的文本应该可以选择（在某些情况下） */
a {
  user-select: text;
  -webkit-user-select: text;
  -moz-user-select: text;
  -ms-user-select: text;
}

/* 某些特殊组件需要文本选择功能 */
.copyable,
.selectable,
.text-selectable,
[data-selectable='true'] {
  user-select: text !important;
  -webkit-user-select: text !important;
  -moz-user-select: text !important;
  -ms-user-select: text !important;
}

/* 全局对话框圆角样式 */
.el-dialog {
  border-radius: 20px !important;
}

.el-dialog__header {
  border-radius: 20px 20px 0 0 !important;
}

.el-dialog__body {
  border-radius: 0 !important;
}

.el-dialog__footer {
  border-radius: 0 0 20px 20px !important;
}

/* Element Plus MessageBox 也使用对话框样式 */
.el-message-box {
  border-radius: 20px !important;
}

/* ============================================
   Mousedown 反馈效果 - 粗野主义原生风格
   ============================================ */

/* el-menu-item 原生按压效果 - 硬边、高对比、无过渡 */
.el-menu-item {
  transition: none !important;
}

.el-menu-item:active:not(.is-disabled) {
  /* 粗野主义：硬边框 + 内阴影凹陷感 */
  outline: 2px solid var(--el-color-primary) !important;
  outline-offset: -2px !important;
  background-color: var(--el-color-primary-light-9) !important;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.15) !important;
}

/* el-tooltip__trigger 原生按压效果 */
.el-tooltip__trigger {
  transition: none !important;
}

.el-tooltip__trigger:active {
  outline: 2px solid var(--el-color-primary) !important;
  outline-offset: -2px !important;
  background-color: var(--el-color-primary-light-9) !important;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.15) !important;
}

/* 菜单项内的图标 - 原生感的颜色反转 */
.el-menu-item .el-icon,
.el-menu-item .icon-wrapper {
  transition: none !important;
}

.el-menu-item:active:not(.is-disabled) .el-icon,
.el-menu-item:active:not(.is-disabled) .icon-wrapper {
  color: var(--el-color-primary) !important;
  filter: brightness(0.85) !important;
}

/* 现代侧边栏菜单 - 保持粗野主义风格 */
.modern-side-menu .el-menu-item:active:not(.is-disabled),
.modern-sidebar-menu .el-menu-item:active:not(.is-disabled) {
  outline: 2px solid var(--el-color-primary) !important;
  outline-offset: -2px !important;
  background-color: var(--el-color-primary-light-9) !important;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.15) !important;
  border-radius: 0 !important; /* 粗野主义：去圆角 */
}

/* 弹出菜单中的菜单项 */
.el-popper .el-menu .el-menu-item:active:not(.is-disabled) {
  outline: 2px solid var(--el-color-primary) !important;
  outline-offset: -2px !important;
  background-color: var(--el-color-primary-light-9) !important;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.15) !important;
  border-radius: 0 !important;
}

/* tooltip trigger 内部的按钮 - 粗野主义硬边效果 */
.el-tooltip__trigger > .el-button {
  transition: none !important;
}

.el-tooltip__trigger > .el-button:active {
  outline: 2px solid var(--el-color-primary) !important;
  outline-offset: -2px !important;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.15) !important;
  transform: none !important;
}

</style>
