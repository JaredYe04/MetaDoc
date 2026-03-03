/**
 * Mock tool execution for CLI testing. Logs to stderr and returns a stub result
 * so the agent can continue (useful for debugging tool_call format and multi-turn).
 */
export function runMockTool(toolId, parameters, opts = {}) {
  const verbose = opts.verbose !== false
  if (verbose && process.stderr) {
    process.stderr.write(`[agent-cli] Tool: ${toolId}\n`)
    process.stderr.write(`[agent-cli] Arguments: ${JSON.stringify(parameters, null, 2)}\n`)
  }
  switch (toolId) {
    case 'outline-tree':
      return { outlineTree: { title: 'Mock outline', title_level: 1, path: '1', text: '', children: [] }, format: 'md' }
    case 'grep':
      return { matches: [], total: 0 }
    case 'workspace':
      return { contents: [], error: null }
    case 'edit':
      return { appliedEdits: 1, failedEdits: 0 }
    case 'tool-spec-fetcher':
      return { toolId: parameters?.toolId || '', fullSpec: '(mock fullSpec)' }
    case 'diff':
      return { summary: { insertions: 0, deletions: 0 }, chunks: [] }
    case 'terminal-execution':
      return { exitCode: 0, stdout: '(mock)', stderr: '' }
    case 'chart-generation':
      return { imageUrl: '(mock chart url)' }
    case 'outline-optimize':
      return { stage: 'completed', operation: parameters?.operation || '' }
    default:
      return { ok: true, message: `Mock result for ${toolId}` }
  }
}
