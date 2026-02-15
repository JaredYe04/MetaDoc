# Agent Tools

## OVERVIEW

20+ AI-callable tools registered at startup via `agentToolManager.registerTool()`. Each tool exports a `*ToolConfig` object with name, description, parameter schema, and execute function. Tool specs contain embedded LLM instructions — treat as config, not comments.

## STRUCTURE

```
agent-tools/
├── index.ts                    # initializeAgentTools() — registers all built-in tools
├── edit-tool.ts                # Document editing (insert, replace, delete) — 2335 lines
├── data-analysis-tool.ts       # Data analysis with charts — 2081 lines
├── chart-generation-tool.ts    # ECharts/D3 chart generation — 1682 lines
├── grep-tool.ts                # Text search in documents — 1256 lines
├── todolist-tool.ts            # Task list management — 1548 lines
├── proofread-tool.ts           # Grammar/style checking — 1174 lines
├── outline-optimize-tool.ts    # Document outline restructuring — 1060 lines
├── metadata-tool.ts            # Document metadata management — 1168 lines
├── title-format-tool.ts        # Title formatting rules — 588 lines
├── workspace-tool.ts           # Workspace file operations — 760 lines
├── diff-tool.ts                # Text comparison — 625 lines
├── web-crawler-tool.ts         # Web page fetching — 675 lines
├── terminal-tool.ts            # Shell command execution — 642 lines
├── rag-tool.ts                 # Knowledge base RAG queries
├── outline-tree-tool.ts        # Outline tree operations
├── calculation-tool.ts         # Math calculations
├── color-tool.ts               # Color manipulation
├── timestamp-tool.ts           # Date/time operations
├── tool-spec-fetcher-tool.ts   # Dynamic tool spec loading
├── plugin-manager.ts           # External plugin loading system
├── agent-tool-services.ts      # Shared tool utilities (547 lines)
├── tool-utils.ts               # Common tool helpers
├── tool-serialization.ts       # Tool result serialization
├── tool-display-communication.ts  # Tool↔UI communication
├── document-broadcast-helper.ts   # Cross-window document sync
├── i18n-helper.ts              # Tool i18n support
├── components/                 # 18 Vue components for tool UI (result displays, panels)
├── composables/                # Vue composables for tool state
└── test-data/                  # Test fixtures for tool testing
```

## WHERE TO LOOK

| Task                     | File                                       | Notes                                   |
| ------------------------ | ------------------------------------------ | --------------------------------------- |
| Add new tool             | Create `*-tool.ts`, register in `index.ts` | Export `*ToolConfig` object             |
| Modify tool UI           | `components/`                              | Vue components rendering tool results   |
| Change tool registration | `index.ts`                                 | `agentToolManager.registerTool(config)` |
| Plugin system            | `plugin-manager.ts`                        | External tool loading (WIP)             |
| Shared tool services     | `agent-tool-services.ts`                   | Document access, workspace helpers      |

## CONVENTIONS

- **Tool config pattern**: Each tool file exports a config object with `{ name, description, parameters, execute }` matching the agent framework's tool interface
- **Tool specs are LLM instructions**: The `description` and `parameters` fields contain embedded guidance ("Do NOT", "Important Notes", "Usage Principles") — these control LLM behavior when calling tools
- **Tool results**: Return structured objects; use `tool-serialization.ts` for consistent formatting
- **UI components**: Tool-specific Vue components in `components/` — rendered via `tool-display-communication.ts`
- **Registration order**: All tools registered in `initializeAgentTools()` before app is interactive

## ANTI-PATTERNS

- Several tools exceed 1000 lines — `edit-tool.ts` (2335), `data-analysis-tool.ts` (2081), `chart-generation-tool.ts` (1682)
- Tool specs embed LLM behavioral instructions in string literals — changes affect AI behavior without obvious code changes
- `test-data/` contains JSON fixtures but no formal test runner; tests use the custom `registerTest` framework
- `@deprecated` tags in `edit-tool.ts` — some legacy methods remain
