# PROJECT KNOWLEDGE BASE

**Generated:** 2026-02-24
**Commit:** HEAD
**Branch:** main

---

## ⚠️ SYSTEM ALERT - BUILD RESPONSIBILITY PROTOCOL

> **CRITICAL NOTICE FOR ALL AGENTS AND PROCESSES**
>
> **ANY** agent or process that initiates `npm run build` **MUST** take **FULL RESPONSIBILITY** for resolving **ALL** reported errors:
>
> - ✅ **Prettier formatting errors** — Run `npm run format` to fix
> - ✅ **ESLint linting errors** — Fix code style and syntax issues
> - ✅ **Manual document errors** — Fix markdown syntax, Mermaid/PlantUML charts, broken internal links
> - ✅ **TypeScript compilation errors** — Fix type errors and imports
>
> **DO NOT** leave the build process with unresolved errors. The build pipeline is gated by these checks for code quality assurance.
>
> **THIS IS A HARD REQUIREMENT** — Not a suggestion.

---

## 🧠 代码质量理念：维护 "San 值"

> **"San 值"（Sanity Value）= 代码的可维护性和健康度**

### 核心原则

**Linting 不是为了阻止你提交代码，而是为了维护代码的 "san 值"。**

| 做法         | 结果                       | 评价            |
| ------------ | -------------------------- | --------------- |
| **禁用检查** | 问题依然存在，只是你看不到 | ❌ 掩耳盗铃     |
| **绕过检查** | 技术债务累积，后期成本更高 | ❌ 饮鸩止渴     |
| **修复问题** | 代码保持健康，团队效率提升 | ✅ 负责任的做法 |

### 规则层级

1. **error（致命）**：会导致运行时错误或逻辑错误

   - 例如：`no-undef`（使用未定义变量 → ReferenceError）
   - 例如：`no-dupe-else-if`（重复条件 → 逻辑错误）
   - **必须立即修复**

2. **warn（警告）**：代码质量问题

   - 例如：`no-unused-vars`（未使用变量 → 死代码）
   - 例如：`no-case-declarations`（case 块中声明变量 → 作用域陷阱）
   - **应该逐步修复**

3. **off（暂缓）**：风格问题或数量太多暂时关闭
   - **有计划地逐步恢复**

### 我们的承诺

- ✅ 不禁用检查来掩盖问题
- ✅ 不删除测试来让构建通过
- ✅ 修复问题的根本原因
- ✅ 将修复代码视为与编写代码同等重要的工作

---

## 📚 文档质量要求：Demo Mode Coverage（不可绕过）

> **⚠️ 重要：这是强制执行的政策**
>
> 完整的政策文档请参阅 **`src/renderer/src/manuals/DEMO_COVERAGE_POLICY.md`**
> 所有规定在该文档中有详细说明。

### 规则定义

**所有用户手册文档**（`src/renderer/src/manuals/**/*.md`）**必须**满足 Demo Mode 覆盖率要求：

```
Required Demo Modes = MAX(CEIL((H1 + H2 + H3) / 3), 2)
```

**计算公式**：

1. 统计文档中 H1、H2、H3 标题数量
2. 计算 `(标题数 / 3)` 向上取整
3. **最小值为 2**（即使只有 1-2 个标题，也至少需要 2 个 Demo）

**示例**：

- 6 个标题 → ceil(6/3) = **2 个 Demo**
- 3 个标题 → ceil(3/3) = 1 → max(1, 2) = **2 个 Demo**
- 9 个标题 → ceil(9/3) = **3 个 Demo**

### 为什么这是硬性要求？

1. **文档即交互**：MetaDoc 的手册不是静态文本，而是可交互的实机演示
2. **零认知负担**：用户不需要切换窗口就能理解功能
3. **沉浸式学习**：边看文档边操作真实组件
4. **质量标准**：标题数量反映内容复杂度，Demo 数量必须与之匹配

### 实现方式

在 Markdown 中嵌入 Vue 组件：

```markdown
<MenuItemsDemo mode="demo" :items='[{"id": "file"}]' />
<MainTabs mode="demo" />
<Outline mode="demo" />
```

### ⚠️ 不可绕过的限制

**禁止**以下行为：

- ❌ 使用 `<!-- eslint-disable -->` 或类似注释跳过检查
- ❌ 修改 `scripts/lint-manuals.js` 降低要求或删除检查
- ❌ 使用 `--no-verify` 提交
- ❌ 将规则从 error 降级为 warn
- ❌ 在 AGENTS.md 中删除或修改此规则说明
- ❌ 任何试图绕过 `DEMO_COVERAGE_POLICY.md` 的行为

**违规后果**：

- 构建会被阻塞（`npm run build` 会失败）
- 代码无法合并到主分支
- 需要立即修复

### 如何修复

如果 lint 报错：

```
Demo模式覆盖不足: 需要 3 个 (H1-H3共8个标题), 实际只有 1 个
```

**修复步骤**：

1. 在文档中提到的每个界面控件旁添加对应 Demo 组件
2. 参考 `src/renderer/src/manuals/zh_CN/quick-start/guide.md` 作为标杆
3. 查看 `src/renderer/src/manuals/WRITING_GUIDE.md` 了解可用组件
4. **阅读 `src/renderer/src/manuals/DEMO_COVERAGE_POLICY.md` 了解详细政策**
5. 重新运行 `npm run lint:manuals` 验证

### 相关文件

- **政策文档**: `src/renderer/src/manuals/DEMO_COVERAGE_POLICY.md` - **强制执行的政策**
- **Lint 脚本**: `scripts/lint-manuals.js` - `checkDemoModeCoverage()` 函数
- **规则文档**: `docs/DEMO_MODE_COVERAGE_LINTING.md`
- **组件使用**: `src/renderer/src/manuals/WRITING_GUIDE.md`
- **组件注册**: `src/renderer/src/manuals/demo-registry-components.ts`

---

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
├── build/                 # Electron-builder assets (icons, installers)
└── tests/                 # Vitest tests (unit tests for utils, composables)
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
# Development
npm run dev              # Start dev (electron-vite + vite concurrently)
npm run build            # Production build (prebuild + electron-vite build)
npm run build:sequential # CI-friendly build (lower memory, sequential targets)

# Packaging
npm run build:win        # Package for Windows
npm run build:mac        # Package for macOS
npm run build:linux      # Package for Linux

# Code Quality
npm run lint             # ESLint with auto-fix
npm run format           # Prettier format all
npm run lint:manuals     # Lint user manual documents (Demo Mode coverage)

# Testing
npm run test             # Run Vitest unit tests
npm run test:ui          # Run tests with UI
npm run test:app         # Run in-app test framework
npm run test:coverage    # Run tests with coverage

# Native Dependencies
npm run rebuild-native   # Rebuild better-sqlite3 for Electron ABI

# Release
npm run audit            # Run code audit script
npm run release:dev      # Dev release flow
npm run release:prod     # Production release flow
```

## TESTING

```bash
npm run test             # Run Vitest unit tests
npm run test:ui          # Run tests with UI
npm run test:app         # Run in-app test framework
npm run test:coverage    # Run tests with coverage
```

**Dual test system**:
- **Vitest**: Standard unit tests for utilities, composables, services
- **In-app test framework**: Custom test runner within Electron environment for integration tests; located in `src/renderer/src/test-app/`

## NOTES

- **Native deps**: `better-sqlite3` requires `electron-rebuild` after install; needs C++ build toolchain
- **Embedded Express server**: main process runs HTTP API on localhost for single-instance delegation and external control — not just IPC
- **No CI workflows committed**: `.github/` has release-logs only; no Actions YAMLs. Release scripts assume GH Actions exist externally
- **Postinstall sets ELECTRON_MIRROR**: `scripts/postinstall-electron.js` overrides Electron download mirrors (npmmirror) — may need adjustment in other networks
- **.env required**: prebuild copies `.env` from root to `resources/`; must exist before build
- **Java env for PlantUML**: main process sets `JAVA_OPTS=-Dfile.encoding=UTF-8` at startup for PlantUML UTF-8 support
- **GPU auto-detection**: `shouldDisableGPU()` in main/index.ts disables GPU for CI/WSL/headless Linux
- **Android target**: Capacitor 7 integration in `android/` directory — shares most code with desktop via conditional compilation
- **Hybrid UI migration**: Ongoing Element Plus → shadcn-vue transition; new code should use shadcn-vue exclusively
