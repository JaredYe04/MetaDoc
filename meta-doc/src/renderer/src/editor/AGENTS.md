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

| Task                    | File                   | Notes                                               |
| ----------------------- | ---------------------- | --------------------------------------------------- |
| Add LaTeX feature       | `monaco-adapter.ts`    | Monaco Editor with tectonic compilation             |
| Add Markdown feature    | `vditor-adapter.ts`    | Vditor with custom toolbar & preview                |
| Change editor interface | `text-editor-types.ts` | Shared adapter contract                             |
| Outline navigation      | Both adapters          | Skip graph elements: .katex-display, .mermaid, etc. |
| Document switching      | Adapter factory        | Chooses adapter by document.format                  |

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
