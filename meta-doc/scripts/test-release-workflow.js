/**
 * 本地测试发布工作流脚本
 * 使用 mock 数据测试所有相关脚本，避免实际运行工作流
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const rootDir = path.resolve(__dirname, '..')
const testDir = path.resolve(__dirname, '..', '..', '.test-release')

// 清理并创建测试目录
if (fs.existsSync(testDir)) {
  fs.rmSync(testDir, { recursive: true, force: true })
}
fs.mkdirSync(testDir, { recursive: true })

console.log('🧪 开始测试发布工作流脚本...\n')

// 设置测试环境变量
const testEnv = {
  ...process.env,
  GITHUB_OUTPUT: path.join(testDir, 'github_output.txt'),
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_REF: 'refs/tags/dev-0.13.10',
  RELEASE_REPO_OWNER: 'JaredYe04',
  RELEASE_REPO: 'MetaDoc-Releases',
  GH_TOKEN: 'test-token-12345',
  INPUT_RELEASE_TYPE: 'dev'
}

let testResults = {
  passed: 0,
  failed: 0,
  errors: []
}

function runTest(name, testFn) {
  console.log(`\n📋 测试: ${name}`)
  try {
    testFn()
    console.log(`✅ ${name} - 通过`)
    testResults.passed++
  } catch (error) {
    console.error(`❌ ${name} - 失败: ${error.message}`)
    testResults.failed++
    testResults.errors.push({ name, error: error.message })
  }
}

// 测试 1: get-version-info.js
runTest('get-version-info.js - 使用输入版本', () => {
  const output = execSync(`node scripts/get-version-info.js "Beta0.13.10"`, {
    cwd: rootDir,
    env: testEnv,
    encoding: 'utf-8'
  })
  if (!output.includes('version=Beta0.13.10')) {
    throw new Error('版本输出不正确')
  }
  if (!output.includes('clean_version=0.13.10')) {
    throw new Error('清理版本输出不正确')
  }
})

runTest('get-version-info.js - 从 package.json 读取版本', () => {
  const output = execSync(`node scripts/get-version-info.js ""`, {
    cwd: rootDir,
    env: testEnv,
    encoding: 'utf-8'
  })
  if (!output.includes('version=')) {
    throw new Error('未输出版本信息')
  }
})

// 测试 2: get-release-type.js
runTest('get-release-type.js - workflow_dispatch dev', () => {
  const output = execSync(`node scripts/get-release-type.js "dev"`, {
    cwd: rootDir,
    env: { ...testEnv, INPUT_RELEASE_TYPE: 'dev' },
    encoding: 'utf-8'
  })
  if (!output.includes('type=dev')) {
    throw new Error('发布类型输出不正确')
  }
})

runTest('get-release-type.js - 从 tag 判断', () => {
  const output = execSync(`node scripts/get-release-type.js ""`, {
    cwd: rootDir,
    env: { ...testEnv, GITHUB_REF: 'refs/tags/dev-0.13.10' },
    encoding: 'utf-8'
  })
  if (!output.includes('type=dev')) {
    throw new Error('从 tag 判断发布类型失败')
  }
})

// 测试 3: get-release-info.js
runTest('get-release-info.js - dev 版本', () => {
  const output = execSync(`node scripts/get-release-info.js "dev" "0.13.10"`, {
    cwd: rootDir,
    env: testEnv,
    encoding: 'utf-8'
  })
  if (!output.includes('tag=dev-0.13.10')) {
    throw new Error('dev 标签不正确')
  }
  if (!output.includes('is_prerelease=true')) {
    throw new Error('dev 版本应该是预发布版本')
  }
})

runTest('get-release-info.js - prod 版本', () => {
  const output = execSync(`node scripts/get-release-info.js "prod" "0.13.10"`, {
    cwd: rootDir,
    env: testEnv,
    encoding: 'utf-8'
  })
  if (!output.includes('tag=v0.13.10')) {
    throw new Error('prod 标签不正确')
  }
  if (!output.includes('is_prerelease=false')) {
    throw new Error('prod 版本不应该是预发布版本')
  }
})

// 测试 4: check-release-exists.js (mock GitHub API)
runTest('check-release-exists.js - release 不存在（应该返回 false）', () => {
  // 这个测试会实际调用 GitHub API，但使用无效的 token，应该返回 404
  const output = execSync(`node scripts/check-release-exists.js "dev-nonexistent-999.999.999"`, {
    cwd: rootDir,
    env: testEnv,
    encoding: 'utf-8'
  })
  if (!output.includes('release_exists=false')) {
    throw new Error('不存在的 release 应该返回 false')
  }
})

// 测试 5: check-local-build.js
runTest('check-local-build.js - 检查本地构建产物', () => {
  const output = execSync(`node scripts/check-local-build.js "0.13.10"`, {
    cwd: rootDir,
    env: testEnv,
    encoding: 'utf-8'
  })
  // 这个测试只是检查脚本能否运行，不检查实际文件是否存在
  if (!output.includes('local_build_exists=')) {
    throw new Error('应该输出 local_build_exists')
  }
})

// 测试 6: prepare-release-notes.js
runTest('prepare-release-notes.js - 使用输入说明', () => {
  // 创建测试文件
  const testNotesFile = path.join(testDir, 'test-release-notes.txt')
  fs.writeFileSync(testNotesFile, 'Test release notes from file')

  const output = execSync(
    `node scripts/prepare-release-notes.js "Test input notes" "${testNotesFile}" "${path.join(testDir, 'test-final.txt')}"`,
    { cwd: rootDir, env: testEnv, encoding: 'utf-8' }
  )
  if (!output.includes('notes=Test input notes')) {
    throw new Error('应该使用输入说明')
  }
})

runTest('prepare-release-notes.js - 从文件读取说明', () => {
  const testNotesFile = path.join(testDir, 'test-release-notes-2.txt')
  fs.writeFileSync(testNotesFile, 'Test release notes from file')

  const output = execSync(
    `node scripts/prepare-release-notes.js "" "${testNotesFile}" "${path.join(testDir, 'test-final-2.txt')}"`,
    { cwd: rootDir, env: testEnv, encoding: 'utf-8' }
  )
  if (!output.includes('notes=Test release notes from file')) {
    throw new Error('应该从文件读取说明')
  }
})

// 测试 7: save-release-log.js
runTest('save-release-log.js - 保存发布日志', () => {
  const logDir = path.join(rootDir, '.github', 'release-logs')
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true })
  }

  execSync(
    `node scripts/save-release-log.js "Beta0.13.10" "dev-0.13.10" "dev" "开发版 0.13.10" "true" "test-sha" "123"`,
    {
      cwd: rootDir,
      env: { ...testEnv, GITHUB_SHA: 'test-sha', GITHUB_RUN_ID: '123' },
      encoding: 'utf-8'
    }
  )

  // 检查日志文件是否创建
  const logFiles = fs.readdirSync(logDir).filter((f) => f.includes('dev-0.13.10'))
  if (logFiles.length === 0) {
    throw new Error('日志文件未创建')
  }
})

// 测试 8: 验证 GITHUB_OUTPUT 格式
runTest('验证 GITHUB_OUTPUT 格式', () => {
  if (fs.existsSync(testEnv.GITHUB_OUTPUT)) {
    const content = fs.readFileSync(testEnv.GITHUB_OUTPUT, 'utf-8')
    const lines = content.split('\n').filter((l) => l.trim())

    // 检查格式：key=value
    for (const line of lines) {
      if (!line.includes('=')) {
        throw new Error(`GITHUB_OUTPUT 格式错误: ${line}`)
      }
    }
    console.log(`   ✓ GITHUB_OUTPUT 包含 ${lines.length} 行输出`)
  }
})

// 测试 9: 验证脚本参数处理
runTest('验证空参数处理', () => {
  // 测试空字符串参数
  const output1 = execSync(`node scripts/get-version-info.js ""`, {
    cwd: rootDir,
    env: testEnv,
    encoding: 'utf-8'
  })
  if (!output1.includes('version=')) {
    throw new Error('空参数应该从 package.json 读取版本')
  }
})

// 测试 10: 验证文件路径
runTest('验证文件路径处理', () => {
  const testFile = path.join(testDir, 'test-file.txt')
  fs.writeFileSync(testFile, 'test content')

  if (!fs.existsSync(testFile)) {
    throw new Error('测试文件创建失败')
  }

  const content = fs.readFileSync(testFile, 'utf-8')
  if (content !== 'test content') {
    throw new Error('文件内容不正确')
  }
})

// 输出测试结果
console.log('\n' + '='.repeat(60))
console.log('📊 测试结果汇总')
console.log('='.repeat(60))
console.log(`✅ 通过: ${testResults.passed}`)
console.log(`❌ 失败: ${testResults.failed}`)
console.log(`📈 总计: ${testResults.passed + testResults.failed}`)

if (testResults.errors.length > 0) {
  console.log('\n❌ 失败的测试:')
  testResults.errors.forEach(({ name, error }) => {
    console.log(`   - ${name}: ${error}`)
  })
}

if (testResults.failed === 0) {
  console.log('\n🎉 所有测试通过！')
  process.exit(0)
} else {
  console.log('\n⚠️  部分测试失败，请检查上述错误')
  process.exit(1)
}
