/**
 * 启动耗时打点：主进程各阶段时间戳，由 ENABLE_STARTUP_PROFILE=1 控制
 */

import fs from 'fs'
import os from 'os'
import path from 'path'

export interface StartupProfileEntry {
  phase: string
  time: number
  deltaMs: number
}

let startTime: number = 0
const timeline: StartupProfileEntry[] = []
let profileEnabled: boolean | null = null
const PROFILE_OUTPUT_ENV = 'METADOC_STARTUP_PROFILE_OUTPUT'

export function shouldProfile(): boolean {
  if (profileEnabled === null) {
    profileEnabled = process.env.ENABLE_STARTUP_PROFILE === '1'
  }
  return profileEnabled
}

function writeProfileToFile(): void {
  const outPath = process.env[PROFILE_OUTPUT_ENV] || path.join(os.tmpdir(), 'metadoc-startup-profile.json')
  try {
    fs.writeFileSync(outPath, JSON.stringify({ timeline, totalMs: timeline.length ? timeline[timeline.length - 1].deltaMs : 0 }, null, 2), 'utf8')
  } catch (e) {
    // ignore
  }
}

export function mark(phase: string): void {
  if (!shouldProfile()) return
  const now = Date.now()
  if (startTime === 0) {
    startTime = now
  }
  const deltaMs = startTime > 0 ? now - startTime : 0
  timeline.push({ phase, time: now, deltaMs })
  try {
    const { createMainLogger } = require('./logger')
    const log = createMainLogger('StartupProfile')
    log.info(`[${phase}] +${deltaMs} ms`)
  } catch {
    console.log(`[StartupProfile] [${phase}] +${deltaMs} ms`)
  }
  if (process.env[PROFILE_OUTPUT_ENV]) {
    writeProfileToFile()
  }
}

export function getTimeline(): StartupProfileEntry[] {
  return [...timeline]
}

export function getTimelineForRenderer(): { phase: string; deltaMs: number }[] {
  return timeline.map((e) => ({ phase: e.phase, deltaMs: e.deltaMs }))
}
