/**
 * Vitest setup: provide minimal browser globals when dependency chain loads store/views
 */
import { vi } from 'vitest'

if (typeof globalThis.window === 'undefined') {
  ;(globalThis as any).window = {
    location: { search: '', href: 'file:///' },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} }
  }
}
