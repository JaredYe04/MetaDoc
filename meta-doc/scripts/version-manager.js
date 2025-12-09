/**
 * 版本管理模块
 * 功能：
 * 1. 基于 Conventional Commits 规范自动判断版本升级类型
 * 2. 支持手动修改版本号
 * 3. 版本格式：Beta0.0.1
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const VERSION_FILE = path.resolve(__dirname, '../version.json');
const DEFAULT_VERSION = 'Beta0.0.1';

// 版本升级配置
const VERSION_CONFIG = {
  // docs 类型是否升级版本（true: PATCH +1, false: 不升级）
  docsIncrement: false,
  // chore 类型是否升级版本（true: PATCH +1, false: 不升级）
  choreIncrement: false,
  // 在 0.x 版本时，BREAKING CHANGE 是否升级为 MINOR 而不是 MAJOR
  breakingAsMinorInBeta: true
};

/**
 * 解析版本号字符串，提取数字部分
 * @param {string} version - 版本号字符串，如 "Beta0.0.1"
 * @returns {Object} - { major, minor, patch }
 */
function parseVersion(version) {
  // 移除 "Beta" 前缀，提取数字部分
  const match = version.match(/Beta(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    throw new Error(`无效的版本号格式: ${version}`);
  }
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10)
  };
}

/**
 * 格式化版本号为字符串
 * @param {Object} versionObj - { major, minor, patch }
 * @returns {string} - 版本号字符串，如 "Beta0.0.1"
 */
function formatVersion(versionObj) {
  return `Beta${versionObj.major}.${versionObj.minor}.${versionObj.patch}`;
}

/**
 * 增加版本号的指定级别
 * @param {string} currentVersion - 当前版本号
 * @param {string} level - 升级级别: 'major', 'minor', 'patch'
 * @returns {string} - 新版本号
 */
function incrementVersionByLevel(currentVersion, level) {
  const version = parseVersion(currentVersion);
  
  switch (level) {
    case 'major':
      version.major += 1;
      version.minor = 0;
      version.patch = 0;
      break;
    case 'minor':
      version.minor += 1;
      version.patch = 0;
      break;
    case 'patch':
      version.patch += 1;
      break;
    default:
      throw new Error(`无效的升级级别: ${level}`);
  }
  
  return formatVersion(version);
}

/**
 * 解析 commit message，识别类型和是否包含 BREAKING CHANGE
 * @param {string} message - commit message
 * @returns {Object} - { type, isBreaking, isKeyFeat }
 */
function parseCommitMessage(message) {
  if (!message || typeof message !== 'string') {
    return { type: 'fix', isBreaking: false, isKeyFeat: false };
  }
  
  const trimmed = message.trim();
  
  // 检查是否包含 BREAKING CHANGE
  const isBreaking = /BREAKING CHANGE/i.test(trimmed) || /^[^:]+!:/i.test(trimmed);
  
  // 检查是否是 key feat（包含 "key" 关键词的 feat）
  const isKeyFeat = /^feat.*\bkey\b/i.test(trimmed) || /^feat.*\b关键\b/i.test(trimmed);
  
  // 匹配 Conventional Commits 格式: type(scope): description
  const match = trimmed.match(/^(\w+)(?:\([^)]+\))?(!?):/);
  
  if (match) {
    const type = match[1].toLowerCase();
    return { type, isBreaking: isBreaking || match[2] === '!', isKeyFeat };
  }
  
  // 如果没有匹配到格式，当作 fix 处理（fallback）
  return { type: 'fix', isBreaking: false, isKeyFeat: false };
}

/**
 * 根据 commit 类型决定版本升级级别
 * @param {Object} commitInfo - { type, isBreaking, isKeyFeat }
 * @returns {string|null} - 升级级别: 'major', 'minor', 'patch', 或 null（不升级）
 */
function getVersionLevel(commitInfo) {
  const { type, isBreaking, isKeyFeat } = commitInfo;
  
  // BREAKING CHANGE 优先处理
  if (isBreaking) {
    // 如果在 0.x 版本且配置为当作 MINOR 处理
    if (VERSION_CONFIG.breakingAsMinorInBeta) {
      return 'minor';
    }
    return 'major';
  }
  
  // key feat 算作两个 feat，所以直接返回 minor（相当于两个 minor 的效果）
  if (isKeyFeat) {
    return 'minor';
  }
  
  // 根据类型决定升级级别
  switch (type) {
    case 'feat':
      return 'minor';
    case 'fix':
    case 'refactor':
    case 'perf':
      return 'patch';
    case 'docs':
      return VERSION_CONFIG.docsIncrement ? 'patch' : null;
    case 'chore':
      return VERSION_CONFIG.choreIncrement ? 'patch' : null;
    default:
      // 未知类型，当作 fix 处理
      return 'patch';
  }
}

/**
 * 获取自指定 commit 以来的所有 commits
 * @param {string} lastCommitHash - 上次处理的 commit hash（可选）
 * @returns {Array<Object>} - [{ hash, message, date }]
 */
function getCommitsSince(lastCommitHash = null) {
  try {
    let command = 'git log --pretty=format:"%H|%s|%cd" --date=iso';
    
    if (lastCommitHash) {
      // 获取指定 commit 之后的所有 commits（不包括该 commit）
      command += ` ${lastCommitHash}..HEAD`;
    } else {
      // 获取所有 commits
      command += ' HEAD';
    }
    
    const output = execSync(command, {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    
    if (!output) {
      return [];
    }
    
    return output.split('\n').map(line => {
      const [hash, ...rest] = line.split('|');
      const message = rest.slice(0, -1).join('|'); // message 可能包含 |，需要重新组合
      const date = rest[rest.length - 1];
      return { hash, message, date };
    });
  } catch (error) {
    console.warn('警告: 无法获取 git commits，可能不在 git 仓库中:', error.message);
    return [];
  }
}

/**
 * 获取当前 HEAD 的 commit hash
 * @returns {string|null} - commit hash 或 null
 */
function getCurrentCommitHash() {
  try {
    const hash = execSync('git rev-parse HEAD', {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    return hash || null;
  } catch (error) {
    console.warn('警告: 无法获取当前 commit hash:', error.message);
    return null;
  }
}

/**
 * 读取版本文件
 * @returns {Object} - { version, lastCommitHash, commitCount }
 */
function readVersionFile() {
  if (!fs.existsSync(VERSION_FILE)) {
    return {
      version: DEFAULT_VERSION,
      lastCommitHash: null,
      commitCount: 0
    };
  }
  
  try {
    const content = fs.readFileSync(VERSION_FILE, 'utf-8');
    const data = JSON.parse(content);
    return {
      version: data.version || DEFAULT_VERSION,
      lastCommitHash: data.lastCommitHash || null,
      commitCount: data.commitCount || 0
    };
  } catch (error) {
    console.warn('警告: 读取版本文件失败，使用默认版本:', error.message);
    return {
      version: DEFAULT_VERSION,
      lastCommitHash: null,
      commitCount: 0
    };
  }
}

/**
 * 写入版本文件
 * @param {string} version - 版本号
 * @param {string} lastCommitHash - 最后处理的 commit hash
 * @param {number} commitCount - 提交次数（保留用于兼容）
 */
function writeVersionFile(version, lastCommitHash, commitCount = 0) {
  const data = {
    version,
    lastCommitHash,
    commitCount,
    updatedAt: new Date().toISOString()
  };
  
  fs.writeFileSync(VERSION_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * 自动更新版本（基于 Conventional Commits）
 * @param {boolean} force - 是否强制更新（即使没有新 commits）
 * @returns {string} - 更新后的版本号
 */
function autoUpdateVersion(force = false) {
  const currentData = readVersionFile();
  const currentCommitHash = getCurrentCommitHash();
  
  // 如果 commit hash 未变化且不强制更新，返回当前版本
  if (!force && currentCommitHash === currentData.lastCommitHash) {
    return currentData.version;
  }
  
  // 获取自上次版本更新以来的所有 commits
  const newCommits = getCommitsSince(currentData.lastCommitHash);
  
  if (newCommits.length === 0 && !force) {
    return currentData.version;
  }
  
  // 分析所有 commits，确定最高升级级别
  let maxLevel = null;
  let version = parseVersion(currentData.version);
  
  // 统计信息
  const stats = {
    feat: 0,
    fix: 0,
    docs: 0,
    refactor: 0,
    perf: 0,
    chore: 0,
    breaking: 0,
    keyFeat: 0,
    other: 0
  };
  
  for (const commit of newCommits) {
    const commitInfo = parseCommitMessage(commit.message);
    const level = getVersionLevel(commitInfo);
    
    // 统计
    if (commitInfo.isBreaking) {
      stats.breaking++;
    } else if (commitInfo.isKeyFeat) {
      stats.keyFeat++;
    } else {
      // 统计各类型 commit
      if (stats.hasOwnProperty(commitInfo.type)) {
        stats[commitInfo.type] = (stats[commitInfo.type] || 0) + 1;
      } else {
        stats.other++;
      }
    }
    
    // 确定最高升级级别（major > minor > patch）
    if (level === 'major' || (maxLevel !== 'major' && level === 'minor') || (maxLevel === null && level === 'patch')) {
      maxLevel = level;
    }
  }
  
  // 如果强制更新但没有新 commits，默认升级 patch
  if (force && newCommits.length === 0) {
    maxLevel = 'patch';
  }
  
  // 应用版本升级
  if (maxLevel) {
    version = parseVersion(incrementVersionByLevel(currentData.version, maxLevel));
    
    // 如果有 key feat，需要再额外升级一次 minor（因为 key feat 算作两个 feat）
    // 例如：如果有 key feat，即使其他都是 patch，也要先升级到 minor，然后再升级一次 minor
    if (stats.keyFeat > 0 && maxLevel !== 'major') {
      // key feat 已经触发了一次 minor 升级，现在需要再升级一次 minor（算作两个 feat）
      version.minor += 1;
      version.patch = 0;
    }
  }
  
  const newVersion = formatVersion(version);
  
  // 保存新版本
  const commitCount = currentData.commitCount + newCommits.length;
  writeVersionFile(newVersion, currentCommitHash, commitCount);
  
  // 输出详细信息
  console.log(`版本已更新: ${currentData.version} -> ${newVersion}`);
  if (newCommits.length > 0) {
    console.log(`处理了 ${newCommits.length} 个新 commits`);
    console.log(`升级级别: ${maxLevel || '无'}`);
    if (Object.values(stats).some(v => v > 0)) {
      console.log(`统计: ${JSON.stringify(stats, null, 2)}`);
    }
  }
  
  return newVersion;
}

/**
 * 手动设置版本号
 * @param {string} version - 新版本号
 */
function setVersion(version) {
  // 验证版本号格式
  try {
    parseVersion(version);
  } catch (error) {
    throw new Error(`无效的版本号格式: ${version}。格式应为 BetaX.Y.Z（如 Beta0.0.1）`);
  }
  
  const currentCommitHash = getCurrentCommitHash();
  const currentData = readVersionFile();
  writeVersionFile(version, currentCommitHash, currentData.commitCount);
  
  console.log(`版本已手动设置为: ${version}`);
  return version;
}

/**
 * 获取当前版本号
 * @returns {string} - 当前版本号
 */
function getCurrentVersion() {
  const data = readVersionFile();
  return data.version;
}

/**
 * 更新 package.json 中的版本号
 * @param {string} version - 版本号（可选，不提供则从版本文件读取）
 */
function updatePackageJson(version = null) {
  const packageJsonPath = path.resolve(__dirname, '../package.json');
  
  if (!fs.existsSync(packageJsonPath)) {
    console.warn('警告: package.json 不存在');
    return;
  }
  
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  const newVersion = version || getCurrentVersion();
  
  // 移除 "Beta" 前缀，只保留数字部分用于 package.json
  const numericVersion = newVersion.replace(/^Beta/, '');
  packageJson.version = numericVersion;
  
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2), 'utf-8');
  console.log(`✓ package.json 版本已更新为: ${numericVersion}`);
}

// 命令行接口
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  
  switch (command) {
    case 'get':
      console.log(getCurrentVersion());
      break;
      
    case 'set':
      if (!args[1]) {
        console.error('错误: 请提供版本号，例如: node version-manager.js set Beta0.1.0');
        process.exit(1);
      }
      try {
        setVersion(args[1]);
        updatePackageJson(args[1]);
      } catch (error) {
        console.error('错误:', error.message);
        process.exit(1);
      }
      break;
      
    case 'update':
      const force = args[1] === '--force';
      const newVersion = autoUpdateVersion(force);
      updatePackageJson(newVersion);
      break;
      
    case 'increment':
      const currentVersion = getCurrentVersion();
      const incrementedVersion = incrementVersionByLevel(currentVersion, 'patch');
      setVersion(incrementedVersion);
      updatePackageJson(incrementedVersion);
      console.log(`版本已递增: ${currentVersion} -> ${incrementedVersion}`);
      break;
      
    default:
      console.log('版本管理工具 - 基于 Conventional Commits 规范');
      console.log('');
      console.log('用法:');
      console.log('  node version-manager.js get              - 获取当前版本号');
      console.log('  node version-manager.js set <version>    - 手动设置版本号（如: Beta0.1.0）');
      console.log('  node version-manager.js update           - 根据 Conventional Commits 自动更新版本');
      console.log('  node version-manager.js update --force    - 强制更新版本（即使没有新 commits）');
      console.log('  node version-manager.js increment         - 手动递增 patch 版本号');
      console.log('');
      console.log('版本升级规则（基于 Conventional Commits）:');
      console.log('  feat:          → MINOR +1');
      console.log('  fix:           → PATCH +1');
      console.log('  refactor:      → PATCH +1');
      console.log('  perf:          → PATCH +1');
      console.log('  docs:          → 不升级（可配置）');
      console.log('  chore:         → 不升级（可配置）');
      console.log('  BREAKING CHANGE → MAJOR +1（0.x 时可视作 MINOR）');
      console.log('  key feat       → MINOR +1（算作两个 feat）');
      console.log('  无前缀         → PATCH +1（当作 fix 处理）');
      break;
  }
}

module.exports = {
  getCurrentVersion,
  setVersion,
  autoUpdateVersion,
  incrementVersionByLevel,
  updatePackageJson,
  parseVersion,
  formatVersion,
  parseCommitMessage,
  getVersionLevel
};
