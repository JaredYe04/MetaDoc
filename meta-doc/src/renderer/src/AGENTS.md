# Vue 3 Renderer

## OVERVIEW

Vue 3 SPA running in Electron's renderer process. shadcn-vue + Element Plus hybrid UI, Pinia state management, Monaco + Vditor dual editors, AI agent framework with 20+ tools, multi-format document export.

## STRUCTURE

```
renderer/src/
├── main.js               # Vue app bootstrap (JS — not TS)
├── App.vue               # Root component, global layout
├── router/router.js      # Vue Router (hash history, 20+ routes)
├── stores/               # Pinia stores
│   ├── workspace.ts      # Tabs, documents, workspace tree (1847 lines — core store)
│   ├── document.ts       # Document metadata & operations
│   └── user.ts           # User preferences
├── components/           # 53 Vue components + 93 shadcn-vue UI components
│   ├── agent/            # Agent UI (workflow canvas, managers)
│   ├── chat/             # Chat UI components
│   ├── common/           # Reusable UI (CardGrid, SessionList)
│   ├── home/             # Home/quick-start panels
│   ├── outline/          # Document outline tree components
│   ├── ui/               # shadcn-vue components (button, card, dialog, select, etc.)
│   ├── workspace/        # Workspace tabs, explorer
│   ├── TabSwitcherOverlay.vue  # Ctrl+Tab 标签页切换浮层
│   └── [40+ top-level]   # Feature-specific components
├── views/                # 28 route views (Home, Editor, AgentView, Setting, OCR, etc.)
├── services/             # Document & export services (see services/AGENTS.md)
├── editor/               # Editor adapters
│   ├── monaco-adapter.ts # Monaco editor integration (1465 lines)
│   ├── vditor-adapter.ts # Vditor markdown editor integration (1495 lines)
│   └── text-editor-types.ts  # Shared editor interface
├── composables/          # Vue composables
│   ├── useActiveDocument.ts    # 当前活跃文档获取
│   ├── useCloseTab.ts          # 标签页关闭逻辑
│   ├── useTabDrag.ts           # 标签页拖拽（跨窗口拖拽、排序、视觉反馈）
│   ├── useTabOperations.ts     # 标签页操作（关闭、移动到新窗口、右键菜单）
│   ├── useTabSwitcher.ts       # 键盘标签页切换（Ctrl+Tab 快捷键）
│   └── useWorkspaceOperations.ts  # 工作目录操作
├── utils/                # ~93 files (see agent-framework/ and agent-tools/ AGENTS.md)
│   ├── agent-framework/  # AI engine core (has own AGENTS.md)
│   ├── agent-tools/      # AI tool plugins (has own AGENTS.md)
│   ├── llm-adapters/     # LLM provider adapters (OpenAI, Ollama, Gemini)
│   ├── workspace/        # Workspace FS operations (planner/executor pattern)
│   ├── locale_prompts/   # LLM prompt templates per locale
│   ├── db/               # Renderer-side IndexedDB helpers
│   └── [75+ files]       # AI tasks, chart rendering, themes, md-utils, etc.
├── config/               # Runtime configs (tab-content, graph-engine)
├── locales/              # i18n JSON files (6 languages)
├── constants/            # Template constants
├── types/                # Renderer-specific type definitions
└── assets/               # Icons, CSS overrides, fonts
```

## WHERE TO LOOK

| Task                    | Location                                                              | Notes                                                        |
| ----------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------ |
| Add new view/page       | `views/` + `router/router.js`                                         | Also register in `pages` map if auxiliary window             |
| Add new component       | `components/`                                                         | PascalCase .vue, single-word names OK                        |
| Modify document state   | `stores/workspace.ts`                                                 | Core store — 1847 lines, complex                             |
| Tab drag & drop         | `composables/useTabDrag.ts`                                           | 跨窗口拖拽标签页、排序、视觉反馈、与主进程 drag-manager 配合 |
| Tab operations          | `composables/useTabOperations.ts`                                     | 关闭标签页、移动到新窗口、右键菜单                           |
| Tab switcher (Ctrl+Tab) | `composables/useTabSwitcher.ts` + `components/TabSwitcherOverlay.vue` | 键盘快捷切换标签页                                           |
| Add LLM provider        | `utils/llm-adapters/`                                                 | Extend `base-adapter.ts`, register in `adapter-factory.ts`   |
| Add editor feature      | `editor/`                                                             | Both adapters share `text-editor-types.ts` interface         |
| Modify AI behavior      | `utils/prompts.ts` + `locale_prompts/`                                | Prompt templates are first-class config                      |
| Add workspace FS op     | `utils/workspace/`                                                    | Uses planner→executor pattern                                |
| Theme/styling           | `utils/themes.js` + `assets/`                                         | `themeState` provided globally                               |
| Add shadcn component    | `components/ui/`                                                      | Use `npx shadcn-vue@latest add <component>`                  |
| Use shadcn component    | Import from `components/ui/<name>`                                    | Components based on reka-ui with Tailwind styling            |

## CONVENTIONS

- **Router**: `pages` map in `router.js` for auxiliary window types; `meta.requiresLayout` on main routes
- **Stores**: Composition API Pinia stores; `workspace.ts` has cross-window broadcast via `initializeWorkspaceBroadcastListeners()`
- **Editor adapters**: Both Monaco and Vditor implement same interface from `text-editor-types.ts`; adapter chosen per document type
- **LLM adapters**: Factory pattern in `adapter-factory.ts` — register new providers there
- **i18n**: `vue-i18n` with JSON locale files; Python script `i18n_check.py` validates completeness
- **Event bus**: `utils/event-bus.js` (mitt-based) for cross-component communication
- **Format system**: `format-registry.ts` + `format-initializer.ts` — register document format handlers at startup
- **shadcn-vue**: Use `npx shadcn-vue@latest add <component>` to install new components; components use reka-ui primitives + Tailwind CSS
- **UI hybrid**: shadcn-vue for new UI, Element Plus for legacy; both can coexist in same views

## ANTI-PATTERNS

- `workspace.ts` (1847 lines) — oversized Pinia store; avoid adding more actions without discussion
- `utils/` has 93 files at one level — flat structure makes discovery hard; prefer subfolders
- Many utils are JS (`md-utils.js`, `llm-api.js`, `event-bus.js`) — new code should be TypeScript

---

## Notification System

### Overview

Unified notification system based on **shadcn-vue Sonner** + **Pinia** + **localStorage**.

**Design principle**: All notifications display as top-right Toast AND enter history queue.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Notification Architecture                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   Business Code                                                          │
│        │                                                                 │
│        ├─► notify.success('message') ──────┐                            │
│        ├─► notifyError('message') ─────────┤                            │
│        ├─► store.success('message') ───────┼────►┌─────────────────┐     │
│        └─► eventBus.emit('show-success') ──┘    │  Pinia Store      │     │
│                                                   │  stores/notify    │     │
│                                                   │                   │     │
│                                                   │  • notifications[]│     │
│                                                   │  • localStorage   │     │
│                                                   └─────────┬─────────┘     │
│                                                             │               │
│                                    ┌────────────────────────┼───────────┐   │
│                                    ▼                        ▼           ▼   │
│                             ┌─────────────┐        ┌──────────────┐  ┌──────┐│
│                             │ Sonner      │        │ Notification │  │Event ││
│                             │ (top-right) │        │ Queue        │  │Bus   ││
│                             │ Toast       │        │ (bottom panel)│  │compat││
│                             └─────────────┘        └──────────────┘  └──────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

### Quick Reference

```typescript
// Component usage
import { notify, notifySuccess, notifyError, notifyWarning, notifyInfo } from '@/utils/notify'
import { useNotificationStore } from '@/stores/notification'

// Quick notify (top-right toast + history queue)
notifySuccess('Saved successfully')
notifyError('Save failed', { duration: 5000 })
notifyWarning('Please check input')
notifyInfo('Background task started')

// Full options
notify({
  message: 'File exported',
  type: 'success',
  title: 'Export',
  duration: 4000,
  showToast: true,
  addToQueue: true,
  action: {
    label: 'Open',
    onClick: () => openFile(path)
  }
})

// Store access (for history queue)
const store = useNotificationStore()
store.notifications // All notifications
store.unreadCount // Unread count
store.markAllAsRead() // Mark all as read
store.remove(id) // Remove notification
```

### File Locations

| Module | Location                           | Purpose                      |
| ------ | ---------------------------------- | ---------------------------- |
| Types  | `types/notification.ts`            | TypeScript interfaces        |
| Store  | `stores/notification.ts`           | Pinia store + localStorage   |
| API    | `utils/notify.ts`                  | Unified notify functions     |
| Legacy | `utils/notifications-legacy.ts`    | EventBus compatibility layer |
| UI     | `components/NotificationQueue.vue` | History panel                |
| Toast  | `App.vue`                          | Global Toaster component     |

### Migration from Old System

**Old (ElMessage)**:

```typescript
import { ElMessage } from 'element-plus'
ElMessage.success(t('setting.saveSuccess'))
```

**New (notify)**:

```typescript
import { notifySuccess } from '@/utils/notify'
notifySuccess(t('setting.saveSuccess'))
```

**Old (EventBus)**:

```typescript
eventBus.emit('show-success', { message: 'Done' })
```

**New**: EventBus still works (compatibility layer auto-forwards to new system)

### Architecture Decisions

1. **Single source of truth**: All notifications go through Pinia store
2. **Dual display**: Every notification shows as Toast + enters history
3. **Persistent history**: 7-day retention in localStorage
4. **Backward compatible**: EventBus events auto-forward to new system
5. **Theme adaptive**: Sonner uses CSS variables from theme system

### Priority Files for Migration

```
P0 (Critical):
  - Main.vue (ElNotification handlers)
  - Setting*.vue (10 files)

P1 (High):
  - Editor.vue
  - MarkdownEditor.vue
  - LaTeXEditor.vue
  - PlainTextEditor.vue

P2 (Medium):
  - AgentView.vue
  - ReferenceManager.vue
  - WorkflowManager.vue

P3 (Low):
  - Other 40+ views
```

## Notification System - Migration Status & Current State

### Migration Completion (2024-02-22)

**Status: ✅ COMPLETED**

All notification calls have been migrated from Element Plus to the new unified system.

#### Migration Statistics

- **Total Files Migrated**: 35+ view files
- **Total Calls Replaced**: 400+ ElMessage/ElNotification calls
- **Commits**: 6 migration commits
- **Duration**: Completed in one session

#### What Was Migrated

**P0 - Core Files (9 files)**

- Main.vue - ElNotification handlers
- SettingLlmSection.vue (29 calls)
- SettingThemeSection.vue (3 calls)
- SettingBasicSection.vue (4 calls)
- SettingImageSection.vue (3 calls)
- SettingDebugSection.vue (99 calls)
- SettingKnowledgeBaseSection.vue
- SettingLoggerSection.vue
- SettingAboutSection.vue

**P1 - Editor Views (4 files)**

- Editor.vue
- MarkdownEditor.vue
- LaTeXEditor.vue
- PlainTextEditor.vue

**P2 - Core Features (8 files)**

- AgentView.vue (34 calls)
- ReferenceManager.vue
- WorkflowManager.vue
- AgentEngineManager.vue
- AgentConfigManager.vue
- AIChat.vue (12 calls)
- ProofreadView.vue (15 calls)

**P3 - Tool Windows (25+ files)**

- AigcDetectionWindow.vue
- OcrWindow.vue
- DataAnalysisWindow.vue
- GraphWindow.vue
- FomulaRecognition.vue
- UserFeedbackView.vue (10 calls)
- AttachmentWindow.vue (13 calls)
- Outline.vue
- KnowledgeBase.vue
- And 15+ other tool views

### Current Implementation

#### Files Added

| File                            | Lines | Purpose                             |
| ------------------------------- | ----- | ----------------------------------- |
| `types/notification.ts`         | ~60   | TypeScript interfaces               |
| `stores/notification.ts`        | ~200  | Pinia store with Sonner integration |
| `utils/notify.ts`               | ~40   | Unified notification API            |
| `utils/notifications-legacy.ts` | ~100  | EventBus compatibility layer        |

#### How It Works

```
Business Code
    │
    ├─► notify.success('message') ──────┐
    ├─► notifyError('message') ─────────┤
    ├─► store.success('message') ───────┼──► Pinia Store
    └─► eventBus.emit('show-success') ──┘    (stores/notification)
                                             • notifications[]
                                             • localStorage
                                             • unreadCount
                                                    │
                       ┌────────────────────────────┼───────────┐
                       ▼                            ▼           ▼
                ┌─────────────┐            ┌──────────────┐  ┌─────────┐
                │ Sonner      │            │ Notification │  │ EventBus│
                │ (top-right) │            │ Queue        │  │ compat  │
                │ Toast       │            │ (bottom)     │  │         │
                └─────────────┘            └──────────────┘  └─────────┘
```

### Current Behavior

#### Notification Display

1. **Toast**: Every notification shows as a top-right Sonner toast
2. **History**: Every notification enters the bottom notification queue
3. **Unread Badge**: Bottom menu shows unread count badge
4. **Manual Read**: Users manually mark notifications as read (no auto-mark)

#### User Flow

```
Action: Open Document
    ↓
┌─────────────────────────────────────┐
│  ✅ 打开成功              [x]      │  ← Top-right Sonner Toast
│  文档.md 已打开                      │
└─────────────────────────────────────┘
    ↓
┌──────────────────────────────────────────┐
│  文档 📄 | 帮助 ❓ |  🔴 通知 (1)  | AI │  ← Bottom shows unread
└──────────────────────────────────────────┘
    ↓
User clicks bell icon
    ↓
┌─────────────────────┐
│ 通知队列             │
│ ┌─────────────────┐ │
│ │ 🟢 打开成功      │ │
│ │ 文档.md 已打开   │ │
│ │ [标记已读] [删除]│ │  ← Manual mark as read
│ └─────────────────┘ │
└─────────────────────┘
```

### Best Practices

#### 1. Use notify functions for simple notifications

```typescript
import { notifySuccess, notifyError, notifyWarning, notifyInfo } from '@/utils/notify'

// Success
notifySuccess('文件已保存')

// Error with options
notifyError('保存失败', { duration: 5000 })

// Warning
notifyWarning('请检查输入内容')

// Info
notifyInfo('正在处理...')
```

#### 2. Use full notify() for complex notifications

```typescript
import { notify } from '@/utils/notify'

notify({
  message: '文件已导出',
  type: 'success',
  title: '导出完成',
  duration: 4000,
  action: {
    label: '打开',
    onClick: () => openFile(path)
  }
})
```

#### 3. Use EventBus for backward compatibility

```typescript
// Old code - still works!
eventBus.emit('show-success', '操作成功')
eventBus.emit('show-error', '操作失败')
eventBus.emit('open-doc-success', { fileName: 'doc.md' })
eventBus.emit('save-success', { fileName: 'doc.md' })
eventBus.emit('export-success', { path: '/path/to/file.pdf' })
```

#### 4. Use Store for accessing notification history

```typescript
import { useNotificationStore } from '@/stores/notification'

const store = useNotificationStore()

// Show notification
store.success('保存成功')

// Access history
console.log(store.notifications) // All notifications
console.log(store.unreadCount) // Unread count

// Mark as read
store.markAsRead(notificationId) // Mark single as read
store.markAllAsRead() // Mark all as read

// Remove
store.remove(notificationId) // Remove single
store.removeAll() // Clear all
```

### EventBus Compatibility Layer

The legacy adapter (`utils/notifications-legacy.ts`) handles these events:

| Event              | Handler                             |
| ------------------ | ----------------------------------- |
| `show-success`     | Shows success toast + adds to queue |
| `show-error`       | Shows error toast + adds to queue   |
| `show-warning`     | Shows warning toast + adds to queue |
| `show-info`        | Shows info toast + adds to queue    |
| `open-doc-success` | Shows "Open Success" with file name |
| `save-success`     | Shows "Save Success" with file name |
| `export-success`   | Shows "Export Success" with path    |

### Common Issues & Solutions

#### Issue: Notifications not showing

**Check**:

1. Is `initNotificationLegacyAdapter()` called in App.vue?
2. Is the Toaster component present in App.vue?
3. Are there console errors?

#### Issue: Toast appears but queue is empty

**Cause**: `addToQueue: false` was passed in options
**Solution**: Default is `true`, check if you explicitly set it to `false`

### Configuration

#### Default Duration

```typescript
const DEFAULT_DURATION = 4000 // 4 seconds
```

#### Storage

- **Key**: `metadoc-notifications-v1`
- **Retention**: 7 days
- **Max Items**: 100

#### Position

- **Toast**: Bottom-right (Sonner default)
- **Queue**: Bottom-right (above status bar)

### UI Implementation Details

#### NotificationQueue Component

- **Framework**: Pure shadcn-vue (no Element Plus)
- **Components used**: Card, Button, Badge, ScrollArea, Tooltip
- **Icons**: lucide-vue-next (Bell, CheckCircle2, XCircle, AlertCircle, Info, X, Trash2, Inbox)

#### Sonner-Style Notification Items

Each notification item in the queue **exactly matches** Sonner Toast DOM structure and styling:

```html
<div class="sonner-notification sonner-success">
  <button class="sonner-close-btn">✕</button>
  <!-- Top-left, hover to show -->
  <div data-icon class="sonner-icon">
    <svg><!-- Type icon --></svg>
  </div>
  <div data-content class="sonner-content">
    <div data-title>Title</div>
    <div data-description>Description message</div>
    <div data-timestamp>2 minutes ago</div>
  </div>
  <div class="sonner-unread-dot"></div>
  <!-- Unread indicator -->
</div>
```

**Styling features** (dynamic with shadcn theme):

- **Background**: `hsl(var(--background))` - follows shadcn theme
- **Foreground**: `hsl(var(--foreground))` - follows shadcn theme
- **Border**: `hsl(var(--border))` - follows shadcn theme
- **Close button**: Top-left position (same as Sonner), hover to show
- **Icon**: Left side, color matches notification type (success=green, error=red, etc.)
- **Shadow**: `0 4px 12px rgba(0, 0, 0, 0.08)` with hover elevation
- **Border radius**: `12px` (rounded-xl)
- **Unread dot**: Top-right, colored by type

**No hardcoded colors** - all colors use CSS variables:

```css
background: hsl(var(--background));
color: hsl(var(--foreground));
border: 1px solid hsl(var(--border));
```

#### Migration to Pure shadcn-vue

**Removed all Element Plus components from notification system**:

- ✅ Replaced `el-icon` with lucide-vue-next icons
- ✅ Replaced Element Plus colors with Tailwind classes
- ✅ Replaced `status-dot` with CSS-based indicators
- ✅ Unified styling between Sonner Toast and NotificationQueue items

#### CSS Classes

| Class                  | Purpose                      |
| ---------------------- | ---------------------------- |
| `.sonner-notification` | Base notification container  |
| `.sonner-success`      | Success type styling         |
| `.sonner-error`        | Error type styling           |
| `.sonner-warning`      | Warning type styling         |
| `.sonner-info`         | Info type styling            |
| `.sonner-close-btn`    | Close button (top-left)      |
| `.sonner-icon`         | Icon container (left side)   |
| `.sonner-content`      | Content wrapper              |
| `.sonner-title`        | Title text                   |
| `.sonner-description`  | Description text             |
| `.sonner-timestamp`    | Time display                 |
| `.sonner-unread-dot`   | Unread indicator (top-right) |

### Migration Checklist (for future reference)

When migrating a new file:

- [ ] Replace `ElMessage.success/error/warning/info` with `notifyXxx()`
- [ ] Replace `ElNotification` with `notify()`
- [ ] Keep `ElMessageBox` for confirmation dialogs
- [ ] Add import: `import { notifyXxx } from '@/utils/notify'`
- [ ] Remove unused Element Plus imports
- [ ] Test notification displays correctly
- [ ] Check it appears in both toast and queue
