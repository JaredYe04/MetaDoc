import { getSetting, setSetting, settings } from './settings'

export type VditorSubMode = 'wysiwyg' | 'ir'
export type MarkdownEditorSurface = 'visual' | 'code'
export type MarkdownDefaultEditorModeChoice = VditorSubMode | 'code'

const VDITOR_MODES: VditorSubMode[] = ['wysiwyg', 'ir']

export function isVditorSubMode(value: unknown): value is VditorSubMode {
  return typeof value === 'string' && VDITOR_MODES.includes(value as VditorSubMode)
}

export function isMarkdownEditorSurface(value: unknown): value is MarkdownEditorSurface {
  return value === 'visual' || value === 'code'
}

/** 旧版 Vditor SV 分屏模式迁移为 Monaco 分屏预览 */
export async function migrateLegacyEditorMode(): Promise<void> {
  const mode = await getSetting('vditorMode')
  if (mode === 'sv') {
    await setSetting('markdownEditorSurface', 'code')
    await setSetting('vditorMode', 'ir')
    settings.markdownEditorSurface = 'code'
    settings.vditorMode = 'ir'
    return
  }
  if (mode != null && !isVditorSubMode(mode)) {
    await setSetting('vditorMode', 'ir')
    settings.vditorMode = 'ir'
  }
}

export function migrateLegacyEditorModeSync(): void {
  if (settings.vditorMode === 'sv') {
    settings.markdownEditorSurface = 'code'
    settings.vditorMode = 'ir'
    void setSetting('markdownEditorSurface', 'code')
    void setSetting('vditorMode', 'ir')
  } else if (!isVditorSubMode(settings.vditorMode)) {
    settings.vditorMode = 'ir'
    void setSetting('vditorMode', 'ir')
  }
}

export async function getMarkdownEditorSurface(): Promise<MarkdownEditorSurface> {
  await migrateLegacyEditorMode()
  const surface = await getSetting('markdownEditorSurface')
  return isMarkdownEditorSurface(surface) ? surface : 'visual'
}

export async function getDefaultEditorModeChoice(): Promise<MarkdownDefaultEditorModeChoice> {
  await migrateLegacyEditorMode()
  const surface = await getMarkdownEditorSurface()
  if (surface === 'code') return 'code'
  const mode = await getSetting('vditorMode')
  return isVditorSubMode(mode) ? mode : 'ir'
}

export function getDefaultEditorModeChoiceSync(): MarkdownDefaultEditorModeChoice {
  migrateLegacyEditorModeSync()
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
  await migrateLegacyEditorMode()
  if (isMarkdownEditorSurface(tabSurface)) return tabSurface
  return getMarkdownEditorSurface()
}

/** 统一编辑模式切换入口（toolbar / 右键菜单 / 设置） */
export async function switchEditorMode(
  choice: MarkdownDefaultEditorModeChoice,
  handlers: {
    switchSurface: (target: MarkdownEditorSurface, vditorSubMode?: VditorSubMode) => Promise<void>
  }
): Promise<void> {
  if (choice === 'code') {
    await handlers.switchSurface('code')
    return
  }
  await handlers.switchSurface('visual', choice)
}
