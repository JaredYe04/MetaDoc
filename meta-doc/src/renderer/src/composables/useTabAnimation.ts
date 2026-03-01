import { type Ref } from 'vue'
import { TabAnimationController } from './animation'
import type { TabAnimationOptions } from './animation'

/**
 * Composable for tab animations in MainTabs component
 * 
 * Provides GPU-accelerated FLIP animations for tab open/close operations
 */
export function useTabAnimation(
  tabsListRef: Ref<HTMLElement | null>
) {
  const controller = new TabAnimationController(tabsListRef)

  return {
    /**
     * Animate tab opening with squeeze effect
     */
    triggerNewTabAnimation: (newTabId: string, options?: TabAnimationOptions) =>
      controller.animateTabOpen(newTabId, options),

    /**
     * Animate tab closing with retract effect
     */
    triggerCloseTabAnimation: (tabId: string, onRemove: () => void) =>
      controller.animateTabClose(tabId, onRemove),

    /**
     * Cancel all active animations
     */
    cancelAnimations: () => controller.cancelAll()
  }
}