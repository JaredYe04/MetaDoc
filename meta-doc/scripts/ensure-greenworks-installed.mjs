/**
 * optionalDependencies 中的 greenworks 若在首次 npm install 时因缺 SDK 导致原生编译失败，
 * 包体会被静默省略。若仓库已提交 third-party/.../SteamworksSDK.zip，则在此用 --ignore-scripts
 * 补装包体，供后续 prepare-steamworks-sdk 链入 deps 并由 rebuild-greenworks 编译。
 */
import { existsSync } from 'fs'
import { spawnSync } from 'child_process'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { getGreenworksRoot, hasRepoSteamworksZip } from './greenworks-has-sdk.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const GW = getGreenworksRoot(root)
const SPEC = 'greenworks@github:greenheartgames/greenworks'

if (existsSync(GW)) {
  process.exit(0)
}

if (!hasRepoSteamworksZip(root)) {
  process.exit(0)
}

function runNpmInstall() {
  const r = spawnSync(
    'npm',
    ['install', SPEC, '--ignore-scripts', '--no-audit', '--no-fund'],
    { stdio: 'inherit', cwd: root, shell: true }
  )
  return r.status ?? 1
}

function runPnpmAdd() {
  const r = spawnSync(
    'pnpm',
    ['add', '-O', SPEC, '--ignore-scripts', '--no-audit'],
    { stdio: 'inherit', cwd: root, shell: true }
  )
  return r.status ?? 1
}

const ua = process.env.npm_config_user_agent ?? ''
const usePnpm = ua.includes('pnpm')

console.log(
  '[greenworks] 检测到仓库内 Steamworks SDK zip，但 node_modules/greenworks 缺失；正以 --ignore-scripts 补装包体…'
)

const code = usePnpm ? runPnpmAdd() : runNpmInstall()
process.exit(code === 0 ? 0 : code)
