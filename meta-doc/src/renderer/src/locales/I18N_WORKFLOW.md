# MetaDoc i18n 操作指南

本文说明如何做**键补全**、**翻译**和**批量校对**，保证各语言与中文蓝本一致且译文质量可控。

---

## 一、目录与蓝本

- **locales 目录**：`meta-doc/src/renderer/src/locales/`
- **蓝本**：`zh_cn.json`（键与层级以它为准，其他语言不得缺键、建议结构一致）
- **语言文件**：`en_us.json`、`ja_JP.json`、`ko_KR.json`、`de_DE.json`、`fr_FR.json`

---

## 二、键补全（缺键时）

新增功能或修复报错「Not found 'xxx' key」时，需要给**所有非中文语言**补上同一批键。

### 步骤

1. **查缺**（在 locales 目录下执行）  
   ```bash
   python i18n_report_missing.py
   ```  
   会列出每个语言相对 `zh_cn.json` 的**缺失键**及中文原文。

2. **补键**  
   - 由人工或 Agent 按「中文原文 → 目标语言」翻译，保留占位符如 `{count}`、`{name}` 不变。  
   - 在对应语言的 JSON 里，按与 zh_cn **相同的键路径**新增键值（如 `proofread.noErrorsFound` 即 `proofread` → `noErrorsFound`）。

3. **再跑一次查缺**  
   ```bash
   python i18n_report_missing.py
   ```  
   直到输出「All locale files match base keys」或不再有缺失键。

### 可选

- `python i18n_report_missing.py --json`：输出 JSON，便于脚本或 Agent 解析。  
- `python i18n_report_missing.py --fix-placeholders`：输出「键 = 中文」便于粘贴占位。

---

## 三、翻译（新键或新文案）

- 新增的键：必须在 **zh_cn.json** 里先有，再在其他语言里按同一路径添加译文。  
- 翻译时注意语境：是按钮/标题、提示语、tooltip 还是错误信息，按场景写自然译文。  
- 专有名词（MetaDoc、RAG、LaTeX、Markdown 等）不翻译；占位符 `{count}`、`{line}` 等原样保留。

---

## 四、批量校对（AI 审阅现有译文）

用 **DeepSeek API** 按模块并发审阅，以中文为蓝本改掉机翻、生硬或不符合语境的译文，并直接写回 JSON。

### 4.1 准备

- **API Key**：在同目录创建 `.deepseek_api_key`，内容为 DeepSeek API key（一行）；或设置环境变量 `DEEPSEEK_API_KEY`。  
  （`.deepseek_api_key` 已加入 .gitignore，勿提交。）

### 4.2 进度文件与增量运行

- 脚本会在 locales 目录下维护 **`.i18n_ai_review_progress.txt`**（已加入 .gitignore）。
- 每完成一个「语言 + 模块」并写回 JSON 后，会往该文件追加一行：`语言文件\t模块名`。
- **再次执行时**会跳过进度文件中已存在的项，只跑尚未完成的，方便断点续跑或分批跑。
- 若要**全量重跑**（忽略已有进度）：先加 `--reset-progress` 再执行，例如：  
  `python i18n_ai_review.py --reset-progress --max-workers 5`

### 4.3 命令（均在 locales 目录下执行）

| 用途           | 命令 |
|----------------|------|
| 增量校对       | `python i18n_ai_review.py --max-workers 5`（默认跳过已完成的 语言\|模块） |
| 全量重跑       | `python i18n_ai_review.py --reset-progress --max-workers 5` |
| 只校对某一语言 | `python i18n_ai_review.py --locale en_us` |
| 只校对某一模块 | `python i18n_ai_review.py --module proofread` |
| 只看任务不请求 | `python i18n_ai_review.py --dry-run` |
| 调并发数       | `python i18n_ai_review.py --max-workers 4` |

### 4.4 执行时输出与写回

- 会打印：**当前进度** `[当前/总数]`、**语言文件**、**模块名**、**结果**（完成并修正 N 处、已写回并记入进度 / 失败 / 异常）。  
- **每完成一个模块就会立即写回**对应语言的 JSON，并更新进度文件，无需等全部跑完；中断后再跑会从未完成项继续。

### 4.5 注意

- **全量**约 770 个任务，耗时会较长（约 20–60 分钟视网络与 API 情况），建议在可长期保持的终端中执行。  
- 可先小范围试跑，例如：  
  `python i18n_ai_review.py --module proofread --max-workers 3`  
  确认流程与输出无误后再全量或按语言/模块分批跑。

---

## 五、脚本与文件一览

| 文件/命令 | 作用 |
|-----------|------|
| `zh_cn.json` | 蓝本，键与结构标准 |
| `i18n_report_missing.py` | 查缺：对比 zh_cn，列出缺失/多余键 |
| `i18n_ai_review.py` | 批量校对：按模块调用 DeepSeek 审阅，**每模块完成即写回** |
| `.i18n_ai_review_progress.txt` | 已完成的「语言\|模块」记录，用于增量跑（勿提交） |
| `.deepseek_api_key` | DeepSeek API key（勿提交） |
| `i18n_check.py` | 旧版机翻补全（可选，质量一般） |

---

## 六、推荐流程小结

1. **缺键**：`i18n_report_missing.py` → 按提示补键（人工/Agent）→ 再跑直到无缺失。  
2. **新文案**：在 zh_cn 加键 → 在其他语言同路径下加译文，注意语境与占位符。  
3. **批量改译文**：配置好 `.deepseek_api_key` → 用 `i18n_ai_review.py` 按需全量或 `--locale`/`--module` 分批跑，看进度输出即可。

更多细节可参考项目内 Skill：`.cursor/skills/i18n-locale-sync/SKILL.md`。

---

## 七、用户手册 i18n（按缺失文件翻译）

用户手册以 **zh_CN** 为蓝本，存放在 `meta-doc/src/renderer/src/manuals/`。其他语言（en_US、ja_JP、ko_KR、de_DE、fr_FR）若缺少与 zh_CN 同路径的 `.md` 文件，即视为「缺失」，需要翻译生成。

### 7.1 逻辑与约束

- **检查的是「缺失文件」**：对比 `manuals/zh_CN/` 下所有 `.md` 的相对路径，若某语言下同路径不存在，则加入待翻译任务。
- **翻译要求**：语言地道、不破坏原意；**不得修改** Vue 组件占位符（如 `<MenuItemsDemo mode="demo" ... />`）、代码块、Mermaid 块、组件属性及内部链接等，只翻译正文与标题等自然语言部分。
- **并发 + 实时写回 + 进度**：与 locale JSON 的 AI 校对类似，每完成一篇即写回对应语言目录并追加进度；进度文件记录「语言\t相对路径」，再次运行会跳过已完成项。

### 7.2 准备

- **API Key**：在 `manuals/` 目录下创建 `.deepseek_api_key`，或使用 `locales/` 下的同名文件，或设置环境变量 `DEEPSEEK_API_KEY`。（`manuals/.deepseek_api_key` 与进度文件已加入 .gitignore。）

### 7.3 进度与增量

- 脚本在 `manuals/` 下维护 **`.manual_i18n_progress.txt`**（每行：`语言\t相对路径`）。
- 再次执行时会跳过进度中已有的「语言|路径」，只处理尚未翻译的缺失文件。
- **全量重跑**：加 `--reset-progress` 再执行（会清空进度，仍只生成「当前缺失」的文件）。

### 7.4 命令（在 manuals 目录下执行）

| 用途           | 命令 |
|----------------|------|
| 增量翻译缺失   | `python manual_i18n_translate.py --max-workers 3` |
| 全量重跑       | `python manual_i18n_translate.py --reset-progress --max-workers 3` |
| 只翻译某一语言 | `python manual_i18n_translate.py --locale en_US` |
| 只列缺失不请求 | `python manual_i18n_translate.py --dry-run` |
| 调并发数       | `python manual_i18n_translate.py --max-workers 4` |

### 7.5 脚本与文件一览（手册）

| 文件/命令 | 作用 |
|-----------|------|
| `manuals/zh_CN/**/*.md` | 蓝本，所有手册正文 |
| `manual_i18n_translate.py` | 按缺失文件翻译，并发 + 每篇写回 + 进度 |
| `.manual_i18n_progress.txt` | 已完成的「语言\t路径」记录（勿提交） |
| `manuals/.deepseek_api_key` | 可选，与 locales 共用或单独放（勿提交） |
