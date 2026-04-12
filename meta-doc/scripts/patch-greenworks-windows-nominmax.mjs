/**
 * greenworks 在 Windows + MSVC 下编译 Electron 31+ 时，若未定义 NOMINMAX，
 * Windows.h 的 min/max 宏会破坏 v8-function-callback.h（C2062 / C2059）。
 * 在 electron-rebuild 前对本机 node_modules/greenworks/binding.gyp 做幂等补丁。
 */
import fs from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const gyp = join(root, 'node_modules', 'greenworks', 'binding.gyp')

if (process.platform !== 'win32') {
  process.exit(0)
}

if (!fs.existsSync(gyp)) {
  console.warn('[greenworks] 未找到 node_modules/greenworks/binding.gyp，跳过 NOMINMAX 补丁')
  process.exit(0)
}

let s = fs.readFileSync(gyp, 'utf8')
if (s.includes('NOMINMAX')) {
  process.exit(0)
}

const needle = `      'conditions': [
        ['OS== "linux"',
          {`

const patch = `      'conditions': [
        ['OS== "win"', {
          'defines': [
            'NOMINMAX',
            'WIN32_LEAN_AND_MEAN'
          ]
        }],
        ['OS== "linux"',
          {`

if (!s.includes(needle)) {
  console.error(
    '[greenworks] binding.gyp 结构与预期不符，无法自动注入 NOMINMAX。请升级脚本或手工在 Win 目标上添加 defines: NOMINMAX, WIN32_LEAN_AND_MEAN'
  )
  process.exit(1)
}

fs.writeFileSync(gyp, s.replace(needle, patch), 'utf8')
console.log('[greenworks] 已为 binding.gyp 注入 NOMINMAX / WIN32_LEAN_AND_MEAN（Windows + V8）')
