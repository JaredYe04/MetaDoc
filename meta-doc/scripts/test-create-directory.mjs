/**
 * 模拟 workspace-tool createDirectory 内部调用流程，用于排查创建目录失败问题
 * 运行: node scripts/test-create-directory.mjs
 */
import fs from 'fs'
import path from 'path'

function normalizePath(p) {
  return p.replace(/[/\\]+/g, '/').replace(/\/+/g, '/')
}

/**
 * 模拟 ensureDirectoryRecursive 的逻辑，但用 Node fs 直接执行
 * 用于验证路径解析和主进程 create-directory 参数是否正确
 */
function simulateEnsureDirectoryRecursive(fullPath) {
  const normalized = normalizePath(fullPath)
  console.log('\n=== 模拟 ensureDirectoryRecursive ===')
  console.log('输入 fullPath:', fullPath)
  console.log('normalized:', normalized)

  let prefix = ''
  let rest = normalized
  const winMatch = normalized.match(/^([A-Za-z]:)(\/.*)?$/)
  if (winMatch) {
    prefix = winMatch[1]
    rest = winMatch[2] || ''
    console.log('Windows 路径, prefix:', prefix, ', rest:', rest)
  }

  const segments = rest.split('/').filter((s) => s.length > 0)
  let current = prefix || (normalized.startsWith('/') ? '/' : '')
  console.log('segments:', segments)
  console.log('初始 current:', JSON.stringify(current))

  const calls = []
  for (const seg of segments) {
    if (!seg) continue
    const parentPath = current
    const folderName = seg
    const fullPathForSeg =
      !current || current === '/'
        ? prefix
          ? `${prefix}/${seg}`
          : `/${seg}`
        : `${current}/${seg}`

    const exists = fs.existsSync(fullPathForSeg)
    calls.push({
      parentPath,
      folderName,
      fullPathForSeg,
      exists,
      wouldCreate: !exists
    })
    current = fullPathForSeg
  }

  return calls
}

/**
 * 模拟主进程 create-directory 的逻辑
 */
function simulateCreateDirectory(parentPath, folderName) {
  console.log('\n--- 主进程 create-directory 模拟 ---')
  console.log('parentPath:', JSON.stringify(parentPath))
  console.log('folderName:', JSON.stringify(folderName))

  // 主进程的校验
  if (!fs.existsSync(parentPath)) {
    throw new Error(`父目录不存在: ${parentPath}`)
  }
  if (!folderName || folderName.trim() === '') {
    throw new Error('文件夹名称不能为空')
  }
  const invalidChars = /[<>:"|?*\\/]/
  if (invalidChars.test(folderName)) {
    throw new Error(`文件夹名称包含非法字符: ${folderName}`)
  }

  const newPath = path.join(parentPath, folderName)
  console.log('path.join 结果:', newPath)

  if (fs.existsSync(newPath)) {
    throw new Error('文件夹已存在')
  }

  fs.mkdirSync(newPath, { recursive: true })
  console.log('创建成功:', newPath)
  return newPath
}

// 测试用例
const testPaths = [
  'C:/Users/tange/Documents/metadoc-agent-test/图表测试',
  'C:/Users/tange/Documents/metadoc-agent-test/图表测试/images',
  'C:/Users/tange/Documents/metadoc-agent-test/test-folder',
  'C:/Users/tange/Documents/metadoc-agent-test/中文目录/sub'
]

console.log('========================================')
console.log('createDirectory 流程模拟测试')
console.log('========================================')

for (const testPath of testPaths) {
  try {
    const calls = simulateEnsureDirectoryRecursive(testPath)
    console.log('\n将执行的 create-directory 调用:')
    for (let i = 0; i < calls.length; i++) {
      const c = calls[i]
      console.log(`  [${i + 1}] parentPath=${JSON.stringify(c.parentPath)}, folderName=${JSON.stringify(c.folderName)}, exists=${c.exists}`)
      if (c.wouldCreate) {
        // 检查 parentPath 在 Windows 下的问题
        if (c.parentPath === 'C:') {
          console.log('    ⚠️ 注意: parentPath="C:" 在 Windows 下可能有问题!')
          console.log('    fs.existsSync("C:") =', fs.existsSync('C:'))
        }
        try {
          simulateCreateDirectory(c.parentPath, c.folderName)
        } catch (err) {
          console.log('    ❌ 创建失败:', err.message)
        }
      }
    }
  } catch (err) {
    console.error('错误:', err.message)
  }
}

console.log('\n========================================')
console.log('测试完成')
console.log('========================================')
