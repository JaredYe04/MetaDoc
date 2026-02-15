/**
 * 检查本地是否已经构建好指定版本的文件
 * 用于决定是否需要重新构建
 */

const fs = require('fs')
const path = require('path')

const version = process.argv[2] || ''
const buildDir = path.resolve(__dirname, '..')

if (!version) {
  console.error('❌ 错误: 需要提供版本参数')
  process.exit(1)
}

// 检查构建产物是否存在
// electron-builder 生成的文件名格式：${name}-${version}-setup.${ext}
// 其中 name 是 "meta-doc"，version 是完整版本号（如 "0.13.10"）
const distExe = path.join(buildDir, 'dist', `meta-doc-${version}-setup.exe`)
const distYml = path.join(buildDir, 'dist', `latest.yml`)
const releaseExe = path.join(buildDir, 'release', `meta-doc-${version}-setup.exe`)
const releaseYml = path.join(buildDir, 'release', `latest.yml`)

// 也检查可能的其他文件名格式（带 Beta 前缀等）
const distExeAlt = path.join(buildDir, 'dist', `meta-doc-Beta${version}-setup.exe`)
const releaseExeAlt = path.join(buildDir, 'release', `meta-doc-Beta${version}-setup.exe`)

const distExeExists = fs.existsSync(distExe)
const distExeAltExists = fs.existsSync(distExeAlt)
const distYmlExists = fs.existsSync(distYml)
const releaseExeExists = fs.existsSync(releaseExe)
const releaseExeAltExists = fs.existsSync(releaseExeAlt)
const releaseYmlExists = fs.existsSync(releaseYml)

// 至少需要有一个 exe 文件和一个 yml 文件
const hasExe = distExeExists || distExeAltExists || releaseExeExists || releaseExeAltExists
const hasYml = distYmlExists || releaseYmlExists
const hasBuild = hasExe && hasYml

if (hasBuild) {
  console.log(`✅ 发现本地构建产物:`)
  if (distExeExists) console.log(`   - ${distExe}`)
  if (distExeAltExists) console.log(`   - ${distExeAlt}`)
  if (distYmlExists) console.log(`   - ${distYml}`)
  if (releaseExeExists) console.log(`   - ${releaseExe}`)
  if (releaseExeAltExists) console.log(`   - ${releaseExeAlt}`)
  if (releaseYmlExists) console.log(`   - ${releaseYml}`)
  console.log(`ℹ️  可以使用现有构建产物，跳过构建步骤`)

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `local_build_exists=true\n`)
  }
  process.stdout.write(`local_build_exists=true\n`)
  process.exit(0)
} else {
  console.log(`ℹ️  未发现本地构建产物，需要重新构建`)
  console.log(`   检查路径:`)
  console.log(`   - ${distExe} ${distExeExists ? '✓' : '✗'}`)
  console.log(`   - ${distExeAlt} ${distExeAltExists ? '✓' : '✗'}`)
  console.log(`   - ${distYml} ${distYmlExists ? '✓' : '✗'}`)
  console.log(`   - ${releaseExe} ${releaseExeExists ? '✓' : '✗'}`)
  console.log(`   - ${releaseExeAlt} ${releaseExeAltExists ? '✓' : '✗'}`)
  console.log(`   - ${releaseYml} ${releaseYmlExists ? '✓' : '✗'}`)

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `local_build_exists=false\n`)
  }
  process.stdout.write(`local_build_exists=false\n`)
  process.exit(0)
}
