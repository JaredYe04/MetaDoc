/**
 * 生产构建入口（历史名称保留，避免破坏 CI / 本地脚本）。
 *
 * electron-vite 2.x 在内部已按 main → preload → renderer 顺序依次 await build，
 * 并不会并行跑三套 Vite。此前通过 ELECTRON_VITE_BUILD_TARGET 分步调用在 2.x 中无效，
 * 会导致完整构建重复执行三次，徒增耗时与内存压力。
 *
 * 低内存相关优化见 electron.vite.config.mjs（reportCompressedSize、manualChunks 等）。
 */

const { execSync } = require('child_process')
const path = require('path')

const rootDir = path.resolve(__dirname, '..')

console.log('生产构建（electron-vite：main → preload → renderer 顺序）...\n')

try {
  execSync('npx electron-vite build', {
    cwd: rootDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV || 'production'
    }
  })
  console.log('\n构建完成')
} catch (e) {
  process.exit(e.status ?? 1)
}
