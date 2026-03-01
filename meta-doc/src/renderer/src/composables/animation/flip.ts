import type { Box, Delta, FLIPState, AnimationConfig } from './types'

/**
 * Calculate delta between first and last positions
 */
export function calcDelta(first: Box, last: Box): Delta {
  return {
    x: {
      translate: first.x.min - last.x.min,
      scale: (first.x.max - first.x.min) / (last.x.max - last.x.min) || 1
    },
    y: {
      translate: first.y.min - last.y.min,
      scale: (first.y.max - first.y.min) / (last.y.max - last.y.min) || 1
    }
  }
}

/**
 * Convert DOMRect to Box format
 */
export function rectToBox(rect: DOMRect): Box {
  return {
    x: { min: rect.left, max: rect.right },
    y: { min: rect.top, max: rect.bottom }
  }
}

/**
 * Build GPU-accelerated transform string
 */
export function buildTransform(delta: Delta): string {
  const { x, y } = delta
  let transform = ''

  if (x.translate !== 0 || y.translate !== 0) {
    transform += `translate3d(${x.translate}px, ${y.translate}px, 0) `
  }

  if (x.scale !== 1 || y.scale !== 1) {
    transform += `scale3d(${x.scale}, ${y.scale}, 1)`
  }

  return transform.trim() || 'none'
}

/**
 * Apply FLIP animation using Web Animations API
 * 
 * Step 1: Invert - Apply transform to put element at "first" position
 * Step 2: Play - Animate to identity (no transform)
 */
export function applyFLIP(
  element: HTMLElement,
  delta: Delta,
  config: AnimationConfig
): Animation {
  // Invert: Apply transform immediately (same frame)
  const invertTransform = buildTransform(delta)
  element.style.transform = invertTransform

  // Play: Animate to identity on next frame
  const animation = element.animate(
    [
      { transform: invertTransform },
      { transform: 'translate3d(0, 0, 0) scale3d(1, 1, 1)' }
    ],
    {
      duration: config.duration,
      easing: config.easing,
      fill: 'forwards'
    }
  )

  animation.finished.then(() => {
    element.style.transform = ''
  })

  return animation
}

/**
 * Force synchronous layout (critical for FLIP)
 * Call this between DOM changes to ensure positions are calculated
 */
export function forceLayout(element: HTMLElement): void {
  element.offsetHeight
}

/**
 * Wait for next animation frame
 */
export function nextFrame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()))
}