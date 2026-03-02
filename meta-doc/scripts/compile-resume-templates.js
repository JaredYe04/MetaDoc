/**
 * 批量编译所有简历 LaTeX 模板为 PDF（便捷入口）。
 * 等价于: node scripts/compile-templates.js --category=resume --out=debug/resume-pdf
 *
 * 运行方式（在 meta-doc 目录下）：
 *   node scripts/compile-resume-templates.js
 *   npm run compile:resume-templates
 */

const { spawnSync } = require('child_process')
const path = require('path')

const node = process.execPath
const script = path.join(__dirname, 'compile-templates.js')
const result = spawnSync(node, [script, '--category=resume', '--out=debug/resume-pdf'], {
  cwd: path.join(__dirname, '..'),
  stdio: 'inherit'
})
process.exit(result.status || 0)
