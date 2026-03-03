#!/usr/bin/env node
/**
 * 跑 agent CRUD 测试：列表、建文件夹、建文件（含中文）、读文件。
 * 用法：node scripts/agent-cli/run-crud-test.mjs          # 默认终端输出，不写文件（推荐，避免触发热更新白屏）
 *       node scripts/agent-cli/run-crud-test.mjs --out x.txt  # 可选：写入文件
 * 要求：MetaDoc 已用 --agent-cli-port=49384 启动，且已打开工作区（如 C:\Users\tange\Documents\metadoc-agent-test）。
 * 消息通过 stdin 传给 send-and-receive，避免 Windows 下命令行参数中文乱码。
 */
import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import net from 'net'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const sendPath = path.join(__dirname, 'send-and-receive.mjs')
const port = parseInt(process.env.AGENT_CLI_PORT || '49384', 10)

function checkPort(ms = 3000) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), ms)
    const socket = net.createConnection(port, '127.0.0.1', () => {
      clearTimeout(t)
      socket.destroy()
      resolve(true)
    })
    socket.on('error', () => {})
  })
}

const messages = [
  '列出当前工作区根目录下的所有文件和文件夹。',
  '在当前工作区根目录下创建一个文件夹，名为 agent-test-dir。',
  '在工作区根目录下创建一个文件 agent-test.txt，内容为：你好世界，这是 agent 写入的中文。',
  '读取工作区根目录下的 agent-test.txt 并告诉我文件内容。'
]

const outIdx = process.argv.indexOf('--out')
const outFile = outIdx >= 0 && process.argv[outIdx + 1] ? process.argv[outIdx + 1] : null

async function main() {
  const portOpen = await checkPort()
  if (!portOpen) {
    process.stderr.write(
      `\n127.0.0.1:${port} 未就绪。请先：\n` +
        '  1) 关闭所有 MetaDoc 窗口\n' +
        '  2) 在项目根目录执行: npm run agent-cli:dev\n' +
        '  3) 在 MetaDoc 中打开工作区 C:\\Users\\tange\\Documents\\metadoc-agent-test 并聚焦该窗口\n' +
        '  4) 再运行本脚本\n\n'
    )
    process.exit(1)
  }

  const child = spawn(process.execPath, [sendPath], {
    cwd: path.resolve(__dirname, '../..'),
    stdio: ['pipe', outFile ? 'pipe' : 'inherit', 'inherit'],
    env: { ...process.env, AGENT_CLI_WAIT_MS: '60000' }
  })

  child.stdin.write(messages.join('\n') + '\n', 'utf8')
  child.stdin.end()

  if (outFile) {
    const ws = fs.createWriteStream(outFile, { encoding: 'utf8' })
    child.stdout.pipe(ws)
    child.stdout.on('end', () => ws.end())
  }

  child.on('exit', (code) => process.exit(code ?? 0))
}

main()
