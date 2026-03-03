#!/usr/bin/env node
/**
 * 全自动 agent-cli CRUD 测试：杀进程 -> 启动 MetaDoc(agent-cli) -> 等端口 -> 跑 CRUD，结果输出到终端。
 * 用法：node scripts/agent-cli/run-full-test.mjs
 * 环境变量：METADOC_AGENT_TEST_WORKSPACE_FILE 可选，启动时打开该文件以带上工作区（默认测试工作区内文件）
 */
import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import net from 'net'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '../..')
const port = parseInt(process.env.AGENT_CLI_PORT || '49384', 10)
const testWorkspaceFile =
  process.env.METADOC_AGENT_TEST_WORKSPACE_FILE ||
  'C:\\Users\\tange\\Documents\\metadoc-agent-test\\测试文件.txt'

function runSync(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const c = spawn(cmd, args, { stdio: 'inherit', cwd: projectRoot, ...opts })
    c.on('error', reject)
    c.on('exit', (code) =>
      opts.ignoreExitCode
        ? resolve(code)
        : code !== 0
          ? reject(new Error(`Exit ${code}`))
          : resolve(0)
    )
  })
}

function killElectron() {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  return runSync(npm, ['run', 'kill'], { ignoreExitCode: true }).catch(() => 0)
}

function waitForPort(deadlineMs) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      if (Date.now() - start > deadlineMs) {
        reject(new Error(`127.0.0.1:${port} not reachable within ${deadlineMs}ms`))
        return
      }
      const socket = net.createConnection(port, '127.0.0.1', () => {
        socket.destroy()
        resolve()
      })
      socket.on('error', () => setTimeout(tryConnect, 400))
    }
    tryConnect()
  })
}

async function main() {
  console.log('[run-full-test] 1/4 结束已有 MetaDoc 进程...')
  await killElectron()
  await new Promise((r) => setTimeout(r, 3000))

  console.log('[run-full-test] 2/4 启动 MetaDoc (agent-cli)...')
  const isWin = process.platform === 'win32'
  const devProc = spawn(isWin ? 'npm.cmd' : 'npm', ['run', 'agent-cli:dev'], {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
    env: { ...process.env },
    shell: isWin
  })
  devProc.unref()

  console.log('[run-full-test] 3/4 等待 agent-cli 端口 (最多 90s)...')
  await waitForPort(90000)

  console.log('[run-full-test] 4/4 运行 CRUD 测试（终端输出）...\n')
  const testChild = spawn(process.execPath, [path.join(__dirname, 'run-crud-test.mjs')], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: { ...process.env, AGENT_CLI_PORT: String(port) }
  })
  const code = await new Promise((resolve) => testChild.on('exit', (c) => resolve(c ?? 0)))
  process.exit(code)
}

main().catch((err) => {
  console.error('[run-full-test] Error:', err.message)
  process.exit(1)
})
