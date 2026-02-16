/**
 * Express 服务器 - TypeScript 重构版本
 * 提供本地CDN服务和知识库API
 */

// @ts-ignore
import express, { Request, Response, Application } from 'express'
import { Server } from 'http'
// @ts-ignore
import cors from 'cors'
// @ts-ignore
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import os from 'os'
import {
  tryConvertFileToText,
  addFileToKnowledgeBase,
  clearKnowledgeBase,
  initVectorDatabase,
  removeFromIndex,
  renameKnowledgeFile
} from './utils'
import ragService from './utils/rag-service'
import {
  getAllKnowledgeFiles,
  getKnowledgeFileByFilename,
  updateKnowledgeFile,
  ensureInitialized
} from './database/knowledge-db'
import type { FilePath, FileUploadResult, OperationResult, KnowledgeItem } from '../types/utils'
import { createMainLogger } from './logger'
import { updateServiceStatus } from './service-status'
import { MainProgressHandle } from './utils/progress-handle'
import type { BrowserWindow } from 'electron'
import { LEGACY_CONFIG_FILES } from './utils/express-server-legacy'

// ============ 接口定义 ============

interface KnowledgeUploadRequest extends Request {
  file?: any // Multer File type
}

interface KnowledgeRenameRequest extends Request {
  body: {
    oldName: string
    newName: string
  }
}

interface KnowledgeToggleRequest extends Request {
  params: {
    id: string
  }
  body: {
    enabled: boolean
  }
}

interface ImageUploadRequest extends Request {
  files?: any[] // Multer Files array
}

interface UrlUploadRequest extends Request {
  body: {
    url: string
  }
}

// ============ 全局变量 ============

export let imageUploadDir: FilePath = ''
export let knowledgeUploadDir: FilePath = ''
export let knowledgeItems: KnowledgeItem[] = []

// 知识库索引文件路径
// knowledgeIndexPath 已移除，不再使用 JSON 文件

// 配置文件和向量数据库文件列表（不应出现在知识库列表中）
// @deprecated 现在使用SQLite数据库，这些JSON文件已不再使用
// 保留此常量仅用于过滤旧文件，实际定义在 express-server-legacy.ts 中
const CONFIG_FILES = LEGACY_CONFIG_FILES

const expressApp: Application = express()
const logger = createMainLogger('ExpressServer')

let server: Server | null = null
let externalOpenHandler: ((payload: { path: string }) => Promise<void> | void) | null = null
let focusRequestHandler: (() => Promise<void> | void) | null = null

const isServerRunning = (): boolean => {
  return server !== null
}

export const registerExternalOpenHandler = (
  handler: (payload: { path: string }) => Promise<void> | void
): void => {
  externalOpenHandler = handler
}

export const registerFocusRequestHandler = (handler: () => Promise<void> | void): void => {
  focusRequestHandler = handler
}

// ============ 主要功能 ============

/**
 * 启动Express服务器
 */
export const runExpressServer = (): void => {
  if (isServerRunning()) {
    updateServiceStatus('express', 'ready')
    logger.debug('Express 服务已在运行')
    return
  }

  updateServiceStatus('express', 'loading')
  const projectRoot = path.resolve(path.resolve(__dirname, '../'), '../')

  setupBodyParser()
  setupStaticFiles(projectRoot)
  // 异步设置API，但不阻塞服务器启动
  setupAPIs().catch((err) => {
    logger.error('设置API路由失败', err)
    updateServiceStatus('express', 'error', err.message)
  })
  startServer()
}

/**
 * 设置静态文件服务
 */
function setupStaticFiles(projectRoot: string): void {
  const vditorDir = path.join(projectRoot, 'node_modules/vditor')
  const monacoDir = path.join(projectRoot, 'node_modules/monaco-editor/esm/vs')

  expressApp.use(cors())

  // Vditor 静态资源
  expressApp.use('/vditor', express.static(vditorDir))
  expressApp.get('/vditor/*', (req: Request, res: Response) => {
    logger.debug('Vditor 资源请求', req.path)
  })

  // Monaco Editor 静态资源
  expressApp.use('/monaco', express.static(monacoDir))
  expressApp.get('/monaco/*', (req: Request, res: Response) => {
    logger.debug('Monaco 资源请求', req.path)
  })
}

/**
 * 设置API路由
 */
async function setupAPIs(): Promise<void> {
  logger.debug('开始设置API路由')
  setupRuntimeAPI()
  setupImageAPI()
  setupManualLLMAPI()
  // 确保知识库路由注册完成（路由注册是同步的，但初始化是异步的）
  await setupKnowledgeAPI()
  setupErrorHandlers()
  logger.debug('API路由设置完成')
}

/**
 * 设置请求体解析器
 */
function setupBodyParser(): void {
  const bodyParser = require('body-parser')

  // 为 LLM API 路由设置更大的 body 限制（50MB，支持大对话历史）
  // 注意：必须在通用 body-parser 之前设置，以确保匹配优先级
  expressApp.use('/api/llm', bodyParser.json({ limit: '50mb' }))
  expressApp.use('/api/llm', bodyParser.urlencoded({ extended: true, limit: '50mb' }))

  // 其他路由使用默认限制（100kb），跳过已处理的 /api/llm 路径
  expressApp.use((req, res, next) => {
    if (req.path.startsWith('/api/llm')) {
      return next() // 跳过，因为已经由上面的中间件处理了
    }
    bodyParser.json()(req, res, next)
  })
  expressApp.use((req, res, next) => {
    if (req.path.startsWith('/api/llm')) {
      return next() // 跳过，因为已经由上面的中间件处理了
    }
    bodyParser.urlencoded({ extended: true })(req, res, next)
  })
}

function setupRuntimeAPI(): void {
  expressApp.get('/api/runtime/status', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      pid: process.pid,
      uptime: process.uptime()
    })
  })

  expressApp.post('/api/runtime/open-document', async (req: Request, res: Response) => {
    const { path: filePath } = req.body ?? {}
    if (!filePath || typeof filePath !== 'string') {
      return res.status(400).json({ success: false, message: '缺少文件路径' })
    }

    if (!externalOpenHandler) {
      return res.status(503).json({ success: false, message: '打开处理器未就绪' })
    }

    try {
      await externalOpenHandler({ path: filePath })
      res.json({ success: true })
    } catch (error) {
      logger.error('处理外部打开请求失败', error as Error)
      res.status(500).json({
        success: false,
        message: (error as Error).message ?? '打开文件失败'
      })
    }
  })

  expressApp.post('/api/runtime/focus-window', async (req: Request, res: Response) => {
    if (!focusRequestHandler) {
      return res.status(503).json({ success: false, message: '焦点处理器未就绪' })
    }

    try {
      await focusRequestHandler()
      res.json({ success: true })
    } catch (error) {
      logger.error('处理聚焦请求失败', error as Error)
      res.status(500).json({
        success: false,
        message: (error as Error).message ?? '聚焦窗口失败'
      })
    }
  })
}

/**
 * 启动HTTP服务器
 */
function startServer(): void {
  try {
    server = expressApp.listen(52521, () => {
      logger.info('本地 CDN 服务已启动 http://localhost:52521')
      updateServiceStatus('express', 'ready')
    })

    server!.on('error', (error: NodeJS.ErrnoException) => {
      logger.error('Express 服务启动失败', error)
      updateServiceStatus('express', 'error', error.message)

      if (error.code === 'EADDRINUSE') {
        logger.warn('端口 52521 已被占用，10 秒后重试')
        setTimeout(() => {
          try {
            if (server) {
              server.close()
            }
          } catch (closeError) {
            logger.error('关闭已有 Express 服务失败', closeError as Error)
          } finally {
            server = null
            updateServiceStatus('express', 'loading')
            startServer()
          }
        }, 10000)
      } else {
        server = null
      }
    })
  } catch (error) {
    logger.error('创建 Express 服务失败', error as Error)
    server = null
    updateServiceStatus('express', 'error', (error as Error).message)
  }
}

// ============ 图片API ============

/**
 * 设置图片上传API
 */
function setupImageAPI(): void {
  setupImageUploadDir()

  const storage = multer.diskStorage({
    destination: (req: any, file: any, cb: any) => {
      // 支持通过查询参数 targetDir 指定目标目录
      // 如果指定了 targetDir，使用该目录；否则使用默认的 imageUploadDir
      const targetDir = req?.query?.targetDir
      if (targetDir && typeof targetDir === 'string') {
        // 确保目录存在
        const decodedDir = decodeURIComponent(targetDir)
        if (!fs.existsSync(decodedDir)) {
          fs.mkdirSync(decodedDir, { recursive: true })
        }
        cb(null, decodedDir)
      } else {
        cb(null, imageUploadDir)
      }
    },
    filename: (req: any, file: any, cb: any) => {
      // 允许通过查询参数 keepName=1 强制使用原始文件名（用于图表哈希命名的去重）
      const keepName = req?.query?.keepName === '1' || req?.query?.keepName === 'true'
      // 处理可能的编码问题
      const utf8Name = Buffer.from(file.originalname, 'latin1').toString('utf8')

      if (keepName) {
        // 如果启用保持原名，直接使用原名；若重名则覆盖（图表哈希命名场景可接受）
        cb(null, utf8Name)
        return
      }

      const timestamp = Date.now()
      cb(null, `${timestamp}_${utf8Name}`)
    }
  })

  const upload = multer({ storage })

  // 静态文件服务
  // Express 的 static 中间件会根据文件扩展名自动设置正确的 MIME 类型（包括 SVG）
  expressApp.use(
    '/images',
    express.static(imageUploadDir, {
      setHeaders: (res: Response, filePath: string) => {
        // 显式设置 SVG 文件的 Content-Type，确保浏览器正确识别
        if (filePath.endsWith('.svg')) {
          res.setHeader('Content-Type', 'image/svg+xml')
        }
      }
    })
  )

  // 文件上传接口
  expressApp.post('/api/image/upload', upload.array('file[]'), handleImageUpload)

  // URL上传接口
  expressApp.post('/api/image/url-upload', handleUrlUpload)
}

/**
 * 设置图片上传目录
 */
function setupImageUploadDir(): void {
  imageUploadDir = path.join(os.homedir(), 'Pictures', 'meta-doc-imgs')
  if (!fs.existsSync(imageUploadDir)) {
    fs.mkdirSync(imageUploadDir, { recursive: true })
  }
}

/**
 * 处理图片文件上传
 */
function handleImageUpload(req: ImageUploadRequest, res: Response): void {
  const errFiles: string[] = []
  const succMap: Record<string, string> = {}

  // 获取目标目录（如果通过查询参数指定）
  const targetDir = req?.query?.targetDir
  const actualDir =
    targetDir && typeof targetDir === 'string' ? decodeURIComponent(targetDir) : imageUploadDir

  if (req.files && req.files.length > 0) {
    req.files.forEach((file) => {
      // 文件已经保存在目标目录中（multer已经处理）
      const filePath = path.join(actualDir, file.filename)
      succMap[file.filename] = filePath
    })

    if (Object.keys(succMap).length === 0) {
      errFiles.push('没有上传任何文件')
    }
  } else {
    errFiles.push('上传失败')
  }

  res.json({
    msg: '',
    code: 0,
    data: {
      errFiles,
      succMap
    }
  })
}

/**
 * 处理URL上传
 */
function handleUrlUpload(req: UrlUploadRequest, res: Response): void {
  const { url, targetDir } = req.body

  if (!url) {
    return res.status(400).json({ error: 'No URL provided' })
  }

  // 获取目标目录（如果指定）
  const actualDir = targetDir && typeof targetDir === 'string' ? targetDir : imageUploadDir

  // 确保目录存在
  if (!fs.existsSync(actualDir)) {
    fs.mkdirSync(actualDir, { recursive: true })
  }

  // 检测是否是本地文件路径
  // Windows路径: C:\... 或 D:\... 等
  // Unix路径: /... 或 ~/... 等
  const isLocalPath = /^[A-Za-z]:\\|^\/|^~/.test(url) || path.isAbsolute(url)

  if (isLocalPath) {
    // 处理本地文件路径
    try {
      const localFilePath = url.replace(/^file:\/\//, '') // 移除可能的 file:// 前缀

      // 检查文件是否存在
      if (!fs.existsSync(localFilePath)) {
        return res.status(404).json({ error: 'Local file not found' })
      }

      // 获取文件扩展名
      let ext = path.extname(localFilePath)
      if (!ext) {
        ext = ''
      }

      // 生成目标文件名
      const fileName = `${Date.now()}${ext}`
      const targetPath = path.join(actualDir, fileName)

      // 复制文件
      fs.copyFileSync(localFilePath, targetPath)

      res.json({
        msg: '',
        code: 0,
        data: {
          originalURL: url,
          url: targetPath
        }
      })
    } catch (err) {
      logger.error('复制本地图片失败', err as Error)
      res.status(500).json({ error: 'Failed to copy local image' })
    }
    return
  }

  // 处理 HTTP/HTTPS URL
  try {
    let ext = path.extname(new URL(url).pathname)

    if (!ext) {
      // 从Content-Type推断扩展名的逻辑保持不变
      ext = ''
    }

    const fileName = `${Date.now()}${ext}`
    const filePath = path.join(actualDir, fileName)
    const fileStream = fs.createWriteStream(filePath)

    const https = require('https')
    const http = require('http')
    const protocol = url.startsWith('https') ? https : http

    protocol
      .get(url, (response: any) => {
        if (response.statusCode === 200) {
          response.pipe(fileStream)
          fileStream.on('finish', () => {
            fileStream.close(() => {
              res.json({
                msg: '',
                code: 0,
                data: {
                  originalURL: url,
                  url: filePath
                }
              })
            })
          })
        } else {
          res.status(500).json({ error: 'Failed to download image' })
        }
      })
      .on('error', (err: Error) => {
        logger.error('下载图片失败', err)
        res.status(500).json({ error: 'Failed to download image' })
      })
  } catch (err) {
    logger.error('处理URL失败', err as Error)
    res.status(400).json({ error: 'Invalid URL format' })
  }
}

// ============ 知识库API ============

/**
 * 设置知识库API
 */
// 手动LLM API的待处理请求队列
interface PendingLLMRequest {
  resolve: (value: any) => void
  reject: (error: Error) => void
  requestId: string
  type: 'completion' | 'chat'
  stream: boolean
}

const pendingLLMRequests = new Map<string, PendingLLMRequest>()
let manualLLMResponseHandler: ((requestId: string, response: any) => void) | null = null

/**
 * 设置手动LLM API路由
 */
function setupManualLLMAPI(): void {
  // 获取待处理的请求列表
  expressApp.get('/api/llm/pending-requests', (req: Request, res: Response) => {
    const requests = Array.from(pendingLLMRequests.values()).map((req) => ({
      requestId: req.requestId,
      type: req.type,
      stream: req.stream
    }))
    res.json({ requests })
  })

  // 提交手动响应
  expressApp.post('/api/llm/submit-response', (req: Request, res: Response) => {
    const { requestId, response } = req.body
    if (!requestId || !response) {
      return res.status(400).json({ success: false, message: '缺少requestId或response' })
    }

    const pendingRequest = pendingLLMRequests.get(requestId)
    if (!pendingRequest) {
      return res.status(404).json({ success: false, message: '请求不存在或已过期' })
    }

    try {
      // 根据请求类型处理响应
      if (pendingRequest.stream) {
        // 流式响应：需要提取文本内容
        let textContent = ''
        if (typeof response === 'string') {
          textContent = response
        } else if (response && typeof response === 'object') {
          // 如果是对象，尝试提取文本内容
          if (response.choices && response.choices[0]) {
            if (response.choices[0].text) {
              textContent = response.choices[0].text
            } else if (response.choices[0].message && response.choices[0].message.content) {
              textContent = response.choices[0].message.content
            } else if (response.choices[0].delta && response.choices[0].delta.content) {
              textContent = response.choices[0].delta.content
            }
          }
          // 如果没有找到文本，尝试序列化整个对象
          if (!textContent) {
            textContent = JSON.stringify(response)
          }
        } else {
          textContent = String(response)
        }
        pendingRequest.resolve(textContent)
      } else {
        // 非流式响应：直接传递响应对象
        pendingRequest.resolve(response)
      }
      pendingLLMRequests.delete(requestId)
      res.json({ success: true })
    } catch (error) {
      logger.error('处理手动LLM响应失败', error as Error)
      res.status(500).json({ success: false, message: (error as Error).message })
    }
  })

  // Completions API（非流式）
  expressApp.post('/api/llm/completions', async (req: Request, res: Response) => {
    const { model, prompt, stream, temperature, max_tokens } = req.body
    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2)}`

    if (stream) {
      // 流式响应
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')

      // 等待手动输入
      const responsePromise = new Promise<string>((resolve, reject) => {
        pendingLLMRequests.set(requestId, {
          resolve: (value: string) => {
            // 将完整响应拆分为流式chunks
            const chunks = value.split('')
            let index = 0
            const sendChunk = () => {
              if (index < chunks.length) {
                const chunk = {
                  id: `chatcmpl-${Date.now()}`,
                  object: 'text_completion',
                  created: Math.floor(Date.now() / 1000),
                  model: model || 'manual-model',
                  choices: [
                    {
                      text: chunks[index],
                      index: 0,
                      logprobs: null,
                      finish_reason: index === chunks.length - 1 ? 'stop' : null
                    }
                  ]
                }
                res.write(`data: ${JSON.stringify(chunk)}\n\n`)
                index++
                setTimeout(sendChunk, 2) // 模拟流式输出（降低延迟）
              } else {
                res.write('data: [DONE]\n\n')
                res.end()
              }
            }
            sendChunk()
            resolve(value)
          },
          reject,
          requestId,
          type: 'completion',
          stream: true
        })
      })

      // 通知前端等待手动输入
      if (manualLLMResponseHandler) {
        manualLLMResponseHandler(requestId, { type: 'completion', stream: true, prompt })
      }

      try {
        await responsePromise
      } catch (error) {
        res.status(500).end()
      }
    } else {
      // 非流式响应
      const responsePromise = new Promise<any>((resolve, reject) => {
        pendingLLMRequests.set(requestId, {
          resolve,
          reject,
          requestId,
          type: 'completion',
          stream: false
        })
      })

      // 通知前端等待手动输入
      if (manualLLMResponseHandler) {
        manualLLMResponseHandler(requestId, { type: 'completion', stream: false, prompt })
      }

      try {
        const response = await responsePromise
        res.json(response)
      } catch (error) {
        res.status(500).json({ error: (error as Error).message })
      }
    }
  })

  // Chat Completions API
  expressApp.post('/api/llm/chat/completions', async (req: Request, res: Response) => {
    const { model, messages, stream, temperature, max_tokens } = req.body
    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2)}`

    if (stream) {
      // 流式响应
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')

      const responsePromise = new Promise<string>((resolve, reject) => {
        pendingLLMRequests.set(requestId, {
          resolve: (value: string) => {
            // 将完整响应拆分为流式chunks
            const chunks = value.split('')
            let index = 0
            const sendChunk = () => {
              if (index < chunks.length) {
                const chunk = {
                  id: `chatcmpl-${Date.now()}`,
                  object: 'chat.completion.chunk',
                  created: Math.floor(Date.now() / 1000),
                  model: model || 'manual-model',
                  choices: [
                    {
                      index: 0,
                      delta: { content: chunks[index] },
                      finish_reason: index === chunks.length - 1 ? 'stop' : null
                    }
                  ]
                }
                res.write(`data: ${JSON.stringify(chunk)}\n\n`)
                index++
                setTimeout(sendChunk, 50)
              } else {
                res.write('data: [DONE]\n\n')
                res.end()
              }
            }
            sendChunk()
            resolve(value)
          },
          reject,
          requestId,
          type: 'chat',
          stream: true
        })
      })

      // 通知前端等待手动输入
      if (manualLLMResponseHandler) {
        manualLLMResponseHandler(requestId, { type: 'chat', stream: true, messages })
      }

      try {
        await responsePromise
      } catch (error) {
        res.status(500).end()
      }
    } else {
      // 非流式响应
      const responsePromise = new Promise<any>((resolve, reject) => {
        pendingLLMRequests.set(requestId, {
          resolve,
          reject,
          requestId,
          type: 'chat',
          stream: false
        })
      })

      // 通知前端等待手动输入
      if (manualLLMResponseHandler) {
        manualLLMResponseHandler(requestId, { type: 'chat', stream: false, messages })
      }

      try {
        const response = await responsePromise
        res.json(response)
      } catch (error) {
        res.status(500).json({ error: (error as Error).message })
      }
    }
  })
}

export const registerManualLLMResponseHandler = (
  handler: (requestId: string, requestInfo: any) => void
): void => {
  manualLLMResponseHandler = handler
}

async function setupKnowledgeAPI(): Promise<void> {
  // 先设置上传目录和路由（同步操作）
  setupKnowledgeUploadDir()

  const storage = multer.diskStorage({
    destination: (req: any, file: any, cb: any) => cb(null, knowledgeUploadDir),
    filename: handleKnowledgeFilename
  })

  const upload = multer({ storage })

  // 先注册路由，确保API可用
  logger.debug('注册知识库API路由')
  expressApp.get('/api/knowledge/list', handleKnowledgeList)
  expressApp.post(
    '/api/knowledge/upload',
    upload.single('file'),
    (err: any, req: Request, res: Response, next: any) => {
      // Multer错误处理
      if (err instanceof multer.MulterError) {
        logger.error('知识库上传Multer错误', err)
        return res.status(400).json({
          success: false,
          error: '文件上传失败',
          message:
            err.code === 'LIMIT_FILE_SIZE' ? '文件大小超过限制' : err.message || '文件上传错误'
        })
      }
      if (err) {
        logger.error('知识库上传错误', err)
        return res.status(500).json({
          success: false,
          error: '文件上传失败',
          message: err.message || '未知错误'
        })
      }
      next()
    },
    handleKnowledgeUpload
  )
  expressApp.post('/api/knowledge/rename', handleKnowledgeRename)
  expressApp.delete('/api/knowledge/:id', handleKnowledgeDelete)
  expressApp.post('/api/knowledge/clear', handleKnowledgeClear)
  expressApp.get('/api/knowledge/:id/preview', handleKnowledgePreview)
  expressApp.get('/api/knowledge/:id/info', handleKnowledgeInfo)
  expressApp.post('/api/knowledge/:id/toggle', handleKnowledgeToggle)
  expressApp.post('/api/knowledge/:id/rebuild', handleKnowledgeRebuild)
  expressApp.get('/api/knowledge/:id/download', handleKnowledgeDownload)
  logger.debug('知识库API路由注册完成')

  // 只刷新列表，不初始化数据库（数据库初始化将在主窗口加载完成后进行）
  // 这样可以避免在启动时阻塞系统和其他 Chromium 程序
  try {
    refreshKnowledgeItems()
    logger.info('知识库API路由设置完成（数据库初始化将延迟到主窗口加载完成后）')
  } catch (err) {
    logger.error('刷新知识库列表失败，但路由已注册', err)
  }
}

/**
 * 设置知识库上传目录
 */
function setupKnowledgeUploadDir(): void {
  knowledgeUploadDir = path.join(os.homedir(), 'Documents', 'meta-doc-kb')
  fs.mkdirSync(knowledgeUploadDir, { recursive: true })

  // 不再使用 knowledge_index.json，所有数据存储在 SQLite 数据库中
  // 旧实现已迁移到 express-server-legacy.ts
}

/**
 * 处理知识库文件命名
 */
function handleKnowledgeFilename(req: any, file: any, cb: any): void {
  const utf8Name = Buffer.from(file.originalname, 'latin1').toString('utf8')
  const existingFiles = fs.readdirSync(knowledgeUploadDir)
  const hasDuplicate = existingFiles.some((f) => f === utf8Name)

  const fileName = hasDuplicate ? `${Date.now()}_${utf8Name}` : utf8Name

  cb(null, fileName)
}

/**
 * 格式化文件大小
 */
function humanSize(bytes: number): string {
  if (!bytes && bytes !== 0) return '-'
  const units = ['B', 'KB', 'MB', 'GB']
  let u = 0,
    n = bytes
  while (n >= 1024 && u < units.length - 1) {
    n /= 1024
    u++
  }
  return `${n.toFixed(1)} ${units[u]}`
}

/**
 * 加载知识库索引文件（已废弃，现在从数据库读取）
 * @deprecated 已迁移到 express-server-legacy.ts，保留此函数仅为向后兼容
 */
function loadKnowledgeIndex(): Record<string, KnowledgeItem> {
  // 不再使用 JSON 文件，所有数据从数据库读取
  // 旧实现已迁移到 express-server-legacy.ts 的 loadLegacyKnowledgeIndex
  return {}
}

/**
 * 保存知识库索引文件（已废弃，现在使用数据库存储）
 * @deprecated 已迁移到 express-server-legacy.ts，保留此函数仅为向后兼容
 */
function saveKnowledgeIndex(index: Record<string, KnowledgeItem>): void {
  // 不再使用 JSON 文件，所有数据存储在数据库中
  // 旧实现已迁移到 express-server-legacy.ts 的 saveLegacyKnowledgeIndex
}

/**
 * 刷新知识库项目列表
 * 现在完全从数据库读取数据，不再依赖 JSON 文件
 */
export function refreshKnowledgeItems(): void {
  try {
    // 确保数据库已初始化
    ensureInitialized()

    // 从数据库读取所有知识库文件
    const dbFiles = getAllKnowledgeFiles()

    // 获取文件系统中存在的文件
    const existingFiles = new Set(
      fs.existsSync(knowledgeUploadDir)
        ? fs.readdirSync(knowledgeUploadDir).filter((f) => {
            const fullPath = path.join(knowledgeUploadDir, f)
            return fs.statSync(fullPath).isFile() && !CONFIG_FILES.includes(f)
          })
        : []
    )

    // 构建知识库项目列表
    const validItems: KnowledgeItem[] = []
    const updatedIndex: Record<string, KnowledgeItem> = {}

    // 从数据库文件构建列表
    for (const dbFile of dbFiles) {
      const filePath = dbFile.original_path

      // 检查文件是否存在
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath)

        const item: KnowledgeItem = {
          id: dbFile.filename,
          name: dbFile.filename,
          info: {
            path: filePath,
            size: stats.size,
            sizeText: humanSize(stats.size),
            enabled: dbFile.enabled === 1,
            chunks: dbFile.chunks,
            vector_dim: dbFile.vector_dim,
            vector_count: dbFile.vector_count
          }
        }

        validItems.push(item)
        updatedIndex[dbFile.filename] = item
      }
    }

    // 检查是否有新文件（在文件系统中但不在数据库中）
    for (const file of existingFiles) {
      if (!dbFiles.find((f) => f.filename === file)) {
        // 新文件，添加到索引（但不添加到数据库，等待用户上传时处理）
        const fullPath = path.join(knowledgeUploadDir, file)
        const stats = fs.statSync(fullPath)
        const name = path.basename(file)

        const newItem: KnowledgeItem = {
          id: file,
          name,
          info: {
            path: fullPath,
            size: stats.size,
            sizeText: humanSize(stats.size),
            enabled: true,
            chunks: 0,
            vector_dim: 0,
            vector_count: 0
          }
        }

        validItems.push(newItem)
        updatedIndex[file] = newItem
      }
    }

    // 最后过滤掉配置文件和向量数据库文件，确保不会出现在列表中
    knowledgeItems = validItems.filter((item) => !CONFIG_FILES.includes(item.id))
  } catch (error) {
    logger.error('刷新知识库列表失败', error)
    // 如果数据库出错，返回空列表
    knowledgeItems = []
  }
}

// ============ 知识库API处理器 ============

function handleKnowledgeList(req: Request, res: Response): void {
  res.json({ items: knowledgeItems })
}

/**
 * 更新索引文件中的向量信息（当文件被向量化后调用）
 * 现在只更新数据库，不再使用 JSON 文件
 *
 * 注意：此函数保留用于向后兼容，但实际实现已迁移到数据库操作
 * 旧实现（JSON文件更新）已迁移到 express-server-legacy.ts 的 updateLegacyIndexVectorInfo
 */
function updateIndexVectorInfo(
  fileName: string,
  vectorInfo: { chunks: number; vector_dim: number; vector_count: number }
): void {
  try {
    // 更新数据库（新实现）
    const dbFile = getKnowledgeFileByFilename(fileName)
    if (dbFile) {
      updateKnowledgeFile(dbFile.id, {
        chunks: vectorInfo.chunks,
        vector_dim: vectorInfo.vector_dim,
        vector_count: vectorInfo.vector_count
      })
    }
    // 旧实现（更新JSON文件）已迁移到 express-server-legacy.ts 的 updateLegacyIndexVectorInfo
  } catch (error) {
    logger.error('更新向量信息失败', error)
  }
}

async function handleKnowledgeUpload(req: KnowledgeUploadRequest, res: Response): Promise<void> {
  if (!req.file) {
    return res.json({ success: false, message: '没有上传任何文件' })
  }

  const fileName = req.file.filename
  const fullPath = path.join(knowledgeUploadDir, fileName)

  try {
    // 获取 mainWindow 以发送进度
    const mainWindow = (global as any).mainWindow as BrowserWindow | undefined
    const requestId = `knowledge-upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    // 创建进度句柄
    const progressHandle = mainWindow
      ? new MainProgressHandle({
          requestId,
          canCancel: true,
          send: (p) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('global-progress', p)
            }
          },
          initialMessage: '正在处理知识库文件...',
          initialPercentage: 0
        })
      : null

    const progressCallback = progressHandle
      ? (progress: {
          message: string
          subMessage?: string
          percentage: number
          status?: 'success' | 'exception' | 'warning' | ''
          params?: Record<string, any>
        }) => {
          progressHandle.mark(progress.percentage, {
            message: progress.message,
            subMessage: progress.subMessage,
            status: progress.status,
            params: progress.params
          })
        }
      : undefined

    // addFileToKnowledgeBase 内部已经会更新数据库
    const result: FileUploadResult = await addFileToKnowledgeBase(
      fullPath,
      progressCallback,
      progressHandle?.signal
    )

    // 如果成功，显示成功状态
    if (result.success && progressHandle) {
      progressHandle.success({ message: '知识库文件处理完成' })
    } else if (!result.success && progressHandle) {
      progressHandle.fail(result.message || '处理失败')
    }

    // 刷新列表（会从数据库读取最新数据）
    refreshKnowledgeItems()

    if (result.success) {
      logger.debug('文件向量化成功', {
        fileName,
        chunks: result.chunks,
        vector_dim: result.vector_dim,
        vector_count: result.vector_count
      })
    } else {
      logger.warn('文件向量化失败', { fileName, message: result.message })
    }

    res.json({ success: result.success, message: result.message })
  } catch (err) {
    logger.error('知识库添加文件失败', err)
    return res.status(500).json({ success: false, error: '上传文件失败' })
  }
}

async function handleKnowledgeRename(req: KnowledgeRenameRequest, res: Response): Promise<void> {
  const { oldName, newName } = req.body

  if (!oldName || !newName) {
    return res.json({ success: false, message: '参数缺失' })
  }

  const result: OperationResult = await renameKnowledgeFile(oldName, newName)

  if (result.success) {
    // 刷新列表（数据已通过 renameKnowledgeFile 更新到数据库）
    refreshKnowledgeItems()
  }

  res.json(result)
}

async function handleKnowledgeDelete(req: Request, res: Response): Promise<void> {
  // 解码URL参数，处理特殊字符
  const fileBaseName = decodeURIComponent(req.params.id)
  const filePath = path.join(knowledgeUploadDir, fileBaseName)

  if (!fs.existsSync(filePath)) {
    return res.json({ success: false, message: '文件不存在' })
  }

  try {
    // 删除文件
    fs.unlinkSync(filePath)

    // 从向量索引和数据库中删除
    removeFromIndex(fileBaseName)

    // 刷新列表
    refreshKnowledgeItems()

    res.json({ success: true })
  } catch (err) {
    res.json({ success: false, message: '删除失败: ' + (err as Error).message })
  }
}

async function handleKnowledgeClear(req: Request, res: Response): Promise<void> {
  try {
    await clearKnowledgeBase()

    // 清空列表
    knowledgeItems = []

    res.json({ success: true })
  } catch (err) {
    logger.error('清空知识库失败', err)
    return res.status(500).json({ success: false, error: '清空知识库失败' })
  }
}

async function handleKnowledgePreview(req: Request, res: Response): Promise<void> {
  // 解码URL参数，处理特殊字符
  const id = decodeURIComponent(req.params.id)
  const filePath = path.join(knowledgeUploadDir, id)

  if (!fs.existsSync(filePath)) {
    return res.json({ preview: '', truncated: false })
  }

  try {
    const content = await tryConvertFileToText(filePath)
    const limit = 8000
    const truncated = content ? content.length > limit : false

    res.json({
      preview: truncated && content ? content.slice(0, limit) : content || '',
      truncated
    })
  } catch (err) {
    logger.error('知识库内容预览失败', err)
    return res.status(500).json({ success: false, error: '预览失败' })
  }
}

function handleKnowledgeInfo(req: Request, res: Response): void {
  // 解码URL参数，处理特殊字符
  const id = decodeURIComponent(req.params.id)

  try {
    // 优先从数据库读取
    const dbFile = getKnowledgeFileByFilename(id)
    if (dbFile) {
      const stats = fs.existsSync(dbFile.original_path) ? fs.statSync(dbFile.original_path) : null

      return res.json({
        success: true,
        path: dbFile.original_path,
        enabled: dbFile.enabled === 1,
        size: stats?.size || 0,
        sizeText: stats ? humanSize(stats.size) : '-',
        chunks: dbFile.chunks,
        vector_dim: dbFile.vector_dim,
        vector_count: dbFile.vector_count
      })
    } else {
      // 数据库中没有找到文件
      return res.json({ success: false, message: '找不到文件信息' })
    }
  } catch (error) {
    logger.error('获取文件信息失败', error)
    return res.json({ success: false, message: '获取文件信息失败' })
  }
}

function handleKnowledgeToggle(req: KnowledgeToggleRequest, res: Response): void {
  // 解码URL参数，处理特殊字符
  const id = decodeURIComponent(req.params.id)

  try {
    // 更新数据库
    const dbFile = getKnowledgeFileByFilename(id)
    if (!dbFile) {
      return res.json({ success: false, message: '找不到文件' })
    }

    updateKnowledgeFile(dbFile.id, { enabled: req.body.enabled ? 1 : 0 })

    // 刷新列表
    refreshKnowledgeItems()

    res.json({ success: true, enabled: !!req.body.enabled })
  } catch (error) {
    logger.error('切换文件启用状态失败', error)
    return res.json({ success: false, message: '切换失败' })
  }
}

async function handleKnowledgeRebuild(req: Request, res: Response): Promise<void> {
  // 解码URL参数，处理特殊字符
  const id = decodeURIComponent(req.params.id)
  const item = knowledgeItems.find((i) => i.id === id)

  if (!item) {
    return res.json({ success: false, message: '找不到文件' })
  }

  try {
    // 获取 mainWindow 以发送进度
    const mainWindow = (global as any).mainWindow as BrowserWindow | undefined
    const requestId = `knowledge-rebuild-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    // 创建进度句柄
    const progressHandle = mainWindow
      ? new MainProgressHandle({
          requestId,
          canCancel: true,
          send: (p) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('global-progress', p)
            }
          },
          initialMessage: '正在重建知识库向量...',
          initialPercentage: 0
        })
      : null

    const progressCallback = progressHandle
      ? (progress: {
          message: string
          subMessage?: string
          percentage: number
          status?: 'success' | 'exception' | 'warning' | ''
          params?: Record<string, any>
        }) => {
          progressHandle.mark(progress.percentage, {
            message: progress.message,
            subMessage: progress.subMessage,
            status: progress.status,
            params: progress.params
          })
        }
      : undefined

    // 重建单个文件
    const result = await addFileToKnowledgeBase(
      item.info.path,
      progressCallback,
      progressHandle?.signal
    )

    // 如果成功，显示成功状态
    if (result.success) {
      // 更新索引文件中的向量信息
      updateIndexVectorInfo(id, {
        chunks: result.chunks || 0,
        vector_dim: result.vector_dim || 0,
        vector_count: result.vector_count || 0
      })

      // 刷新列表
      refreshKnowledgeItems()

      if (progressHandle) {
        progressHandle.success({ message: '重建知识库向量成功' })
      }
    } else {
      if (progressHandle) {
        progressHandle.fail(result.message || '重建失败')
      }
    }

    res.json({
      success: result.success,
      message: result.success ? '重建知识库成功' : result.message || '重建失败'
    })
  } catch (err) {
    logger.error('重建知识库失败', err)
    return res.status(500).json({ success: false, error: '重建失败' })
  }
}

function handleKnowledgeDownload(req: Request, res: Response): void {
  // 解码URL参数，处理特殊字符
  const id = decodeURIComponent(req.params.id)
  const item = knowledgeItems.find((i) => i.id === id)

  if (!item) {
    return res.status(404).send('文件不存在')
  }

  res.download(item.info.path, item.name)
}

// ============ 错误处理 ============

/**
 * 设置错误处理中间件
 */
function setupErrorHandlers(): void {
  // Multer错误处理中间件 - 必须在路由之后
  expressApp.use((err: any, req: Request, res: Response, next: any) => {
    // 处理multer错误
    if (err instanceof multer.MulterError) {
      logger.error('Multer错误', err)
      return res.status(400).json({
        success: false,
        error: '文件上传失败',
        message: err.code === 'LIMIT_FILE_SIZE' ? '文件大小超过限制' : err.message || '文件上传错误'
      })
    }

    // 处理其他错误
    if (err) {
      logger.error('Express错误', err)
      return res.status(500).json({
        success: false,
        error: '服务器错误',
        message: err.message || '未知错误'
      })
    }

    next()
  })

  // 404处理 - 必须在所有路由之后
  expressApp.use((req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: '未找到',
      message: `路径 ${req.path} 不存在`
    })
  })
}
