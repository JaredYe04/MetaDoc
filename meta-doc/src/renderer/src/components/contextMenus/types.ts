export type ContextMenuItemType = "action" | "divider";

export interface ContextMenuItem {
  type?: ContextMenuItemType;
  label?: string;
  value?: string;
  disabled?: boolean;
  danger?: boolean;
  shortcut?: string; // 快捷键显示文本，如 "Ctrl+Tab" 或 "⌘Tab"
}

