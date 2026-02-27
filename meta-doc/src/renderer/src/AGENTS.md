# Vue 3 Renderer

## OVERVIEW

Vue 3 SPA running in Electron's renderer process. shadcn-vue + Element Plus hybrid UI, Pinia state management, Monaco + Vditor dual editors, AI agent framework with 20+ tools, multi-format document export.

## STRUCTURE

```
renderer/src/
├── main.js               # Vue app bootstrap (JS — not TS, 80 lines)
├── App.vue               # Root component, global layout
├── router/router.js      # Vue Router (hash history, 20+ routes)
├── stores/               # Pinia stores
│   ├── workspace.ts      # CORE: Tabs, documents (2009 lines, 15 exports)
│   ├── document.ts       # Document metadata & operations
│   ├── user.ts           # User preferences
│   └── notification.ts   # Sonner notification queue
├── components/           # 53 Vue components + 93 shadcn-vue UI
│   ├── agent/            # Agent UI (workflow canvas, managers)
│   ├── chat/             # Chat UI components
│   ├── common/           # Reusable UI (CardGrid, SessionList)
│   ├── home/             # Home/quick-start panels
│   ├── outline/          # Document outline tree components
│   ├── ui/               # shadcn-vue components
│   ├── workspace/        # Workspace tabs, explorer
│   └── TabSwitcherOverlay.vue  # Ctrl+Tab overlay
├── views/                # 28 route views (28 files, 48k+ lines total)
│   ├── Editor.vue
│   ├── MarkdownEditor.vue        # 3165 lines
│   ├── LaTeXEditor.vue           # 4719 lines
│   ├── AgentView.vue             # 3268 lines
│   ├── OcrWindow.vue             # 3290 lines
│   └── setting/                  # 8 settings sections
├── services/             # Document & export services
├── editor/               # Editor adapters
│   ├── monaco-adapter.ts # Monaco integration (LaTeX)
│   ├── vditor-adapter.ts # Vditor integration (Markdown)
│   └── text-editor-types.ts  # Shared interface
├── composables/          # Vue composables
│   ├── useActiveDocument.ts
│   ├── useCloseTab.ts
│   ├── useTabDrag.ts           # Cross-window drag
│   ├── useTabOperations.ts     # Close, move to window
│   ├── useTabSwitcher.ts       # Ctrl+Tab keyboard
│   └── useWorkspaceOperations.ts
└── utils/                # ~184 files total
    ├── agent-framework/  # AI engine core
    ├── agent-tools/      # AI tool plugins
    ├── llm-adapters/     # LLM provider adapters
    ├── workspace/        # Workspace FS operations
    ├── locale_prompts/   # LLM prompt templates
    ├── db/               # Renderer-side IndexedDB
    └── [utilities]       # AI tasks, charts, themes, etc.
```

## WHERE TO LOOK

| Task                  | Location                                                   | Notes                                       |
| --------------------- | ---------------------------------------------------------- | ------------------------------------------- |
| Add view/page         | `views/` + `router/router.js`                              | Register in `pages` map for aux windows     |
| Add component         | `components/`                                              | PascalCase .vue, single-word OK             |
| Modify document state | `stores/workspace.ts`                                      | Core store — 2009 lines                     |
| Tab drag & drop       | `composables/useTabDrag.ts`                                | Cross-window drag with main process         |
| Tab operations        | `composables/useTabOperations.ts`                          | Close, move, context menu                   |
| Tab switcher          | `composables/useTabSwitcher.ts` + `TabSwitcherOverlay.vue` | Ctrl+Tab                                    |
| Add LLM provider      | `utils/llm-adapters/`                                      | Extend `base-adapter.ts`                    |
| Add editor feature    | `editor/`                                                  | Both share `text-editor-types.ts`           |
| Modify AI behavior    | `utils/prompts.ts` + `locale_prompts/`                     | Prompt templates are config                 |
| Add workspace FS op   | `utils/workspace/`                                         | Planner→executor pattern                    |
| Theme/styling         | `utils/themes.js` + `assets/`                              | `themeState` global                         |
| Add shadcn component  | `components/ui/`                                           | Use `npx shadcn-vue@latest add <component>` |
| Use shadcn component  | Import from `components/ui/<name>`                         | Based on reka-ui + Tailwind                 |

## CONVENTIONS

- **Router**: `pages` map in `router.js` for auxiliary window types
- **Stores**: Composition API Pinia; `workspace.ts` cross-window broadcast via `initializeWorkspaceBroadcastListeners()`
- **Editor adapters**: Both Monaco/Vditor implement same `EditorAdapter` interface
- **LLM adapters**: Factory pattern in `adapter-factory.ts`
- **i18n**: `vue-i18n` with JSON locale files; Python `i18n_check.py` validates
- **Event bus**: `utils/event-bus.js` (mitt-based) for cross-component communication
- **shadcn-vue**: Use CLI installer; components use reka-ui + Tailwind
- **UI hybrid**: shadcn-vue for new UI, Element Plus for legacy

## ANTI-PATTERNS

- `workspace.ts` (2009 lines) — oversized Pinia store; discuss before adding actions
- `utils/` has 184 files — flat structure; prefer subfolders
- Many utils are JS (`md-utils.js`, `event-bus.js`, etc.) — new code should be TypeScript
- `SettingDebugSection.vue` (6297 lines) — largest Vue file, needs decomposition
- **New UI MUST use shadcn-vue** — Element Plus only for legacy code, see "UI Component Priority" below

## UI COMPONENT PRIORITY (CRITICAL)

**Rule**: All new development and bug fixes MUST use shadcn-vue. Element Plus is legacy-only.

| Scenario               | Action                                                        |
| ---------------------- | ------------------------------------------------------------- |
| New feature UI         | **shadcn ONLY** — Import from `components/ui/*`               |
| Bug fix with UI change | **shadcn ONLY** — Replace Element Plus with shadcn equivalent |
| Missing component      | `npx shadcn-vue@latest add <name>`                            |
| Icon needed            | Use `lucide-vue-next`                                         |

```vue
<!-- ✅ CORRECT -->
<script setup>
import { Button } from '@renderer/components/ui/button'
import { X } from 'lucide-vue-next'
</script>

<!-- ❌ FORBIDDEN in new code -->
<el-button>Text</el-button>
```

## NOTIFICATION SYSTEM

Unified Sonner + Pinia + localStorage system.

```typescript
import { notifySuccess, notifyError } from '@/utils/notify'

notifySuccess('Saved successfully')
notifyError('Save failed', { duration: 5000 })
```

Files:

- `stores/notification.ts` — Pinia store + persistence
- `utils/notify.ts` — Unified API
- `utils/notifications-legacy.ts` — EventBus compatibility
- `components/NotificationQueue.vue` — History panel

## NOTES

- **Notification migration**: COMPLETED (2024-02-22) — 35+ files, 400+ ElMessage calls replaced
- **Theme bridge**: `utils/shadcn-theme-bridge.js` syncs shadcn + Element Plus themes
- **Format system**: `format-registry.ts` + `format-initializer.ts` registers handlers at startup
- **Demo mode**: UserManual.vue embeds interactive components from `manuals/`
