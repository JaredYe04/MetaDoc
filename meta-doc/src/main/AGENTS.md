# Electron Main Process

## OVERVIEW

Node.js-side Electron main process: app lifecycle, window management, IPC handlers, embedded Express server, database, and all server-side services (RAG, OCR, export, spell-check, file conversion, LaTeX compilation).

## STRUCTURE

```
main/
├── index.ts              # App entry: lifecycle, GPU detection, .env loading (1195 lines)
├── main-calls.ts         # ALL IPC handlers (6119 lines — MONOLITH)
├── window-manager.ts     # Multi-window + auxiliary window management
├── window-pool.ts        # Pre-created window pool for fast open
├── drag-manager.ts       # Cross-window tab drag coordination
├── express-server.ts     # Embedded HTTP API (legacy + active routes)
├── file-registry.ts      # File-to-window association tracking
├── service-status.ts     # Service health broadcasting to renderer
├── logger.ts             # Main-process logger with scoped prefixes
├── i18n.ts               # Main-process i18n (synced with renderer)
├── database/             # SQLite layer
│   ├── database.ts       # Connection management
│   ├── knowledge-db.ts   # Knowledge base CRUD + vectors (1085 lines, 25 exports)
│   ├── migration.ts      # Schema migration runner
│   └── schemas.ts        # Table definitions
├── export/               # Server-side document export
│   ├── export-manager.ts # Export orchestration (3645 lines, 7 exports)
│   └── docx-processor.ts # DOCX generation from outline (2265 lines, 9 exports)
└── utils/                # Singleton services
    ├── index.ts          # Unified exports + backward-compat API
    ├── rag-service.ts    # RAG: embeddings, vector search
    ├── ocr-service.ts    # Tesseract.js OCR wrapper
    ├── spell-check-service.ts    # cspell-lib spell checking
    ├── file-conversion-service.ts # PDF/DOCX/PPTX → text extraction
    ├── latex-service.ts  # LaTeX → PDF compilation (tectonic)
    ├── update-service.ts # electron-updater auto-update
    ├── path-service.ts   # Cross-platform path resolution
    └── legacy-exports.js # @deprecated — do not extend
```

## WHERE TO LOOK

| Task | File | Notes |
|------|------|-------|
| Add IPC handler | `main-calls.ts` | Add `ipcMain.handle('channel', ...)` — discuss extraction first |
| Create window type | `window-manager.ts` | Follow `openAuxiliaryWindow` pattern |
| Tab drag (main) | `drag-manager.ts` | Cross-window drag coordination |
| File-window tracking | `file-registry.ts` | Track which window has which file open |
| Add database table | `database/schemas.ts` → `migration.ts` | Add migration in `resources/migrations/` too |
| Add service | `utils/` | Singleton pattern, export from `utils/index.ts` |
| Modify export | `export/export-manager.ts` | Server-side orchestration |

## CONVENTIONS

- All services use `createMainLogger('ServiceName')` for scoped logging
- Service status changes broadcast via `broadcastServiceStatus()` → renderer listens
- Database accessed only from main process; renderer uses IPC
- Window pool pre-creates hidden windows for instant open — `acquirePoolWindow()`
- `.env` loaded from project root (dev) or `resources/` (packaged) at startup

## ANTI-PATTERNS

- `main-calls.ts` is a monolith — avoid adding handlers without discussing modularization
- `express-server.ts` has `@deprecated` legacy routes — do not extend deprecated endpoints
- `legacy-exports.js` is `@deprecated` — use `utils/index.ts` exports
- `export-manager.ts` (3645 lines) handles too many export formats in one file
- `knowledge-db.ts` (1085 lines, 25 exports) — consider splitting by operation type
