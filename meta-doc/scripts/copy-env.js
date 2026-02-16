/**
 * 构建前脚本：将 .env 和 version.json 文件复制到 resources 目录
 * 同时检查图标文件是否存在，如果不存在则提示生成
 */
const fs = require('fs')
const path = require('path')

const rootEnvPath = path.resolve(__dirname, '../.env')
const rootVersionPath = path.resolve(__dirname, '../version.json')
const resourcesDir = path.resolve(__dirname, '../resources')
const buildDir = path.resolve(__dirname, '../build')
const targetEnvPath = path.join(resourcesDir, '.env')
const targetVersionPath = path.join(resourcesDir, 'version.json')

// 确保 resources 目录存在
if (!fs.existsSync(resourcesDir)) {
  fs.mkdirSync(resourcesDir, { recursive: true })
}

// 复制 .env 文件
if (fs.existsSync(rootEnvPath)) {
  try {
    fs.copyFileSync(rootEnvPath, targetEnvPath)
    console.log('✓ .env 文件已复制到 resources 目录')
  } catch (error) {
    console.error('✗ 复制 .env 文件失败:', error.message)
    process.exit(1)
  }
} else {
  console.warn('警告: .env 文件不存在，跳过复制')
}

// 复制 version.json 文件
if (fs.existsSync(rootVersionPath)) {
  try {
    fs.copyFileSync(rootVersionPath, targetVersionPath)
    console.log('✓ version.json 文件已复制到 resources 目录')
  } catch (error) {
    console.error('✗ 复制 version.json 文件失败:', error.message)
    process.exit(1)
  }
} else {
  console.warn('警告: version.json 文件不存在，跳过复制')
}

// 检查图标文件是否存在
const requiredIcons = {
  windows: ['icon.ico', 'md-icon.ico', 'tex-icon.ico'],
  mac: ['icon.icns', 'md-icon.icns', 'tex-icon.icns'],
  linux: ['icon.png', 'md-icon.png', 'tex-icon.png']
}

let missingIcons = []
const platform = process.platform
let platformIcons = []

if (platform === 'win32') {
  platformIcons = requiredIcons.windows
} else if (platform === 'darwin') {
  platformIcons = requiredIcons.mac
} else {
  platformIcons = requiredIcons.linux
}

// 检查当前平台的图标文件
for (const icon of platformIcons) {
  const iconPath = path.join(buildDir, icon)
  if (!fs.existsSync(iconPath)) {
    missingIcons.push(icon)
  }
}

// 如果缺少图标文件，提示用户生成
if (missingIcons.length > 0) {
  console.warn('\n⚠️  警告: 以下图标文件不存在:')
  missingIcons.forEach((icon) => {
    console.warn(`   - ${icon}`)
  })
  console.warn('\n请运行以下命令生成图标文件:')
  console.warn('   npm run generate-icons\n')
  // 不退出，允许构建继续（electron-builder 可能会使用默认图标）
}
