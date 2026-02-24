# Agent Tools

## OVERVIEW

20+ AI-callable tools registered at startup via `agentToolManager.registerTool()`. Each tool exports a `*ToolConfig` object with name, description, parameter schema, and execute function. Tool specs contain embedded LLM instructions — treat as config, not comments.

## STRUCTURE

```
agent-tools/
├── index.ts                    # initializeAgentTools() — registers all built-in tools
├── edit-tool.ts                # Document editing (insert, replace, delete) — 2335 lines
├── data-analysis-tool.ts       # Data analysis with charts — 2234 lines
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
├── tool-utils.ts               # Common tool helpers (JSON parsing, retry)
├── tool-serialization.ts       # Tool result serialization
├── tool-display-communication.ts  # Tool↔UI communication
├── document-broadcast-helper.ts   # Cross-window document sync
├── i18n-helper.ts              # Tool i18n support
├── components/                 # 18 Vue components for tool UI
├── composables/                # Vue composables for tool state
└── test-data/                  # Test fixtures
```

## WHERE TO LOOK

| Task | File | Notes |
|------|------|-------|
| Add new tool | Create `*-tool.ts`, register in `index.ts` | Export `*ToolConfig` object |
| Modify tool UI | `components/` | Vue components rendering tool results |
| Change tool registration | `index.ts` | `agentToolManager.registerTool(config)` |
| Plugin system | `plugin-manager.ts` | External tool loading |
| Shared tool services | `agent-tool-services.ts` | Document access, workspace helpers |
| Tool utilities | `tool-utils.ts` | JSON parsing, retry logic |

## CONVENTIONS

- **Tool config pattern**: Each tool exports `{ name, description, parameters, execute }` matching agent framework's tool interface
- **Tool specs are LLM instructions**: The `description` and `parameters` fields contain embedded guidance ("Do NOT", "Important Notes") — these control LLM behavior
- **Tool results**: Return structured objects; use `tool-serialization.ts` for consistent formatting
- **UI components**: Tool-specific Vue components in `components/` — rendered via `tool-display-communication.ts`
- **Registration order**: All tools registered in `initializeAgentTools()` before app is interactive

## ANTI-PATTERNS

- Several tools exceed 1000 lines — `edit-tool.ts` (2335), `data-analysis-tool.ts` (2234), `chart-generation-tool.ts` (1682)
- Tool specs embed LLM behavioral instructions in string literals — changes affect AI behavior without obvious code changes
- `test-data/` contains JSON fixtures but no formal test runner; tests use custom `registerTest` framework
- `@deprecated` tags in `edit-tool.ts` — some legacy methods remain

## TOOL CONFIG EXAMPLE

```typescript
export const MyToolConfig: AgentToolConfig = {
  id: 'my-tool',
  name: { zh_cn: '我的工具', en_us: 'My Tool' },
  description: {
    zh_cn: '这是一个示例工具。Do NOT use for X. Important Notes: ...',
    en_us: 'This is an example tool. Do NOT use for X. Important Notes: ...'
  },
  origin: 'internal',
  instruction: `# My Tool\n\n## Usage\n...`,
  callback: async (params, signal, onUpdate) => {
    // Execute tool logic
    onUpdate({ content: { stage: 'processing' }, format: 'json' }, { percentage: 50 })
    return { status: 'succeeded', result: data }
  },
  displayComponent: MyToolDisplay,
  enabled: true,
  editable: false
}
```

## ERROR RETRY MECHANISM

Tools support automatic retry for LLM-related errors:

```typescript
import { parseJsonWithClean, retryWithBackoff } from './tool-utils'

// Parse LLM output with automatic cleanup
const result = parseJsonWithClean(llmOutput)
if (!result.success) {
  // Retry with error feedback to LLM
}
```

## REAL-TIME DISPLAY

Tools can send real-time updates during execution:

```typescript
// In tool callback
onUpdate(
  { content: data, format: 'json', componentName: 'MyDisplay' },
  { percentage: 75, message: 'Processing...' }
)

// In display component
const { realtimeData, realtimeStatus } = useToolDisplayRealtime(
  props.invocationId,
  props.data,
  props.status
)
```

## TESTING TOOLS

Use the built-in tool tester: **Settings → Developer → Agent Tool Test**

- Select tool from dropdown
- View tool instruction (read-only)
- Input JSON parameters
- Execute and view results
- Save/load test configurations

## RELATED

- Tool types: `src/renderer/src/types/agent-tool.ts`
- Tool manager: `src/renderer/src/utils/agent-tool-manager.ts`
- Tool display composable: `composables/useToolDisplayRealtime.ts`
- Agent framework: `../agent-framework/`
