# 开源重构交接清单（Handoff）



最后更新：2026-06-30



---



## 已完成



### 架构拆分



- [x] **启动分层** — `main.js` → `bootstrapCore()` + 延迟 `syncAiRuntimeWithSettings()`

- [x] **Host API** — `host-api/index.ts` 定义 `MetaDocHost`、插件类型、`HOST_API_VERSION`

- [x] **Host 运行时** — `host-runtime.ts` 实现各 Host + `pluginRegistry`

- [x] **插件加载器** — `plugin-loader.ts`：`activate` / `deactivate` / `loadBuiltinPlugins` / 权限校验 / disposer 映射



### AI 延迟加载



- [x] **`ai-runtime/loader.ts`** — `loadAiRuntime` / `unloadAiRuntime` / 设置同步 / 社区插件加载

- [x] **`llmEnabled` 门控** — 默认 `false`；设置页切换触发 `ai-runtime-toggle`

- [x] **`attachLlmHost`** — AI 栈加载后才暴露 `host.llm`



### 内置插件化（10 个）



- [x] completion, section-optimizer, translate-selection, outline-ai

- [x] ai-chat, agent, knowledge-rag, proofread, tool-windows, shell-overlays

- [x] 清单注册于 `builtin-manifests.ts`



### UI 接入



- [x] `WorkspaceDocumentViews.vue` — 遍历 `view-api` 注册表渲染全部文档视图

- [x] **`View API`** — `view-api/` + `host.views`；`Outline.vue` / `Visualize.vue` 使用 `useDocumentViewContext`；见 [09-VIEW-API.md](./09-VIEW-API.md)

- [x] **`ViewMenu.vue`** — 注册表驱动菜单；`llmEnabled` 门控校对；空白右键 + `viewMenuConfig` 配置对话框

- [x] `Main.vue` — `ai-runtime-ready` 门控 + `pluginRegistry.shellOverlays`

- [x] `SettingLlmSection.vue` — 开关与 `ai-runtime-toggle` 联动

- [x] **`LeftMenu.vue`** — AI 子菜单消费 `pluginRegistry.leftMenuItems`

- [x] **`FocusModeTabBarMenus.vue`** — 同上（经 `FOCUS_LEFT_MENU_API_KEY` 注入）

- [x] **`ArticleContextMenu.ts`** — 聚合 `pluginRegistry.contextMenuItems`

- [x] **三个 Editor** — `AISuggestionGhost` 改由 `host.editor.getOverlays()` 动态渲染；`SectionOptimizer` / `SelectionTranslateDialog` / `GraphQuickDialog` 改由 `registerEditorAccessory` + `useEditorAccessories` 动态渲染

- [x] **编辑器补全桥接** — `editor-completion-bridge.ts` + `completion` 插件事件处理；三个 Editor 不再直接 import `aiCompletionService`

- [x] **`App.vue`** — AI 补全全局监听迁入 `completion` 插件；Workshop 对话框 Steam 门控

- [x] **`GlobalHome.vue`** — Agent 输入区由 `registerHomeSection` + agent 插件提供

- [x] **`Setting.vue`** — 消费 `pluginRegistry.settingsSections`（knowledge-rag 注册知识库分区）；新增 **插件管理** 分区 `SettingPluginsSection.vue`



### 插件系统硬化



- [x] **运行时 `permissions` 校验** — `plugin-loader.ts` 未知权限 warn

- [x] **社区插件磁盘加载器** — `userData/plugins/` + IPC `community-plugins:*` + `community-plugin-loader.ts`

- [x] **`plugin-loader` disposer 映射** — `registerPluginDisposer` + 插件 `deactivate` 钩子（completion 示例）

- [x] **`activationEvents` 过滤** — `manifestMatchesActivation` + `loadBuiltinPlugins({ activationTrigger })`

- [x] **`onStartup` 插件** — `core/startup-plugins.ts` + `hello-world` 示例

- [x] **插件启用/禁用** — `disabledPluginIds` + `setPluginEnabled` / `activatePluginById`

- [x] **社区插件沙箱** — `sandboxed-host.ts` 权限门控 + IPC `resolve-entry` 路径校验

- [x] **ESLint** — `plugins/**` 禁止 import `stores/workspace`



### 归档与清理



- [x] Steam / Worker / 云文档迁入 `archived/`（见 [02-CLEANUP-LOG.md](./02-CLEANUP-LOG.md)）

- [x] 主进程 Steam **stub** 保留

- [x] **Steam 链路废弃归档** — OSS 删除 Workshop/云文档占位与 `WorkshopPublishDocumentDialog`；`greenworks` 从 `package.json` 移除；`locale-native-labels.ts` 替代 `steam-game-language.ts`

- [x] `extract-steam-archive.mjs` — 缺失文件 fallback（`68b5a7ec` / `HEAD`）

- [x] 删除 legacy：`express-server-legacy`, `rag-service-legacy`, `legacy-exports`

- [x] 移除 `capacitor.config.ts` 与部分一次性 scripts

- [x] `archived/README.md` 说明归档状态（Steam 已废弃，非恢复流程）

- [x] **`App.vue` Steam locale 冲突** — 已移除 OSS 路径上的启动检测



### 文档



- [x] `docs/open-source-refactor/` 全套索引（本目录）

- [x] `docs/README.md` 云小节指向 `archived/docs/cloud`



### 验收



- [x] `npm run build` 成功

- [x] `npm run test` 通过



---



## 待完成（延后 / 增强）



### 插件系统



- [x] **社区插件沙箱** — `createSandboxedHost` 权限门控；`community-plugins:resolve-entry` + 渲染进程 `import`；IPC 路径校验



### 物理拆分（不阻塞 OSS 首发）



- [ ] `workspace.ts` 拆为 `document-store` + `tab-store`

- [ ] `main-calls.ts` 按域拆 IPC 模块

- [ ] pnpm workspaces 物理拆包

- [ ] `SettingDebugSection.vue` 拆分



### Steam / 私有构建（已废弃）



- [x] **Steam 归档收尾** — 见 `archived/README.md` 与 [03-ARCHIVE-GUIDE.md](./03-ARCHIVE-GUIDE.md)；**不恢复** `archived/ci` 流水线

- [x] 渲染端残余 Steam locale 文案（i18n）保留无妨，运行时 util 已 stub



### 测试



- [x] **`llmEnabled` OSS gate E2E** — `e2e/run-oss-gate.mjs`（`npm run test:e2e:oss`）；断言 `llm-core` 与 agent 按需加载

- [x] **AI Capability 按需加载** — `ai-runtime/capabilities` + `ensureAiCapability`；`llmEnabled` 仅 `llm-core`；Tab/设置冷路径懒加载

- [x] **`ai-runtime/capabilities/registry.test.ts`** — ensure/unload 顺序与幂等

- [x] **开关往返** — E2E 覆盖开 → agent 按需 → 关；断言贡献点清零

- [x] **`outline-ai` 修复** — `activate` 使用 `host.events`（修复 AI 运行时加载中断）



---



## 验收标准（开源版）



1. 克隆仓库后 `cd meta-doc && npm install && npm run dev` 可启动，无需 Steam SDK

2. 默认 `llmEnabled === false`，设置中可 opt-in

3. Opt-in 后仅加载 `llm-core`；首次打开 Agent/校对/知识库等时对应 capability 加载

4. `archived/` 不参与默认构建



---



## 关键文件速查



| 用途 | 路径 |

|------|------|

| 启动 | `src/renderer/src/main.js` |

| Host API | `src/renderer/src/host-api/index.ts` |
| View API | `src/renderer/src/view-api/index.ts` |
| 视图参考实现 | `views/Outline.vue`, `views/Visualize.vue` |
| ViewMenu 配置 | `components/ViewMenuConfigDialog.vue` |

| AI 加载 | `src/renderer/src/ai-runtime/loader.ts` |

| 社区插件 IPC | `src/main/ipc/register-community-plugins-ipc.ts` |

| 编辑器配件 | `composables/useEditorAccessories.ts` |

| 启动插件 | `core/startup-plugins.ts` |

| E2E 钩子 | `core/e2e-hooks.ts` |

| 插件偏好 | `utils/plugin-preferences.ts` |

| 内置插件 | `src/renderer/src/plugins/builtin/` |

| 插件清单 | `src/renderer/src/plugins/builtin-manifests.ts` |

| 补全桥接 | `utils/editor-completion-bridge.ts` |

| OSS E2E | `e2e/run-oss-gate.mjs` |

| 示例插件 | `src/renderer/src/plugins/examples/hello-world.ts` |

| 沙箱 Host | `core/sandboxed-host.ts` |
| 插件权限 | `core/plugin-permissions.ts` |


