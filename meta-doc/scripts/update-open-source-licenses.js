/**
 * 自动更新开源许可证文件
 * 使用 license-checker-rseidelsohn 获取项目的开源许可证信息
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const targetFile = path.resolve(__dirname, '../src/renderer/src/assets/open-source-licenses.txt')

// 需要警告的 Copyleft 许可证（这些许可证可能要求衍生作品也采用相同许可证）
const WARNING_LICENSES = [
  'GPL-3.0',
  'AGPL-3.0',
  'GPL-3.0-only',
  'GPL-3.0-or-later',
  'AGPL-3.0-only',
  'AGPL-3.0-or-later'
]

/**
 * 许可证宽松程度排序（从最宽松到最严格）
 * 数值越小越宽松
 */
const LICENSE_PERMISSIVENESS = {
  MIT: 1,
  'Apache-2.0': 2,
  'BSD-2-Clause': 3,
  'BSD-3-Clause': 4,
  ISC: 5,
  Unlicense: 6,
  '0BSD': 7,
  'CC0-1.0': 8,
  'Public Domain': 9,
  'LGPL-2.1': 50,
  'LGPL-3.0': 51,
  'MPL-2.0': 60,
  'EPL-2.0': 70,
  'GPL-2.0': 90,
  'GPL-3.0': 91,
  'AGPL-3.0': 95,
  Unknown: 100
}

/**
 * 获取许可证的宽松程度值
 * @param {string} license 许可证名称
 * @returns {number} 宽松程度值（越小越宽松）
 */
function getLicensePermissiveness(license) {
  const normalized = license.trim().toUpperCase()

  // 直接匹配
  if (LICENSE_PERMISSIVENESS[normalized] !== undefined) {
    return LICENSE_PERMISSIVENESS[normalized]
  }

  // 模糊匹配（处理版本号变体）
  for (const [key, value] of Object.entries(LICENSE_PERMISSIVENESS)) {
    if (normalized.includes(key) || normalized.startsWith(key)) {
      return value
    }
  }

  // 检查是否包含警告许可证
  const hasWarningLicense = WARNING_LICENSES.some((wl) => {
    const pattern = new RegExp(
      `\\b${wl.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
      'i'
    )
    return pattern.test(normalized)
  })

  if (hasWarningLicense) {
    return 90 // 警告许可证默认值
  }

  // 默认返回较大值（较严格）
  return 100
}

/**
 * 从多许可证组合中选择最宽松的许可证
 * 处理 "MIT OR GPL-3.0" 或 "Apache-2.0 AND MIT" 等情况
 * @param {string|string[]} licenses 许可证字符串或数组
 * @returns {string} 选择的许可证
 */
function selectMostPermissiveLicense(licenses) {
  if (!licenses) {
    return 'Unknown'
  }

  // 如果是数组，先转换为字符串
  let licensesStr = Array.isArray(licenses) ? licenses.join(', ') : licenses

  // 移除括号
  licensesStr = licensesStr.replace(/[()]/g, '').trim()

  // 分割 OR 和 AND（优先处理 OR，因为 OR 表示可选择）
  const orParts = licensesStr.split(/\s+OR\s+/i)

  // 如果有 OR，选择最宽松的那个
  if (orParts.length > 1) {
    let mostPermissive = null
    let minPermissiveness = Infinity

    for (const part of orParts) {
      const cleaned = part.trim()
      const permissiveness = getLicensePermissiveness(cleaned)
      if (permissiveness < minPermissiveness) {
        minPermissiveness = permissiveness
        mostPermissive = cleaned
      }
    }

    return mostPermissive || orParts[0].trim()
  }

  // 处理 AND（必须同时满足，选择最严格的作为代表，因为必须遵守所有许可证）
  const andParts = licensesStr.split(/\s+AND\s+/i)
  if (andParts.length > 1) {
    let mostRestrictive = null
    let maxPermissiveness = -Infinity

    for (const part of andParts) {
      const cleaned = part.trim()
      const permissiveness = getLicensePermissiveness(cleaned)
      if (permissiveness > maxPermissiveness) {
        maxPermissiveness = permissiveness
        mostRestrictive = cleaned
      }
    }

    return mostRestrictive || andParts[0].trim()
  }

  // 单个许可证，直接返回
  return licensesStr.trim()
}

console.log('正在获取开源许可证信息...')

try {
  // 运行 license-checker-rseidelsohn 命令，输出 JSON 格式
  const output = execSync('npx license-checker-rseidelsohn --production --json', {
    encoding: 'utf-8',
    cwd: path.resolve(__dirname, '..'),
    stdio: 'pipe'
  })

  // 解析 JSON 输出
  const licenses = JSON.parse(output)

  // 准备输出内容
  const lines = [
    'Open Source Licenses',
    '',
    'This application uses the following open source software:',
    '',
    `Total packages: ${Object.keys(licenses).length}`,
    ''
  ]

  // 按包名排序
  const packageNames = Object.keys(licenses).sort()

  // 统计许可证类型
  const licenseStats = {}

  // 收集使用需要警告的许可证的包
  const warningPackages = []

  // 遍历每个包，格式化输出
  for (const packageName of packageNames) {
    const licenseInfo = licenses[packageName]

    // 格式化包信息（注意：path 和 licenseFile 字段不会被使用，因为它们包含本机绝对路径）
    lines.push(`Package: ${packageName}`)

    if (licenseInfo.version) {
      lines.push(`Version: ${licenseInfo.version}`)
    }

    if (licenseInfo.licenses) {
      // licenses 可能是字符串或数组
      const originalLicensesStr = Array.isArray(licenseInfo.licenses)
        ? licenseInfo.licenses.join(', ')
        : licenseInfo.licenses

      // 选择最宽松的许可证用于显示
      const selectedLicense = selectMostPermissiveLicense(licenseInfo.licenses)

      // 在文件中只显示选择的许可证
      lines.push(`License: ${selectedLicense}`)

      // 统计许可证类型（使用选择的许可证）
      licenseStats[selectedLicense] = (licenseStats[selectedLicense] || 0) + 1

      // 但警告检查仍需要检查原始许可证字符串（包含所有选项）
      const licenseArray = Array.isArray(licenseInfo.licenses)
        ? licenseInfo.licenses
        : [licenseInfo.licenses]

      // 检查原始许可证是否包含需要警告的许可证
      const hasWarningLicense = licenseArray.some((license) => {
        const normalizedLicense = license.toUpperCase().trim()
        return WARNING_LICENSES.some((wl) => {
          const pattern = new RegExp(
            `\\b${wl.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
            'i'
          )
          return pattern.test(normalizedLicense)
        })
      })

      if (hasWarningLicense) {
        if (!warningPackages.find((p) => p.name === packageName)) {
          warningPackages.push({
            name: packageName,
            version: licenseInfo.version || 'unknown',
            license: originalLicensesStr, // 警告中显示完整原始许可证
            selectedLicense: selectedLicense // 记录选择的许可证
          })
        }
      }
    } else {
      // 如果没有许可证信息，标记为未知
      licenseStats['Unknown'] = (licenseStats['Unknown'] || 0) + 1
    }

    if (licenseInfo.repository) {
      lines.push(`Repository: ${licenseInfo.repository}`)
    }

    if (licenseInfo.url && licenseInfo.url !== licenseInfo.repository) {
      lines.push(`URL: ${licenseInfo.url}`)
    }

    if (licenseInfo.publisher) {
      let publisherInfo = `Publisher: ${licenseInfo.publisher}`
      if (licenseInfo.email) {
        publisherInfo += ` <${licenseInfo.email}>`
      }
      lines.push(publisherInfo)
    } else if (licenseInfo.email) {
      lines.push(`Email: ${licenseInfo.email}`)
    }

    // 如果存在 licenseText，添加许可证文本（但限制长度，避免文件过大）
    if (licenseInfo.licenseText) {
      const licenseText = licenseInfo.licenseText.trim()
      // 如果许可证文本太长（超过5000字符），只显示前5000字符并添加提示
      if (licenseText.length > 5000) {
        lines.push('')
        lines.push('License Text (truncated):')
        lines.push('─'.repeat(60))
        lines.push(licenseText.substring(0, 5000))
        lines.push('...')
        lines.push(`[License text truncated. Original length: ${licenseText.length} characters]`)
        lines.push('─'.repeat(60))
      } else {
        lines.push('')
        lines.push('License Text:')
        lines.push('─'.repeat(60))
        lines.push(licenseText)
        lines.push('─'.repeat(60))
      }
    }

    lines.push('')
    lines.push('')
  }

  // 添加许可证统计摘要
  lines.push('='.repeat(60))
  lines.push('License Summary')
  lines.push('='.repeat(60))
  lines.push('')

  // 按数量排序许可证
  const sortedLicenses = Object.entries(licenseStats).sort((a, b) => b[1] - a[1])

  for (const [license, count] of sortedLicenses) {
    lines.push(`${license}: ${count} package(s)`)
  }

  lines.push('')

  // 写入文件
  const content = lines.join('\n')
  fs.writeFileSync(targetFile, content, 'utf-8')

  console.log(`✓ 开源许可证信息已更新到: ${targetFile}`)
  console.log(`✓ 共处理 ${packageNames.length} 个包`)

  // 检查并输出警告
  if (warningPackages.length > 0) {
    console.log('')
    console.log('⚠️  ⚠️  ⚠️  法律风险警告 ⚠️  ⚠️  ⚠️')
    console.log('='.repeat(70))
    console.log('')
    console.log('检测到以下包使用了 GPL-3.0 或 AGPL-3.0 协议：')
    console.log('')
    console.log('这些许可证是 Copyleft 许可证，可能会要求使用它们的软件也采用相同的许可证。')
    console.log('请仔细审查这些依赖，确保符合您的许可证要求。')
    console.log('')
    console.log('受影响的包列表：')
    console.log('')

    warningPackages.forEach((pkg, index) => {
      console.log(`${index + 1}. ${pkg.name}@${pkg.version}`)
      console.log(`   原始许可证: ${pkg.license}`)
      if (pkg.selectedLicense && pkg.selectedLicense !== pkg.license) {
        console.log(`   已选择最宽松许可证: ${pkg.selectedLicense}`)
      }
      console.log('')
    })

    console.log('='.repeat(70))
    console.log('')
    console.log('⚠️  建议：请咨询法律顾问，评估使用这些包对您的项目许可证的影响。')
    console.log('')

    // 设置退出码为非零，表示有警告（但不会阻止脚本执行）
    // 如果需要阻止构建，可以取消下面的注释
    // process.exit(1);
  }
} catch (error) {
  console.error('✗ 更新开源许可证失败:', error.message)

  if (error.stderr) {
    console.error('错误详情:', error.stderr.toString())
  }

  process.exit(1)
}
