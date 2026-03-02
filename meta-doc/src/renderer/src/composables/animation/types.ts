/**
 * GPU-Accelerated Tab Animation System
 *
 * Provides smooth 60fps tab open/close animations using FLIP technique
 * with GPU-accelerated CSS transforms.
 */

export interface Position {
  x: number
  y: number
}

export interface Box {
  x: { min: number; max: number }
  y: { min: number; max: number }
}

export interface Delta {
  x: { translate: number; scale: number }
  y: { translate: number; scale: number }
}

export interface AnimationConfig {
  duration: number
  easing: string
  delay?: number
}

export interface FLIPState {
  element: HTMLElement
  first: Box
  last: Box
  delta: Delta
}

export interface TabAnimationOptions {
  duration?: number
  easing?: string
  rapidThreshold?: number
}

export const DEFAULT_ANIMATION_CONFIG: AnimationConfig = {
  duration: 200,
  easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
}

export const RAPID_ANIMATION_CONFIG: AnimationConfig = {
  duration: 150,
  easing: 'ease-out'
}
