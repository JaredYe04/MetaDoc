/**
 * MetaDoc unified AST for Markdown / LaTeX bidirectional conversion.
 * All block-level nodes extend BlockNode; inline nodes extend InlineNode.
 */

// --- Block nodes (document structure) ---

export interface DocumentNode {
  type: 'document'
  children: BlockNode[]
}

export interface HeadingNode {
  type: 'heading'
  level: 1 | 2 | 3
  children: InlineNode[]
}

export interface ParagraphNode {
  type: 'paragraph'
  children: InlineNode[]
}

export interface ListNode {
  type: 'list'
  ordered: boolean
  items: ListItemNode[]
}

export interface ListItemNode {
  type: 'list_item'
  children: BlockNode[]
}

export interface CodeBlockNode {
  type: 'code_block'
  content: string
  /** optional language tag (e.g. "javascript") */
  lang?: string
}

export interface MathBlockNode {
  type: 'math_block'
  content: string
}

export interface BlockquoteNode {
  type: 'blockquote'
  children: BlockNode[]
}

export interface ThematicBreakNode {
  type: 'thematic_break'
}

/** Unknown block: raw source for round-trip or error recovery */
export interface UnknownBlockNode {
  type: 'unknown'
  raw: string
}

export type BlockNode =
  | DocumentNode
  | HeadingNode
  | ParagraphNode
  | ListNode
  | ListItemNode
  | CodeBlockNode
  | MathBlockNode
  | BlockquoteNode
  | ThematicBreakNode
  | UnknownBlockNode

// --- Inline nodes ---

export interface TextNode {
  type: 'text'
  value: string
}

export interface StrongNode {
  type: 'strong'
  children: InlineNode[]
}

export interface EmphasisNode {
  type: 'emphasis'
  children: InlineNode[]
}

export interface InlineCodeNode {
  type: 'inline_code'
  value: string
}

export interface LinkNode {
  type: 'link'
  url: string
  children: InlineNode[]
}

export interface ImageNode {
  type: 'image'
  url: string
  alt?: string
}

export interface MathInlineNode {
  type: 'math_inline'
  content: string
}

/** Unknown inline: raw source */
export interface UnknownInlineNode {
  type: 'unknown_inline'
  raw: string
}

export type InlineNode =
  | TextNode
  | StrongNode
  | EmphasisNode
  | InlineCodeNode
  | LinkNode
  | ImageNode
  | MathInlineNode
  | UnknownInlineNode

// --- Type guards ---

export function isDocumentNode(n: BlockNode): n is DocumentNode {
  return n.type === 'document'
}

export function isHeadingNode(n: BlockNode): n is HeadingNode {
  return n.type === 'heading'
}

export function isParagraphNode(n: BlockNode): n is ParagraphNode {
  return n.type === 'paragraph'
}

export function isListNode(n: BlockNode): n is ListNode {
  return n.type === 'list'
}

export function isListItemNode(n: BlockNode): n is ListItemNode {
  return n.type === 'list_item'
}

export function isCodeBlockNode(n: BlockNode): n is CodeBlockNode {
  return n.type === 'code_block'
}

export function isMathBlockNode(n: BlockNode): n is MathBlockNode {
  return n.type === 'math_block'
}

export function isBlockquoteNode(n: BlockNode): n is BlockquoteNode {
  return n.type === 'blockquote'
}

export function isThematicBreakNode(n: BlockNode): n is ThematicBreakNode {
  return n.type === 'thematic_break'
}

export function isUnknownBlockNode(n: BlockNode): n is UnknownBlockNode {
  return n.type === 'unknown'
}

export function isTextNode(n: InlineNode): n is TextNode {
  return n.type === 'text'
}

export function isStrongNode(n: InlineNode): n is StrongNode {
  return n.type === 'strong'
}

export function isEmphasisNode(n: InlineNode): n is EmphasisNode {
  return n.type === 'emphasis'
}

export function isInlineCodeNode(n: InlineNode): n is InlineCodeNode {
  return n.type === 'inline_code'
}

export function isLinkNode(n: InlineNode): n is LinkNode {
  return n.type === 'link'
}

export function isImageNode(n: InlineNode): n is ImageNode {
  return n.type === 'image'
}

export function isMathInlineNode(n: InlineNode): n is MathInlineNode {
  return n.type === 'math_inline'
}

export function isUnknownInlineNode(n: InlineNode): n is UnknownInlineNode {
  return n.type === 'unknown_inline'
}

/** Root AST type */
export type AST = DocumentNode

/** Create empty document */
export function createDocument(children: BlockNode[] = []): DocumentNode {
  return { type: 'document', children }
}
