# PROJECT KNOWLEDGE BASE

**Generated:** 2026-02-26
**Commit:** ba1f5d5
**Branch:** main

---

## ⚠️ BUILD RESPONSIBILITY PROTOCOL

> **CRITICAL: Build initiators MUST resolve ALL errors**
>
> Running `npm run build` requires taking responsibility for:
>
> - ✅ Prettier errors → run `npm run format`
> - ✅ ESLint errors → fix code style issues
> - ✅ Manual doc errors → fix markdown, Mermaid/PlantUML, broken links
> - ✅ TypeScript errors → fix type errors and imports
>
> **DO NOT leave build with unresolved errors.**

---

## 🧠 Code Quality: "Sanity Value"

> **"San 值" = Code maintainability and health**

| Approach       | Result                | Verdict        |
| -------------- | --------------------- | -------------- |
| Disable checks | Problems hidden       | ❌ Denial      |
| Bypass checks  | Tech debt accumulates | ❌ Toxic       |
| Fix problems   | Code stays healthy    | ✅ Responsible |

**Rule Levels:**

1. **error** - Runtime/logic errors → Fix immediately
2. **warn** - Quality issues → Fix progressively
3. **off** - Style issues → Restore gradually

---

## 📚 Demo Mode Coverage (MANDATORY)

**Rule:** Every manual document must have **at least 2 demo components**

**Simple:** ≥ 2 demos per document, regardless of length or complexity

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

See: `docs/DEMO_MODE_COVERAGE_LINTING.md`

---

## 📚 Demo 添加方法论（禁止 Demo Hacking）

### 核心原则

**严禁为了凑数而添加无关的 Demo**。每个 Demo 必须真实反映文档内容，具有教学价值。

### 正确流程

当文档需要添加 Demo 但缺乏合适的组件时：

1. **分析文档主题** → 确定需要展示的核心功能
2. **搜索相关组件** → 使用 explore agent 查找与主题相关的现有组件
3. **实现 Demo 模式** → 如果组件没有 demo 模式，为其添加 `mode="demo"` 支持
4. **注册到 Demo Registry** → 在 `demo-registry-components.ts` 中注册
5. **插入相关 Demo** → 将真正相关的 Demo 添加到用户指南文章中

### 禁止行为（Demo Hacking）

❌ **Universal Demo Cluster 反模式**：

```markdown
<!-- 错误：为了凑数而添加的无关组件 --
<AIChat mode="demo" />
<KnowledgeBase mode="demo" />
<ProofreadView mode="demo" />
<QuickStartPanel mode="demo" />
```

❌ **复制粘贴 Demo**：

- 不思考文档主题，直接复制其他文件的 Demo
- 在完全不相关的文档中添加 AIChat、KnowledgeBase 等通用组件

### 组件-主题映射指南

| 文档主题             | 正确组件                | 错误示例               |
| -------------------- | ----------------------- | ---------------------- |
| Statistics/Analytics | `*StatisticsView`       | `SettingLlmSection` ❌ |
| Settings/Config      | `Setting*Section`       | `MainTabs` ❌          |
| AI Features          | 对应的 AI 组件          | 通用组件充数 ❌        |
| Shortcuts            | `MenuItemsDemo`、键盘表 | `AIChat` ❌            |

### 实施检查清单

添加 Demo 前自问：

- [ ] 这个 Demo 是否直接说明了当前章节的内容？
- [ ] 用户能从这个 Demo 中学到什么？
- [ ] 组件类型是否适合本文档主题？
- [ ] 是否查阅了 `TOPIC_COMPONENT_MAPPING.md`？

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

| Task              | Location                                     | Notes                                        |
| ----------------- | -------------------------------------------- | -------------------------------------------- |
| IPC handlers      | `src/main/main-calls.ts`                     | 6119-line monolith                           |
| Window management | `src/main/window-manager.ts`                 | Multi-window system                          |
| Tab drag (main)   | `src/main/drag-manager.ts`                   | Cross-window coordination                    |
| Tab operations    | `src/renderer/src/composables/`              | useTabDrag, useTabOperations, useTabSwitcher |
| Agent framework   | `src/renderer/src/utils/agent-framework/`    | Engines, workflows                           |
| AI tools          | `src/renderer/src/utils/agent-tools/`        | 20+ tools                                    |
| Document state    | `src/renderer/src/stores/workspace.ts`       | 2009 lines                                   |
| Export adapters   | `src/renderer/src/services/export-adapters/` | Strategy pattern                             |
| LLM adapters      | `src/renderer/src/utils/llm-adapters/`       | OpenAI, Ollama, Gemini                       |
| Database          | `src/main/database/`                         | better-sqlite3                               |
| shadcn-vue UI     | `src/renderer/src/components/ui/`            | 93 components                                |

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

| Type     | Use           | Example                    |
| -------- | ------------- | -------------------------- |
| feat     | New feature   | `feat: 添加大纲拖拽功能`   |
| fix      | Bug fix       | `fix: 修复标签页切换问题`  |
| docs     | Documentation | `docs: 更新 AGENTS.md`     |
| style    | Formatting    | `style: 统一缩进`          |
| refactor | Refactoring   | `refactor: 重构标签页逻辑` |
| test     | Tests         | `test: 添加单元测试`       |
| chore    | Build/tools   | `chore: 升级 Electron`     |

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

# Wayland (Linux)
ELECTRON_OZONE_PLATFORM_HINT=wayland OZONE_PLATFORM=wayland npm run dev

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

---

## Documentation Demo Standards

> **Purpose**: Prevent "linting hacks" and ensure demos actually illustrate document content  
> **Case Study**: 58-demo cleanup (62 files, 779→329 demos, 58% reduction)  
> **Related**: [TOPIC_COMPONENT_MAPPING.md](./TOPIC_COMPONENT_MAPPING.md), [DEMO_COVERAGE_POLICY.md](./DEMO_COVERAGE_POLICY.md)

---

### 1. Demo Relevance Principle

#### The Golden Rule

**Every demo MUST directly illustrate document content.**

| ✅ GOOD                                                   | ❌ BAD                                                                          |
| --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `<LlmStatisticsView mode="demo" />` in LLM statistics doc | `<SettingLlmSection mode="demo" />` in statistics doc (shows config, not stats) |
| `<ProofreadView mode="demo" />` in AI proofreading doc    | `<AIChat mode="demo" />` in auto-completion doc (chat ≠ completion)             |
| `<MainTabs mode="demo" />` in multi-tab management doc    | `<AIChat mode="demo" />` at end of shortcuts doc (irrelevant filler)            |

#### The Teaching Test

Ask yourself: _"Does this demo teach the user something about the feature being documented?"_

- **YES** → Keep it
- **NO / Maybe** → Remove it
- "It's just to pass linting" → **Definitely remove it**

#### Document-Demo Alignment

```
Document Topic          → Appropriate Demo Type
─────────────────────────────────────────────────
Statistics/Analytics    → StatisticsView components (data visualization)
Settings/Configuration  → Setting*Section components (config panels)
AI Features             → AI* components (interactive AI interfaces)
Shortcuts               → Keyboard visualizations or minimal UI demos
Core Features           → Relevant view components (tabs, editors, etc.)
```

---

### 2. Universal Demo Cluster Anti-Pattern

#### The Pattern

The following component cluster is a **red flag** for lazy demo addition:

```markdown
<AIChat mode="demo" />
<KnowledgeBase mode="demo" />
<ProofreadView mode="demo" />
<QuickStartPanel mode="demo" />
<AgentView mode="demo" />
```

#### Why It's Wrong

1. **Copy-paste without thought** — Same components appearing in unrelated documents
2. **Generic fillers** — Added solely to hit coverage numbers
3. **Zero educational value** — User learns nothing about the actual document topic
4. **Visual noise** — Clutters the document with irrelevant UI

#### How to Identify It

**Symptoms of the anti-pattern:**

- Multiple high-level view components in a row
- Components unrelated to document topic
- Appearing at end of file (padding to hit count)
- Same sequence appearing across multiple documents

**Case Study**: `shortcuts/editor.md` had this filler block:

```markdown
<!-- END OF DOCUMENT -->
<MenuItemsDemo mode="demo" :items='[{"id": "file"}]' />
<ViewMenuItemsDemo mode="demo" :items='["editor"]' />
<AIChat mode="demo" />
<CompletionSettingsPanel mode="demo" />
<SettingLlmSection mode="demo" />
<MainTabs mode="demo" />
<QuickStartPanel mode="demo" />
<Outline mode="demo" />
<AgentView mode="demo" />
<LaTeXEditorDemo mode="demo" />
<SettingBasicSection mode="demo" />
<SettingThemeSection mode="demo" />
<KnowledgeBase mode="demo" />
```

**Result**: 12 of 14 demos removed — only `<SearchReplaceMenu>` was relevant to editor shortcuts.

---

### 3. Demo Selection Guidelines by Topic

#### Statistics Documents

**Use**: `*StatisticsView` components

| Document                  | Correct Component            | Wrong Component         |
| ------------------------- | ---------------------------- | ----------------------- |
| `statistics/llm.md`       | `LlmStatisticsView`          | `SettingLlmSection` ❌  |
| `statistics/proofread.md` | `ProofreadView` (stats mode) | `OutlineTreeDisplay` ❌ |

**Principle**: Show data visualization, not configuration panels.

#### Settings Documents

**Use**: `Setting*Section` components

| Document            | Component             |
| ------------------- | --------------------- |
| `settings/theme.md` | `SettingThemeSection` |
| `settings/llm.md`   | `SettingLlmSection`   |
| `settings/basic.md` | `SettingBasicSection` |
| `settings/about.md` | `SettingAboutSection` |

**Principle**: Show the settings panel being documented.

#### AI Documents

**Match AI feature to correct component:**

| Feature         | Correct Component         | Common Mistake                        |
| --------------- | ------------------------- | ------------------------------------- |
| AI Chat         | `AIChat`                  | Using in completion docs ❌           |
| AI Proofreading | `ProofreadView`           | Over-use (11 instances in one doc) ❌ |
| Auto-Completion | `CompletionSettingsPanel` | Using `AIChat` ❌                     |
| Task Queue      | `AITaskQueue`             | Using `AIChat` ❌                     |

#### Shortcuts Documents

**Use**: Keyboard visualizations or minimal UI

| Document              | Appropriate                                     |
| --------------------- | ----------------------------------------------- |
| `shortcuts/global.md` | `MenuItemsDemo`, `MainTabs`, or keyboard tables |
| `shortcuts/editor.md` | `SearchReplaceMenu`, keyboard tables            |

**Principle**: Show how to trigger actions, not the actions themselves.

#### Core Features

**Match feature to relevant view:**

| Feature           | Component                       |
| ----------------- | ------------------------------- |
| Multi-tab         | `MainTabs`                      |
| File operations   | `MenuItemsDemo` (file menu)     |
| Editor basics     | `LaTeXEditor`, `MarkdownEditor` |
| Document metadata | `MetaInfoPanel`                 |

---

### 4. Repetition Limits

#### The Rule

**Maximum 3-4 instances of the same component per file.**

#### Strategic Placement

Place demos at key narrative points:

```markdown
# Document Title

<intro demo> ← After introduction

## First Major Section

<feature demo> ← Illustrating key feature

## Second Major Section

### Subsection A

<another demo> ← Supporting specific point

## Summary

<concluding demo> ← Wrapping up
```

#### Anti-Pattern: Repetition Abuse

❌ **BAD**: 11 `ProofreadView` demos in `ai/proofread.md`

- 9 removed, 3 kept (intro, feature detail, summary)

❌ **BAD**: 20 `AgentView` demos in `agent/session.md`

- 14 removed, 6 kept at key workflow points

✅ **GOOD**: `quick-start/guide.md` with 5 well-placed demos

- Each serves a distinct educational purpose

---

### 5. Component-Topic Mapping

#### Reference: TOPIC_COMPONENT_MAPPING.md

Always consult the mapping guide at `manuals/TOPIC_COMPONENT_MAPPING.md` for authoritative component selection.

#### Common Mismatches to Avoid

| Mismatch                                  | Problem                 | Correct                            |
| ----------------------------------------- | ----------------------- | ---------------------------------- |
| `statistics/llm.md` → `SettingLlmSection` | Shows config, not stats | `LlmStatisticsView`                |
| `ai/chat.md` → `SettingLlmSection`        | Shows config, not chat  | `AIChat`                           |
| `ai/completion.md` → `AIChat`             | Chat ≠ completion       | `CompletionSettingsPanel`          |
| `settings/theme.md` → `MainTabs`          | Tabs ≠ theme settings   | `SettingThemeSection`              |
| `shortcuts/global.md` → `AIChat`          | Irrelevant to shortcuts | `MenuItemsDemo` or keyboard tables |

#### When No Suitable Demo Exists

**Option 1**: Create a new component with demo mode support

```typescript
// Add mode="demo" support
const props = defineProps<{
  mode?: 'normal' | 'demo'
}>()
```

**Option 2**: Use navigation helper components

```markdown
<MenuItemsDemo mode="demo" :items='[{"id": "settings"}]' />
<ViewMenuItemsDemo mode="demo" :items='["editor", "outline"]' />
```

**Option 3**: Apply for exemption (rare)

```markdown
<!-- demo-exempt: 纯概念文档，无UI元素 -->
```

---

### 6. Linting Hack Detection

#### Signs of Lazy Demo Addition

| Sign                                   | Detection Method                       |
| -------------------------------------- | -------------------------------------- |
| **End-of-file clustering**             | Demos appear in last 20% of document   |
| **Generic component sequences**        | Same unrelated components across files |
| **Topic mismatch**                     | AI components in shortcuts docs        |
| **Excessive repetition**               | >4 same components in one file         |
| **Non-existent components**            | Components not in registry             |
| **Configuration vs display confusion** | `Setting*` in statistics docs          |

#### Review Checklist

When reviewing demos, ask:

- [ ] Does this demo directly illustrate the current section's content?
- [ ] Would a user learn something about the feature from this demo?
- [ ] Is the component type appropriate for this document topic?
- [ ] Is this demo strategically placed (not just padding)?
- [ ] Have I checked TOPIC_COMPONENT_MAPPING.md for guidance?
- [ ] Is the component registered in `demo-registry-components.ts`?

#### Decision Tree: New Demo vs Existing

```
Document needs demo
        ↓
Does component exist for this feature?
        ↓
    YES → Use existing (check mapping guide)
        ↓
    NO  → Can existing component be adapted?
            ↓
        YES → Extend with props
            ↓
        NO  → Create new component with demo mode
```

---

### Case Study: The 58-Demo Cleanup

#### The Problem

- **62 files** with documentation
- **779 total demos** (average: 12.5 per file)
- **~450 problematic demos** (58%)
- **Critical issues**: Wrong components, excessive repetition, generic fillers

#### Key Findings

| File                  | Before   | Problem                          | After                 |
| --------------------- | -------- | -------------------------------- | --------------------- |
| `statistics/llm.md`   | 0 demos  | Missing all demos                | 3 `LlmStatisticsView` |
| `ai/proofread.md`     | 12 demos | 11 repetitive `ProofreadView`    | 3 targeted demos      |
| `agent/session.md`    | 20 demos | Excessive `AgentView` repetition | 6 workflow demos      |
| `shortcuts/editor.md` | 14 demos | 12 generic end-of-file fillers   | 2 relevant demos      |

#### The Cleanup Impact

- **Before**: 779 demos, 58% problematic
- **After**: ~329 demos, 0% problematic
- **Result**: Better docs, faster builds, happier users

#### Lessons Learned

1. **Coverage ≠ Quality** — Hitting the number doesn't help if demos are irrelevant
2. **Repetition hurts** — 11 of the same component teaches nothing new
3. **Context matters** — The same component means different things in different docs
4. **Strategic placement > padding** — Fewer, well-placed demos beat many random ones

---

### Quick Reference

#### Good vs Bad Examples

```markdown
<!-- ✅ GOOD: Statistics doc shows statistics -->

## LLM Statistics

View your LLM usage statistics below:

<LlmStatisticsView mode="demo" />

<!-- ❌ BAD: Statistics doc shows settings -->

## LLM Statistics

<SettingLlmSection mode="demo" /> <!-- WRONG: This is config, not stats! -->
```

```markdown
<!-- ✅ GOOD: Strategic placement -->

# AI Proofreading

<ProofreadView mode="demo" />

## How It Works

...explanation...

## Reviewing Suggestions

<ProofreadView mode="demo" suggestion="example" />

<!-- ❌ BAD: Repetition abuse -->

# AI Proofreading

<ProofreadView mode="demo" />
<ProofreadView mode="demo" />
<ProofreadView mode="demo" />  <!-- 11 total in document -->
```

```markdown
<!-- ✅ GOOD: Shortcuts doc shows shortcuts -->

## Global Shortcuts

| Shortcut | Action        |
| -------- | ------------- |
| Ctrl+N   | New document  |
| Ctrl+O   | Open document |

<MenuItemsDemo mode="demo" :items='[{"id": "file"}]' />

<!-- ❌ BAD: Shortcuts doc shows unrelated features -->

## Global Shortcuts

<AIChat mode="demo" /> <!-- WRONG: Nothing to do with shortcuts! -->
<KnowledgeBase mode="demo" /> <!-- WRONG: Irrelevant! -->
```

#### Remember

1. **Teach, don't fill** — Every demo should educate
2. **Match the topic** — Right component for the right doc
3. **Place strategically** — Intro, key sections, summary
4. **Limit repetition** — Max 3-4 of same component
5. **Check the mapping** — When in doubt, consult TOPIC_COMPONENT_MAPPING.md
