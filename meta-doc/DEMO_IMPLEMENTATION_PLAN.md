# Demo Coverage Implementation Plan

## 61 Documents, 593 Missing Demos

**Generated**: 2026-02-24
**Status**: Analysis Complete

---

## Executive Summary

| Metric                                     | Count                    |
| ------------------------------------------ | ------------------------ |
| Total Documents                            | 64                       |
| Currently Passing                          | 1 (quick-start/guide.md) |
| Currently Failing                          | 61                       |
| Total Missing Demos                        | 593                      |
| Documents Fixable with Existing Components | ~55                      |
| Documents Needing New Components           | ~6                       |

---

## Priority Breakdown

### P0 - Critical (9 docs, 87 demos)

High-traffic user-facing documentation. **Fix first.**

### P1 - High Priority (20 docs, 211 demos)

Core feature documentation. **Fix second.**

### P2 - Medium Priority (15 docs, 146 demos)

Settings and configuration docs. **Fix third.**

### P3 - Lower Priority (19 docs, 179 demos)

Advanced/development docs. **Fix last.**

---

## Batch A: Use Existing Components (55 docs)

These documents can be fixed immediately by adding already-registered demo components to the markdown.

### Available Registered Components

```typescript
// Menu Components
MenuItemsDemo // Top menu items
ViewMenuItemsDemo // Sidebar view menu
MainTabs // Tab bar

// AI Features
AIChat // AI chat interface
OcrWindow // OCR interface
GraphWindow // Graph/chart interface
ProofreadView // Proofreading interface
AigcDetectionWindow // AIGC detection
DataAnalysisWindow // Data analysis
FormulaRecognition // Formula recognition

// Settings
SettingLlmSection // LLM settings
SettingThemeSection // Theme settings
SettingKnowledgeBaseSection // Knowledge base settings
SettingBasicSection // Basic settings
SettingImageSection // Image settings
SettingDebugSection // Debug settings
SettingAboutSection // About page
SettingLoggerSection // Logger settings

// Editor Components
SearchReplaceMenu // Find/replace dialog
TitleMenu // Title context menu
SectionOptimizer // Paragraph optimizer
PdfPreviewPanel // PDF preview
ConsoleTerminal // Console output
MetaInfoPanel // Document metadata

// Views
Outline // Document outline
KnowledgeBase // Knowledge base manager

// Quick Start
QuickStartPanel // Format selection
QuickStartMarkdown // Markdown wizard
QuickStartLatex // LaTeX wizard

// Agent Components
AgentView // Main agent view
CompletionSettingsPanel // Completion settings
AgentSessionManager // Session manager
ChartGenerationDisplay // Chart tool display
DiffDisplay // Diff tool display
DataAnalysisDisplay // Data analysis display
OutlineTreeDisplay // Outline tool display
RAGToolDisplay // RAG tool display
WebCrawlerDisplay // Web crawler display
GrepDisplay // Grep tool display
AutoTestResultDisplay // Auto test display
```

### Implementation Pattern

For each document, add components following this pattern:

```markdown
## Section Title

Description text...

<MenuItemsDemo mode="demo" :items='[{"id": "file", "items": ["new"]}]' />
<AIChat mode="demo" />
<SettingLlmSection mode="demo" />
```

---

## P0 - Critical (Use Existing Components)

| Document              | Demos Needed | Components to Add                                                   |
| --------------------- | ------------ | ------------------------------------------------------------------- |
| ai/chat.md            | 14           | AIChat (3x), MenuItemsDemo (10x), ViewMenuItemsDemo (1x)            |
| ai/assistants.md      | 8            | AIChat, GraphWindow, OcrWindow, MenuItemsDemo                       |
| settings/llm.md       | 6            | SettingLlmSection (4x), MenuItemsDemo (2x)                          |
| settings/basic.md     | 7            | SettingBasicSection (4x), MenuItemsDemo (3x)                        |
| settings/theme.md     | 8            | SettingThemeSection (4x), MenuItemsDemo (4x)                        |
| core/editor-basics.md | 9            | SearchReplaceMenu (3x), TitleMenu (3x), ViewMenuItemsDemo (3x)      |
| core/multi-tab.md     | 13           | MainTabs (5x), ViewMenuItemsDemo (4x), MenuItemsDemo (4x)           |
| home/features.md      | 6            | QuickStartPanel, QuickStartMarkdown, QuickStartLatex, MenuItemsDemo |
| markdown/basics.md    | 7            | SearchReplaceMenu (3x), TitleMenu (2x), ViewMenuItemsDemo (2x)      |

**Total P0: 9 documents, 78 demos using existing components**

---

## P1 - High Priority (Use Existing Components)

| Document                     | Demos Needed | Components to Add                                                |
| ---------------------------- | ------------ | ---------------------------------------------------------------- |
| agent/introduction.md        | 9            | AgentView (4x), MenuItemsDemo (5x)                               |
| agent/config.md              | 12           | AgentView (3x), CompletionSettingsPanel (3x), MenuItemsDemo (6x) |
| agent/session.md             | 15           | AgentSessionManager (4x), AgentView (4x), MenuItemsDemo (7x)     |
| agent/tools.md               | 11           | Various tool displays (5x), MenuItemsDemo (6x)                   |
| agent/engine.md              | 10           | AgentView (4x), MenuItemsDemo (6x)                               |
| agent/references.md          | 9            | ReferenceManager (4x), MenuItemsDemo (5x)                        |
| latex/basics.md              | 4            | PdfPreviewPanel (2x), MenuItemsDemo (2x)                         |
| latex/editor.md              | 13           | SearchReplaceMenu (4x), TitleMenu (4x), ViewMenuItemsDemo (5x)   |
| latex/compilation.md         | 10           | ConsoleTerminal (4x), PdfPreviewPanel (3x), MenuItemsDemo (3x)   |
| latex/pdf-preview.md         | 12           | PdfPreviewPanel (6x), MenuItemsDemo (6x)                         |
| latex/console.md             | 11           | ConsoleTerminal (6x), MenuItemsDemo (5x)                         |
| outline/basics.md            | 12           | Outline (6x), ViewMenuItemsDemo (6x)                             |
| outline/ai-features.md       | 12           | Outline (4x), OutlineAiToolbar (4x), ViewMenuItemsDemo (4x)      |
| knowledge-base/management.md | 8            | KnowledgeBase (4x), MenuItemsDemo (4x)                           |
| knowledge-base/usage.md      | 13           | KnowledgeBase (5x), MenuItemsDemo (8x)                           |
| ai/completion.md             | 12           | CompletionSettingsPanel (5x), MenuItemsDemo (7x)                 |
| ai/llm-config.md             | 2            | SettingLlmSection (1x), MenuItemsDemo (1x)                       |
| ai/proofread.md              | 12           | ProofreadView (5x), MenuItemsDemo (7x)                           |
| ai/task-queue.md             | 10           | AgentView (3x), MenuItemsDemo (7x)                               |

**Total P1: 20 documents, 201 demos using existing components**

---

## P2 - Medium Priority (Use Existing Components)

| Document                   | Demos Needed | Components to Add                                              |
| -------------------------- | ------------ | -------------------------------------------------------------- |
| settings/about.md          | 9            | SettingAboutSection (4x), MenuItemsDemo (5x)                   |
| settings/image.md          | 8            | SettingImageSection (4x), MenuItemsDemo (4x)                   |
| settings/image-upload.md   | 9            | SettingImageSection (4x), MenuItemsDemo (5x)                   |
| settings/language.md       | 6            | SettingBasicSection (2x), MenuItemsDemo (4x)                   |
| settings/llm-management.md | 9            | SettingLlmSection (4x), MenuItemsDemo (5x)                     |
| settings/llm-types.md      | 15           | SettingLlmSection (6x), MenuItemsDemo (9x)                     |
| settings/logging.md        | 10           | SettingLoggerSection (4x), MenuItemsDemo (6x)                  |
| settings/menu.md           | 9            | MenuItemsDemo (9x)                                             |
| settings/theme-custom.md   | 9            | SettingThemeSection (4x), MenuItemsDemo (5x)                   |
| core/file-operations.md    | 6            | MainTabs (2x), MenuItemsDemo (4x)                              |
| core/multi-window.md       | 7            | MainTabs (2x), ViewMenuItemsDemo (2x), MenuItemsDemo (3x)      |
| core/document-metadata.md  | 11           | MetaInfoPanel (5x), ViewMenuItemsDemo (3x), MenuItemsDemo (3x) |
| core/export.md             | 12           | MenuItemsDemo (12x)                                            |
| core/editor-settings.md    | 8            | SettingBasicSection (3x), MenuItemsDemo (5x)                   |
| knowledge-base/config.md   | 8            | SettingKnowledgeBaseSection (3x), MenuItemsDemo (5x)           |

**Total P2: 15 documents, 136 demos using existing components**

---

## P3 - Lower Priority (Use Existing Components)

| Document                           | Demos Needed | Components to Add                                                 |
| ---------------------------------- | ------------ | ----------------------------------------------------------------- |
| markdown/advanced.md               | 5            | SearchReplaceMenu (2x), MenuItemsDemo (3x)                        |
| markdown/editor.md                 | 8            | ViewMenuItemsDemo (4x), MenuItemsDemo (4x)                        |
| markdown/features.md               | 12           | SearchReplaceMenu (4x), MenuItemsDemo (8x)                        |
| editor/plain-text.md               | 11           | SearchReplaceMenu (4x), MenuItemsDemo (7x)                        |
| charts/introduction.md             | 9            | GraphWindow (4x), MenuItemsDemo (5x)                              |
| charts/mermaid.md                  | 11           | GraphWindow (5x), MenuItemsDemo (6x)                              |
| charts/echarts.md                  | 10           | GraphWindow (5x), MenuItemsDemo (5x)                              |
| charts/plantuml.md                 | 12           | GraphWindow (6x), MenuItemsDemo (6x)                              |
| statistics/llm.md                  | 10           | LlmStatisticsView (4x), MenuItemsDemo (6x)                        |
| statistics/proofread.md            | 8            | ProofreadView (3x), MenuItemsDemo (5x)                            |
| shortcuts/editor.md                | 13           | SearchReplaceMenu (5x), MenuItemsDemo (8x)                        |
| shortcuts/global.md                | 8            | MainTabs (2x), ViewMenuItemsDemo (2x), MenuItemsDemo (4x)         |
| user/feedback.md                   | 9            | UserFeedbackView (4x), MenuItemsDemo (5x)                         |
| views/types.md                     | 7            | ViewMenuItemsDemo (4x), MenuItemsDemo (3x)                        |
| workspace/management.md            | 12           | ViewMenuItemsDemo (6x), MenuItemsDemo (6x)                        |
| formats/supported.md               | 8            | MenuItemsDemo (8x)                                                |
| features/paragraph-optimization.md | 6            | SectionOptimizer (2x), ViewMenuItemsDemo (2x), MenuItemsDemo (2x) |
| development/debug.md               | 9            | SettingDebugSection (4x), MenuItemsDemo (5x)                      |

**Total P3: 18 documents, 163 demos using existing components**

---

## Batch B: Need New Components / Demo Support (6 docs)

These documents require components that either:

1. Don't exist yet
2. Exist but don't support `mode="demo"`

### Components Needing Demo Mode Support

| Component         | Location                                    | Used In                          | Priority |
| ----------------- | ------------------------------------------- | -------------------------------- | -------- |
| UserFeedbackView  | views/UserFeedbackView.vue                  | user/feedback.md                 | P3       |
| LlmStatisticsView | views/LlmStatisticsView.vue                 | statistics/llm.md                | P3       |
| WorkflowManager   | components/agent/manage/WorkflowManager.vue | agent/engine.md                  | P1       |
| ReferenceManager  | components/agent/ReferenceManager.vue       | agent/references.md              | P1       |
| LaTeXEditor       | views/LaTeXEditor.vue                       | latex/editor.md, latex/basics.md | P1       |
| OutlineAiToolbar  | components/outline/OutlineAiToolbar.vue     | outline/ai-features.md           | P1       |

### Components to Create

| Component       | Purpose           | Used In         | Priority |
| --------------- | ----------------- | --------------- | -------- |
| UserProfileView | User profile page | user/profile.md | P3       |

---

## Implementation Order

### Phase 1: Enable Demo Mode in Components (Day 1-2)

Add `mode="demo"` support to these components:

1. **UserFeedbackView** - Add demo mode
2. **LlmStatisticsView** - Add demo mode
3. **WorkflowManager** - Add demo mode
4. **ReferenceManager** - Add demo mode
5. **LaTeXEditor** - Add demo mode
6. **OutlineAiToolbar** - Add demo mode

### Phase 2: P0 Documents (Day 2-3)

Fix all P0 documents using existing components:

1. ai/chat.md
2. ai/assistants.md
3. settings/llm.md
4. settings/basic.md
5. settings/theme.md
6. core/editor-basics.md
7. core/multi-tab.md
8. home/features.md
9. markdown/basics.md

**Expected outcome**: 9 docs fixed, +78 demos

### Phase 3: P1 Documents (Day 3-5)

Fix P1 documents (20 docs, 201 demos):

- All agent/\* docs (except workflow)
- All latex/\* docs
- All outline/\* docs
- All knowledge-base/\* docs
- ai/completion.md, ai/proofread.md, ai/task-queue.md

### Phase 4: P2 Documents (Day 5-6)

Fix settings/_ and core/_ docs (15 docs, 136 demos)

### Phase 5: P3 Documents (Day 6-7)

Fix remaining docs (19 docs, 163 demos)

### Phase 6: Create Missing Component (Day 7)

Create UserProfileView component for user/profile.md

---

## Work Estimates

| Phase                 | Docs         | Demos   | Est. Hours | Subagents Needed |
| --------------------- | ------------ | ------- | ---------- | ---------------- |
| Phase 1 (Enable Demo) | 6 components | -       | 4-6        | 1-2              |
| Phase 2 (P0)          | 9            | 78      | 3-4        | 2-3              |
| Phase 3 (P1)          | 20           | 201     | 8-10       | 4-5              |
| Phase 4 (P2)          | 15           | 136     | 5-7        | 3-4              |
| Phase 5 (P3)          | 18           | 163     | 6-8        | 3-4              |
| Phase 6 (Create)      | 1            | 10      | 2-3        | 1                |
| **Total**             | **63**       | **588** | **28-38**  | **3-5 parallel** |

---

## Subagent Assignment Strategy

### Agent 1: Component Enabler

- Enable demo mode in 6 components
- Create UserProfileView

### Agent 2: P0 Fixer

- Fix all 9 P0 documents
- Verify with lint

### Agent 3: P1 Agent Docs

- Fix agent/\* documents (7 docs)
- Fix ai/\* documents (4 docs, excluding chat/assistants)

### Agent 4: P1 Editor Docs

- Fix latex/\* documents (5 docs)
- Fix outline/\* documents (2 docs)
- Fix knowledge-base/\* documents (2 docs)

### Agent 5: P2/P3 Settings & Others

- Fix settings/\* documents (15 docs)
- Fix core/\* documents (5 docs)
- Fix remaining P3 documents (18 docs)

---

## Verification Checklist

After each batch:

- [ ] Run `npm run lint:demos`
- [ ] Verify no new FAILs introduced
- [ ] Check demo components render correctly
- [ ] Verify no broken markdown syntax

---

## Notes

1. **MenuItemsDemo** and **ViewMenuItemsDemo** are the most versatile - use them liberally
2. **Existing demos should not be removed** - they count toward coverage
3. **Minimum 2 demos per document** even if formula suggests less
4. **Place demos strategically** - near the text that describes the feature
5. **Use real components** - no mock/stub components allowed
