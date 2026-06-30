import type { MetaDocPlugin } from '../host-api'
import { registerBuiltinPluginLoader } from '../core/plugin-loader'

export const builtinPluginCatalog = [
  { id: 'metadoc.builtin.completion', name: 'AI Auto Completion', activationEvents: ['onLlmEnabled'] },
  { id: 'metadoc.builtin.section-optimizer', name: 'Section Optimizer', activationEvents: ['onLlmEnabled'] },
  { id: 'metadoc.builtin.translate-selection', name: 'Translate Selection', activationEvents: ['onLlmEnabled'] },
  { id: 'metadoc.builtin.outline-ai', name: 'Outline AI', activationEvents: ['onLlmEnabled'] },
  { id: 'metadoc.builtin.ai-chat', name: 'AI Chat', activationEvents: ['onLlmEnabled'] },
  { id: 'metadoc.builtin.agent', name: 'Agent', activationEvents: ['onLlmEnabled'] },
  { id: 'metadoc.builtin.knowledge-rag', name: 'Knowledge RAG', activationEvents: ['onLlmEnabled'] },
  { id: 'metadoc.builtin.proofread', name: 'Proofread', activationEvents: ['onLlmEnabled'] },
  { id: 'metadoc.builtin.tool-windows', name: 'AI Tool Windows', activationEvents: ['onLlmEnabled'] },
  { id: 'metadoc.builtin.shell-overlays', name: 'Shell Overlays', activationEvents: ['onLlmEnabled'] }
] as const

export const examplePluginCatalog = [
  {
    id: 'metadoc.examples.hello-world',
    name: 'Hello World (Example)',
    activationEvents: ['onStartup']
  }
] as const

function registerLoader(
  id: string,
  loader: () => Promise<{ default: MetaDocPlugin }>
): () => Promise<{ default: MetaDocPlugin }> {
  registerBuiltinPluginLoader(id, loader)
  return loader
}

export const builtinPluginLoaders: Array<() => Promise<{ default: MetaDocPlugin }>> = [
  registerLoader('metadoc.builtin.completion', () => import('./builtin/completion')),
  registerLoader('metadoc.builtin.section-optimizer', () => import('./builtin/section-optimizer')),
  registerLoader('metadoc.builtin.translate-selection', () => import('./builtin/translate-selection')),
  registerLoader('metadoc.builtin.outline-ai', () => import('./builtin/outline-ai')),
  registerLoader('metadoc.builtin.ai-chat', () => import('./builtin/ai-chat')),
  registerLoader('metadoc.builtin.agent', () => import('./builtin/agent')),
  registerLoader('metadoc.builtin.knowledge-rag', () => import('./builtin/knowledge-rag')),
  registerLoader('metadoc.builtin.proofread', () => import('./builtin/proofread')),
  registerLoader('metadoc.builtin.tool-windows', () => import('./builtin/tool-windows')),
  registerLoader('metadoc.builtin.shell-overlays', () => import('./builtin/shell-overlays'))
]

export const startupPluginLoaders: Array<() => Promise<{ default: MetaDocPlugin }>> = [
  registerLoader('metadoc.examples.hello-world', () => import('./examples/hello-world'))
]
