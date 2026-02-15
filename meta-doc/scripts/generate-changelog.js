/**
 * 生成发布日志（CHANGELOG）
 * 从 git commits 生成发布说明
 */

const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const rootDir = path.resolve(__dirname, '..')

/**
 * 获取自指定版本以来的所有 commits
 */
function getCommitsSince(version, releaseType) {
  try {
    // 尝试获取指定版本之后的 commits
    let command = 'git log --pretty=format:"%H|%s|%b"'

    // 如果是正式版，查找上一个正式版标签
    if (releaseType === 'prod') {
      try {
        const lastTag = execSync('git describe --tags --abbrev=0 --match "v*"', {
          cwd: rootDir,
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'ignore']
        }).trim()

        if (lastTag) {
          command += ` ${lastTag}..HEAD`
        }
      } catch (error) {
        // 没有找到标签，使用所有 commits
      }
    } else {
      // 开发版，查找上一个开发版标签
      try {
        const lastTag = execSync('git describe --tags --abbrev=0 --match "dev-*"', {
          cwd: rootDir,
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'ignore']
        }).trim()

        if (lastTag) {
          command += ` ${lastTag}..HEAD`
        }
      } catch (error) {
        // 没有找到标签，使用所有 commits
      }
    }

    const output = execSync(command, {
      cwd: rootDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim()

    if (!output) {
      return []
    }

    return output.split('\n').map((line) => {
      const [hash, ...rest] = line.split('|')
      const message = rest.join('|')
      return { hash, message }
    })
  } catch (error) {
    console.warn('警告: 无法获取 git commits:', error.message)
    return []
  }
}

/**
 * 解析 commit message，分类整理
 */
function categorizeCommits(commits) {
  const categories = {
    feat: [],
    fix: [],
    refactor: [],
    perf: [],
    docs: [],
    chore: [],
    other: []
  }

  for (const commit of commits) {
    const message = commit.message.trim()
    const match = message.match(/^(\w+)(?:\([^)]+\))?(!?):\s*(.+)$/)

    if (match) {
      const type = match[1].toLowerCase()
      const description = match[3]

      if (categories[type]) {
        categories[type].push(description)
      } else {
        categories.other.push(message)
      }
    } else {
      categories.other.push(message)
    }
  }

  return categories
}

/**
 * 生成 Markdown 格式的发布日志
 */
function generateChangelog(version, releaseType, categories) {
  const cleanVersion = version.replace(/^Beta/, '')
  const date = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  let changelog = `# ${releaseType === 'dev' ? '开发版' : ''} ${cleanVersion}\n\n`
  changelog += `发布日期: ${date}\n\n`

  const hasChanges = Object.values(categories).some((arr) => arr.length > 0)

  if (!hasChanges) {
    changelog += '本次发布包含构建和优化。\n'
    return changelog
  }

  // 新功能
  if (categories.feat.length > 0) {
    changelog += '## ✨ 新功能\n\n'
    categories.feat.forEach((item) => {
      changelog += `- ${item}\n`
    })
    changelog += '\n'
  }

  // Bug 修复
  if (categories.fix.length > 0) {
    changelog += '## 🐛 Bug 修复\n\n'
    categories.fix.forEach((item) => {
      changelog += `- ${item}\n`
    })
    changelog += '\n'
  }

  // 性能优化
  if (categories.perf.length > 0) {
    changelog += '## ⚡ 性能优化\n\n'
    categories.perf.forEach((item) => {
      changelog += `- ${item}\n`
    })
    changelog += '\n'
  }

  // 重构
  if (categories.refactor.length > 0) {
    changelog += '## 🔧 重构\n\n'
    categories.refactor.forEach((item) => {
      changelog += `- ${item}\n`
    })
    changelog += '\n'
  }

  // 文档
  if (categories.docs.length > 0) {
    changelog += '## 📝 文档\n\n'
    categories.docs.forEach((item) => {
      changelog += `- ${item}\n`
    })
    changelog += '\n'
  }

  // 其他
  if (categories.other.length > 0) {
    changelog += '## 🔨 其他\n\n'
    categories.other.forEach((item) => {
      changelog += `- ${item}\n`
    })
    changelog += '\n'
  }

  return changelog
}

// 命令行接口
if (require.main === module) {
  const version = process.argv[2] || ''
  const releaseType = process.argv[3] || 'prod'

  if (!version) {
    console.error('错误: 请提供版本号')
    process.exit(1)
  }

  try {
    const commits = getCommitsSince(version, releaseType)
    const categories = categorizeCommits(commits)
    const changelog = generateChangelog(version, releaseType, categories)

    console.log(changelog)
  } catch (error) {
    console.error('生成发布日志失败:', error.message)
    process.exit(1)
  }
}

module.exports = {
  generateChangelog,
  getCommitsSince,
  categorizeCommits
}
