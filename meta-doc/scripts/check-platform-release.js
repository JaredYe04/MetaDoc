/**
 * 检查指定版本是否已经包含当前平台的文件
 * 用于决定是否需要重新构建打包
 *
 * 参数：
 *   tag: 版本标签
 *   platform: 平台类型 (windows/macos/linux)
 */

const https = require('https')
const fs = require('fs')

const tag = process.argv[2] || ''
const platform = process.argv[3] || process.env.PLATFORM || 'windows'
const owner = process.env.RELEASE_REPO_OWNER || process.env.GITHUB_REPOSITORY_OWNER || ''
const repo = process.env.RELEASE_REPO || 'MetaDoc-Releases'
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || ''

if (!tag) {
  console.error('❌ 错误: 需要提供标签参数')
  process.exit(1)
}

if (!owner) {
  console.error('❌ 错误: 需要设置 RELEASE_REPO_OWNER 或 GITHUB_REPOSITORY_OWNER')
  process.exit(1)
}

// 定义每个平台的文件扩展名模式（macos-x64 用 x64 区分 Intel 包）
const platformPatterns = {
  windows: ['.exe', '.yml', '.blockmap'],
  macos: ['.dmg', '.zip'],
  'macos-x64': ['x64'],
  linux: ['.AppImage', '.deb', '.snap']
}

function checkReleaseAssets(tag, owner, repo, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${owner}/${repo}/releases/tags/${tag}`,
      method: 'GET',
      headers: {
        'User-Agent': 'Node.js',
        Accept: 'application/vnd.github.v3+json'
      }
    }

    if (token) {
      options.headers['Authorization'] = `token ${token}`
    }

    const req = https.request(options, (res) => {
      let data = ''

      res.on('data', (chunk) => {
        data += chunk
      })

      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const release = JSON.parse(data)
            resolve({
              exists: true,
              release: release,
              assets: release.assets || []
            })
          } catch (error) {
            reject(new Error(`解析响应失败: ${error.message}`))
          }
        } else if (res.statusCode === 404) {
          resolve({
            exists: false,
            release: null,
            assets: []
          })
        } else {
          reject(new Error(`GitHub API 错误: ${res.statusCode} - ${data}`))
        }
      })
    })

    req.on('error', (error) => {
      reject(error)
    })

    req.end()
  })
}

function hasPlatformFiles(assets, platform) {
  const patterns = platformPatterns[platform] || platformPatterns.windows

  // 检查 assets 中是否有匹配的文件
  const foundPatterns = patterns.filter((pattern) => {
    return assets.some((asset) => {
      const name = asset.name || ''
      return name.includes(pattern) || name.endsWith(pattern)
    })
  })

  // 如果找到了至少一个匹配的文件，说明该平台的文件已存在
  return foundPatterns.length > 0
}

async function main() {
  try {
    console.log(`🔍 检查标签 ${tag} 是否已包含 ${platform} 平台的文件...`)

    const result = await checkReleaseAssets(tag, owner, repo, token)

    if (!result.exists) {
      console.log(`ℹ️  标签 ${tag} 不存在，需要构建和发布`)

      if (process.env.GITHUB_OUTPUT) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `platform_release_exists=false\n`)
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `has_platform_files=false\n`)
      }

      process.stdout.write(`platform_release_exists=false\n`)
      process.stdout.write(`has_platform_files=false\n`)
      process.exit(0)
    }

    const hasFiles = hasPlatformFiles(result.assets, platform)

    if (hasFiles) {
      console.log(`✅ 标签 ${tag} 已包含 ${platform} 平台的文件`)
      console.log(`   找到的文件:`)
      const patterns = platformPatterns[platform] || platformPatterns.windows
      result.assets.forEach((asset) => {
        if (
          patterns.some((pattern) => asset.name.includes(pattern) || asset.name.endsWith(pattern))
        ) {
          console.log(`     - ${asset.name}`)
        }
      })

      if (process.env.GITHUB_OUTPUT) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `platform_release_exists=true\n`)
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `has_platform_files=true\n`)
      }

      process.stdout.write(`platform_release_exists=true\n`)
      process.stdout.write(`has_platform_files=true\n`)
      process.exit(0)
    } else {
      console.log(`ℹ️  标签 ${tag} 存在，但不包含 ${platform} 平台的文件，需要构建`)
      console.log(`   当前 Release 中的文件:`)
      result.assets.forEach((asset) => {
        console.log(`     - ${asset.name}`)
      })

      if (process.env.GITHUB_OUTPUT) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `platform_release_exists=true\n`)
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `has_platform_files=false\n`)
      }

      process.stdout.write(`platform_release_exists=true\n`)
      process.stdout.write(`has_platform_files=false\n`)
      process.exit(0)
    }
  } catch (error) {
    console.warn(`⚠️  检查失败: ${error.message}，将默认认为不存在，需要构建`)
    // 如果检查失败，默认认为不存在，需要构建
    if (process.env.GITHUB_OUTPUT) {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `platform_release_exists=false\n`)
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `has_platform_files=false\n`)
    }
    process.stdout.write(`platform_release_exists=false\n`)
    process.stdout.write(`has_platform_files=false\n`)
    process.exit(0) // 检查失败也不应该中断流程，默认认为不存在
  }
}

main()
