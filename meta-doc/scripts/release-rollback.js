/**
 * 发布回滚脚本
 * 用于回滚到之前的版本
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const rootDir = path.resolve(__dirname, '..');

/**
 * 获取 GitHub Releases 列表
 */
async function getReleases(owner, repo, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${owner}/${repo}/releases`,
      method: 'GET',
      headers: {
        'User-Agent': 'MetaDoc-Release-Script',
        'Authorization': token ? `token ${token}` : undefined,
        'Accept': 'application/vnd.github.v3+json'
      }
    };

    https.get(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const releases = JSON.parse(data);
            resolve(releases);
          } catch (error) {
            reject(new Error('解析 Releases 数据失败: ' + error.message));
          }
        } else {
          reject(new Error(`获取 Releases 失败: ${res.statusCode} ${data}`));
        }
      });
    }).on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * 删除指定的 Release
 */
async function deleteRelease(owner, repo, releaseId, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${owner}/${repo}/releases/${releaseId}`,
      method: 'DELETE',
      headers: {
        'User-Agent': 'MetaDoc-Release-Script',
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 204) {
          resolve(true);
        } else {
          reject(new Error(`删除 Release 失败: ${res.statusCode} ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

/**
 * 主函数
 */
async function main() {
  try {
    // 读取环境变量
    const envPath = path.join(rootDir, '.env');
    let githubOwner = '';
    let githubRepo = 'MetaDoc-Releases';
    let githubToken = '';

    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      const lines = envContent.split('\n');
      
      for (const line of lines) {
        const match = line.match(/^\s*([^#=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          const value = match[2].trim().replace(/^["']|["']$/g, '');
          
          if (key === 'UPDATE_GITHUB_OWNER') {
            githubOwner = value;
          } else if (key === 'UPDATE_GITHUB_REPO') {
            githubRepo = value;
          } else if (key === 'UPDATE_GITHUB_TOKEN') {
            githubToken = value;
          }
        }
      }
    }

    if (!githubOwner || !githubRepo) {
      console.error('错误: 请在 .env 文件中配置 UPDATE_GITHUB_OWNER 和 UPDATE_GITHUB_REPO');
      process.exit(1);
    }

    if (!githubToken) {
      console.error('错误: 回滚操作需要 GitHub Token，请在 .env 文件中配置 UPDATE_GITHUB_TOKEN');
      process.exit(1);
    }

    // 获取命令行参数
    const args = process.argv.slice(2);
    const tag = args[0];

    if (!tag) {
      // 列出所有 Releases
      console.log('📋 获取 Releases 列表...\n');
      const releases = await getReleases(githubOwner, githubRepo, githubToken);
      
      console.log('可用的 Releases:');
      console.log('');
      
      releases.slice(0, 10).forEach((release, index) => {
        const type = release.prerelease ? '[开发版]' : '[正式版]';
        console.log(`${index + 1}. ${release.tag_name} ${type} - ${release.name}`);
        console.log(`   发布时间: ${new Date(release.published_at).toLocaleString('zh-CN')}`);
        console.log(`   ID: ${release.id}`);
        console.log('');
      });

      console.log('使用方法:');
      console.log(`  node scripts/release-rollback.js <tag>`);
      console.log('');
      console.log('示例:');
      console.log(`  node scripts/release-rollback.js v0.13.1`);
      console.log(`  node scripts/release-rollback.js dev-0.13.1`);
      process.exit(0);
    }

    // 查找要删除的 Release
    console.log(`🔍 查找 Release: ${tag}...\n`);
    const releases = await getReleases(githubOwner, githubRepo, githubToken);
    const release = releases.find(r => r.tag_name === tag);

    if (!release) {
      console.error(`错误: 未找到标签为 ${tag} 的 Release`);
      process.exit(1);
    }

    // 确认删除
    console.log(`⚠️  警告: 您即将删除以下 Release:`);
    console.log(`   标签: ${release.tag_name}`);
    console.log(`   名称: ${release.name}`);
    console.log(`   类型: ${release.prerelease ? '开发版' : '正式版'}`);
    console.log(`   发布时间: ${new Date(release.published_at).toLocaleString('zh-CN')}`);
    console.log('');
    console.log('此操作不可恢复！');
    console.log('');
    console.log('要确认删除，请运行:');
    console.log(`  node scripts/release-rollback.js ${tag} --confirm`);
    console.log('');

    if (args[1] !== '--confirm') {
      process.exit(0);
    }

    // 执行删除
    console.log(`🗑️  正在删除 Release: ${tag}...\n`);
    await deleteRelease(githubOwner, githubRepo, release.id, githubToken);
    
    console.log(`✅ Release ${tag} 已成功删除`);
    console.log('');
    console.log('注意: 此操作只删除了 GitHub Release，不会删除 Git 标签。');
    console.log('如需删除 Git 标签，请手动执行:');
    console.log(`  git tag -d ${tag}`);
    console.log(`  git push origin :refs/tags/${tag}`);

  } catch (error) {
    console.error('\n❌ 回滚失败:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  getReleases,
  deleteRelease
};

