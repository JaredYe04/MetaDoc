import messageBridge from '../bridge/message-bridge'

const FLUSH_MS = 4000
let pendingChars = 0
let flushTimer: ReturnType<typeof setTimeout> | null = null

function scheduleFlushChars() {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    const n = pendingChars
    if (n <= 0) return
    pendingChars = 0
    try {
      void messageBridge.invoke('steam:stats:report', { charsDelta: n })
    } catch {
      pendingChars += n
    }
  }, FLUSH_MS)
}

/**
 * 累计输入字符并节流上报主进程（供 Steam STAT_CHARS_TYPED）。
 */
export function useTypingMeter() {
  const reportCharDelta = (delta: number) => {
    if (typeof delta !== 'number' || delta <= 0) return
    pendingChars += Math.floor(delta)
    scheduleFlushChars()
  }
  return { reportCharDelta }
}
