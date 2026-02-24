#!/usr/bin/env node

const puppeteer = require('puppeteer')
const { default: pLimit } = require('p-limit')
const { execSync } = require('child_process')
const glob = require('glob')
const path = require('path')
const fs = require('fs')

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
}

let totalErrors = 0
let totalFiles = 0
let filesWithErrors = 0
let browser = null
let browserLaunchCount = 0

const limit = pLimit(3)

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

function logError(file, line, type, message, context = '') {
  totalErrors++
  console.log('')
  log('╔═══════════════════════════════════════════════════════════════', 'red')
  log('║ ❌ 文档检查错误', 'red')
  log('╠═══════════════════════════════════════════════════════════════', 'red')
  log(`║ 文件: ${file}${line ? `:${line}` : ''}`, 'yellow')
  log(`║ 类型: ${type}`, 'cyan')
  log(`║ 错误: ${message}`, 'red')
  if (context) {
    log('╠═══════════════════════════════════════════════════════════════', 'red')
    log('║ 上下文:', 'cyan')
    context
      .split('\n')
      .slice(0, 5)
      .forEach((l) => {
        log(`║   ${l}`, 'yellow')
      })
  }
  log('╚═══════════════════════════════════════════════════════════════', 'red')
  console.log('')
}

function logSeparator(title) {
  console.log('')
  log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'blue')
  log(`${title}`, 'bright')
  log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'blue')
  console.log('')
}

function printBuildResponsibilityWarning() {
  console.error('')
  console.error(
    `${colors.red}╔════════════════════════════════════════════════════════════════╗${colors.reset}`
  )
  console.error(
    `${colors.red}║                                                                ║${colors.reset}`
  )
  console.error(
    `${colors.red}║          ⚠️  BUILD RESPONSIBILITY PROTOCOL                    ║${colors.reset}`
  )
  console.error(
    `${colors.red}║                                                                ║${colors.reset}`
  )
  console.error(
    `${colors.yellow}║  ANY agent/process that runs \`npm run build\` MUST resolve    ║${colors.reset}`
  )
  console.error(
    `${colors.yellow}║  ALL reported errors:                                          ║${colors.reset}`
  )
  console.error(
    `${colors.yellow}║                                                                ║${colors.reset}`
  )
  console.error(
    `${colors.green}║  ✅ Prettier errors  → Run \`npm run format\`                  ║${colors.reset}`
  )
  console.error(
    `${colors.green}║  ✅ ESLint errors    → Fix code style issues                   ║${colors.reset}`
  )
  console.error(
    `${colors.green}║  ✅ Manual errors    → Fix markdown/charts/links               ║${colors.reset}`
  )
  console.error(
    `${colors.green}║  ✅ TypeScript errors→ Fix type/import issues                  ║${colors.reset}`
  )
  console.error(
    `${colors.yellow}║                                                                ║${colors.reset}`
  )
  console.error(
    `${colors.red}║  DO NOT leave build with unresolved errors.                    ║${colors.reset}`
  )
  console.error(
    `${colors.red}║  THIS IS A HARD REQUIREMENT.                                   ║${colors.reset}`
  )
  console.error(
    `${colors.red}║                                                                ║${colors.reset}`
  )
  console.error(
    `${colors.red}╚════════════════════════════════════════════════════════════════╝${colors.reset}`
  )
  console.error('')
}

async function initBrowser() {
  if (browser) {
    try {
      await browser.close()
    } catch (e) {}
  }

  log('🚀 启动 Puppeteer...', 'blue')
  browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--single-process'
    ],
    protocolTimeout: 60000
  })

  browserLaunchCount++
  log(`✅ Puppeteer 已启动 (第 ${browserLaunchCount} 次)`, 'green')

  browser.on('disconnected', () => {
    log('⚠️ 浏览器连接断开', 'yellow')
    browser = null
  })
}

async function closeBrowser() {
  if (browser) {
    try {
      await browser.close()
    } catch (e) {}
    log('👋 Puppeteer 已关闭', 'blue')
  }
}

async function ensureBrowserHealthy() {
  if (!browser || !browser.connected) {
    await initBrowser()
    return
  }

  try {
    const pages = await browser.pages()
    log(`ℹ️ 浏览器健康检查: ${pages.length} 个页面`, 'blue')
  } catch (err) {
    log('⚠️ 浏览器无响应，重新启动...', 'yellow')
    await closeBrowser()
    await initBrowser()
  }
}

function checkMarkdownWithCLI(filePath) {
  const errors = []
  try {
    execSync(`npx markdownlint-cli2 "${filePath}" 2>&1`, { encoding: 'utf-8' })
  } catch (err) {
    if (err.stdout) {
      const lines = err.stdout.split('\n')
      lines.forEach((line) => {
        const match = line.match(/:(\d+):\s+(.+)/)
        if (match) {
          errors.push({
            line: parseInt(match[1]),
            message: match[2]
          })
        }
      })
    }
  }
  return errors
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

async function checkMermaidWithPuppeteer(code, filePath, line, maxRetries = 3) {
  return limit(async () => {
    const errors = []
    let lastError = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      let page = null

      try {
        if (!browser?.connected) {
          await initBrowser()
        }

        page = await browser.newPage()

        await page.setRequestInterception(true)
        page.on('request', (req) => {
          const type = req.resourceType()
          if (['image', 'stylesheet', 'font'].includes(type)) {
            req.abort()
          } else {
            req.continue()
          }
        })

        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
          </head>
          <body>
            <div class="mermaid">${escapeHtml(code)}</div>
            <script>
              (async () => {
                window.mermaidCheckComplete = false;
                window.mermaidError = null;
                
                try {
                  mermaid.initialize({ 
                    startOnLoad: false,
                    securityLevel: 'strict',
                    maxTextSize: 50000
                  });
                  await mermaid.run();
                  await new Promise(resolve => setTimeout(resolve, 1500));
                  
                  const errorElements = document.querySelectorAll('.mermaid-error, .error');
                  if (errorElements.length > 0) {
                    window.mermaidError = errorElements[0].textContent;
                  }
                  window.mermaidCheckComplete = true;
                } catch (e) {
                  window.mermaidError = e.message;
                  window.mermaidCheckComplete = true;
                }
              })();
            </script>
          </body>
          </html>
        `

        await page.setContent(html, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        })

        await page.waitForFunction(() => typeof window.mermaid !== 'undefined', { timeout: 15000 })

        await page.waitForFunction(() => window.mermaidCheckComplete === true, {
          timeout: 20000,
          polling: 100
        })

        const error = await page.evaluate(() => window.mermaidError)

        if (error) {
          errors.push({
            line,
            message: `渲染错误: ${error.substring(0, 200)}`,
            context: code.substring(0, 200)
          })
        }

        return errors
      } catch (err) {
        lastError = err
        const msg = err.message || ''

        const retryableErrors = [
          'Connection closed',
          'Protocol error',
          'Target closed',
          'Session closed',
          'Most likely the page has been closed',
          'Navigating frame was detached'
        ]

        const shouldRetry = retryableErrors.some((e) => msg.includes(e))

        if (shouldRetry && attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000
          log(
            `⚠️ 第 ${attempt} 次尝试失败: ${msg.substring(0, 100)}，${delay}ms 后重试...`,
            'yellow'
          )
          await new Promise((r) => setTimeout(r, delay))
          continue
        }

        if (msg.includes('Timeout')) {
          errors.push({
            line,
            message: `渲染超时: Mermaid 图表渲染超过 20 秒`,
            context: code.substring(0, 100)
          })
        } else {
          errors.push({
            line,
            message: `检查失败 (${attempt} 次尝试): ${msg.substring(0, 200)}`,
            context: code.substring(0, 200)
          })
        }

        return errors
      } finally {
        if (page && !page.isClosed()) {
          try {
            await page.close()
          } catch (e) {}
        }
      }
    }

    return errors
  })
}

function checkPlantUML(code, filePath, line) {
  const errors = []

  if (!code.includes('@startuml')) {
    errors.push({
      line,
      message: '缺少 @startuml 开始标记',
      context: code.substring(0, 200)
    })
  }

  if (!code.includes('@enduml')) {
    errors.push({
      line,
      message: '缺少 @enduml 结束标记',
      context: code.substring(0, 200)
    })
  }

  const startIndex = code.indexOf('@startuml')
  const endIndex = code.indexOf('@enduml')
  if (startIndex > -1 && endIndex > -1 && startIndex > endIndex) {
    errors.push({
      line,
      message: '@enduml 出现在 @startuml 之前',
      context: code.substring(0, 200)
    })
  }

  return errors
}

function extractCodeBlocks(content) {
  const blocks = []
  const regex = /```(\w+)\n([\s\S]*?)```/g
  let match
  let lineNum = 1
  let lastIndex = 0

  match = regex.exec(content)
  while (match !== null) {
    const linesBefore = content.substring(lastIndex, match.index).split('\n').length - 1
    lineNum += linesBefore

    blocks.push({
      lang: match[1],
      code: match[2].trim(),
      line: lineNum
    })

    lastIndex = match.index
    match = regex.exec(content)
  }

  return blocks
}

function checkInternalLinks(content, filePath) {
  const errors = []
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g
  let match

  match = linkRegex.exec(content)
  while (match !== null) {
    const linkText = match[1]
    const linkTarget = match[2]

    if (
      linkTarget.startsWith('http://') ||
      linkTarget.startsWith('https://') ||
      linkTarget.startsWith('#')
    ) {
      match = linkRegex.exec(content)
      continue
    }

    const targetPath = path.resolve(path.dirname(filePath), linkTarget)
    if (!fs.existsSync(targetPath)) {
      const mdPath = targetPath + '.md'
      if (!fs.existsSync(mdPath)) {
        errors.push({
          line: 0,
          message: `链接指向的文件不存在: "${linkTarget}"`,
          context: `[${linkText}](${linkTarget})`
        })
      }
    }

    match = linkRegex.exec(content)
  }

  return errors
}

/**
 * Check demo mode coverage requirement
 * Rule: ceil(count_of_h1_h2_h3 / 3), minimum 2 demo components required
 * AGENTS.md Reference: Demo Mode Coverage Linting
 */
function checkDemoModeCoverage(content, filePath) {
  const errors = []
  const relativePath = path.relative(process.cwd(), filePath)

  // Count h1, h2, h3 headings
  const h1Matches = content.match(/^#\s+/gm) || []
  const h2Matches = content.match(/^##\s+/gm) || []
  const h3Matches = content.match(/^###\s+/gm) || []
  const headingCount = h1Matches.length + h2Matches.length + h3Matches.length

  // Calculate required demo modes: ceil(count / 3), minimum 2
  const requiredDemos = Math.max(Math.ceil(headingCount / 3), 2)

  // Count actual demo components (mode="demo" occurrences)
  // Matches patterns like: <ComponentName mode="demo" /> or mode="demo"
  const demoMatches = content.match(/mode\s*=\s*["']demo["']/g) || []
  const actualDemos = demoMatches.length

  if (actualDemos < requiredDemos) {
    errors.push({
      line: 0,
      message: `Demo模式覆盖不足: 需要 ${requiredDemos} 个 (H1-H3共${headingCount}个标题), 实际只有 ${actualDemos} 个。`,
      context: `请在文档中嵌入 ${requiredDemos - actualDemos} 个 Demo 组件，例如:\n<MenuItemsDemo mode="demo" :items='[{"id": "file"}]' />\n<ComponentName mode="demo" />`,
      details: {
        headingCount,
        requiredDemos,
        actualDemos,
        missing: requiredDemos - actualDemos
      }
    })
  }

  return errors
}

async function checkFile(filePath) {
  totalFiles++
  const content = fs.readFileSync(filePath, 'utf-8')
  const relativePath = path.relative(process.cwd(), filePath)
  let hasError = false

  log(`📄 检查: ${relativePath}`, 'cyan')

  const mdErrors = checkMarkdownWithCLI(filePath)
  mdErrors.forEach((err) => {
    hasError = true
    logError(relativePath, err.line, 'Markdown 语法错误', err.message)
  })

  const blocks = extractCodeBlocks(content)

  const mermaidBlocks = blocks.filter((b) => b.lang === 'mermaid')
  const mermaidResults = await Promise.all(
    mermaidBlocks.map((block) => checkMermaidWithPuppeteer(block.code, relativePath, block.line))
  )

  mermaidResults.flat().forEach((err) => {
    hasError = true
    logError(relativePath, err.line, 'Mermaid 图表错误', err.message, err.context)
  })

  const plantUmlBlocks = blocks.filter((b) => b.lang === 'plantuml')
  for (const block of plantUmlBlocks) {
    const errors = checkPlantUML(block.code, relativePath, block.line)
    errors.forEach((err) => {
      hasError = true
      logError(relativePath, err.line, 'PlantUML 图表错误', err.message, err.context)
    })
  }

  const linkErrors = checkInternalLinks(content, filePath)
  linkErrors.forEach((err) => {
    hasError = true
    logError(relativePath, err.line, '内联链接错误', err.message, err.context)
  })

  const demoErrors = checkDemoModeCoverage(content, filePath)
  demoErrors.forEach((err) => {
    hasError = true
    logError(relativePath, err.line, 'Demo模式覆盖不足', err.message, err.context)
  })

  if (hasError) {
    filesWithErrors++
  }
}

async function main() {
  printBuildResponsibilityWarning()
  logSeparator('📚 MetaDoc 手册文档完整检查（使用 Puppeteer）')

  const manualsDir = path.join(__dirname, '..', 'src', 'renderer', 'src', 'manuals')

  if (!fs.existsSync(manualsDir)) {
    log(`❌ 手册目录不存在: ${manualsDir}`, 'red')
    process.exit(1)
  }

  await initBrowser()

  try {
    const files = glob.sync('**/*.md', {
      cwd: manualsDir,
      absolute: true
    })

    log(`🔍 发现 ${files.length} 个手册文档文件`, 'blue')
    console.log('')

    for (let i = 0; i < files.length; i++) {
      await checkFile(files[i])
      if ((i + 1) % 10 === 0) {
        await ensureBrowserHealthy()
      }
    }

    logSeparator('📊 检查总结')

    log(`📁 检查文件数: ${totalFiles}`)
    log(`❌ 错误文件数: ${filesWithErrors}`)
    log(`🔴 总错误数: ${totalErrors}`)

    console.log('')

    if (totalErrors > 0) {
      log('╔═══════════════════════════════════════════════════════════════', 'red')
      log('║                    ❌ 检查未通过', 'red')
      log('╠═══════════════════════════════════════════════════════════════', 'red')
      log('║ 发现文档错误，请修复后再提交代码', 'yellow')
      log('╚═══════════════════════════════════════════════════════════════', 'red')
      console.log('')
      process.exit(1)
    } else {
      log('╔═══════════════════════════════════════════════════════════════', 'green')
      log('║                    ✅ 检查通过', 'green')
      log('╠═══════════════════════════════════════════════════════════════', 'green')
      log('║ 所有手册文档检查通过！', 'green')
      log('╚═══════════════════════════════════════════════════════════════', 'green')
      console.log('')
      process.exit(0)
    }
  } finally {
    await closeBrowser()
  }
}

main().catch((err) => {
  log(`❌ 检查过程出错: ${err.message}`, 'red')
  closeBrowser().then(() => process.exit(1))
})
