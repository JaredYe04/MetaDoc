import type { ContextMenuItem } from './types'

/** Markdown 编辑器内 Vditor 大纲面板的右键菜单（与正文菜单分离） */
export function getMarkdownOutlineContextMenuItems(): ContextMenuItem[] {
  return [
    { label: 'markdownEditor.outlineMenu.optimizeSection', value: 'outline-section-optimizer' },
    { label: 'markdownEditor.outlineMenu.copySection', value: 'outline-copy-section' },
    { label: 'markdownEditor.outlineMenu.copyTitle', value: 'outline-copy-title' },
    { type: 'divider' },
    {
      label: 'markdownEditor.outlineMenu.generateIllustration',
      value: 'outline-generate-illustration'
    },
    {
      label: 'markdownEditor.outlineMenu.addToMaterialBasket',
      value: 'outline-add-material-basket'
    },
    { type: 'divider' },
    {
      label: 'markdownEditor.outlineMenu.deleteSection',
      value: 'outline-delete-section',
      danger: true
    }
  ]
}
