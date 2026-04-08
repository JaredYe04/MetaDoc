/**
 * Vditor 工具栏：在光标右下方显示 aria-label 文案，替代内置 vditor-tooltipped 气泡。
 * .vditor-menu--disabled 及 disabled 控件不显示。
 */
export function attachVditorToolbarCursorTooltip(editorRoot: HTMLElement): () => void {
  const toolbar = editorRoot.querySelector('.vditor-toolbar') as HTMLElement | null
  if (!toolbar) return () => {}

  const tipEl = document.createElement('div')
  tipEl.className = 'metadoc-vditor-cursor-tooltip'
  tipEl.setAttribute('role', 'tooltip')
  Object.assign(tipEl.style, {
    position: 'fixed',
    zIndex: '100004',
    pointerEvents: 'none',
    maxWidth: '320px',
    padding: '5px 9px',
    fontSize: '12px',
    lineHeight: '1.4',
    background: 'rgba(48, 48, 50, 0.94)',
    color: '#f6f6f6',
    borderRadius: '6px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
    display: 'none',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word'
  })
  document.body.appendChild(tipEl)

  let activeLabelEl: HTMLElement | null = null

  function isToolbarItemDisabled(item: Element | null): boolean {
    if (!item) return true
    if (item.classList.contains('vditor-menu--disabled')) return true
    const b = item.querySelector('button[disabled], [aria-disabled="true"]')
    return !!b
  }

  function findLabelElement(from: HTMLElement): HTMLElement | null {
    let cur: HTMLElement | null = from
    while (cur && toolbar.contains(cur)) {
      const item = cur.closest('.vditor-toolbar__item')
      if (isToolbarItemDisabled(item)) return null
      const label = cur.getAttribute('aria-label')?.trim()
      if (label && cur.closest('.vditor-toolbar') === toolbar) {
        return cur
      }
      cur = cur.parentElement
    }
    return null
  }

  function positionTip(clientX: number, clientY: number) {
    const offsetX = 14
    const offsetY = 16
    tipEl.style.display = 'block'
    const w = tipEl.offsetWidth
    const h = tipEl.offsetHeight
    let left = clientX + offsetX
    let top = clientY + offsetY
    if (left + w > window.innerWidth - 6) left = Math.max(6, window.innerWidth - w - 6)
    if (top + h > window.innerHeight - 6) top = Math.max(6, window.innerHeight - h - 6)
    tipEl.style.left = `${left}px`
    tipEl.style.top = `${top}px`
  }

  function show(text: string, clientX: number, clientY: number) {
    tipEl.textContent = text
    positionTip(clientX, clientY)
  }

  function hide() {
    tipEl.style.display = 'none'
    activeLabelEl = null
  }

  const onToolbarMove = (e: MouseEvent) => {
    if (!activeLabelEl) return
    const label = activeLabelEl.getAttribute('aria-label')?.trim()
    if (label) show(label, e.clientX, e.clientY)
  }

  const onToolbarOver = (e: MouseEvent) => {
    const t = e.target as HTMLElement
    if (!toolbar.contains(t)) return
    const el = findLabelElement(t)
    if (!el) {
      hide()
      toolbar.removeEventListener('mousemove', onToolbarMove)
      return
    }
    const label = el.getAttribute('aria-label')?.trim()
    if (!label) {
      hide()
      return
    }
    activeLabelEl = el
    show(label, e.clientX, e.clientY)
    toolbar.addEventListener('mousemove', onToolbarMove)
  }

  const onToolbarOut = (e: MouseEvent) => {
    const rel = e.relatedTarget as Node | null
    if (rel && toolbar.contains(rel)) return
    toolbar.removeEventListener('mousemove', onToolbarMove)
    hide()
  }

  toolbar.addEventListener('mouseover', onToolbarOver)
  toolbar.addEventListener('mouseout', onToolbarOut)

  return () => {
    toolbar.removeEventListener('mouseover', onToolbarOver)
    toolbar.removeEventListener('mouseout', onToolbarOut)
    toolbar.removeEventListener('mousemove', onToolbarMove)
    tipEl.remove()
  }
}
