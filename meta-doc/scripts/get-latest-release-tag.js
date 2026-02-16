/**
 * 获取最新版本的 Release Tag
 * 从 GitHub Releases API 获取指定类型的最新发布标签
 */

const https = require('https')
const fs = require('fs')

const releaseType = process.argv[2] || process.env.RELEASE_TYPE || 'prod'
const owner = process.env.RELEASE_REPO_OWNER || process.env.GITHUB_REPOSITORY_OWNER || ''
const repo = process.env.RELEASE_REPO || 'MetaDoc-Releases'
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || ''

if (!owner) {
  console.error('❌ 错误: 需要设置 RELEASE_REPO_OWNER 或 GITHUB_REPOSITORY_OWNER')
  process.exit(1)
}

function getLatestReleaseTag(releaseType, owner, repo, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${owner}/${repo}/releases?per_page=100&page=1`,
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
            const releases = JSON.parse(data)

            // 根据发布类型过滤标签
            // prod: v* 标签
            // dev: dev-* 标签
            const tagPattern = releaseType === 'dev' ? /^dev-/ : /^v\d+\.\d+\.\d+$/

            // 找到第一个匹配的已发布 release
            for (const release of releases) {
              if (release.published_at && tagPattern.test(release.tag_name)) {
                resolve({
                  tag: release.tag_name,
                  version: release.tag_name.replace(/^(dev-|v)/, ''),
                  release: release
                })
                return
              }
            }

            // 如果没有找到已发布的，返回 null
            resolve(null)
          } catch (error) {
            reject(new Error(`解析响应失败: ${error.message}`))
          }
        } else if (res.statusCode === 404) {
          // 仓库不存在或没有 releases
          resolve(null)
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

async function main() {
  try {
    console.log(`🔍 查找 ${releaseType} 类型的最新发布标签...`)

    const result = await getLatestReleaseTag(releaseType, owner, repo, token)

    if (result) {
      console.log(`✅ 找到最新标签: ${result.tag}`)
      console.log(`   版本: ${result.version}`)
      console.log(`   发布时间: ${result.release.published_at}`)

      // 输出到 GITHUB_OUTPUT
      if (process.env.GITHUB_OUTPUT) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `latest_tag=${result.tag}\n`)
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `latest_version=${result.version}\n`)
      }

      process.stdout.write(`latest_tag=${result.tag}\n`)
      process.stdout.write(`latest_version=${result.version}\n`)
      process.exit(0)
    } else {
      console.log(`ℹ️  未找到 ${releaseType} 类型的最新发布标签`)

      // 输出到 GITHUB_OUTPUT
      if (process.env.GITHUB_OUTPUT) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `latest_tag=\n`)
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `latest_version=\n`)
      }

      process.stdout.write(`latest_tag=\n`)
      process.stdout.write(`latest_version=\n`)
      process.exit(0)
    }
  } catch (error) {
    console.warn(`⚠️  获取最新标签失败: ${error.message}`)
    // 如果获取失败，返回空值
    if (process.env.GITHUB_OUTPUT) {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `latest_tag=\n`)
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `latest_version=\n`)
    }
    process.stdout.write(`latest_tag=\n`)
    process.stdout.write(`latest_version=\n`)
    process.exit(0) // 不中断流程，返回空值
  }
}

main()
