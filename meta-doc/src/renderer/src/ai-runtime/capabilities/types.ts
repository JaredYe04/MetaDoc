export type AiCapabilityId =
  | 'llm-core'
  | 'agent'
  | 'rag'
  | 'completion'
  | 'editor-ai'
  | 'tool-windows'

export const AI_CAPABILITY_LOAD_ORDER: AiCapabilityId[] = [
  'llm-core',
  'completion',
  'editor-ai',
  'tool-windows',
  'rag',
  'agent'
]

export const AI_CAPABILITY_UNLOAD_ORDER: AiCapabilityId[] = [...AI_CAPABILITY_LOAD_ORDER].reverse()

/** Capabilities that must be loaded before another */
export const AI_CAPABILITY_DEPENDENCIES: Partial<Record<AiCapabilityId, AiCapabilityId[]>> = {
  agent: ['llm-core'],
  rag: ['llm-core'],
  completion: ['llm-core'],
  'editor-ai': ['llm-core'],
  'tool-windows': ['llm-core']
}

export const CAPABILITY_PLUGIN_IDS: Record<AiCapabilityId, readonly string[]> = {
  'llm-core': [],
  agent: ['metadoc.builtin.agent', 'metadoc.builtin.shell-overlays'],
  rag: ['metadoc.builtin.knowledge-rag'],
  completion: ['metadoc.builtin.completion'],
  'editor-ai': [
    'metadoc.builtin.section-optimizer',
    'metadoc.builtin.translate-selection',
    'metadoc.builtin.outline-ai',
    'metadoc.builtin.proofread',
    'metadoc.builtin.ai-chat'
  ],
  'tool-windows': ['metadoc.builtin.tool-windows']
}
