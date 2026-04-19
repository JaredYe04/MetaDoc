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

/**
 * 生成写入 resources 的 .env：去掉纯注释行、去掉行尾注释。
 * 行尾注释按「空白 + #」识别，避免误伤 URL 等未加引号且含 # 的值；双引号串内 # 保留。
 */
function stripEnvCommentsForResources(content) {
  const lines = content.split(/\r?\n/)
  const out = []
  for (const line of lines) {
    const t = line.trim()
    if (t === '') {
      out.push('')
      continue
    }
    if (t.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) {
      out.push(line.trimEnd())
      continue
    }
    const keyPart = line.slice(0, eq)
    const valuePart = line.slice(eq + 1)
    out.push(keyPart + '=' + stripTrailingEnvComment(valuePart))
  }
  return out.length ? out.join('\n') + '\n' : ''
}

function stripTrailingEnvComment(valuePart) {
  const s = valuePart
  const mLead = s.match(/^\s*/)
  const lead = mLead ? mLead[0] : ''
  const rest = s.slice(lead.length)
  if (rest.startsWith('"')) {
    let i = 1
    let esc = false
    while (i < rest.length) {
      const c = rest[i]
      if (esc) {
        esc = false
        i++
        continue
      }
      if (c === '\\') {
        esc = true
        i++
        continue
      }
      if (c === '"') {
        const tail = rest.slice(i + 1)
        const withoutComment = tail.replace(/^\s+#.*$/, '')
        return (lead + rest.slice(0, i + 1) + withoutComment).trimEnd()
      }
      i++
    }
    return s.trimEnd()
  }
  if (rest.startsWith("'")) {
    const end = rest.indexOf("'", 1)
    if (end > 0) {
      const tail = rest.slice(end + 1)
      const withoutComment = tail.replace(/^\s+#.*$/, '')
      return (lead + rest.slice(0, end + 1) + withoutComment).trimEnd()
    }
    return s.trimEnd()
  }
  const idx = s.search(/\s+#/)
  if (idx >= 0) return s.slice(0, idx).trimEnd()
  return s.trimEnd()
}

// 确保 resources 目录存在
if (!fs.existsSync(resourcesDir)) {
  fs.mkdirSync(resourcesDir, { recursive: true })
}

// 写入 .env（去掉注释，不原样复制）
if (fs.existsSync(rootEnvPath)) {
  try {
    const raw = fs.readFileSync(rootEnvPath, 'utf8')
    const cleaned = stripEnvCommentsForResources(raw)
    fs.writeFileSync(targetEnvPath, cleaned, 'utf8')
    console.log('✓ .env 已写入 resources（已去除注释行与行尾注释）')
  } catch (error) {
    console.error('✗ 处理 .env 文件失败:', error.message)
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

// Windows：若缺 md-icon.ico 但已有 tex-icon.ico，复制一份避免 .md 关联落到空白/错误 ICO（临时优于无）
if (platform === 'win32') {
  const mdIco = path.join(buildDir, 'md-icon.ico')
  const texIco = path.join(buildDir, 'tex-icon.ico')
  if (!fs.existsSync(mdIco) && fs.existsSync(texIco)) {
    try {
      fs.copyFileSync(texIco, mdIco)
      console.log('✓ 已从 tex-icon.ico 复制生成 md-icon.ico（建议后续执行 npm run generate-icons 生成专用 Markdown 图标）')
    } catch (e) {
      console.warn('✗ 无法从 tex-icon 复制 md-icon.ico:', e.message)
    }
  }
}
