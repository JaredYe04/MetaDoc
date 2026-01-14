/**
 * 提交版本更改到仓库
 * 用于在 GitHub Actions 中提交 version.json 和 package.json 的更改
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 获取 git 仓库根目录
function getGitRoot() {
  try {
    const gitRoot = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    return gitRoot;
  } catch (error) {
    // 如果不在 git 仓库中，使用脚本所在目录的父目录
    return path.resolve(__dirname, '../..');
  }
}

const gitRoot = getGitRoot();
const metaDocDir = path.resolve(__dirname, '..');
const versionJsonPath = path.join(metaDocDir, 'version.json');
const packageJsonPath = path.join(metaDocDir, 'package.json');

// 计算相对于 git 根目录的文件路径
function getGitPath(filePath) {
  const relativePath = path.relative(gitRoot, filePath);
  // 统一使用正斜杠（git 在 Windows 上也使用正斜杠）
  return relativePath.split(path.sep).join('/');
}

// 从命令行参数获取版本号
const version = process.argv[2] || '';
const refName = process.env.GITHUB_REF_NAME || 'main';
const repository = process.env.GITHUB_REPOSITORY || '';
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';

if (!version) {
  console.error('❌ 错误: 需要提供版本号参数');
  process.exit(1);
}

if (!token) {
  console.warn('⚠️  警告: 未提供 GH_TOKEN，可能无法推送更改');
}

try {
  // 配置 git
  execSync('git config --local user.email "action@github.com"', {
    cwd: gitRoot,
    stdio: 'ignore'
  });
  execSync('git config --local user.name "GitHub Action"', {
    cwd: gitRoot,
    stdio: 'ignore'
  });

  // 设置远程仓库 URL（如果提供了 token）
  if (token && repository) {
    const remoteUrl = `https://${token}@github.com/${repository}.git`;
    execSync(`git remote set-url origin ${remoteUrl}`, {
      cwd: gitRoot,
      stdio: 'ignore'
    });
  }

  // 检查文件是否存在
  if (!fs.existsSync(versionJsonPath) && !fs.existsSync(packageJsonPath)) {
    console.log('ℹ️  版本文件不存在，无需提交');
    process.exit(0);
  }

  // 检查是否有文件被修改
  let hasChanges = false;
  try {
    const status = execSync('git status --porcelain', {
      cwd: gitRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();

    // 获取相对于 git 根目录的文件路径
    const versionJsonGitPath = getGitPath(versionJsonPath);
    const packageJsonGitPath = getGitPath(packageJsonPath);

    // 检查 version.json 或 package.json 是否有更改
    const versionFilesChanged = status
      .split('\n')
      .some(line => {
        const file = line.trim().split(/\s+/).pop();
        return file === versionJsonGitPath || 
               file === packageJsonGitPath ||
               file.endsWith('version.json') ||
               file.endsWith('package.json');
      });

    if (!versionFilesChanged && status) {
      console.log('ℹ️  版本文件未修改，无需提交');
      process.exit(0);
    }

    hasChanges = versionFilesChanged;
  } catch (error) {
    // 如果 git status 失败，尝试直接检查文件
    console.warn('⚠️  无法检查 git 状态，尝试直接添加文件');
    hasChanges = true;
  }

  if (!hasChanges) {
    console.log('ℹ️  版本文件未修改，无需提交');
    process.exit(0);
  }

  console.log('📝 检测到版本文件更改，准备提交...');

  // 添加文件（使用相对于 git 根目录的路径）
  const filesToAdd = [];
  if (fs.existsSync(versionJsonPath)) {
    filesToAdd.push(getGitPath(versionJsonPath));
  }
  if (fs.existsSync(packageJsonPath)) {
    filesToAdd.push(getGitPath(packageJsonPath));
  }

  if (filesToAdd.length === 0) {
    console.log('ℹ️  没有版本文件需要提交');
    process.exit(0);
  }

  execSync(`git add ${filesToAdd.join(' ')}`, {
    cwd: gitRoot,
    stdio: 'inherit'
  });

  // 检查是否有暂存的更改
  try {
    const diff = execSync('git diff --staged --quiet', {
      cwd: gitRoot,
      stdio: ['ignore', 'pipe', 'ignore']
    });
    console.log('ℹ️  没有暂存的更改，无需提交');
    process.exit(0);
  } catch (error) {
    // git diff --staged --quiet 如果有更改会返回非零退出码，这是正常的
  }

  // 提交更改
  const commitMessage = `chore: bump version to ${version} [skip ci]`;
  try {
    execSync(`git commit -m "${commitMessage}"`, {
      cwd: gitRoot,
      stdio: 'inherit'
    });
    console.log('✅ 版本更改已提交');
  } catch (error) {
    console.warn('⚠️  提交失败:', error.message);
    process.exit(0); // 提交失败不应该中断流程
  }

  // 推送更改
  if (token) {
    try {
      execSync(`git push origin HEAD:${refName}`, {
        cwd: gitRoot,
        stdio: 'inherit'
      });
      console.log('✅ 版本更改已推送');
    } catch (error) {
      console.warn('⚠️  推送失败:', error.message);
      // 推送失败不应该中断流程
    }
  } else {
    console.warn('⚠️  未提供 token，跳过推送');
  }
} catch (error) {
  console.error('❌ 错误:', error.message);
  process.exit(1);
}

