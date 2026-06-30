# 归档目录指南（`archived/`）

仓库根目录 [`archived/`](../../../archived/) 存放从开源 `meta-doc` 树移出的 **Steam、官方云、Worker 后端** 代码与资产。默认 `npm run dev` / `npm run build` **不需要**此目录。

权威布局说明亦见 [`archived/README.md`](../../../archived/README.md)。

## 状态说明（2026-06）

**Steam / 官方云发行链路已废弃**，`archived/` 仅作历史参考，**不恢复** `.github/workflows/*steam*` 或 Steam CI。开源版默认构建零 Steam / Greenworks 依赖。

---

## 目录结构

```
archived/
├── README.md
├── ci/                              # 原 .github/workflows/*steam*
│   ├── release-steam.yml
│   └── steam-connectivity-test.yml
├── cloudflare-worker/               # AI 代理、计费、Steam MTX 后端
│   ├── src/
│   ├── migrations/
│   ├── wrangler.toml
│   └── package.json
├── docs/
│   ├── RELEASE_AND_STEAM.md
│   └── cloud/                       # 定价、经济学、go-live
├── electron-builder.steam.yml
└── steam/
    ├── common/                      # steam-achievements, stats, game-language
    ├── main/                        # Greenworks、IPC、云同步、Workshop
    ├── renderer/                    # 托盘、云文档 UI、MTX、认证工具
    ├── scripts/                     # SDK / 库存 / 本地化生成（若已迁入）
    └── third-party/                 # steamworks-sdk, achievements, inventory
```

---

## 与 OSS 树的对应关系

| `archived/` | 原 `meta-doc` 位置 | OSS 树中的替代 |
|-------------|-------------------|----------------|
| `steam/main/` | `src/main/steam/*.ts`（非 stub） | `src/main/steam/*.stub.ts` |
| `steam/renderer/` | 各 Steam 专用 Vue / utils | 已删除；`steam-client.ts` 等 no-op 桩保留 |
| `steam/common/` | `src/common/steam-*.ts` | OSS 删除；`locale-native-labels.ts` 保留通用 locale 标签 |
| `cloudflare-worker/` | `meta-doc/cloudflare-worker/` | 无；自托管 LLM 直连 |
| `docs/cloud/` | `meta-doc/docs/cloud/` | 从 `meta-doc/docs/README.md` 移除云小节 |
| `ci/*.yml` | `.github/workflows/` | 标准 release workflow only |

---

## OSS 树中的 Steam 桩（Stubs）

`meta-doc/src/main/steam/` 仅保留：

- `steam-runtime.stub.ts`
- `register-steam-ipc.stub.ts`
- `steam-app-lifecycle-hooks.stub.ts`
- `steam-first-doc-achievements.stub.ts`
- `user-templates-steam-push.stub.ts`

桩模块导出与真实模块相同的符号，实现为空操作或返回 `null` / `false`，使 TypeScript 与 bundler 无需条件编译即可通过。

---

## 恢复 Steam / 官方云构建（已废弃 — 仅私有 fork 参考）

> 开源项目**不再维护**此链路。以下内容仅供维护私有 Steam 分支时查阅历史资产。

适用于私有 fork 或内部发布流水线：

1. **复制或 symlink** `archived/steam/**` 回 `meta-doc/src/` 对应路径（`main/steam`、`common`、`renderer` 等）。
2. **恢复 Worker**：将 `archived/cloudflare-worker/` 链回 `meta-doc/cloudflare-worker/` 或独立部署。
3. **恢复 CI**：`archived/ci/*.yml` → `.github/workflows/`。
4. **恢复打包配置**：使用 `archived/electron-builder.steam.yml` 替换或合并 electron-builder 配置。
5. **安装 Greenworks**：按 `archived/steam/third-party/` 与 `steam/main/greenworks-loader.ts` 说明链接原生模块。
6. **环境变量**：Worker 侧配置 `archived/cloudflare-worker/.env.vars`（**勿提交**）；客户端配置官方云 API 端点。

详细发布步骤见 `archived/docs/RELEASE_AND_STEAM.md` 与 `archived/docs/cloud/STEAM_CLOUD_GO_LIVE.md`。

---

## 本地开发注意事项

| 路径 | 说明 |
|------|------|
| `archived/cloudflare-worker/.wrangler/state/` | Miniflare D1 本地状态，应 gitignore |
| `archived/cloudflare-worker/.env.vars` | 密钥模板，勿入库 |
| `archived/steam/third-party/steam-inventory/upload-config.local.json` | 本地库存上传配置 |

---

## 何时更新归档

- 从 OSS 树**移除**新的商业专用代码时：迁入 `archived/` 并在 [02-CLEANUP-LOG.md](./02-CLEANUP-LOG.md) 记录。
- Steam SDK 升级：仅更新 `archived/steam/third-party/`，OSS 树不变。
- 文档仅面向 Steam 运营：放 `archived/docs/`，勿放回 `meta-doc/docs/` 主索引。
