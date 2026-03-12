/**
 * 颜色处理Tool
 * 处理颜色混合、亮度/对比度调整等操作
 */

import type {
  AgentToolConfig,
  ToolCallback,
  ToolCallbackResult,
  ToolCallbackData,
  ToolProgress
} from '../../types/agent-tool'
import { mixColors } from '../themes'
import { createRendererLogger } from '../logger'
import { i18n } from '../../i18n'
import tinycolor from 'tinycolor2'
import ColorDisplay from './components/ColorDisplay.vue'
import { createDetailedError } from './tool-utils'

const logger = createRendererLogger('ColorTool')

const COLOR_TOOL_NAME = 'Color Processing'
const COLOR_TOOL_DESCRIPTION =
  'Process color mixing, brightness/contrast adjustment, complementary colors, etc.'
const COLOR_INSTRUCTION = `
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
      error: createDetailedError(
        '缺少必需参数: operation 和 color1',
        [
          '{"operation": "brightness", "color1": "#ff0000", "amount": 0.2}',
          '{"operation": "mix", "color1": "#ff0000", "color2": "#0000ff", "weight": 0.5}',
          '{"operation": "convert", "color1": "#ff0000", "format": "rgb"}',
          '{"operation": "analyze", "color1": "#ff0000"}'
        ],
        [
          '支持的操作：brightness（亮度）、contrast（对比度）、mix（混合）、complementary（互补色）、convert（转换格式）、analyze（分析）',
          'mix操作需要color2参数',
          '可以设置weight参数（0-1）控制混合比例，默认为0.5',
          '可以设置amount参数（-1到1）控制亮度/对比度调整幅度，默认0.2',
          '支持的颜色格式：hex（#ff0000）、rgb、hsl等'
        ]
      )
    }
  }

  try {
    onUpdate(
      {
        content: {
          stage: 'processing',
          operation,
          color1
        },
        format: 'json'
      },
      {
        percentage: 30,
        message: i18n.global.t('agent.tool.color.progress.processing', '正在处理颜色...')
      }
    )

    let result: any
    const color = tinycolor(color1)

    if (!color.isValid()) {
      return {
        status: 'failed',
        error: createDetailedError(
          '无效的颜色格式',
          [
            '{"operation": "brightness", "color1": "#ff0000"}  // 使用hex格式',
            '{"operation": "brightness", "color1": "rgb(255, 0, 0)"}  // 使用rgb格式',
            '{"operation": "brightness", "color1": "hsl(0, 100%, 50%)"}  // 使用hsl格式',
            '{"operation": "brightness", "color1": "red"}  // 使用颜色名称'
          ],
          [
            '支持的颜色格式：hex（#ff0000）、rgb（rgb(255,0,0)）、hsl（hsl(0,100%,50%)）、颜色名称（red, blue等）',
            '确保颜色值格式正确且有效',
            'hex格式必须以#开头，如#ff0000或#f00',
            'rgb格式：rgb(255, 0, 0)或rgba(255, 0, 0, 1)'
          ]
        )
      }
    }

    switch (operation) {
      case 'mix':
        if (!color2) {
          return {
            status: 'failed',
            error: createDetailedError(
              'mix操作需要color2参数（第二个颜色）',
              [
                '{"operation": "mix", "color1": "#ff0000", "color2": "#0000ff"}',
                '{"operation": "mix", "color1": "#ff0000", "color2": "#0000ff", "weight": 0.7}  // 权重0.7表示color1占70%'
              ],
              [
                'mix操作需要两个颜色参数：color1和color2',
                '可以设置weight参数（0-1）控制混合比例：0表示完全使用color2，1表示完全使用color1',
                'weight默认为0.5，表示各占50%',
                'weight值越大，color1占比越高'
              ]
            )
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
          error: createDetailedError(
            `未知的操作类型: ${operation}`,
            [
              '{"operation": "brightness", "color1": "#ff0000"}  // 调整亮度',
              '{"operation": "contrast", "color1": "#ff0000"}  // 调整对比度',
              '{"operation": "mix", "color1": "#ff0000", "color2": "#0000ff"}  // 混合颜色',
              '{"operation": "complementary", "color1": "#ff0000"}  // 获取互补色',
              '{"operation": "convert", "color1": "#ff0000", "format": "rgb"}  // 转换格式',
              '{"operation": "analyze", "color1": "#ff0000"}  // 分析颜色信息'
            ],
            [
              '支持的操作类型：brightness（亮度）、contrast（对比度）、mix（混合）、complementary（互补色）、convert（转换格式）、analyze（分析）',
              'brightness和contrast可以使用amount参数（-1到1）控制调整幅度',
              'mix需要color2参数和可选的weight参数（0-1）',
              'convert可以设置format参数：hex、rgb、hsl'
            ]
          )
        }
    }

    onUpdate(
      {
        content: {
          stage: 'completed',
          result,
          operation,
          input: { color1, color2, weight, amount, format }
        },
        format: 'json',
        componentName: 'ColorDisplay'
      },
      {
        percentage: 100,
        message: i18n.global.t('agent.tool.color.progress.completed', '颜色处理完成')
      }
    )

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
      error: createDetailedError(
        `颜色处理失败: ${errorMessage}`,
        [
          '{"operation": "brightness", "color1": "#ff0000"}',
          '{"operation": "mix", "color1": "#ff0000", "color2": "#0000ff"}',
          '确保颜色格式正确，如：#ff0000、rgb(255,0,0)等'
        ],
        [
          '检查颜色格式是否正确（hex、rgb、hsl等）',
          '确保操作类型正确（brightness、contrast、mix、complementary、convert、analyze）',
          'mix操作需要color2参数',
          'amount和weight参数应该是数字类型'
        ]
      )
    }
  }
}

export const colorToolConfig: AgentToolConfig = {
  id: 'color-processing',
  name: COLOR_TOOL_NAME,
  description: COLOR_TOOL_DESCRIPTION,
  origin: 'internal',
  spec: {
    name: 'color-processing',
    brief:
      'Process color mixing, brightness/contrast adjustment, complementary colors, and color format conversion.',
    fullSpec: `# Color Processing Tool

## Description
Provides various color processing functions:
- Color mixing (mix two colors by weight)
- Brightness adjustment
- Contrast adjustment
- Get complementary color
- Color format conversion (HEX, RGB, HSL)
- Color analysis (get hue, saturation, lightness)

## Usage Scenarios
- Theme color design
- UI color scheme generation
- Color matching suggestions
- Color adjustment and optimization

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

## Output Format
\`\`\`json
{
  "result": "string|object",
  "operation": "string",
  "input": "string|object"
}
\`\`\``
  },
  instruction: COLOR_INSTRUCTION,
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
}
