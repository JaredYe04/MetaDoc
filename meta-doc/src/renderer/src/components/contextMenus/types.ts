export type ContextMenuItemType = "action" | "divider";

export interface ContextMenuItem {
  type?: ContextMenuItemType;
  label?: string;
  value?: string;
  disabled?: boolean;
  danger?: boolean;
}

