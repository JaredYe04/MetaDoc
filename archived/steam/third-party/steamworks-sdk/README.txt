Steamworks SDK（随私有仓库提交）

1. 从 Steam Partner 下载官方 SDK 压缩包（须遵守 Valve 许可）。
2. 将 zip 文件放在本目录下，命名为以下之一（按优先级）：
   - SteamworksSDK.zip   （推荐）
   - steamworks_sdk.zip
   - steamworks.zip
3. 提交该 zip 后，其他成员 clone 后执行 npm install / pnpm install 即可自动解压并链接到 greenworks，无需再拷 node_modules。
4. 更新 SDK 时替换同名 zip 并提交；下次安装依赖或运行 npm run greenworks:prepare 时会按文件变更自动重新解压。

说明：解压缓存位于仓库根目录 .steamworks/（已 gitignore）；最终用户安装包内不包含本 zip（见 electron-builder 排除规则）。

Steam 成就与统计的 API 名、VDF、图标、映射表与上传说明见仓库 meta-doc/third-party/steam-achievements/（含 STEAM_ACHIEVEMENTS_AND_STATS.md）；成就与 Stat 名称须与 Steamworks 配置及 src/common 下 steam-achievement-registry、steam-stats 常量一致后再上传本地化。

成就多语言 VDF 由脚本生成：在 meta-doc 目录执行 pnpm generate-steam-loc-vdf；输出与映射表位于 third-party/steam-achievements/。
