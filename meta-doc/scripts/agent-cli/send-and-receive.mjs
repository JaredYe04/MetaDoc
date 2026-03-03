#!/usr/bin/env node
/**
 * 非交互式：连接 agent-cli 端口，发送若干条消息并逐条打印助手回复（用于自动化/终端测试）。
 *
 * 用法：
 *   node scripts/agent-cli/send-and-receive.mjs "消息1" "消息2"
 *   echo "消息" | node scripts/agent-cli/send-and-receive.mjs
 *
 * 环境变量：AGENT_CLI_PORT（默认 49384）、AGENT_CLI_WAIT_MS（等端口就绪最长时间，默认 60000）
 */
import net from 'net'

const port = parseInt(process.env.AGENT_CLI_PORT || '49384', 10)
const waitMs = parseInt(process.env.AGENT_CLI_WAIT_MS || '60000', 10)

function connect() {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(port, '127.0.0.1', () => resolve(socket))
    socket.on('error', reject)
  })
}

function waitForPort(deadline) {
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      if (Date.now() > deadline) {
        reject(
          new Error(
            `Timeout: 127.0.0.1:${port} not reachable within ${waitMs}ms. ` +
              'Close all MetaDoc windows, then run: npm run agent-cli:dev'
          )
        )
        return
      }
      const socket = net.createConnection(port, '127.0.0.1', () => {
        socket.destroy()
        resolve()
      })
      socket.on('error', () => setTimeout(tryConnect, 500))
    }
    tryConnect()
  })
}

const PROGRESS_PREFIX = '[p] '

function readOneLine(socket) {
  return new Promise((resolve, reject) => {
    let buf = ''
    const onData = (chunk) => {
      buf += chunk.toString('utf8')
      const idx = buf.indexOf('\n')
      if (idx !== -1) {
        socket.removeListener('data', onData)
        socket.removeListener('error', onError)
        socket.removeListener('close', onClose)
        resolve(buf.slice(0, idx))
      }
    }
    const onError = (err) => {
      socket.removeListener('data', onData)
      socket.removeListener('close', onClose)
      reject(err)
    }
    const onClose = () => {
      socket.removeListener('data', onData)
      socket.removeListener('error', onError)
      if (buf.length) resolve(buf.trimEnd())
      else reject(new Error('Socket closed before receiving a line'))
    }
    socket.on('data', onData)
    socket.on('error', onError)
    socket.on('close', onClose)
  })
}

/** 读行直到得到结果行（非 [p] 开头）；[p] 行直接打印到 stdout */
function readUntilResult(socket) {
  return new Promise((resolve, reject) => {
    const readNext = () => {
      readOneLine(socket).then((line) => {
        if (line.startsWith(PROGRESS_PREFIX)) {
          process.stdout.write(line.slice(PROGRESS_PREFIX.length) + '\n')
          readNext()
        } else {
          resolve(line)
        }
      }, reject)
    }
    readNext()
  })
}

async function main() {
  const messages = process.argv.slice(2).filter(Boolean)
  if (messages.length === 0) {
    // stdin: one message per line
    const lines = await new Promise((resolve) => {
      let data = ''
      process.stdin.setEncoding('utf8')
      process.stdin.on('data', (ch) => { data += ch })
      process.stdin.on('end', () => resolve(data.split('\n').map((s) => s.trim()).filter(Boolean)))
    })
    if (lines.length === 0) {
      process.stderr.write('Usage: node send-and-receive.mjs "msg1" "msg2"  OR  echo "msg" | node send-and-receive.mjs\n')
      process.exit(1)
    }
    messages.push(...lines)
  }

  const deadline = Date.now() + waitMs
  process.stderr.write(`Waiting for 127.0.0.1:${port} (max ${waitMs}ms)...\n`)
  await waitForPort(deadline)
  process.stderr.write('Connected.\n')

  const socket = await connect()
  socket.setEncoding('utf8')

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    process.stderr.write(`[${i + 1}/${messages.length}] Send: ${msg.slice(0, 60)}${msg.length > 60 ? '...' : ''}\n`)
    socket.write(msg + '\n')
    const line = await readUntilResult(socket)
    try {
      const payload = JSON.parse(line)
      if (payload.error) process.stdout.write(JSON.stringify(payload) + '\n')
      else process.stdout.write((payload.reply ?? line) + '\n')
    } catch {
      process.stdout.write(line + '\n')
    }
  }

  socket.destroy()
}

main().catch((e) => {
  process.stderr.write('Error: ' + (e.message || e) + '\n')
  process.exit(1)
})
