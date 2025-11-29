/**
 * 简易爬虫Tool（URL访问Tool）
 * 访问URL并获取网页内容
 */

import type {
  AgentToolConfig,
  ToolCallback,
  ToolCallbackResult,
  ToolCallbackData,
  ToolProgress,
  ToolLocales
} from '../../types/agent-tool'
import { createRendererLogger } from '../logger'
import { i18n } from '../../i18n'
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios'
import localIpcRenderer from '../web-adapter/local-ipc-renderer'
import { webMainCalls } from '../web-adapter/web-main-calls'
import WebCrawlerDisplay from './components/WebCrawlerDisplay.vue'
import { createDetailedError } from './tool-utils'

const logger = createRendererLogger('WebCrawlerTool')

// 获取IPC渲染器
let ipcRenderer: typeof localIpcRenderer | null = null
if (typeof window !== 'undefined') {
  if ((window as any).electron?.ipcRenderer) {
    ipcRenderer = (window as any).electron.ipcRenderer
  } else {
    webMainCalls()
    ipcRenderer = localIpcRenderer
  }
}

const webCrawlerToolLocales: ToolLocales = {
  zh_cn: {
    name: '网页访问',
    description: '访问指定URL，获取网页HTML内容或API响应',
    instruction: `
# 网页访问工具

## 功能描述
发送HTTP请求访问指定URL，获取网页内容或API响应。

## 使用场景
- 获取网页内容进行分析
- 调用API接口
- 数据抓取
- 内容监控

## 输入格式
\`\`\`json
{
  "url": "string", // 必需，要访问的URL
  "method": "string", // 可选，HTTP方法（GET|POST|PUT|DELETE），默认GET
  "headers": {}, // 可选，请求头
  "body": "string|object", // 可选，请求体（POST/PUT时使用）
  "timeout": 30000, // 可选，超时时间（毫秒），默认30秒
  "useCurl": false // 可选，是否使用后端代理（绕过CORS），默认false使用axios
}
\`\`\`

## 输出格式
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

## 注意事项
1. **axios模式（默认）**：在浏览器环境中使用，受CORS限制，适合访问支持CORS的API
2. **curl代理模式（useCurl=true）**：通过主进程代理执行，可绕过CORS限制，适合访问普通网页
3. 某些网站可能有反爬虫机制
4. 建议设置合理的超时时间
5. 大文件可能影响性能
`
  },
  en_us: {
    name: 'Web Crawler',
    description: 'Access specified URL and fetch webpage HTML content or API response',
    instruction: `
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
  }
}

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
): Promise<{ status: number; statusText: string; headers: Record<string, string>; content: string; contentType: string }> {
  if (!ipcRenderer) {
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

    const result = await ipcRenderer.invoke('execute-http-request', {
      url,
      method,
      headers,
      body: bodyString,
      timeout
    })

    return result as { status: number; statusText: string; headers: Record<string, string>; content: string; contentType: string }
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
): Promise<{ status: number; statusText: string; headers: Record<string, string>; content: string; contentType: string }> {
  try {
    // 过滤掉浏览器不允许设置的请求头（如 User-Agent, Referer, Host 等）
    // 这些头由浏览器自动控制，无法手动设置
    // 如果需要设置这些头，应该使用代理模式（useCurl=true）
    const forbiddenHeaders = ['user-agent', 'referer', 'host', 'connection', 'upgrade', 'content-length']
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
    Object.keys(response.headers).forEach(key => {
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
      statusText: response.statusText || (response.status >= 200 && response.status < 300 ? 'OK' : 'Error'),
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
        Object.keys(error.response.headers).forEach(key => {
          responseHeaders[key.toLowerCase()] = error.response!.headers[key]
        })
        return {
          status: error.response.status,
          statusText: error.response.statusText || 'Error',
          headers: responseHeaders,
          content: typeof error.response.data === 'string' 
            ? error.response.data 
            : JSON.stringify(error.response.data, null, 2),
          contentType: responseHeaders['content-type'] || 'text/plain'
        }
      }
      // CORS错误或其他网络错误
      const errorMessage = error.message || '未知网络错误'
      const isCorsError = errorMessage.includes('CORS') || 
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
    onUpdate({
      content: {
        stage: 'fetching',
        url,
        method,
        useProxy: useCurl
      },
      format: 'json',
      componentName: 'WebCrawlerDisplay'
    }, {
      percentage: 20,
      message: i18n.global.t('agent.tool.crawler.progress.fetching', useCurl ? '正在通过代理访问URL...' : '正在访问URL...')
    })

    let result: { status: number; statusText: string; headers: Record<string, string>; content: string; contentType: string }
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
        const isCorsError = axiosError?.isCorsError === true ||
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
          onUpdate({
            content: {
              stage: 'fetching',
              url,
              method,
              useProxy: true,
              message: '检测到CORS限制，自动切换到代理模式...'
            },
            format: 'json',
            componentName: 'WebCrawlerDisplay'
          }, {
            percentage: 30,
            message: i18n.global.t('agent.tool.crawler.progress.fetching', '检测到CORS限制，正在通过代理访问...')
          })
          
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

    onUpdate({
      content: {
        stage: 'processing',
        url,
        status: result.status
      },
      format: 'json',
      componentName: 'WebCrawlerDisplay'
    }, {
      percentage: 60,
      message: i18n.global.t('agent.tool.crawler.progress.processing', '正在处理响应...')
    })

    const finalResult = {
      url,
      status: result.status,
      statusText: result.statusText,
      headers: result.headers,
      content: result.content,
      contentType: result.contentType,
      size: result.content.length
    }

    onUpdate({
      content: {
        stage: 'completed',
        ...finalResult
      },
      format: 'json',
      componentName: 'WebCrawlerDisplay'
    }, {
      percentage: 100,
      message: i18n.global.t('agent.tool.crawler.progress.completed', '网页访问完成')
    })

    return {
      status: 'succeeded',
      data: {
        content: {
          stage: 'completed',
          ...finalResult
        },
        format: 'json',
        componentName: 'WebCrawlerDisplay'
      },
      result: finalResult
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('网页访问失败:', error)
    return {
      status: 'failed',
      error: i18n.global.t('agent.tool.crawler.error.failed', { error: errorMessage }, `网页访问失败: ${errorMessage}`)
    }
  }
}

export const webCrawlerToolConfig: AgentToolConfig = {
  id: 'web-crawler',
  name: {
    'zh_cn': { name: '网页访问' },
    'en_us': { name: 'Web Crawler' },
    'de_DE': { name: 'Web-Crawler' },
    'fr_FR': { name: 'Explorateur Web' },
    'ja_JP': { name: 'ウェブクローラー' },
    'ko_KR': { name: '웹 크롤러' }
  } as any,
  description: {
    'zh_cn': { description: '访问指定URL，获取网页HTML内容或API响应' },
    'en_us': { description: 'Access specified URL and fetch webpage HTML content or API response' },
    'de_DE': { description: 'Greift auf die angegebene URL zu und ruft HTML-Inhalt der Webseite oder API-Antwort ab' },
    'fr_FR': { description: 'Accède à l\'URL spécifiée et récupère le contenu HTML de la page Web ou la réponse API' },
    'ja_JP': { description: '指定されたURLにアクセスし、ウェブページのHTMLコンテンツまたはAPIレスポンスを取得' },
    'ko_KR': { description: '지정된 URL에 액세스하여 웹페이지 HTML 콘텐츠 또는 API 응답 가져오기' }
  } as any,
  instruction: webCrawlerToolLocales,
  origin: 'internal',
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
  },
  locales: webCrawlerToolLocales
}

