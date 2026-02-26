/**
 * Playwright Electron E2E 入口
 * - 默认：新建 Markdown 文档流程
 * - --dev：若 out/main 不存在则自动执行 electron-vite build（不跑 npm run build / prebuild）
 * - --latex：执行 LaTeX 流程（新建 LaTeX 文档 → 另存为 → 编译 → 检查 PDF）
 *
 * 使用：node e2e/run-electron.mjs [--dev] [--latex]
 * 运行前请关闭其他 MetaDoc 窗口。
 */
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { createRequire } from 'module'
import { spawn } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const projectRoot = path.resolve(__dirname, '..')
const mainScript = path.join(projectRoot, 'out', 'main', 'index.js')

const args = process.argv.slice(2)
const isDev = args.includes('--dev')
const isLatex = args.includes('--latex')

async function ensureBuilt() {
  if (fs.existsSync(mainScript)) return
  if (!isDev) {
    console.error('未找到主进程入口，请先执行: npm run build，或使用 --dev 自动构建')
    process.exit(1)
  }
  console.log('out/main 不存在，正在执行 electron-vite build（不包含 prebuild）...')
  await new Promise((resolve, reject) => {
    const child = spawn('npx', ['electron-vite', 'build'], {
      cwd: projectRoot,
      shell: true,
      stdio: 'inherit'
    })
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`build exited ${code}`))))
  })
  if (!fs.existsSync(mainScript)) {
    console.error('electron-vite build 后仍未找到 out/main/index.js')
    process.exit(1)
  }
  console.log('构建完成')
}

const LAUNCH_TIMEOUT = 90000
const FIRST_WINDOW_TIMEOUT = 90000
const STEP_TIMEOUT = 20000

async function launchElectron(electron, extraArgs = []) {
  const args = [path.join('out', 'main', 'index.js'), ...extraArgs]
  return electron.launch({
    cwd: projectRoot,
    args,
    timeout: LAUNCH_TIMEOUT,
    env: {
      ...process.env,
      CI: undefined,
      DISABLE_GPU: '1',
      ELECTRON_ENABLE_LOGGING: '1'
    }
  })
}

async function runMarkdownFlow(electronApp, window) {
  await window.waitForLoadState('domcontentloaded').catch(() => {})
  await window.waitForTimeout(2000)

  const newDocBtn = window.locator(
    '.new-tab-button[title="新建文档"], .new-tab-button[title="New Document"]'
  )
  await newDocBtn.first().click({ timeout: STEP_TIMEOUT })
  console.log('已点击「新建文档」')

  await window.waitForTimeout(1500)
  const useTemplateBtn = window.getByRole('button', { name: /使用模板|Use template/i }).first()
  const useTemplateVisible = await useTemplateBtn.isVisible().catch(() => false)
  if (useTemplateVisible) {
    await useTemplateBtn.click()
    console.log('已选择模板并进入编辑器')
  }

  await window.waitForTimeout(1000)
  const editorOrPreview = window
    .locator('.vditor, .markdown-body, [class*="editor"], [class*="Editor"]')
    .first()
  await editorOrPreview.waitFor({ state: 'visible', timeout: STEP_TIMEOUT }).catch(() => {})
  console.log('新建 Markdown 文档流程完成')
}

async function runLatexFlow(electronApp, window) {
  const e2eOutDir = path.join(projectRoot, 'e2e', 'out')
  const texPath = path.join(projectRoot, 'e2e', 'out', 'e2e-latex.tex')
  if (!fs.existsSync(texPath)) {
    if (!fs.existsSync(e2eOutDir)) fs.mkdirSync(e2eOutDir, { recursive: true })
    fs.writeFileSync(
      texPath,
      '\\documentclass{article}\n\\usepackage[utf8]{inputenc}\n\\title{E2E Test}\n\\author{MetaDoc}\n\\date{\\today}\n\\begin{document}\n\\maketitle\nHello from E2E.\n\\end{document}\n',
      'utf8'
    )
  }
  const saveFilePath = texPath

  // 主进程： mock 另存为对话框，固定到 e2e/out/e2e-latex.tex
  await electronApp.evaluate(async ({ dialog }, targetPath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: targetPath })
    return 'patched'
  }, saveFilePath)

  await window.waitForLoadState('domcontentloaded').catch(() => {})
  await window.waitForTimeout(6000)

  // 若当前在“预览”等视图，先切到“编辑器”视图（ViewMenu 里“编辑”/“编辑器”）
  const editorViewBtn = window
    .getByRole('button', { name: /编辑|编辑器|Editor/i })
    .or(window.locator('[class*="view-menu"]').getByText(/编辑|Editor/i))
  if (
    await editorViewBtn
      .first()
      .isVisible()
      .catch(() => false)
  ) {
    await editorViewBtn
      .first()
      .click()
      .catch(() => {})
    await window.waitForTimeout(2000)
  }

  // 等待 LaTeX 工具栏或编辑器区域
  await window
    .locator('.editor-console-container, .toolbar-icon, [class*="latex-column"], [id*="latex"]')
    .first()
    .waitFor({ state: 'visible', timeout: 25000 })
    .catch(() => {})

  // 另存为
  await window.keyboard.press('Control+Shift+S')
  await window.waitForTimeout(2500)

  const screenshotDir = path.join(projectRoot, 'e2e', 'screenshots')
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true })

  // 1) 找到“编译”按钮：LaTeX 工具栏中最后一个 .toolbar-icon（顺序：行号、预览、PDF、控制台、编译）
  const compileByTitle = window.getByTitle(/编译|Compile/i).first()
  const compileByIcon = window
    .locator('.toolbar-icon')
    .filter({ has: window.locator('icon[name="code"], [name="code"]') })
    .first()
  const compileAsLast = window.locator('.resizable-container .toolbar-icon').last()
  let compileBtn = compileByTitle
  if (!(await compileByTitle.isVisible().catch(() => false))) {
    compileBtn = (await compileByIcon.isVisible().catch(() => false))
      ? compileByIcon
      : compileAsLast
  }
  await compileBtn.waitFor({ state: 'visible', timeout: 15000 })
  await compileBtn.scrollIntoViewIfNeeded()
  await window.waitForTimeout(500)
  await window
    .screenshot({ path: path.join(screenshotDir, 'latex-before-compile-click.png') })
    .catch(() => {})
  await compileBtn.click({ timeout: 15000 })
  console.log('已点击编译按钮')
  await window
    .screenshot({ path: path.join(screenshotDir, 'latex-after-compile-click.png') })
    .catch(() => {})

  // 2) 等待编译完成：先等 PDF 文件出现在磁盘上（轮询，最多 60s）
  const pdfPath = path.join(projectRoot, 'e2e', 'out', 'e2e-latex.pdf')
  const compileWaitMs = 60000
  const pollMs = 1000
  let foundPdf = false
  for (let elapsed = 0; elapsed < compileWaitMs; elapsed += pollMs) {
    await window.waitForTimeout(pollMs)
    if (fs.existsSync(pdfPath)) {
      foundPdf = true
      console.log('PDF 已生成:', pdfPath)
      break
    }
  }
  if (!foundPdf) {
    throw new Error(`编译超时：${compileWaitMs / 1000}s 内未生成 PDF 文件: ${pdfPath}`)
  }

  // 3) 等待界面出现“编译成功”或 PDF 预览真正加载（工具栏/页码出现）
  await window.waitForTimeout(3000)
  const successText = window.getByText(/编译成功|Compiled successfully|编译完成/i).first()
  const pdfToolbar = window.locator('.pdf-toolbar, .pdf-toolbar__page').first()
  const pdfCanvas = window.locator('.pdf-column canvas, [class*="PdfPreview"] canvas').first()
  const successVisible = await successText.isVisible().catch(() => false)
  const toolbarVisible = await pdfToolbar.isVisible().catch(() => false)
  const canvasVisible = await pdfCanvas.isVisible().catch(() => false)
  if (!successVisible && !toolbarVisible && !canvasVisible) {
    await Promise.race([
      successText.waitFor({ state: 'visible', timeout: 15000 }),
      pdfToolbar.waitFor({ state: 'visible', timeout: 15000 }),
      pdfCanvas.waitFor({ state: 'visible', timeout: 15000 })
    ]).catch(() => {})
  }
  const hasPdfUi =
    (await pdfToolbar.isVisible().catch(() => false)) ||
    (await pdfCanvas.isVisible().catch(() => false))
  if (!hasPdfUi) {
    await window
      .screenshot({ path: path.join(screenshotDir, 'latex-pdf-check-failed.png') })
      .catch(() => {})
    throw new Error('编译后 PDF 预览未正确显示（未看到 PDF 工具栏或画布）')
  }
  console.log('LaTeX 编译成功，PDF 预览已显示')

  await window
    .screenshot({ path: path.join(screenshotDir, `latex-after-compile-${Date.now()}.png`) })
    .catch(() => {})
}

;(async () => {
  let electronApp
  try {
    await ensureBuilt()
  } catch (e) {
    console.error('构建失败:', e.message)
    process.exit(1)
  }

  const { _electron: electron } = require('playwright')
  try {
    let launchExtraArgs = []
    if (isLatex) {
      const e2eOut = path.join(projectRoot, 'e2e', 'out')
      if (!fs.existsSync(e2eOut)) fs.mkdirSync(e2eOut, { recursive: true })
      const latexTexPath = path.join(e2eOut, 'e2e-latex.tex')
      if (!fs.existsSync(latexTexPath)) {
        fs.writeFileSync(
          latexTexPath,
          '\\documentclass{article}\n\\usepackage[utf8]{inputenc}\n\\title{E2E Test}\n\\author{MetaDoc}\n\\date{\\today}\n\\begin{document}\n\\maketitle\nHello from E2E.\n\\end{document}\n',
          'utf8'
        )
      }
      launchExtraArgs = [latexTexPath]
      console.log('使用 LaTeX 文件启动:', latexTexPath)
    }
    console.log('正在启动 MetaDoc (Electron)...')
    electronApp = await launchElectron(electron, launchExtraArgs)
    const window = await electronApp.firstWindow({ timeout: FIRST_WINDOW_TIMEOUT })
    window.setDefaultTimeout(STEP_TIMEOUT)

    window.on('console', (msg) => {
      const text = msg.text()
      const type = msg.type()
      if (type === 'error') console.error('[Renderer]', text)
      else if (type === 'warning') console.warn('[Renderer]', text)
      else console.log('[Renderer]', text)
    })

    console.log('窗口已就绪，标题:', await window.title())

    if (isLatex) {
      await runLatexFlow(electronApp, window)
    } else {
      await runMarkdownFlow(electronApp, window)
      const screenshotDir = path.join(projectRoot, 'e2e', 'screenshots')
      if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true })
      await window
        .screenshot({ path: path.join(screenshotDir, `electron-new-doc-${Date.now()}.png`) })
        .catch(() => {})
    }

    await electronApp.close()
    console.log('E2E 测试通过')
  } catch (err) {
    console.error('E2E 失败:', err.message)
    if (electronApp) await electronApp.close().catch(() => {})
    process.exit(1)
  }
})()
