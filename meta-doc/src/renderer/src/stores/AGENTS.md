# Pinia Stores

## OVERVIEW

State management layer using Pinia composition API. Four stores managing workspace (tabs/documents), document metadata, user preferences, and notifications.

## STRUCTURE

```
stores/
├── workspace.ts          # CORE: Tabs, documents, workspace tree (2009 lines, 15 exports)
├── document.ts           # Document metadata & CRUD operations
├── user.ts               # User preferences & settings
└── notification.ts       # Sonner-based notification queue
```

## WHERE TO LOOK

| Task | File | Notes |
|------|------|-------|
| Modify tab state | `workspace.ts` | 2009-line monolith; discuss before adding actions |
| Add document metadata | `document.ts` | Document properties, format detection |
| Change user settings | `user.ts` | Preferences persistence |
| Show notification | `notification.ts` | Sonner toast + history queue |
| Cross-window sync | `workspace.ts` | Uses `initializeWorkspaceBroadcastListeners()` |

## CONVENTIONS

- **Composition API**: All stores use `defineStore()` with setup function
- **Cross-window**: workspace.ts broadcasts state changes via IPC
- **Persistence**: User store syncs to localStorage; workspace is session-only
- **Notifications**: Dual display — Sonner toast + history queue in bottom panel

## ANTI-PATTERNS

- **workspace.ts is 2009 lines** — critically oversized; do not add actions without discussing modularization
- Adding side effects in getters — use actions instead
- Direct store mutations outside components — always use actions

## WORKSPACE STORE

The workspace store is the most complex, managing:
- Tab state (active, order, history)
- Document models (markdown, LaTeX, metadata)
- Workspace tree (folders, files)
- Cross-window synchronization
- Unsaved changes tracking

Key exports (15 total):
- `tabs` — Array of open tabs
- `documents` — Map of document ID → document
- `activeTabId` — Currently active tab
- `workspaceTree` — File system tree
- `hasUnsavedChanges()` — Check for unsaved documents
- `initializeWorkspaceBroadcastListeners()` — Cross-window sync

## NOTIFICATION STORE

Unified notification system using Sonner + Pinia + localStorage:

```typescript
const store = useNotificationStore()

// Show notification
store.success('操作成功')
store.error('操作失败', { duration: 5000 })

// Access history
store.notifications     // All notifications
store.unreadCount       // Unread count
store.markAllAsRead()   // Mark all read
store.remove(id)        // Remove single notification
```

**Features:**
- 7-day retention in localStorage
- Max 100 items
- Manual mark-as-read (no auto-mark)
- Sonner toast + history queue dual display

## RELATED

- Notification UI: `components/NotificationQueue.vue`
- Notify API: `utils/notify.ts`
- EventBus compat: `utils/notifications-legacy.ts`
