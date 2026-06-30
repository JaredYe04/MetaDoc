/**
 * Playwright Electron E2E — OSS / llmEnabled gate
 *
 * 验证：
 * 1. 默认 llmEnabled=false 时不加载 AI 运行时（无 overlay/配件贡献）
 * 2. onStartup 插件（hello-world）仍可在启动时激活
 * 3. 开启 LLM 后插件贡献出现；关闭后贡献清零
 *
 * 使用：node e2e/run-oss-gate.mjs [--dev]
 */
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { createRequire } from 'module'
import { spawn } from 'child_process'
import os from 'os'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const projectRoot = path.resolve(__dirname, '..')
const mainScript = path.join(projectRoot, 'out', 'main', 'index.js')

const isDev = process.argv.includes('--dev')

async function ensureBuilt() {
  if (fs.existsSync(mainScript)) return
  if (!isDev) {
    console.error('未找到主进程入口，请先执行: npm run build，或使用 --dev')
    process.exit(1)
  }
  console.log('out/main 不存在，正在执行 electron-vite build...')
  await new Promise((resolve, reject) => {
    const child = spawn('npx', ['electron-vite', 'build'], {
      cwd: projectRoot,
      shell: true,
      stdio: 'inherit'
    })
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`build exited ${code}`))))
  })
}

const LAUNCH_TIMEOUT = 90000
const FIRST_WINDOW_TIMEOUT = 90000
const IDLE_SYNC_MS = 4500

function makeUserDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'metadoc-e2e-'))
}

async function getSnapshot(window) {
  return window.evaluate(async () => {
    const api = window.__metadocE2E
    if (!api?.getSnapshot) {
      throw new Error('__metadocE2E.getSnapshot 未安装')
    }
    return api.getSnapshot()
  })
}

async function waitForSnapshot(window, predicate, label, timeoutMs = 20000) {
  const start = Date.now()
  let last
  while (Date.now() - start < timeoutMs) {
    last = await getSnapshot(window)
    if (predicate(last)) return last
    await window.waitForTimeout(500)
  }
  throw new Error(`${label} 超时。最后快照: ${JSON.stringify(last)}`)
}

function seedE2EUserSettings(userDataDir) {
  const configPath = path.join(userDataDir, 'config.json')
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      firstRunWizardCompleted: true,
      llmEnabled: false,
      disabledPluginIds: []
    }),
    'utf8'
  )
}

async function setLlmEnabled(window, enabled) {
  await window.evaluate(async (on) => {
    if (window.__metadocE2E?.setLlmEnabled) {
      await window.__metadocE2E.setLlmEnabled(on)
      return
    }
    await window.electron.ipcRenderer.invoke('set-setting', { key: 'llmEnabled', value: on })
    window.__eventBus?.emit('ai-runtime-toggle')
  }, enabled)
  await window.waitForTimeout(2000)
}

;(async () => {
  let electronApp
  const userDataDir = makeUserDataDir()
  try {
    await ensureBuilt()
    const { _electron: electron } = require('playwright')

    console.log('使用隔离 userData:', userDataDir)
    seedE2EUserSettings(userDataDir)
    electronApp = await electron.launch({
      cwd: projectRoot,
      args: [path.join('out', 'main', 'index.js'), `--user-data-dir=${userDataDir}`, '--metadoc-e2e'],
      timeout: LAUNCH_TIMEOUT,
      env: {
        ...process.env,
        DISABLE_GPU: '1',
        ELECTRON_ENABLE_LOGGING: '1'
      }
    })

    const window = await electronApp.firstWindow({ timeout: FIRST_WINDOW_TIMEOUT })
    window.on('console', (msg) => {
      const text = msg.text()
      if (msg.type() === 'error') console.error('[Renderer]', text)
    })

    await window.waitForLoadState('domcontentloaded').catch(() => {})
    await window.waitForFunction(() => window.__metadocE2E?.getSnapshot, null, {
      timeout: 90000
    })
    await window.waitForTimeout(IDLE_SYNC_MS)

    const snapOff = await waitForSnapshot(
      window,
      (s) => s.llmEnabled === false && s.aiRuntimeLoaded === false,
      'llmEnabled=false 且 AI 运行时未加载'
    )
    console.log('快照（LLM 关闭）:', JSON.stringify(snapOff))

    if (snapOff.contributionCounts.editorOverlays > 0) {
      throw new Error('LLM 关闭时不应有 editorOverlays 贡献')
    }
    if (snapOff.contributionCounts.shellOverlays > 0) {
      throw new Error('LLM 关闭时不应有 shellOverlays 贡献')
    }
    if (!snapOff.activePluginIds.includes('metadoc.examples.hello-world')) {
      throw new Error('onStartup 插件 hello-world 应在启动时激活')
    }

    await setLlmEnabled(window, true)
    const snapOn = await waitForSnapshot(
      window,
      (s) =>
        s.llmEnabled === true &&
        s.aiRuntimeLoaded === true &&
        s.contributionCounts.leftMenuItems > 0,
      '开启 LLM 后 AI 运行时应加载',
      90000
    )
    console.log('快照（LLM 开启）:', JSON.stringify(snapOn))

    if (snapOn.contributionCounts.leftMenuItems < 1) {
      throw new Error('LLM 开启后应有 leftMenuItems 插件贡献')
    }
    if (snapOn.activePluginIds.length < 5) {
      throw new Error(`LLM 开启后应激活多个内置插件，实际: ${snapOn.activePluginIds.length}`)
    }

    await setLlmEnabled(window, false)
    const snapOffAgain = await waitForSnapshot(
      window,
      (s) => s.llmEnabled === false && s.aiRuntimeLoaded === false,
      '关闭 LLM 后 AI 运行时应卸载',
      90000
    )
    console.log('快照（LLM 再次关闭）:', JSON.stringify(snapOffAgain))

    if (snapOffAgain.contributionCounts.editorOverlays > 0) {
      throw new Error('LLM 关闭后 editorOverlays 应清零')
    }
    if (snapOffAgain.contributionCounts.shellOverlays > 0) {
      throw new Error('LLM 关闭后 shellOverlays 应清零')
    }
    if (snapOffAgain.contributionCounts.leftMenuItems > 0) {
      throw new Error('LLM 关闭后 leftMenuItems 应清零')
    }

    await electronApp.close()
    fs.rmSync(userDataDir, { recursive: true, force: true })
    console.log('OSS gate E2E 通过')
  } catch (err) {
    console.error('OSS gate E2E 失败:', err.message)
    if (electronApp) await electronApp.close().catch(() => {})
    fs.rmSync(userDataDir, { recursive: true, force: true })
    process.exit(1)
  }
})()
