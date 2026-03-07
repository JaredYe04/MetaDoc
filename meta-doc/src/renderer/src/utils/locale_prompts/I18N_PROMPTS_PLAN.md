# Agent 与 AI 提示词 i18n 现状与自动化规划

本文说明当前 Agent 系统及所有涉及 AI 的提示词分布、逻辑，以及如何规划 i18n 自动化（缺键/缺项检测、翻译、占位符保护）。

---

## 一、当前提示词分布与逻辑

### 1.1 `locale_prompts/`（按语言分文件的 JSON）

**路径**：`renderer/src/utils/locale_prompts/`  
**文件**：`zh_CN.json`、`en_US.json`、`ja_JP.json`、`ko_KR.json`、`de_DE.json`、`fr_FR.json`

**结构**（以 zh_CN 为最全蓝本）：

| 顶层键 | 含义 | 使用方式 |
|--------|------|----------|
| `suggestionPresets` | 快捷建议（菜谱、旅行计划等） | 数组，每项 `{ "label", "prompt" }`，UI 展示与发给 LLM 的快捷入口 |
| `presets` | 简单预设句子 | 数组，每项 `{ "value" }`，如「我想生成一篇…」 |
| `prompts` | 发给 LLM 的提示词模板 | 对象，多级键（如 `sectionChangePrompt.mode1_empty`），值多为带占位符的字符串：`{treeJson}`、`{userPrompt}`、`{title}` 等 |

**加载与使用**：

- `utils/prompts.ts`：`loadPromptsMap()` 动态 import 各语言 JSON，`getCurrentLocalePrompts()` 按当前 locale 返回该语言的整份配置。
- 具体模板：`getPromptTemplate(key, replacements)` 从 `prompts.prompts[key]` 取字符串，再替换 `replacements` 中的占位符；若取不到则用代码内 fallback（中文）。
- 使用方：`metadata-tool`、文档生成/编辑、补全、图表、数据分析等，通过 `getPromptTemplate(...)` 或导出的 `generateTitlePrompt` 等函数间接使用。

**i18n 现状**：

- zh_CN 结构最全；en_US 等可能有空数组（`suggestionPresets: []`）、或 `prompts` 下缺键。
- 旧脚本 `locales/i18n_check.py` 第二步会以 zh_CN 为基准对比 **locale_prompts** 的键并机翻补全，但质量一般，且与现有「locales 查缺 + Agent 翻译 / AI 校对」流程未统一。

---

### 1.2 `agent-config-manager.ts`（Agent 配置与系统提示）

**路径**：`renderer/src/utils/agent-framework/agent-config-manager.ts`

**内容**：

- **默认 Agent 配置**（主 Agent）：创建时写入 `name`、`description`（均为 `LocalizedText`，含 zh_cn / en_us）、以及 `llmConfig.systemPrompt`。
- **systemPrompt**：超长中文字符串（约 238–420 行、456–630 行两处），内联在 TS 中，描述工作方式、Subagent 用法、工具使用规则、常见错误等。**未做 i18n**，仅中文。
- **Subagent** 的 name/description 在 `subagent-presets.ts` 中用 `LocalizedText` 写死 zh_cn + en_us。

**使用**：

- `ai-context-manager.ts` 的 `buildSystemPrompt()` 会拼接：`agentConfig.llmConfig.systemPrompt` + 时间/环境/文档格式等动态块。当前界面语言切换不会替换这段 systemPrompt。

---

### 1.3 `subagent-presets.ts`（Subagent 预设）

**路径**：`renderer/src/utils/agent-framework/subagent-presets.ts`

**内容**：

- 三个 Subagent 的 name/description：`loc('Subagent：工作区读取', 'Subagent: Workspace Reader')` 等，即 **LocalizedText**（zh_cn + en_us）。
- 三个 **systemPrompt** 常量：`sysPromptWorkspaceReader`、`sysPromptDocWriter`、`sysPromptSearch`，纯中文，**未 i18n**。
- 通过 `agentConfigManager.getOrCreateConfig(..., { systemPrompt: sysPromptXxx })` 注入。

---

### 1.4 `agent-tools/`（工具名、描述与内部 prompt）

**类型**：`types/agent-tool.ts` 中 `LocalizedText` = `string | ToolLocales`，`ToolLocales` 为 `{ [locale]: { name?, description?, instruction? } }`。

**工具注册**：

- 各 tool 在注册时提供 **name / description / instruction** 的 `LocalizedText`（多语言对象），运行时由 `i18n-helper.ts` 的 `getLocalizedText()` 按当前 locale 取 name 或 description 显示。
- 部分工具内部还有**发给 LLM 的长字符串**（systemPrompt / user prompt），目前多为中文硬编码：
  - **chart-generation-tool**：`你是一个专业的图表代码生成助手...` 等。
  - **todolist-tool**：`你是一个专业的任务规划助手...`。
  - **metadata-tool**：通过 `generateTitlePrompt` 等从 **locale_prompts** 取模板，已随 locale 切换。
  - **data-analysis-tool**、**terminal-tool** 等：内部拼接的 prompt 若为中文，也未单独 i18n。

**i18n 现状**：

- 工具的「名称/描述」已支持多语言（LocalizedText）。
- 工具**内部**的 systemPrompt / 长 prompt 未统一 i18n，多数仍为中文。

---

## 二、i18n 缺口汇总

| 资源 | 已 i18n | 未 i18n / 需统一 |
|------|---------|------------------|
| locale_prompts/*.json | 多语言文件存在，部分键/项缺失 | 以 zh_CN 为蓝本的缺键/缺项检测与高质量翻译流程未与 locales 流程统一；占位符需保护 |
| Agent 默认 systemPrompt | — | 完全内联在 TS，仅中文 |
| Subagent systemPrompt | — | 三段常量，仅中文 |
| 工具 name/description | LocalizedText 多语言 | 部分工具仅 zh_cn+en_us，可扩展语种 |
| 工具内部 prompt | — | chart-generation、todolist 等硬编码中文 |

---

## 三、i18n 自动化规划建议

### 3.1 原则

1. **蓝本统一**：与 locales、manuals 一致，以 **zh_CN（或 zh_cn）为唯一蓝本**，其他语言在键/结构/项上与其对齐。
2. **占位符与格式不动**：翻译时保留 `{treeJson}`、`{userPrompt}`、`[CURRENT_POS]`、代码块、Markdown 结构等，只译自然语言。
3. **能复用则复用**：缺键检测、AI 翻译/校对、进度与写回逻辑，尽量与现有 `i18n_report_missing.py`、`i18n_ai_review.py`、`manual_i18n_translate.py` 的思路一致，便于维护。

---

### 3.2 locale_prompts 自动化（优先）

**目标**：各语言 JSON 与 zh_CN 键一致；`suggestionPresets` / `presets` 项数一致且每项字段齐全；缺失键或缺失项由脚本检测并支持 AI 翻译补全。

**建议步骤**：

1. **缺键/缺项报告脚本**（如 `locale_prompts_report_missing.py`，放在 `utils/locale_prompts/` 或 `locales/`）  
   - 递归对比 zh_CN.json 与各语言 JSON：  
     - 对 `prompts` 做扁平化键路径对比（与 locales 类似），列出缺失键。  
     - 对 `suggestionPresets`、`presets`：以 zh_CN 的数组长度为基准，按索引或稳定 id（若有）对齐，列出「某语言缺第 i 项」或「某语言某项的 label/prompt/value 缺失」。  
   - 输出：每个语言缺失的键路径或「数组路径 + 索引 + 字段」，并打印 zh_CN 对应原文，便于 Agent/AI 补翻。

2. **翻译与写回**  
   - **方案 A**：由 Agent 根据报告结果，按「中文 → 目标语言」逐条翻译并编辑对应 JSON（可写小脚本按路径写回，避免手改）。  
   - **方案 B**：做类似 `i18n_ai_review.py` 的「按块送 AI」脚本：将 locale_prompts 按模块（如 `prompts` 一坨、`suggestionPresets` 一坨）或按语言分块，调用 DeepSeek 翻译，**严格保护占位符与代码块**，输出「键路径 + 新值」或「索引 + 新对象」，再解析写回。  
   - 占位符保护可参考旧版 `i18n_check.py` 的 `protect_placeholders` / `restore_placeholders`（`{xxx}`、``` 代码块、`[CURRENT_POS]` 等），或与 manual_i18n 的 prompt 约定一致。

3. **进度与增量**（可选）  
   - 若采用 AI 脚本，可增加进度文件（如 `.locale_prompts_progress.txt`），记录「语言 | 模块/路径」，支持断点续跑与「只处理缺失」。

4. **与现有流程衔接**  
   - 在 `I18N_WORKFLOW.md` 中增加「locale_prompts 补全与翻译」一节：先跑报告脚本 → Agent 或 AI 脚本补翻 → 再跑报告直到无缺失。

---

### 3.3 Agent / Subagent systemPrompt 的 i18n（中期）

**目标**：主 Agent 与三个 Subagent 的 systemPrompt 能随界面语言切换，且可纳入统一翻译与审校流程。

**建议步骤**：

1. **外置资源**  
   - 将主 Agent 与三个 Subagent 的 systemPrompt 从 TS 抽离到**外部 JSON**（与 locale_prompts 同目录或单独 `agent_prompts/`），按键组织，例如：  
     - `agent_prompts/zh_CN.json`：`{ "defaultAgent.systemPrompt": "...", "subagent.workspaceReader.systemPrompt": "...", ... }`  
     - 或直接并入各语言的 `locale_prompts/xx.json`，如 `prompts.agent.default.systemPrompt`。  
   - 运行时：在 `agent-config-manager` 或 `ai-context-manager` 中，根据当前 locale 读取对应语言的 systemPrompt 字符串，若缺失则回退到 zh_CN 或 en_US。

2. **代码改动**  
   - `agent-config-manager.ts`：创建/更新默认配置时，不再写死超长字符串，改为从上述 JSON 按 key 读取（或初始化时注入已按 locale 解析好的字符串）。  
   - `subagent-presets.ts`：三个 systemPrompt 改为从同一资源按 key 读取。

3. **自动化**  
   - 一旦 systemPrompt 进入 JSON，即可与 locale_prompts 共用「缺键报告 + AI 翻译」流程；若单独文件，可单独做一份「agent_prompts 缺键 + 翻译」脚本，逻辑与 locale_prompts 一致。

---

### 3.4 工具内部 prompt 的 i18n（可选）

**目标**：chart-generation、todolist 等工具内部发给 LLM 的 systemPrompt 随 locale 变化。

**建议步骤**：

1. **集中到 locale_prompts 或 tool_prompts**  
   - 为每个工具定义键，如 `prompts.chartGeneration.systemPrompt`、`prompts.todolist.systemPrompt`，在各语言 JSON 中提供多语言版本。  
   - 工具执行时通过 `getPromptTemplate(key)` 或专用 `getToolPrompt(toolId, key)` 按当前 locale 取模板。

2. **自动化**  
   - 与 locale_prompts 同一套键对比与翻译流程；新增键时在 zh_CN 先加，再跑报告与补翻。

---

## 四、实施顺序建议

1. **短期**：做 **locale_prompts 缺键/缺项报告脚本**，并接入现有「查缺 → Agent 或 AI 补翻」流程；在 `I18N_WORKFLOW.md` 中写明步骤。  
2. **中期**：将 **Agent / Subagent systemPrompt** 迁到 JSON，并按 locale 加载；再纳入报告与翻译流程。  
3. **可选**：工具内部 prompt 迁到 locale_prompts 或 tool_prompts，统一键与翻译流程。

---

## 五、与现有脚本的对应关系

| 现有脚本/资源 | 对应关系 |
|---------------|----------|
| `locales/i18n_report_missing.py` | 思路可复用到 locale_prompts：以 zh_CN 为蓝本，递归对比键/结构，输出缺失与中文原文。 |
| `locales/i18n_ai_review.py` | 若对 locale_prompts 做「按块 AI 翻译」，可参考其并发、写回、进度、占位符保护（提示词中明确不译 `{xxx}`、代码块等）。 |
| `manuals/manual_i18n_translate.py` | 提示词中「不破坏占位符与组件」的约定，同样适用于 prompt 模板翻译。 |
| `locales/i18n_check.py` 第二步 | 已有 locale_prompts 键级对比与机翻，可保留为可选，与「报告 + Agent/AI 高质量翻译」双轨并存。 |

---

以上为当前 Agent 与 AI 提示词的结构梳理与 i18n 自动化规划；实施时可按「先报告、再补翻、最后外置 Agent prompt」的顺序迭代。
