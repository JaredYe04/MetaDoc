# 清理与迁移日志

记录开源重构过程中的**删除**、**迁移至 `archived/`** 与**文档搬迁**。完整 git 记录以 `git log` / `git diff` 为准；本文为摘要索引。

---

## 迁移至 `archived/`（R100 rename）

### CI / 构建

| 原路径 | 新路径 |
|--------|--------|
| `.github/workflows/release-steam.yml` | `archived/ci/release-steam.yml` |
| `.github/workflows/steam-connectivity-test.yml` | `archived/ci/steam-connectivity-test.yml` |
| `meta-doc/electron-builder.steam.yml` | `archived/electron-builder.steam.yml` |

### Cloudflare Worker

`meta-doc/cloudflare-worker/**` → `archived/cloudflare-worker/**`

包含：`src/`（`index.ts`, `ai-proxy.ts`, `billing.ts`, `steam.ts`, …）、`migrations/`、`wrangler.toml`、`package.json` 等。

### Steam 主进程

`meta-doc/src/main/steam/**`（实现文件）→ `archived/steam/main/**`

OSS 树保留：`steam-runtime.stub.ts`、`register-steam-ipc.stub.ts`、`steam-app-lifecycle-hooks.stub.ts`、`steam-first-doc-achievements.stub.ts`、`user-templates-steam-push.stub.ts`。

### Steam 渲染端（部分）

| 原路径 | 新路径 |
|--------|--------|
| `components/LeftMenuSteamTray.vue` | `archived/steam/renderer/LeftMenuSteamTray.vue` |
| `views/CloudDocumentsView.vue` | `archived/steam/renderer/views/` |
| `views/WorkshopMarketView.vue` | 同上 |
| `views/setting/LlmSteamCloudPanel.vue` | 同上 |
| `utils/metadoc-cloud-auth.ts` 等 Steam 工具 | `archived/steam/renderer/utils/` |
| `services/steam-client.ts` | `archived/steam/renderer/services/` |
| `onboarding/SteamLocaleConflictDialog.vue` | `archived/steam/renderer/onboarding/` |

### Steam 公共模块

`meta-doc/src/common/steam-*.ts` → `archived/steam/common/`

### Steam 第三方

`meta-doc/third-party/steam-achievements/**`、`steam-inventory/**`、`steamworks-sdk/**`、`store-page/**` → `archived/steam/third-party/**`

### 云与 Steam 文档

| 原路径 | 新路径 |
|--------|--------|
| `meta-doc/docs/cloud/**` | `archived/docs/cloud/**` |
| `docs/RELEASE_AND_STEAM.md` | `archived/docs/RELEASE_AND_STEAM.md` |
| `meta-doc/docs/economics-first-purchase.md` | `archived/docs/cloud/economics-first-purchase.md` |

---

## 文档搬迁（仍在 `meta-doc/docs/`）

| 原路径 | 新路径 |
|--------|--------|
| `docs/MULTI_TAB_REFACTOR_PROGRESS.md` | 删除（内容迁至 `meta-doc/docs/window-tabs/MULTI_TAB_REFACTOR_PROGRESS.md`） |
| `docs/multi-tab-refactor-progress.md` | `meta-doc/docs/window-tabs/MULTI_TAB_REFACTOR_PROGRESS.md` |
| `docs/vditor-issue-text-model.md` | `meta-doc/docs/dev/vditor-issue-text-model.md` |
| `docs/智能体产品设计报告.md` | `meta-doc/docs/meta/AGENT_PRODUCT_DESIGN_REPORT.md` |
| `meta-doc/docs/MULTI_WINDOW_TAB_MANAGEMENT.md` | 删除（由 window-tabs 目录其他文档覆盖） |

---

## 删除（D）

### 仓库根

| 路径 | 说明 |
|------|------|
| `db/init_table.sql` | 根级 DB 初始化 SQL |
| `docs/SimpleTex.txt` | 临时笔记 |

### `meta-doc/`

| 路径 | 说明 |
|------|------|
| `capacitor.config.ts` | Capacitor Android 配置 |
| `scripts/after-pack.js` | 打包后脚本 |
| `scripts/apply-home-agent-prompts.mjs` | 一次性 home prompt 补丁 |
| `scripts/patch-home-features-remove-quickstart.mjs` | 一次性功能补丁 |
| `scripts/run-format-and-lint-warn.js` | 已整合至 npm scripts |
| `scripts/test-create-directory.mjs` | 开发用测试脚本 |
| `scripts/verify-at-tag.js` | 开发用验证脚本 |

### 主进程 legacy

| 路径 | 说明 |
|------|------|
| `src/main/utils/express-server-legacy.ts` | Express 旧实现 |
| `src/main/utils/legacy-exports.js` | 旧导出聚合 |
| `src/main/utils/rag-service-legacy.ts` | RAG 旧服务 |

### Agent 框架开发笔记

`src/renderer/src/utils/agent-framework/docs/` 下 12 篇 `*_IMPLEMENTATION.md` / `*_SUMMARY.md` 等（实现已完成，避免与 `docs/ai/` 重复）。

---

## 重构期新增（开源插件体系）

以下路径为重构**新增**，非迁移：

```
src/renderer/src/host-api/index.ts
src/renderer/src/core/bootstrap.ts
src/renderer/src/core/host-runtime.ts
src/renderer/src/core/plugin-loader.ts
src/renderer/src/ai-runtime/loader.ts
src/renderer/src/plugins/builtin-manifests.ts
src/renderer/src/plugins/builtin/*.ts
src/renderer/src/plugins/examples/hello-world.ts
```

---

## 修改摘要（M，与重构相关）

| 文件 | 变更要点 |
|------|----------|
| `main.js` | 拆分为 `bootstrapCore` + 延迟 `syncAiRuntimeWithSettings` |
| `App.vue`, `Main.vue` | 接入 `pluginRegistry` shell overlays、`ai-runtime-ready` |
| `LeftMenu.vue` | 为插件化做准备（AI 菜单仍部分静态） |
| `WorkspaceDocumentViews.vue` | 动态渲染 `pluginRegistry.documentViews` |
| `SettingLlmSection.vue` | 切换 `llmEnabled` 时 `eventBus.emit('ai-runtime-toggle')` |
| `express-server.ts` | 去除 legacy 引用 |
| `package.json`, `electron.vite.config.mjs` | 构建配置调整 |
| `meta-doc/.gitignore` | 忽略本地插件 / 归档产物等 |

---

## 2026-06-30 — Steam 链路废弃收尾

### OSS 树删除

| 路径 | 说明 |
|------|------|
| `src/common/steam-game-language.ts` | 迁至 `locale-native-labels.ts`（通用 locale 标签）；Steam 映射保留于 `archived/steam/common/` |
| `src/renderer/src/views/WorkshopMarketView.vue` | 占位视图删除（完整版在 `archived/steam/renderer/views/`） |
| `src/renderer/src/views/CloudDocumentsView.vue` | 同上 |
| `src/renderer/src/components/workshop/WorkshopPublishDocumentDialog.vue` | 完整版在 `archived/steam/renderer/components/workshop/` |
| `package.json` `optionalDependencies.greenworks` | OSS 不再声明 Greenworks |

### 修改

| 文件 | 变更 |
|------|------|
| `router/router.js` | 移除 Steam 路由块 |
| `config/tab-content-config.ts` | 移除 Workshop / 云文档系统 Tab |
| `App.vue` | 移除 Workshop 对话框挂载 |
| `workshop-publish-document-dialog.ts` | 开源版 no-op |
| `AgentCapabilitiesManager.vue` / `NewDocumentWorkspace.vue` | Steam 入口 `isSteamEnabled()` 门控 |
| `scripts/extract-steam-archive.mjs` | 缺失文件 fallback + optional 模式 |

### 文档

- `archived/README.md` — Steam 标记为已废弃、历史参考
- `03-ARCHIVE-GUIDE.md` — 恢复章节改为私有 fork 参考
- `HANDOFF.md` — 移除「恢复 Steam CI」待办

---

## 2026-06-30 — 社区插件沙箱

| 路径 | 说明 |
|------|------|
| `core/plugin-permissions.ts` | 已知权限集合与 `PluginPermissionError` |
| `core/sandboxed-host.ts` | 社区插件 Host 权限门控 |
| `core/sandboxed-host.test.ts` | 单元测试 |
| `community-plugin-loader.ts` | 渲染进程 `import(entryUrl)` + `{ sandbox: true }` |
| `register-community-plugins-ipc.ts` | `resolve-entry` 路径校验；目录名须与 manifest.id 一致 |

---

## 2026-07-04 — 开源环境变量与隐私清理

### Git 历史

- 使用 `git filter-repo` 移除全历史中的 `meta-doc/.env`、`meta-doc/resources/.env`、`archived/steam/third-party/steam-inventory/upload-config.local.json`

### 新增（可提交）

| 路径 | 说明 |
|------|------|
| `meta-doc/.env.example` | 开源默认 env（SimpleTex、SiliconFlow、更新检查） |
| `meta-doc/.env.steam.example` | Steam / 官方云构建参考 |
| `archived/env/legacy-spring-server.env.example` | 废弃 Spring Boot 后端 |
| `archived/steam/third-party/steam-inventory/upload-config.local.json.example` | ImgBB 上传配置模板 |
| `meta-doc/docs/releases/BUILTIN_API_KEYS.md` | 内置免费 API Key 说明 |
| `archived/docs/LEGACY_SPRING_SERVER.md` | 废弃后端说明 |

### 行为变更

- 应用内 / 官网反馈改为引导 [GitHub Issues](https://github.com/JaredYe04/MetaDoc/issues/new)；移除 `GITHUB_FEEDBACK_*` 依赖
- `SERVER_URL` 不再读环境变量，固定 localhost（Legacy Spring 已归档）
- `.gitignore` 补全 `meta-doc/.env`、`resources/.env` 等

---

## 维护说明

- 每次大批量归档或删除后，在本文件追加一节（日期 + 摘要）。
- **勿**将 `archived/cloudflare-worker/.env.vars`、`.wrangler/state/` 等本地密钥或 SQLite 状态提交至 git。
