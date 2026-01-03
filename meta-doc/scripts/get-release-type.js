/**
 * 确定发布类型的 Node.js 脚本
 * 用于在 Windows 本地环境和 GitHub Actions 中替代 bash 脚本
 */

const eventName = process.env.GITHUB_EVENT_NAME || '';
const ref = process.env.GITHUB_REF || '';

// 从环境变量或命令行参数获取发布类型
const inputReleaseType = process.argv[2] || process.env.INPUT_RELEASE_TYPE || '';

let releaseType = 'prod';

if (eventName === 'workflow_dispatch') {
  // 手动触发时，使用输入参数
  releaseType = inputReleaseType || 'prod';
} else if (ref.startsWith('refs/tags/dev-')) {
  releaseType = 'dev';
} else if (ref.startsWith('refs/tags/v')) {
  releaseType = 'prod';
}

// 输出到 GITHUB_OUTPUT
if (process.env.GITHUB_OUTPUT) {
  const fs = require('fs');
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `type=${releaseType}\n`);
}

console.log(`Release type: ${releaseType}`);
process.stdout.write(`type=${releaseType}\n`);

