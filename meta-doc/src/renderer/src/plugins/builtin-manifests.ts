import type { MetaDocPlugin } from '../host-api'
import { registerBuiltinPluginLoader } from '../core/plugin-loader'
import type { AiCapabilityId } from '../ai-runtime/capabilities'
import { CAPABILITY_PLUGIN_IDS } from '../ai-runtime/capabilities'

export const builtinPluginCatalog = [
  {
    id: 'metadoc.builtin.completion',
    name: 'AI Auto Completion',
    activationEvents: ['onCapability:completion']
  },
  {
    id: 'metadoc.builtin.section-optimizer',
    name: 'Section Optimizer',
    activationEvents: ['onCapability:editor-ai']
  },
  {
    id: 'metadoc.builtin.translate-selection',
    name: 'Translate Selection',
    activationEvents: ['onCapability:editor-ai']
  },
  {
    id: 'metadoc.builtin.outline-ai',
    name: 'Outline AI',
    activationEvents: ['onCapability:editor-ai']
  },
  {
    id: 'metadoc.builtin.ai-chat',
    name: 'AI Chat',
    activationEvents: ['onCapability:editor-ai']
  },
  { id: 'metadoc.builtin.agent', name: 'Agent', activationEvents: ['onCapability:agent'] },
  {
    id: 'metadoc.builtin.knowledge-rag',
    name: 'Knowledge RAG',
    activationEvents: ['onCapability:rag']
  },
  {
    id: 'metadoc.builtin.proofread',
    name: 'Proofread',
    activationEvents: ['onCapability:editor-ai']
  },
  {
    id: 'metadoc.builtin.tool-windows',
    name: 'AI Tool Windows',
    activationEvents: ['onCapability:tool-windows']
  },
  {
    id: 'metadoc.builtin.shell-overlays',
    name: 'Shell Overlays',
    activationEvents: ['onCapability:agent']
  }
] as const

export const examplePluginCatalog = [
  {
    id: 'metadoc.examples.hello-world',
    name: 'Hello World (Example)',
    activationEvents: ['onStartup']
  }
] as const

export const startupViewPluginCatalog = [
  { id: 'metadoc.builtin.core-views', name: 'Core Document Views', activationEvents: ['onStartup'] }
] as const

function registerLoader(
  id: string,
  loader: () => Promise<{ default: MetaDocPlugin }>
): () => Promise<{ default: MetaDocPlugin }> {
  registerBuiltinPluginLoader(id, loader)
  return loader
}

const loaderById: Record<string, () => Promise<{ default: MetaDocPlugin }>> = {}

function register(id: string, importFn: () => Promise<{ default: MetaDocPlugin }>): void {
  loaderById[id] = registerLoader(id, importFn)
}

register('metadoc.builtin.completion', () => import('./builtin/completion'))
register('metadoc.builtin.section-optimizer', () => import('./builtin/section-optimizer'))
register('metadoc.builtin.translate-selection', () => import('./builtin/translate-selection'))
register('metadoc.builtin.outline-ai', () => import('./builtin/outline-ai'))
register('metadoc.builtin.ai-chat', () => import('./builtin/ai-chat'))
register('metadoc.builtin.agent', () => import('./builtin/agent'))
register('metadoc.builtin.knowledge-rag', () => import('./builtin/knowledge-rag'))
register('metadoc.builtin.proofread', () => import('./builtin/proofread'))
register('metadoc.builtin.tool-windows', () => import('./builtin/tool-windows'))
register('metadoc.builtin.shell-overlays', () => import('./builtin/shell-overlays'))

export const builtinPluginLoaders: Array<() => Promise<{ default: MetaDocPlugin }>> =
  Object.values(loaderById)

export const capabilityPluginLoaders: Record<
  AiCapabilityId,
  Array<() => Promise<{ default: MetaDocPlugin }>>
> = {
  'llm-core': [],
  agent: CAPABILITY_PLUGIN_IDS.agent.map((id) => loaderById[id]),
  rag: CAPABILITY_PLUGIN_IDS.rag.map((id) => loaderById[id]),
  completion: CAPABILITY_PLUGIN_IDS.completion.map((id) => loaderById[id]),
  'editor-ai': CAPABILITY_PLUGIN_IDS['editor-ai'].map((id) => loaderById[id]),
  'tool-windows': CAPABILITY_PLUGIN_IDS['tool-windows'].map((id) => loaderById[id])
}

export const startupPluginLoaders: Array<() => Promise<{ default: MetaDocPlugin }>> = [
  registerLoader('metadoc.builtin.core-views', () => import('./builtin/core-views')),
  registerLoader('metadoc.examples.hello-world', () => import('./examples/hello-world'))
]
