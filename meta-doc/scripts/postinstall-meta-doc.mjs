/**
 * meta-doc postinstall：Electron 二进制、原生模块、可选 Steam/Greenworks。
 * 默认跳过 greenworks 相关脚本；Steam 开发/CI 请设置 VITE_METADOC_STEAM=true。
 * 强制跳过（即使开了 Steam）：SKIP_STEAM_NATIVE=1
 */
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

function run(cmd) {
  execSync(cmd, { cwd: root, stdio: 'inherit', env: process.env })
}

run('node scripts/postinstall-electron.js')
try {
  run('npx electron-builder install-app-deps')
} catch {
  console.warn(
    '[postinstall-meta-doc] electron-builder install-app-deps failed (optional native deps may need manual setup)'
  )
}
run('npm run rebuild-native')

const steamOn = process.env.VITE_METADOC_STEAM === 'true'
const forceSkip = process.env.SKIP_STEAM_NATIVE === '1'
if (steamOn && !forceSkip) {
  run('node scripts/ensure-greenworks-installed.mjs')
  run('node scripts/prepare-steamworks-sdk.mjs')
  run('node scripts/rebuild-greenworks-if-present.mjs')
} else {
  console.log(
    '[postinstall-meta-doc] Skipping greenworks / Steamworks SDK steps (set VITE_METADOC_STEAM=true to enable; npm run greenworks:rebuild still works manually)'
  )
}
