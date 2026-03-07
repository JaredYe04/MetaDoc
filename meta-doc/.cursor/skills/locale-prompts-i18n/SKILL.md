---
name: locale-prompts-i18n
description: Manages AI/agent prompts in locale_prompts JSON and automates i18n (report missing keys, AI review/translate). Use when editing agent or tool prompts, adding locale_prompts keys, or running locale_prompts i18n scripts.
---

# Locale Prompts & i18n

## Where prompts live

All AI-related prompts in the app are driven from **locale_prompts** JSON files under `src/renderer/src/utils/locale_prompts/`:

- **zh_CN.json** is the blueprint (source of truth for keys and Chinese text).
- Other locales: **en_US.json**, **ja_JP.json**, **ko_KR.json**, **de_DE.json**, **fr_FR.json** must align keys; missing keys fall back to zh_CN at runtime via `getPromptByKey()` in `utils/prompts.ts`.

Each file has:

- **prompts**: Nested object of prompt keys. Includes: agent/subagent system prompts (`agent.default.systemPrompt`, `agent.subagent.*`), tool prompts (`tools.chartGeneration.*`, `tools.todolist.*`), document/outline/editor prompts (`generateTitlePrompt`, `sectionChangePrompt.*`, `suggestionCompletionPrompt.*`, `outlineConversionPrompt`, `dataAnalysisReportPrompt`, `attachmentAnalysisPrompt`, `latexCompileErrorAnalysisPrompt`, etc.), chat default (`chat.documentSystemPrompt`), and agent-engine prompts (`agent.intentRecognition.prompt`, `agent.toolCallSpec.prompt`, `agent.reactPrompt`, `agent.planPrompt`). These are the only keys processed by the i18n script.
- **suggestionPresets** / **presets**: Arrays; not auto-translated by the script (can be extended later).

## Runtime

- **Resolving prompts**: `getPromptByKey(key, replacements)` in `utils/prompts.ts` reads the current locale’s `prompts[key]`, falls back to zh_CN if missing/empty, then applies `replacements` (e.g. `{chartType}`, `{input}`).
- **Agent/subagent**: `llmConfig.systemPromptKey` (e.g. `agent.default.systemPrompt`) is resolved in `ai-context-manager.ts` via `getPromptByKey(systemPromptKey)`.
- **Tools**: Chart and todolist tools call `getPromptByKey('tools.chartGeneration.systemPrompt', {...})` and `getPromptByKey('tools.todolist.systemPrompt', {...})` respectively.

## Adding or changing prompts

1. Add or edit keys under **zh_CN.json** → **prompts** (nested keys like `tools.chartGeneration.rules.echarts`).
2. In code, use `getPromptByKey('your.key', { placeholder: value })`; do not hardcode long prompt strings.
3. Run the locale_prompts i18n script to report missing keys and fill other locales (see below).

## i18n script (locale_prompts)

Script: **locale_prompts/locale_prompts_i18n_review.py**

- **Blueprint**: zh_CN.json **prompts** object only (flattened by dot path).
- **Report**: For each locale file, reports missing prompt keys vs zh_CN.
- **AI review/translate**: Uses DeepSeek (same pattern as `locales/i18n_ai_review.py`): per-module chunks, strict placeholder preservation (`{...}`, `[...]`, code blocks), output format `key\tvalue`, write-after-each, progress file.
- **Progress file**: `.locale_prompts_i18n_progress.txt` in `locale_prompts/`; format `locale_file\tmodule_name` or `locale_file\tmodule_name\tsource_hash`. Use `--record-hashes` to record zh_CN module hashes so script can re-run only when blueprint changes.

**Usage:**

```bash
cd meta-doc/src/renderer/src/utils/locale_prompts
python locale_prompts_i18n_review.py                    # all locales, all modules
python locale_prompts_i18n_review.py --locale en_US     # only en_US
python locale_prompts_i18n_review.py --module agent     # only agent.* modules
python locale_prompts_i18n_review.py --dry-run         # print tasks only
python locale_prompts_i18n_review.py --reset-progress   # clear progress and re-run all
python locale_prompts_i18n_review.py --record-hashes    # write/update hashes in progress file
```

**API key**: Same as locales script: `.deepseek_api_key` or `.deepseek_api_key.txt` in the script directory, or env `DEEPSEEK_API_KEY`.

## Checklist when touching prompts

- [ ] New/edited prompt text is in **zh_CN.json** → **prompts** (correct key path).
- [ ] Code uses **getPromptByKey(key, replacements)**; no long inline prompt strings.
- [ ] Placeholders in JSON (e.g. `{chartType}`, `{input}`) are preserved in translations; script enforces this.
- [ ] After changing zh_CN prompts, run i18n script (optionally `--record-hashes` then re-run) to update other locales.
