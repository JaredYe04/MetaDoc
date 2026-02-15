/**
 * 分步构建脚本：先构建 main，再构建 renderer
 * 用于减少内存峰值，避免在 CI 中内存溢出
 *
 * 直接使用 vite 命令分别构建不同的目标
 */

const { execSync } = require('child_process')
const path = require('path')

const rootDir = path.resolve(__dirname, '..')

console.log('🚀 开始分步构建...\n')

// 增强 GC 参数以减少内存使用
// 注意：只有部分 Node.js 选项可以在 NODE_OPTIONS 中使用
// --optimize-for-size 和 --always-compact 不能通过 NODE_OPTIONS 设置
const enhancedNodeOptions = [process.env.NODE_OPTIONS || '', '--expose-gc']
  .filter(Boolean)
  .join(' ')

const buildEnv = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV || 'production',
  NODE_OPTIONS: enhancedNodeOptions || process.env.NODE_OPTIONS
}

try {
  // 1. 构建 main 进程
  console.log('📦 步骤 1/3: 构建 main 进程...')
  execSync('npx electron-vite build', {
    cwd: rootDir,
    stdio: 'inherit',
    env: {
      ...buildEnv,
      ELECTRON_VITE_BUILD_TARGET: 'main'
    }
  })
  console.log('✅ main 进程构建完成\n')

  // 2. 构建 preload
  console.log('📦 步骤 2/3: 构建 preload...')
  execSync('npx electron-vite build', {
    cwd: rootDir,
    stdio: 'inherit',
    env: {
      ...buildEnv,
      ELECTRON_VITE_BUILD_TARGET: 'preload'
    }
  })
  console.log('✅ preload 构建完成\n')

  // 3. 构建 renderer 进程
  console.log('📦 步骤 3/3: 构建 renderer 进程...')
  execSync('npx electron-vite build', {
    cwd: rootDir,
    stdio: 'inherit',
    env: {
      ...buildEnv,
      ELECTRON_VITE_BUILD_TARGET: 'renderer'
    }
  })
  console.log('✅ renderer 进程构建完成\n')

  console.log('🎉 所有构建步骤完成！')
} catch (error) {
  console.error('❌ 构建失败:', error.message)
  process.exit(1)
}
