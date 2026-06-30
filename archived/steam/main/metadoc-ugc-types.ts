export type MetadocUgcKind = 'document_template' | 'skill_pack' | 'rules_pack' | 'mcp_pack'

export type MetadocUgcLocaleBlock = {
  title: string
  description: string
  content: string
}

export type MetadocUgcManifest = {
  schemaVersion: 1
  kind: MetadocUgcKind
  /** 主语言 + 全局 fallback */
  defaultLocale: string
  /** 可选其它语言，键为 locale id（如 en_us） */
  locales: Record<string, MetadocUgcLocaleBlock>
  thumbnail?: {
    source: 'custom' | 'generated'
    file?: string
  }
}
