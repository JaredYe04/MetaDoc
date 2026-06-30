import type { ComputedRef, InjectionKey, Ref, Component } from 'vue'
import type { ExportFormat } from '../../../types'
import type { LeftMenuItemContribution } from '../host-api'

export type ExportOptionItem = { labelKey?: string; label?: string; format: string }

/** 统一「最近」项（文件或工作区文件夹） */
export type RecentOpenEntry = { path: string; kind: 'file' | 'folder' }

/** LeftMenu 向 FocusModeTabBarMenus 注入的 API（Teleport 后仍属同一组件树，inject 有效） */
export interface FocusModeLeftMenuApi {
  demoMode: () => boolean
  getMenuOrder: () => { top: string[]; bottom: string[] }
  isMenuItemVisible: (id: string) => boolean
  t: (key: string, fallback?: string) => string

  newDoc: () => void
  openDoc: () => void
  saveAll: () => void
  emitMenu: (name: string, ...args: unknown[]) => void
  openWorkspaceFromMenu: () => void
  addFolderToWorkspaceFromMenu: () => void
  closeWorkspaceFoldersFromMenu: () => void
  handleExportClick: (format: ExportFormat) => void
  exportOptions: ComputedRef<ExportOptionItem[]>
  exportOptionLabel: (option: ExportOptionItem) => string
  openExportAsTemplateDialog: () => void
  canExportAsTemplate: ComputedRef<boolean>
  refreshRecentOpens: () => Promise<void>
  recentOpens: Ref<RecentOpenEntry[]>
  openRecentItem: (entry: RecentOpenEntry) => void
  /** 仅打开文件路径（供扩展；主入口为 openRecentItem） */
  openRecentDoc: (path: string) => void
  askSave: (cb: () => void) => void
  basename: (p: string) => string

  toggleAgentSidebarPanel: () => void
  toggleWorkspaceExplorer: () => void
  toggleWorkspaceGrep: () => void

  openKnowledgeBase: () => void
  openAgent: () => void
  openDebugTools: () => void
  openLlmStatistics: () => void
  openUserFeedback: () => void
  openUserManual: () => void
  openGlobalHome: () => void
  openMenuConfigDialog: () => void
  toggleUserProfile: () => void

  isDocumentTab: ComputedRef<boolean>
  SHOW_LEFT_MENU_USER_PROFILE: boolean
  isDev: Ref<boolean>

  /** 顶栏条背景/文字：与 MainTabs 整条标签栏容器（tabsContainerBackgroundColor）一致 */
  toolbarMenuBackground: ComputedRef<string>
  toolbarMenuTextColor: ComputedRef<string>
  isAiEnabled: ComputedRef<boolean>

  pluginAiAssistantItems: ComputedRef<LeftMenuItemContribution[]>
  resolvePluginLeftMenuLabel: (item: LeftMenuItemContribution) => string
  resolvePluginLeftMenuIcon: (id: string) => Component | undefined
  resolvePluginLeftMenuIconImage: (id: string) => string | undefined
  onPluginLeftMenuClick: (item: LeftMenuItemContribution) => void
}

export const FOCUS_LEFT_MENU_API_KEY: InjectionKey<FocusModeLeftMenuApi> =
  Symbol('focusLeftMenuApi')
