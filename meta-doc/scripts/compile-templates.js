/**
 * 批量编译 LaTeX 模板为 PDF，支持按类别、语言筛选。
 * 使用与软件相同的 node-latex-compiler（Tectonic）。
 *
 * 运行方式（在 meta-doc 目录下）：
 *   node scripts/compile-templates.js [options]
 *
 * 选项：
 *   --category=resume|article|report|academic|all  模板类别，默认 all
 *   --locale=zh_CN|en_US|ja_JP|ko_KR|de_DE|fr_FR|all  语言，默认 all
 *   --out=dir  输出目录，默认 debug/compile-pdf
 *   --quiet  不把 Tectonic 的 stderr 打到控制台（仅显示 OK/FAIL）
 *
 * 示例：
 *   node scripts/compile-templates.js --category=resume --locale=zh_CN
 *   node scripts/compile-templates.js --category=academic
 *   node scripts/compile-templates.js
 */

const path = require('path')
const fs = require('fs')

const metaDocRoot = path.join(__dirname, '..')
const templatesBase = path.join(metaDocRoot, 'src', 'renderer', 'src', 'templates')
const indexPath = path.join(templatesBase, 'index.json')

const CATEGORIES = {
  resume: (id) => id.startsWith('resume-'),
  article: (id) => id === 'article',
  report: (id) => id === 'report',
  academic: (id) =>
    ['gb7714_zh', 'ieee_en', 'gb7714_zh_twocolumn', 'ieee_en_twocolumn'].includes(id),
  all: () => true
}

function parseArgs() {
  const out = {
    category: 'all',
    locale: 'all',
    outputDir: path.join(metaDocRoot, '..', '..', 'debug', 'compile-pdf'),
    quiet: false
  }
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--category=')) out.category = arg.slice('--category='.length).toLowerCase()
    else if (arg.startsWith('--locale=')) out.locale = arg.slice('--locale='.length)
    else if (arg.startsWith('--out='))
      out.outputDir = path.resolve(process.cwd(), arg.slice('--out='.length))
    else if (arg === '--quiet') out.quiet = true
  }
  if (!CATEGORIES[out.category]) {
    console.error('无效的 --category，可选: resume, article, report, academic, all')
    process.exit(1)
  }
  return out
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function loadTexTemplates() {
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'))
  const tex = index.formats && index.formats.tex
  if (!tex || !tex.locales) {
    throw new Error('index.json 中未找到 formats.tex.locales')
  }
  return tex.locales
}

function collectTasks(localesData, category, localeFilter) {
  const pred = CATEGORIES[category]
  const locales = localeFilter === 'all' ? Object.keys(localesData) : [localeFilter]
  const tasks = []
  for (const locale of locales) {
    const list = localesData[locale]
    if (!Array.isArray(list)) continue
    for (const entry of list) {
      if (!entry.id || !entry.file) continue
      if (!pred(entry.id)) continue
      tasks.push({ locale, id: entry.id, file: entry.file })
    }
  }
  return tasks
}

async function main() {
  let latexCompiler
  try {
    latexCompiler = require('node-latex-compiler')
  } catch (e) {
    console.error('请确保在 meta-doc 目录下运行，并已安装 node-latex-compiler：')
    console.error('  cd meta-doc && npm install && node scripts/compile-templates.js')
    process.exit(1)
  }

  const { compile, isAvailable } = latexCompiler
  if (!isAvailable()) {
    console.error('Tectonic 不可用，请检查 node-latex-compiler 配置。')
    process.exit(1)
  }

  const args = parseArgs()
  const localesData = loadTexTemplates()
  const tasks = collectTasks(localesData, args.category, args.locale)

  ensureDir(args.outputDir)
  console.log('输出目录:', args.outputDir)
  console.log('类别:', args.category, '| 语言:', args.locale, '| 任务数:', tasks.length, '\n')

  let ok = 0
  let fail = 0
  const onStderr = args.quiet ? () => {} : (data) => process.stderr.write(data)

  for (const { locale, id, file } of tasks) {
    const texDir = path.join(templatesBase, locale, 'tex')
    const texPath = path.join(texDir, file)
    if (!fs.existsSync(texPath)) {
      console.warn(`[跳过] 无文件: ${locale}/${file}`)
      continue
    }

    const tex = fs.readFileSync(texPath, 'utf8')
    const pdfName = `${locale}_${id}.pdf`
    const outputFile = path.join(args.outputDir, pdfName)

    try {
      const result = await compile({
        tex,
        outputDir: args.outputDir,
        outputFile,
        onStdout: () => {},
        onStderr
      })

      if (result.status === 'success' && result.pdfPath) {
        console.log(`[OK] ${pdfName}`)
        ok++
      } else {
        console.error(`[FAIL] ${pdfName} (exitCode: ${result.exitCode ?? '?'})`)
        fail++
      }
    } catch (err) {
      console.error(`[ERROR] ${pdfName}:`, err.message)
      fail++
    }
  }

  console.log('\n完成:', ok, '成功,', fail, '失败')
  console.log('PDF 输出目录:', args.outputDir)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
