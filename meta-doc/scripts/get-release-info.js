/**
 * 确定标签和 Release 名称的 Node.js 脚本
 * 用于在 Windows 本地环境和 GitHub Actions 中替代 bash 脚本
 */

const releaseType = process.argv[2] || process.env.RELEASE_TYPE || 'prod';
const cleanVersion = process.argv[3] || process.env.CLEAN_VERSION || '0.0.1';

let tag, releaseName, isPrerelease;

if (releaseType === 'dev') {
  tag = `dev-${cleanVersion}`;
  releaseName = `开发版 ${cleanVersion}`;
  isPrerelease = true;
} else {
  tag = `v${cleanVersion}`;
  releaseName = `v${cleanVersion}`;
  isPrerelease = false;
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

