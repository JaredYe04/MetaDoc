/**
 * 准备发布说明的 Node.js 脚本
 * 用于在 Windows 本地环境和 GitHub Actions 中替代 bash 脚本
 */

const fs = require('fs');
const path = require('path');

const inputNotes = process.argv[2] || '';
const releaseNotesFile = process.argv[3] || 'release-notes.txt';
const outputFile = process.argv[4] || 'final-notes.txt';

try {
  let content = '';
  
  // 如果提供了输入说明，使用它；否则从文件读取
  if (inputNotes && inputNotes.trim() !== '') {
    content = inputNotes;
  } else {
    if (fs.existsSync(releaseNotesFile)) {
      content = fs.readFileSync(releaseNotesFile, 'utf-8');
    } else {
      content = 'No release notes available.';
    }
  }

  // 写入最终文件
  fs.writeFileSync(outputFile, content, 'utf-8');
  
  // 输出到 GITHUB_OUTPUT（如果存在）
  if (process.env.GITHUB_OUTPUT) {
    // 转义换行符以便在 GITHUB_OUTPUT 中正确存储
    const escapedContent = content.replace(/\n/g, '\\n').replace(/\r/g, '');
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `notes=${escapedContent}\n`);
  }
  
  // 输出到标准输出
  const escapedContent = content.replace(/\n/g, '\\n').replace(/\r/g, '');
  process.stdout.write(`notes=${escapedContent}\n`);
  
  console.log(`✅ 发布说明已保存到: ${outputFile}`);
} catch (error) {
  console.error('❌ 准备发布说明失败:', error.message);
  process.exit(1);
}

