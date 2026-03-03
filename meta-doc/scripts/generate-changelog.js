/**
 * 生成发布日志（CHANGELOG）
 * 从 git commits 生成发布说明
 */

const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const rootDir = path.resolve(__dirname, '..')

/**
 * 获取「上一次发布」对应的 tag，用于计算 commit 范围
 * 当前发布 tag 可能已存在（刚创建），取排序后的上一个 tag
 */
function getPreviousReleaseTag(currentTag, releaseType) {
  const match = releaseType === 'prod' ? 'v*' : 'dev-*'
  try {
    const out = execSync(`git tag -l "${match}" --sort=-version:refname`, {
      cwd: rootDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim()
    if (!out) return null
    const tags = out.split('\n').filter(Boolean)
    // 列表从新到旧：[v1.0.0, v0.9.0, ...]
    const idx = tags.indexOf(currentTag)
    if (idx === 0) return tags[1] || null // 当前 tag 已存在，取上一个
    if (idx > 0) return tags[idx + 1] || null
    return tags[0] || null // 当前 tag 尚不存在，取当前最新作为「上一版」
  } catch (e) {
    return null
  }
}

/**
 * 获取自「上一次发布」到 HEAD 的所有 commits（用于生成本版 release 说明）
 */
function getCommitsSince(version, releaseType) {
  try {
    const cleanVersion = version.replace(/^Beta/, '')
    const currentTag =
      releaseType === 'prod' ? `v${cleanVersion}` : `dev-${cleanVersion}`

    const previousTag = getPreviousReleaseTag(currentTag, releaseType)
    let range = 'HEAD'
    if (previousTag) {
      range = `${previousTag}..HEAD`
    }

    const command = `git log ${range} --pretty=format:"%H|%s|%b" --no-merges`
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
      const message = rest.join('|').trim()
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
    if (!message) continue
    const match = message.match(/^(\w+)(?:\([^)]+\))?(!?):\s*(.+)$/)

    if (match) {
      const type = match[1].toLowerCase()
      const description = match[3].trim()

      if (categories[type]) {
        if (!categories[type].includes(description)) {
          categories[type].push(description)
        }
      } else {
        if (!categories.other.includes(message)) {
          categories.other.push(message)
        }
      }
    } else {
      if (!categories.other.includes(message)) {
        categories.other.push(message)
      }
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

  // 构建 / 杂项 (chore)
  if (categories.chore.length > 0) {
    changelog += '## 📦 构建 / 杂项\n\n'
    categories.chore.forEach((item) => {
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
