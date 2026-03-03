#!/usr/bin/env node
/**
 * MetaDoc Agent CLI – 通过 TCP 连接已启动的 MetaDoc（真实 agent + 真实工具），多轮对话测试。
 * 必须先以 agent-cli 模式启动 MetaDoc，再运行本脚本。
 *
 * 启动 MetaDoc（dev 即可，无需 build）：
 *   npm run agent-cli:dev
 *
 * 然后本机运行：
 *   node scripts/agent-cli/agent-cli.mjs [--port=3847]
 *   AGENT_CLI_PORT=3847 node scripts/agent-cli/agent-cli.mjs
 *
 * 环境：需先打开工作区（文件夹），以便 agent 工具（编辑、workspace 等）可用。
 */
import readline from 'readline'
import net from 'net'

const args = process.argv.slice(2)
let port = parseInt(process.env.AGENT_CLI_PORT || '49384', 10)
let verbose = true
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--port=')) {
    port = parseInt(args[i].slice(7), 10) || 49384
  } else if (args[i] === '--quiet' || args[i] === '-q') {
    verbose = false
  }
}

function log(...a) {
  if (verbose) process.stderr.write('[agent-cli] ' + a.join(' ') + '\n')
}

function connect() {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(port, '127.0.0.1', () => resolve(socket))
    socket.on('error', reject)
  })
}

function waitForPort(maxAttempts = 30, intervalMs = 500) {
  return new Promise((resolve, reject) => {
    let attempts = 0
    const tryConnect = () => {
      const socket = net.createConnection(port, '127.0.0.1', () => {
        socket.destroy()
        resolve()
      })
      socket.on('error', () => {
        attempts++
        if (attempts >= maxAttempts) {
          reject(new Error(`Could not connect to 127.0.0.1:${port} after ${maxAttempts} attempts. Start MetaDoc with: npm run dev -- --agent-cli-port=3847`))
          return
        }
        setTimeout(tryConnect, intervalMs)
      })
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

/** 读行直到结果行（非 [p] 开头）；[p] 行直接打印到 stdout，便于监控执行进度 */
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
  log('Connecting to 127.0.0.1:' + port + ' ...')
  let socket
  try {
    socket = await connect()
  } catch (e) {
    if (e.code === 'ECONNREFUSED' || e.code === 'ECONNRESET') {
      process.stderr.write(
        'Connection refused. Start MetaDoc with: npm run agent-cli:dev\n\n'
      )
      process.exit(1)
    }
    throw e
  }

  log('Connected. Type /exit to quit, /clear has no effect (server keeps session).\n')

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })

  function prompt() {
    rl.question('You: ', async (line) => {
      const userInput = (line || '').trim()
      if (!userInput) {
        prompt()
        return
      }
      if (userInput.toLowerCase() === '/exit' || userInput.toLowerCase() === '/quit') {
        socket.destroy()
        rl.close()
        process.exit(0)
      }
      if (userInput.toLowerCase() === '/clear') {
        process.stdout.write('(session is on server; /clear not implemented)\n\n')
        prompt()
        return
      }

      try {
        socket.write(userInput + '\n')
        const reply = await readUntilResult(socket)
        process.stdout.write('\nAssistant: ' + reply + '\n\n')
      } catch (err) {
        process.stdout.write('Error: ' + (err.message || err) + '\n\n')
        log(err.stack)
      }
      prompt()
    })
  }

  socket.on('close', () => {
    process.stderr.write('\n[agent-cli] Server closed connection.\n')
    rl.close()
    process.exit(0)
  })
  socket.on('error', (err) => {
    process.stderr.write('[agent-cli] Socket error: ' + err.message + '\n')
  })

  process.stdout.write('MetaDoc Agent CLI (real tools). Port ' + port + '.\n\n')
  prompt()
}

main().catch((e) => {
  process.stderr.write('Fatal: ' + (e.message || e) + '\n')
  process.exit(1)
})
