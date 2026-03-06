#!/usr/bin/env node
/**
 * 收集启动耗时：以 ENABLE_STARTUP_PROFILE=1 启动应用，等待主进程写出 profile 文件后读取并分析
 * 用法: node scripts/startup-profile-collect.mjs [--build] [--timeout=40000]
 * 若带 --build 会先执行 npm run build
 */

import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

const args = process.argv.slice(2)
const doBuild = args.includes('--build')
const timeoutArg = args.find((a) => a.startsWith('--timeout='))
const timeoutMs = timeoutArg ? parseInt(timeoutArg.split('=')[1], 10) : 40000

const profilePath = path.join(os.tmpdir(), `metadoc-startup-profile-${Date.now()}.json`)

function waitForProfile(deadlineMs) {
  const start = Date.now()
  return new Promise((resolve) => {
    const tick = () => {
      try {
        if (fs.existsSync(profilePath)) {
          const raw = fs.readFileSync(profilePath, 'utf8')
          const data = JSON.parse(raw)
          if (data.timeline && data.timeline.some((e) => e.phase === 'initialize_utils_done')) {
            resolve(data)
            return
          }
          if (data.timeline && data.timeline.some((e) => e.phase === 'window_ready_to_show')) {
            resolve(data)
            return
          }
        }
      } catch (e) {
        // ignore
      }
      if (Date.now() - start >= deadlineMs) {
        try {
          if (fs.existsSync(profilePath)) resolve(JSON.parse(fs.readFileSync(profilePath, 'utf8')))
          else resolve(null)
        } catch {
          resolve(null)
        }
        return
      }
      setTimeout(tick, 300)
    }
    tick()
  })
}

async function main() {
  if (doBuild) {
    console.log('Building...')
    await new Promise((resolve, reject) => {
      const p = spawn('npm', ['run', 'build'], { cwd: rootDir, shell: true, stdio: 'inherit' })
      p.on('exit', (c) => (c === 0 ? resolve() : reject(new Error('Build failed'))))
    })
  }

  const env = {
    ...process.env,
    ENABLE_STARTUP_PROFILE: '1',
    METADOC_STARTUP_PROFILE_OUTPUT: profilePath
  }

  console.log('Starting Electron (startup profile enabled)...')
  const electronBin = path.join(rootDir, 'node_modules', '.bin', 'electron')
  const electronCmd = process.platform === 'win32' ? `${electronBin}.cmd` : electronBin
  const child = spawn(electronCmd, ['.'], {
    cwd: rootDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32'
  })

  let stderr = ''
  let stdout = ''
  child.stderr?.on('data', (c) => { stderr += c.toString() })
  child.stdout?.on('data', (c) => { stdout += c.toString() })

  const data = await waitForProfile(timeoutMs)
  child.kill('SIGTERM')
  await new Promise((r) => setTimeout(r, 1500))
  try {
    child.kill('SIGKILL')
  } catch (e) {}

  if (!data || !data.timeline || data.timeline.length === 0) {
    console.error('No startup profile data collected (timeout or app did not write file).')
    if (stderr) console.error('stderr:', stderr.slice(-2000))
    process.exit(1)
  }

  const timeline = data.timeline
  const totalMs = data.totalMs ?? (timeline.length ? timeline[timeline.length - 1].deltaMs : 0)

  // 计算每段增量
  const rows = []
  for (let i = 0; i < timeline.length; i++) {
    const prev = i > 0 ? timeline[i - 1].deltaMs : 0
    const curr = timeline[i].deltaMs
    const incr = curr - prev
    rows.push({ phase: timeline[i].phase, deltaMs: curr, incrMs: incr })
  }

  console.log('\n========== Startup Profile (Main Process) ==========')
  console.log(`Total to last mark: ${totalMs} ms\n`)
  console.log('Phase                          | Cumulative(ms) | Incremental(ms)')
  console.log('-'.repeat(65))
  for (const r of rows) {
    const phase = r.phase.padEnd(30)
    const delta = String(r.deltaMs).padStart(6)
    const incr = String(r.incrMs).padStart(6)
    console.log(`${phase} | ${delta} | ${incr}`)
  }

  // 找出增量最大的几段
  const byIncr = [...rows].filter((r) => r.incrMs > 0).sort((a, b) => b.incrMs - a.incrMs)
  console.log('\nTop phases by incremental time:')
  byIncr.slice(0, 8).forEach((r, i) => console.log(`  ${i + 1}. ${r.phase.trim()} +${r.incrMs} ms`))

  const reportPath = path.join(rootDir, 'startup-profile-report.json')
  fs.writeFileSync(
    reportPath,
    JSON.stringify({ totalMs, timeline: rows, topIncr: byIncr.slice(0, 10), collectedAt: new Date().toISOString() }, null, 2),
    'utf8'
  )
  console.log('\nReport written to:', reportPath)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
