/**
 * 轻量级引导入口：在加载 Electron/Express/数据库等重型模块之前检测是否已有实例。
 * 若已有实例则直接 process.exit(0)，否则设置 METADOC_SINGLE_INSTANCE_CHECK_DONE 并加载主入口。
 * Electron 的 main 应指向此文件编译产物（如 out/main/bootstrap.js）。
 */

import path from 'path'
import fs from 'fs'
import http from 'http'
import { isOpenableFilePath } from '../common/openable-file-extensions'
import { getRuntimeServerHost, getRuntimeServerPort } from './runtime-server-config'

interface HttpRequestResult {
  ok: boolean
  statusCode?: number
  body: string
}

function findSupportedFileArgument(args: string[]): string | null {
  for (const arg of args) {
    if (!arg || arg.startsWith('--')) continue
    if (isOpenableFilePath(arg) && fs.existsSync(arg)) {
      return path.resolve(arg)
    }
  }
  return null
}

function performHttpRequest(
  options: http.RequestOptions,
  body?: string
): Promise<HttpRequestResult> {
  return new Promise((resolve) => {
    const req = http.request(
      {
        host: getRuntimeServerHost(),
        port: getRuntimeServerPort(),
        timeout: 500,
        ...options,
        headers: {
          Connection: 'close',
          ...(options.headers ?? {})
        }
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
        res.on('end', () => {
          const bodyBuffer = Buffer.concat(chunks)
          const text = bodyBuffer.toString('utf-8')
          resolve({
            ok: res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300,
            statusCode: res.statusCode,
            body: text
          })
        })
      }
    )

    req.on('timeout', () => {
      req.destroy()
      resolve({ ok: false, statusCode: 0, body: '' })
    })

    req.on('error', () => {
      resolve({ ok: false, statusCode: 0, body: '' })
    })

    if (body) {
      req.write(body)
    }

    req.end()
  })
}

async function attemptDelegationToRunningInstance(filePath?: string | null): Promise<boolean> {
  const statusResponse = await performHttpRequest({
    host: getRuntimeServerHost(),
    port: getRuntimeServerPort(),
    path: '/api/runtime/status',
    method: 'GET'
  })

  if (!statusResponse.ok) {
    return false
  }

  if (filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        return false
      }
    } catch {
      return false
    }

    const payload = JSON.stringify({ path: path.resolve(filePath) })
    const openResponse = await performHttpRequest(
      {
        host: getRuntimeServerHost(),
        port: getRuntimeServerPort(),
        path: '/api/runtime/open-document',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload).toString()
        }
      },
      payload
    )

    if (!openResponse.ok) {
      return false
    }

    return true
  }

  const focusResponse = await performHttpRequest({
    host: getRuntimeServerHost(),
    port: getRuntimeServerPort(),
    path: '/api/runtime/focus-window',
    method: 'POST',
    headers: {
      'Content-Length': '0'
    }
  })

  if (!focusResponse.ok) {
    return false
  }

  return true
}

async function run(): Promise<void> {
  const filePath = findSupportedFileArgument(process.argv)
  const delegated = await attemptDelegationToRunningInstance(filePath)
  if (delegated) {
    process.exit(0)
  }
  process.env.METADOC_SINGLE_INSTANCE_CHECK_DONE = '1'
  // 加载真正的主进程入口（编译后为 index.js，与 bootstrap.js 同目录）
  require('./index.js')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
