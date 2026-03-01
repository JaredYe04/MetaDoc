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
    // 简化方案：先播放进入动画，让其他标签自然调整
    // 因为新建标签的位置逻辑复杂（可能在中间或末尾插入）
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
    // FLIP 动画：First, Last, Invert, Play
    // 1. First: 记录关闭前所有标签的位置
    const prevPositions = recordPositions()

    // 2. 获取被关闭标签的元素并创建克隆用于播放退出动画
    const tabEl = getTabElement(tabId)
    let clonedTab: HTMLElement | null = null

    if (tabEl) {
      // 创建克隆元素用于播放退出动画
      clonedTab = tabEl.cloneNode(true) as HTMLElement
      const rect = tabEl.getBoundingClientRect()
      clonedTab.style.position = 'fixed'
      clonedTab.style.left = `${rect.left}px`
      clonedTab.style.top = `${rect.top}px`
      clonedTab.style.width = `${rect.width}px`
      clonedTab.style.height = `${rect.height}px`
      clonedTab.style.zIndex = '9999'
      clonedTab.style.margin = '0'
      document.body.appendChild(clonedTab)

      // 立即隐藏原元素
      tabEl.style.opacity = '0'
    }

    // 3. 从 store 移除标签，触发 Vue DOM 更新
    // 注意：这需要调用者在 removeTab 之前调用此函数
    // 所以我们需要先返回，让调用者移除，然后再播放动画

    await nextTick()

    // 4. 计算新位置（Last）
    const listEl = tabsListRef.value
    if (listEl) {
      const tabElements = listEl.querySelectorAll('.tab-item[data-tab-id]')

      // 5. Invert: 立即应用 transform 让兄弟元素看起来还在旧位置
      tabElements.forEach((el) => {
        const id = (el as HTMLElement).dataset.tabId
        if (!id) return

        const prevLeft = prevPositions.get(id)
        if (prevLeft === undefined) return

        const currentRect = el.getBoundingClientRect()
        const deltaX = prevLeft - currentRect.left

        if (Math.abs(deltaX) > 0.5) {
          // 立即应用 transform，让元素看起来还在旧位置
          ;(el as HTMLElement).style.transform = `translateX(${deltaX}px)`
        }
      })
    }

    // 6. Play: 同时播放退出动画和位移动画
    const animations: Promise<void>[] = []

    // 兄弟标签位移动画
    if (listEl) {
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

          animations.push(
            animation.finished.then(() => {
              ;(el as HTMLElement).style.transform = ''
            })
          )
        }
      })
    }

    // 被关闭标签的退出动画（使用克隆元素）
    if (clonedTab) {
      const exitAnimation = clonedTab.animate(
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

      animations.push(
        exitAnimation.finished.then(() => {
          clonedTab?.remove()
        })
      )
    }

    // 等待所有动画完成
    await Promise.all(animations)
  }

  return {
    triggerNewTabAnimation,
    triggerCloseTabAnimation
  }
}
