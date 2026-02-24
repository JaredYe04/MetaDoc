# UI Migration Roadmap: Element Plus → shadcn-vue

## Executive Summary

This roadmap provides a strategic blueprint for consolidating the hybrid UI state (Element Plus + shadcn-vue) into a unified shadcn-vue implementation. The migration follows a phased approach prioritizing high-impact, low-effort components first, while maintaining backward compatibility throughout.

**Current State:**
- 56 files using Element Plus components
- 100+ shadcn-vue components available in `components/ui/`
- Recent notification system migration completed (35+ files migrated from ElMessage/ElNotification)
- Hybrid state in Main.vue using Element Plus layout components

**Target State:**
- Single shadcn-vue UI library
- Consistent theming via Tailwind CSS + CSS variables
- Reduced bundle size (~30% estimated savings)
- Simplified maintenance and onboarding

---

## 1. Current State Catalog

### 1.1 Element Plus Component Inventory

| Component | Files Using | Total Instances | Migration Priority |
|-----------|-------------|-----------------|-------------------|
| **ElMessage** | 35+ files | 200+ calls | ⚠️ PARTIALLY MIGRATED |
| **ElMessageBox** | 36 files | 80+ calls | 🔴 HIGH |
| **ElLoading** | 6 files | 15+ calls | 🔴 HIGH |
| **ElIcon** | 8 files | 50+ instances | 🟡 MEDIUM |
| **ElScrollbar** | 8 files | 25+ instances | 🟡 MEDIUM |
| **ElContainer** | 1 file (Main.vue) | 10 instances | 🟡 MEDIUM |
| **ElButton** | 3 files | 20+ instances | 🟡 MEDIUM |
| **ElTooltip** | 3 files | 15+ instances | 🟡 MEDIUM |
| **ElPopover** | 1 file | 5 instances | 🟢 LOW |
| **ElInput** | 1 file | 3 instances | 🟢 LOW |
| **ElInputNumber** | 1 file | 2 instances | 🟢 LOW |
| **ElSwitch** | 1 file | 2 instances | 🟢 LOW |

### 1.2 Files by Category

#### Views (High-Impact - 18 files)
```
views/Main.vue                    - Layout components (ElContainer/Aside/Main/Footer)
views/Outline.vue                 - ElMessageBox
views/MarkdownEditor.vue          - ElMessageBox
views/LaTeXEditor.vue             - ElButton, ElLoading, ElScrollbar
views/PlainTextEditor.vue         - ElButton, ElScrollbar, ElLoading
views/AIChat.vue                  - ElLoading
views/AgentView.vue               - ElMessageBox, ElLoading
views/KnowledgeBase.vue           - ElMessageBox, ElIcon
views/AigcDetectionWindow.vue     - ElMessageBox
views/OcrWindow.vue               - ElMessageBox, ElScrollbar
views/DataAnalysisWindow.vue      - ElMessageBox
views/Visualize.vue               - ElMessageBox
views/AttachmentWindow.vue        - ElMessageBox
views/setting/*.vue               - 6 files with ElMessageBox
```

#### Components (Medium-Impact - 25 files)
```
components/agent/ReferenceManager.vue      - ElMessage, ElMessageBox (heavy usage)
components/agent/manage/*.vue              - 5 manager files with heavy ElMessage usage
components/MessageBubble.vue               - ElMessage, ElMessageBox
components/GraphMessageBubble.vue          - ElMessage, ElMessageBox
components/MetaInfoPanel.vue               - ElMessage, ElMessageBox
components/WorkspaceExplorer.vue           - ElMessageBox
components/LeftMenu.vue                    - ElMessage, ElMessageBox
components/LlmStatisticsContent.vue        - ElMessage, ElMessageBox
components/workspace/WorkspaceTabs.vue     - ElMessageBox
components/outline/DetailedOutlineNode.vue - ElIcon
components/home/QuickStart*.vue            - 2 files with ElMessage
components/manual/*.vue                    - 3 files with ElMessageBox
components/base/AutoResizeTextarea.vue     - ElButton, ElIcon
components/base/ResizableContainer.vue     - ElIcon
components/VoiceInput.vue                  - ElIcon
components/MicrophoneTest.vue              - ElIcon
components/WorkspaceTreeNode.vue           - ElIcon
components/common/SessionList.vue          - ElMessageBox
components/ExportOptionsDialog.vue         - ElInput, ElInputNumber, ElSwitch
```

#### Agent Tools (Low-Impact - 15+ files)
```
utils/agent-tools/components/*.vue - 15+ files with ElMessage, ElIcon
```

### 1.3 shadcn-vue Component Inventory

**Available shadcn-vue Components (100 files):**

| Category | Components | Migration Target |
|----------|-----------|------------------|
| **Form** | Input, Select, Button, Switch, RadioGroup, Slider, Label, Form | ✅ READY |
| **Overlay** | Dialog, Popover, Tooltip, DropdownMenu | ✅ READY |
| **Layout** | Card, ScrollArea, Collapsible | ✅ READY |
| **Feedback** | LoadingOverlay, Badge | ✅ READY |
| **Navigation** | Breadcrumb | ✅ READY |
| **Custom** | ColorPicker, FontSelect, Autocomplete, DatePicker | ✅ READY |

**Missing shadcn-vue Equivalents:**
- ❌ Message/Toast system (custom implementation using Sonner - COMPLETED)
- ⚠️ Loading service (ElLoading.service) - needs custom composable
- ⚠️ Layout system (ElContainer/Aside/Main/Footer) - needs custom layout components

---

## 2. Migration Priority Matrix

### 2.1 Effort vs Impact Analysis

```
                    HIGH IMPACT
                         │
    ┌────────────────────┼────────────────────┐
    │                    │                    │
    │  Phase 1:          │  Phase 2:          │
    │  Message/Dialog    │  Layout/Icons      │
    │  System            │  System            │
    │                    │                    │
    │  • ElMessageBox    │  • ElContainer     │
    │  • ElLoading       │  • ElIcon          │
    │                    │  • ElScrollbar     │
    │  Effort: Medium    │  Effort: High      │
    │  Files: 36         │  Files: 20         │
    │                    │                    │
LOW ├────────────────────┼────────────────────┤ HIGH
EFFORT│                    │                    │ EFFORT
    │  Phase 4:          │  Phase 3:          │
    │  Polish            │  Remaining         │
    │  (Optional)        │  Components        │
    │                    │                    │
    │  • ElInput         │  • ElButton        │
    │  • ElSwitch        │  • ElTooltip       │
    │  • ElPopover       │  • ElPopover       │
    │                    │                    │
    │  Effort: Low       │  Effort: Medium    │
    │  Files: 3          │  Files: 5          │
    │                    │                    │
    └────────────────────┼────────────────────┘
                         │
                    LOW IMPACT
```

### 2.2 Priority Tiers

| Priority | Components | Rationale |
|----------|-----------|-----------|
| **P0 - Critical** | ElMessageBox, ElLoading | Block user workflows, needed for confirmations and async operations |
| **P1 - High** | ElContainer, ElIcon, ElScrollbar | Core UI infrastructure, affects visual consistency |
| **P2 - Medium** | ElButton, ElTooltip, ElPopover | Common interactions, medium usage |
| **P3 - Low** | ElInput, ElSwitch, ElInputNumber | Isolated usage, low impact |

---

## 3. Phased Migration Waves

### Phase 1: Critical Feedback System (Week 1-2)
**Goal:** Replace all modal dialogs and loading states

**Components to Migrate:**
- ElMessageBox → shadcn-vue Dialog + custom composable
- ElLoading → shadcn-vue LoadingOverlay + custom service

**Files to Update:** 36 files

**Key Tasks:**
1. Create `useDialog()` composable for modal dialogs
2. Create `useLoading()` composable for loading states
3. Replace ElMessageBox.confirm → Dialog
4. Replace ElMessageBox.prompt → Dialog with form
5. Replace ElLoading.service → LoadingOverlay

**Files (Priority Order):**
1. `views/Main.vue` - Core app dialogs
2. `views/setting/SettingDebugSection.vue` - Heavy usage (8 dialogs)
3. `views/setting/SettingLlmSection.vue` - Heavy usage (5 dialogs)
4. `components/agent/ReferenceManager.vue` - Heavy usage (3 dialogs)
5. `views/AgentView.vue` - User-facing dialogs
6. `components/LlmStatisticsContent.vue` - Multiple dialogs
7. All remaining 30 files

**Acceptance Criteria:**
- [ ] All ElMessageBox imports removed
- [ ] All ElLoading imports removed
- [ ] Dialog behavior preserved (confirm, cancel, prompts)
- [ ] Visual regression testing passes
- [ ] No console errors

---

### Phase 2: Layout & Visual Infrastructure (Week 3-4)
**Goal:** Replace layout components and icons

**Components to Migrate:**
- ElContainer/Aside/Main/Footer/Header → Custom layout components
- ElIcon → Lucide icons (already partially done)
- ElScrollbar → shadcn-vue ScrollArea

**Files to Update:** 20 files

**Key Tasks:**
1. Create custom layout components (AppLayout, AppSidebar, AppMain, etc.)
2. Audit and replace remaining ElIcon usage with Lucide icons
3. Replace ElScrollbar with ScrollArea
4. Update Main.vue layout structure

**Files (Priority Order):**
1. `views/Main.vue` - Core layout (ElContainer system)
2. `views/KnowledgeBase.vue` - ElIcon, ElScrollbar
3. `views/OcrWindow.vue` - ElScrollbar
4. `views/LaTeXEditor.vue` - ElScrollbar
5. `views/PlainTextEditor.vue` - ElScrollbar
6. `components/outline/DetailedOutlineNode.vue` - ElIcon
7. `components/base/*.vue` - ElIcon
8. `components/manual/ManualContent.vue` - ElScrollbar type dependency

**Acceptance Criteria:**
- [ ] Main.vue layout migrated without visual regression
- [ ] All ElScrollbar replaced with ScrollArea
- [ ] All ElIcon replaced with Lucide icons
- [ ] No layout shifts or broken responsive behavior
- [ ] CSS custom properties working correctly

---

### Phase 3: Interactive Components (Week 5)
**Goal:** Replace remaining interactive components

**Components to Migrate:**
- ElButton → shadcn-vue Button
- ElTooltip → shadcn-vue Tooltip
- ElPopover → shadcn-vue Popover
- ElInput → shadcn-vue Input
- ElSwitch → shadcn-vue Switch

**Files to Update:** 5 files

**Key Tasks:**
1. Replace button components
2. Replace tooltip/popover triggers
3. Replace form inputs in ExportOptionsDialog

**Files:**
1. `components/base/AutoResizeTextarea.vue` - ElButton, ElPopover
2. `components/outline/OutlineNodeActionButton.vue` - ElTooltip, ElButton
3. `components/outline/OutlineAiToolbar.vue` - ElButton, ElTooltip
4. `components/ExportOptionsDialog.vue` - ElInput, ElInputNumber, ElSwitch

**Acceptance Criteria:**
- [ ] All buttons use shadcn-vue Button
- [ ] All tooltips use shadcn-vue Tooltip
- [ ] Form inputs match existing behavior

---

### Phase 4: Cleanup & Optimization (Week 6)
**Goal:** Final cleanup and optimization

**Tasks:**
1. Remove Element Plus global import from `main.js`
2. Audit bundle size reduction
3. Update documentation
4. Remove Element Plus CSS imports
5. Clean up unused imports and dependencies

**Files:**
1. `main.js` - Remove ElementPlus plugin registration
2. `package.json` - Remove element-plus dependency (optional, can keep for icon fonts)

**Acceptance Criteria:**
- [ ] No Element Plus imports in renderer code
- [ ] Bundle size reduced by ~20-30%
- [ ] All tests passing
- [ ] No visual regressions

---

## 4. Dependency Analysis

### 4.1 High-Impact Components (Migrate First)

These components are reused extensively and have cascading effects:

**ElMessageBox (36 files)**
- **Coupling:** Business logic coupled with UI confirmations
- **Risk:** Breaking changes in user confirmation flows
- **Strategy:** Create thin wrapper that matches ElMessageBox API initially

**ElLoading (6 files)**
- **Coupling:** Async operation feedback
- **Risk:** Users lose loading state visibility
- **Strategy:** Create useLoading() composable with identical API

**ElContainer (Main.vue)**
- **Coupling:** Root app layout
- **Risk:** Entire app layout could break
- **Strategy:** Incremental migration - replace one container at a time

### 4.2 Leaf Components (Low Risk)

These have isolated usage and low coupling:

- ElInput/ElSwitch/ElInputNumber (ExportOptionsDialog.vue only)
- ElPopover (AutoResizeTextarea.vue only)

### 4.3 Coupling Points Map

```
ElMessageBox
├── views/setting/*.vue (6 files) - Setting confirmations
├── views/*Window.vue (5 files) - Tool confirmations
├── components/agent/manage/*.vue (5 files) - CRUD confirmations
└── components/MessageBubble.vue - Export confirmation

ElLoading
├── views/LaTeXEditor.vue - PDF compilation loading
├── views/PlainTextEditor.vue - File loading
├── views/AIChat.vue - AI response loading
├── views/AgentView.vue - Agent execution loading
└── components/ReferenceManager.vue - Reference parsing

ElIcon
├── views/KnowledgeBase.vue - Status icons
├── components/outline/*.vue - Outline action icons
├── components/base/*.vue - UI icons
└── agent-tools/components/*.vue - Tool result icons
```

---

## 5. Risk Assessment & Mitigation

### 5.1 Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Broken user flows** | Medium | High | Comprehensive manual testing of all dialog paths |
| **Visual regression** | High | Medium | Pixel-perfect component matching, visual diff testing |
| **Async state bugs** | Medium | High | Thorough testing of loading states, error boundaries |
| **Icon mismatches** | High | Low | Audit all icons, create mapping document |
| **Bundle size increase** | Low | Medium | Tree-shaking verification, lazy loading |
| **Accessibility loss** | Medium | High | A11y audit, keyboard navigation testing |
| **i18n issues** | Low | Medium | Verify all translated strings work in new components |
| **Performance degradation** | Low | High | Performance testing on low-end devices |

### 5.2 Mitigation Strategies

**1. Comprehensive Testing Strategy**
- Unit tests for each new composable
- Integration tests for dialog flows
- Visual regression tests with Playwright
- Manual QA checklist for each phase

**2. Incremental Rollout**
- Feature flags for gradual rollout
- Deploy Phase 1 to beta users first
- Monitor error rates and user feedback
- Rollback plan ready

**3. API Compatibility Layer**
```typescript
// Create compatibility wrappers during migration
export function useMessageBox() {
  // Drop-in replacement for ElMessageBox
  return {
    confirm: (message, title, options) => {
      // Use shadcn-vue Dialog internally
      return dialog.open({ message, title, ...options })
    },
    prompt: (message, title, options) => {
      return dialog.open({ message, title, input: true, ...options })
    }
  }
}
```

**4. Visual Parity Checklist**
- [ ] Dialog sizes match (width/height)
- [ ] Button styles match (colors, padding, borders)
- [ ] Animation timing matches (fade in/out, slide)
- [ ] Z-index layering correct (modals above content)
- [ ] Responsive behavior preserved

**5. Documentation Updates**
- Update AGENTS.md with new UI patterns
- Migration guide for future developers
- Component usage examples
- Troubleshooting guide

---

## 6. Success Metrics

### Phase 1 Success Criteria
- [ ] Zero ElMessageBox imports remaining
- [ ] Zero ElLoading imports remaining
- [ ] All modal dialogs functional
- [ ] No console errors
- [ ] Visual regression test pass rate > 95%

### Phase 2 Success Criteria
- [ ] Main.vue using pure shadcn-vue layout
- [ ] All icons migrated to Lucide
- [ ] All scrollbars using ScrollArea
- [ ] No layout shifts on resize
- [ ] Performance: First Contentful Paint < 100ms delta

### Phase 3 Success Criteria
- [ ] All interactive components migrated
- [ ] Form validation working
- [ ] Keyboard navigation preserved
- [ ] Accessibility audit pass

### Phase 4 Success Criteria
- [ ] Element Plus removed from dependencies
- [ ] Bundle size reduced by 20-30%
- [ ] Lighthouse score maintained or improved
- [ ] Zero Element Plus CSS loaded
- [ ] All tests passing

### Overall Success Metrics
| Metric | Baseline | Target |
|--------|----------|--------|
| Bundle size | ~X MB | -20-30% |
| Element Plus imports | 56 files | 0 files |
| UI consistency score | 70% | 95% |
| Visual regression issues | N/A | < 5 |
| User-reported UI bugs | Y/week | < Y/2 week |

---

## 7. Implementation Checklist

### Pre-Migration Setup
- [ ] Create feature branch: `feature/ui-migration-shadcn`
- [ ] Set up visual regression testing (Playwright)
- [ ] Document current UI patterns in AGENTS.md
- [ ] Create component migration tracking spreadsheet
- [ ] Set up error monitoring for migration phases

### Phase 1 Execution
- [ ] Create `composables/useDialog.ts`
- [ ] Create `composables/useLoading.ts`
- [ ] Migrate Main.vue dialogs
- [ ] Migrate SettingDebugSection.vue dialogs
- [ ] Migrate SettingLlmSection.vue dialogs
- [ ] Migrate ReferenceManager.vue dialogs
- [ ] Batch migrate remaining 30 files
- [ ] Visual regression testing
- [ ] Manual QA pass
- [ ] Merge Phase 1

### Phase 2 Execution
- [ ] Create `components/layout/AppLayout.vue`
- [ ] Create `components/layout/AppSidebar.vue`
- [ ] Migrate Main.vue layout
- [ ] Migrate icon usage (8 files)
- [ ] Migrate scrollbar usage (8 files)
- [ ] Visual regression testing
- [ ] Manual QA pass
- [ ] Merge Phase 2

### Phase 3 Execution
- [ ] Migrate button components
- [ ] Migrate tooltip components
- [ ] Migrate form inputs
- [ ] Visual regression testing
- [ ] Manual QA pass
- [ ] Merge Phase 3

### Phase 4 Execution
- [ ] Remove Element Plus from main.js
- [ ] Remove Element Plus CSS imports
- [ ] Bundle size audit
- [ ] Final visual regression testing
- [ ] Documentation update
- [ ] Merge Phase 4

---

## 8. Resource Requirements

### Time Estimates
| Phase | Duration | Developer Effort |
|-------|----------|-----------------|
| Phase 1 | 2 weeks | 40 hours |
| Phase 2 | 2 weeks | 50 hours |
| Phase 3 | 1 week | 20 hours |
| Phase 4 | 1 week | 15 hours |
| **Total** | **6 weeks** | **125 hours** |

### Skills Required
- Vue 3 Composition API expertise
- Tailwind CSS proficiency
- shadcn-vue component knowledge
- Playwright or similar E2E testing
- Visual design sensibility (pixel perfection)

### Tools Needed
- Playwright (visual regression)
- Lighthouse (performance)
- Bundle analyzer
- Browser DevTools

---

## 9. Appendix

### A. Component Mapping Reference

| Element Plus | shadcn-vue | Notes |
|-------------|-----------|-------|
| ElMessageBox | Dialog | Use Dialog + custom composable |
| ElLoading | LoadingOverlay | Create useLoading() wrapper |
| ElMessage | Sonner/notify.ts | Already migrated ✅ |
| ElButton | Button | Direct replacement |
| ElIcon | Lucide icons | Icon name mapping needed |
| ElTooltip | Tooltip | Direct replacement |
| ElPopover | Popover | Direct replacement |
| ElScrollbar | ScrollArea | API differences, test scrolling |
| ElInput | Input | Direct replacement |
| ElSwitch | Switch | Direct replacement |
| ElContainer | Custom layout | Create AppLayout component |
| ElAside | Custom layout | Part of AppLayout |
| ElMain | Custom layout | Part of AppLayout |
| ElFooter | Custom layout | Part of AppLayout |
| ElHeader | Custom layout | Part of AppLayout |

### B. File Inventory by Migration Phase

**Phase 1 Files (36):**
```
views/Main.vue
views/Outline.vue
views/MarkdownEditor.vue
views/LaTeXEditor.vue
views/PlainTextEditor.vue
views/AIChat.vue
views/AgentView.vue
views/KnowledgeBase.vue
views/AigcDetectionWindow.vue
views/OcrWindow.vue
views/DataAnalysisWindow.vue
views/Visualize.vue
views/AttachmentWindow.vue
views/setting/SettingLlmSection.vue
views/setting/SettingDebugSection.vue
views/setting/SettingThemeSection.vue
views/setting/SettingBasicSection.vue
components/agent/ReferenceManager.vue
components/agent/manage/AgentEngineManager.vue
components/agent/manage/WorkflowManager.vue
components/agent/manage/ToolCollectionManager.vue
components/agent/manage/AgentConfigManager.vue
components/MessageBubble.vue
components/GraphMessageBubble.vue
components/MetaInfoPanel.vue
components/WorkspaceExplorer.vue
components/LeftMenu.vue
components/LlmStatisticsContent.vue
components/workspace/WorkspaceTabs.vue
components/common/SessionList.vue
components/manual/UserProfileVisualization.vue
components/manual/ManualOverview.vue
utils/UnitTestResultDisplay.vue
utils/agent-tools/components/TerminalExecutionDisplay.vue
utils/agent-tools/components/ToolConfigEditor.vue
utils/agent-tools/components/AutoTestResultDisplay.vue
utils/agent-tools/components/ChartGenerationDisplay.vue
components/agent/workflow/WorkflowCodeEditor.vue
components/agent/workflow/WorkflowCanvas.vue
```

**Phase 2 Files (20):**
```
views/Main.vue (layout)
views/KnowledgeBase.vue
views/OcrWindow.vue
views/LaTeXEditor.vue
views/PlainTextEditor.vue
views/FomulaRecognition.vue
views/NewDocumentWorkspace.vue
views/DataAnalysisWindow.vue
components/outline/DetailedOutlineNode.vue
components/outline/OutlineNodeActionButton.vue
components/outline/OutlineAiToolbar.vue
components/WorkspaceTreeNode.vue
components/base/AutoResizeTextarea.vue
components/base/ResizableContainer.vue
components/VoiceInput.vue
components/MicrophoneTest.vue
components/BottomMenu.vue
components/MainTabs.vue
components/manual/ManualContent.vue
components/manual/MenuItemsDemo.vue
components/manual/ManualSearch.vue
components/data-analysis/DataAnalysisResultDisplay.vue
components/ui/UISubMenuItem.vue
components/ui/UISubMenu.vue
components/ui/UIMenuItem.vue
components/agent/AgentMessageRenderer.vue
components/agent/workflow/WorkflowDisplay.vue
components/home/SuggestionTags.vue
components/home/QuickStartMarkdown.vue
components/home/QuickStartLatex.vue
components/common/CardGrid.vue
utils/agent-tools/components/WorkspaceDisplay.vue
utils/agent-tools/components/WebCrawlerDisplay.vue
utils/agent-tools/components/TodoListDisplay.vue
utils/agent-tools/components/OutlineTreeDisplay.vue
utils/agent-tools/components/OutlineOptimizeDisplay.vue
utils/agent-tools/components/GrepDisplay.vue
utils/agent-tools/components/EditDisplay.vue
utils/agent-tools/components/TitleFormatDisplay.vue
utils/agent-tools/components/MetadataDisplay.vue
utils/agent-tools/components/ColorDisplay.vue
utils/agent-tools/components/DiffDisplay.vue
utils/agent-tools/components/DataAnalysisDisplay.vue
utils/agent-tools/components/RAGToolDisplay.vue
utils/agent-tools/components/ProofreadDisplay.vue
utils/agent-tools/components/ChartGenerationDisplay.vue
components/MenuConfigDialog.vue
components/SectionOptimizer.vue
components/AgentToolResultCard.vue
```

**Phase 3 Files (5):**
```
components/base/AutoResizeTextarea.vue
components/outline/OutlineNodeActionButton.vue
components/outline/OutlineAiToolbar.vue
components/outline/DetailedOutlineNode.vue
components/ExportOptionsDialog.vue
```

### C. Migration Script Template

```bash
#!/bin/bash
# migrate-component.sh
# Usage: ./migrate-component.sh ElMessageBox

COMPONENT=$1
echo "Migrating $COMPONENT usage..."

# Find all files using the component
grep -r "import.*$COMPONENT" src/renderer/src --include="*.vue" --include="*.ts" -l > files-to-migrate.txt

echo "Found $(wc -l < files-to-migrate.txt) files to migrate"
echo "Files:"
cat files-to-migrate.txt

# Generate migration checklist
echo "\nMigration Checklist:"
while read file; do
  echo "- [ ] $file"
done < files-to-migrate.txt
```

---

## 10. Conclusion

This roadmap provides a systematic approach to migrating from Element Plus to shadcn-vue. The phased approach minimizes risk while delivering incremental value:

1. **Phase 1** delivers immediate user-facing improvements (modern dialogs)
2. **Phase 2** establishes visual consistency (layout + icons)
3. **Phase 3** completes component parity
4. **Phase 4** optimizes and cleans up

**Next Steps:**
1. Review roadmap with stakeholders
2. Set up development branch
3. Begin Phase 1 implementation
4. Schedule weekly check-ins during migration

**Success Factors:**
- Thorough testing at each phase
- Visual parity maintained
- User experience preserved or improved
- Team alignment on priorities

---

*Document generated: 2026-02-23*
*Status: Strategic Planning Complete*
*Ready for Implementation*
