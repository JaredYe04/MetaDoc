/**
 * 构建前脚本：将 .env 文件复制到 resources 目录
 */
const fs = require('fs');
const path = require('path');

const rootEnvPath = path.resolve(__dirname, '../.env');
const resourcesDir = path.resolve(__dirname, '../resources');
const targetEnvPath = path.join(resourcesDir, '.env');

// 检查源文件是否存在
if (!fs.existsSync(rootEnvPath)) {
  console.warn('警告: .env 文件不存在，跳过复制');
  process.exit(0);
}

// 确保 resources 目录存在
if (!fs.existsSync(resourcesDir)) {
  fs.mkdirSync(resourcesDir, { recursive: true });
}

// 复制文件
try {
  fs.copyFileSync(rootEnvPath, targetEnvPath);
  console.log('✓ .env 文件已复制到 resources 目录');
} catch (error) {
  console.error('✗ 复制 .env 文件失败:', error.message);
  process.exit(1);
}

