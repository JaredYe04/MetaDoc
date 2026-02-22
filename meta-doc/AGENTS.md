# PROJECT KNOWLEDGE BASE

**Generated:** 2026-02-22
**Commit:** HEAD
**Branch:** main

## OVERVIEW

MetaDoc — LLM Agent-powered intelligent document processing desktop app. Electron (main: TypeScript) + Vue 3 (renderer: mixed TS/JS) + Pinia + shadcn-vue + Element Plus. Supports Markdown & LaTeX editing with AI agent framework, multi-format export, knowledge base (RAG), and OCR. Also targets Android via Capacitor (same repo).

## STRUCTURE

```
meta-doc/
├── src/
│   ├── main/              # Electron main process (TS)
│   │   ├── drag-manager.ts   # 跨窗口标签页拖拽管理
│   │   ├── file-registry.ts  # 文件-窗口关联注册表
│   │   ├── database/      # SQLite (better-sqlite3) + knowledge-db + migrations
│   │   ├── export/        # Server-side export (docx-processor, export-manager)
│   │   └── utils/         # Services: RAG, OCR, spell-check, file-conversion, LaTeX, update
│   ├── renderer/src/      # Vue 3 SPA renderer
│   │   ├── components/    # 53 Vue components + 93 shadcn-vue UI components
│   │   │   └── ui/        # shadcn-vue: button, card, dialog, select, table, etc.
│   │   ├── views/         # 28 route views
│   │   ├── stores/        # Pinia stores (document, user, workspace)
│   │   ├── services/      # Document load/save/serialize, export-adapters
│   │   ├── editor/        # Monaco + Vditor dual-editor adapters
│   │   ├── utils/         # ~93 files — agent framework, tools, LLM adapters, etc.
│   │   ├── composables/   # Vue composables (useActiveDocument, useCloseTab, useTabDrag, useTabOperations, useTabSwitcher, etc.)
│   │   └── locales/       # i18n: zh_cn, en_us, de_DE, fr_FR, ja_JP, ko_KR
│   ├── common/            # Shared constants (export-rules, logger-constants)
│   ├── preload/           # Electron preload (exposes ipcRenderer to renderer)
│   └── types/             # Shared TypeScript types (DocumentOutlineNode, LLMConfig, etc.)
├── scripts/               # 30 build/release/utility Node.js scripts
├── resources/             # Runtime assets: migrations, tesseract, fonts, cspell
├── docs/                  # Internal docs (export flow, refactor guides, test cases)
├── android/               # Capacitor Android target
├── out/                   # Build output (electron-vite)
└── build/                 # Electron-builder assets (icons, installers)
```

## WHERE TO LOOK

| Task                            | Location                                                                   | Notes                                                  |
| ------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------ |
| IPC handlers (main↔renderer)   | `src/main/main-calls.ts`                                                   | 5475-line monolith; all `ipcMain.handle` registrations |
| App lifecycle & window creation | `src/main/index.ts`                                                        | Entry point; GPU compat, .env loading, window pool     |
| Window management               | `src/main/window-manager.ts`, `window-pool.ts`                             | Multi-window + auxiliary window system                 |
| Tab drag between windows        | `src/main/drag-manager.ts`                                                 | 主进程侧跨窗口标签页拖拽协调                           |
| File-window association         | `src/main/file-registry.ts`                                                | 文件在哪个窗口打开的注册表                             |
| Tab switcher (Ctrl+Tab)         | `src/renderer/src/composables/useTabSwitcher.ts`, `TabSwitcherOverlay.vue` | 键盘快捷切换标签页                                     |
| Tab drag & drop (renderer)      | `src/renderer/src/composables/useTabDrag.ts`                               | 渲染进程侧标签页拖拽逻辑                               |
| Tab operations (close/move)     | `src/renderer/src/composables/useTabOperations.ts`                         | 标签页关闭、移动等操作                                 |
| AI agent orchestration          | `src/renderer/src/utils/agent-framework/`                                  | Engine executors (AutoGPT, ReAct, PlanExecute, etc.)   |
| AI tool implementations         | `src/renderer/src/utils/agent-tools/`                                      | 20+ tools (edit, grep, chart, data-analysis, etc.)     |
| Document model & state          | `src/renderer/src/stores/workspace.ts`                                     | 1847-line Pinia store; tabs, documents, workspace tree |
| Editor integration              | `src/renderer/src/editor/`                                                 | Monaco + Vditor adapters behind unified interface      |
| Export pipeline                 | `src/renderer/src/services/export-adapters/`                               | Adapter pattern: md→docx/html/pdf/tex, tex→pdf         |
| LLM API integration             | `src/renderer/src/utils/llm-adapters/`                                     | OpenAI, Ollama, Gemini adapters via factory            |
| Database / knowledge base       | `src/main/database/`                                                       | better-sqlite3 + sqlite-vec for RAG vectors            |
| Shared types                    | `src/types/index.ts`                                                       | DocumentOutlineNode, LLMConfig, AppSettings, etc.      |
| Build & release                 | `scripts/`                                                                 | version-manager, release-dev/prod, copy-env, icons     |
| shadcn-vue components           | `src/renderer/src/components/ui/`                                          | 93 Vue components (button, card, dialog, select, etc.) |
| Custom UI components            | `src/renderer/src/components/ui/UIMenu.vue`                                | Custom menu components alongside shadcn                |

## CONVENTIONS

- **Formatting**: Prettier — single quotes, no semicolons, printWidth 100, no trailing commas
- **Linting**: ESLint — vue3-recommended + @electron-toolkit; `vue/require-default-prop` OFF, `vue/multi-word-component-names` OFF
- **Indent**: 2 spaces, LF line endings
- **TypeScript**: strict mode, `allowJs: true` (mixed JS/TS codebase)
- **Path aliases**: `@/*` → `src/*`, `@renderer/*` → `src/renderer/src/*`
- **Comments**: Chinese (中文) for inline comments and docs; English for type names and exports
- **Component naming**: PascalCase `.vue` files; single-word names allowed
- **State management**: Pinia (composition API stores)
- **IPC pattern**: `ipcRenderer.invoke(channel, ...args)` in renderer → `ipcMain.handle` in main-calls.ts
- **Service pattern**: Singleton services with `createMainLogger(scope)` for scoped logging
- **Export adapters**: Strategy pattern via `base-adapter.ts` → concrete adapters registered in `index.ts`
- **Agent tools**: Each tool exports a `*ToolConfig` object registered in `agent-tools/index.ts`

## ANTI-PATTERNS (THIS PROJECT)

- **DO NOT modify META-INFO lines** in `document-serializer.ts` — breaks metadata parsing
- **Agent tool specs contain embedded LLM instructions** ("Do NOT", "Important Notes") — treat as first-class config, not comments
- **CSS `!important` is widespread** — avoid adding more; present in 30+ component style blocks
- **`main-calls.ts` is a 5475-line monolith** — all IPC handlers in one file; do not add more without discussing extraction
- **Deprecated code paths still active**: `express-server.ts` legacy routes, `export-manager.obsolete.ts`, `legacy-exports.js` — do not extend, plan removal
- **Mixed JS/TS**: renderer bootstrap (`main.js`) and many utils are JS; new code should be TypeScript
- Prompt templates in `utils/locale_prompts/*.json` and `prompts.ts` govern LLM behavior — changes need careful review

## COMMANDS

```bash
npm run dev              # Start dev (electron-vite + vite concurrently)
npm run build            # Production build (prebuild + electron-vite build)
npm run build:sequential # CI-friendly build (lower memory, sequential targets)
npm run build:win        # Package for Windows
npm run build:mac        # Package for macOS
npm run build:linux      # Package for Linux
npm run lint             # ESLint with auto-fix
npm run format           # Prettier format all
npm run rebuild-native   # Rebuild better-sqlite3 for Electron ABI
npm run audit            # Run code audit script
npm run release:dev      # Dev release flow
npm run release:prod     # Production release flow
```

## NOTES

- **Native deps**: `better-sqlite3` requires `electron-rebuild` after install; needs C++ build toolchain
- **Embedded Express server**: main process runs HTTP API on localhost for single-instance delegation and external control — not just IPC
- **No CI workflows committed**: `.github/` has release-logs only; no Actions YAMLs. Release scripts assume GH Actions exist externally
- **Postinstall sets ELECTRON_MIRROR**: `scripts/postinstall-electron.js` overrides Electron download mirrors (npmmirror) — may need adjustment in other networks
- **.env required**: prebuild copies `.env` from root to `resources/`; must exist before build
- **Java env for PlantUML**: main process sets `JAVA_OPTS=-Dfile.encoding=UTF-8` at startup for PlantUML UTF-8 support
- **GPU auto-detection**: `shouldDisableGPU()` in main/index.ts disables GPU for CI/WSL/headless Linux
