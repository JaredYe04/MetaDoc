/**
 * 保存发布日志的 Node.js 脚本
 * 用于在 Windows 本地环境和 GitHub Actions 中替代 bash 脚本
 */

const fs = require('fs');
const path = require('path');

const version = process.argv[2] || process.env.VERSION || 'Beta0.0.1';
const tag = process.argv[3] || process.env.TAG || '';
const releaseType = process.argv[4] || process.env.RELEASE_TYPE || 'prod';
const releaseName = process.argv[5] || process.env.RELEASE_NAME || '';
const isPrerelease = process.argv[6] === 'true' || process.env.IS_PRERELEASE === 'true';
const commit = process.argv[7] || process.env.GITHUB_SHA || '';
const workflowRun = process.argv[8] || process.env.GITHUB_RUN_ID || '';

// 创建日志目录
const logDir = path.join(process.cwd(), '.github', 'release-logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// 生成文件名
const date = new Date().toISOString().replace(/[-:]/g, '').split('.')[0].replace('T', '_');
const logFile = path.join(logDir, `release_${tag}_${date}.json`);

// 创建日志对象
const logData = {
  version,
  tag,
  type: releaseType,
  release_name: releaseName,
  prerelease: isPrerelease,
  published_at: new Date().toISOString(),
  commit,
  workflow_run: workflowRun
};

// 写入日志文件
fs.writeFileSync(logFile, JSON.stringify(logData, null, 2), 'utf-8');

console.log(`✅ 发布日志已保存到: ${logFile}`);

