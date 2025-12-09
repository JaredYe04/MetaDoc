/**
 * 构建前脚本：将 .env 和 version.json 文件复制到 resources 目录
 */
const fs = require('fs');
const path = require('path');

const rootEnvPath = path.resolve(__dirname, '../.env');
const rootVersionPath = path.resolve(__dirname, '../version.json');
const resourcesDir = path.resolve(__dirname, '../resources');
const targetEnvPath = path.join(resourcesDir, '.env');
const targetVersionPath = path.join(resourcesDir, 'version.json');

// 确保 resources 目录存在
if (!fs.existsSync(resourcesDir)) {
  fs.mkdirSync(resourcesDir, { recursive: true });
}

// 复制 .env 文件
if (fs.existsSync(rootEnvPath)) {
  try {
    fs.copyFileSync(rootEnvPath, targetEnvPath);
    console.log('✓ .env 文件已复制到 resources 目录');
  } catch (error) {
    console.error('✗ 复制 .env 文件失败:', error.message);
    process.exit(1);
  }
} else {
  console.warn('警告: .env 文件不存在，跳过复制');
}

// 复制 version.json 文件
if (fs.existsSync(rootVersionPath)) {
  try {
    fs.copyFileSync(rootVersionPath, targetVersionPath);
    console.log('✓ version.json 文件已复制到 resources 目录');
  } catch (error) {
    console.error('✗ 复制 version.json 文件失败:', error.message);
    process.exit(1);
  }
} else {
  console.warn('警告: version.json 文件不存在，跳过复制');
}

