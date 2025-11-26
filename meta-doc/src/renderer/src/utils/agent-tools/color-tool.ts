/**
 * 颜色处理Tool
 * 处理颜色混合、亮度/对比度调整等操作
 */

import type {
  AgentToolConfig,
  ToolCallback,
  ToolCallbackResult,
  ToolCallbackData,
  ToolProgress,
  ToolLocales
} from '../../types/agent-tool'
import { mixColors } from '../themes'
import { createRendererLogger } from '../logger'
import { i18n } from '../../i18n'
import tinycolor from 'tinycolor2'
import ColorDisplay from './components/ColorDisplay.vue'

const logger = createRendererLogger('ColorTool')

const colorToolLocales: ToolLocales = {
  zh_cn: {
    name: '颜色处理',
    description: '处理颜色混合、亮度/对比度调整、互补色等颜色操作',
    instruction: `
# 颜色处理工具

## 功能描述
提供各种颜色处理功能：
- 颜色混合（按权重混合两种颜色）
- 亮度调整（提高或降低亮度）
- 对比度调整
- 获取互补色
- 颜色格式转换（HEX、RGB、HSL等）
- 颜色分析（获取色相、饱和度、明度等）

## 使用场景
- 主题颜色设计
- UI颜色方案生成
- 颜色搭配建议
- 颜色调整和优化

## 输入格式
\`\`\`json
{
  "operation": "string", // 操作类型：mix|brightness|contrast|complementary|convert|analyze
  "color1": "string", // 颜色1（HEX格式，如#FF0000）
  "color2": "string", // 颜色2（仅mix操作需要）
  "weight": 0.5, // 混合权重（0-1，仅mix操作需要）
  "amount": 0.2, // 调整量（-1到1，brightness/contrast操作需要）
  "format": "hex" // 输出格式（hex|rgb|hsl，仅convert操作需要）
}
\`\`\`

## 输出格式
\`\`\`json
{
  "result": "string|object", // 处理结果
  "operation": "string", // 执行的操作
  "input": "string|object" // 输入颜色信息
}
\`\`\`
`
  },
  en_us: {
    name: 'Color Processing',
    description: 'Process color mixing, brightness/contrast adjustment, complementary colors, etc.',
    instruction: `
# Color Processing Tool

## Description
Provides various color processing functions:
- Color mixing (mix two colors by weight)
- Brightness adjustment
- Contrast adjustment
- Get complementary color
- Color format conversion (HEX, RGB, HSL)
- Color analysis (get hue, saturation, lightness)

## Input Format
\`\`\`json
{
  "operation": "string", // Operation type: mix|brightness|contrast|complementary|convert|analyze
  "color1": "string", // Color 1 (HEX format, e.g. #FF0000)
  "color2": "string", // Color 2 (only for mix operation)
  "weight": 0.5, // Mix weight (0-1, only for mix operation)
  "amount": 0.2, // Adjustment amount (-1 to 1, for brightness/contrast)
  "format": "hex" // Output format (hex|rgb|hsl, only for convert)
}
\`\`\`
`
  }
}

/**
 * 颜色处理Tool回调函数
 */
const colorToolCallback: ToolCallback = async (params, signal, onUpdate) => {
  const operation = params.operation as string
  const color1 = params.color1 as string
  const color2 = params.color2 as string
  const weight = (params.weight as number) || 0.5
  const amount = (params.amount as number) || 0.2
  const format = (params.format as string) || 'hex'

  if (!operation || !color1) {
    return {
      status: 'failed',
      error: i18n.global.t('agent.tool.color.error.missingParams', '缺少必需参数: operation 和 color1')
    }
  }

  try {
    onUpdate({
      content: {
        stage: 'processing',
        operation,
        color1
      },
      format: 'json'
    }, {
      percentage: 30,
      message: i18n.global.t('agent.tool.color.progress.processing', '正在处理颜色...')
    })

    let result: any
    const color = tinycolor(color1)

    if (!color.isValid()) {
      return {
        status: 'failed',
        error: i18n.global.t('agent.tool.color.error.invalidColor', '无效的颜色格式')
      }
    }

    switch (operation) {
      case 'mix':
        if (!color2) {
          return {
            status: 'failed',
            error: i18n.global.t('agent.tool.color.error.missingColor2', 'mix操作需要color2参数')
          }
        }
        result = mixColors(color1, color2, weight)
        break

      case 'brightness': {
        const hsl = color.toHsl()
        hsl.l = Math.max(0, Math.min(1, hsl.l + amount))
        result = tinycolor(hsl).toHexString()
        break
      }

      case 'contrast': {
        const hsl = color.toHsl()
        hsl.s = Math.max(0, Math.min(1, hsl.s + amount))
        result = tinycolor(hsl).toHexString()
        break
      }

      case 'complementary': {
        const hsl = color.toHsl()
        hsl.h = (hsl.h + 180) % 360
        result = tinycolor(hsl).toHexString()
        break
      }

      case 'convert': {
        const rgb = color.toRgb()
        const hsl = color.toHsl()
        switch (format) {
          case 'rgb':
            result = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`
            break
          case 'hsl':
            result = `hsl(${Math.round(hsl.h)}, ${Math.round(hsl.s * 100)}%, ${Math.round(hsl.l * 100)}%)`
            break
          default:
            result = color.toHexString()
        }
        break
      }

      case 'analyze': {
        const rgb = color.toRgb()
        const hsl = color.toHsl()
        result = {
          hex: color.toHexString(),
          rgb: { r: rgb.r, g: rgb.g, b: rgb.b },
          hsl: {
            h: Math.round(hsl.h),
            s: Math.round(hsl.s * 100),
            l: Math.round(hsl.l * 100)
          },
          alpha: rgb.a,
          isDark: color.isDark(),
          isLight: color.isLight()
        }
        break
      }

      default:
        return {
          status: 'failed',
          error: i18n.global.t('agent.tool.color.error.unknownOperation', `未知的操作类型: ${operation}`)
        }
    }

    onUpdate({
      content: {
        stage: 'completed',
        result,
        operation,
        input: { color1, color2, weight, amount, format }
      },
      format: 'json',
      componentName: 'ColorDisplay'
    }, {
      percentage: 100,
      message: i18n.global.t('agent.tool.color.progress.completed', '颜色处理完成')
    })

    return {
      status: 'succeeded',
      data: {
        content: {
          stage: 'completed',
          result,
          operation,
          input: { color1, color2, weight, amount, format }
        },
        format: 'json',
        componentName: 'ColorDisplay'
      },
      result: {
        result,
        operation,
        input: { color1, color2, weight, amount, format }
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('颜色处理失败:', error)
    return {
      status: 'failed',
      error: i18n.global.t('agent.tool.color.error.failed', { error: errorMessage }, `颜色处理失败: ${errorMessage}`)
    }
  }
}

export const colorToolConfig: AgentToolConfig = {
  id: 'color-processing',
  name: {
    'zh_cn': { name: '颜色处理' },
    'en_us': { name: 'Color Processing' },
    'de_DE': { name: 'Farbverarbeitung' },
    'fr_FR': { name: 'Traitement des couleurs' },
    'ja_JP': { name: '色処理' },
    'ko_KR': { name: '색상 처리' }
  } as any,
  description: {
    'zh_cn': { description: '处理颜色混合、亮度/对比度调整、互补色等颜色操作' },
    'en_us': { description: 'Process color mixing, brightness/contrast adjustment, complementary colors, etc.' },
    'de_DE': { description: 'Verarbeitet Farbmischung, Helligkeits-/Kontrastanpassung, Komplementärfarben usw.' },
    'fr_FR': { description: 'Traite le mélange de couleurs, l\'ajustement de la luminosité/du contraste, les couleurs complémentaires, etc.' },
    'ja_JP': { description: '色の混合、明度/コントラスト調整、補色などの色操作を処理' },
    'ko_KR': { description: '색상 혼합, 밝기/대비 조정, 보색 등의 색상 작업 처리' }
  } as any,
  instruction: colorToolLocales,
  origin: 'internal',
  tags: ['color', 'design', 'ui'],
  running: false,
  enabled: true,
  requiresLLM: false,
  displayComponent: ColorDisplay,
  callback: colorToolCallback,
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['mix', 'brightness', 'contrast', 'complementary', 'convert', 'analyze'],
        description: '操作类型'
      },
      color1: {
        type: 'string',
        description: '颜色1（HEX格式，如#FF0000）'
      },
      color2: {
        type: 'string',
        description: '颜色2（仅mix操作需要）'
      },
      weight: {
        type: 'number',
        description: '混合权重（0-1，仅mix操作需要）',
        minimum: 0,
        maximum: 1,
        default: 0.5
      },
      amount: {
        type: 'number',
        description: '调整量（-1到1，brightness/contrast操作需要）',
        minimum: -1,
        maximum: 1,
        default: 0.2
      },
      format: {
        type: 'string',
        enum: ['hex', 'rgb', 'hsl'],
        description: '输出格式（仅convert操作需要）',
        default: 'hex'
      }
    },
    required: ['operation', 'color1']
  },
  outputSchema: {
    type: 'object',
    properties: {
      result: {
        description: '处理结果（字符串或对象）'
      },
      operation: { type: 'string', description: '执行的操作' },
      input: { type: 'object', description: '输入参数' }
    }
  },
  locales: colorToolLocales
}

