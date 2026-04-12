/**
 * greenworks 为可选依赖：已安装且具备 Steamworks SDK 时再 electron-rebuild。
 * 缺少 SDK 时跳过（退出 0），避免 postinstall 整链失败。
 * @see https://github.com/greenheartgames/greenworks/blob/master/docs/build-instructions-electron.md
 */
import { existsSync } from 'fs'
import { spawnSync } from 'child_process'
import { getGreenworksRoot, hasSteamworksSdk } from './greenworks-has-sdk.mjs'

const root = process.cwd()
const gw = getGreenworksRoot(root)
const requireSdk = process.argv.includes('--require')

if (!existsSync(gw)) {
  if (requireSdk) {
    console.error('[greenworks] 未安装 greenworks，请先 npm install')
    process.exit(1)
  }
  process.exit(0)
}

if (!hasSteamworksSdk(root)) {
  const msg =
    '[greenworks] 未检测到 Steamworks SDK。请在仓库根目录放置 steamworks_sdk/，或配置 STEAMWORKS_SDK_PATH / STEAMWORKS_SDK_ZIP / STEAMWORKS_SDK_ARCHIVE_URL（npm install 会自动链入）。详见 npm run greenworks:setup'
  if (requireSdk) {
    console.error(msg)
    process.exit(1)
  }
  console.warn(`${msg}（跳过 electron-rebuild）`)
  process.exit(0)
}

if (process.platform === 'win32') {
  const patch = spawnSync('node', ['scripts/patch-greenworks-windows-nominmax.mjs'], {
    stdio: 'inherit',
    shell: true,
    cwd: root
  })
  if (patch.status !== 0) {
    process.exit(patch.status ?? 1)
  }
}

const r = spawnSync(
  'npx',
  ['electron-rebuild', '-f', '-w', 'greenworks', '--only', 'greenworks'],
  { stdio: 'inherit', shell: true, cwd: root }
)
process.exit(r.status ?? 1)
