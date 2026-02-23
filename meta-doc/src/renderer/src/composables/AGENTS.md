# Vue Composables

## OVERVIEW

Tab management and workspace operations via Vue 3 composables. Handles complex cross-window drag, keyboard shortcuts, and tab lifecycle.

## STRUCTURE

```
composables/
├── useActiveDocument.ts      # Current active document getter
├── useCloseTab.ts            # Tab closing logic with save prompts
├── useTabDrag.ts             # Cross-window drag & drop, sorting
├── useTabOperations.ts       # Close, move to new window, context menu
├── useTabSwitcher.ts         # Keyboard shortcut (Ctrl+Tab) overlay
└── useWorkspaceOperations.ts # Workspace directory operations
```

## WHERE TO LOOK

| Task                    | File                      | Notes                                      |
| ----------------------- | ------------------------- | ------------------------------------------ |
| Tab drag between windows| `useTabDrag.ts`           | Coordinates with main process drag-manager |
| Tab keyboard switching  | `useTabSwitcher.ts`       | Ctrl+Tab, overlay via TabSwitcherOverlay   |
| Move tab to new window  | `useTabOperations.ts`     | Uses ipcRenderer.invoke()                  |
| Close tab with prompt   | `useCloseTab.ts`          | Handles unsaved changes                    |
| Get active document     | `useActiveDocument.ts`    | Reactive current document                  |
| Workspace FS operations | `useWorkspaceOperations.ts| Planner→executor pattern                    |

## CONVENTIONS

- **Naming**: `use{Feature}` pattern for all composables
- **Cross-window**: Drag operations coordinate with main process via IPC
- **Keyboard**: Shortcuts registered in component onMounted, unregistered on unmount
- **Reactivity**: Return refs that components can watch or bind

## ANTI-PATTERNS

- Calling composables conditionally — always at top level of setup()
- Mutating tab state directly — use workspace store actions
- Forgetting cleanup — always unregister shortcuts in onUnmounted
