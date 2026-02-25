# Documentation Demo Standards

> **Purpose**: Prevent "linting hacks" and ensure demos actually illustrate document content  
> **Case Study**: 58-demo cleanup (62 files, 779→329 demos, 58% reduction)  
> **Related**: [TOPIC_COMPONENT_MAPPING.md](./TOPIC_COMPONENT_MAPPING.md), [DEMO_COVERAGE_POLICY.md](./DEMO_COVERAGE_POLICY.md)

---

## 1. Demo Relevance Principle

### The Golden Rule

**Every demo MUST directly illustrate document content.**

| ✅ GOOD | ❌ BAD |
|--------|--------|
| `<LlmStatisticsView mode="demo" />` in LLM statistics doc | `<SettingLlmSection mode="demo" />` in statistics doc (shows config, not stats) |
| `<ProofreadView mode="demo" />` in AI proofreading doc | `<AIChat mode="demo" />` in auto-completion doc (chat ≠ completion) |
| `<MainTabs mode="demo" />` in multi-tab management doc | `<AIChat mode="demo" />` at end of shortcuts doc (irrelevant filler) |

### The Teaching Test

Ask yourself: *"Does this demo teach the user something about the feature being documented?"*

- **YES** → Keep it
- **NO / Maybe** → Remove it
- "It's just to pass linting" → **Definitely remove it**

### Document-Demo Alignment

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

## 2. Universal Demo Cluster Anti-Pattern

### The Pattern

The following component cluster is a **red flag** for lazy demo addition:

```markdown
<AIChat mode="demo" />
<KnowledgeBase mode="demo" />
<ProofreadView mode="demo" />
<QuickStartPanel mode="demo" />
<AgentView mode="demo" />
```

### Why It's Wrong

1. **Copy-paste without thought** — Same components appearing in unrelated documents
2. **Generic fillers** — Added solely to hit coverage numbers
3. **Zero educational value** — User learns nothing about the actual document topic
4. **Visual noise** — Clutters the document with irrelevant UI

### How to Identify It

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

## 3. Demo Selection Guidelines by Topic

### Statistics Documents

**Use**: `*StatisticsView` components

| Document | Correct Component | Wrong Component |
|----------|------------------|-----------------|
| `statistics/llm.md` | `LlmStatisticsView` | `SettingLlmSection` ❌ |
| `statistics/proofread.md` | `ProofreadView` (stats mode) | `OutlineTreeDisplay` ❌ |

**Principle**: Show data visualization, not configuration panels.

### Settings Documents

**Use**: `Setting*Section` components

| Document | Component |
|----------|-----------|
| `settings/theme.md` | `SettingThemeSection` |
| `settings/llm.md` | `SettingLlmSection` |
| `settings/basic.md` | `SettingBasicSection` |
| `settings/about.md` | `SettingAboutSection` |

**Principle**: Show the settings panel being documented.

### AI Documents

**Match AI feature to correct component:**

| Feature | Correct Component | Common Mistake |
|---------|------------------|----------------|
| AI Chat | `AIChat` | Using in completion docs ❌ |
| AI Proofreading | `ProofreadView` | Over-use (11 instances in one doc) ❌ |
| Auto-Completion | `CompletionSettingsPanel` | Using `AIChat` ❌ |
| Task Queue | `AITaskQueue` | Using `AIChat` ❌ |

### Shortcuts Documents

**Use**: Keyboard visualizations or minimal UI

| Document | Appropriate |
|----------|-------------|
| `shortcuts/global.md` | `MenuItemsDemo`, `MainTabs`, or keyboard tables |
| `shortcuts/editor.md` | `SearchReplaceMenu`, keyboard tables |

**Principle**: Show how to trigger actions, not the actions themselves.

### Core Features

**Match feature to relevant view:**

| Feature | Component |
|---------|-----------|
| Multi-tab | `MainTabs` |
| File operations | `MenuItemsDemo` (file menu) |
| Editor basics | `LaTeXEditor`, `MarkdownEditor` |
| Document metadata | `MetaInfoPanel` |

---

## 4. Repetition Limits

### The Rule

**Maximum 3-4 instances of the same component per file.**

### Strategic Placement

Place demos at key narrative points:

```markdown
# Document Title
<intro demo>              ← After introduction

## First Major Section
<feature demo>            ← Illustrating key feature

## Second Major Section

### Subsection A
<another demo>            ← Supporting specific point

## Summary
<concluding demo>         ← Wrapping up
```

### Anti-Pattern: Repetition Abuse

❌ **BAD**: 11 `ProofreadView` demos in `ai/proofread.md`
- 9 removed, 3 kept (intro, feature detail, summary)

❌ **BAD**: 20 `AgentView` demos in `agent/session.md`
- 14 removed, 6 kept at key workflow points

✅ **GOOD**: `quick-start/guide.md` with 5 well-placed demos
- Each serves a distinct educational purpose

---

## 5. Component-Topic Mapping

### Reference: TOPIC_COMPONENT_MAPPING.md

Always consult the mapping guide at `manuals/TOPIC_COMPONENT_MAPPING.md` for authoritative component selection.

### Common Mismatches to Avoid

| Mismatch | Problem | Correct |
|----------|---------|---------|
| `statistics/llm.md` → `SettingLlmSection` | Shows config, not stats | `LlmStatisticsView` |
| `ai/chat.md` → `SettingLlmSection` | Shows config, not chat | `AIChat` |
| `ai/completion.md` → `AIChat` | Chat ≠ completion | `CompletionSettingsPanel` |
| `settings/theme.md` → `MainTabs` | Tabs ≠ theme settings | `SettingThemeSection` |
| `shortcuts/global.md` → `AIChat` | Irrelevant to shortcuts | `MenuItemsDemo` or keyboard tables |

### When No Suitable Demo Exists

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

## 6. Linting Hack Detection

### Signs of Lazy Demo Addition

| Sign | Detection Method |
|------|-----------------|
| **End-of-file clustering** | Demos appear in last 20% of document |
| **Generic component sequences** | Same unrelated components across files |
| **Topic mismatch** | AI components in shortcuts docs |
| **Excessive repetition** | >4 same components in one file |
| **Non-existent components** | Components not in registry |
| **Configuration vs display confusion** | `Setting*` in statistics docs |

### Review Checklist

When reviewing demos, ask:

- [ ] Does this demo directly illustrate the current section's content?
- [ ] Would a user learn something about the feature from this demo?
- [ ] Is the component type appropriate for this document topic?
- [ ] Is this demo strategically placed (not just padding)?
- [ ] Have I checked TOPIC_COMPONENT_MAPPING.md for guidance?
- [ ] Is the component registered in `demo-registry-components.ts`?

### Decision Tree: New Demo vs Existing

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

## Case Study: The 58-Demo Cleanup

### The Problem

- **62 files** with documentation
- **779 total demos** (average: 12.5 per file)
- **~450 problematic demos** (58%)
- **Critical issues**: Wrong components, excessive repetition, generic fillers

### Key Findings

| File | Before | Problem | After |
|------|--------|---------|-------|
| `statistics/llm.md` | 0 demos | Missing all demos | 3 `LlmStatisticsView` |
| `ai/proofread.md` | 12 demos | 11 repetitive `ProofreadView` | 3 targeted demos |
| `agent/session.md` | 20 demos | Excessive `AgentView` repetition | 6 workflow demos |
| `shortcuts/editor.md` | 14 demos | 12 generic end-of-file fillers | 2 relevant demos |

### The Cleanup Impact

- **Before**: 779 demos, 58% problematic
- **After**: ~329 demos, 0% problematic
- **Result**: Better docs, faster builds, happier users

### Lessons Learned

1. **Coverage ≠ Quality** — Hitting the number doesn't help if demos are irrelevant
2. **Repetition hurts** — 11 of the same component teaches nothing new
3. **Context matters** — The same component means different things in different docs
4. **Strategic placement > padding** — Fewer, well-placed demos beat many random ones

---

## Quick Reference

### Good vs Bad Examples

```markdown
<!-- ✅ GOOD: Statistics doc shows statistics -->
## LLM Statistics

View your LLM usage statistics below:

<LlmStatisticsView mode="demo" />

<!-- ❌ BAD: Statistics doc shows settings -->
## LLM Statistics

<SettingLlmSection mode="demo" />  <!-- WRONG: This is config, not stats! -->
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

| Shortcut | Action |
|----------|--------|
| Ctrl+N | New document |
| Ctrl+O | Open document |

<MenuItemsDemo mode="demo" :items='[{"id": "file"}]' />

<!-- ❌ BAD: Shortcuts doc shows unrelated features -->
## Global Shortcuts

<AIChat mode="demo" />  <!-- WRONG: Nothing to do with shortcuts! -->
<KnowledgeBase mode="demo" />  <!-- WRONG: Irrelevant! -->
```

### Remember

1. **Teach, don't fill** — Every demo should educate
2. **Match the topic** — Right component for the right doc
3. **Place strategically** — Intro, key sections, summary
4. **Limit repetition** — Max 3-4 of same component
5. **Check the mapping** — When in doubt, consult TOPIC_COMPONENT_MAPPING.md
