# Steam / Greenworks 集成（可选、默认不编入发行构建）

本目录为 **可选** 桌面端 Steam 能力（Greenworks、云存档、创意工坊、微交易等）。  
默认 **不** 编译进主进程、**不** 打入安装包；需显式打开构建开关并合并 electron-builder 配置。

## 何时启用

1. **环境变量**：构建前设置 `VITE_METADOC_STEAM=true`（与 Vite / electron-vite 一致）。  
   Steam **商店**形态另需 `VITE_STEAM_DISTRIBUTION=true`（见 `src/common/build-env.ts`）。
2. **依赖**：`npm install` 时若需自动编译 greenworks，请同时设置 `VITE_METADOC_STEAM=true`；否则默认跳过 greenworks 脚本，可本地执行 `npm run greenworks:rebuild`。
3. **打包**：Steam depot 构建在 `electron-builder` 时须合并  
   `-c electron-builder.yml -c electron-builder.steam.yml`（参见仓库根 `package.json` 的 `build:steam:win`）。
4. **CI**：`.github/workflows/release-steam.yml` 已设置上述变量与双配置合并。

## 相关文件

| 用途 | 路径 |
|------|------|
| 主进程门面（无 Steam 构建走 stub） | `steam-runtime.real.ts` / `steam-runtime.stub.ts` |
| 启动/退出 playtime、成就、统计 flush | `steam-app-lifecycle-hooks.real.ts` / `.stub.ts` |
| 用户模板变更 → 云推送调度（与 `user-templates-ipc` 解耦） | `user-templates-steam-push.ts` / `.stub.ts` |
| IPC 注册 stub | `register-steam-ipc.stub.ts` |
| 首次文档成就（供 main-calls） | `steam-first-doc-achievements.ts` |
| 打包合并片段 | `../electron-builder.steam.yml`（相对本目录为 `meta-doc/electron-builder.steam.yml`） |
| 发版说明 | 仓库根 `docs/RELEASE_AND_STEAM.md` |

## 跳过原生（应急）

`SKIP_STEAM_NATIVE=1` 时，即使 `VITE_METADOC_STEAM=true` 也会在 postinstall 中跳过 greenworks 步骤。
