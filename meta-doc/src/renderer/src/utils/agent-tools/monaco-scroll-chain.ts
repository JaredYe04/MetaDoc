/**
 * 当 Monaco 编辑器滚动到顶部/底部时，将 wheel 事件传递给外层消息框滚动容器，
 * 避免光标在 Monaco 内时无法继续滚动消息列表。
 */

export interface MonacoScrollInfo {
  scrollTop: number
  scrollHeight: number
  height: number
}

/**
 * 查找可滚动的祖先节点（reka-ui/radix ScrollArea 视口或 overflow-y: auto/scroll 的节点）。
 */
export function getScrollableAncestor(el: HTMLElement): HTMLElement | null {
  const viewport =
    (el.closest('[data-reka-scroll-area-viewport]') as HTMLElement | null) ||
    (el.closest('[data-radix-scroll-area-viewport]') as HTMLElement | null)
  if (viewport && viewport.scrollHeight > viewport.clientHeight) return viewport
  let p: HTMLElement | null = el.parentElement
  while (p) {
    const style = getComputedStyle(p)
    const oy = style.overflowY
    if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && p.scrollHeight > p.clientHeight)
      return p
    p = p.parentElement
  }
  return null
}

/**
 * 在 Monaco 容器上绑定 wheel：当已到顶部且向上滚、或已到底部且向下滚时，
 * 阻止默认并让外层消息框滚动。
 * @param containerEl Monaco 的容器 DOM（如 editor.getContainerDomNode() 或包裹 div）
 * @param getScrollInfo 返回当前 scrollTop、scrollHeight、可视高度
 * @returns 清理函数，在组件 unmount 或编辑器 dispose 时调用
 */
export function attachMonacoWheelScrollChain(
  containerEl: HTMLElement,
  getScrollInfo: () => MonacoScrollInfo
): () => void {
  const onWheel = (e: WheelEvent) => {
    const { scrollTop, scrollHeight, height } = getScrollInfo()
    const atTop = scrollTop <= 0
    const atBottom = scrollTop + height >= scrollHeight - 1
    if ((atTop && e.deltaY < 0) || (atBottom && e.deltaY > 0)) {
      e.preventDefault()
      e.stopPropagation()
      const scrollable = getScrollableAncestor(containerEl)
      if (scrollable) scrollable.scrollBy(0, e.deltaY)
    }
  }
  containerEl.addEventListener('wheel', onWheel, { passive: false, capture: true })
  return () => {
    containerEl.removeEventListener('wheel', onWheel, { capture: true })
  }
}
