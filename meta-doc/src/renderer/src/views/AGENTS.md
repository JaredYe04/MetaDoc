# Route Views

## OVERVIEW

28+ Vue route views representing application pages. Each view corresponds to a route in the Vue Router and serves as a top-level page component. Mix of editor views, tool windows, settings, and auxiliary views.

## STRUCTURE

```
views/
├── Editor.vue                    # Generic editor wrapper
├── MarkdownEditor.vue            # Markdown editing (114K lines)
├── LaTeXEditor.vue               # LaTeX editing with Monaco (156K lines)
├── PlainTextEditor.vue           # Plain text editing
├── Main.vue                      # Main window layout (49K lines)
├── GlobalHome.vue                # Global workspace view (23K lines)
├── Home.vue                      # Home/quick start (39K lines)
├── AgentView.vue                 # AI agent orchestration (111K lines)
├── AIChat.vue                    # Chat interface (46K lines)
├── Outline.vue                   # Document outline (55K lines)
├── KnowledgeBase.vue             # RAG knowledge base (40K lines)
├── ProofreadView.vue             # AI proofreading (42K lines)
├── GraphWindow.vue               # Chart/diagram tools (50K lines)
├── DataAnalysisWindow.vue        # Data analysis tools (63K lines)
├── OcrWindow.vue                 # OCR interface (102K lines)
├── FomulaRecognition.vue         # Formula OCR (54K lines)
├── AigcDetectionWindow.vue       # AI content detection (95K lines)
├── AttachmentWindow.vue          # File attachments (24K lines)
├── UserFeedbackView.vue          # User feedback form (22K lines)
├── UserManual.vue                # Interactive user manual
├── LlmStatisticsView.vue         # LLM usage statistics
├── NewDocumentWorkspace.vue      # Create new document/workspace
├── Setting.vue                   # Settings root
├── About.vue                     # About page
├── DebugView.vue                 # Debug/developer view
├── DummyView.vue                 # Placeholder/empty view
└── setting/                      # Settings sections subdirectory
    ├── SettingBasicSection.vue
    ├── SettingThemeSection.vue
    ├── SettingLlmSection.vue
    ├── SettingKnowledgeBaseSection.vue
    ├── SettingImageSection.vue
    ├── SettingDebugSection.vue
    ├── SettingLoggerSection.vue
    └── SettingAboutSection.vue
```

## WHERE TO LOOK

| Task | View | Notes |
|------|------|-------|
| Editor feature | `MarkdownEditor.vue`, `LaTeXEditor.vue` | Monaco (LaTeX) + Vditor (MD) |
| AI agent UI | `AgentView.vue` | Workflow canvas, agent config, execution |
| Chat interface | `AIChat.vue` | AI conversation UI |
| Document outline | `Outline.vue` | Hierarchical outline tree, AI tools |
| Settings | `Setting.vue`, `setting/*Section.vue` | 8 setting sections |
| Knowledge base | `KnowledgeBase.vue` | RAG management, document upload |
| Add new view | Create `.vue` + register in `router/router.js` | Also add to `pages` map for aux windows |

## CONVENTIONS

- **Route registration**: All views registered in `router/router.js` with `meta.requiresLayout` for main routes
- **Auxiliary windows**: `pages` map in router defines which views can open in separate windows
- **View size**: Views are large (20K-156K lines) — be cautious when editing; prefer composition with components
- **Editor views**: `MarkdownEditor.vue` and `LaTeXEditor.vue` are the largest; contain complex editor integration logic
- **Settings pattern**: `Setting.vue` is shell; sections in `setting/` subdirectory via dynamic components
- **Naming**: PascalCase `.vue` files matching route name

## ANTI-PATTERNS

- **Massive view files**: Several views exceed 50K lines (`LaTeXEditor.vue` 156K, `MarkdownEditor.vue` 114K, `AgentView.vue` 111K) — avoid adding more logic; extract to composables/components
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
