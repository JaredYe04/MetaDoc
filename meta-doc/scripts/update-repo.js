/**
 * 更新 Git 仓库到最新状态
 * 用于在 self-hosted runner 上优化 checkout 性能
 * 如果仓库已存在，执行增量更新而不是重新克隆
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 从命令行参数获取 ref 和 ref_name
const ref = process.argv[2] || '';
const refName = process.argv[3] || 'main';

// 获取 git 仓库根目录（从当前工作目录向上查找）
function getGitRoot() {
  let currentDir = process.cwd();
  while (currentDir !== path.dirname(currentDir)) {
    const gitDir = path.join(currentDir, '.git');
    if (fs.existsSync(gitDir)) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }
  return null;
}

try {
  const gitRoot = getGitRoot();
  
  if (!gitRoot) {
    console.log('ℹ️  仓库不存在，checkout action 已处理');
    process.exit(0);
  }

  console.log('📦 检测到现有仓库，执行增量更新...');
  console.log(`   仓库路径: ${gitRoot}`);
  console.log(`   目标引用: ${ref || refName}`);

  // 获取远程 URL
  try {
    const remoteUrl = execSync('git config --get remote.origin.url', {
      cwd: gitRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    console.log(`   远程仓库: ${remoteUrl}`);
  } catch (error) {
    // 忽略错误
  }

  // 执行 git fetch
  try {
    console.log('   🔄 执行 git fetch...');
    execSync('git fetch --all --prune', {
      cwd: gitRoot,
      stdio: 'inherit'
    });
    console.log('   ✅ Fetch 完成');
  } catch (error) {
    console.warn('   ⚠️  Fetch 失败，继续执行:', error.message);
  }

  // 尝试重置到目标引用
  let resetSuccess = false;
  if (ref) {
    try {
      console.log(`   🔄 重置到 ${ref}...`);
      execSync(`git reset --hard ${ref}`, {
        cwd: gitRoot,
        stdio: 'inherit'
      });
      resetSuccess = true;
      console.log('   ✅ 重置成功');
    } catch (error) {
      console.warn(`   ⚠️  重置到 ${ref} 失败:`, error.message);
    }
  }

  if (!resetSuccess && refName) {
    try {
      const targetRef = `origin/${refName}`;
      console.log(`   🔄 重置到 ${targetRef}...`);
      execSync(`git reset --hard ${targetRef}`, {
        cwd: gitRoot,
        stdio: 'inherit'
      });
      resetSuccess = true;
      console.log('   ✅ 重置成功');
    } catch (error) {
      console.warn(`   ⚠️  重置到 origin/${refName} 失败:`, error.message);
    }
  }

  // 清理未跟踪的文件
  try {
    console.log('   🧹 清理未跟踪的文件...');
    execSync('git clean -fd', {
      cwd: gitRoot,
      stdio: 'inherit'
    });
    console.log('   ✅ 清理完成');
  } catch (error) {
    console.warn('   ⚠️  清理失败:', error.message);
  }

  // 显示当前状态
  try {
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: gitRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    const currentCommit = execSync('git rev-parse HEAD', {
      cwd: gitRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim().substring(0, 7);
    console.log(`   📍 当前分支: ${currentBranch}`);
    console.log(`   📍 当前提交: ${currentCommit}`);
  } catch (error) {
    // 忽略错误
  }

  console.log('✅ 仓库已更新到最新状态');
} catch (error) {
  console.error('❌ 更新仓库失败:', error.message);
  // 不中断流程，让 checkout action 处理
  process.exit(0);
}

