# Documentation Demo Cleanup Plan

**Generated:** 2026-02-24  
**Scope:** 62 documentation files, 779 total demos  
**Goal:** Remove "linting hacks", fix mismatched demos, ensure relevance

---

## Executive Summary

This plan addresses critical issues found in the documentation demo system where many demos are "linting hacks" - added solely to pass coverage requirements but not actually related to document content. The cleanup will improve documentation quality and user experience.

### Critical Issues Identified

1. **statistics/llm.md** - 0/7 required demos (has ZERO demos, needs LlmStatisticsView)
2. **statistics/proofread.md** - 5/8 demos irrelevant (wrong components)
3. **shortcuts/global.md** - Shows tabs instead of shortcuts
4. **ai/completion.md** - 2 irrelevant AIChat demos (chat ≠ completion)
5. **ai/proofread.md** - 12 demos but 11 are repetitive ProofreadView

---

## Priority Classification

### 🔴 CRITICAL (Fix First) - 8 Files
Files with completely wrong or missing demos that mislead users.

| File | Current Demos | Problem | Action |
|------|--------------|---------|--------|
| statistics/llm.md | 0 | **ZERO demos** in LLM stats doc | Add 3 LlmStatisticsView |
| statistics/proofread.md | 8 | 5 demos are wrong component types | Remove 5, keep 3 ProofreadView |
| shortcuts/global.md | 1 | Shows MainTabs, not shortcuts | Replace with shortcut visualization |
| ai/completion.md | 11 | 2 AIChat demos irrelevant to completion | Remove AIChat, add AISuggestion/Ghost |
| shortcuts/editor.md | 14 | Excessive random demos at end | Remove 12 irrelevant demos |
| editor/plain-text.md | 12 | All demos are generic filler | Keep 3 relevant, remove 9 |
| core/editor-settings.md | 10 | Generic filler demos | Keep 3, remove 7 |
| core/editor-basics.md | 11 | Mixed relevant/irrelevant | Audit and remove 6 |

### 🟠 HIGH (Fix Second) - 15 Files
Files with excessive repetition or moderately wrong demos.

| File | Current | Issue | Action |
|------|---------|-------|--------|
| ai/proofread.md | 12 | 11 repetitive ProofreadView | Keep 3, remove 9 |
| ai/task-queue.md | 10 | All AIChat, not task queue | Replace with AITaskQueue |
| latex/pdf-preview.md | 13 | Excessive filler at end | Remove 9 generic demos |
| latex/editor.md | 14 | Too many generic demos | Remove 8, keep 6 specific |
| latex/console.md | 12 | Generic filler demos | Remove 8, keep 4 specific |
| latex/compilation.md | 13 | Generic filler demos | Remove 9, keep 4 specific |
| markdown/editor.md | 12 | Generic filler demos | Remove 8, keep 4 specific |
| markdown/features.md | 14 | Generic filler demos | Remove 10, keep 4 specific |
| outline/basics.md | 15 | Excessive variety | Remove 10, keep 5 relevant |
| outline/ai-features.md | 13 | Generic filler demos | Remove 9, keep 4 specific |
| knowledge-base/usage.md | 13 | Wrong component emphasis | Audit and restructure |
| knowledge-base/management.md | 9 | Wrong component emphasis | Audit and restructure |
| knowledge-base/config.md | 10 | Generic filler demos | Remove 7, keep 3 |
| workspace/management.md | 14 | Excessive ViewMenuItemsDemo | Remove 10, keep 4 |
| user/profile.md | 12 | Mixed relevant/irrelevant | Audit and remove 7 |

### 🟡 MEDIUM (Fix Third) - 20 Files
Files with some irrelevant demos but less critical.

| File | Current | Issue | Action |
|------|---------|-------|--------|
| settings/theme.md | 2 | Uses generic Demo wrapper | Convert to SettingThemeSection |
| settings/theme-custom.md | 8 | Mixed relevant/irrelevant | Remove 5, keep 3 |
| settings/llm.md | 7 | Excessive repetition | Remove 4, keep 3 |
| settings/llm-types.md | 13 | Generic filler demos | Remove 10, keep 3 |
| settings/llm-management.md | 9 | Generic filler demos | Remove 6, keep 3 |
| settings/language.md | 5 | Generic filler demos | Remove 3, keep 2 |
| settings/image.md | 7 | Mixed relevant/irrelevant | Remove 4, keep 3 |
| settings/image-upload.md | 8 | Generic filler demos | Remove 5, keep 3 |
| settings/basic.md | 7 | Excessive repetition | Remove 4, keep 3 |
| settings/about.md | 8 | Generic filler demos | Remove 5, keep 3 |
| settings/menu.md | 12 | Excessive MenuItemsDemo | Remove 8, keep 4 |
| settings/logging.md | 11 | Generic filler demos | Remove 8, keep 3 |
| agent/tools.md | 12 | Some demos don't match tools | Audit and remove 6 |
| agent/session.md | 20 | Excessive AgentView repetition | Remove 14, keep 6 |
| agent/config.md | 11 | Excessive AgentView repetition | Remove 7, keep 4 |
| agent/workflow.md | 5 | Excessive AgentView repetition | Remove 2, keep 3 |
| agent/engine.md | 10 | Mixed relevant/irrelevant | Remove 6, keep 4 |
| agent/introduction.md | 8 | Generic filler demos | Remove 5, keep 3 |
| features/paragraph-optimization.md | 9 | Generic filler demos | Remove 6, keep 3 |
| user/feedback.md | 11 | Generic filler demos | Remove 7, keep 4 |

### 🟢 LOW (Cleanup Last) - 19 Files
Files mostly correct, minor cleanup needed.

| File | Current | Issue | Action |
|------|---------|-------|--------|
| quick-start/guide.md | 5 | Well structured, minor audit | Verify all 5 are relevant |
| core/multi-tab.md | 13 | Generic filler at end | Remove 9, keep 4 |
| core/multi-window.md | 9 | Generic filler demos | Remove 5, keep 4 |
| core/export.md | 11 | Generic filler demos | Remove 7, keep 4 |
| core/document-metadata.md | 10 | Generic filler demos | Remove 7, keep 3 |
| markdown/basics.md | 6 | Menu demos repetitive | Remove 3, keep 3 |
| markdown/advanced.md | 5 | Well structured | Keep or remove 2 |
| latex/basics.md | 4 | Well structured | Keep all |
| charts/mermaid.md | 11 | Repetitive GraphWindow | Remove 7, keep 4 |
| charts/plantuml.md | 12 | Repetitive GraphWindow | Remove 8, keep 4 |
| charts/echarts.md | 10 | Repetitive DataAnalysisWindow | Remove 6, keep 4 |
| charts/introduction.md | 8 | Mixed components | Remove 4, keep 4 |
| ai/chat.md | 15 | Repetitive AIChat | Remove 9, keep 6 |
| ai/assistants.md | 12 | Mixed components | Remove 6, keep 6 |
| ai/llm-config.md | 4 | Well structured | Keep all |
| views/types.md | 7 | Well structured | Keep all |
| home/features.md | 9 | Well structured | Remove 3, keep 6 |
| formats/supported.md | 8 | Generic filler | Remove 6, keep 2 |
| development/debug.md | 9 | Repetitive debug components | Remove 5, keep 4 |

---

## Component Mapping Reference

### Document Topic → Appropriate Demo Components

| Document Topic | Primary Component | Secondary Components |
|---------------|-------------------|---------------------|
| **LLM Statistics** | LlmStatisticsView | SettingLlmSection |
| **Proofread Statistics** | ProofreadView | - |
| **AI Auto-Completion** | CompletionSettingsPanel | AISuggestion, AISuggestionGhost |
| **AI Proofreading** | ProofreadView | MenuItemsDemo (ai-assistant) |
| **AI Chat** | AIChat | - |
| **AI Task Queue** | AITaskQueue | - |
| **Shortcuts** | KeyboardShortcutDisplay* | - |
| **Settings - Basic** | SettingBasicSection | - |
| **Settings - LLM** | SettingLlmSection | LlmStatisticsView |
| **Settings - Theme** | SettingThemeSection | - |
| **Settings - Knowledge Base** | SettingKnowledgeBaseSection | KnowledgeBase |
| **Settings - Image** | SettingImageSection | - |
| **Settings - Debug** | SettingDebugSection | - |
| **Settings - Logger** | SettingLoggerSection | - |
| **Settings - About** | SettingAboutSection | - |
| **Knowledge Base** | KnowledgeBase | SettingKnowledgeBaseSection |
| **Outline** | Outline | OutlineAiToolbar |
| **Markdown Editor** | QuickStartMarkdown | SearchReplaceMenu |
| **LaTeX Editor** | QuickStartLatex | PdfPreviewPanel, LaTeXCompilerPanel, ConsoleTerminal |
| **Agent Framework** | AgentView | AgentSessionManager |
| **Agent Tools** | Tool-specific displays | AgentView |
| **Agent Workflow** | WorkflowManager | AgentView |
| **File Operations** | MainTabs, MenuItemsDemo (file) | - |
| **Charts - Mermaid** | GraphWindow (initialTool="mermaid") | - |
| **Charts - PlantUML** | GraphWindow (initialTool="plantuml") | - |
| **Charts - ECharts** | DataAnalysisWindow | - |
| **OCR** | OcrWindow | - |
| **Formula Recognition** | FormulaRecognition | - |
| **AIGC Detection** | AigcDetectionWindow | - |
| **Data Analysis** | DataAnalysisWindow | - |
| **Multi-tab Management** | MainTabs | - |
| **User Profile** | UserProfileView | - |
| **User Feedback** | UserFeedbackView | DialogDemo (feedback) |

*Component needs to be created - see Missing Components section

---

## Parallel Execution Groups

### Group A: Critical Fixes (Independent) - Wave 1
**Can be executed simultaneously:**

1. **statistics/llm.md** - Add LlmStatisticsView demos
2. **statistics/proofread.md** - Remove wrong demos, keep relevant
3. **shortcuts/global.md** - Replace with appropriate component
4. **ai/completion.md** - Remove AIChat, add completion-specific demos

**Estimated Time:** 2 hours  
**Dependencies:** None

### Group B: Editor Documents (Independent) - Wave 1

5. **editor/plain-text.md** - Remove generic fillers
6. **core/editor-settings.md** - Remove generic fillers
7. **core/editor-basics.md** - Audit and clean
8. **shortcuts/editor.md** - Remove end-of-file fillers

**Estimated Time:** 2.5 hours  
**Dependencies:** None

### Group C: AI Documents (Independent) - Wave 1

9. **ai/proofread.md** - Remove repetitive demos
10. **ai/task-queue.md** - Replace AIChat with AITaskQueue

**Estimated Time:** 1.5 hours  
**Dependencies:** None

### Group D: LaTeX Documents (Independent) - Wave 2

11. **latex/pdf-preview.md** - Remove generic fillers
12. **latex/editor.md** - Remove generic fillers
13. **latex/console.md** - Remove generic fillers
14. **latex/compilation.md** - Remove generic fillers

**Estimated Time:** 2 hours  
**Dependencies:** None (can run parallel to A, B, C)

### Group E: Markdown Documents (Independent) - Wave 2

15. **markdown/editor.md** - Remove generic fillers
16. **markdown/features.md** - Remove generic fillers
17. **markdown/basics.md** - Remove repetitive menu demos
18. **markdown/advanced.md** - Minor cleanup

**Estimated Time:** 1.5 hours  
**Dependencies:** None

### Group F: Outline Documents (Independent) - Wave 2

19. **outline/basics.md** - Remove excessive variety
20. **outline/ai-features.md** - Remove generic fillers

**Estimated Time:** 1 hour  
**Dependencies:** None

### Group G: Knowledge Base Documents (Independent) - Wave 2

21. **knowledge-base/usage.md** - Restructure demos
22. **knowledge-base/management.md** - Restructure demos
23. **knowledge-base/config.md** - Remove generic fillers

**Estimated Time:** 1.5 hours  
**Dependencies:** None

### Group H: Settings Documents (Related) - Wave 3
**Share common patterns, can be done sequentially or by one person:**

24. **settings/llm.md** - Reduce repetition
25. **settings/llm-types.md** - Remove fillers
26. **settings/llm-management.md** - Remove fillers
27. **settings/theme.md** - Convert Demo wrapper
28. **settings/theme-custom.md** - Remove fillers
29. **settings/basic.md** - Reduce repetition
30. **settings/language.md** - Remove fillers
31. **settings/image.md** - Audit and clean
32. **settings/image-upload.md** - Remove fillers
33. **settings/about.md** - Remove fillers
34. **settings/menu.md** - Reduce MenuItemsDemo
35. **settings/logging.md** - Remove fillers

**Estimated Time:** 4 hours  
**Dependencies:** None

### Group I: Agent Documents (Related) - Wave 3

36. **agent/session.md** - Reduce AgentView repetition
37. **agent/config.md** - Reduce AgentView repetition
38. **agent/workflow.md** - Reduce repetition
39. **agent/engine.md** - Audit and clean
40. **agent/tools.md** - Match demos to tool content
41. **agent/introduction.md** - Remove fillers

**Estimated Time:** 2.5 hours  
**Dependencies:** None

### Group J: Core Documents (Independent) - Wave 4

42. **core/multi-tab.md** - Remove generic fillers
43. **core/multi-window.md** - Remove generic fillers
44. **core/export.md** - Remove generic fillers
45. **core/document-metadata.md** - Remove generic fillers
46. **workspace/management.md** - Reduce ViewMenuItemsDemo

**Estimated Time:** 2 hours  
**Dependencies:** None

### Group K: Charts Documents (Related) - Wave 4

47. **charts/mermaid.md** - Reduce GraphWindow repetition
48. **charts/plantuml.md** - Reduce GraphWindow repetition
49. **charts/echarts.md** - Reduce DataAnalysisWindow repetition
50. **charts/introduction.md** - Audit and clean

**Estimated Time:** 1.5 hours  
**Dependencies:** None

### Group L: AI Documents 2 (Related) - Wave 4

51. **ai/chat.md** - Reduce AIChat repetition
52. **ai/assistants.md** - Audit and clean

**Estimated Time:** 1 hour  
**Dependencies:** None

### Group M: Remaining Documents (Independent) - Wave 5

53. **quick-start/guide.md** - Verify relevance
54. **views/types.md** - Verify relevance
55. **home/features.md** - Minor cleanup
56. **formats/supported.md** - Remove fillers
57. **development/debug.md** - Reduce repetition
58. **features/paragraph-optimization.md** - Remove fillers
59. **user/profile.md** - Audit and clean
60. **user/feedback.md** - Remove fillers

**Estimated Time:** 2 hours  
**Dependencies:** None

---

## File-by-File Cleanup Specifications

### CRITICAL FILES

#### 1. statistics/llm.md
**Status:** CRITICAL - Missing ALL demos  
**Required Demos:** 3 (based on headings)  
**Current:** 0  
**Action:** Add demos

```markdown
## Changes:
ADD (after "## 打开LLM统计"): <LlmStatisticsView mode="demo" />
ADD (after "## 统计信息"): <LlmStatisticsView mode="demo" />
ADD (after "## Token统计"): <LlmStatisticsView mode="demo" />
```

---

#### 2. statistics/proofread.md
**Status:** CRITICAL - 5/8 demos wrong  
**Required:** 3  
**Current:** 8  
**Action:** Remove 5, keep 3

```markdown
## Remove:
- Line 29: <LlmStatisticsView mode="demo" /> (WRONG - not LLM doc)
- Line 57: <DiffDisplay mode="demo" /> (NONEXISTENT component)
- Line 85: <OutlineTreeDisplay mode="demo" /> (NONEXISTENT component)
- Line 106: <ViewMenuItemsDemo mode="demo" :items='["settings"]' /> (IRRELEVANT)
- Line 118: <DataAnalysisDisplay mode="demo" /> (NONEXISTENT component)
- Line 138: <ChartGenerationDisplay mode="demo" /> (NONEXISTENT component)
- Line 161: <QuickStartPanel mode="demo" /> (IRRELEVANT)

## Keep:
- Line 7: <ProofreadView mode="demo" /> (CORRECT)
```

**Note:** After removal, document will have 1 demo but needs 3. Add 2 more ProofreadView at appropriate sections.

---

#### 3. shortcuts/global.md
**Status:** CRITICAL - Shows wrong content  
**Required:** 2  
**Current:** 1  
**Action:** Replace with shortcut-specific display

```markdown
## Current Problem:
- Line 69: <MainTabs mode="demo" /> shows tabs, NOT shortcuts

## Solution Options:
OPTION 1: Create new KeyboardShortcutDisplay component
OPTION 2: Use description tables only (text is actually clear)
OPTION 3: Add visual shortcut representation using existing components

## Recommended:
Replace <MainTabs mode="demo" /> with:
- A visual representation or remove entirely since tables are clear
- Or create KeyboardShortcutDisplay component
```

---

#### 4. ai/completion.md
**Status:** CRITICAL - Wrong component type  
**Required:** 4  
**Current:** 11  
**Action:** Remove AIChat, add completion-specific

```markdown
## Remove:
- Line 136: <AIChat mode="demo" /> (IRRELEVANT to completion)
- Line 215: <KnowledgeBase mode="demo" /> (IRRELEVANT context)
- Line 233: <KnowledgeBase mode="demo" /> (IRRELEVANT context)

## Keep:
- All <CompletionSettingsPanel mode="demo" /> (CORRECT)
- Line 21: <MenuItemsDemo mode="demo" :items='[{"id": "settings"}]' /> (OK)

## Add (if AISuggestion components exist):
- <AISuggestion mode="demo" /> after "## 补全内容" section
```

---

#### 5. shortcuts/editor.md
**Status:** HIGH - Excessive irrelevant demos  
**Required:** 3  
**Current:** 14  
**Action:** Remove 12 generic fillers at end

```markdown
## Remove (end-of-file filler block starting around line 272):
- <MenuItemsDemo mode="demo" :items='[{"id": "file"}]' />
- <ViewMenuItemsDemo mode="demo" :items='["editor"]' />
- <AIChat mode="demo" />
- <CompletionSettingsPanel mode="demo" />
- <SettingLlmSection mode="demo" />
- <MainTabs mode="demo" />
- <QuickStartPanel mode="demo" />
- <Outline mode="demo" />
- <AgentView mode="demo" />
- <LaTeXEditorDemo mode="demo" />
- <SettingBasicSection mode="demo" />
- <SettingThemeSection mode="demo" />
- <KnowledgeBase mode="demo" />

## Keep:
- Line 54: <SearchReplaceMenu mode="demo" ... /> (RELEVANT to shortcuts)
```

---

#### 6. editor/plain-text.md
**Status:** HIGH - Generic filler demos  
**Required:** 3  
**Current:** 12  
**Action:** Remove 9 generic fillers

```markdown
## Remove (all are generic fillers):
- <AIChat mode="demo" />
- <KnowledgeBase mode="demo" />
- <ProofreadView mode="demo" />
- <QuickStartPanel mode="demo" />
- <GraphWindow mode="demo" />
- <OcrWindow mode="demo" />
- <DataAnalysisWindow mode="demo" />
- <AgentView mode="demo" />
- <ResizableDivider mode="demo" />

## Keep:
- <MainTabs mode="demo" /> (tabs relevant to editing)
- <MenuItemsDemo mode="demo" :items='[{"id": "file"}]' /> (file operations)
- <ViewMenuItemsDemo mode="demo" :items='["editor", "outline"]' /> (views)
```

---

#### 7. core/editor-settings.md
**Status:** HIGH - Generic filler demos  
**Required:** 3  
**Current:** 10  
**Action:** Remove 7 generic fillers

```markdown
## Remove:
- <AIChat mode="demo" />
- <KnowledgeBase mode="demo" />
- <ProofreadView mode="demo" />
- <QuickStartPanel mode="demo" />
- <AgentView mode="demo" />
- <Outline mode="demo" />
- <ResizableDivider mode="demo" />

## Keep:
- Line 9: <MenuItemsDemo mode="demo" :items='[{"id": "settings"}]' />
- Line 11: <MainTabs mode="demo" />
- Line 23: <ViewMenuItemsDemo mode="demo" :items='["editor", "outline"]' />
```

---

#### 8. core/editor-basics.md
**Status:** HIGH - Mixed relevant/irrelevant  
**Required:** 3  
**Current:** 11  
**Action:** Remove 8 generic fillers

```markdown
## Remove:
- <AIChat mode="demo" /> (x1)
- <KnowledgeBase mode="demo" /> (x1)
- <ProofreadView mode="demo" /> (x1)
- <QuickStartPanel mode="demo" /> (x1)
- <AgentView mode="demo" /> (x1)
- <ResizableDivider mode="demo" /> (x1)
- <MenuItemsDemo mode="demo" :items='[{"id": "file"}]' /> (keep only 1)

## Keep:
- Line 9: <SearchReplaceMenu mode="demo" ... /> (RELEVANT)
- Line 11: <MainTabs mode="demo" /> (RELEVANT)
- Line 25: <ViewMenuItemsDemo mode="demo" :items='["editor", "outline"]' /> (RELEVANT)
- Line 27: <Outline mode="demo" /> (RELEVANT)
- Line 142: <SearchReplaceMenu mode="demo" ... /> (RELEVANT)
```

---

## Missing Components to Create

### 1. KeyboardShortcutDisplay
**Purpose:** Display keyboard shortcuts visually for shortcuts/ documents
**Props:**
- `shortcuts: Array<{key: string, description: string}>`
- `platform: 'windows' | 'mac' | 'both'`
- `mode: 'normal' | 'demo'`

**Usage:**
```markdown
<KeyboardShortcutDisplay mode="demo" :shortcuts='[
  {key: "Ctrl+N", description: "新建文档"},
  {key: "Ctrl+O", description: "打开文档"}
]' platform="both" />
```

### 2. AITaskQueue (if not exists)
**Purpose:** Display AI task queue for ai/task-queue.md
**Props:**
- `tasks: Array<AITask>`
- `mode: 'normal' | 'demo'`

### 3. AISuggestion / AISuggestionGhost (if not exists)
**Purpose:** Display AI completion suggestions for ai/completion.md
**Props:**
- `suggestion: string`
- `position: {top: number, left: number}`
- `mode: 'normal' | 'demo'`

---

## Verification Checklist

After cleanup, each file must:

- [ ] Pass `npm run lint:demos` check
- [ ] Have demos that actually relate to document content
- [ ] Not use non-existent components
- [ ] Not have excessive repetition (>3 same component unless justified)
- [ ] Follow component selection guidelines from WRITING_GUIDE.md

---

## Summary Statistics

### Before Cleanup
- **Total Files:** 62
- **Total Demos:** 779
- **Problematic Demos:** ~450 (58%)
- **Missing Demos:** 3 files

### After Cleanup (Projected)
- **Total Files:** 62
- **Total Demos:** ~329 (58% reduction)
- **Problematic Demos:** 0
- **All Files:** Pass linting with relevant demos

### Time Estimate
- **Total Effort:** ~25-30 hours
- **Parallel Execution:** 4-5 waves
- **Personnel:** 1-2 developers
- **Duration:** 3-4 days with parallel execution

---

## Next Steps

1. **Review and approve this plan**
2. **Create missing components** (KeyboardShortcutDisplay, etc.)
3. **Execute Wave 1** (Critical + Editor groups)
4. **Execute Wave 2** (LaTeX + Markdown + Outline + KB groups)
5. **Execute Wave 3** (Settings + Agent groups)
6. **Execute Wave 4** (Core + Charts + AI 2 groups)
7. **Execute Wave 5** (Remaining documents)
8. **Final verification** with `npm run lint:demos`
9. **Commit with message:** `docs: cleanup irrelevant demos across 62 files`
