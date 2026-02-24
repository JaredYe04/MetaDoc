# Route Views

## OVERVIEW

28+ Vue route views representing application pages. Each view corresponds to a route in the Vue Router and serves as a top-level page component. Mix of editor views, tool windows, settings, and auxiliary views.

## STRUCTURE

```
views/
├── Editor.vue                    # Generic editor wrapper
├── MarkdownEditor.vue            # Markdown editing (3165 lines)
├── LaTeXEditor.vue               # LaTeX editing with Monaco (4719 lines)
├── PlainTextEditor.vue           # Plain text editing
├── Main.vue                      # Main window layout
├── GlobalHome.vue                # Global workspace view
├── Home.vue                      # Home/quick start
├── AgentView.vue                 # AI agent orchestration (3268 lines)
├── AIChat.vue                    # Chat interface
├── Outline.vue                   # Document outline tree
├── KnowledgeBase.vue             # RAG knowledge base
├── ProofreadView.vue             # AI proofreading
├── GraphWindow.vue               # Chart/diagram tools
├── DataAnalysisWindow.vue        # Data analysis tools
├── OcrWindow.vue                 # OCR interface (3290 lines)
├── FomulaRecognition.vue         # Formula OCR
├── AigcDetectionWindow.vue       # AI content detection
├── AttachmentWindow.vue          # File attachments
├── UserFeedbackView.vue          # User feedback form
├── UserManual.vue                # Interactive user manual
├── LlmStatisticsView.vue         # LLM usage statistics
├── NewDocumentWorkspace.vue      # Create new document/workspace
├── Setting.vue                   # Settings root
├── About.vue                     # About page
├── DebugView.vue                 # Debug/developer view
├── DummyView.vue                 # Placeholder/empty view
└── setting/                      # Settings sections (8 files)
    ├── SettingBasicSection.vue
    ├── SettingThemeSection.vue
    ├── SettingLlmSection.vue
    ├── SettingKnowledgeBaseSection.vue
    ├── SettingImageSection.vue
    ├── SettingDebugSection.vue   # 6297 lines — LARGEST
    ├── SettingLoggerSection.vue
    └── SettingAboutSection.vue
```

## WHERE TO LOOK

| Task | View | Notes |
|------|------|-------|
| Editor feature | `MarkdownEditor.vue`, `LaTeXEditor.vue` | Monaco (LaTeX) + Vditor (MD) |
| AI agent UI | `AgentView.vue` | Workflow canvas, agent config |
| Chat interface | `AIChat.vue` | AI conversation UI |
| Document outline | `Outline.vue` | Hierarchical outline tree |
| Settings | `Setting.vue`, `setting/*Section.vue` | 8 setting sections |
| Knowledge base | `KnowledgeBase.vue` | RAG management |
| Add new view | Create `.vue` + register in `router/router.js` | Add to `pages` map for aux windows |

## CONVENTIONS

- **Route registration**: All views registered in `router/router.js` with `meta.requiresLayout` for main routes
- **Auxiliary windows**: `pages` map in router defines which views can open in separate windows
- **View size**: Views are large (20K-156K lines) — be cautious when editing
- **Editor views**: `MarkdownEditor.vue` and `LaTeXEditor.vue` are largest; complex editor integration
- **Settings pattern**: `Setting.vue` is shell; sections in `setting/` subdirectory
- **Naming**: PascalCase `.vue` files matching route name

## ANTI-PATTERNS

- **Massive view files**: Several views exceed 3000 lines (`LaTeXEditor.vue` 4719, `MarkdownEditor.vue` 3165, `AgentView.vue` 3268, `SettingDebugSection.vue` 6297)
- **Direct store mutations in views** — use composables from `composables/` directory
- **Mixing Element Plus and shadcn-vue** — new UI should use shadcn-vue exclusively
- **Duplicating editor logic** — editor-specific logic should stay in `editor/` adapters

## NOTES

- **Editor views handle multiple modes**: WYSIWYG, split, source code
- **Tool windows are auxiliary**: OCR, graph, data analysis can open as separate windows
- **Views use event bus extensively**: `utils/event-bus.js` for cross-component communication
- **Migration in progress**: Element Plus → shadcn-vue; views show hybrid UI state
- **Demo mode coverage**: UserManual.vue embeds interactive components from `manuals/`

## RELATED

- Router: `router/router.js`
- Composables: `composables/` (useTabDrag, useTabSwitcher, etc.)
- Editor adapters: `editor/monaco-adapter.ts`, `editor/vditor-adapter.ts`
