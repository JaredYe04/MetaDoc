import type { InjectionKey, Ref } from 'vue'

/** DialogRoot 向 DialogContent 提供受控 open，用于关闭时恢复 body 指针与清理遮罩（radix DialogContent 的 props 不含 open） */
export const DIALOG_OPEN_REF_KEY: InjectionKey<Ref<boolean | undefined>> =
  Symbol('metadoc.dialogOpenRef')
