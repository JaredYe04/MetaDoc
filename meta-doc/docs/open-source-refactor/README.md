# MetaDoc 开源重构文档

面向将 MetaDoc 拆分为**可独立构建的开源核心**与**私有 Steam / 云端扩展**的架构重构。本目录记录设计决策、模块分类、Host API 与插件体系。

## 目标

1. **默认构建零 Steam 依赖** — `meta-doc/` 树内不链接 Greenworks、不打包 Cloudflare Worker、不引用 MTX 定价逻辑。
2. **AI 能力可关闭、可延迟加载** — 用户关闭 `llmEnabled` 时不加载 Agent 工具链与内置 AI 插件，缩短冷启动路径。
3. **功能插件化** — 原散落在 `LeftMenu`、`App.vue`、`Main.vue` 的 AI 入口逐步迁入 `plugins/builtin/*`，通过 `MetaDocHost` 注册 UI 贡献点。
4. **商业代码归档** — Steam 集成、官方云、Worker 后端等迁入仓库根目录 `archived/`，私有分支可按 [03-ARCHIVE-GUIDE.md](./03-ARCHIVE-GUIDE.md) 恢复。

## 架构概览

```
renderer/main.js
    │
    ├─ bootstrapCore()          ← core/bootstrap.ts（格式、主题、Pinia、路由）
    │       └─ getHost()        ← core/host-runtime.ts（MetaDocHost 单例）
    │
    └─ syncAiRuntimeWithSettings()  ← ai-runtime/loader.ts（idle 后执行）
            ├─ attachLlmHost()
            ├─ initializeAgentTools()
            └─ loadBuiltinPlugins(builtinPluginLoaders)
                    └─ plugins/builtin/*.ts → host.ui / host.editor / …
```

| 层级 | 目录 | 职责 |
|------|------|------|
| Host API | `src/renderer/src/host-api/` | 类型定义、`MetaDocHost`、`PluginManifest` |
| Host 运行时 | `src/renderer/src/core/host-runtime.ts` | Host 实现、`pluginRegistry` 贡献点收集 |
| 插件加载 | `src/renderer/src/core/plugin-loader.ts` | `activatePlugin` / `deactivateAllPlugins` |
| AI 运行时 | `src/renderer/src/ai-runtime/loader.ts` | `llmEnabled` 门控、懒加载 AI 栈 |
| 内置插件 | `src/renderer/src/plugins/builtin/` | 各 AI 功能的 `activate` 注册逻辑 |
| 归档 | `archived/` | Steam、Worker、CI、云文档（见归档指南） |

主进程侧保留 `src/main/steam/*.stub.ts`，使 OSS 构建中 import 可解析而无实际 Steam IPC。

## 文档索引

| 文件 | 内容 |
|------|------|
| [01-MODULE-INVENTORY.md](./01-MODULE-INVENTORY.md) | Core / AI / Archived 模块分类 |
| [02-CLEANUP-LOG.md](./02-CLEANUP-LOG.md) | 删除与迁移文件清单 |
| [03-ARCHIVE-GUIDE.md](./03-ARCHIVE-GUIDE.md) | `archived/` 目录结构与恢复 Steam 构建 |
| [04-HOST-API-SPEC.md](./04-HOST-API-SPEC.md) | `MetaDocHost` 与各 Host 接口规范 |
| [05-PLUGIN-MANIFEST.md](./05-PLUGIN-MANIFEST.md) | 插件清单字段与权限 |
| [06-BUILTIN-PLUGIN-MATRIX.md](./06-BUILTIN-PLUGIN-MATRIX.md) | 功能 → 内置插件映射 |
| [07-LAZY-LOADING.md](./07-LAZY-LOADING.md) | `llmEnabled` 与 AI 运行时生命周期 |
| [08-COMMUNITY-PLUGIN-GUIDE.md](./08-COMMUNITY-PLUGIN-GUIDE.md) | 社区插件开发指南 |
| [HANDOFF.md](./HANDOFF.md) | 已完成项与待办清单 |

## 源码入口

- Host API 类型：`src/renderer/src/host-api/index.ts`
- 启动：`src/renderer/src/main.js` → `core/bootstrap.ts` + `ai-runtime/loader.ts`
- 内置插件列表：`src/renderer/src/plugins/builtin-manifests.ts`
- 示例插件：`src/renderer/src/plugins/examples/hello-world.ts`

## 相关文档

- AI 架构（重构前）：[`../ai/LLM_AND_AGENT_ARCHITECTURE.md`](../ai/LLM_AND_AGENT_ARCHITECTURE.md)
- 归档总览：[`../../../archived/README.md`](../../../archived/README.md)
