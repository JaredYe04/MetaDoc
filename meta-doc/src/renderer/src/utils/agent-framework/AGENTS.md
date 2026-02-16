# Agent Framework

## OVERVIEW

AI agent orchestration engine supporting multiple execution strategies (AutoGPT, ReAct, PlanExecute, SimpleChat, Workflow). Manages agent sessions, tool collections, workflow graphs, and LLM communication.

## STRUCTURE

```
agent-framework/
├── index.ts                    # Unified exports for all managers, executors, types
├── agent-engine-executor.ts    # Engine executors: AutoGPT, ReAct, PlanExecute, SimpleChat, Workflow (2131 lines)
├── agent-engine-manager.ts     # Engine configuration CRUD
├── agent-config-manager.ts     # Agent config persistence (751 lines)
├── agent-session-manager.ts    # Session lifecycle: create, run, pause, resume (774 lines)
├── ai-context-manager.ts       # LLM context window management (833 lines)
├── llm-adapter.ts              # Framework-internal LLM communication layer (1135 lines)
├── tool-call-parsers.ts        # Parse LLM tool-call outputs (XML, JSON, markdown) (1401 lines)
├── tool-call-parser-tests.ts   # Inline test cases for parsers (1306 lines)
├── tool-call-processor.ts      # Process parsed tool calls into execution queue
├── tool-call-queue.ts          # Ordered tool execution queue (526 lines)
├── tool-collection-manager.ts  # Tool set management (which tools available per agent)
├── tool-runner.ts              # Execute individual tools, collect observations
├── workflow-executor.ts        # Visual workflow graph executor (985 lines)
├── workflow-manager.ts         # Workflow CRUD + persistence (513 lines)
├── workflow-tool.ts            # Register workflows as callable tools
├── workflow-pseudo-code.ts     # Generate pseudo-code from workflow graphs
├── workflow-thumbnail.ts       # Workflow preview thumbnail generation
├── reference-processor.ts      # Process document/file references for context (657 lines)
├── reference-adapters.ts       # Adapters for different reference source types
├── intent-processor.ts         # User intent classification
├── builtin-workflows.ts        # Default workflow definitions
├── mxgraph-helper.ts           # mxGraph interop for workflow canvas
└── docs/                       # Internal documentation (17 files)
```

## WHERE TO LOOK

| Task                     | File                       | Notes                                                                  |
| ------------------------ | -------------------------- | ---------------------------------------------------------------------- |
| Add new engine type      | `agent-engine-executor.ts` | Extend `BaseEngineExecutor`, register in `AgentEngineExecutorFactory`  |
| Modify tool-call parsing | `tool-call-parsers.ts`     | Handles XML/JSON/markdown formats; test in `tool-call-parser-tests.ts` |
| Change context building  | `ai-context-manager.ts`    | Controls what goes into LLM prompt (system, history, refs, tools)      |
| Add workflow node type   | `workflow-executor.ts`     | Execution logic for graph nodes                                        |
| Modify session lifecycle | `agent-session-manager.ts` | Create/run/pause/resume/cancel                                         |
| Change LLM communication | `llm-adapter.ts`           | Streaming, retries, token management                                   |

## CONVENTIONS

- **Engine pattern**: `AgentEngineExecutorFactory.create(type)` returns typed executor
- **All managers are singletons**: `agentConfigManager`, `agentSessionManager`, `workflowManager`, etc.
- **Tool observations**: Tools return `ToolObservation` objects (from `tool-runner.ts`) fed back into LLM context
- **Exports**: Everything re-exported through `index.ts` — import from `agent-framework` not individual files
- **Workflow as tool**: `registerWorkflowAsTool()` wraps any workflow graph as a callable agent tool

## ANTI-PATTERNS

- `agent-engine-executor.ts` (2131 lines) contains all engine types in one file — future extraction planned
- `tool-call-parsers.ts` has inline tests (`tool-call-parser-tests.ts`) — not a standard test framework; uses custom `registerTest` pattern
- `llm-adapter.ts` duplicates some logic from `utils/llm-adapters/` — the framework has its own LLM layer separate from the renderer-level adapters
