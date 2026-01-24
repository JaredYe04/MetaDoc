/**
 * 确定标签和 Release 名称的 Node.js 脚本
 * 用于在 Windows 本地环境和 GitHub Actions 中替代 bash 脚本
 * 
 * 支持两种模式：
 * 1. 新版本模式：使用提供的版本号创建新标签
 * 2. 复用最新版本模式：使用最新发布的标签（如果提供了 latest_tag）
 */

const releaseType = process.argv[2] || process.env.RELEASE_TYPE || 'prod';
const cleanVersion = process.argv[3] || process.env.CLEAN_VERSION || '0.0.1';
const latestTag = process.argv[4] || process.env.LATEST_TAG || '';

let tag, releaseName, isPrerelease;

// 如果提供了 latest_tag 且不为空，使用最新版本模式
if (latestTag && latestTag.trim() !== '') {
  tag = latestTag.trim();
  // 从标签中提取版本号
  const versionMatch = tag.match(/(?:dev-|v)(.+)/);
  const version = versionMatch ? versionMatch[1] : tag;
  
  if (releaseType === 'dev') {
    releaseName = `开发版 ${version}`;
    isPrerelease = true;
  } else {
    releaseName = `v${version}`;
    isPrerelease = false;
  }
} else {
  // 新版本模式：使用提供的版本号
  if (releaseType === 'dev') {
    tag = `dev-${cleanVersion}`;
    releaseName = `开发版 ${cleanVersion}`;
    isPrerelease = true;
  } else {
    tag = `v${cleanVersion}`;
    releaseName = `v${cleanVersion}`;
    isPrerelease = false;
  }
}

// 输出到 GITHUB_OUTPUT
if (process.env.GITHUB_OUTPUT) {
  const fs = require('fs');
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `tag=${tag}\n`);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `release_name=${releaseName}\n`);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `is_prerelease=${isPrerelease}\n`);
}

process.stdout.write(`tag=${tag}\n`);
process.stdout.write(`release_name=${releaseName}\n`);
process.stdout.write(`is_prerelease=${isPrerelease}\n`);

