# Steam 成就、统计与本地化（AppID 4359310）

本文档与仓库内常量保持一致，供在 [Steamworks Partner](https://partner.steamgames.com/) 配置 **Stats & Achievements**、上传图标与本地化时对照。

**本目录**（`third-party/steam-achievements/`）集中存放：说明文档、VDF 映射表、生成的 `4359310_loc_all.vdf`、成就图标目录 `achievement-icons/`。

## 统计项（INT，API 名须完全一致）

| API 名 | 说明 |
|--------|------|
| `STAT_SECONDS_PLAYED` | 应用前台累计秒数（本地与云端取较大值后写回） |
| `STAT_AI_REQUESTS` | LLM 请求总次数（与 `userData/llm-statistics.json` 的 `totalRequests` 对齐） |
| `STAT_CHARS_TYPED` | 编辑器与 Agent 输入累计字符（渲染进程节流上报） |
| `STAT_FOCUS_SECONDS` | 专注模式前台累计秒数（本地与云端取较大值后写回；主进程计时器在 `focusMode` 为真时累加） |

实现参考：`src/common/steam-stats.ts`、`src/main/steam/steam-stats-sync.ts`。

## 成就（API 名须与后台槽位一致）

| API 名 | 触发概要 |
|--------|----------|
| `ACH_META_WELCOME` | 主进程 Steam 初始化成功后尝试解锁（仅首次成功） |
| `ACH_ONBOARDING_DONE` | 完成首次使用向导 |
| `ACH_LLM_TEST_OK` | 入门向导中 LLM「测试连接」成功 |
| `ACH_MANUAL_TRACK_DONE` | 用户手册学习进度达到 100% |
| `ACH_FIRST_MD` | 首次将 `.md` 文件写入最近文档 |
| `ACH_FIRST_TEX` | 首次将 `.tex` 文件写入最近文档 |
| `ACH_MD_EXPORT_PDF` | 首次从 Markdown 导出 PDF |
| `ACH_DOCX_LATEX_EXPORT` | 首次从 Markdown 导出 DOCX |
| `ACH_TEX_COMPILE_PDF` | 首次从 TeX 导出 PDF |
| `ACH_FIRST_AIGC` | 首次完成 AIGC 整体分析 |
| `ACH_FIRST_AGENT_CHAT` | 首次在 Agent 中发送用户消息 |
| `ACH_FIRST_AGENT_SKILL` | Agent 工具成功写入并索引首个技能文件 |
| `ACH_FIRST_AGENT_RULE` | 在能力管理中首次插入动态规则 |
| `ACH_WORKSHOP_PUBLISH_TEMPLATE` / `SKILL` / `RULES` / `MCP` | 首次向创意工坊发布对应类型物品 |
| `ACH_WORKSHOP_SUBSCRIBE_ITEM` | 首次将已订阅创意工坊物品安装到应用内 |
| `ACH_CLOUD_DOC_SAVE` | 首次在云文档库成功保存文档 |
| `ACH_MANUAL_HOTKEY_F1` | 使用 F1 快捷键打开用户手册 |
| `ACH_TABBAR_WHEEL` | 在标签栏使用滚轮切换标签 |
| `ACH_FOCUS_MODE_ONCE` | 首次进入专注模式 |
| `ACH_FOCUS_H_1` / `_10` / `_100` / `_500` / `_1000` | 专注模式累计 1/10/100/500/1000 小时（由 `STAT_FOCUS_SECONDS` 跨阈值解锁） |
| `ACH_KB_UPLOAD_FIRST` | 成功向知识库上传一篇文档 |
| `ACH_KB_QUERY_HIT` | 知识库检索返回至少一条结果 |
| `ACH_OUTLINE_DRAG_REORDER` | 在大纲树中拖拽节点调整结构并成功保存 |
| `ACH_OUTLINE_FORMAT_TITLES` | 在大纲视图中成功执行格式化标题向导 |
| `ACH_MATERIAL_BASKET_ADD` | 向素材篮添加素材（新建或从节点导入） |

注册表与 i18n key：`src/common/steam-achievement-registry.ts`；去重与解锁：`src/main/steam/steam-achievement-manager.ts`。

## 本地化 VDF

- **生成方式（推荐）**：维护本目录下映射表 `steam-achievement-vdf-map.json`（按成就排列，Partner Token 与表中 `nameToken` / `descToken` 一致），在 `src/renderer/src/locales` 各语言 JSON 的 `steamAch` 中使用扁平键 **`ACH_XXX_NAME`** / **`ACH_XXX_DESC`** 写文案。生成脚本会按 Steam 语言键自动读取已有 locale 文件（如 `de_DE.json`→`german`、`ja_JP.json`→`japanese` 等，完整对应见 `scripts/generate-steam-loc-vdf.mjs` 内 `LOCALE_FILE_BY_STEAM_LANG`）。在 `meta-doc` 根目录执行：
  - `pnpm generate-steam-loc-vdf`  
  或 `node scripts/generate-steam-loc-vdf.mjs`  
  输出：**本目录** `4359310_loc_all.vdf`。
- **根节点须为 `"lang"`**（不要用 AppID 作根节点），结构与 Partner 下载的模板一致。
- **成就 Token 键名**须与 Partner「显示名称 / 描述」列一致，本仓库为 **`ACH_{API}_NAME`** / **`ACH_{API}_DESC`**（例如 `ACH_META_WELCOME_NAME`）。键是固定令牌名；**值**才是各语言下的展示文案。
- **成就顺序**必须与 Steamworks 里成就列表顺序一致（与下表一一对应）。若 Partner 使用其它 Token 命名，请改 `steam-achievement-vdf-map.json` 中的 `nameToken` / `descToken`。
- 已在 `locales` 中维护的语种会写入对应语言块；仓库尚未提供 JSON 的 Steam 语言（如 `italian`、`thai`）仍为 `""` 占位，与导出模板一致。
- **统计项（Stats）**的本地化 Token 以 Partner 导出为准；若导出中含 `NEW_STAT_*` 等条目，请合并进同一 `lang` 文件，勿使用与成就无关的自定义键名（如 `STAT_SECONDS_PLAYED_NAME`），否则上传会显示 0 条处理成功。

### 列表顺序与代码 API 名（Partner Token：`ACH_*_NAME` / `ACH_*_DESC`）

| 顺序 | 代码 `apiName` | 显示名称 Token | 描述 Token |
|------|----------------|----------------|------------|
| 1 | `ACH_META_WELCOME` | `ACH_META_WELCOME_NAME` | `ACH_META_WELCOME_DESC` |
| 2 | `ACH_ONBOARDING_DONE` | `ACH_ONBOARDING_DONE_NAME` | `ACH_ONBOARDING_DONE_DESC` |
| 3 | `ACH_LLM_TEST_OK` | `ACH_LLM_TEST_OK_NAME` | `ACH_LLM_TEST_OK_DESC` |
| 4 | `ACH_MANUAL_TRACK_DONE` | `ACH_MANUAL_TRACK_DONE_NAME` | `ACH_MANUAL_TRACK_DONE_DESC` |
| 5 | `ACH_FIRST_MD` | `ACH_FIRST_MD_NAME` | `ACH_FIRST_MD_DESC` |
| 6 | `ACH_FIRST_TEX` | `ACH_FIRST_TEX_NAME` | `ACH_FIRST_TEX_DESC` |
| 7 | `ACH_MD_EXPORT_PDF` | `ACH_MD_EXPORT_PDF_NAME` | `ACH_MD_EXPORT_PDF_DESC` |
| 8 | `ACH_DOCX_LATEX_EXPORT` | `ACH_DOCX_LATEX_EXPORT_NAME` | `ACH_DOCX_LATEX_EXPORT_DESC` |
| 9 | `ACH_TEX_COMPILE_PDF` | `ACH_TEX_COMPILE_PDF_NAME` | `ACH_TEX_COMPILE_PDF_DESC` |
| 10 | `ACH_FIRST_AIGC` | `ACH_FIRST_AIGC_NAME` | `ACH_FIRST_AIGC_DESC` |
| 11 | `ACH_FIRST_AGENT_CHAT` | `ACH_FIRST_AGENT_CHAT_NAME` | `ACH_FIRST_AGENT_CHAT_DESC` |
| 12 | `ACH_FIRST_AGENT_SKILL` | `ACH_FIRST_AGENT_SKILL_NAME` | `ACH_FIRST_AGENT_SKILL_DESC` |
| 13 | `ACH_FIRST_AGENT_RULE` | `ACH_FIRST_AGENT_RULE_NAME` | `ACH_FIRST_AGENT_RULE_DESC` |
| … | （含 Workshop、云文档及上表后续成就，顺序与 `steam-achievement-vdf-map.json` 一致） | | |

完整顺序以 `steam-achievement-vdf-map.json` 与 `STEAM_ACHIEVEMENTS` 为准。

## 成就图标

- 输出目录：**本目录下** `achievement-icons/`
- 命名：`{API_NAME}_unlocked.jpg` / `{API_NAME}_locked.jpg`（256×256 JPG）
- **一键生成全部图标**（在 `meta-doc` 根目录）：
  - `pnpm generate-steam-achievement-icons`  
  或 `node scripts/generate-steam-achievement-icons.mjs`
- **配置**：同目录下 `steam-achievement-icons.json`。  
  - **解锁图背景**：对 `api` 做 **FNV-1a** 后再经 **avalanche 混淆**，把 `ACH_` 等公共前缀造成的相似哈希打散；**色相取 0～360° 全环**（红、黄、绿、青、蓝、紫等都会出现），饱和度与亮度仍由第二路哈希微调，得到 **HSL 浅色 pastel**（饱和约 34%～49%、亮度约 83%～92%）。**不**人为限制总体色调，只做「稳定又像随机」的分布。  
  - **锁定图背景**：`defaults.lockedBackground` 深黑（默认 `#101010`），无渐变。  
  - **锁定图前景**：**白色**像素字；图标优先加载与 `*-black.svg` 同名的 **`*-white.svg`**，若无则栅格化 black 版后将不透明像素提亮为白。欢迎成就的应用 **PNG** 在锁定态同样压成白色剪影。  
  - **解锁图图标**：`**-black.svg**`；`iconMax` / `iconMin` / `appIconSize` 在脚本内对配置值再 **×1.3**，并与画布宽度比例上限一并放大，在 `labelAreaTop` 以下 **自适应**，避免压住文字。  
  - **文案**：底部 `label` 使用 **5×7 像素点阵**（`scripts/steam-achievement-pixel-glyphs.mjs`），仅 **A–Z、0–9、空格**；自动大写，过长拆行缩小。  
  - SVG 由 `@resvg/resvg-js` 栅格化。
- **可选参数**：
  - `--config=third-party/steam-achievements/steam-achievement-icons.json`（默认即此路径，相对 `meta-doc` 根）
  - `--only=ACH_FIRST_MD` 只生成一条
  - `--app-icon=path/to.png` 优先作为欢迎成就的应用图标（覆盖配置中的候选顺序）
- **解锁 / 锁定**：两套图分别绘制；布局与图标逻辑尺寸一致（含 +30% 图标缩放），锁定为深底白前景，解锁为 pastel 底黑前景。

## 上传顺序建议

1. 在 Steamworks 删除或停用旧版与本列表冲突的成就/统计项（若仍存在旧 API 名）。
2. 创建上述统计项与成就，API 名与 `steam-achievement-registry.ts` / 上表一致。
3. 上传成就图标（解锁/锁定两套）。
4. 将 VDF 或 Partner 导出的本地化合并后上传。

## 相关 IPC（渲染进程）

- `steam:profile-summary`：资料卡摘要（用户、头像 URL、等级、含 `focusSeconds` 在内的统计）
- `steam:stats:report`：上报 `{ sessionSecondsDelta?, focusSecondsDelta?, charsDelta?, aiRequestsTotal? }`（主进程合并本地 JSON 与 Steam）
- `steam:achievement:try-unlock`：按 API 名尝试解锁（带 app-store 去重）
