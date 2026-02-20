# Vue 3 Renderer

## OVERVIEW

Vue 3 SPA running in Electron's renderer process. Element Plus UI, Pinia state management, Monaco + Vditor dual editors, AI agent framework with 20+ tools, multi-format document export.

## STRUCTURE

```
renderer/src/
├── main.js               # Vue app bootstrap (JS — not TS)
├── App.vue               # Root component, global layout
├── router/router.js      # Vue Router (hash history, 20+ routes)
├── stores/               # Pinia stores
│   ├── workspace.ts      # Tabs, documents, workspace tree (1847 lines — core store)
│   ├── document.ts       # Document metadata & operations
│   └── user.ts           # User preferences
├── components/           # 53 Vue components
│   ├── agent/            # Agent UI (workflow canvas, managers)
│   ├── chat/             # Chat UI components
│   ├── common/           # Reusable UI (CardGrid, SessionList)
│   ├── home/             # Home/quick-start panels
│   ├── outline/          # Document outline tree components
│   ├── workspace/        # Workspace tabs, explorer
│   ├── TabSwitcherOverlay.vue  # Ctrl+Tab 标签页切换浮层
│   └── [40+ top-level]   # Feature-specific components
├── views/                # 28 route views (Home, Editor, AgentView, Setting, OCR, etc.)
├── services/             # Document & export services (see services/AGENTS.md)
├── editor/               # Editor adapters
│   ├── monaco-adapter.ts # Monaco editor integration (1465 lines)
│   ├── vditor-adapter.ts # Vditor markdown editor integration (1495 lines)
│   └── text-editor-types.ts  # Shared editor interface
├── composables/          # Vue composables
│   ├── useActiveDocument.ts    # 当前活跃文档获取
│   ├── useCloseTab.ts          # 标签页关闭逻辑
│   ├── useTabDrag.ts           # 标签页拖拽（跨窗口拖拽、排序、视觉反馈）
│   ├── useTabOperations.ts     # 标签页操作（关闭、移动到新窗口、右键菜单）
│   ├── useTabSwitcher.ts       # 键盘标签页切换（Ctrl+Tab 快捷键）
│   └── useWorkspaceOperations.ts  # 工作目录操作
├── utils/                # ~93 files (see agent-framework/ and agent-tools/ AGENTS.md)
│   ├── agent-framework/  # AI engine core (has own AGENTS.md)
│   ├── agent-tools/      # AI tool plugins (has own AGENTS.md)
│   ├── llm-adapters/     # LLM provider adapters (OpenAI, Ollama, Gemini)
│   ├── workspace/        # Workspace FS operations (planner/executor pattern)
│   ├── locale_prompts/   # LLM prompt templates per locale
│   ├── db/               # Renderer-side IndexedDB helpers
│   └── [75+ files]       # AI tasks, chart rendering, themes, md-utils, etc.
├── config/               # Runtime configs (tab-content, graph-engine)
├── locales/              # i18n JSON files (6 languages)
├── constants/            # Template constants
├── types/                # Renderer-specific type definitions
└── assets/               # Icons, CSS overrides, fonts
```

## WHERE TO LOOK

| Task                    | Location                                                              | Notes                                                        |
| ----------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------ |
| Add new view/page       | `views/` + `router/router.js`                                         | Also register in `pages` map if auxiliary window             |
| Add new component       | `components/`                                                         | PascalCase .vue, single-word names OK                        |
| Modify document state   | `stores/workspace.ts`                                                 | Core store — 1847 lines, complex                             |
| Tab drag & drop         | `composables/useTabDrag.ts`                                           | 跨窗口拖拽标签页、排序、视觉反馈、与主进程 drag-manager 配合 |
| Tab operations          | `composables/useTabOperations.ts`                                     | 关闭标签页、移动到新窗口、右键菜单                           |
| Tab switcher (Ctrl+Tab) | `composables/useTabSwitcher.ts` + `components/TabSwitcherOverlay.vue` | 键盘快捷切换标签页                                           |
| Add LLM provider        | `utils/llm-adapters/`                                                 | Extend `base-adapter.ts`, register in `adapter-factory.ts`   |
| Add editor feature      | `editor/`                                                             | Both adapters share `text-editor-types.ts` interface         |
| Modify AI behavior      | `utils/prompts.ts` + `locale_prompts/`                                | Prompt templates are first-class config                      |
| Add workspace FS op     | `utils/workspace/`                                                    | Uses planner→executor pattern                                |
| Theme/styling           | `utils/themes.js` + `assets/`                                         | `themeState` provided globally                               |

## CONVENTIONS

- **Router**: `pages` map in `router.js` for auxiliary window types; `meta.requiresLayout` on main routes
- **Stores**: Composition API Pinia stores; `workspace.ts` has cross-window broadcast via `initializeWorkspaceBroadcastListeners()`
- **Editor adapters**: Both Monaco and Vditor implement same interface from `text-editor-types.ts`; adapter chosen per document type
- **LLM adapters**: Factory pattern in `adapter-factory.ts` — register new providers there
- **i18n**: `vue-i18n` with JSON locale files; Python script `i18n_check.py` validates completeness
- **Event bus**: `utils/event-bus.js` (mitt-based) for cross-component communication
- **Format system**: `format-registry.ts` + `format-initializer.ts` — register document format handlers at startup

## ANTI-PATTERNS

- `workspace.ts` (1847 lines) — oversized Pinia store; avoid adding more actions without discussion
- `utils/` has 93 files at one level — flat structure makes discovery hard; prefer subfolders
- Many utils are JS (`md-utils.js`, `llm-api.js`, `event-bus.js`) — new code should be TypeScript
