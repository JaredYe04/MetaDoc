# Services Layer

## OVERVIEW

Document lifecycle services (load, save, serialize) and multi-format export pipeline using strategy pattern adapters. Handles md↔docx/html/pdf/tex and tex↔pdf conversions.

## STRUCTURE

```
services/
├── DocumentService.ts          # High-level document operations facade
├── document-loader.ts          # Load documents from disk (md, tex, json)
├── document-save.ts            # Save documents to disk with format detection
├── document-serializer.ts      # Serialize/deserialize document outline ↔ text
├── AIService.ts                # AI task dispatching service
├── export-manager.ts           # Export orchestration (renderer-side)
├── export-manager.obsolete.ts  # @deprecated — do not extend
├── font-service.ts             # Font loading and management
├── image-processor.ts          # Image optimization for export
└── export-adapters/            # Strategy pattern export pipeline
    ├── types.ts                # ExportAdapter interface, ExportContext
    ├── base-adapter.ts         # Abstract base with shared export logic
    ├── index.ts                # registerAllAdapters() — adapter registration
    ├── storage.ts              # Adapter registry (Map-based)
    ├── md-to-docx-adapter.ts   # Markdown → DOCX
    ├── md-to-html-adapter.ts   # Markdown → HTML
    ├── md-to-pdf-adapter.ts    # Markdown → PDF
    ├── md-to-tex-adapter.ts    # Markdown → LaTeX
    ├── md-to-md-adapter.ts     # Markdown → Markdown (clean/reformat)
    ├── tex-to-pdf-adapter.ts   # LaTeX → PDF (via tectonic in main process)
    └── tex-to-tex-adapter.ts   # LaTeX → LaTeX (clean/reformat)
```

## WHERE TO LOOK

| Task                    | File                         | Notes                                            |
| ----------------------- | ---------------------------- | ------------------------------------------------ |
| Add export format       | `export-adapters/`           | Extend `base-adapter.ts`, register in `index.ts` |
| Modify document loading | `document-loader.ts`         | Format detection + outline tree construction     |
| Modify document saving  | `document-save.ts`           | Serialization + file write                       |
| Change serialization    | `document-serializer.ts`     | ⚠️ META-INFO lines must not be modified          |
| Export format rules     | `src/common/export-rules.ts` | Defines allowed source→target conversions        |

## CONVENTIONS

- **Adapter pattern**: Each adapter extends `base-adapter.ts`, implements `export(context)` method, registered via `registerAllAdapters()` at startup
- **Export context**: Adapters receive `ExportContext` with document data, options, and progress callbacks
- **Format rules**: `src/common/export-rules.ts` defines allowed source→target format mappings shown in UI
- **Dual export paths**: Renderer adapters handle format conversion; main process `export/export-manager.ts` handles server-side operations

## ANTI-PATTERNS

- `document-serializer.ts` contains META-INFO sentinel lines — **DO NOT modify** or metadata parsing breaks
- `export-manager.obsolete.ts` is `@deprecated` — exists for backward compat, do not add features
- Export pipeline split between renderer (`services/export-adapters/`) and main (`src/main/export/`) — tracing full export flow requires checking both

## EXPORT ADAPTER PATTERN

```typescript
// 1. Extend base adapter
export class MyAdapter extends BaseExportAdapter {
  readonly sourceFormat = 'md'
  readonly targetFormat = 'myformat'

  async export(context: ExportContext): Promise<ExportResult> {
    // Transform document.content to target format
    // Call context.onProgress() for progress updates
    // Return result with file path or content
  }
}

// 2. Register in index.ts
registerAllAdapters() {
  adapterStorage.register(new MyAdapter())
}
```

## DOCUMENT LIFECYCLE

```
Load:   File → document-loader.ts → DocumentService → workspace store
Save:   workspace store → DocumentService → document-save.ts → File
Export: Document → export-manager.ts → Adapter → Main process → File
```

## RELATED

- Main process export: `src/main/export/`
- Format rules: `src/common/export-rules.ts`
- Workspace store: `src/renderer/src/stores/workspace.ts`
