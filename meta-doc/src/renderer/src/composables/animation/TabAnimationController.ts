import { nextTick, type Ref } from 'vue'
import type { Box, AnimationConfig, TabAnimationOptions } from './types'
import { DEFAULT_ANIMATION_CONFIG, RAPID_ANIMATION_CONFIG } from './types'
import { rectToBox, calcDelta, buildTransform, nextFrame } from './flip'

/**
 * GPU-Accelerated Tab Animation Controller
 * 
 * Handles smooth 60fps tab open/close animations using FLIP technique:
 * - First: Record positions before DOM change
 * - Last: Measure positions after DOM change
 * - Invert: Apply transforms to make elements appear at old positions
 * - Play: Animate transforms to identity
 */
export class TabAnimationController {
  private containerRef: Ref<HTMLElement | null>
  private lastAnimationTime = 0
  private activeAnimations = new Map<string, Animation>()

  constructor(containerRef: Ref<HTMLElement | null>) {
    this.containerRef = containerRef
  }

  /**
   * Get tab element by ID
   */
  private getTabElement(tabId: string): HTMLElement | null {
    const container = this.containerRef.value
    if (!container) return null
    return container.querySelector(`[data-tab-id="${tabId}"]`)
  }

  /**
   * Record current positions of all tabs
   * 
   * Step 1 of FLIP: Capture "First" state
   */
  private recordPositions(excludeTabId?: string): Map<string, Box> {
    const positions = new Map<string, Box>()
    const container = this.containerRef.value
    if (!container) return positions

    const tabs = container.querySelectorAll('[data-tab-id]')
    
    tabs.forEach((tab) => {
      const id = (tab as HTMLElement).dataset.tabId
      if (!id || id === excludeTabId) return

      // Temporarily remove transform to capture natural layout position
      const prevTransform = (tab as HTMLElement).style.transform
      ;(tab as HTMLElement).style.transform = 'none'
      
      const rect = tab.getBoundingClientRect()
      positions.set(id, rectToBox(rect))
      
      // Restore transform
      ;(tab as HTMLElement).style.transform = prevTransform
    })

    return positions
  }

  /**
   * Animate tab opening
   * 
   * Visual: New tab slides in from left, existing tabs slide right to make room
   */
  async animateTabOpen(newTabId: string, options: TabAnimationOptions = {}): Promise<void> {
    const config = this.getAnimationConfig(options)
    
    // Step 1: FIRST - Record positions before DOM change
    const firstPositions = this.recordPositions()

    // Wait for Vue to add new tab to DOM
    await nextTick()

    // Get container
    const container = this.containerRef.value
    if (!container) return

    // Step 2: LAST - Immediately measure new positions and apply invert
    // CRITICAL: Must do this in the same frame to avoid visual flash
    const newTab = this.getTabElement(newTabId)
    const invertTransforms = new Map<string, string>()

    // Calculate deltas and prepare invert transforms
    firstPositions.forEach((first, id) => {
      const tab = this.getTabElement(id)
      if (!tab) return

      // Temporarily clear transform to measure natural layout position
      const previousTransform = tab.style.transform
      tab.style.transform = 'none'
      
      // Measure new position
      const rect = tab.getBoundingClientRect()
      const last = rectToBox(rect)
      
      // Restore transform
      tab.style.transform = previousTransform

      // Calculate delta
      const delta = calcDelta(first, last)
      
      if (Math.abs(delta.x.translate) > 0.5) {
        // Cancel any existing animation
        this.activeAnimations.get(id)?.cancel()
        
        // Store the invert transform
        const transform = buildTransform(delta)
        invertTransforms.set(id, transform)
      }
    })

    // Step 3: INVERT - Apply all transforms immediately (same frame)
    invertTransforms.forEach((transform, id) => {
      const tab = this.getTabElement(id)
      if (tab) {
        tab.style.transform = transform
      }
    })

    // Step 4: PLAY - Animate to final positions on next frame
    await nextFrame()

    const animations: Promise<void>[] = []

    // Animate existing tabs
    invertTransforms.forEach((transform, id) => {
      const tab = this.getTabElement(id)
      if (!tab) return

      const animation = tab.animate(
        [
          { transform },
          { transform: 'translate3d(0, 0, 0)' }
        ],
        {
          duration: config.duration,
          easing: config.easing,
          fill: 'forwards'
        }
      )

      this.activeAnimations.set(id, animation)
      animations.push(
        animation.finished
          .then(() => {
            tab.style.transform = ''
          })
          .catch(() => {
            // Animation was cancelled - cleanup will be handled by cancelAll
          })
          .finally(() => {
            this.activeAnimations.delete(id)
          })
      )
    })

    // Animate new tab entry
    if (newTab) {
      const animation = newTab.animate(
        [
          { transform: 'translate3d(-40px, 0, 0)', opacity: 0.6 },
          { transform: 'translate3d(0, 0, 0)', opacity: 1 }
        ],
        {
          duration: config.duration,
          easing: config.easing,
          fill: 'forwards'
        }
      )

      animations.push(animation.finished as Promise<void>)
    }

    await Promise.all(animations)
  }

  /**
   * Animate tab closing
   * 
   * Visual: Closing tab slides out left, siblings smoothly slide left to fill
   */
  async animateTabClose(tabId: string, onRemove: () => void): Promise<void> {
    // Step 1: FIRST - Record positions before removal
    const firstPositions = this.recordPositions()
    
    // Get closing tab for exit animation
    const closingTab = this.getTabElement(tabId)
    let exitClone: HTMLElement | null = null

    if (closingTab) {
      // Create clone for exit animation
      exitClone = closingTab.cloneNode(true) as HTMLElement
      const rect = closingTab.getBoundingClientRect()
      const computedStyle = window.getComputedStyle(closingTab)
      
      // Copy computed styles to ensure CSS variables are inherited
      exitClone.style.cssText = `
        position: fixed;
        left: ${rect.left}px;
        top: ${rect.top}px;
        width: ${rect.width}px;
        height: ${rect.height}px;
        margin: 0;
        z-index: 9999;
        pointer-events: none;
        background-color: ${computedStyle.backgroundColor};
        color: ${computedStyle.color};
        border-radius: ${computedStyle.borderRadius};
        font-size: ${computedStyle.fontSize};
        font-family: ${computedStyle.fontFamily};
      `
      
      document.body.appendChild(exitClone)
      
      // Hide original immediately
      closingTab.style.opacity = '0'
    }

    // Step 2: Remove from store (triggers Vue DOM update)
    onRemove()

    // Wait for DOM update
    await nextTick()

    const container = this.containerRef.value
    if (!container) {
      exitClone?.remove()
      return
    }

    // Force layout calculation (eslint-disable for intentional side-effect)
    // eslint-disable-next-line no-unused-expressions
    container.offsetHeight

    // Step 3 & 4: INVERT + PLAY
    const animations: Promise<void>[] = []

    // Animate siblings filling the gap
    firstPositions.forEach((first, id) => {
      const tab = this.getTabElement(id)
      if (!tab) return

      // Measure new position
      const prevTransform = tab.style.transform
      tab.style.transform = 'none'
      const rect = tab.getBoundingClientRect()
      const last = rectToBox(rect)
      tab.style.transform = prevTransform

      const delta = calcDelta(first, last)

      if (Math.abs(delta.x.translate) > 0.5) {
        // Cancel existing animation
        this.activeAnimations.get(id)?.cancel()

        const transform = buildTransform(delta)
        tab.style.transform = transform

        const animation = tab.animate(
          [
            { transform },
            { transform: 'translate3d(0, 0, 0)' }
          ],
          {
            duration: 180,
            easing: 'ease-out',
            fill: 'forwards'
          }
        )

        this.activeAnimations.set(id, animation)
        animations.push(
          animation.finished.then(() => {
            tab.style.transform = ''
            this.activeAnimations.delete(id)
          })
        )
      }
    })

    // Animate closing tab exit
    if (exitClone) {
      const animation = exitClone.animate(
        [
          { transform: 'translate3d(0, 0, 0)', opacity: 1 },
          { transform: 'translate3d(-40px, 0, 0)', opacity: 0 }
        ],
        {
          duration: 200,
          easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
          fill: 'forwards'
        }
      )

      // Track clone for cleanup
      const cloneAnimation = animation
      
      animations.push(
        cloneAnimation.finished
          .then(() => {
            exitClone.remove()
          })
          .catch(() => {
            // Animation cancelled - still need to cleanup
            exitClone.remove()
          })
      )
    }

    try {
      await Promise.all(animations)
    } finally {
      // Ensure clone is always cleaned up
      if (exitClone && exitClone.parentNode) {
        exitClone.remove()
      }
    }
  }

  /**
   * Cancel all active animations
   */
  cancelAll(): void {
    this.activeAnimations.forEach((animation, id) => {
      animation.cancel()
      const tab = this.getTabElement(id)
      if (tab) {
        tab.style.transform = ''
      }
    })
    this.activeAnimations.clear()
  }

  /**
   * Get animation configuration based on recent activity
   */
  private getAnimationConfig(options: TabAnimationOptions): AnimationConfig {
    const now = Date.now()
    const isRapid = now - this.lastAnimationTime < (options.rapidThreshold ?? 150)
    this.lastAnimationTime = now

    return isRapid ? RAPID_ANIMATION_CONFIG : DEFAULT_ANIMATION_CONFIG
  }
}