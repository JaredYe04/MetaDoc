#!/usr/bin/env node
/**
 * 在 release 工作流中运行 format:check 和 lint；
 * 若失败不退出，而是生成警告报告和文件列表，供上传为 artifact。
 * 始终以 0 退出，不阻断发布。
 */

const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const reportDir = path.resolve(__dirname, '../../prepare-check-report')
const reportPath = path.join(reportDir, 'warnings.txt')
const prettierListPath = path.join(reportDir, 'prettier-files.txt')
const formatLogPath = path.join(reportDir, 'format.log')
const lintLogPath = path.join(reportDir, 'lint.log')

const metaDocRoot = path.resolve(__dirname, '..')

function run(cmd, options = {}) {
  return spawnSync(cmd, {
    shell: true,
    cwd: metaDocRoot,
    encoding: 'utf8',
    ...options
  })
}

function runCapture(cmd) {
  const r = run(cmd, { stdio: 'pipe' })
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' }
}

function ensureReportDir() {
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true })
  }
}

function appendReport(lines) {
  fs.appendFileSync(reportPath, lines.join('\n') + '\n')
}

ensureReportDir()
fs.writeFileSync(reportPath, '# 格式与 Lint 检查报告（仅警告，不阻断发布）\n\n')

// ----- Prettier (format:check) -----
appendReport(['## Prettier (format:check)', ''])
const formatResult = runCapture('npm run format:check')
fs.writeFileSync(formatLogPath, formatResult.stdout + formatResult.stderr)

if (formatResult.status !== 0) {
  appendReport(['状态: 失败（仅警告）', ''])
  const listResult = runCapture('npx prettier --check . --list-different 2>/dev/null || true')
  const fileList = (listResult.stdout || '').trim().split('\n').filter(Boolean)
  if (fileList.length > 0) {
    fs.writeFileSync(prettierListPath, fileList.join('\n') + '\n')
    appendReport(['### 需格式化的文件列表', ''])
    fileList.forEach((f) => appendReport([f]))
    appendReport([''])
  }
  appendReport(['### 完整输出见 format.log', ''])
} else {
  appendReport(['状态: 通过', ''])
}
appendReport([''])

// ----- Lint (含 Puppeteer 文档检查) -----
appendReport(['## Lint（含 Puppeteer 文档检查）', ''])
const lintResult = runCapture('npm run lint')
const lintOut = lintResult.stdout + lintResult.stderr
fs.writeFileSync(lintLogPath, lintOut)

if (lintResult.status !== 0) {
  appendReport(['状态: 失败（仅警告）', ''])
  appendReport(['### 完整输出见 lint.log', ''])
  appendReport([''])
  appendReport(['### 输出摘要（前 80 行）', ''])
  lintOut
    .split('\n')
    .slice(0, 80)
    .forEach((line) => appendReport([line]))
} else {
  appendReport(['状态: 通过', ''])
}
appendReport([''])

appendReport(['---', '本步骤不阻断发布；请根据上述文件列表或日志在本地修复后提交。'])

process.exit(0)
