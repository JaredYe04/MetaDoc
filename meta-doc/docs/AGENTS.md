# Documentation Hub

**Generated:** 2026-02-26

## OVERVIEW

Internal documentation for MetaDoc developers. Architecture decisions, migration guides, technical references, and process documentation. 37+ documents covering AI systems, exports, multi-window architecture, and more.

## STRUCTURE

```
docs/
├── ai-schema-task-usage.md          # AI task schema usage patterns
├── DEMO_MODE_COVERAGE_LINTING.md    # Demo coverage enforcement rules
├── demo-min-height-guide.md         # Component demo sizing guidelines
├── DOCX_EXPORT_CODE_STRUCTURE.md    # DOCX export architecture
├── DOCX_EXPORT_FORMULA_FLOW.md      # Formula handling in DOCX
├── EXPORT_ADAPTER_REFACTOR.md       # Export adapter refactoring
├── IMAGE_PROTOCOL_*.md              # Image protocol refactoring (4 docs)
├── lint-manuals.md                  # Manual linting documentation
├── MIGRATION_GUIDE.md               # Project migration guide
├── MIGRATION_TODO_LIST.md           # Migration task tracking
├── MULTI_WINDOW_*.md                # Multi-window architecture (2 docs)
├── OUTLINE_*.md                     # Outline view documentation (5 docs)
├── PLANTUML_EXPORT_*.md             # PlantUML export docs (2 docs)
├── progress-handle.md               # Progress handling patterns
├── RAG_KNOWLEDGE_BASE.md            # RAG system documentation
├── REFACTOR_*.md                    # Refactoring documentation (2 docs)
├── releases/                        # Release notes
├── tests/                           # Test documentation
├── USER_MANUAL_INDEX.md             # User manual organization
├── UTILS_REFACTOR_GUIDE.md          # Utils refactoring patterns
└── VERSION_MANAGEMENT.md            # Version management
```

## WHERE TO LOOK

| Topic                | Document                        | Notes                             |
| -------------------- | ------------------------------- | --------------------------------- |
| Demo coverage rules  | `DEMO_MODE_COVERAGE_LINTING.md` | Enforcement policy, linting rules |
| Export architecture  | `DOCX_EXPORT_*.md`              | DOCX generation, formula flow     |
| Multi-window system  | `MULTI_WINDOW_*.md`             | Tab management, test cases        |
| Outline view         | `OUTLINE_*.md`                  | Technical ref, UI spec, fixes     |
| RAG system           | `RAG_KNOWLEDGE_BASE.md`         | Vector search, knowledge base     |
| Image handling       | `IMAGE_PROTOCOL_*.md`           | Protocol refactoring, call chains |
| Migration guide      | `MIGRATION_GUIDE.md`            | Large-scale migrations            |
| Refactoring patterns | `REFACTOR_*.md`                 | Completed refactors summary       |

## CONVENTIONS

- **Naming:** UPPERCASE for architecture docs, lowercase for guides
- **Suffixes:** `_GUIDE.md` (how-to), `_STRUCTURE.md` (architecture), `_FLOW.md` (process)
- **Related docs:** Group with prefix (e.g., `OUTLINE_*.md`, `IMAGE_PROTOCOL_*.md`)
- **Cross-references:** Link to parent AGENTS.md and related docs

## ANTI-PATTERNS

- **Don't duplicate root AGENTS.md content** - Root covers codebase, this covers docs/
- **Don't use docs/ for user-facing content** - Use `src/renderer/src/manuals/` instead
- **Don't leave outdated migration docs** - Update or archive when complete

## NOTES

- Documentation is primarily in **English** (developer-facing)
- Some docs are bilingual (e.g., `OUTLINE_UI_FIXES.md`)
- Mermaid/PlantUML diagrams validated via Puppeteer in `lint-manuals.js`
- Release notes maintained in `releases/` subdirectory
