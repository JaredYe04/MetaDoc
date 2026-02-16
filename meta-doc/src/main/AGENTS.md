# Electron Main Process

## OVERVIEW

Node.js-side Electron main process: app lifecycle, window management, IPC handlers, embedded Express server, database, and all server-side services (RAG, OCR, export, spell-check, file conversion, LaTeX compilation).

## STRUCTURE

```
main/
├── index.ts              # App entry: lifecycle, window creation, GPU detection, .env loading
├── main-calls.ts         # ALL IPC handlers (5475 lines — monolith)
├── window-manager.ts     # Multi-window + auxiliary window management
├── window-pool.ts        # Pre-created window pool for fast open
├── drag-manager.ts       # 跨窗口标签页拖拽管理（主进程侧协调拖拽事件、窗口定位）
├── express-server.ts     # Embedded localhost HTTP API (legacy routes + active endpoints)
├── file-registry.ts      # File-to-window association tracking（文件-窗口关联注册表）
├── service-status.ts     # Service health broadcasting to renderer
├── logger.ts             # Main-process logger (createMainLogger with scoped prefixes)
├── i18n.ts               # Main-process i18n (synced with renderer locale)
├── database/             # SQLite layer (better-sqlite3 + sqlite-vec)
│   ├── database.ts       # Connection management
│   ├── knowledge-db.ts   # Knowledge base CRUD + vector operations (1055 lines)
│   ├── migration.ts      # Schema migration runner
│   └── schemas.ts        # Table definitions
├── export/               # Server-side document export
│   ├── export-manager.ts # Export orchestration (3510 lines)
│   └── docx-processor.ts # DOCX generation from outline tree (2179 lines)
└── utils/                # Singleton services
    ├── index.ts           # Unified service exports + backward-compat API
    ├── rag-service.ts     # RAG: embedding, vector search, reranking
    ├── ocr-service.ts     # Tesseract.js OCR wrapper
    ├── spell-check-service.ts  # cspell-lib based spell checking
    ├── file-conversion-service.ts  # PDF/DOCX/PPTX → text extraction
    ├── latex-service.ts   # LaTeX → PDF compilation (tectonic)
    ├── update-service.ts  # electron-updater auto-update
    ├── path-service.ts    # Cross-platform path resolution
    └── legacy-exports.js  # @deprecated — do not extend
```

## WHERE TO LOOK

| Task                   | File                                   | Notes                                                                 |
| ---------------------- | -------------------------------------- | --------------------------------------------------------------------- |
| Add new IPC handler    | `main-calls.ts`                        | Add `ipcMain.handle('channel', ...)` — but discuss extraction first   |
| Create new window type | `window-manager.ts`                    | Follow `openAuxiliaryWindow` pattern                                  |
| Tab drag between windows | `drag-manager.ts`                    | 跨窗口拖拽标签页时的主进程协调，含窗口定位与拖拽事件转发               |
| File-window tracking   | `file-registry.ts`                     | 跟踪文件在哪个窗口打开，防止重复打开                                   |
| Add database table     | `database/schemas.ts` → `migration.ts` | Add migration in `resources/migrations/` too                          |
| Add new service        | `utils/`                               | Singleton pattern, export from `utils/index.ts`                       |
| Modify export pipeline | `export/export-manager.ts`             | Server-side orchestration; renderer adapters handle format conversion |

## CONVENTIONS

- All services use `createMainLogger('ServiceName')` for scoped logging
- Service status changes broadcast via `broadcastServiceStatus()` → renderer listens
- Database accessed only from main process; renderer uses IPC to query
- Window pool pre-creates hidden windows for instant open — `acquirePoolWindow()`
- `.env` loaded from project root (dev) or `resources/` (packaged) at startup

## ANTI-PATTERNS

- `main-calls.ts` is a monolith — avoid adding handlers without discussing modularization
- `express-server.ts` has `@deprecated` legacy routes — do not extend deprecated endpoints
- `legacy-exports.js` is `@deprecated` — use `utils/index.ts` exports instead
- `export-manager.ts` (3510 lines) handles too many export formats in one file
