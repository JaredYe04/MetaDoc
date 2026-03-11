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
 * 查找可滚动的祖先节点（reka-ui/radix ScrollArea 视口、el-scrollbar__wrap 或 overflow-y: auto/scroll 的节点）。
 */
export function getScrollableAncestor(el: HTMLElement): HTMLElement | null {
  const viewport =
    (el.closest('[data-reka-scroll-area-viewport]') as HTMLElement | null) ||
    (el.closest('[data-radix-scroll-area-viewport]') as HTMLElement | null)
  if (viewport && viewport.scrollHeight > viewport.clientHeight) return viewport
  const scrollbarWrap = el.closest('.el-scrollbar__wrap') as HTMLElement | null
  if (scrollbarWrap && scrollbarWrap.scrollHeight > scrollbarWrap.clientHeight) return scrollbarWrap
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
 * 在任意可滚动元素上绑定 wheel 滚动链：当已到顶部且向上滚、或已到底部且向下滚时，
 * 将滚动传递给外层可滚动容器（全局滚动）。
 * 用于 el-scrollbar__wrap、ScrollArea viewport 或普通 overflow 容器。
 * @param scrollableEl 实际发生滚动的 DOM 元素（如 .el-scrollbar__wrap）
 * @returns 清理函数，在组件 unmount 时调用
 */
export function attachWheelScrollChainForElement(scrollableEl: HTMLElement): () => void {
  const onWheel = (e: WheelEvent) => {
    const scrollTop = scrollableEl.scrollTop
    const scrollHeight = scrollableEl.scrollHeight
    const height = scrollableEl.clientHeight
    const atTop = scrollTop <= 0
    const atBottom = scrollTop + height >= scrollHeight - 1
    if ((atTop && e.deltaY < 0) || (atBottom && e.deltaY > 0)) {
      e.preventDefault()
      e.stopPropagation()
      const scrollable = getScrollableAncestor(scrollableEl)
      if (scrollable) scrollable.scrollBy(0, e.deltaY)
    }
  }
  scrollableEl.addEventListener('wheel', onWheel, { passive: false, capture: true })
  return () => {
    scrollableEl.removeEventListener('wheel', onWheel, { capture: true })
  }
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
