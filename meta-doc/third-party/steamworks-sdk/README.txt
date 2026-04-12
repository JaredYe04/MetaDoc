Steamworks SDK（随私有仓库提交）

1. 从 Steam Partner 下载官方 SDK 压缩包（须遵守 Valve 许可）。
2. 将 zip 文件放在本目录下，命名为以下之一（按优先级）：
   - SteamworksSDK.zip   （推荐）
   - steamworks_sdk.zip
   - steamworks.zip
3. 提交该 zip 后，其他成员 clone 后执行 npm install / pnpm install 即可自动解压并链接到 greenworks，无需再拷 node_modules。
4. 更新 SDK 时替换同名 zip 并提交；下次安装依赖或运行 npm run greenworks:prepare 时会按文件变更自动重新解压。

说明：解压缓存位于仓库根目录 .steamworks/（已 gitignore）；最终用户安装包内不包含本 zip（见 electron-builder 排除规则）。
