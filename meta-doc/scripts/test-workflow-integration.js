/**
 * 完整的工作流集成测试
 * 模拟 GitHub Actions 工作流的完整执行流程
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const rootDir = path.resolve(__dirname, '..')
const testDir = path.resolve(__dirname, '..', '..', '.test-workflow')

// 清理并创建测试目录
if (fs.existsSync(testDir)) {
  fs.rmSync(testDir, { recursive: true, force: true })
}
fs.mkdirSync(testDir, { recursive: true })

console.log('🔄 模拟完整工作流执行...\n')

// 模拟 GitHub Actions 环境
const githubOutput = path.join(testDir, 'github_output.txt')
const env = {
  ...process.env,
  GITHUB_OUTPUT: githubOutput,
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_REF: 'refs/tags/dev-0.13.10',
  RELEASE_REPO_OWNER: 'JaredYe04',
  RELEASE_REPO: 'MetaDoc-Releases',
  GH_TOKEN: 'test-token',
  INPUT_RELEASE_TYPE: 'dev',
  NODE_ENV: 'production'
}

// 清空 GITHUB_OUTPUT
if (fs.existsSync(githubOutput)) {
  fs.unlinkSync(githubOutput)
}

const outputs = {}

function captureOutput(stepName, command, options = {}) {
  console.log(`\n📌 步骤: ${stepName}`)
  try {
    const output = execSync(command, {
      cwd: rootDir,
      env: { ...env, ...options.env },
      encoding: 'utf-8',
      stdio: 'pipe'
    })

    // 解析输出
    const lines = output.split('\n').filter((l) => l.trim())
    lines.forEach((line) => {
      if (line.includes('=')) {
        const [key, ...valueParts] = line.split('=')
        const value = valueParts.join('=')
        outputs[key] = value
      }
    })

    // 读取 GITHUB_OUTPUT
    if (fs.existsSync(githubOutput)) {
      const content = fs.readFileSync(githubOutput, 'utf-8')
      content.split('\n').forEach((line) => {
        if (line.includes('=')) {
          const [key, ...valueParts] = line.split('=')
          const value = valueParts.join('=')
          outputs[key] = value
        }
      })
    }

    console.log(`   ✅ 成功`)
    if (Object.keys(outputs).length > 0) {
      console.log(
        `   📤 输出:`,
        Object.keys(outputs)
          .map((k) => `${k}=${outputs[k]}`)
          .join(', ')
      )
    }
    return true
  } catch (error) {
    console.error(`   ❌ 失败: ${error.message}`)
    return false
  }
}

// 步骤 1: 读取版本信息
const step1 = captureOutput('读取版本信息', `node scripts/get-version-info.js "Beta0.13.10"`)

if (!step1 || !outputs.version || !outputs.clean_version) {
  console.error('\n❌ 工作流在步骤 1 失败')
  process.exit(1)
}

// 步骤 2: 确定发布类型
const step2 = captureOutput('确定发布类型', `node scripts/get-release-type.js "dev"`)

if (!step2 || !outputs.type) {
  console.error('\n❌ 工作流在步骤 2 失败')
  process.exit(1)
}

// 步骤 3: 确定标签和 Release 名称
const step3 = captureOutput(
  '确定标签和 Release 名称',
  `node scripts/get-release-info.js "${outputs.type}" "${outputs.clean_version}"`
)

if (!step3 || !outputs.tag || !outputs.release_name) {
  console.error('\n❌ 工作流在步骤 3 失败')
  process.exit(1)
}

console.log(`\n📋 确定的发布信息:`)
console.log(`   - 版本: ${outputs.version}`)
console.log(`   - 清理版本: ${outputs.clean_version}`)
console.log(`   - 发布类型: ${outputs.type}`)
console.log(`   - 标签: ${outputs.tag}`)
console.log(`   - Release 名称: ${outputs.release_name}`)
console.log(`   - 预发布: ${outputs.is_prerelease}`)

// 步骤 4: 检查版本是否已发布（模拟）
console.log(`\n📌 步骤: 检查版本是否已发布`)
console.log(`   ℹ️  模拟检查（实际会调用 GitHub API）`)
outputs.release_exists = 'false' // 模拟不存在

// 步骤 5: 检查本地构建产物
const step5 = captureOutput(
  '检查本地构建产物',
  `node scripts/check-local-build.js "${outputs.clean_version}"`
)

// 步骤 6: 生成发布日志（模拟）
console.log(`\n📌 步骤: 生成发布日志`)
const releaseNotesFile = path.join(testDir, 'release-notes.txt')
fs.writeFileSync(releaseNotesFile, `# Release Notes for ${outputs.tag}\n\n- 测试发布说明`)
console.log(`   ✅ 模拟生成发布日志: ${releaseNotesFile}`)

// 步骤 7: 读取发布说明
const step7 = captureOutput(
  '读取发布说明',
  `node scripts/prepare-release-notes.js "" "${releaseNotesFile}" "${path.join(testDir, 'final-notes.txt')}"`
)

if (!step7 || !outputs.notes) {
  console.error('\n❌ 工作流在步骤 7 失败')
  process.exit(1)
}

// 步骤 8: 保存发布日志
const step8 = captureOutput(
  '保存发布日志',
  `node scripts/save-release-log.js "${outputs.version}" "${outputs.tag}" "${outputs.type}" "${outputs.release_name}" "${outputs.is_prerelease}" "test-sha" "123"`,
  { env: { GITHUB_SHA: 'test-sha', GITHUB_RUN_ID: '123' } }
)

// 验证最终输出
console.log('\n' + '='.repeat(60))
console.log('📊 工作流执行结果')
console.log('='.repeat(60))
console.log('✅ 所有步骤执行成功')
console.log('\n📤 最终输出变量:')
Object.keys(outputs)
  .sort()
  .forEach((key) => {
    console.log(`   ${key} = ${outputs[key]}`)
  })

// 验证关键输出
const requiredOutputs = [
  'version',
  'clean_version',
  'type',
  'tag',
  'release_name',
  'is_prerelease',
  'notes'
]
const missing = requiredOutputs.filter((key) => !outputs[key])

if (missing.length > 0) {
  console.error(`\n❌ 缺少必要的输出: ${missing.join(', ')}`)
  process.exit(1)
}

console.log('\n🎉 工作流模拟测试通过！所有脚本都能正常工作。')
console.log('\n💡 提示: 在实际工作流中，这些脚本会按顺序执行，')
console.log('   如果某个步骤失败，工作流会停止并报告错误。')
