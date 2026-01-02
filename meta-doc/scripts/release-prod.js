/**
 * 生产版本发布脚本
 * 用于发布正式版本到GitHub Releases
 * 会自动创建标签并推送到 GitHub，触发 GitHub Actions 自动发布
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const rootDir = path.resolve(__dirname, '..');

// 检查是否在 GitHub Actions 环境中
const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';

/**
 * 询问用户确认
 */
function askQuestion(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

/**
 * 检查 git 状态
 */
function checkGitStatus() {
  try {
    // 检查是否有未提交的更改
    const status = execSync('git status --porcelain', {
      cwd: rootDir,
      encoding: 'utf-8'
    }).trim();

    if (status) {
      console.warn('⚠️  警告: 检测到未提交的更改:');
      console.log(status);
      return false;
    }

    // 检查当前分支
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: rootDir,
      encoding: 'utf-8'
    }).trim();

    console.log(`📌 当前分支: ${branch}`);
    return true;
  } catch (error) {
    console.error('❌ 检查 git 状态失败:', error.message);
    return false;
  }
}

/**
 * 检查标签是否已存在
 */
function checkTagExists(tag) {
  try {
    execSync(`git rev-parse --verify "${tag}"`, {
      cwd: rootDir,
      stdio: 'ignore'
    });
    return true;
  } catch (error) {
    return false;
  }
}

async function main() {
  try {
    console.log('🚀 开始发布生产版本...\n');

    if (!isGitHubActions) {
      // 检查 git 状态
      if (!checkGitStatus()) {
        const continueAnyways = await askQuestion('\n是否继续？(y/N): ');
        if (continueAnyways !== 'y' && continueAnyways !== 'yes') {
          console.log('已取消发布');
          process.exit(0);
        }
      }

      // 检查是否在 git 仓库中
      try {
        execSync('git rev-parse --git-dir', {
          cwd: rootDir,
          stdio: 'ignore'
        });
      } catch (error) {
        console.error('❌ 错误: 当前目录不是 git 仓库');
        process.exit(1);
      }
    }

    // 1. 读取版本信息（在构建前读取，以便构建时使用正确的版本）
    const versionPath = path.join(rootDir, 'version.json');
    const versionData = JSON.parse(fs.readFileSync(versionPath, 'utf-8'));
    const version = versionData.version;
    const cleanVersion = version.replace(/^Beta/, ''); // 移除Beta前缀用于GitHub标签
    const tag = `v${cleanVersion}`;

    console.log(`📋 版本信息: ${version}`);
    console.log(`🏷️  标签: ${tag}\n`);

    // 2. 检查标签是否已存在
    if (!isGitHubActions && checkTagExists(tag)) {
      console.warn(`⚠️  警告: 标签 ${tag} 已存在`);
      const overwrite = await askQuestion('是否删除并重新创建标签？(y/N): ');
      if (overwrite === 'y' || overwrite === 'yes') {
        try {
          execSync(`git tag -d "${tag}"`, { cwd: rootDir, stdio: 'ignore' });
          console.log(`✅ 已删除本地标签 ${tag}`);
        } catch (error) {
          // 忽略错误
        }
      } else {
        console.log('已取消发布');
        process.exit(0);
      }
    }

    // 3. 构建项目
    console.log('\n📦 步骤 1/4: 构建项目...');
    execSync('npm run build', { 
      stdio: 'inherit', 
      cwd: rootDir,
      env: {
        ...process.env,
        NODE_ENV: 'production'
      }
    });

    // 4. 打包Windows版本（当前仅支持Windows，但预留扩展空间）
    console.log('\n📦 步骤 2/4: 打包Windows版本...');
    execSync('npm run build:win', { 
      stdio: 'inherit', 
      cwd: rootDir,
      env: {
        ...process.env,
        NODE_ENV: 'production'
      }
    });

    console.log(`\n✅ 构建完成！版本: ${version}`);

    if (isGitHubActions) {
      // 在 GitHub Actions 中，工作流会自动处理发布
      console.log('\n📤 GitHub Actions 将自动处理发布流程...');
      console.log(`   标签: ${tag}`);
      console.log(`   仓库: MetaDoc-Releases`);
    } else {
      // 5. 提交更改（如果有）
      try {
        const status = execSync('git status --porcelain', {
          cwd: rootDir,
          encoding: 'utf-8'
        }).trim();

        if (status) {
          console.log('\n📝 步骤 3/4: 提交更改...');
          execSync('git add version.json package.json', {
            cwd: rootDir,
            stdio: 'inherit'
          });
          execSync(`git commit -m "chore: 准备发布 ${tag}"`, {
            cwd: rootDir,
            stdio: 'inherit'
          });
        }
      } catch (error) {
        // 如果没有更改，忽略错误
      }

      // 6. 创建标签并推送
      console.log(`\n🏷️  步骤 4/4: 创建标签 ${tag} 并推送到 GitHub...`);
      
      // 创建标签
      execSync(`git tag -a "${tag}" -m "Release ${tag}"`, {
        cwd: rootDir,
        stdio: 'inherit'
      });

      // 推送代码（如果有未推送的提交）
      try {
        execSync('git push', {
          cwd: rootDir,
          stdio: 'inherit'
        });
      } catch (error) {
        console.warn('⚠️  推送代码失败（可能没有新提交）:', error.message);
      }

      // 推送标签
      execSync(`git push origin "${tag}"`, {
        cwd: rootDir,
        stdio: 'inherit'
      });

      console.log('\n✅ 标签已推送到 GitHub！');
      console.log('\n📤 GitHub Actions 将自动触发发布流程：');
      console.log(`   - 标签: ${tag}`);
      console.log(`   - 仓库: MetaDoc-Releases`);
      console.log(`   - 类型: 正式版`);
      console.log('\n💡 提示:');
      console.log('   - 可以访问 GitHub Actions 页面查看发布进度');
      console.log('   - 发布完成后，文件将出现在 MetaDoc-Releases 仓库的 Releases 页面\n');
    }

  } catch (error) {
    console.error('\n❌ 发布失败:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
