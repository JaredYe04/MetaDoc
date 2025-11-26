/**
 * 图表生成Tool
 * 根据提示词生成各种类型的图表（Mermaid、ECharts、PlantUML、mindmap、graphviz等）
 */

import type {
  AgentToolConfig,
  ToolCallback,
  ToolCallbackResult,
  ToolCallbackData,
  ToolProgress
} from '../../types/agent-tool'
import {
  renderChartViaVditor,
  renderEChartsViaIpc,
  renderPlantUMLViaIpc,
  CHART_TYPES
} from '../chart-pre-renderer'
import { localVditorCDN, vditorCDN } from '../vditor-cdn'
import { isElectronEnv } from '../event-bus'
import { createAiTask } from '../ai_tasks'
import { cancelAiTask } from '../ai_tasks'
import { ref, type Ref } from 'vue'
import ChartGenerationDisplay from './components/ChartGenerationDisplay.vue'
import { createRendererLogger } from '../logger'

const logger = createRendererLogger('ChartGenerationTool')

// 图表类型映射
const CHART_TYPE_MAP: Record<string, string> = {
  'mermaid': 'mermaid',
  'echarts': 'echarts',
  'plantuml': 'plantuml',
  'flowchart': 'flowchart',
  'graphviz': 'graphviz',
  'mindmap': 'mindmap',
  'markmap': 'markmap'
}

/**
 * 清理ECharts代码，处理各种格式问题
 */
function cleanEChartsCode(code: string): string {
  let cleaned = code.trim()
  
  // 移除markdown代码块标记
  cleaned = cleaned.replace(/```[\w]*\n?/g, '').replace(/```$/g, '').trim()
  
  // 移除可能的变量声明
  cleaned = cleaned.replace(/^(const|let|var)\s+\w+\s*=\s*/, '')
  
  // 移除末尾的分号
  cleaned = cleaned.replace(/;?\s*$/, '')
  
  // 移除单行注释（// ...），保留空行以维持JSON结构
  cleaned = cleaned.split('\n')
    .map(line => line.replace(/\/\/.*$/, ''))
    .join('\n')
  
  // 移除多行注释（/* ... */）
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '')
  
  // 替换中文标点为英文标点（JSON要求英文标点）
  cleaned = cleaned
    .replace(/，/g, ',')  // 中文逗号 -> 英文逗号
    .replace(/：/g, ':')  // 中文冒号 -> 英文冒号
    .replace(/；/g, ';')  // 中文分号 -> 英文分号
    .replace(/"/g, '"')   // 中文引号 -> 英文引号
    .replace(/"/g, '"')   // 中文引号 -> 英文引号
    .replace(/'/g, "'")   // 中文单引号 -> 英文单引号
    .replace(/'/g, "'")   // 中文单引号 -> 英文单引号
  
  // 移除多余的空白字符（但保留换行，因为JSON可能需要格式化）
  // 只压缩连续的空白字符为单个空格，但保留换行
  cleaned = cleaned.replace(/[ \t]+/g, ' ').trim()
  
  return cleaned
}

/**
 * 验证图表代码语法（用于所有图表类型）
 */
async function validateChartSyntax(
  chartCode: string,
  chartType: string
): Promise<{ valid: boolean; error?: string }> {
  const normalizedType = chartType.toLowerCase()
  
  try {
    const trimmedCode = chartCode.trim()
    if (!trimmedCode) {
      return { valid: false, error: '图表代码为空' }
    }
    
    if (normalizedType === 'mermaid') {
      // Mermaid语法验证
      const mermaidTypes = ['graph', 'flowchart', 'sequenceDiagram', 'classDiagram', 'stateDiagram', 'erDiagram', 'gantt', 'pie', 'gitgraph', 'journey']
      const hasValidType = mermaidTypes.some(type => trimmedCode.toLowerCase().startsWith(type))
      
      if (!hasValidType) {
        return { valid: false, error: 'Mermaid代码缺少有效的图表类型标识' }
      }
      
      return { valid: true }
    } else if (normalizedType === 'echarts') {
      // ECharts语法验证：尝试解析JSON
      try {
        const cleaned = cleanEChartsCode(trimmedCode)
        // 先尝试JSON解析
        try {
          JSON.parse(cleaned)
          return { valid: true }
        } catch {
          // 如果JSON解析失败，尝试Function解析（可能包含函数）
          try {
            new Function('return ' + cleaned)()
            return { valid: true }
          } catch (funcError) {
            return { valid: false, error: `ECharts配置格式错误: ${funcError instanceof Error ? funcError.message : String(funcError)}` }
          }
        }
      } catch (error) {
        return { valid: false, error: error instanceof Error ? error.message : String(error) }
      }
    } else if (normalizedType === 'plantuml') {
      // PlantUML基本验证
      if (!trimmedCode.toLowerCase().includes('@start') && !trimmedCode.toLowerCase().includes('@enduml')) {
        return { valid: false, error: 'PlantUML代码缺少@start或@enduml标记' }
      }
      return { valid: true }
    } else if (normalizedType === 'flowchart' || normalizedType === 'graphviz') {
      // Flowchart和Graphviz基本验证
      if (trimmedCode.length < 10) {
        return { valid: false, error: '代码过短，可能不完整' }
      }
      return { valid: true }
    }
    
    // 其他类型暂不验证
    return { valid: true }
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * 调用LLM生成图表代码
 * 使用createAiTask创建AI任务，与其他地方保持一致
 * 支持错误重试机制
 */
async function generateChartCodeWithLLM(
  prompt: string,
  chartType: string,
  target: Ref<string>,
  signal?: AbortSignal,
  retryCount: number = 0,
  maxRetries: number = 2,
  lastError?: string
): Promise<string> {
  const normalizedType = chartType.toLowerCase()
  const isECharts = normalizedType === 'echarts'
  const isMermaid = normalizedType === 'mermaid'
  const isPlantUML = normalizedType === 'plantuml'
  
  let systemPrompt = `你是一个专业的图表代码生成助手。根据用户的需求，生成${chartType}格式的图表代码。

要求：
1. 只返回图表代码，不要包含任何解释、注释或markdown代码块标记
2. 代码必须符合${chartType}的语法规范，确保语法完全正确`
  
  if (isECharts) {
    systemPrompt += `
3. 返回有效的JSON格式配置对象（必须是有效的JSON）
4. 必须使用英文标点符号：使用英文逗号(,)、英文冒号(:)、英文引号(")，不要使用中文标点符号（，、：、"）
5. 所有字符串必须用英文双引号包裹
6. 如果需要在tooltip等地方使用函数，可以使用function关键字（如：formatter: function(params) { return ... }）
7. 不要使用箭头函数，使用function关键字
8. 不要包含任何注释（// 或 /* */）
9. 确保JSON格式完全正确，可以通过JSON.parse验证`
  } else if (isMermaid) {
    systemPrompt += `
3. 确保Mermaid语法完全正确
4. 仔细检查所有语法规则，避免语法错误
5. 使用正确的图表类型标识（graph、flowchart、sequenceDiagram等）`
  } else if (isPlantUML) {
    systemPrompt += `
3. 确保PlantUML语法完全正确
4. 必须包含@startuml和@enduml标记
5. 仔细检查所有语法规则`
  } else {
    systemPrompt += `
3. 确保语法完全正确，避免语法错误
4. 仔细检查所有语法规则`
  }
  
  if (retryCount > 0 && lastError) {
    systemPrompt += `

⚠️ 重要：之前的代码生成失败，错误信息：${lastError}
请仔细分析错误原因，修复所有问题，确保生成的代码完全正确。特别注意：
- 检查语法是否正确
- 检查标点符号是否正确（必须使用英文标点）
- 检查是否有遗漏的括号、引号等
- 确保代码格式完全符合${chartType}的规范`
  }
  
  systemPrompt += `

用户需求：${prompt}`

  // 使用createAiTask创建AI任务，设置stream: false使用非流式模式
  const originKey = `chart-generation-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const { handle, done } = createAiTask(
    '生成图表代码',
    systemPrompt,
    target,
    'answer',
    originKey,
    { temperature: 0.7, stream: false }
  )

  // 如果提供了signal，监听取消事件
  if (signal) {
    signal.addEventListener('abort', () => {
      cancelAiTask(handle, false)
    })
  }

  try {
    // 等待任务完成
    await done
    
    // 检查结果是否为空
    if (!target.value || target.value.trim() === '') {
      throw new Error('LLM返回结果为空，请检查LLM API是否已启用并正确配置')
    }
    
    let code = target.value.trim()
    
    // 清理代码（移除可能的markdown代码块标记）
    code = code
      .replace(/```[\w]*\n?/g, '')
      .replace(/```$/g, '')
      .trim()
    
    // 对于ECharts，进行额外的清理
    if (isECharts) {
      code = cleanEChartsCode(code)
    }
    
    // 验证语法（所有图表类型都验证，支持重试）
    if (retryCount < maxRetries) {
      const validation = await validateChartSyntax(code, chartType)
      if (!validation.valid) {
        logger.warn(`图表代码语法验证失败 (尝试 ${retryCount + 1}/${maxRetries}):`, validation.error)
        // 递归重试，传递错误信息
        return await generateChartCodeWithLLM(
          prompt,
          chartType,
          target,
          signal,
          retryCount + 1,
          maxRetries,
          validation.error
        )
      }
    }
    
    return code
  } catch (error) {
    // 如果LLM调用失败，抛出更详细的错误信息
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('LLM生成图表代码失败:', error)
    
    // 检查是否是配置问题
    if (errorMessage.includes('未启用') || errorMessage.includes('NOT_ENABLED')) {
      throw new Error('LLM API未启用，请在设置中启用LLM功能')
    }
    if (errorMessage.includes('未配置') || errorMessage.includes('INVALID_CONFIG')) {
      throw new Error('LLM配置不正确，请检查设置中的API配置')
    }
    if (errorMessage.includes('网络') || errorMessage.includes('network') || errorMessage.includes('fetch')) {
      throw new Error(`网络连接失败，请检查网络连接和API URL配置。错误详情: ${errorMessage}`)
    }
    
    throw new Error(`LLM调用失败: ${errorMessage}`)
  }
}

/**
 * 将URL转换为本地文件路径
 * 参考md-utils.js中的image2local函数
 */
async function getLocalPathFromUrl(url: string): Promise<string> {
  // URL格式: http://localhost:52521/images/filename
  // 需要获取实际的本地路径
  try {
    const { getImagePath } = await import('../settings')
    const localImagePath = await getImagePath()
    
    let imageName = ''
    if (url.startsWith('http://localhost:52521/images/')) {
      // HTTP URL，提取文件名
      const prefixLen = 'http://localhost:52521/images/'.length
      imageName = url.slice(prefixLen)
    } else {
      // 其他格式，尝试提取文件名
      imageName = url.split(/[/\\]/).pop() || url
    }
    
    // 拼接本地路径
    const localPath = `${localImagePath}/${imageName}`
    return localPath
  } catch (error) {
    logger.warn('获取本地路径失败，返回URL:', error)
    return url
  }
}

/**
 * 将SVG转换为PDF（用于LaTeX导出）
 */
async function convertSvgToPdf(svgUrl: string, outputPath: string): Promise<string> {
  // 这里需要实现SVG到PDF的转换
  // 可能需要使用主进程的IPC调用
  // 暂时返回SVG URL，实际应该转换为PDF
  logger.warn('PDF转换功能待实现')
  return svgUrl
}

/**
 * 图表生成Tool回调函数
 */
const chartGenerationCallback: ToolCallback = async (params, signal, onUpdate) => {
  const prompt = params.prompt as string
  const chartType = (params.chartType as string) || 'mermaid'
  const format = (params.format as 'svg' | 'png' | 'pdf') || 'svg'
  const chartName = (params.chartName as string) || `chart_${Date.now()}`

  if (!prompt || typeof prompt !== 'string') {
    return {
      status: 'failed',
      error: '缺少必需参数: prompt'
    }
  }

  // 验证图表类型
  const normalizedChartType = chartType.toLowerCase()
  if (!CHART_TYPE_MAP[normalizedChartType]) {
    return {
      status: 'failed',
      error: `不支持的图表类型: ${chartType}。支持的类型: ${Object.keys(CHART_TYPE_MAP).join(', ')}`
    }
  }

  try {
    // 步骤1: 生成图表代码
    onUpdate({
      content: {
        stage: 'generating',
        prompt,
        chartType: normalizedChartType,
        format
      },
      format: 'json'
    }, {
      percentage: 10,
      message: '正在生成图表代码...'
    })

    // 如果提供了代码，直接使用；否则调用LLM生成
    let chartCode = params.code as string
    if (!chartCode) {
      try {
        const codeTarget = ref('')
        chartCode = await generateChartCodeWithLLM(prompt, normalizedChartType, codeTarget, signal)
      } catch (error) {
        // LLM调用失败，返回更友好的错误信息
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error('LLM生成图表代码失败:', error)
        
        // 检查是否是网络错误
        if (errorMessage.includes('网络') || errorMessage.includes('network') || errorMessage.includes('fetch')) {
          return {
            status: 'failed',
            error: `LLM调用失败: 请检查LLM API配置是否正确，以及网络连接是否正常。错误详情: ${errorMessage}`
          }
        }
        
        return {
          status: 'failed',
          error: `LLM生成图表代码失败: ${errorMessage}`
        }
      }
    }

    if (!chartCode) {
      return {
        status: 'failed',
        error: '无法生成图表代码'
      }
    }

    onUpdate({
      content: {
        stage: 'rendering',
        chartCode,
        chartType: normalizedChartType,
        format
      },
      format: 'json'
    }, {
      percentage: 40,
      message: '正在渲染图表...'
    })

    // 步骤2: 渲染图表
    let imageUrl: string
    const cdn = isElectronEnv() ? localVditorCDN : vditorCDN
    const targetFormat = format === 'pdf' ? 'svg' : format // PDF先渲染为SVG

    if (normalizedChartType === 'echarts') {
      // ECharts使用IPC渲染
      // 处理包含函数的JSON（LLM可能生成包含function的代码）
      let optionJson: any
      let parseError: Error | null = null
      
      // 先清理代码
      let cleanedCode = cleanEChartsCode(chartCode)
      
      try {
        // 先尝试标准JSON解析
        optionJson = JSON.parse(cleanedCode)
      } catch (jsonError) {
        parseError = jsonError instanceof Error ? jsonError : new Error(String(jsonError))
        // 如果JSON解析失败，尝试使用Function解析（可能包含函数）
        try {
          // 进一步清理：移除可能的变量声明
          let funcCode = cleanedCode.replace(/^(const|let|var)\s+\w+\s*=\s*/, '')
          funcCode = funcCode.replace(/;?\s*$/, '')
          
          // 使用Function构造器安全地解析（避免直接eval）
          optionJson = new Function('return ' + funcCode)()
        } catch (evalError) {
          // 如果都失败了，检查是否需要重试
          const evalErrorMsg = evalError instanceof Error ? evalError.message : String(evalError)
          logger.error('ECharts代码解析失败:', { jsonError: parseError.message, evalError: evalErrorMsg, code: cleanedCode.substring(0, 200) })
          
          // 如果还没有重试过，尝试重新生成
          if (!params._retryAttempted) {
            logger.info('ECharts解析失败，尝试重新生成代码...')
            const codeTarget = ref('')
            const retryCode = await generateChartCodeWithLLM(
              prompt,
              normalizedChartType,
              codeTarget,
              signal,
              0,
              2,
              `ECharts配置解析失败。JSON错误: ${parseError.message}，Eval错误: ${evalErrorMsg}`
            )
            // 标记已重试，避免无限循环
            params._retryAttempted = true
            // 递归调用，使用新生成的代码
            return await chartGenerationCallback({ ...params, code: retryCode }, signal, onUpdate)
          }
          
          throw new Error(`ECharts配置解析失败。JSON错误: ${parseError.message}，Eval错误: ${evalErrorMsg}`)
        }
      }
      
      // 确保optionJson是对象
      if (typeof optionJson !== 'object' || optionJson === null) {
        throw new Error('ECharts配置必须是有效的对象，当前类型: ' + typeof optionJson)
      }
      
      // 将对象转换为字符串，保留函数
      const serializeWithFunctions = (obj: any): string => {
        return JSON.stringify(obj, (key, value) => {
          if (typeof value === 'function') {
            return value.toString()
          }
          return value
        })
      }
      
      const optionJsonString = serializeWithFunctions(optionJson)
      
      try {
        imageUrl = await renderEChartsViaIpc(optionJsonString, targetFormat)
      } catch (renderError) {
        // 如果渲染失败，也尝试重试
        const renderErrorMsg = renderError instanceof Error ? renderError.message : String(renderError)
        if (!params._retryAttempted) {
          logger.info('ECharts渲染失败，尝试重新生成代码...')
          const codeTarget = ref('')
          const retryCode = await generateChartCodeWithLLM(
            prompt,
            normalizedChartType,
            codeTarget,
            signal,
            0,
            2,
            `ECharts渲染失败: ${renderErrorMsg}`
          )
          params._retryAttempted = true
          return await chartGenerationCallback({ ...params, code: retryCode }, signal, onUpdate)
        }
        throw renderError
      }
    } else if (normalizedChartType === 'plantuml') {
      // PlantUML使用IPC渲染
      try {
        imageUrl = await renderPlantUMLViaIpc(chartCode, targetFormat) as string
      } catch (renderError) {
        // 如果渲染失败，尝试重新生成
        const renderErrorMsg = renderError instanceof Error ? renderError.message : String(renderError)
        if (!params._retryAttempted && (renderErrorMsg.includes('syntax') || renderErrorMsg.includes('语法') || renderErrorMsg.includes('error'))) {
          logger.info('PlantUML渲染失败，尝试重新生成代码...')
          const codeTarget = ref('')
          const retryCode = await generateChartCodeWithLLM(
            prompt,
            normalizedChartType,
            codeTarget,
            signal,
            0,
            2,
            `PlantUML渲染失败: ${renderErrorMsg}`
          )
          params._retryAttempted = true
          return await chartGenerationCallback({ ...params, code: retryCode }, signal, onUpdate)
        }
        throw renderError
      }
    } else {
      // 其他类型使用Vditor渲染
      const chartConfig = CHART_TYPES[normalizedChartType as keyof typeof CHART_TYPES]
      if (!chartConfig) {
        throw new Error(`不支持的图表类型: ${normalizedChartType}`)
      }
      try {
        imageUrl = await renderChartViaVditor(
          normalizedChartType,
          chartCode,
          cdn,
          chartConfig,
          targetFormat
        )
      } catch (renderError) {
        // 如果渲染失败（可能是语法错误），尝试重新生成
        const renderErrorMsg = renderError instanceof Error ? renderError.message : String(renderError)
        if (!params._retryAttempted && (renderErrorMsg.includes('syntax') || renderErrorMsg.includes('语法') || renderErrorMsg.includes('error') || renderErrorMsg.includes('parse'))) {
          logger.info(`${normalizedChartType}渲染失败，尝试重新生成代码...`)
          const codeTarget = ref('')
          const retryCode = await generateChartCodeWithLLM(
            prompt,
            normalizedChartType,
            codeTarget,
            signal,
            0,
            2,
            `${normalizedChartType}渲染失败: ${renderErrorMsg}`
          )
          params._retryAttempted = true
          return await chartGenerationCallback({ ...params, code: retryCode }, signal, onUpdate)
        }
        throw renderError
      }
    }

    // 步骤3: 如果是PDF，需要转换
    let finalUrl = imageUrl
    let localPath = await getLocalPathFromUrl(imageUrl)

    if (format === 'pdf') {
      onUpdate({
        content: {
          stage: 'converting',
          imageUrl,
          chartType: normalizedChartType
        },
        format: 'json'
      }, {
        percentage: 80,
        message: '正在转换为PDF...'
      })

      // PDF转换（需要实现）
      localPath = await convertSvgToPdf(imageUrl, `${chartName}.pdf`)
      finalUrl = localPath
    }

    // 步骤4: 返回结果
    const result = {
      chartName,
      chartType: normalizedChartType,
      url: finalUrl,
      localPath
    }

    onUpdate({
      content: {
        stage: 'completed',
        ...result,
        chartCode
      },
      format: 'json',
      componentName: 'ChartGenerationDisplay'
    }, {
      percentage: 100,
      message: '图表生成完成'
    })

    return {
      status: 'succeeded',
      data: {
        content: {
          stage: 'completed',
          ...result,
          chartCode
        },
        format: 'json',
        componentName: 'ChartGenerationDisplay'
      },
      result
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('图表生成失败:', error)
    return {
      status: 'failed',
      error: `图表生成失败: ${errorMessage}`
    }
  }
}

/**
 * 图表生成Tool配置
 */
export const chartGenerationToolConfig: AgentToolConfig = {
  id: 'chart-generation',
  name: {
    'zh_cn': { name: '图表生成' },
    'en_us': { name: 'Chart Generation' },
    'de_DE': { name: 'Diagramm-Generierung' },
    'fr_FR': { name: 'Génération de graphiques' },
    'ja_JP': { name: 'チャート生成' },
    'ko_KR': { name: '차트 생성' }
  } as any,
  description: {
    'zh_cn': { description: '根据提示词生成各种类型的图表（Mermaid、ECharts、PlantUML、mindmap、graphviz等），支持导出为SVG、PNG或PDF格式' },
    'en_us': { description: 'Generate various types of charts (Mermaid, ECharts, PlantUML, mindmap, graphviz, etc.) based on prompts, supporting export to SVG, PNG, or PDF formats' },
    'de_DE': { description: 'Generiert verschiedene Diagrammtypen (Mermaid, ECharts, PlantUML, Mindmap, Graphviz usw.) basierend auf Eingabeaufforderungen, unterstützt Export in SVG, PNG oder PDF' },
    'fr_FR': { description: 'Génère divers types de graphiques (Mermaid, ECharts, PlantUML, mindmap, graphviz, etc.) basés sur des invites, supportant l\'export en SVG, PNG ou PDF' },
    'ja_JP': { description: 'プロンプトに基づいて様々なタイプのチャート（Mermaid、ECharts、PlantUML、mindmap、graphvizなど）を生成し、SVG、PNG、PDF形式へのエクスポートをサポート' },
    'ko_KR': { description: '프롬프트를 기반으로 다양한 유형의 차트(Mermaid, ECharts, PlantUML, mindmap, graphviz 등)를 생성하며 SVG, PNG 또는 PDF 형식으로 내보내기 지원' }
  } as any,
  origin: 'internal',
  instruction: `# 图表生成工具

## 功能描述
根据用户提供的提示词，自动生成各种类型的图表代码，并渲染为图片。支持多种图表类型和导出格式。

## 支持的图表类型
- **Mermaid**: 流程图、UML序列图、甘特图、UML类图、思维导图、饼图
- **ECharts**: 折线图、条形图、散点图、K线图、饼图、雷达图、和弦图、力导向布局图、地图、仪表盘图、漏斗图、事件河流图
- **PlantUML**: UML类图、UML序列图、UML活动图、UML状态图、UML用例图、UML组件图
- **Flowchart**: 流程图
- **Mindmap**: 思维导图
- **Graphviz**: 流程图

## 使用场景
- 需要快速生成数据可视化图表
- 需要绘制流程图、UML图等
- 需要将图表导出为不同格式用于文档

## 输入参数
\`\`\`json
{
  "prompt": "string",        // 必需，图表描述或需求
  "chartType": "string",     // 可选，图表类型（mermaid/echarts/plantuml/flowchart/mindmap/graphviz），默认mermaid
  "format": "string",        // 可选，导出格式（svg/png/pdf），默认svg
  "chartName": "string",     // 可选，图表名称，默认自动生成
  "code": "string"           // 可选，直接提供图表代码（跳过LLM生成）
}
\`\`\`

## 输出格式
返回JSON格式的结果，包含：
- \`chartName\`: 图表名称
- \`chartType\`: 图表类型
- \`url\`: 图表URL（http://localhost:52521/images/...）
- \`localPath\`: 本地绝对路径

## 注意事项
1. 如果不提供code参数，工具会调用LLM生成图表代码
2. ECharts需要提供JSON格式的配置对象
3. PDF格式主要用于LaTeX导出，需要额外转换步骤
4. 图表代码会自动清理，移除markdown代码块标记
5. ECharts和mindmap会自动去除动画效果

## 与其他Tool的区别
- 这是唯一的图表生成工具
- 支持多种图表类型和格式
- 可以调用LLM辅助生成代码`,
  callback: chartGenerationCallback,
  displayComponent: ChartGenerationDisplay,
  tags: ['chart', 'visualization', 'generation', 'internal'],
  enabled: true,
  editable: false,
  locales: {
    'zh_cn': {
      name: '图表生成',
      description: '根据提示词生成各种类型的图表，支持导出为SVG、PNG或PDF格式'
    },
    'en_us': {
      name: 'Chart Generation',
      description: 'Generate various types of charts based on prompts, supporting export to SVG, PNG, or PDF formats'
    }
  }
}

