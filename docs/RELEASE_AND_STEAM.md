# MetaDoc 发布手册：GitHub Releases 与 Steam

本文说明桌面端 **版本线如何统一**，以及 **GitHub Releases** 与 **Steam（SteamPipe）** 两套 CI 的分工、配置与常见操作。

---

## 1. 总览

| 项目 | 说明 |
|------|------|
| **版本源** | `meta-doc/package.json` 与脚本 `meta-doc/scripts/get-version-info.js`、`get-release-info.js` 等；**两条工作流共用同一套逻辑**。 |
| **GitHub Releases** | 工作流：`.github/workflows/release-unified.yml`；产物进入 **`{owner}/MetaDoc-Releases`**（NSIS / AppImage / deb / snap / dmg / zip 等）。 |
| **Steam** | 工作流：`.github/workflows/release-steam.yml`；使用 **electron-builder `dir` 目标** 生成目录型产物，经 [game-ci/steam-deploy](https://github.com/game-ci/steam-deploy) 调用 SteamCMD 上传。构建时设置 **`VITE_METADOC_STEAM=true`** 并合并 **`electron-builder.steam.yml`** 以打入 Greenworks（默认发行构建不包含）。详见 `meta-doc/src/main/steam/README.md`。 |
| **上架 Steam 商店** | CI **只负责上传构建**；在 Steamworks 看到「有未发布的更改」后，仍需在 **「发布」** 页提交。参见 [Uploading to Steam](https://partner.steamgames.com/doc/sdk/uploading)。 |

典型分工示例：

- **快照 / 内测**：`release-unified` + `channel=dev` → 标签与资产在 GitHub Releases。
- **正式版上 Steam**：`release-steam` + `channel=prod` + 版本递增 → 同一套版本号推进，但产物只走 SteamPipe。

请勿对 **同一版本** 并行触发两次「会改 `package.json` / 打标签」的工作流，以免冲突。

---

## 2. 工作流入口

### 2.1 `release-unified.yml`（GitHub Releases）

- **触发**：手动 `workflow_dispatch`，或推送标签 `v*`、`dev-*`。
- **行为**：与历史一致——多矩阵构建后，用 `softprops/action-gh-release` 上传到 MetaDoc-Releases。

### 2.2 `steam-connectivity-test.yml`（Steam 发布前置校验）

- **触发**：手动 `workflow_dispatch`。
- **作用（与 `release-steam` 对齐的思路）**：
  1. **写入 `config.vdf`**：支持 Secret 为 Base64 或明文；同步到 `~/Steam` 与 `~/.local/share/Steam`（与此前登录修复一致）。
  2. **SteamCMD**：`+login` 后执行 **`app_info_print <AppID>`**，检查退出码与日志，确认账号能读到 **AppID 4359310** 的元数据；并尽量在输出中匹配 **Depot 4359311**（默认 depot1），不匹配时仅告警（Steam 文本格式可能变化）。
  3. **SteamPipe / game-ci（默认开启）**：在仓库内生成 **仅含一个文本文件** 的 `steam_probe/windows/`，调用与 **`release-steam` 相同的 `game-ci/steam-deploy@v3`**（`rootPath` + `depot1Path: windows`，`releaseBranch` 留空），向 **Depot 4359311** 上传一次**真实构建**。用于验证 **上传权限、SteamPipe、与发版相同的 Docker 链路**。
- **参数 `skip_depot_upload`**：选 **`yes`** 时只做步骤 1～2，**不在 Steam 上产生新构建**；日常快速验账号可用。发版前建议至少跑一次 **`no`**，确保上传链路也通过。
- **与发版的差异**：本工作流**不**跑 Electron 构建；若此处通过且 `release-steam` 矩阵构建成功，则 Steam 侧失败概率已很低（剩余风险主要是 depot 内容过大、网络波动、Steam 服务端临时问题等）。
- **可选 Secret `STEAM_PASSWORD`**：与密码/TOTP 登录方式配合使用；仅用 sentry 时可不配。

### 2.3 `release-steam.yml`（仅 Steam）

- **触发**：仅 **手动** `workflow_dispatch`（避免与标签发版混触）。
- **行为**：
  1. `prepare`：与 unified 相同思路——读版本、写回仓库、`create-release-tag.js` 打标签。
  2. `release`：各平台使用 **`electron-builder --* dir`**，将目录产物作为 **artifact** 上传。
  3. `steam_deploy`：在 `ubuntu-latest` 上拉取 artifact，调用 `game-ci/steam-deploy@v3`（**Docker 内 SteamCMD**，故不能放在 Windows runner 上跑该 Action）。

参数中与 unified 对齐的包括：`channel`、`version_type`、`custom_version`、各平台 Runner、`release_notes`（用于生成 `final-notes.txt` 与发布日志；**Steam 商店文案仍在 Steamworks 编辑**）。Steam 工作流**始终完整构建**各启用平台，不提供「跳过构建」选项。

额外参数：

- **`steam_release_branch`**：传给 game-ci 的 `releaseBranch`（自动设为该分支默认构建）。**留空**表示只上传、不 setlive。请勿使用分支名 **`default`**（[已知问题](https://github.com/game-ci/steam-deploy/issues/19)）。在 Steamworks 中先创建好测试分支（如 `beta`）再填写此处。

---

## 3. 共用版本线（如何实现「快照走 GitHub、正式走 Steam」）

两条流水线都调用：

- `get-version-info.js` / `get-release-info.js`
- `commit-version-changes.js`（手动运行时）
- `create-release-tag.js`

因此 **semver 与标签规则一致**，例如：

1. 先用 `release-unified` 发 `dev-*` 快照，收集反馈。
2. 再用 `release-steam` 选择 `prod` + `patch`/`minor`/`major` 推进正式版并上传 Steam。

若某次 **只想上传 Steam、不再改版本号**，需要当前仓库尚未被其他流程占用的标签/提交策略；一般更稳妥的是 **每次 Steam 正式发版仍通过该工作流显式选版本类型**，与团队流程对齐。

---

## 4. Steam 应用与 Depot 规划（MetaDoc）

当前工作流中环境变量：

- **`STEAM_APP_ID`**：`4359310`（与 Steamworks 应用一致）。

[game-ci/steam-deploy](https://github.com/game-ci/steam-deploy) 按 **槽位** `depot1Path` … `depot4Path` 生成清单，**DepotID = (AppID + 1) + (槽位索引 − 1)**（未设置 `firstDepotIdOverride` 时）：

| 槽位 | 相对 `rootPath` 的目录名 | 默认 Depot ID | 内容来源（本仓库） |
|------|-------------------------|---------------|-------------------|
| 1 | `windows` | **4359311** | `meta-doc/dist/win-unpacked/` |
| 2 | `linux` | **4359312** | `meta-doc/dist/linux-unpacked/` |
| 3 | `mac-arm64` | **4359313** | `meta-doc/dist/mac-arm64/` |
| 4 | `mac-x64` | **4359314** | `meta-doc/dist/mac/`（electron-builder 对 Intel 常用 `mac` 目录） |

你已在 Steamworks 中有 **4359311「MetaDoc Content」**。若要在 Steam 上交付 **Linux / Mac**，通常需要在合作伙伴后台 **新建对应 Depot**（4359312、4359313、4359314 等），配置 **OS / 架构**，并加入正确的 **程序包**；否则上传会失败或与预期不符。

`steam_deploy` 会根据 **实际下载到的 artifact** 决定哪些槽位非空；**未构建成功的平台不会写入对应 depot**（槽位仍保留，与上表 ID 对齐）。

---

## 5. GitHub Secrets（Steam 工作流）

在仓库 **Settings → Secrets and variables → Actions** 中配置：

| Secret | 说明 |
|--------|------|
| `STEAM_USERNAME` | Steam **构建账号**（建议单独账号，仅具备应用相关上传/发布权限）。参见 [Build Account](https://partner.steamgames.com/doc/sdk/uploading#Build_Account)。 |
| `STEAM_CONFIG_VDF` | **发版（release-steam / game-ci）**：须为 `config/config.vdf` 整文件内容的 **Base64 单行**（见 [steam-deploy README](https://github.com/game-ci/steam-deploy/blob/main/README.md)）。**连通性测试**工作流也支持把 **明文** `config.vdf` 直接放进 Secret 做自检；测试通过后发版请仍按 Base64 要求配置。 |
| `GH_TOKEN` | 与 unified 相同，用于打标签、写版本提交等（若已有则复用）。 |

### 5.1 SteamCMD 在哪里下载

- **官方说明与下载入口**（需登录 Steamworks 合作伙伴账号后访问）：[Steam 文档：Uploading to Steam](https://partner.steamgames.com/doc/sdk/uploading) 中的 **SteamCMD** 小节；该页提供 **Windows / macOS / Linux** 的获取方式（通常为压缩包或安装说明）。
- **GitHub Actions**：本仓库的 `release-steam` 使用 [game-ci/steam-deploy](https://github.com/game-ci/steam-deploy)，其 Docker 镜像内已包含 SteamCMD，**无需**在 CI 里再单独下载；你本机生成 `config.vdf` 时才需要安装 SteamCMD。

### 5.2 排查：`Cached credentials not found` 与 `ERROR (Invalid Password)`

这**通常不是**你记错了 Steam 网页密码，而是 **SteamCMD 没找到本机登录缓存（sentry）**，于是退回到「用户名 + 密码」流程；CI 里密码为空，就显示 **Invalid Password**。

常见原因与处理：

1. **`config.vdf` 只有一两百字节**：说明 Secret 里**不是**完整配置文件（或把内容弄错/截断）。含 Steam Guard sentry 的 `config.vdf` 通常 **至少约 1KB 量级**。请在本机 **`steamcmd +login <构建账号> +quit` 成功结束** 后，再复制 **完整** `config/config.vdf`（Windows/Linux 路径见 Steam 文档；与运行 steamcmd 时的数据目录一致）。
2. **Linux 上凭据路径**：`steam-connectivity-test` 会把 `config.vdf` 同时放到 **`~/Steam/config`** 与 **`~/.local/share/Steam/config`** 再进容器。
3. **仅复制了部分文件**：若本机还有 **`ssfn*` / `loginusers.vdf`** 等与该账号绑定的文件，有时需要整份 `config` 目录在 SteamCMD 使用过的环境下保持一致；可优先在同一台机器、同一 SteamCMD 工作目录完成登录后再取 `config.vdf`。
4. **确需密码登录**：在仓库增加 **`STEAM_PASSWORD`**（或改用 TOTP 方案），连通性测试在配置了密码时会把它传给 `+login`。

**可选替代认证**：使用 **TOTP** + 密码时，可按 game-ci README 的 Option B，在 `release-steam.yml` 中自行增加 `CyberAndrii/steam-totp` 等步骤，并改为传入 `password` / `totp`、不传 `configVdf`。

---

## 6. Steamworks 侧必做事项（CI 无法代替）

1. **启动项**：为 Windows / Linux / macOS 配置正确的可执行文件路径（例如 Windows 下 `meta-doc.exe`，Mac 为 bundle 内可执行文件等）。
2. **Depot 语言与架构**：与各 Depot 实际内容一致。
3. **发布**：上传成功后，在 **「发布」** 选项卡提交更改，用户端才会更新。
4. **未发布的更改**：若仅上传未发布，Steam 后台会持续提示「有未发布的更改」——属正常现象，直到你完成发布流程。

---

## 7. 构建产物路径与升级 electron-builder 时

若升级 **electron-builder** 后 CI 在「上传 artifact」阶段报路径不存在，请在本机执行对应 `dir` 构建，确认：

- Linux：`dist/linux-unpacked/`
- Windows：`dist/win-unpacked/`
- Mac ARM64：`dist/mac-arm64/`
- Mac x64：`dist/mac/`

然后必要时修改 `release-steam.yml` 中 **`upload-artifact` 的 `path:`**。

---

## 8. 参考链接

- [Steam：Uploading to Steam](https://partner.steamgames.com/doc/sdk/uploading)
- [game-ci/steam-deploy](https://github.com/game-ci/steam-deploy)
- [electron-builder：macOS](https://www.electron.build/mac.html)

---

## 9. 变更记录（维护者可追加）

| 日期 | 说明 |
|------|------|
| 2026-04-11 | 初版：拆分 `release-steam.yml`，与 `release-unified.yml` 共用版本脚本；支持 Win/Linux/Mac 多 depot 上传说明。 |
| 2026-04-11 | Steam 工作流移除 `force_rebuild` 输入，固定为始终构建；手册补充 SteamCMD 下载说明。 |
| 2026-04-11 | 新增 `steam-connectivity-test.yml`：仅 SteamCMD 登录自检。 |
| 2026-04-11 | 连通性测试：同时挂载 `~/.local/share/Steam/config` 与 `~/Steam/config`，避免 Linux steamcmd 找不到 sentry。 |
| 2026-04-11 | `steam-connectivity-test`：增加 `app_info_print` 与可选 game-ci 最小包上传，贴近 `release-steam` 验证面。 |