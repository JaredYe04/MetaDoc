/**
 * 获取版本信息的 Node.js 脚本
 * 用于在 Windows 本地环境和 GitHub Actions 中替代 bash 脚本
 *
 * 用法:
 *   node scripts/get-version-info.js [version] [version_bump]
 *
 * 参数:
 *   version: 可选，直接指定版本号
 *   version_bump: 可选，版本升级类型 (major/minor/patch/rebuild)
 *
 * 逻辑:
 *   1. 如果提供了 version 参数，直接使用该版本
 *   2. 如果提供了 version_bump 参数，根据当前版本进行升级
 *   3. 否则，从 version.json 或 package.json 读取当前版本（不升级）
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const rootDir = path.resolve(__dirname, '..')
const versionJsonPath = path.join(rootDir, 'version.json')
const packageJsonPath = path.join(rootDir, 'package.json')
const versionManagerPath = path.join(__dirname, 'version-manager.js')

// 引入版本管理模块
const versionManager = require('./version-manager.js')

function getCurrentVersionFromFile() {
  // 尝试从 version.json 读取
  if (fs.existsSync(versionJsonPath)) {
    try {
      const versionData = JSON.parse(fs.readFileSync(versionJsonPath, 'utf-8'))
      if (versionData.version) {
        return versionData.version
      }
    } catch (error) {
      // 忽略错误，继续尝试其他方法
    }
  }

  // 尝试从 package.json 读取
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageData = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
      if (packageData.version) {
        // 如果版本没有 Beta 前缀，添加它
        return packageData.version.startsWith('Beta')
          ? packageData.version
          : `Beta${packageData.version}`
      }
    } catch (error) {
      // 忽略错误
    }
  }

  // 默认版本
  return 'Beta0.0.1'
}

function getVersionFromTag(ref) {
  // 从 git ref 中提取版本号
  // refs/tags/v1.2.3 -> Beta1.2.3
  // refs/tags/dev-1.2.3 -> Beta1.2.3
  if (ref) {
    const match = ref.match(/refs\/tags\/(?:dev-)?v?(\d+\.\d+\.\d+)/)
    if (match) {
      return `Beta${match[1]}`
    }
  }
  return null
}

function getVersion() {
  const args = process.argv.slice(2)
  // 处理命令行参数：如果参数是空字符串，当作 null 处理
  const versionArg = args[0] && args[0].trim() !== '' ? args[0].trim() : null
  const versionBumpArg = args[1] && args[1].trim() !== '' ? args[1].trim() : null

  // 优先从环境变量获取 version_bump（GitHub Actions）
  const versionBump = process.env.INPUT_VERSION_BUMP || versionBumpArg || null

  // 如果提供了 LATEST_VERSION 环境变量（复用最新版本模式），直接使用该版本号
  // 注意：在复用最新版本模式下，不应该进行版本升级
  const latestVersion = process.env.LATEST_VERSION || null
  if (latestVersion && latestVersion.trim() !== '') {
    try {
      let targetVersion = latestVersion.trim()
      if (!targetVersion.startsWith('Beta')) {
        // 如果版本号是纯数字格式（如 0.17.9），添加 Beta 前缀
        if (/^\d+\.\d+\.\d+/.test(targetVersion)) {
          targetVersion = `Beta${targetVersion}`
        }
      }
      // 使用 versionManager 设置版本号，这会更新 version.json 和 package.json
      versionManager.setVersion(targetVersion)
      versionManager.updatePackageJson(targetVersion)
      console.log(`✅ 复用最新版本模式: 使用版本号 ${targetVersion}`)
      return targetVersion
    } catch (error) {
      console.warn('警告: 设置版本号失败，使用提供的版本号:', error.message)
      return latestVersion
    }
  }

  // 如果 LATEST_VERSION 为空但在复用最新版本模式下，不应该执行版本升级
  // 这种情况下，应该使用当前版本号，而不是升级
  const isReuseLatestMode = process.env.RELEASE_MODE === 'reuse_latest'
  if (isReuseLatestMode && (!latestVersion || latestVersion.trim() === '')) {
    console.warn('⚠️  复用最新版本模式但未获取到最新版本号，使用当前版本号（不升级）')
    return getCurrentVersionFromFile()
  }

  // 如果是 push tags 触发，从标签中提取版本号
  const eventName = process.env.GITHUB_EVENT_NAME
  const ref = process.env.GITHUB_REF
  if (eventName === 'push' && ref) {
    const tagVersion = getVersionFromTag(ref)
    if (tagVersion) {
      return tagVersion
    }
  }

  // 1. 如果提供了版本号参数（且不是升级类型关键词），设置该版本号
  if (versionArg && !['major', 'minor', 'patch', 'rebuild'].includes(versionArg)) {
    try {
      // 确保版本号格式正确（如果有 Beta 前缀则保留，否则添加）
      let targetVersion = versionArg.trim()
      if (!targetVersion.startsWith('Beta')) {
        // 如果版本号是纯数字格式（如 0.17.0），添加 Beta 前缀
        if (/^\d+\.\d+\.\d+/.test(targetVersion)) {
          targetVersion = `Beta${targetVersion}`
        }
      }
      // 使用 versionManager 设置版本号，这会更新 version.json 和 package.json
      versionManager.setVersion(targetVersion)
      versionManager.updatePackageJson(targetVersion)
      return targetVersion
    } catch (error) {
      console.warn('警告: 设置版本号失败，使用提供的版本号:', error.message)
      return versionArg
    }
  }

  // 2. 如果提供了升级类型，根据当前版本进行升级
  if (versionBump && ['major', 'minor', 'patch', 'rebuild'].includes(versionBump)) {
    try {
      const newVersion = versionManager.manualBumpVersion(versionBump)
      // 同时更新 package.json
      versionManager.updatePackageJson(newVersion)
      return newVersion
    } catch (error) {
      console.warn('警告: 版本升级失败，使用当前版本:', error.message)
      return getCurrentVersionFromFile()
    }
  }

  // 3. 否则，直接读取当前版本（不升级）
  return getCurrentVersionFromFile()
}

try {
  const version = getVersion()
  const cleanVersion = version.replace(/^Beta/, '')

  // 在 GitHub Actions 中，写入到 GITHUB_OUTPUT 文件
  if (process.env.GITHUB_OUTPUT) {
    const output = `version=${version}\nclean_version=${cleanVersion}\n`
    fs.appendFileSync(process.env.GITHUB_OUTPUT, output)
  }

  // 输出到标准输出（GitHub Actions 会解析这些输出）
  // 格式：key=value（每行一个）
  process.stdout.write(`version=${version}\n`)
  process.stdout.write(`clean_version=${cleanVersion}\n`)

  // 在本地环境，也输出到控制台
  if (!process.env.GITHUB_OUTPUT) {
    console.log(`Version: ${version} (clean: ${cleanVersion})`)
  }
} catch (error) {
  console.error('❌ 读取版本信息失败:', error.message)
  process.exit(1)
}
