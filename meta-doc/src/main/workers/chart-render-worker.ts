/**
 * 独立线程执行 PlantUML / ECharts 重计算，避免阻塞 Electron 主进程事件循环与 UI。
 * 由 chart-worker-client 以单任务 Worker 方式拉起，任务结束或中止后 terminate。
 */
import { parentPort, workerData } from 'worker_threads'
import * as path from 'path'
import * as fs from 'fs'
import { resvgSvgStringToPngBuffer } from '../utils/svg-resvg-raster'

type WorkerInit = {
  isPackaged: boolean
  resourcesPath: string
}

const init = workerData as WorkerInit

function loadPlantumlModule(): any {
  if (init.isPackaged) {
    const unpackedNodeModulesPath = path.join(
      init.resourcesPath,
      'app.asar.unpacked',
      'node_modules'
    )
    const plantumlModulePath = path.join(unpackedNodeModulesPath, 'node-plantuml-2')
    if (fs.existsSync(plantumlModulePath)) {
      const Module = require('module') as typeof import('module')
      const originalResolveFilename = Module._resolveFilename
      Module._resolveFilename = function (
        request: string,
        parent: any,
        isMain: boolean,
        options: any
      ) {
        if (
          request === 'node-nailgun-server' ||
          request === 'node-nailgun-client' ||
          request === 'plantuml-encoder'
        ) {
          const unpackedPath = path.join(unpackedNodeModulesPath, request)
          if (fs.existsSync(unpackedPath)) {
            try {
              return originalResolveFilename.call(this, unpackedPath, parent, isMain, options)
            } catch {
              /* fall through */
            }
          }
        }
        return originalResolveFilename.call(this, request, parent, isMain, options)
      }
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const plantuml = require(plantumlModulePath)
        const plantumlJarPath = path.join(plantumlModulePath, 'vendor', 'plantuml.jar')
        if (fs.existsSync(plantumlJarPath)) {
          process.env.PLANTUML_HOME = plantumlJarPath
        }
        return plantuml
      } finally {
        Module._resolveFilename = originalResolveFilename
      }
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('node-plantuml-2')
}

async function plantumlToBuffer(cleanCode: string, format: string): Promise<Buffer> {
  process.env.JAVA_TOOL_OPTIONS = '-Xmx768m'
  const plantuml = loadPlantumlModule()
  const outputFormat = format === 'png' ? 'svg' : format
  const gen = plantuml.generate({ format: outputFormat })
  const codeBuffer = Buffer.from(cleanCode, 'utf-8')
  gen.in.write(codeBuffer)
  gen.in.end()

  const chunks: Buffer[] = []
  gen.out.on('data', (chunk: Buffer) => {
    chunks.push(chunk)
  })

  await new Promise<void>((resolve, reject) => {
    let outEnded = false
    let errEnded = !gen.err
    let pollCount = 0
    const maxPolls = 300
    let settled = false
    let pollInterval: ReturnType<typeof setInterval> | undefined

    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      if (pollInterval !== undefined) {
        clearInterval(pollInterval)
        pollInterval = undefined
      }
      fn()
    }

    const checkComplete = () => {
      if (outEnded && errEnded) {
        finish(() => resolve())
      }
    }

    if (gen && typeof gen.on === 'function') {
      gen.on('error', (err: Error) => {
        finish(() => reject(err))
      })
    }

    gen.out.on('end', () => {
      outEnded = true
      checkComplete()
    })

    gen.out.on('error', (err: Error) => {
      finish(() => reject(err))
    })

    if (gen.err) {
      gen.err.on('end', () => {
        errEnded = true
        checkComplete()
      })
      gen.err.on('error', () => {
        errEnded = true
        checkComplete()
      })
    }

    pollInterval = setInterval(() => {
      if (settled) return
      pollCount++
      if (outEnded && errEnded) {
        finish(() => resolve())
      } else if (pollCount >= maxPolls) {
        finish(() => resolve())
      }
    }, 100)
  })

  return Buffer.concat(chunks)
}

function restoreFunctions(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    if (typeof obj === 'string' && obj.trim().startsWith('function')) {
      try {
        return new Function('return ' + obj)()
      } catch {
        return obj
      }
    }
    return obj
  }
  if (Array.isArray(obj)) {
    return obj.map(restoreFunctions)
  }
  const restored: any = {}
  for (const key in obj) {
    const value = obj[key]
    if (typeof value === 'string' && value.trim().startsWith('function')) {
      try {
        restored[key] = new Function('return ' + value)()
      } catch {
        restored[key] = restoreFunctions(value)
      }
    } else {
      restored[key] = restoreFunctions(value)
    }
  }
  return restored
}

function echartsOptionToSvg(optionJson: string): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const echarts = require('echarts')
  echarts.setPlatformAPI({
    createCanvas: () => null
  })
  let option: any
  try {
    option = JSON.parse(optionJson)
    option = restoreFunctions(option)
  } catch {
    option = new Function('return ' + optionJson)()
  }
  const chart = echarts.init(null, null, {
    renderer: 'svg',
    ssr: true,
    width: 800,
    height: 600
  })
  chart.setOption(option)
  const svgStr = chart.renderToSVGString()
  chart.dispose()
  return svgStr
}

type JobMsg =
  | { type: 'plantuml'; code: string; format: string }
  | { type: 'echarts'; optionJson: string }

parentPort!.once('message', async (msg: JobMsg) => {
  try {
    if (msg.type === 'plantuml') {
      const code = msg.code.replace(/^\uFEFF/, '').trim()
      if (!code) {
        parentPort!.postMessage({ ok: false, error: 'PlantUML 代码为空' })
        return
      }
      const svgBuf = await plantumlToBuffer(code, msg.format)
      // PNG 导出：在 Worker 内完成 resvg 栅格化，避免主进程同步 resvg.render() 阻塞 UI
      const outBuf =
        msg.format === 'png'
          ? resvgSvgStringToPngBuffer(svgBuf.toString('utf-8'), 2.0)
          : svgBuf
      parentPort!.postMessage({ ok: true, kind: 'plantuml', base64: outBuf.toString('base64') })
      return
    }
    if (msg.type === 'echarts') {
      const svg = echartsOptionToSvg(msg.optionJson)
      parentPort!.postMessage({ ok: true, kind: 'echarts', svg })
      return
    }
    parentPort!.postMessage({ ok: false, error: 'unknown job type' })
  } catch (e: unknown) {
    const err = e instanceof Error ? e.message : String(e)
    parentPort!.postMessage({ ok: false, error: err })
  }
})
