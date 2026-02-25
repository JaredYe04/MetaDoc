---
name: ai-task-streaming
description: Integrates AI content generation with streaming output using createAiTask, StreamingContentDisplay, and centralized prompts. Use when adding or modifying features that call the LLM for content output, stream results in the UI, or manage prompt templates and i18n.
---

# AI Task and Streaming Output

This skill documents how the app invokes AI for content output, shows streamed results in the UI, and manages prompts. Follow this flow for any new or changed AI-backed feature.

## When to Use

- Adding a new feature that calls the LLM for generated content
- Showing AI output in real time (streaming) in a Vue view
- Defining or changing prompt text and i18n for prompts

## Core Flow

1. **Prompts**: Define prompt logic in `src/renderer/src/utils/prompts.ts`; use i18n templates from `src/renderer/src/utils/locale_prompts/`.
2. **Task**: Call `createAiTask(name, prompt, targetRef, type, origin_key, meta)` from `src/renderer/src/utils/ai_tasks.ts`.
3. **Streaming UI** (optional): Bind the task’s `target` ref and `done` promise to `StreamingContentDisplay` so the user sees output as it streams.

---

## 1. createAiTask

**Import**: `import { createAiTask, ai_types } from '../utils/ai_tasks'`

**Signature**:

```ts
createAiTask(
  name: string,                    // Display name for the task (e.g. t('attachment.analyzing'))
  prompt: string | AIDialogMessage[],
  target: Ref<string>,             // Receives streamed output; written by the task runner
  type: AITaskType,                // ai_types.answer | ai_types.chat | ai_types.tool
  origin_key: string,              // Unique key; same key cancels previous task
  meta?: { stream?: boolean }      // Default { stream: true }
): { handle: string; done: Promise<any> }
```

**Rules**:

- Use a **ref** for `target`; the task runner updates `target.value` as the stream arrives.
- Prefer `ai_types.chat` for dialog-style calls; use `AIDialogMessage[]` for `prompt`.
- Pass `{ stream: true }` (or omit `meta`) when you want streaming; the default is streaming.
- Use a stable, unique `origin_key` per feature (e.g. `'title-menu'`, `'section-optimizer'`, or `attachment-analysis-${id}`) so duplicate triggers cancel the previous task.

**Minimal example (no in-page streaming UI)**:

```ts
const generatedText = ref('')
const messages: AIDialogMessage[] = [{ role: 'user', content: prompt }]
const { done } = createAiTask(
  props.title,
  messages,
  generatedText,
  ai_types.chat,
  'title-menu'
)
generating.value = true
try {
  await done
} finally {
  generated.value = true
  generating.value = false
}
// Use generatedText.value after done
```

**With streaming (target is written as the model streams)**:

```ts
const target = ref('')
const { done } = createAiTask(
  t('attachment.analyzing'),
  messages,
  target,
  'chat',
  originKey,
  { stream: true }
)
await done
// target.value now holds full response
```

---

## 2. StreamingContentDisplay (in-page streaming)

Use when the view should show streamed text **in place** (e.g. attachment analysis, data report) instead of only in the task queue.

**Component**: `src/renderer/src/components/common/StreamingContentDisplay.vue`

**Props**:

| Prop        | Type                    | Description                          |
|------------|--------------------------|--------------------------------------|
| `contentRef` | `Ref<string>` or `{ value: string }` | Ref that receives streamed content   |
| `done`       | `Promise<any> \| boolean \| null`   | Task completion (Promise or boolean) |
| `style`      | `Record<string, string>` (optional)  | Container styles                     |

**Behavior**: Renders `contentRef.value` in a scrollable pre; when `done` resolves (or is true), it marks finished (e.g. hides or transitions). Rejected/cancelled `done` is treated as done so current content is kept.

**Usage pattern**:

1. Create a ref for the **display** (what the user sees) and a ref for the **done** promise.
2. Call `createAiTask` with a **local** `target` ref and `{ stream: true }`.
3. Set `displayRef = ''`, `donePromiseRef = done`.
4. **Sync** `target` → `displayRef` with a `watch(target, v => displayRef.value = v, { immediate: true })`.
5. In template: `<StreamingContentDisplay :content-ref="displayRefWrapper" :done="doneValue" />` (use computed wrappers if needed for reactivity).
6. After `await done`, stop the watcher, copy `target.value` to final storage, set `donePromiseRef = null`.

**Example (AttachmentWindow-style)**:

```ts
// Refs for streaming UI
const aiAnalysisStreamingRef = ref('')
const aiAnalysisDonePromise = ref<Promise<any> | null>(null)
const aiAnalysisDoneValue = computed(() => aiAnalysisDonePromise.value ?? undefined)
const aiAnalysisStreamingRefWrapper = computed(() => aiAnalysisStreamingRef)

const handleAiAnalysis = async () => {
  const target = ref('')
  const { done } = createAiTask(
    t('attachment.analyzing'),
    messages,
    target,
    'chat',
    originKey,
    { stream: true }
  )
  aiAnalysisStreamingRef.value = ''
  aiAnalysisDonePromise.value = done

  const stopWatch = watch(
    () => target.value,
    (v) => { aiAnalysisStreamingRef.value = v },
    { immediate: true }
  )
  try {
    await done
  } finally {
    stopWatch()
    aiAnalysisDonePromise.value = null
    aiAnalysis.value = target.value
  }
}
```

```vue
<StreamingContentDisplay
  v-if="isAnalyzingStreaming"
  :content-ref="aiAnalysisStreamingRefWrapper"
  :done="aiAnalysisDoneValue"
/>
```

When the task is created in a **separate module** (e.g. agent-tool), that module returns `{ targetRef, donePromise }`; the view then assigns them to local refs and syncs `targetRef` → display ref with a watcher (see DataAnalysisWindow + dataAnalysisToolCallback).

---

## 3. Prompt management

**Central logic**: `src/renderer/src/utils/prompts.ts`

- Export **functions** that return prompt strings (e.g. `generateTitlePrompt`, `sectionChangePrompt`, `generateAttachmentAnalysisPrompt`).
- For i18n, use **getPromptTemplate(key, replacements)** inside those functions:
  - Reads `getCurrentLocalePrompts().prompts[key]`.
  - Replaces `{placeholder}` with values from `replacements`.
- Provide a **fallback** string in code when the locale JSON has no template for that key.

**i18n prompts**: `src/renderer/src/utils/locale_prompts/`

- One JSON per locale: `zh_CN.json`, `en_US.json`, etc.
- Each file can have a top-level **`prompts`** object: keys are prompt IDs, values are template strings with `{placeholder}`.
- Complex prompts (e.g. sectionChangePrompt) can be nested objects in JSON; the code in `prompts.ts` then assembles the final string from those parts.

**Adding a new prompt**:

1. Add the template to each locale file under `prompts` (e.g. `"myFeaturePrompt": "You are... {input}..."`).
2. In `prompts.ts`, add a function that calls `getPromptTemplate('myFeaturePrompt', { input: ... })` and returns the result, with an inline fallback if the template is missing.

---

## Checklist for new AI-backed features

- [ ] Prompt built in `prompts.ts` (and keys in `locale_prompts/*.json` if i18n needed).
- [ ] `createAiTask` called with a ref as `target`, correct `type`, unique `origin_key`, and `meta.stream` set as intended.
- [ ] If the view must show streaming text in place: use `StreamingContentDisplay` with a display ref and `done`, and sync task `target` → display ref (and clean up watcher when done).
- [ ] Handle `done` (await, then set final state; on cancel, keep or clear content as desired).
- [ ] Do not bypass `createAiTask` for normal LLM content output; use it so tasks appear in the queue and streaming/cancel behave consistently.

For full API details and edge cases, see [reference.md](reference.md).
