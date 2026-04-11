/**
 * 将指定版本写入 meta-doc/version.json 与 meta-doc/package.json（不提交 git）。
 * 用于 CI：在矩阵构建前或 finalize 阶段与 prepare 计算出的版本对齐。
 *
 * 用法: node scripts/apply-release-version.js <版本号>
 */

const versionManager = require('./version-manager.js')

const raw = process.argv[2]
if (!raw || !String(raw).trim()) {
  console.error('用法: node scripts/apply-release-version.js <版本号>（如 Beta0.1.0 或 0.1.0）')
  process.exit(1)
}

let target = String(raw).trim()
if (!target.startsWith('Beta') && /^\d+\.\d+\.\d+/.test(target)) {
  target = `Beta${target}`
}

versionManager.setVersion(target)
versionManager.updatePackageJson(target)
console.log(`✅ 已写入工作区版本: ${target}`)
