/**
 * 获取版本信息的 Node.js 脚本
 * 用于在 Windows 本地环境和 GitHub Actions 中替代 bash 脚本
 * 
 * 用法:
 *   node scripts/get-version-info.js [version]
 * 
 * 如果提供了 version 参数，则使用该版本
 * 否则先运行 version-manager.js update 更新版本，然后从 version.json 或 package.json 读取
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const versionJsonPath = path.join(rootDir, 'version.json');
const packageJsonPath = path.join(rootDir, 'package.json');
const versionManagerPath = path.join(__dirname, 'version-manager.js');

function updateVersion() {
  try {
    // 先运行 version-manager.js update 来更新版本信息
    execSync(`node "${versionManagerPath}" update`, {
      cwd: rootDir,
      stdio: 'inherit'
    });
  } catch (error) {
    console.warn('警告: 运行 version-manager.js update 失败，将使用现有版本信息');
    // 不抛出错误，继续使用现有版本信息
  }
}

function getVersion() {
  // 如果提供了命令行参数且不为空，使用它
  const args = process.argv.slice(2);
  if (args.length > 0 && args[0] && args[0].trim() !== '') {
    return args[0].trim();
  }

  // 如果没有提供版本参数，先更新版本信息
  updateVersion();

  // 尝试从 version.json 读取
  if (fs.existsSync(versionJsonPath)) {
    try {
      const versionData = JSON.parse(fs.readFileSync(versionJsonPath, 'utf-8'));
      if (versionData.version) {
        return versionData.version;
      }
    } catch (error) {
      // 忽略错误，继续尝试其他方法
    }
  }

  // 尝试从 package.json 读取
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageData = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      if (packageData.version) {
        // 如果版本没有 Beta 前缀，添加它
        return packageData.version.startsWith('Beta') 
          ? packageData.version 
          : `Beta${packageData.version}`;
      }
    } catch (error) {
      // 忽略错误
    }
  }

  // 默认版本
  return 'Beta0.0.1';
}

try {
  const version = getVersion();
  const cleanVersion = version.replace(/^Beta/, '');

  // 在 GitHub Actions 中，写入到 GITHUB_OUTPUT 文件
  if (process.env.GITHUB_OUTPUT) {
    const output = `version=${version}\nclean_version=${cleanVersion}\n`;
    fs.appendFileSync(process.env.GITHUB_OUTPUT, output);
  }
  
  // 输出到标准输出（GitHub Actions 会解析这些输出）
  // 格式：key=value（每行一个）
  process.stdout.write(`version=${version}\n`);
  process.stdout.write(`clean_version=${cleanVersion}\n`);
  
  // 在本地环境，也输出到控制台
  if (!process.env.GITHUB_OUTPUT) {
    console.log(`Version: ${version} (clean: ${cleanVersion})`);
  }
} catch (error) {
  console.error('❌ 读取版本信息失败:', error.message);
  process.exit(1);
}

