/**
 * 创建 Git 标签（如果不存在）
 * 用于在 GitHub Actions 中创建发布标签
 */

const { execSync } = require('child_process');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

// 从命令行参数获取标签和发布名称
const tag = process.argv[2] || '';
const releaseName = process.argv[3] || tag;
const repository = process.env.GITHUB_REPOSITORY || '';
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';

if (!tag) {
  console.error('❌ 错误: 需要提供标签参数');
  process.exit(1);
}

if (!token) {
  console.warn('⚠️  警告: 未提供 GH_TOKEN，可能无法推送标签');
}

try {
  // 配置 git
  execSync('git config --local user.email "action@github.com"', {
    cwd: rootDir,
    stdio: 'ignore'
  });
  execSync('git config --local user.name "GitHub Action"', {
    cwd: rootDir,
    stdio: 'ignore'
  });

  // 设置远程仓库 URL（如果提供了 token）
  if (token && repository) {
    const remoteUrl = `https://${token}@github.com/${repository}.git`;
    execSync(`git remote set-url origin ${remoteUrl}`, {
      cwd: rootDir,
      stdio: 'ignore'
    });
  }

  // 检查标签是否已存在
  try {
    execSync(`git rev-parse "${tag}"`, {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'ignore']
    });
    console.log(`ℹ️  标签 ${tag} 已存在，跳过创建`);
    process.exit(0);
  } catch (error) {
    // 标签不存在，继续创建
  }

  console.log(`🏷️  创建标签 ${tag}`);

  // 创建标签
  const tagMessage = `Release ${releaseName}`;
  try {
    execSync(`git tag -a "${tag}" -m "${tagMessage}"`, {
      cwd: rootDir,
      stdio: 'inherit'
    });
    console.log('✅ 标签已创建');
  } catch (error) {
    console.error('❌ 标签创建失败:', error.message);
    process.exit(1);
  }

  // 推送标签
  if (token) {
    try {
      execSync(`git push origin "${tag}"`, {
        cwd: rootDir,
        stdio: 'inherit'
      });
      console.log('✅ 标签已推送');
    } catch (error) {
      console.error('❌ 标签推送失败:', error.message);
      process.exit(1);
    }
  } else {
    console.warn('⚠️  未提供 token，跳过推送');
  }
} catch (error) {
  console.error('❌ 错误:', error.message);
  process.exit(1);
}

