# Element UI to shadcn-vue Migration Report

## Executive Summary

**Total Files Affected:** 126 Vue files  
**Total Component Instances:** ~2,235 Element UI component usages  
**Priority Components for Migration:**
1. `el-button` - 415 instances in 82 files
2. `el-form`/`el-form-item`/`el-input` - 300+ instances
3. `el-tooltip` - 200+ instances
4. `el-icon` - 250+ instances
5. `el-dialog` - 80+ instances
6. `el-tabs`/`el-tab-pane` - 52 instances in 13 files
7. `el-dropdown`/`el-dropdown-menu`/`el-dropdown-item` - 70 instances in 10 files
8. `el-card` - 10 instances in 6 files
9. `el-input-number` - 17 instances in 7 files (temperature selectors)

---

## 1. EL-BUTTON (415 instances in 82 files)

### Files with Highest Usage:

| File | Line Count | Context |
|------|------------|---------|
| `src/renderer/src/views/setting/SettingDebugSection.vue` | ~40 | Debug tools, test execution buttons |
| `src/renderer/src/views/Outline.vue` | ~30 | Outline editing toolbar actions |
| `src/renderer/src/views/setting/SettingLlmSection.vue` | ~20 | LLM config management |
| `src/renderer/src/views/AigcDetectionWindow.vue` | ~15 | AIGC detection toolbar |
| `src/renderer/src/components/SearchReplaceMenu.vue` | ~15 | Search/replace actions |
| `src/renderer/src/views/OcrWindow.vue` | ~15 | OCR toolbar buttons |
| `src/renderer/src/views/KnowledgeBase.vue` | ~15 | Knowledge base management |
| `src/renderer/src/components/agent/workflow/WorkflowCanvas.vue` | ~15 | Workflow editor actions |

### Common Props/Patterns Found:
- `type="primary"` - Primary action buttons
- `type="success"` - Success/confirm actions
- `type="danger"` - Delete/dangerous actions
- `type="info"` - Info/secondary actions
- `type="warning"` - Warning actions
- `size="small"` / `size="large"` - Size variations
- `circle` - Icon-only circular buttons
- `:loading="..."` - Async operation loading state
- `:disabled="..."` - Conditional disabling
- `:icon="..."` - Icon integration (Element Plus icons)
- `@click="handler"` - Click event handlers
- `text` - Text-only buttons
- `plain` - Plain style buttons

### Key Migration Notes:
- shadcn-vue: Use `<Button>` component
- Icons: Replace `@element-plus/icons-vue` with `lucide-vue-next`
- Loading states: Use `:disabled` with spinner icon or Button's loading prop

---

## 2. EL-TABS / EL-TAB-PANE (52 instances in 13 files)

### Files Using Tabs:

| File | Line Numbers | Context |
|------|--------------|---------|
| `src/renderer/src/views/setting/SettingDebugSection.vue` | 56, 63, 90, 968, 975, 1100, 1195, 1197, 1264, 1270, 1356, 1455, 1503 | Debug panel tabs, unit test tabs, agent session tabs |
| `src/renderer/src/views/setting/SettingAboutSection.vue` | 36, 37, 131, 141 | About page tabs (updates, licenses, assets) |
| `src/renderer/src/views/DataAnalysisWindow.vue` | 69, 71, 241 | Data analysis preview/result tabs |
| `src/renderer/src/views/OcrWindow.vue` | 96, 97 | OCR image tabs |
| `src/renderer/src/views/AttachmentWindow.vue` | 72, 73, 88 | Attachment parsed/analysis tabs |
| `src/renderer/src/components/workspace/WorkspaceTabs.vue` | 3, 12, 38 | Workspace tab management |
| `src/renderer/src/utils/UnitTestResultDisplay.vue` | 37, 38, 111 | Unit test results/markdown tabs |
| `src/renderer/src/components/data-analysis/DataAnalysisResultDisplay.vue` | 27, 29, 77, 101 | Data analysis results tabs |
| `src/renderer/src/utils/agent-tools/components/DataAnalysisDisplay.vue` | 78, 80, 122, 143, 189 | Agent data analysis display tabs |
| `src/renderer/src/utils/agent-tools/components/AutoTestResultDisplay.vue` | 37, 38, 148 | Auto test results tabs |
| `src/renderer/src/utils/agent-tools/components/WebCrawlerDisplay.vue` | 43, 45, 83, 90 | Web crawler content tabs |
| `src/renderer/src/components/ExportOptionsDialog.vue` | 16, 17 | Export format tabs |
| `src/renderer/src/components/UserProfileCard.vue` | 14, 15, 40 | Login/Register tabs |

### Common Props/Patterns:
- `v-model="activeTab"` - Two-way binding for active tab
- `type="border-card"` - Border card style
- `tab-position="top"` - Tab position
- `:label="..."` - Tab label (i18n strings)
- `:name="..."` - Tab identifier
- `@tab-click` - Tab click events

### Key Migration Notes:
- shadcn-vue: Use `<Tabs>`, `<TabsList>`, `<TabsTrigger>`, `<TabsContent>`
- Tab content needs restructuring from Element's slot-based to shadcn's component-based

---

## 3. EL-DROPDOWN / EL-DROPDOWN-MENU / EL-DROPDOWN-ITEM (70 instances in 10 files)

### Files Using Dropdowns:

| File | Line Numbers | Context |
|------|--------------|---------|
| `src/renderer/src/views/AgentView.vue` | 45, 48, 49, 52, 55, 58, 61, 135, 138, 139, 142 | Agent management dropdowns, session actions |
| `src/renderer/src/views/AigcDetectionWindow.vue` | 156, 167, 168, 171, 172, 181, 184, 185, 188 | Export dropdowns, paraphrase actions |
| `src/renderer/src/components/GraphMessageBubble.vue` | 344, 356, 360, 364, 368, 372, 376, 380, 436, 448, 452, 456, 460, 464, 468, 472 | Message action menus |
| `src/renderer/src/components/MessageBubble.vue` | 310, 322, 326, 330, 334, 338, 342, 346 | AI message action menus |
| `src/renderer/src/views/OcrWindow.vue` | 225, 235, 236, 239 | Image preprocessing dropdowns |
| `src/renderer/src/views/setting/SettingThemeSection.vue` | 65, 68, 69, 72, 75 | Theme management dropdown |
| `src/renderer/src/components/agent/manage/WorkflowManager.vue` | 62, 65, 66, 69, 72, 75, 78 | Workflow action dropdown |
| `src/renderer/src/components/agent/workflow/WorkflowCanvas.vue` | 49, 89, 90 | Workflow node creation dropdown |
| `src/renderer/src/components/agent/AgentMessageRenderer.vue` | 36, 44, 48, 51, 54 | Agent message actions |
| `src/renderer/src/components/common/CardGrid.vue` | 64, 67, 68 | Card grid action menus |

### Common Props/Patterns:
- `@command="handler"` - Command-based selection handling
- `trigger="click"` / `trigger="contextmenu"` - Trigger mode
- `divided` - Divider line before item
- `:icon="..."` - Icon in dropdown item
- `command="..."` - Command identifier
- `@click.prevent.stop` - Event handling modifiers

### Key Migration Notes:
- shadcn-vue: Use `<DropdownMenu>`, `<DropdownMenuTrigger>`, `<DropdownMenuContent>`, `<DropdownMenuItem>`
- Command pattern needs to be replaced with direct click handlers

---

## 4. EL-INPUT-NUMBER (17 instances in 7 files) - Temperature Selectors

### Files Using Input Number (Temperature/Config):

| File | Line Numbers | Context |
|------|--------------|---------|
| `src/renderer/src/views/setting/SettingLlmSection.vue` | 18, 253, 322, 371, 415, 464, 505, 589 | LLM Temperature settings, max tokens, timeout |
| `src/renderer/src/views/Outline.vue` | 348 | Title formatting level adjustment |
| `src/renderer/src/views/DataAnalysisWindow.vue` | 90 | Data analysis max rows |
| `src/renderer/src/views/setting/SettingDebugSection.vue` | 1033 | Debug test parameters |
| `src/renderer/src/components/common/ImagePreviewDialog.vue` | 34 | Image zoom scale |
| `src/renderer/src/components/agent/manage/AgentConfigManager.vue` | 95 | Agent config parameters |
| `src/renderer/src/components/agent/manage/AgentEngineManager.vue` | 121, 131, 143, 167 | Engine config parameters |

### Common Props/Patterns:
- `:min="0"` / `:max="2"` - Min/max constraints
- `:step="0.1"` / `:step="1"` - Step increments
- `:precision="1"` - Decimal precision
- `style="width: 200px"` - Custom width
- `@change="handler"` - Change event
- `v-model="..."` - Two-way binding

### Key Migration Notes:
- shadcn-vue: Use custom `<Input type="number">` with validation or build custom number input
- Temperature selector (0-2, step 0.1) is critical for LLM settings

---

## 5. EL-CARD (10 instances in 6 files) - Document Template Cards

### Files Using Cards:

| File | Line Numbers | Context |
|------|--------------|---------|
| `src/renderer/src/views/KnowledgeBase.vue` | 29, 107, 164, 192, 218 | Knowledge base panels (list, search, preview, config) |
| `src/renderer/src/views/AgentView.vue` | 227 | Agent tool details card |
| `src/renderer/src/views/setting/SettingDebugSection.vue` | 45 | Debug section card |
| `src/renderer/src/components/AITask.vue` | 2 | AI task display card |
| `src/renderer/src/components/home/QuickStartPanel.vue` | 53 | Quick start panel card |
| `src/renderer/src/utils/agent-tools/components/RAGToolDisplay.vue` | 26 | RAG tool results card |

### Common Props/Patterns:
- `shadow="hover"` - Shadow on hover
- `shadow="never"` - No shadow
- `:style="{ background: ... }"` - Dynamic theming
- `v-loading="..."` - Loading state

### Key Migration Notes:
- shadcn-vue: Use `<Card>`, `<CardHeader>`, `<CardTitle>`, `<CardContent>`
- Shadow and theming need custom styling

---

## 6. OTHER MAJOR ELEMENT UI COMPONENTS

### EL-FORM / EL-FORM-ITEM / EL-INPUT (300+ instances)
**Primary Files:**
- `SettingLlmSection.vue` - LLM configuration forms
- `SettingBasicSection.vue` - Basic settings
- `SettingImageSection.vue` - Image settings
- `SettingDebugSection.vue` - Debug forms
- `UserProfileCard.vue` - User profile forms
- `UserFeedbackView.vue` - Feedback form
- `Outline.vue` - Outline editing dialogs
- `KnowledgeBase.vue` - Knowledge base search/config

### EL-TOOLTIP (200+ instances)
**Usage:** Everywhere - icon buttons, form labels, action hints
**Migration:** Use shadcn-vue `<Tooltip>`

### EL-ICON (250+ instances)
**Usage:** All files - button icons, status indicators, menu items
**Migration:** Replace `@element-plus/icons-vue` with `lucide-vue-next`

### EL-DIALOG (80+ instances)
**Primary Files:**
- `AgentView.vue` - Create/Manage dialogs
- `MessageBubble.vue` / `GraphMessageBubble.vue` - Edit dialogs
- `SettingLlmSection.vue` - Import/Manage dialogs
- `Outline.vue` - Format/Edit dialogs
- `AigcDetectionWindow.vue` - Document selection dialog

### EL-SCROLLBAR (100+ instances)
**Usage:** Custom scrollbars throughout the app
**Migration:** Use native scrollbar or shadcn ScrollArea

### EL-TABLE / EL-TABLE-COLUMN (50+ instances)
**Primary Files:**
- `KnowledgeBase.vue` - Knowledge base file list
- `AgentView.vue` - Agent tools table
- `ReferenceManager.vue` - Reference files table
- `SettingDebugSection.vue` - Debug result tables

### EL-SELECT / EL-OPTION (150+ instances)
**Usage:** Settings dropdowns, format selectors, model selection

### EL-SWITCH (80+ instances)
**Usage:** Toggle settings throughout

### EL-SLIDER (20+ instances)
**Usage:** Temperature, score threshold, image preprocessing

### EL-UPLOAD (15+ instances)
**Usage:** File upload in OCR, AIGC, feedback, data analysis

### EL-ALERT / EL-TAG / EL-PROGRESS (100+ instances)
**Usage:** Status indicators, notifications, progress tracking

### EL-CONTAINER / EL-HEADER / EL-ASIDE / EL-MAIN / EL-FOOTER (30+ instances)
**Primary Files:**
- `Main.vue` - Main layout container
- `Setting.vue` - Settings layout

### EL-MENU / EL-MENU-ITEM / EL-SUB-MENU (40+ instances)
**Primary Files:**
- `Setting.vue` - Settings navigation menu
- `ViewMenu.vue` - Left side view menu
- `SettingDebugSection.vue` - Debug section menu

### EL-RADIO-GROUP / EL-RADIO / EL-RADIO-BUTTON (60+ instances)
**Usage:** Settings options, editor mode selection

### EL-CHECKBOX (20+ instances)
**Usage:** Multi-select options, boolean settings

### EL-COLLAPSE / EL-COLLAPSE-ITEM (15+ instances)
**Usage:** Debug results, expandable sections

### EL-DESCRIPTIONS / EL-DESCRIPTIONS-ITEM (20+ instances)
**Usage:** Knowledge base config, tool details

### EL-AVATAR (10+ instances)
**Usage:** User avatars in chat messages

### EL-SEGMENTED (5+ instances)
**Usage:** Formula recognition tool selection

### EL-AUTOCOMPLETE (5+ instances)
**Usage:** Title generation, quick start prompts

### EL-EMPTY (15+ instances)
**Usage:** Empty state placeholders

### EL-SKELETON (10+ instances)
**Usage:** Loading skeletons in MarkdownEditor, Home, VditorPreview

### EL-STATISTIC (5+ instances)
**Usage:** Unit test result statistics

### EL-DIVIDER (40+ instances)
**Usage:** Section separators

### EL-STEPS / EL-STEP (10+ instances)
**Usage:** User profile setup wizard

### EL-POPCONFIRM / EL-POPOVER (10+ instances)
**Usage:** Confirmations and popups

### EL-TREE (5+ instances)
**Usage:** Manual navigation, workspace explorer

---

## 7. CSS/STYLING CONSIDERATIONS

### Element Plus CSS Variables Used:
```css
var(--el-color-primary)
var(--el-color-success)
var(--el-color-danger)
var(--el-color-warning)
var(--el-color-info)
var(--el-bg-color)
var(--el-bg-color-page)
var(--el-text-color-primary)
var(--el-text-color-secondary)
var(--el-border-color)
var(--el-border-color-lighter)
var(--el-fill-color)
var(--el-fill-color-light)
var(--el-fill-color-blank)
```

### Deep Selectors Found:
- `:deep(.el-button)`
- `:deep(.el-tabs__header)`
- `:deep(.el-tabs__content)`
- `:deep(.el-tab-pane)`
- `:deep(.el-scrollbar__wrap)`
- `:deep(.el-menu-item)`
- `:deep(.el-table)`
- `:deep(.el-descriptions__label)`

---

## 8. MIGRATION PRIORITY RECOMMENDATIONS

### Phase 1 - Critical UI Components:
1. `el-button` (82 files) - Core interactions
2. `el-dialog` (30 files) - Modal workflows
3. `el-form`/`el-input` (all settings files) - Configuration UI
4. `el-select`/`el-option` (settings files) - Dropdown selections

### Phase 2 - Layout & Navigation:
5. `el-tabs` (13 files) - Tab interfaces
6. `el-dropdown` (10 files) - Action menus
7. `el-menu` (5 files) - Navigation menus
8. `el-card` (6 files) - Panel containers

### Phase 3 - Specialized Components:
9. `el-table` (10 files) - Data tables
10. `el-input-number` (7 files) - Temperature/config inputs
11. `el-tooltip` (all files) - Help text
12. `el-icon` (all files) - Icon system

### Phase 4 - Supporting Components:
13. `el-scrollbar` (all files) - Custom scrollbars
14. `el-alert`/`el-tag`/`el-progress` - Status indicators
15. `el-upload` - File uploads
16. Remaining components

---

## 9. KEY FILES REQUIRING SPECIAL ATTENTION

### High-Complexity Files (Many Components):
1. `src/renderer/src/views/setting/SettingDebugSection.vue` - 40+ button instances, multiple tabs
2. `src/renderer/src/views/setting/SettingLlmSection.vue` - 20+ buttons, forms, input-number
3. `src/renderer/src/views/Outline.vue` - 30+ buttons, dialogs, forms
4. `src/renderer/src/views/AgentView.vue` - Dropdowns, tabs, cards, dialogs
5. `src/renderer/src/views/KnowledgeBase.vue` - Cards, tables, sliders, forms
6. `src/renderer/src/components/SearchReplaceMenu.vue` - Multiple buttons, tooltips
7. `src/renderer/src/views/AigcDetectionWindow.vue` - Dropdowns, buttons, dialogs
8. `src/renderer/src/views/OcrWindow.vue` - Sliders, checkboxes, dropdowns
9. `src/renderer/src/views/setting/SettingAboutSection.vue` - Tabs, alerts, forms
10. `src/renderer/src/views/DataAnalysisWindow.vue` - Tabs, forms, input-number

---

## 10. SHADCN-VUE EQUIVALENTS MAPPING

| Element Plus | shadcn-vue |
|--------------|------------|
| `el-button` | `<Button>` |
| `el-dialog` | `<Dialog>` |
| `el-card` | `<Card>` |
| `el-input` | `<Input>` |
| `el-select` | `<Select>` + `<SelectItem>` |
| `el-tabs` | `<Tabs>` + `<TabsList>` + `<TabsTrigger>` + `<TabsContent>` |
| `el-dropdown` | `<DropdownMenu>` |
| `el-tooltip` | `<Tooltip>` |
| `el-switch` | `<Switch>` |
| `el-slider` | `<Slider>` |
| `el-checkbox` | `<Checkbox>` |
| `el-radio` | `<RadioGroup>` + `<RadioGroupItem>` |
| `el-table` | `<Table>` |
| `el-form` | Native `<form>` with validation |
| `el-menu` | `<NavigationMenu>` or custom |
| `el-scrollbar` | `<ScrollArea>` |
| `el-alert` | `<Alert>` |
| `el-badge` | `<Badge>` |
| `el-avatar` | `<Avatar>` |
| `el-progress` | `<Progress>` |
| `el-skeleton` | `<Skeleton>` |
| `el-separator` | `<Separator>` |
| `el-textarea` | `<Textarea>` |
| `el-popover` | `<Popover>` |
| `el-collapsible` | `<Collapsible>` |

---

## 11. ADDITIONAL NOTES

### Icon Migration:
- Current: `@element-plus/icons-vue`
- Target: `lucide-vue-next`
- All icon imports need to be updated

### Theme System:
- Current: Custom `themeState` with Element Plus CSS vars
- Target: shadcn-vue's theming system + Tailwind
- CSS variable mapping required

### Form Validation:
- Current: Element Plus form validation rules
- Target: vee-validate or custom validation with shadcn

### Internationalization:
- Currently using `vue-i18n` with Element Plus
- shadcn-vue components support i18n via slots/props

---

**Report Generated:** 2026-02-21  
**Total Files Analyzed:** 126 Vue files  
**Total Component Usages:** ~2,235 instances
