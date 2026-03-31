/**
 * 简易爬虫Tool（URL访问Tool）
 * 访问URL并获取网页内容
 */

import type {
  AgentToolConfig,
  ToolCallback,
  ToolCallbackResult,
  ToolCallbackData,
  ToolProgress
} from '../../types/agent-tool'
import { createRendererLogger } from '../logger'
import { i18n } from '../../i18n'
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios'
import messageBridge from '../../bridge/message-bridge'
import { webMainCalls } from '../web-adapter/web-main-calls'
import WebCrawlerDisplay from './components/WebCrawlerDisplay.vue'
import { createDetailedError } from './tool-utils'

const logger = createRendererLogger('WebCrawlerTool')

if (typeof window !== 'undefined' && !(window as any).electron?.ipcRenderer) {
  webMainCalls()
}

/**
 * 从HTML中提取纯文本（类似innerText）
 * 只返回HTML中可见的文本内容
 */
function extractPlainTextFromHtml(html: string): string {
  if (!html || typeof html !== 'string') {
    return ''
  }

  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')

    // 移除script和style标签
    doc.querySelectorAll('script, style, noscript').forEach((el) => el.remove())

    // 直接获取body的innerText（类似浏览器Ctrl+A复制的文本）
    const body = doc.body || doc.documentElement
    return body.innerText || body.textContent || ''
  } catch (error) {
    logger.warn('HTML解析失败:', error)
    return ''
  }
}

const WEB_CRAWLER_TOOL_NAME = 'Web Crawler'
const WEB_CRAWLER_TOOL_DESCRIPTION =
  'Access specified URL and fetch webpage HTML content or API response'
const WEB_CRAWLER_INSTRUCTION = `
# Web Crawler Tool

## Description
Sends HTTP request to specified URL and fetches webpage content or API response.

## Input Format
\`\`\`json
{
  "url": "string", // Required, URL to access
  "method": "string", // Optional, HTTP method (GET|POST|PUT|DELETE), default GET
  "headers": {}, // Optional, request headers
  "body": "string|object", // Optional, request body (for POST/PUT)
  "timeout": 30000 // Optional, timeout in milliseconds, default 30s
}
\`\`\`
`

/**
 * 通过主进程代理执行HTTP请求（绕过CORS限制）
 */
async function executeViaProxy(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: string | object | undefined,
  timeout: number,
  signal?: AbortSignal
): Promise<{
  status: number
  statusText: string
  headers: Record<string, string>
  content: string
  contentType: string
}> {
  if (!messageBridge.getIpc()) {
    throw new Error('IPC渲染器不可用，无法使用代理模式')
  }

  // 检查是否已取消
  if (signal?.aborted) {
    throw new Error('请求已取消')
  }

  try {
    // 准备请求体
    let bodyString: string | undefined = undefined
    if (body) {
      if (typeof body === 'string') {
        bodyString = body
      } else {
        bodyString = JSON.stringify(body)
        if (!headers['Content-Type']) {
          headers['Content-Type'] = 'application/json'
        }
      }
    }

    const result = await messageBridge.invoke('execute-http-request', {
      url,
      method,
      headers,
      body: bodyString,
      timeout
    })

    return result as {
      status: number
      statusText: string
      headers: Record<string, string>
      content: string
      contentType: string
    }
  } catch (error) {
    logger.error('代理请求失败:', error)
    throw error
  }
}

/**
 * 使用axios执行请求（受CORS限制）
 */
async function executeAxios(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: string | object | undefined,
  timeout: number,
  signal?: AbortSignal
): Promise<{
  status: number
  statusText: string
  headers: Record<string, string>
  content: string
  contentType: string
}> {
  try {
    // 过滤掉浏览器不允许设置的请求头（如 User-Agent, Referer, Host 等）
    // 这些头由浏览器自动控制，无法手动设置
    // 如果需要设置这些头，应该使用代理模式（useCurl=true）
    const forbiddenHeaders = [
      'user-agent',
      'referer',
      'host',
      'connection',
      'upgrade',
      'content-length'
    ]
    const filteredHeaders: Record<string, string> = {}
    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase()
      if (!forbiddenHeaders.includes(lowerKey)) {
        filteredHeaders[key] = value
      } else {
        logger.debug(`跳过不允许设置的请求头: ${key} (浏览器自动控制)`)
      }
    }

    const config: AxiosRequestConfig = {
      method: method as any,
      url,
      headers: filteredHeaders,
      timeout,
      signal,
      // 对于HTML响应，不自动解析为JSON
      responseType: 'text',
      // 允许重定向
      maxRedirects: 5,
      // 验证SSL证书
      validateStatus: () => true // 不抛出错误，返回所有状态码
    }

    // 添加请求体
    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      if (typeof body === 'string') {
        config.data = body
      } else {
        config.data = body
        if (!config.headers) {
          config.headers = {}
        }
        if (!config.headers['Content-Type']) {
          config.headers['Content-Type'] = 'application/json'
        }
      }
    }

    const response: AxiosResponse = await axios(config)

    // 获取响应头
    const responseHeaders: Record<string, string> = {}
    Object.keys(response.headers).forEach((key) => {
      responseHeaders[key.toLowerCase()] = response.headers[key]
    })

    // 获取内容
    let content: string
    const contentType = responseHeaders['content-type'] || 'text/plain'

    if (typeof response.data === 'string') {
      content = response.data
    } else if (typeof response.data === 'object') {
      content = JSON.stringify(response.data, null, 2)
    } else {
      content = String(response.data)
    }

    return {
      status: response.status,
      statusText:
        response.statusText || (response.status >= 200 && response.status < 300 ? 'OK' : 'Error'),
      headers: responseHeaders,
      content,
      contentType
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED') {
        throw new Error('请求超时')
      }
      if (error.code === 'ERR_CANCELED') {
        throw new Error('请求已取消')
      }
      if (error.response) {
        // 有响应但状态码不是2xx
        const responseHeaders: Record<string, string> = {}
        Object.keys(error.response.headers).forEach((key) => {
          responseHeaders[key.toLowerCase()] = error.response!.headers[key]
        })
        return {
          status: error.response.status,
          statusText: error.response.statusText || 'Error',
          headers: responseHeaders,
          content:
            typeof error.response.data === 'string'
              ? error.response.data
              : JSON.stringify(error.response.data, null, 2),
          contentType: responseHeaders['content-type'] || 'text/plain'
        }
      }
      // CORS错误或其他网络错误
      const errorMessage = error.message || '未知网络错误'
      const isCorsError =
        errorMessage.includes('CORS') ||
        errorMessage.includes('Access-Control-Allow-Origin') ||
        errorMessage.includes('Network Error') ||
        error.code === 'ERR_NETWORK' ||
        error.code === 'ERR_CORS' ||
        (!error.response && !error.request) // 如果没有响应也没有请求，可能是 CORS 阻止

      if (isCorsError) {
        // 标记为 CORS 错误，让调用者知道需要切换到代理模式
        const corsError = new Error(`CORS_ERROR: ${errorMessage}`) as any
        corsError.isCorsError = true
        corsError.originalError = error
        throw corsError
      }
      throw new Error(`网络错误: ${errorMessage}`)
    }
    logger.error('axios执行失败:', error)
    throw error
  }
}

/**
 * 网页访问Tool回调函数
 */
const webCrawlerToolCallback: ToolCallback = async (params, signal, onUpdate) => {
  const url = params.url as string
  const method = (params.method as string) || 'GET'
  const headers = (params.headers as Record<string, string>) || {}
  const body = params.body as string | object | undefined
  const timeout = (params.timeout as number) || 30000
  const useCurl = params.useCurl === true // 明确指定使用代理模式

  if (!url || typeof url !== 'string') {
    return {
      status: 'failed',
      error: createDetailedError(
        '缺少必需参数: url（要访问的网页URL）',
        [
          '{"url": "https://example.com"}',
          '{"url": "https://example.com", "method": "GET", "headers": {"User-Agent": "Mozilla/5.0"}}',
          '{"url": "https://api.example.com/data", "method": "POST", "body": "{\\"key\\": \\"value\\"}"}'
        ],
        [
          '支持GET和POST方法（默认GET）',
          '可以设置自定义请求头headers',
          'POST请求可以设置body参数',
          '工具会自动处理CORS和网页内容解析'
        ]
      )
    }
  }

  // 验证URL格式
  try {
    new URL(url)
  } catch {
    return {
      status: 'failed',
      error: createDetailedError(
        '无效的URL格式',
        [
          '{"url": "https://example.com"}',
          '{"url": "http://example.com/page"}',
          '确保URL包含协议（http:// 或 https://）'
        ],
        [
          'URL必须包含协议（http:// 或 https://）',
          '确保URL格式正确，例如：https://example.com',
          '支持完整的URL，包括路径和查询参数'
        ]
      )
    }
  }

  // 根据参数选择执行方式
  try {
    onUpdate(
      {
        content: {
          stage: 'fetching',
          url,
          method,
          useProxy: useCurl
        },
        format: 'json',
        componentName: 'WebCrawlerDisplay'
      },
      {
        percentage: 20,
        message: i18n.global.t(
          'agent.tool.crawler.progress.fetching',
          useCurl ? '正在通过代理访问URL...' : '正在访问URL...'
        )
      }
    )

    let result: {
      status: number
      statusText: string
      headers: Record<string, string>
      content: string
      contentType: string
    }
    let useProxy = useCurl

    // 如果明确指定使用代理，直接使用
    if (useCurl) {
      result = await executeViaProxy(url, method, headers, body, timeout, signal)
    } else {
      // 先尝试axios，如果遇到CORS错误，自动切换到代理模式
      try {
        result = await executeAxios(url, method, headers, body, timeout, signal)
      } catch (axiosError: any) {
        // 如果是CORS错误，自动切换到代理模式
        const errorMessage = axiosError?.message || ''
        const isCorsError =
          axiosError?.isCorsError === true ||
          errorMessage.includes('CORS_ERROR') ||
          errorMessage.includes('CORS') ||
          errorMessage.includes('Access-Control-Allow-Origin') ||
          errorMessage.includes('Network Error') ||
          axiosError?.code === 'ERR_NETWORK' ||
          axiosError?.code === 'ERR_CORS'

        if (isCorsError) {
          logger.debug('检测到CORS错误，自动切换到代理模式', { url, error: errorMessage })
          useProxy = true

          // 通知用户正在切换到代理模式
          onUpdate(
            {
              content: {
                stage: 'fetching',
                url,
                method,
                useProxy: true,
                message: '检测到CORS限制，自动切换到代理模式...'
              },
              format: 'json',
              componentName: 'WebCrawlerDisplay'
            },
            {
              percentage: 30,
              message: i18n.global.t(
                'agent.tool.crawler.progress.fetching',
                '检测到CORS限制，正在通过代理访问...'
              )
            }
          )

          try {
            result = await executeViaProxy(url, method, headers, body, timeout, signal)
          } catch (proxyError: any) {
            logger.error('代理请求也失败:', proxyError)
            throw proxyError
          }
        } else {
          throw axiosError
        }
      }
    }

    onUpdate(
      {
        content: {
          stage: 'processing',
          url,
          status: result.status
        },
        format: 'json',
        componentName: 'WebCrawlerDisplay'
      },
      {
        percentage: 60,
        message: i18n.global.t('agent.tool.crawler.progress.processing', '正在处理响应...')
      }
    )

    // 判断是否为HTML内容
    const isHtmlContent = result.contentType?.includes('text/html') || false

    logger.info('[WebCrawlerTool] 开始处理响应', {
      url,
      contentType: result.contentType,
      isHtmlContent,
      contentLength: result.content?.length || 0
    })

    // 提取纯文本（用于返回给AI，避免上下文过长）
    let plainTextContent = result.content
    if (isHtmlContent && result.content) {
      const originalContent = result.content
      plainTextContent = extractPlainTextFromHtml(result.content)
      const reduction = ((1 - plainTextContent.length / originalContent.length) * 100).toFixed(1)

      logger.info('[WebCrawlerTool] HTML内容已提取为纯文本', {
        originalSize: originalContent.length,
        extractedSize: plainTextContent.length,
        reduction: `${reduction}%`,
        originalPreview: originalContent.substring(0, 200) + '...',
        extractedPreview:
          plainTextContent.substring(0, 200) + (plainTextContent.length > 200 ? '...' : '')
      })
    } else {
      logger.info('[WebCrawlerTool] 非HTML内容，不提取纯文本', {
        contentType: result.contentType
      })
    }

    // Display 与 AI 均使用纯文本（innerText），不保留完整 DOM/HTML
    const displayResult = {
      url,
      status: result.status,
      statusText: result.statusText,
      headers: result.headers,
      content: plainTextContent,
      contentType: result.contentType,
      size: plainTextContent.length
    }

    const aiResult = {
      url,
      status: result.status,
      statusText: result.statusText,
      headers: result.headers,
      content: plainTextContent,
      contentType: result.contentType,
      size: plainTextContent.length
    }

    logger.info('[WebCrawlerTool] 返回结果（纯文本 innerText）', {
      contentLength: plainTextContent?.length || 0,
      contentType: result.contentType
    })

    onUpdate(
      {
        content: {
          stage: 'completed',
          ...displayResult
        },
        format: 'json',
        componentName: 'WebCrawlerDisplay'
      },
      {
        percentage: 100,
        message: i18n.global.t('agent.tool.crawler.progress.completed', '网页访问完成')
      }
    )

    return {
      status: 'succeeded',
      data: {
        content: {
          stage: 'completed',
          ...displayResult
        },
        format: 'json',
        componentName: 'WebCrawlerDisplay'
      },
      result: aiResult
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('网页访问失败:', error)
    return {
      status: 'failed',
      error: i18n.global.t(
        'agent.tool.crawler.error.failed',
        { error: errorMessage },
        `网页访问失败: ${errorMessage}`
      )
    }
  }
}

export const webCrawlerToolConfig: AgentToolConfig = {
  id: 'web-crawler',
  name: WEB_CRAWLER_TOOL_NAME,
  description: WEB_CRAWLER_TOOL_DESCRIPTION,
  origin: 'internal',
  spec: {
    name: 'web-crawler',
    brief:
      'Access specified URL and fetch webpage HTML content or API response. Supports GET, POST, PUT, DELETE methods.',
    fullSpec: `# Web Crawler Tool

## Description
Sends HTTP request to specified URL and fetches webpage content or API response.

## Usage Scenarios
- Get webpage content for analysis
- Call API interfaces
- Data scraping
- Content monitoring

## Input Format
\`\`\`json
{
  "url": "string", // Required, URL to access
  "method": "string", // Optional, HTTP method (GET|POST|PUT|DELETE), default GET
  "headers": {}, // Optional, request headers
  "body": "string|object", // Optional, request body (for POST/PUT)
  "timeout": 30000, // Optional, timeout in milliseconds, default 30s
  "useCurl": false // Optional, whether to use backend proxy (bypass CORS), default false uses axios
}
\`\`\`

## Output Format
\`\`\`json
{
  "url": "string",
  "status": 200,
  "statusText": "OK",
  "headers": {},
  "content": "string",
  "contentType": "string",
  "size": 1024
}
\`\`\`

## Important Notes
1. **axios mode (default)**: Used in browser environment, subject to CORS restrictions, suitable for accessing CORS-enabled APIs
2. **curl proxy mode (useCurl=true)**: Executed through main process proxy, can bypass CORS restrictions, suitable for accessing regular web pages
3. Some websites may have anti-crawling mechanisms
4. Recommend setting reasonable timeout
5. Large files may affect performance`
  },
  instruction: WEB_CRAWLER_INSTRUCTION,
  tags: ['web', 'crawler', 'http', 'url'],
  running: false,
  enabled: true,
  requiresLLM: false,
  displayComponent: WebCrawlerDisplay,
  callback: webCrawlerToolCallback,
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: '要访问的URL'
      },
      method: {
        type: 'string',
        enum: ['GET', 'POST', 'PUT', 'DELETE'],
        description: 'HTTP方法',
        default: 'GET'
      },
      headers: {
        type: 'object',
        description: '请求头'
      },
      body: {
        description: '请求体（POST/PUT时使用）'
      },
      timeout: {
        type: 'number',
        description: '超时时间（毫秒）',
        default: 30000
      },
      useCurl: {
        type: 'boolean',
        description: '是否使用后端代理（绕过CORS），默认false使用axios',
        default: false
      }
    },
    required: ['url']
  },
  outputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string' },
      status: { type: 'number' },
      statusText: { type: 'string' },
      headers: { type: 'object' },
      content: { type: 'string' },
      contentType: { type: 'string' },
      size: { type: 'number' }
    }
  }
}
