# AI Task and Streaming — Reference

## createAiTask (ai_tasks.ts)

**File**: `src/renderer/src/utils/ai_tasks.ts`

- **Parameters**:

  - `name`: Shown in the task queue; often `t('some.key')`.
  - `prompt`: Single string (answer-style) or `AIDialogMessage[]` (chat-style). For chat, use `[{ role: 'user', content: prompt }]`.
  - `target`: `Ref<string>`. The task runner writes streamed chunks (or final text) into `target.value`. Must be a Vue ref.
  - `type`: `ai_types.answer` (single prompt string), `ai_types.chat` (messages array), or `ai_types.tool` (tool call).
  - `origin_key`: String. If a task with the same `origin_key` already exists, it is cancelled before the new one is created.
  - `meta`: Optional. `{ stream?: boolean }` (default `true`). Can include `customLlmConfig` for per-task LLM config.

- **Return**: `{ handle: string; done: Promise<any> }`. Resolve = success; reject = error or user cancel. Use `handle` with `cancelAiTask(handle)` if you need to cancel from code.

- **Behavior**: Task is auto-started. In the main window it runs locally; in child windows it is registered and started via IPC. Streamed output is written to `target.value` when `meta.stream === true`.

## StreamingContentDisplay

**File**: `src/renderer/src/components/common/StreamingContentDisplay.vue`

- **contentRef**: Must be a ref-like object with `.value` (string). Typically a Vue `ref<string>` or a computed that returns a ref. The component shows `contentRef.value` in a `<pre>` and updates as it changes.

- **done**: When `true` or when the Promise resolves, the component marks the stream as finished (e.g. hides or transitions). When the Promise rejects (e.g. cancel), it is still treated as “done” and current content is kept.

- **Display rule**: The component is shown only while there is content and the stream is not yet done (`!isDone && content.trim().length > 0`). Use a computed like `isStreaming = donePromiseRef != null` to control `v-if` so the block is visible during the task.

- **Wrapper pattern**: If passing a ref from setup into the template, use a computed that returns the ref so the template receives a stable ref-like object: `const contentRefWrapper = computed(() => myStreamingRef)` and `:content-ref="contentRefWrapper"`.

## Prompts and i18n

**prompts.ts**:

- `getCurrentLocale()`: Returns current locale string (e.g. `zh_CN`).
- `getCurrentLocalePrompts()`: Returns the cached prompts object for the current locale; has `prompts` (and optionally `suggestionPresets`, `presets`). Synchronous; may be empty until locale JSON is loaded.
- `getPromptTemplate(key, replacements)`: Internal; gets `prompts[key]` and replaces `{key}` with `replacements[key]`. Used by exported prompt builders.
- Exported functions (e.g. `generateTitlePrompt`, `sectionChangePrompt`, `generateAttachmentAnalysisPrompt`) should call `getPromptTemplate` with the right key and replacements, and fall back to a default string if the template is missing.

**locale_prompts/**:

- Files: `zh_CN.json`, `en_US.json`, etc. Loaded asynchronously; cached in `promptsMapCache`.
- Structure: Optional top-level `prompts` object. Keys are prompt IDs; values are strings with `{placeholder}` or nested objects (e.g. `sectionChangePrompt` with `base`, `mode0`, etc.). Other keys like `suggestionPresets` and `presets` are for UI presets, not necessarily used by `getPromptTemplate`.

## Example reference locations

| Pattern                                                    | Where to look                                                                                                                                   |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| createAiTask only (no in-page streaming)                   | SectionOptimizer.vue `generate()`, TitleMenu.vue                                                                                                |
| createAiTask + StreamingContentDisplay (same view)         | AttachmentWindow.vue `handleAiAnalysis`, streaming refs and template                                                                            |
| createAiTask in a tool, view wires StreamingContentDisplay | data-analysis-tool.ts `createAiTask` and return `{ targetRef, donePromise }`; DataAnalysisWindow.vue `onProgress` and `StreamingContentDisplay` |
| Prompts + i18n                                             | prompts.ts (e.g. `generateTitlePrompt`, `sectionChangePrompt`); locale_prompts/zh_CN.json `prompts`                                             |
| Cancel task                                                | `cancelAiTask(handle)` from `ai_tasks.ts`; use the `handle` returned by `createAiTask`                                                          |

## Cross-window behavior

When the calling code runs in a **child window** (e.g. attachment or data-analysis tab), `createAiTask` registers the task with the main window via `messageBridge.send('register-ai-task', ...)`. The main window runs the LLM and streams into the same logical task; the `target` ref and `done` promise in the child are still updated. For in-page streaming in the child, the same pattern applies: pass the task’s `target` (or a synced ref) and `done` to `StreamingContentDisplay`.
