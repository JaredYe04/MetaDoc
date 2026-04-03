/**
 * 在子线程中执行图表渲染，主进程仅等待结果；中止时 terminate Worker。
 */
import { Worker } from 'worker_threads'
import * as path from 'path'
import { app } from 'electron'

function workerScriptPath(): string {
  return path.join(__dirname, 'chart-render-worker.js')
}

export async function runPlantumlInWorkerThread(
  cleanCode: string,
  format: string,
  abortSignal?: AbortSignal
): Promise<Buffer> {
  if (abortSignal?.aborted) {
    throw new DOMException('PlantUML 渲染已取消', 'AbortError')
  }

  return new Promise<Buffer>((resolve, reject) => {
    let settled = false
    const worker = new Worker(workerScriptPath(), {
      workerData: {
        isPackaged: app.isPackaged,
        resourcesPath: process.resourcesPath || ''
      } satisfies { isPackaged: boolean; resourcesPath: string }
    })

    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      try {
        worker.removeAllListeners()
        worker.terminate().catch(() => {})
      } catch {
        /* ignore */
      }
      fn()
    }

    const onAbort = () => {
      finish(() => reject(new DOMException('PlantUML 渲染已取消', 'AbortError')))
    }
    if (abortSignal) {
      if (abortSignal.aborted) {
        onAbort()
        return
      }
      abortSignal.addEventListener('abort', onAbort, { once: true })
    }

    worker.once('message', (msg: { ok: boolean; base64?: string; error?: string }) => {
      if (abortSignal) abortSignal.removeEventListener('abort', onAbort)
      if (!msg?.ok) {
        finish(() => reject(new Error(msg?.error || 'PlantUML worker 失败')))
        return
      }
      if (!msg.base64) {
        finish(() => reject(new Error('PlantUML worker 无输出')))
        return
      }
      try {
        const buf = Buffer.from(msg.base64, 'base64')
        finish(() => resolve(buf))
      } catch (e) {
        finish(() => reject(e instanceof Error ? e : new Error(String(e))))
      }
    })

    worker.once('error', (err) => {
      if (abortSignal) abortSignal.removeEventListener('abort', onAbort)
      finish(() => reject(err))
    })

    worker.once('exit', (code) => {
      if (settled) return
      if (abortSignal) abortSignal.removeEventListener('abort', onAbort)
      if (code !== 0) {
        finish(() => reject(new Error(`PlantUML worker 异常退出: ${code}`)))
      }
    })

    worker.postMessage({ type: 'plantuml', code: cleanCode, format })
  })
}

export async function runEChartsInWorkerThread(
  optionJson: string,
  abortSignal?: AbortSignal
): Promise<string> {
  if (abortSignal?.aborted) {
    throw new DOMException('ECharts 渲染已取消', 'AbortError')
  }

  return new Promise<string>((resolve, reject) => {
    let settled = false
    const worker = new Worker(workerScriptPath(), {
      workerData: {
        isPackaged: app.isPackaged,
        resourcesPath: process.resourcesPath || ''
      }
    })

    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      try {
        worker.removeAllListeners()
        worker.terminate().catch(() => {})
      } catch {
        /* ignore */
      }
      fn()
    }

    const onAbort = () => {
      finish(() => reject(new DOMException('ECharts 渲染已取消', 'AbortError')))
    }
    if (abortSignal) {
      if (abortSignal.aborted) {
        onAbort()
        return
      }
      abortSignal.addEventListener('abort', onAbort, { once: true })
    }

    worker.once('message', (msg: { ok: boolean; svg?: string; error?: string }) => {
      if (abortSignal) abortSignal.removeEventListener('abort', onAbort)
      if (!msg?.ok) {
        finish(() => reject(new Error(msg?.error || 'ECharts worker 失败')))
        return
      }
      if (typeof msg.svg !== 'string') {
        finish(() => reject(new Error('ECharts worker 无 SVG 输出')))
        return
      }
      finish(() => resolve(msg.svg as string))
    })

    worker.once('error', (err) => {
      if (abortSignal) abortSignal.removeEventListener('abort', onAbort)
      finish(() => reject(err))
    })

    worker.once('exit', (code) => {
      if (settled) return
      if (abortSignal) abortSignal.removeEventListener('abort', onAbort)
      if (code !== 0) {
        finish(() => reject(new Error(`ECharts worker 异常退出: ${code}`)))
      }
    })

    worker.postMessage({ type: 'echarts', optionJson })
  })
}
