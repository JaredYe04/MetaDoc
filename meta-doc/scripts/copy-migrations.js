/**
 * 构建前脚本：将迁移文件复制到输出目录
 */
const fs = require('fs');
const path = require('path');

const sourceDir = path.resolve(__dirname, '../src/main/database/migrations');
const targetDir = path.resolve(__dirname, '../out/main/database/migrations');

// 确保目标目录存在
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

// 检查源目录是否存在
if (!fs.existsSync(sourceDir)) {
  console.warn(`警告: 迁移文件源目录不存在: ${sourceDir}`);
  process.exit(0); // 非致命错误，继续构建
}

// 读取源目录中的所有 .sql 文件
try {
  const files = fs.readdirSync(sourceDir).filter(f => f.endsWith('.sql'));
  
  if (files.length === 0) {
    console.warn('警告: 未找到任何迁移文件');
    return;
  }
  
  // 复制每个迁移文件
  let copiedCount = 0;
  for (const file of files) {
    const sourcePath = path.join(sourceDir, file);
    const targetPath = path.join(targetDir, file);
    
    try {
      fs.copyFileSync(sourcePath, targetPath);
      copiedCount++;
      console.log(`✓ 已复制迁移文件: ${file}`);
    } catch (error) {
      console.error(`✗ 复制迁移文件失败 (${file}):`, error.message);
      process.exit(1);
    }
  }
  
  console.log(`✓ 成功复制 ${copiedCount}/${files.length} 个迁移文件到输出目录`);
} catch (error) {
  console.error('✗ 读取迁移文件目录失败:', error.message);
  process.exit(1);
}

