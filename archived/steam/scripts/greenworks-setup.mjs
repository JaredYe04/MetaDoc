/**
 * 打印 MetaDoc 中 Steamworks / greenworks 的自动化配置说明。
 */
import { existsSync } from 'fs'
import { join } from 'path'
import {
  getGreenworksRoot,
  hasSteamworksSdk,
  hasSteamworksSdkSourceHint,
  hasRepoSteamworksZip
} from './greenworks-has-sdk.mjs'

const root = process.cwd()
const gw = getGreenworksRoot(root)

console.log(`
MetaDoc — Steamworks SDK（全自动）
================================================================

【推荐 · 私有仓库】将 Valve 官方 SDK 压缩包提交到仓库：

  ${join('third-party', 'steamworks-sdk', 'SteamworksSDK.zip')}

也可使用文件名：steamworks_sdk.zip 或 steamworks.zip（见该目录下 README.txt）。

npm install / pnpm install 时会自动：
  解压 → .steamworks/steamworks_sdk（已 gitignore）→ 链入 greenworks deps
若你更新了 zip 并提交，同事 pull 后下次安装依赖会按 zip 变更自动重新解压。

可选覆盖（本地调试）：
  STEAMWORKS_SDK_PATH、仓库根目录 steamworks_sdk/、STEAMWORKS_SDK_ZIP、STEAMWORKS_SDK_ARCHIVE_URL

未配置时静默跳过，不影响不使用 Steam 的同事。

手动：npm run greenworks:prepare  |  npm run greenworks:rebuild
steam_appid.txt 在 meta-doc 项目根目录，内容仅为数字 AppID；开发时可直接 pnpm dev，无需从 Steam 商店启动。
若 Electron 升级后 Steam 失效，请在 meta-doc 下重跑：pnpm run greenworks:rebuild

当前状态：
- node_modules/greenworks: ${existsSync(gw) ? '已安装' : '未安装'}
- 仓库内 SDK zip: ${hasRepoSteamworksZip(root) ? '已检测到' : '未检测到（请放入 third-party/steamworks-sdk/）'}
- deps 已就绪（可编译）: ${hasSteamworksSdk(root) ? '是' : '否'}
- 任一 SDK 来源: ${hasSteamworksSdkSourceHint(root) ? '是' : '否'}
${
  !existsSync(gw) && hasRepoSteamworksZip(root)
    ? `
⚠ 已检测到仓库 zip 但 greenworks 未落盘（多为首次 install 时 optional 在未链 SDK 前编译失败）。
  下次 \`npm install\` / \`pnpm install\` 的 postinstall 会自动补装；或手动：
  npm install greenworks@github:greenheartgames/greenworks --ignore-scripts
  然后：npm run greenworks:rebuild
  （pnpm：pnpm add -O greenworks@github:greenheartgames/greenworks --ignore-scripts 后 pnpm run greenworks:rebuild）
`
    : ''
}`)
