import type {
  DocumentViewRegistration,
  LegacyDocumentViewContribution,
  ViewMenuConfigEntry,
  ViewWhenContext
} from './types'

const viewRegistry = new Map<string, DocumentViewRegistration>()

const DEFAULT_VIEW_ORDER: Record<string, number> = {
  home: 10,
  editor: 20,
  outline: 30,
  visualize: 40,
  proofread: 50,
  agent: 60
}

function resolveLabel(label: DocumentViewRegistration['label']): string {
  return typeof label === 'function' ? label() : label
}

function resolveIcon(icon: DocumentViewRegistration['iconImage']): string | undefined {
  if (!icon) return undefined
  return typeof icon === 'function' ? icon() : icon
}

export function legacyContributionToRegistration(
  legacy: LegacyDocumentViewContribution
): DocumentViewRegistration {
  const id = String(legacy.view)
  return {
    id,
    component: legacy.component,
    label: legacy.label ?? id,
    order: DEFAULT_VIEW_ORDER[id] ?? 100,
    requiresLlm: id === 'proofread' || id === 'agent',
    showInViewMenu: id === 'proofread',
    renderMode: 'component'
  }
}

export function registerView(reg: DocumentViewRegistration): () => void {
  const normalized: DocumentViewRegistration = {
    showInViewMenu: true,
    renderMode: 'component',
    order: DEFAULT_VIEW_ORDER[String(reg.id)] ?? 100,
    ...reg,
    id: String(reg.id)
  }
  viewRegistry.set(normalized.id, normalized)
  return () => viewRegistry.delete(normalized.id)
}

export function unregisterView(id: string): void {
  viewRegistry.delete(id)
}

export function getView(id: string): DocumentViewRegistration | undefined {
  return viewRegistry.get(id)
}

export function getAllViews(): DocumentViewRegistration[] {
  return [...viewRegistry.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

export function clearViewRegistry(): void {
  viewRegistry.clear()
}

function passesRuntimeWhen(reg: DocumentViewRegistration, ctx: ViewWhenContext): boolean {
  if (reg.requiresLlm && !ctx.llmEnabled) return false
  if (reg.when && !reg.when(ctx)) return false
  return true
}

export function getRegisteredViewsForRender(ctx: ViewWhenContext): DocumentViewRegistration[] {
  return getAllViews().filter((reg) => passesRuntimeWhen(reg, ctx))
}

export interface ViewMenuItemDescriptor {
  id: string
  label: string
  iconImage?: string
  isCore: boolean
  order: number
  visible: boolean
  registration: DocumentViewRegistration
}

function mergeViewMenuConfig(
  registrations: DocumentViewRegistration[],
  config: ViewMenuConfigEntry[] | null | undefined
): ViewMenuItemDescriptor[] {
  const configMap = new Map((config ?? []).map((e) => [e.id, e]))
  const items: ViewMenuItemDescriptor[] = registrations
    .filter((r) => r.showInViewMenu !== false)
    .map((reg) => {
      const saved = configMap.get(reg.id)
      const isCore = reg.isCore === true
      return {
        id: reg.id,
        label: resolveLabel(reg.label),
        iconImage: resolveIcon(reg.iconImage),
        isCore,
        order: reg.order ?? 100,
        visible: isCore ? true : (saved?.visible ?? true),
        registration: reg
      }
    })

  if (config && config.length > 0) {
    const orderIndex = new Map(config.map((e, i) => [e.id, i]))
    items.sort((a, b) => {
      const ai = orderIndex.has(a.id) ? orderIndex.get(a.id)! : 1000 + a.order
      const bi = orderIndex.has(b.id) ? orderIndex.get(b.id)! : 1000 + b.order
      return ai - bi
    })
  } else {
    items.sort((a, b) => a.order - b.order)
  }

  return items
}

/** ViewMenu sidebar items after user config + runtime when() */
export function getViewMenuItems(
  ctx: ViewWhenContext,
  config?: ViewMenuConfigEntry[] | null
): ViewMenuItemDescriptor[] {
  const eligible = getAllViews().filter(
    (reg) => reg.showInViewMenu !== false && passesRuntimeWhen(reg, ctx)
  )
  return mergeViewMenuConfig(eligible, config).filter((item) => item.visible)
}

/** All configurable ViewMenu entries (for config dialog), including hidden */
export function getViewMenuConfigItems(
  ctx: ViewWhenContext,
  config?: ViewMenuConfigEntry[] | null
): ViewMenuItemDescriptor[] {
  const eligible = getAllViews().filter(
    (reg) => reg.showInViewMenu !== false && passesRuntimeWhen(reg, ctx)
  )
  return mergeViewMenuConfig(eligible, config)
}

export function getViewMenuConfigurableRegistrations(): DocumentViewRegistration[] {
  return getAllViews().filter((reg) => reg.showInViewMenu !== false)
}

/** Config dialog entries — ignores runtime when() / requiresLlm */
export function getViewMenuConfigDialogItems(
  config?: ViewMenuConfigEntry[] | null
): ViewMenuItemDescriptor[] {
  return mergeViewMenuConfig(getViewMenuConfigurableRegistrations(), config)
}

export const viewRegistryMap = viewRegistry
