/**
 * 修复 reka-ui / Radix DismissableLayer 关闭或组件卸载后未恢复 body 指针事件，
 * 导致除显式 pointer-events:auto 的顶栏外整页无法点击。
 */
export function restoreBodyPointerEvents(): void {
  if (typeof document === 'undefined' || !document.body) return
  document.body.style.pointerEvents = ''
  if (document.documentElement) {
    document.documentElement.style.pointerEvents = ''
  }
}

export function removeClosedDialogOverlays(): void {
  if (typeof document === 'undefined') return
  const selectors = [
    '.dialog-overlay[data-state="closed"]',
    '[data-radix-dialog-overlay][data-state="closed"]',
    '.dialog-content-viewport[data-state="closed"]',
    '.dialog-content[data-state="closed"]'
  ]
  for (const sel of selectors) {
    document.querySelectorAll(sel).forEach((el) => {
      el.remove()
    })
  }
}

/** 无可见 Element Plus 弹层时清理 body/html 上的 popup 锁定类 */
export function cleanupElementPlusPopupLock(): void {
  if (typeof document === 'undefined') return
  const visibleOverlay = document.querySelector(
    '.el-overlay:not([style*="display: none"]):not([style*="display:none"])'
  )
  if (visibleOverlay) return
  document.body.classList.remove('el-popup-parent--hidden')
  document.documentElement.classList.remove('el-popup-parent--hidden')
}

function hasOpenModalLayer(): boolean {
  if (typeof document === 'undefined') return false
  return !!document.querySelector(
    [
      '.dialog-overlay[data-state="open"]',
      '.alert-dialog-overlay[data-state="open"]',
      '.el-overlay:not([style*="display: none"]):not([style*="display:none"])',
      '[role="dialog"][data-state="open"]'
    ].join(', ')
  )
}

/** body 被锁死且无打开中的模态层时强制恢复 */
export function forceRestoreIfBodyLocked(): void {
  if (typeof document === 'undefined' || !document.body) return
  const bodyLocked =
    document.body.style.pointerEvents === 'none' ||
    document.documentElement?.style.pointerEvents === 'none'
  if (bodyLocked && !hasOpenModalLayer()) {
    restoreBodyPointerEvents()
  }
}

export function repairModalPointerEvents(delayMs = 0): void {
  const run = () => {
    removeClosedDialogOverlays()
    cleanupElementPlusPopupLock()
    forceRestoreIfBodyLocked()
    restoreBodyPointerEvents()
  }
  if (delayMs <= 0) {
    run()
    return
  }
  setTimeout(run, delayMs)
}

/** 应用启动后多次尝试修复（等待 Portal / 骨架屏卸载完成） */
export function scheduleStartupPointerEventRepair(): void {
  repairModalPointerEvents()
  repairModalPointerEvents(100)
  repairModalPointerEvents(400)
  repairModalPointerEvents(1200)
}
