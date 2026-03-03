/**
 * Build tool-calling prompt to match MetaDoc agent-engine-executor format.
 * Minimal tool list for CLI testing (same IDs and briefs as app).
 */
const TOOLS = [
  {
    id: 'edit',
    name: 'Document Edit',
    brief:
      'Edit document with git-style diff (-/+ lines); also supports operations (find-replace, position-based).',
    schema: { diff: 'string', filePath: 'string', operations: 'array' }
  },
  {
    id: 'outline-tree',
    name: 'Outline Tree',
    brief:
      'Get outline tree of a document. Only .md and .tex. Supports filePath or tabId/current tab.',
    schema: { filePath: 'string', includeText: 'boolean', tabId: 'string' }
  },
  {
    id: 'outline-optimize',
    name: 'Outline Optimization',
    brief: 'Generate/optimize outline with AI. Only .md and .tex.',
    schema: { operation: 'string', nodePath: 'string', tabId: 'string' }
  },
  {
    id: 'grep',
    name: 'Text Search (Grep)',
    brief: 'Search text in workspace or current document.',
    schema: { pattern: 'string', filePath: 'string' }
  },
  {
    id: 'workspace',
    name: 'Workspace',
    brief: 'Read files from workspace folders.',
    schema: { paths: 'array', workspaceFolder: 'string' }
  },
  {
    id: 'terminal-execution',
    name: 'Terminal Execution',
    brief: 'Execute terminal commands. Prefer edit tool for file content.',
    schema: { command: 'string', cwd: 'string' }
  },
  {
    id: 'chart-generation',
    name: 'Chart Generation',
    brief: 'Generate charts (Mermaid, ECharts, etc.).',
    schema: { prompt: 'string', type: 'string' }
  },
  {
    id: 'diff',
    name: 'Diff',
    brief: 'Compare two texts or files.',
    schema: { content1: 'string', content2: 'string' }
  },
  {
    id: 'tool-spec-fetcher',
    name: 'Tool Spec Fetcher',
    brief: 'Fetch fullSpec of tools by id.',
    schema: { toolId: 'string' }
  }
]

export function buildToolCallPrompt() {
  let prompt = '\n\n=== Tool Calling Specification ===\n'
  prompt +=
    'You can call tools to complete various tasks. All tool calls must use a unified marker format.\n\n'
  prompt += '## Tool Call Format\n'
  prompt += 'When you need to call a tool, you must use the following marker format:\n'
  prompt += '```\n'
  prompt += '<tool_call>\n'
  prompt += '{"name": "tool_id", "arguments": {"param1": "value1", "param2": "value2"}}\n'
  prompt += '</tool_call>\n'
  prompt += '```\n\n'
  prompt += '## Important Rules\n'
  prompt +=
    '1. **Must use marker format**: Tool calls must use `<tool_call></tool_call>` marker format\n'
  prompt +=
    '2. **Markers must be complete**: Must include both opening `<tool_call>` and closing `</tool_call>` markers\n'
  prompt +=
    '3. **Tool ID must be accurate**: Use the exact ID from the tool list as the `name` field value\n'
  prompt +=
    '4. **Arguments must be JSON object**: The `arguments` field must be a valid JSON object\n'
  prompt +=
    '5. **Can call multiple tools**: You can use multiple `<tool_call></tool_call>` blocks\n'
  prompt += '6. **Do not mix text in markers**: Marker blocks should be independent\n'
  prompt +=
    '7. **Confirm requirements before calling**: Select the most appropriate tool and ensure parameters are correct\n\n'
  prompt += '## Tool Call Examples\n'
  prompt +=
    '<tool_call>\n{"name": "outline-tree", "arguments": {"includeText": true}}\n</tool_call>\n\n'
  prompt +=
    '<tool_call>\n{"name": "edit", "arguments": {"diff": "@@ -1,1 +1,1 @@\\n-old\\n+new"}}\n</tool_call>\n\n'
  prompt += '=== Available Tools List ===\n'
  for (const tool of TOOLS) {
    prompt += `\n**${tool.name}** (ID: \`${tool.id}\`)\n`
    prompt += `${tool.brief}\n`
    prompt += `\nParameters: ${JSON.stringify(tool.schema)}\n`
  }
  prompt += '\n\n## Notes When Calling Tools\n'
  prompt += "- Read each tool's instructions and parameter requirements carefully\n"
  prompt += '- Ensure parameter types are correct (string, number, boolean, object, array)\n'
  prompt += '- If no tools are needed, reply with text directly, do not include tool call markers\n'
  return prompt
}

export function getToolIds() {
  return TOOLS.map((t) => t.id)
}
