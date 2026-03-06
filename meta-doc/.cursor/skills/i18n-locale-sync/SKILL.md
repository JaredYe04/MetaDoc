---
name: i18n-locale-sync
description: Keeps MetaDoc UI locales in sync with zh_cn as the blueprint. Use when fixing missing i18n keys, adding new locale strings, or improving translation quality. Trigger: i18n, locales, missing key, 翻译, 多语言, proofread.noErrorsFound, intlify Not found key.
---

# MetaDoc i18n 本地化同步与翻译

以 **zh_cn.json** 为唯一蓝本：其他语言 JSON 的键与层级必须与 zh_cn 完全一致。缺失键由 Agent 按中文语义翻译后补全，不依赖机翻脚本。

## 何时使用

- 控制台或界面报错缺失某 key（如 `proofread.noErrorsFound`）
- 新增功能后需为所有语言补充同一批键
- 希望统一走「脚本查缺 → Agent 翻译」流程，避免机翻质量差

## 一、检查缺失键（只报告，不自动翻译）

在 `meta-doc/src/renderer/src/locales/` 下运行：

```bash
python i18n_report_missing.py
```

- 输出：每个语言文件相对 zh_cn 的**缺失键**及**多余键**，并打印缺失键对应的中文原文。
- `--json`：输出 JSON 报告，便于脚本或 Agent 解析。
- `--fix-placeholders`：输出「键 = 中文」便于粘贴占位。

## 二、补全流程（由 Agent 完成）

1. **运行脚本**，得到各语言缺失键列表及 zh 原文。
2. **由 Agent 翻译**：按目标语言（en_us, ja_JP, ko_KR, de_DE, fr_FR）给出地道翻译，保留占位符如 `{count}`、`{line}` 等不变。
3. **写入对应 JSON**：在对应语言的 JSON 中按原有层级结构新增键值，保持与 zh_cn 的键路径一致。
4. **再次运行** `python i18n_report_missing.py`，直到无缺失键。

## 三、JSON 结构约定

- 键路径与 zh_cn 一致，例如 `proofread.noErrorsFound` 即根下 `proofread` → `noErrorsFound`。
- 新增键时保持与同文件现有块相同的缩进与引号风格。
- 占位符原样保留：`{count}`、`{line}`、`{column}`、`{name}` 等不翻译。

## 四、提升既有翻译质量（可选）

若历史为机翻，可逐段检查并重译：

- 按模块（如 `proofread`、`agent.staging`、`aigcDetection`）在 zh_cn 与各语言间对照。
- 优先改：界面直接可见的标题、按钮、提示语；再改长说明与错误信息。
- 不改键名与结构，只改键对应的字符串译文。

## 五、AI 校对脚本（DeepSeek，并发）

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

## 六、相关文件

| 文件 | 说明 |
|------|------|
| `locales/zh_cn.json` | 蓝本，键与层级标准 |
| `locales/en_us.json` | 英文 |
| `locales/ja_JP.json` | 日文 |
| `locales/ko_KR.json` | 韩文 |
| `locales/de_DE.json` | 德文 |
| `locales/fr_FR.json` | 法文 |
| `locales/i18n_report_missing.py` | 仅报告缺失/多余键的检查脚本 |
| `locales/i18n_ai_review.py` | AI 校对脚本（DeepSeek，按模块并发） |
| `locales/.deepseek_api_key` | DeepSeek API key（勿提交） |
| `locales/i18n_check.py` | 旧版机翻补全脚本（可选） |

## 七、小结

- **蓝本**：zh_cn.json  
- **检查**：`python i18n_report_missing.py`  
- **补全**：Agent 根据缺失键与中文原文翻译 → 写入对应 locale JSON → 再跑脚本直到无缺失。  
- **质量**：可针对既有条目做人工/Agent 重译，或运行 `i18n_ai_review.py` 做 AI 并发校对，不改变键结构。
