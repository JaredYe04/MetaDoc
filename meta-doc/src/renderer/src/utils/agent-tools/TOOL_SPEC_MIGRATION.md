# Tool Spec Migration Guide

## Overview

To optimize AI context space, we've introduced a `ToolSpec` interface that separates tool documentation into:

- **brief**: Short description (always included in System Prompt, used for intent recognition)
- **fullSpec**: Complete specification (injected on-demand when tools are needed)

## How It Works

1. **Intent Recognition**: When a user sends a message, the system first performs intent recognition to identify which tools are needed
2. **Dynamic Injection**: Only the `fullSpec` of identified tools are injected into the context
3. **Lifecycle**: `activeToolSpecs` are cleared on each user message and repopulated based on intent recognition

## Adding Spec to a Tool

### Step 1: Add spec to Tool Config

In your tool configuration file (e.g., `edit-tool.ts`), add a `spec` field:

```typescript
export const myToolConfig: AgentToolConfig = {
  id: 'my-tool',
  name: myToolLocales,
  description: myToolLocales,
  origin: 'internal',
  spec: {
    name: 'my-tool',
    brief: 'Brief one-line description of what the tool does. Keep it under 150 characters.',
    fullSpec: `# My Tool

## Description
Complete description of the tool, including all features, use cases, input/output formats, examples, etc.

## Usage Scenarios
- Scenario 1
- Scenario 2

## Input Format
\`\`\`json
{
  "param1": "value1",
  "param2": "value2"
}
\`\`\`

## Output Format
\`\`\`json
{
  "result": "output"
}
\`\`\`

## Important Notes
1. Note 1
2. Note 2
`
  },
  instruction: `...`, // Keep existing instruction for backward compatibility
  callback: myToolCallback
  // ... other fields
}
```

### Step 2: Guidelines

#### Brief (Required)

- **Length**: Keep under 150 characters
- **Language**: English only
- **Content**: One-line description that helps AI understand when to use this tool
- **Purpose**: Used in intent recognition and always included in System Prompt

Example:

```typescript
brief: 'Edit the current document with incremental diff editing. Supports insert, replace, delete operations based on position or text search.'
```

#### FullSpec (Required)

- **Language**: English only
- **Content**: Complete tool documentation including:
  - Description
  - Usage scenarios
  - Input/output formats
  - Examples
  - Important notes
- **Purpose**: Injected into context only when the tool is identified by intent recognition

### Step 3: Backward Compatibility

- Keep the existing `instruction` field for backward compatibility
- The system will use `spec.fullSpec` if available, otherwise fall back to `instruction`
- If neither exists, it will use `description` as brief

## Migration Checklist

For each tool, you need to:

- [ ] Add `spec` field with `name`, `brief`, and `fullSpec`
- [ ] Ensure `brief` is concise (under 150 chars) and in English
- [ ] Ensure `fullSpec` is complete and in English
- [ ] Keep existing `instruction` field for backward compatibility
- [ ] Test that the tool works correctly with intent recognition

## Example: Edit Tool

See `edit-tool.ts` for a complete example of how to add spec to a tool.

## Tools That Need Migration

All tools in `meta-doc/src/renderer/src/utils/agent-tools/` need to be migrated:

- [x] edit-tool.ts (Example completed)
- [ ] chart-generation-tool.ts
- [ ] todolist-tool.ts
- [ ] calculation-tool.ts
- [ ] color-tool.ts
- [ ] timestamp-tool.ts
- [ ] terminal-tool.ts
- [ ] web-crawler-tool.ts
- [ ] data-analysis-tool.ts
- [ ] outline-tree-tool.ts
- [ ] diff-tool.ts
- [ ] grep-tool.ts
- [ ] proofread-tool.ts
- [ ] outline-optimize-tool.ts
- [ ] metadata-tool.ts
- [ ] title-format-tool.ts
- [ ] rag-tool.ts

## Notes

- The `brief` field is critical for intent recognition accuracy
- The `fullSpec` should be comprehensive but not excessively verbose
- All spec content should be in English for consistency
- The system automatically handles the lifecycle of `activeToolSpecs`
