/**
 * 生成发布日志并保存到文件的 Node.js 脚本
 * 用于在 Windows 本地环境和 GitHub Actions 中替代 bash 重定向
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const version = process.argv[2] || ''
const releaseType = process.argv[3] || 'prod'
const outputFile = process.argv[4] || 'release-notes.txt'

try {
  // 运行 generate-changelog.js 并捕获输出
  const changelog = execSync(`node scripts/generate-changelog.js "${version}" "${releaseType}"`, {
    encoding: 'utf-8',
    cwd: path.resolve(__dirname, '..')
  })

  // 写入文件
  fs.writeFileSync(outputFile, changelog, 'utf-8')

  console.log(`✅ 发布日志已保存到: ${outputFile}`)
} catch (error) {
  console.error('❌ 生成发布日志失败:', error.message)
  process.exit(1)
}
