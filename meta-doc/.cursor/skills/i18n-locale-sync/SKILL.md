---
name: i18n-locale-sync
description: Keeps MetaDoc UI locales in sync with zh_cn as the blueprint. Prefer running locales/i18n_keys.py (query/prefix/apply) instead of reading huge JSON. Use when fixing missing i18n keys, adding locale strings, or improving translation quality. Trigger: i18n, locales, i18n_keys, missing key, 翻译, 多语言, intlify Not found key.
---

# MetaDoc i18n 本地化同步与翻译

以 **zh_cn.json** 为唯一蓝本：其他语言 JSON 的键与层级必须与 zh_cn 完全一致。缺失键由 Agent 按中文语义翻译后补全，不依赖机翻脚本。

## 何时使用

- 控制台或界面报错缺失某 key（如 `proofread.noErrorsFound`）
- 新增功能后需为所有语言补充同一批键
- 希望统一走「脚本查缺 → Agent 翻译」流程，避免机翻质量差

## 一、Agent 首选：`i18n_keys.py`（不必通读大 JSON）

目录：`meta-doc/src/renderer/src/locales/`。大文件无需整篇 `Read`，用子命令按需查键、批量写入。

### 1. 查询键在各语言是否存在及当前值

```bash
python i18n_keys.py query proofread.noErrorsFound
python i18n_keys.py query a.b c.d --json
```

- 人类可读：表格形式列出每个 `*.json` 是缺失还是已有，并截断显示译文。
- **`--json`**：输出结构化 JSON，便于 Agent 直接解析（推荐 Agent 使用）。

### 2. 按前缀列出基准（zh_cn）里的键

```bash
python i18n_keys.py prefix proofread
python i18n_keys.py prefix headMenu --max 80 --json
```

- 用于确认命名空间下有哪些点路径键，避免手打路径错误。
- 命中过多时默认最多列 200 条，可用 `--max` 或 `--json`（含 `count` / `truncated`）。

### 3. 批量补充 / 修改译文（补丁 JSON）

```bash
python i18n_keys.py apply patch.json --dry-run
python i18n_keys.py apply patch.json
```

- **`--dry-run`**：只打印将发生的变更，不写文件。
- 从 stdin：Unix 下 `python i18n_keys.py apply - < patch.json`；PowerShell 下 `Get-Content patch.json -Raw | python i18n_keys.py apply -`
- **补丁格式（二选一或合并使用）**  
  - 按语言文件：
    `{ "en_us.json": { "proofread.noErrorsFound": "No errors found" } }`  
  - 按点路径（同一键多语言一次写清）：
    `{ "_byKey": { "proofread.noErrorsFound": { "en_us.json": "…", "ja_JP.json": "…" } } }`
- 默认**仅允许**写入在 **zh_cn** 中已存在的点路径，防止拼错键；若确要新建整条路径，使用 **`--allow-new`**（慎用，一般应先在 zh_cn 加键）。
- 占位符如 `{count}`、`{line}` 在补丁字符串中原样保留。

## 二、全量一致性检查：`i18n_report_missing.py`

需要「相对 zh_cn 扫描所有缺失/多余键」时运行：

```bash
python i18n_report_missing.py
```

- 输出：每个语言文件相对 zh_cn 的**缺失键**及**多余键**，并打印缺失键对应的中文原文。
- `--json`：输出 JSON 报告，便于脚本或 Agent 解析。
- `--fix-placeholders`：输出「键 = 中文」便于粘贴占位。

## 三、补全流程（推荐顺序）

1. **`python i18n_report_missing.py --json`**（或业务上已知的点路径）得到待补键列表与中文原文。
2. **`python i18n_keys.py query <键> --json`** 确认各语言现状。
3. **由 Agent 翻译**后，写入一个补丁 JSON，执行 **`python i18n_keys.py apply patch.json --dry-run`**，确认无误后再去掉 `--dry-run`。
4. **再运行** `python i18n_report_missing.py`，直到无缺失键。

## 四、JSON 结构约定

- 键路径与 zh_cn 一致，例如 `proofread.noErrorsFound` 即根下 `proofread` → `noErrorsFound`。
- 新增键时保持与同文件现有块相同的缩进与引号风格。
- 占位符原样保留：`{count}`、`{line}`、`{column}`、`{name}` 等不翻译。

## 五、提升既有翻译质量（可选）

若历史为机翻，可逐段检查并重译：

- 按模块（如 `proofread`、`agent.staging`、`aigcDetection`）在 zh_cn 与各语言间对照。
- 优先改：界面直接可见的标题、按钮、提示语；再改长说明与错误信息。
- 不改键名与结构，只改键对应的字符串译文。

## 六、AI 校对脚本（DeepSeek，并发）

基于 DeepSeek API 的自动化审阅：按模块拆分 JSON，结合语境（UI label / hint / tooltip / 错误信息等）以中文为蓝本校对，只输出需替换的键与修正译文，再写回 JSON。

- **脚本**：`locales/i18n_ai_review.py`
- **API key**：同目录 `.deepseek_api_key`（已加入 .gitignore）或环境变量 `DEEPSEEK_API_KEY`
- **用法**：
  - `python i18n_ai_review.py`：校对所有语言、所有模块（并发）
  - `python i18n_ai_review.py --locale en_us`：仅英文
  - `python i18n_ai_review.py --module proofread`：仅 proofread 模块
  - `python i18n_ai_review.py --dry-run`：只打印任务，不请求 API、不写文件
  - `python i18n_ai_review.py --max-workers 4`：并发数

提示词已约定：以中文为蓝本做校对（非简单直译）、结合语境、专有名词与占位符保留、仅输出需修正项，格式为「键<Tab>新译文」便于解析并写回。

## 七、相关文件

| 文件 | 说明 |
|------|------|
| `locales/zh_cn.json` | 蓝本，键与层级标准 |
| `locales/en_us.json` | 英文 |
| `locales/ja_JP.json` | 日文 |
| `locales/ko_KR.json` | 韩文 |
| `locales/de_DE.json` | 德文 |
| `locales/fr_FR.json` | 法文 |
| `locales/i18n_keys.py` | **Agent 首选**：按键查询、前缀列举、补丁批量写入 |
| `locales/i18n_report_missing.py` | 全量对比 zh_cn：缺失/多余键报告 |
| `locales/i18n_ai_review.py` | AI 校对脚本（DeepSeek，按模块并发） |
| `locales/.deepseek_api_key` | DeepSeek API key（勿提交） |
| `locales/i18n_check.py` | 旧版机翻补全脚本（可选） |

## 八、小结

- **蓝本**：zh_cn.json  
- **日常查改**：`python i18n_keys.py query|prefix|apply`（避免直接 Read 数千行 JSON）  
- **全量体检**：`python i18n_report_missing.py`  
- **补全**：翻译 → 补丁 JSON → `i18n_keys.py apply` → 再跑缺失检查直到通过。  
- **质量**：可针对既有条目做人工/Agent 重译，或运行 `i18n_ai_review.py` 做 AI 并发校对，不改变键结构。
