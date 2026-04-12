# 内部文档索引（`docs/`）

面向开发者的架构说明、迁移记录与排障笔记。**用户可见说明**仍在 `src/renderer/src/manuals/`。

## 根目录速查

| 文件 | 说明 |
|------|------|
| [AGENTS.md](./AGENTS.md) | 文档库约定与主题速查表（英文为主） |
| [USER_MANUAL_INDEX.md](./USER_MANUAL_INDEX.md) | 用户手册目录与覆盖结构 |

## 按主题分类

### [`ai/`](./ai/) — AI / RAG / LLM

- `RAG_KNOWLEDGE_BASE.md` — 知识库与向量检索
- `LLM_AND_AGENT_ARCHITECTURE.md` — LLM 与 Agent 架构索引
- `VERCEL_AI_SDK_MIGRATION.md` — Vercel AI SDK 迁移说明
- `ai-schema-task-usage.md` — AI 任务 schema 用法

### [`outline/`](./outline/) — 大纲视图

- `OUTLINE_*` — 技术参考、UI 规格、迁移与冲突说明等
- `CODING_EXPERIENCE_OUTLINE_RENDER_FLASH.md` — 大纲闪烁问题经验

### [`export/`](./export/) — 导出（DOCX / PlantUML 等）

- `DOCX_EXPORT_*` — DOCX 结构与公式流程
- `EXPORT_ADAPTER_REFACTOR.md` — 导出适配器重构
- `PLANTUML_*` — PlantUML 导出与渲染问题分析

### [`image-protocol/`](./image-protocol/) — 图片协议

- `IMAGE_PROTOCOL_*` — 重构摘要、调用链、测试清单

### [`migration/`](./migration/) — 工程迁移

- `MIGRATION_GUIDE.md` — 迁移总览
- `MIGRATION_TODO_LIST.md` — 待办与进度（P0～P3）

### [`window-tabs/`](./window-tabs/) — 多窗口与标签

- `MULTI_WINDOW_*` — 标签管理与测试用例
- `TAB_SESSION_AND_LEGACY_SINGLE_SESSION.md` — 会话与旧单会话行为

### [`refactoring/`](./refactoring/) — 重构记录

- `REFACTOR_*` — 重构完成说明与总结
- `UTILS_REFACTOR_GUIDE.md`、`TERMINAL_REFACTOR_PLAN.md`

### [`dev/`](./dev/) — 工程化与质量

- `DEMO_MODE_COVERAGE_LINTING.md` — Demo 覆盖率策略
- `lint-manuals.md`、`demo-min-height-guide.md`
- `SPELL_CHECK_LOGIC_ANALYSIS.md`、`SQLITE_MODULE_MAINTENANCE.md`
- `SVG_THEME_IMPLEMENTATION.md`、`VERSION_MANAGEMENT.md`
- `sharp-alternatives.md`、`progress-handle.md`

### [`platform/`](./platform/) — 平台与集成

- Steam 成就与统计（VDF / 图标 / 映射表）：见仓库 [`third-party/steam-achievements/`](../third-party/steam-achievements/README.md)
- `windows-file-association-fix.md` — Windows 文件关联修复

### [`meta/`](./meta/) — 杂项

- `README_PROJECT.md` — 项目模板级 README（IDE / 安装说明）

### [`releases/`](./releases/) — 发布与 CI

- 发布流程、GitHub Actions、环境变量等

### [`tests/`](./tests/) — 测试相关笔记与示例

---

新增文档时：放入最贴近主题的子目录，文件名保持现有约定（大写主题前缀 + `_SUFFIX.md`，指南类可用小写），并在本文件对应小节补一行链接。
