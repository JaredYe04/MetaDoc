# PROJECT KNOWLEDGE BASE

**Generated:** 2026-02-24
**Commit:** 1251603
**Branch:** main

---

## ⚠️ BUILD RESPONSIBILITY PROTOCOL

> **CRITICAL: Build initiators MUST resolve ALL errors**
>
> Running `npm run build` requires taking responsibility for:
> - ✅ Prettier errors → run `npm run format`
> - ✅ ESLint errors → fix code style issues
> - ✅ Manual doc errors → fix markdown, Mermaid/PlantUML, broken links
> - ✅ TypeScript errors → fix type errors and imports
>
> **DO NOT leave build with unresolved errors.**

---

## 🧠 Code Quality: "Sanity Value"

> **"San 值" = Code maintainability and health**

| Approach | Result | Verdict |
|----------|--------|---------|
| Disable checks | Problems hidden | ❌ Denial |
| Bypass checks | Tech debt accumulates | ❌ Toxic |
| Fix problems | Code stays healthy | ✅ Responsible |

**Rule Levels:**
1. **error** - Runtime/logic errors → Fix immediately
2. **warn** - Quality issues → Fix progressively
3. **off** - Style issues → Restore gradually

---

## 📚 Demo Mode Coverage (MANDATORY)

**Formula:** `Required Demos = MAX(CEIL((H1 + H2 + H3) / 3), 2)`

- 6 headings → 2 demos | 3 headings → 2 demos | 9 headings → 3 demos

**Implementation:**
```markdown
<MenuItemsDemo mode="demo" :items='[{"id": "file"}]' />
<Outline mode="demo" />
```

**FORBIDDEN:**
- ❌ `eslint-disable` comments to skip checks
- ❌ Modifying `lint-manuals.js` requirements
- ❌ `--no-verify` commits
- ❌ Downgrading rules from error to warn
- ❌ Bypassing `DEMO_COVERAGE_POLICY.md`

See: `src/renderer/src/manuals/DEMO_COVERAGE_POLICY.md`

---

## OVERVIEW

MetaDoc — LLM Agent-powered document processing desktop app. Electron (main: TypeScript) + Vue 3 (mixed TS/JS) + Pinia + shadcn-vue + Element Plus. Markdown/LaTeX editing, AI agent framework, multi-format export, RAG knowledge base, OCR. Capacitor Android target included.

## STRUCTURE

```
meta-doc/
├── src/
│   ├── main/              # Electron main process
│   │   ├── database/      # SQLite + sqlite-vec
│   │   ├── export/        # Server-side export
│   │   └── utils/         # Services: RAG, OCR, spell-check, LaTeX
│   ├── renderer/src/      # Vue 3 SPA
│   │   ├── components/    # 53 Vue + 93 shadcn-vue UI
│   │   ├── views/         # 28 route views
│   │   ├── stores/        # Pinia stores
│   │   ├── services/      # Document ops, export adapters
│   │   ├── editor/        # Monaco + Vditor adapters
│   │   ├── composables/   # Tab drag, switcher, operations
│   │   └── utils/         # Agent framework, tools, LLM adapters
│   ├── common/            # Shared constants
│   ├── preload/           # Electron preload
│   └── types/             # Shared TypeScript types
├── scripts/               # Build/release scripts
├── resources/             # Runtime assets
├── docs/                  # Internal docs
└── android/               # Capacitor Android
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| IPC handlers | `src/main/main-calls.ts` | 6119-line monolith |
| Window management | `src/main/window-manager.ts` | Multi-window system |
| Tab drag (main) | `src/main/drag-manager.ts` | Cross-window coordination |
| Tab operations | `src/renderer/src/composables/` | useTabDrag, useTabOperations, useTabSwitcher |
| Agent framework | `src/renderer/src/utils/agent-framework/` | Engines, workflows |
| AI tools | `src/renderer/src/utils/agent-tools/` | 20+ tools |
| Document state | `src/renderer/src/stores/workspace.ts` | 2009 lines |
| Export adapters | `src/renderer/src/services/export-adapters/` | Strategy pattern |
| LLM adapters | `src/renderer/src/utils/llm-adapters/` | OpenAI, Ollama, Gemini |
| Database | `src/main/database/` | better-sqlite3 |
| shadcn-vue UI | `src/renderer/src/components/ui/` | 93 components |

## CONVENTIONS

- **Formatting:** Prettier, single quotes, no semicolons, printWidth 100
- **TypeScript:** Strict mode, `allowJs: true` (mixed codebase)
- **Paths:** `@/*` → `src/*`, `@renderer/*` → `src/renderer/src/*`
- **Comments:** Chinese for inline/docs, English for types/exports
- **Components:** PascalCase `.vue`, single-word allowed
- **State:** Pinia composition API stores
- **IPC:** Renderer `invoke` → Main `handle` in main-calls.ts
- **Services:** Singleton with `createMainLogger(scope)`
- **Agent tools:** Export `*ToolConfig` object

## GIT COMMITS

**Format:** `<type>: <中文描述>`

| Type | Use | Example |
|------|-----|---------|
| feat | New feature | `feat: 添加大纲拖拽功能` |
| fix | Bug fix | `fix: 修复标签页切换问题` |
| docs | Documentation | `docs: 更新 AGENTS.md` |
| style | Formatting | `style: 统一缩进` |
| refactor | Refactoring | `refactor: 重构标签页逻辑` |
| test | Tests | `test: 添加单元测试` |
| chore | Build/tools | `chore: 升级 Electron` |

## ANTI-PATTERNS

- **DO NOT modify META-INFO lines** in `document-serializer.ts`
- **Tool specs are LLM config** — "Do NOT" / "Important Notes" control AI behavior
- **Avoid more `!important`** — already in 30+ components
- **Don't extend monoliths** — main-calls.ts (6119 lines), workspace.ts (2009 lines), export-manager.ts (3645 lines)
- **Don't use deprecated paths** — express-server.ts legacy, export-manager.obsolete.ts, legacy-exports.js
- **New code = TypeScript** — renderer bootstrap and utils are JS legacy
- **Prompt changes need review** — `locale_prompts/*.json`, `prompts.ts`

## COMMANDS

```bash
# Dev
npm run dev              # Start dev
npm run build            # Production build

# Package
npm run build:win        # Windows
npm run build:linux      # Linux

# Quality
npm run lint             # ESLint auto-fix
npm run format           # Prettier
npm run lint:manuals     # Demo coverage check

# Test
npm run test             # Vitest
npm run test:coverage    # With coverage

# Native
npm run rebuild-native   # Rebuild better-sqlite3
```

## NOTES

- `better-sqlite3` needs C++ toolchain, run `rebuild-native` after install
- Express server on localhost for single-instance + external control
- No CI workflows in `.github/` — release scripts assume external GH Actions
- `.env` required at root, copied to `resources/` at build
- Capacitor 7 in `android/` — shares code via conditional compilation
- **Element Plus → shadcn-vue migration ongoing** — new UI uses shadcn only
