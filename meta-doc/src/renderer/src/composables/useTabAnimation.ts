import { ref, nextTick, type Ref } from 'vue'
import { useWorkspace, type WorkspaceTab } from '../stores/workspace'

const ANIMATION_DURATION = 200
const RAPID_CREATE_THRESHOLD = 150

export function useTabAnimation(
  tabsListRef: Ref<HTMLElement | null>,
  allTabs: Ref<WorkspaceTab[]>
) {
  const workspace = useWorkspace()
  const lastAnimationTime = ref(0)

  const getTabElement = (tabId: string): HTMLElement | null => {
    const listEl = tabsListRef.value
    if (!listEl) return null
    return listEl.querySelector(`.tab-item[data-tab-id="${tabId}"]`)
  }

  const recordPositions = (): Map<string, number> => {
    const positions = new Map<string, number>()
    const listEl = tabsListRef.value
    if (!listEl) return positions

    const tabElements = listEl.querySelectorAll('.tab-item[data-tab-id]')
    tabElements.forEach((el) => {
      const id = (el as HTMLElement).dataset.tabId
      if (id) {
        const rect = el.getBoundingClientRect()
        positions.set(id, rect.left)
      }
    })

    return positions
  }

  const animateTabEnter = async (newTabId: string): Promise<void> => {
    const tabEl = getTabElement(newTabId)
    if (!tabEl) return

    const now = Date.now()
    const isRapid = now - lastAnimationTime.value < RAPID_CREATE_THRESHOLD
    lastAnimationTime.value = now

    const duration = isRapid ? 150 : ANIMATION_DURATION

    const animation = tabEl.animate(
      [
        { transform: 'translateX(-40px)', opacity: 0.6 },
        { transform: 'translateX(0)', opacity: 1 }
      ],
      {
        duration,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        fill: 'forwards'
      }
    )

    await animation.finished

    const tab = allTabs.value.find((t) => t.id === newTabId)
    if (tab && tab._isNewTab) {
      tab._isNewTab = false
    }
  }

  const animateSiblings = (prevPositions: Map<string, number>): void => {
    const listEl = tabsListRef.value
    if (!listEl) return

    const tabElements = listEl.querySelectorAll('.tab-item[data-tab-id]')

    tabElements.forEach((el) => {
      const id = (el as HTMLElement).dataset.tabId
      if (!id) return

      const prevLeft = prevPositions.get(id)
      if (prevLeft === undefined) return

      const currentRect = el.getBoundingClientRect()
      const deltaX = prevLeft - currentRect.left

      if (Math.abs(deltaX) > 0.5) {
        const animation = el.animate(
          [{ transform: `translateX(${deltaX}px)` }, { transform: 'translateX(0)' }],
          {
            duration: 180,
            easing: 'ease-out',
            fill: 'forwards'
          }
        )

        animation.finished.then(() => {
          ;(el as HTMLElement).style.transform = ''
        })
      }
    })
  }

  const triggerNewTabAnimation = async (newTabId: string): Promise<void> => {
    const prevPositions = recordPositions()

    await nextTick()

    animateSiblings(prevPositions)
    await animateTabEnter(newTabId)
  }

  const animateTabExit = async (tabId: string): Promise<void> => {
    const tabEl = getTabElement(tabId)
    if (!tabEl) return

    const animation = tabEl.animate(
      [
        { transform: 'translateX(0)', opacity: 1 },
        { transform: 'translateX(-40px)', opacity: 0 }
      ],
      {
        duration: ANIMATION_DURATION,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        fill: 'forwards'
      }
    )

    await animation.finished
  }

  const triggerCloseTabAnimation = async (tabId: string): Promise<void> => {
    const prevPositions = recordPositions()
    await animateTabExit(tabId)
    await nextTick()
    animateSiblings(prevPositions)
  }

  return {
    triggerNewTabAnimation,
    triggerCloseTabAnimation
  }
}
