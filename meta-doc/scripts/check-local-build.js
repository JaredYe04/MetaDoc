/**
 * 检查本地是否已经构建好指定版本的文件
 * 用于决定是否需要重新构建
 *
 * 用法: node check-local-build.js <version> [platform]
 * platform: windows | linux | macos，默认 windows
 */

const fs = require('fs')
const path = require('path')

const version = process.argv[2] || ''
const platform = (process.argv[3] || 'windows').toLowerCase()
const buildDir = path.resolve(__dirname, '..')
const distDir = path.join(buildDir, 'dist')
const releaseDir = path.join(buildDir, 'release')

if (!version) {
  console.error('❌ 错误: 需要提供版本参数')
  process.exit(1)
}

const validPlatforms = ['windows', 'linux', 'macos']
if (!validPlatforms.includes(platform)) {
  console.error(`❌ 错误: 无效的 platform，应为 ${validPlatforms.join(' | ')}`)
  process.exit(1)
}

function checkWindows() {
  const distExe = path.join(distDir, `meta-doc-${version}-setup.exe`)
  const distYml = path.join(distDir, 'latest.yml')
  const releaseExe = path.join(releaseDir, `meta-doc-${version}-setup.exe`)
  const releaseYml = path.join(releaseDir, 'latest.yml')
  const distExeAlt = path.join(distDir, `meta-doc-Beta${version}-setup.exe`)
  const releaseExeAlt = path.join(releaseDir, `meta-doc-Beta${version}-setup.exe`)

  const hasExe =
    fs.existsSync(distExe) ||
    fs.existsSync(distExeAlt) ||
    fs.existsSync(releaseExe) ||
    fs.existsSync(releaseExeAlt)
  const hasYml = fs.existsSync(distYml) || fs.existsSync(releaseYml)
  return hasExe && hasYml
}

function checkLinux() {
  const appImage = path.join(distDir, `meta-doc-${version}.AppImage`)
  const deb = path.join(distDir, `meta-doc_${version}_amd64.deb`)
  const appImageAlt = path.join(distDir, `meta-doc-Beta${version}.AppImage`)
  const debAlt = path.join(distDir, `meta-doc_Beta${version}_amd64.deb`)
  const hasAppImage = fs.existsSync(appImage) || fs.existsSync(appImageAlt)
  const hasDeb = fs.existsSync(deb) || fs.existsSync(debAlt)
  return hasAppImage || hasDeb
}

function checkMacos() {
  if (!fs.existsSync(distDir)) return false
  const files = fs.readdirSync(distDir)
  const versionClean = version.replace(/^Beta/, '')
  const hasDmg = files.some(
    (f) =>
      (f.endsWith('.dmg') && f.includes(versionClean)) ||
      (f.endsWith('.dmg') && f.includes(version))
  )
  const hasZip = files.some(
    (f) =>
      (f.endsWith('.zip') && f.includes(versionClean)) ||
      (f.endsWith('.zip') && f.includes(version))
  )
  return hasDmg || hasZip
}

let hasBuild = false
if (platform === 'windows') {
  hasBuild = checkWindows()
} else if (platform === 'linux') {
  hasBuild = checkLinux()
} else {
  hasBuild = checkMacos()
}

if (hasBuild) {
  console.log(`✅ 发现本地构建产物 (${platform}):`)
  console.log(`ℹ️  可以使用现有构建产物，跳过构建步骤`)

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `local_build_exists=true\n`)
  }
  process.stdout.write(`local_build_exists=true\n`)
  process.exit(0)
} else {
  console.log(`ℹ️  未发现本地构建产物 (${platform})，需要重新构建`)

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `local_build_exists=false\n`)
  }
  process.stdout.write(`local_build_exists=false\n`)
  process.exit(0)
}
