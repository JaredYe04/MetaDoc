/**
 * Run one agent turn: send messages to LLM, parse tool calls, run mock tools, loop until no tools.
 */
import { callChat } from './call-llm.mjs'
import { parseToolCalls, stripToolCallsFromContent } from './parse-tool-calls.mjs'
import { runMockTool } from './mock-tools.mjs'
import { buildToolCallPrompt } from './build-tool-prompt.mjs'

const MAX_TOOL_ITERATIONS = 10

const TOOL_PROMPT_MARKER = '=== Tool Calling Specification ==='

export async function runTurn(config, messages, systemSuffix, opts = {}) {
  const toolPrompt = buildToolCallPrompt()
  const existingSystem = messages[0]?.role === 'system' ? messages[0].content : ''
  const alreadyHasToolPrompt = existingSystem.includes(TOOL_PROMPT_MARKER)
  const systemContent = existingSystem + (systemSuffix || '') + (alreadyHasToolPrompt ? '' : toolPrompt)
  const msgs = [...messages]
  if (msgs[0]?.role === 'system') msgs[0] = { role: 'system', content: systemContent }
  else msgs.unshift({ role: 'system', content: systemContent })

  let iterations = 0
  let lastContent = ''

  while (iterations < MAX_TOOL_ITERATIONS) {
    iterations++
    lastContent = await callChat(config, msgs, { signal: opts.signal })
    const toolCalls = parseToolCalls(lastContent)

    if (!toolCalls || toolCalls.length === 0) {
      return { content: stripToolCallsFromContent(lastContent), messages: msgs }
    }

    if (opts.onToolCalls) opts.onToolCalls(toolCalls)

    msgs.push({ role: 'assistant', content: lastContent })

    for (const tc of toolCalls) {
      const result = runMockTool(tc.tool_id, tc.parameters, opts)
      const toolMessage = `Tool ${tc.tool_id} result:\n${JSON.stringify(result)}`
      msgs.push({ role: 'user', content: toolMessage })
    }
  }

  return { content: stripToolCallsFromContent(lastContent), messages: msgs }
}
