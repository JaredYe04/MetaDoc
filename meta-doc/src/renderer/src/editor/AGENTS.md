# Editor Adapters

## OVERVIEW

Dual-editor architecture unifying Monaco (LaTeX) and Vditor (Markdown) behind common interface. Adapter pattern allows seamless switching per document type.

## STRUCTURE

```
editor/
├── monaco-adapter.ts     # Monaco integration for LaTeX (1465 lines)
├── vditor-adapter.ts     # Vditor integration for Markdown (1495 lines)
└── text-editor-types.ts  # Shared EditorAdapter interface
```

## WHERE TO LOOK

| Task | File | Notes |
|------|------|-------|
| Add LaTeX feature | `monaco-adapter.ts` | Monaco Editor with tectonic compilation |
| Add Markdown feature | `vditor-adapter.ts` | Vditor with custom toolbar & preview |
| Change editor interface | `text-editor-types.ts` | Shared adapter contract |
| Outline navigation | Both adapters | Skip graph elements: .katex-display, .mermaid, etc. |
| Document switching | Adapter factory | Chooses adapter by document.format |

## CONVENTIONS

- **Adapter pattern**: Both implement `EditorAdapter` interface from `text-editor-types.ts`
- **Selection**: `getSelection()`/`setSelection()` return/accept `{start, end}` positions
- **Content**: `getContent()`/`setContent()` handle raw document text
- **Outline**: `getOutline()` returns `DocumentOutlineNode[]` tree
- **Events**: Adapters emit `content-change`, `selection-change`, `outline-change`

## ANTI-PATTERNS

- Both adapters exceed 1400 lines — future extraction into smaller modules planned
- Direct DOM manipulation in adapters — use adapter methods only
- Monaco/Vditor-specific code outside adapters — always go through interface

## EDITOR INTERFACE

```typescript
interface EditorAdapter {
  // Lifecycle
  mount(container: HTMLElement): void
  unmount(): void
  
  // Content
  getContent(): string
  setContent(content: string): void
  
  // Selection
  getSelection(): { start: number; end: number }
  setSelection(start: number, end: number): void
  
  // Outline
  getOutline(): DocumentOutlineNode[]
  
  // Events
  onContentChange(callback: () => void): void
  onSelectionChange(callback: () => void): void
  onOutlineChange(callback: () => void): void
}
```

## MONACO ADAPTER (LaTeX)

- Full Monaco Editor integration
- LaTeX syntax highlighting
- PDF preview integration via tectonic
- SyncTeX support for source↔PDF navigation

## VDITOR ADAPTER (Markdown)

- Vditor markdown editor
- WYSIWYG, split, and source modes
- Custom toolbar with MetaDoc-specific actions
- Mermaid, KaTeX, PlantUML rendering

## USAGE

The editor is chosen based on document format:
```typescript
if (document.format === 'tex') {
  adapter = createMonacoAdapter()
} else if (document.format === 'md') {
  adapter = createVditorAdapter()
}
```
