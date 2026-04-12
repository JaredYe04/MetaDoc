# Documentation Hub

**Generated:** 2026-02-26

## OVERVIEW

Internal documentation for MetaDoc developers. Architecture decisions, migration guides, technical references, and process documentation. 37+ documents covering AI systems, exports, multi-window architecture, and more.

## STRUCTURE

Topic subfolders keep the root small. **Human-readable index (中文):** [README.md](./README.md).

```
docs/
├── README.md                 # Topic index (简体中文)
├── AGENTS.md                 # This file
├── USER_MANUAL_INDEX.md      # User manual organization (not end-user content)
├── ai/                       # RAG, LLM architecture, Vercel AI SDK, task schema
├── outline/                  # Outline view: specs, migration, flash fixes
├── export/                   # DOCX, PlantUML, export adapter refactor
├── image-protocol/           # Image protocol refactor, call chains, tests
├── migration/                # MIGRATION_GUIDE, MIGRATION_TODO_LIST
├── window-tabs/              # Multi-window tabs, sessions, test cases
├── refactoring/              # Refactor summaries, utils, terminal plans
├── dev/                      # Demo coverage, lint manuals, SQLite, spell check, version
├── platform/                 # Windows file association（Steam 成就资源见 ../third-party/steam-achievements/）
├── meta/                     # README_PROJECT and other meta
├── releases/                 # Release / CI docs
└── tests/                    # Test notes and examples
```

## WHERE TO LOOK

| Topic                | Location                         | Notes                             |
| -------------------- | -------------------------------- | --------------------------------- |
| Demo coverage rules  | `dev/DEMO_MODE_COVERAGE_LINTING.md` | Enforcement policy, linting rules |
| Export architecture  | `export/DOCX_EXPORT_*.md`, `export/PLANTUML_*.md` | DOCX, PlantUML, adapters   |
| Multi-window system  | `window-tabs/MULTI_WINDOW_*.md`  | Tab management, test cases        |
| Outline view         | `outline/OUTLINE_*.md`           | Technical ref, UI spec, fixes     |
| RAG / LLM            | `ai/RAG_KNOWLEDGE_BASE.md`, `ai/LLM_AND_AGENT_ARCHITECTURE.md` | Vector KB, architecture |
| Image handling       | `image-protocol/IMAGE_PROTOCOL_*.md` | Protocol refactoring, chains  |
| Migration guide      | `migration/MIGRATION_GUIDE.md`   | Large-scale migrations            |
| Refactoring patterns | `refactoring/REFACTOR_*.md`      | Completed refactors summary       |
| Steam 成就 / VDF / 图标 | `../third-party/steam-achievements/` | `STEAM_ACHIEVEMENTS_AND_STATS.md`、映射表、生成物 |

## CONVENTIONS

- **Naming:** UPPERCASE for architecture docs, lowercase for guides
- **Suffixes:** `_GUIDE.md` (how-to), `_STRUCTURE.md` (architecture), `_FLOW.md` (process)
- **Related docs:** Same topic folder + shared prefix (e.g., `outline/OUTLINE_*.md`)
- **Cross-references:** Link to parent AGENTS.md and related docs

## ANTI-PATTERNS

- **Don't duplicate root AGENTS.md content** - Root covers codebase, this covers docs/
- **Don't use docs/ for user-facing content** - Use `src/renderer/src/manuals/` instead
- **Don't leave outdated migration docs** - Update or archive when complete

## NOTES

- Documentation is primarily in **English** (developer-facing)
- Some docs are bilingual (e.g., `outline/OUTLINE_UI_FIXES.md`)
- Mermaid/PlantUML diagrams validated via Puppeteer in `lint-manuals.js`
- Release notes maintained in `releases/` subdirectory
