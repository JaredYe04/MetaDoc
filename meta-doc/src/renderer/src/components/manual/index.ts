/**
 * Manual 组件库 - 用户手册专用组件
 *
 * 提供在 Markdown 文档中展示 UI 组件的解决方案
 */

// Dialog 相关组件 - 用于在用户手册中内嵌展示 Dialog
export { default as DialogDemoWrapper } from './DialogDemoWrapper.vue'
export { default as DemoDialogContent } from './DemoDialogContent.vue'
export { default as DialogContainer } from './DialogContainer.vue'
export { default as InlineDialog } from './InlineDialog.vue'
export { default as InlineDialogDemo } from './InlineDialogDemo.vue'

// 类型导出
export type { DialogDemoWrapperProps, DialogDemoContext } from './DialogDemoWrapper.vue'
export type { InlineDialogProps, InlineDialogContext } from './InlineDialog.vue'

// 组合式函数导出
export { DialogDemoContextKey } from './DialogDemoWrapper.vue'
export { InlineDialogContextKey } from './InlineDialog.vue'
