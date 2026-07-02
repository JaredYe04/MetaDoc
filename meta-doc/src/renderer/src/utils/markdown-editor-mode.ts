import { getSetting, setSetting, settings } from './settings'

export type VditorSubMode = 'wysiwyg' | 'ir' | 'sv'
export type MarkdownEditorSurface = 'visual' | 'code'
export type MarkdownDefaultEditorModeChoice = VditorSubMode | 'code'

const VDITOR_MODES: VditorSubMode[] = ['wysiwyg', 'ir', 'sv']

export function isVditorSubMode(value: unknown): value is VditorSubMode {
  return typeof value === 'string' && VDITOR_MODES.includes(value as VditorSubMode)
}

export function isMarkdownEditorSurface(value: unknown): value is MarkdownEditorSurface {
  return value === 'visual' || value === 'code'
}

export async function getMarkdownEditorSurface(): Promise<MarkdownEditorSurface> {
  const surface = await getSetting('markdownEditorSurface')
  return isMarkdownEditorSurface(surface) ? surface : 'visual'
}

export async function getDefaultEditorModeChoice(): Promise<MarkdownDefaultEditorModeChoice> {
  const surface = await getMarkdownEditorSurface()
  if (surface === 'code') return 'code'
  const mode = await getSetting('vditorMode')
  return isVditorSubMode(mode) ? mode : 'ir'
}

export function getDefaultEditorModeChoiceSync(): MarkdownDefaultEditorModeChoice {
  const surface = settings.markdownEditorSurface
  if (surface === 'code') return 'code'
  const mode = settings.vditorMode
  return isVditorSubMode(mode) ? mode : 'ir'
}

export async function applyDefaultEditorModeChoice(
  choice: MarkdownDefaultEditorModeChoice
): Promise<void> {
  if (choice === 'code') {
    await setSetting('markdownEditorSurface', 'code')
    settings.markdownEditorSurface = 'code'
    return
  }
  await setSetting('markdownEditorSurface', 'visual')
  await setSetting('vditorMode', choice)
  settings.markdownEditorSurface = 'visual'
  settings.vditorMode = choice
}

export async function resolveInitialMarkdownEditorSurface(
  tabSurface?: MarkdownEditorSurface
): Promise<MarkdownEditorSurface> {
  if (isMarkdownEditorSurface(tabSurface)) return tabSurface
  return getMarkdownEditorSurface()
}
