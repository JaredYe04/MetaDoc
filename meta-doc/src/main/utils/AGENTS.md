# Main Process Services

## OVERVIEW

Singleton services running in Electron main process. RAG, OCR, spell-check, file conversion, LaTeX compilation, and auto-update.

## STRUCTURE

```
utils/
├── index.ts                     # Unified exports + backward-compat API
├── rag-service.ts               # RAG: embeddings, vector search, reranking
├── ocr-service.ts               # Tesseract.js OCR wrapper
├── spell-check-service.ts       # cspell-lib spell checking
├── file-conversion-service.ts   # PDF/DOCX/PPTX → text extraction (1752 lines)
├── latex-service.ts             # LaTeX → PDF (tectonic compiler)
├── update-service.ts            # electron-updater auto-update
├── path-service.ts              # Cross-platform path resolution
└── legacy-exports.js            # @deprecated — use utils/index.ts
```

## WHERE TO LOOK

| Task                   | File                         | Notes                             |
| ---------------------- | ---------------------------- | --------------------------------- |
| RAG/knowledge base     | `rag-service.ts`             | Embeddings, sqlite-vec, reranking |
| OCR image → text       | `ocr-service.ts`             | Tesseract.js wrapper              |
| Spell checking         | `spell-check-service.ts`     | cspell-lib integration            |
| File format conversion | `file-conversion-service.ts` | PDF/DOCX/PPTX text extraction     |
| LaTeX compilation      | `latex-service.ts`           | tectonic PDF generation           |
| Auto-updater           | `update-service.ts`          | electron-updater config           |
| Cross-platform paths   | `path-service.ts`            | User data, temp paths             |
| Add new service        | Create file → `index.ts`     | Singleton pattern, scoped logger  |

## CONVENTIONS

- **Singleton pattern**: All services are singletons instantiated at startup
- **Logging**: Use `createMainLogger('ServiceName')` for scoped prefixes
- **Status broadcast**: Service status changes via `broadcastServiceStatus()`
- **Export**: All services exported from `utils/index.ts`
- **IPC only**: Renderer uses IPC to access these services

## ANTI-PATTERNS

- `legacy-exports.js` is @deprecated — use `utils/index.ts` exports
- Direct database access from renderer — always go through main process
- Service status without broadcasting — renderer won't know state changes
- `file-conversion-service.ts` (1752 lines) — consider format-specific modules
