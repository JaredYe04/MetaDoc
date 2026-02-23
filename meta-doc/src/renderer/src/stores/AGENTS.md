# Pinia Stores

## OVERVIEW

State management layer using Pinia composition API. Four stores managing workspace (tabs/documents), document metadata, user preferences, and notifications.

## STRUCTURE

```
stores/
├── workspace.ts          # CORE: Tabs, documents, workspace tree (1847 lines)
├── document.ts           # Document metadata & CRUD operations
├── user.ts               # User preferences & settings
└── notification.ts       # Sonner-based notification queue
```

## WHERE TO LOOK

| Task                    | File               | Notes                                                  |
| ----------------------- | ------------------ | ------------------------------------------------------ |
| Modify tab state        | `workspace.ts`     | 1847-line monolith; discuss before adding actions      |
| Add document metadata   | `document.ts`      | Document properties, format detection                  |
| Change user settings    | `user.ts`          | Preferences persistence                                |
| Show notification       | `notification.ts`  | Sonner toast + history queue                           |
| Cross-window sync       | `workspace.ts`     | Uses initializeWorkspaceBroadcastListeners()           |

## CONVENTIONS

- **Composition API**: All stores use `defineStore()` with setup function
- **Cross-window**: workspace.ts broadcasts state changes via IPC
- **Persistence**: User store syncs to localStorage; workspace is session-only
- **Notifications**: Dual display - Sonner toast + history queue in bottom panel

## ANTI-PATTERNS

- **workspace.ts is 1847 lines** — critically oversized; do not add actions without discussing modularization
- Adding side effects in getters — use actions instead
- Direct store mutations outside components — always use actions
