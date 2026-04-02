export type ContextMenuItemType = 'action' | 'divider' | 'submenu'

export interface ContextMenuItem {
  type?: ContextMenuItemType
  label?: string
  value?: string
  disabled?: boolean
  danger?: boolean
  shortcut?: string // 快捷键显示文本，如 "Shift+Tab"
  /** 二级菜单项（type 为 submenu 时使用） */
  children?: ContextMenuItem[]
}
