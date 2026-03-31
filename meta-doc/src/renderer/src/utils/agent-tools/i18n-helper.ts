/**
 * Agent Tool text helper: English only for tool name/description/instruction.
 * ToolLocales still supported for backward compatibility; we always prefer English.
 */

import type { ToolLocales } from '../../types/agent-tool'

const PREFERRED_LOCALES = ['en_us', 'en_US']

/**
 * Get display text from string or ToolLocales. Prefer English, then first available.
 */
export function getLocalizedText(text: string | ToolLocales): string {
  if (typeof text === 'string') {
    return text
  }

  if (typeof text !== 'object' || text === null) {
    return ''
  }

  const locales = text as ToolLocales

  for (const locale of PREFERRED_LOCALES) {
    const entry = locales[locale]
    if (entry && typeof entry === 'object') {
      const s = entry.name || entry.description || ''
      if (s) return s
    }
  }

  const values = Object.values(locales)
  for (const v of values) {
    if (v && typeof v === 'object') {
      const s =
        (v as { name?: string; description?: string }).name ||
        (v as { name?: string; description?: string }).description ||
        ''
      if (s) return s
    }
  }

  return ''
}

/**
 * Get instruction text from string or ToolLocales. English only.
 */
export function getLocalizedInstruction(instruction: string | ToolLocales): string {
  if (typeof instruction === 'string') {
    return instruction
  }

  if (typeof instruction !== 'object' || instruction === null) {
    return ''
  }

  const locales = instruction as ToolLocales

  for (const locale of PREFERRED_LOCALES) {
    const entry = locales[locale]
    if (entry && typeof entry === 'object' && (entry as { instruction?: string }).instruction) {
      return (entry as { instruction: string }).instruction
    }
  }

  for (const v of Object.values(locales)) {
    if (v && typeof v === 'object' && (v as { instruction?: string }).instruction) {
      return (v as { instruction: string }).instruction
    }
  }

  return ''
}
