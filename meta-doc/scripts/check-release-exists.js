/**
 * 检查指定版本是否已经在 Releases 仓库中发布
 * 用于决定是否需要重新构建打包
 */

const https = require('https');
const fs = require('fs');

const tag = process.argv[2] || '';
const owner = process.env.RELEASE_REPO_OWNER || process.env.GITHUB_REPOSITORY_OWNER || '';
const repo = process.env.RELEASE_REPO || 'MetaDoc-Releases';
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';

if (!tag) {
  console.error('❌ 错误: 需要提供标签参数');
  process.exit(1);
}

if (!owner) {
  console.error('❌ 错误: 需要设置 RELEASE_REPO_OWNER 或 GITHUB_REPOSITORY_OWNER');
  process.exit(1);
}

function checkReleaseExists(tag, owner, repo, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${owner}/${repo}/releases/tags/${tag}`,
      method: 'GET',
      headers: {
        'User-Agent': 'Node.js',
        'Accept': 'application/vnd.github.v3+json'
      }
    };

    if (token) {
      options.headers['Authorization'] = `token ${token}`;
    }

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const release = JSON.parse(data);
            resolve({
              exists: true,
              release: release,
              published: release.published_at !== null
            });
          } catch (error) {
            reject(new Error(`解析响应失败: ${error.message}`));
          }
        } else if (res.statusCode === 404) {
          resolve({
            exists: false,
            release: null,
            published: false
          });
        } else {
          reject(new Error(`GitHub API 错误: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

async function main() {
  try {
    console.log(`🔍 检查标签 ${tag} 是否已在 ${owner}/${repo} 中发布...`);
    
    const result = await checkReleaseExists(tag, owner, repo, token);
    
    if (result.exists && result.published) {
      console.log(`✅ 标签 ${tag} 已存在并已发布`);
      console.log(`   发布时间: ${result.release.published_at}`);
      console.log(`   Release ID: ${result.release.id}`);
      
      // 输出到 GITHUB_OUTPUT
      if (process.env.GITHUB_OUTPUT) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `release_exists=true\n`);
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `release_id=${result.release.id}\n`);
      }
      
      process.stdout.write(`release_exists=true\n`);
      process.exit(0);
    } else {
      console.log(`ℹ️  标签 ${tag} 不存在或未发布，需要构建和发布`);
      
      // 输出到 GITHUB_OUTPUT
      if (process.env.GITHUB_OUTPUT) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `release_exists=false\n`);
      }
      
      process.stdout.write(`release_exists=false\n`);
      process.exit(0); // 不存在不是错误，应该继续流程
    }
  } catch (error) {
    console.warn(`⚠️  检查失败: ${error.message}，将默认认为不存在，需要构建`);
    // 如果检查失败，默认认为不存在，需要构建
    if (process.env.GITHUB_OUTPUT) {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `release_exists=false\n`);
    }
    process.stdout.write(`release_exists=false\n`);
    process.exit(0); // 检查失败也不应该中断流程，默认认为不存在
  }
}

main();

