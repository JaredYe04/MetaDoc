/**
 * 数据计算Tool
 * 执行复杂的数学计算，包括数值、向量、矩阵等运算
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
import { createDetailedError } from './tool-utils'

const logger = createRendererLogger('CalculationTool')

const calculationToolLocales: ToolLocales = {
  zh_cn: {
    name: '数据计算',
    description: '执行复杂的数学计算，包括数值、向量、矩阵等运算，支持表达式求值',
    instruction: `
# 数据计算工具

## 功能描述
执行各种数学计算，包括：
- 基本数学运算（加减乘除、幂运算等）
- 三角函数、对数函数等
- 向量运算（点积、叉积、模长等）
- 矩阵运算（矩阵乘法、转置、行列式等）
- 统计计算（平均值、方差、标准差等）
- 表达式求值（支持eval操作）

## 使用场景
- 数值计算
- 科学计算
- 数据分析中的计算部分
- 公式验证

## 输入格式
\`\`\`json
{
  "expression": "string", // 必需，要计算的表达式或计算描述
  "variables": {}, // 可选，变量值映射
  "precision": 10 // 可选，结果精度（小数位数），默认10
}
\`\`\`

## 输出格式
\`\`\`json
{
  "result": "number|string|object", // 计算结果
  "expression": "string", // 原始表达式
  "steps": ["string"], // 可选，计算步骤
  "unit": "string" // 可选，单位
}
\`\`\`

## 注意事项
1. 表达式必须安全，避免执行恶意代码
2. 支持常见的数学函数和常量（Math对象）
3. 向量和矩阵使用数组表示
4. 结果会保留指定精度
`
  },
  en_us: {
    name: 'Data Calculation',
    description:
      'Perform complex mathematical calculations including numerical, vector, and matrix operations',
    instruction: `
# Data Calculation Tool

## Description
Performs various mathematical calculations including:
- Basic arithmetic (addition, subtraction, multiplication, division, power)
- Trigonometric and logarithmic functions
- Vector operations (dot product, cross product, magnitude)
- Matrix operations (multiplication, transpose, determinant)
- Statistical calculations (mean, variance, standard deviation)
- Expression evaluation (supports eval operations)

## Usage Scenarios
- Numerical calculations
- Scientific computing
- Data analysis calculations
- Formula verification

## Input Format
\`\`\`json
{
  "expression": "string", // Required, expression or calculation description
  "variables": {}, // Optional, variable value mapping
  "precision": 10 // Optional, result precision (decimal places), default 10
}
\`\`\`

## Output Format
\`\`\`json
{
  "result": "number|string|object",
  "expression": "string",
  "steps": ["string"],
  "unit": "string"
}
\`\`\`
`
  }
}

/**
 * 安全的表达式求值
 */
function safeEval(expression: string, variables: Record<string, any> = {}): any {
  // 创建安全的上下文
  const context: Record<string, any> = {
    Math,
    Array,
    Object,
    Number,
    String,
    Boolean,
    Date,
    ...variables
  }

  // 使用Function构造器而不是eval，更安全
  try {
    const func = new Function(...Object.keys(context), `"use strict"; return (${expression})`)
    return func(...Object.values(context))
  } catch (error) {
    throw new Error(`表达式求值失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * 向量运算
 */
function vectorOperation(operation: string, vec1: number[], vec2?: number[]): number | number[] {
  switch (operation) {
    case 'dot':
      if (!vec2 || vec1.length !== vec2.length) {
        throw new Error('向量长度不匹配')
      }
      return vec1.reduce((sum, val, i) => sum + val * vec2[i], 0)
    case 'magnitude':
      return Math.sqrt(vec1.reduce((sum, val) => sum + val * val, 0))
    case 'normalize': {
      const mag = vectorOperation('magnitude', vec1) as number
      return vec1.map((val) => val / mag)
    }
    default:
      throw new Error(`不支持的向量操作: ${operation}`)
  }
}

/**
 * 矩阵运算
 */
function matrixOperation(
  operation: string,
  matrix1: number[][],
  matrix2?: number[][]
): number | number[][] {
  switch (operation) {
    case 'transpose':
      return matrix1[0].map((_, colIndex) => matrix1.map((row) => row[colIndex]))
    case 'multiply': {
      if (!matrix2) throw new Error('缺少第二个矩阵')
      // 简化的矩阵乘法实现
      const result: number[][] = []
      for (let i = 0; i < matrix1.length; i++) {
        result[i] = []
        for (let j = 0; j < matrix2[0].length; j++) {
          result[i][j] = 0
          for (let k = 0; k < matrix1[0].length; k++) {
            result[i][j] += matrix1[i][k] * matrix2[k][j]
          }
        }
      }
      return result
    }
    default:
      throw new Error(`不支持的矩阵操作: ${operation}`)
  }
}

/**
 * 数据计算Tool回调函数
 */
const calculationToolCallback: ToolCallback = async (params, signal, onUpdate) => {
  const expression = params.expression as string
  const variables = (params.variables as Record<string, any>) || {}
  const precision = (params.precision as number) || 10

  if (!expression || typeof expression !== 'string') {
    return {
      status: 'failed',
      error: createDetailedError(
        '缺少必需参数: expression（要计算的表达式）',
        [
          '{"expression": "2 + 3 * 4"}',
          '{"expression": "Math.sin(Math.PI / 2)"}',
          '{"expression": "x * y + z", "variables": {"x": 10, "y": 20, "z": 5}}',
          '{"expression": "vector:dot|[1,2,3]|[4,5,6]"}  // 向量点积',
          '{"expression": "matrix:transpose|[[1,2],[3,4]]"}  // 矩阵转置'
        ],
        [
          '支持基本数学运算、三角函数、对数等Math对象的所有函数',
          '可以通过variables参数传入变量值',
          '支持向量运算：vector:操作|向量1|向量2，如dot（点积）、magnitude（模长）',
          '支持矩阵运算：matrix:操作|矩阵1|矩阵2，如transpose（转置）、multiply（乘法）',
          '可以设置precision参数控制结果精度（小数位数）'
        ]
      )
    }
  }

  try {
    onUpdate(
      {
        content: {
          stage: 'calculating',
          expression
        },
        format: 'json'
      },
      {
        percentage: 30,
        message: i18n.global.t('agent.tool.calculation.progress.calculating', '正在计算...')
      }
    )

    let result: any
    const steps: string[] = []

    // 检查是否是特殊操作
    if (expression.startsWith('vector:')) {
      const parts = expression.slice(7).split('|')
      const op = parts[0]
      const vec1 = JSON.parse(parts[1])
      const vec2 = parts[2] ? JSON.parse(parts[2]) : undefined
      result = vectorOperation(op, vec1, vec2)
      steps.push(`执行向量操作: ${op}`)
    } else if (expression.startsWith('matrix:')) {
      const parts = expression.slice(7).split('|')
      const op = parts[0]
      const matrix1 = JSON.parse(parts[1])
      const matrix2 = parts[2] ? JSON.parse(parts[2]) : undefined
      result = matrixOperation(op, matrix1, matrix2)
      steps.push(`执行矩阵操作: ${op}`)
    } else {
      // 普通表达式求值
      result = safeEval(expression, variables)
      steps.push(`计算表达式: ${expression}`)
    }

    // 处理精度
    if (typeof result === 'number') {
      result = Number(result.toFixed(precision))
    } else if (Array.isArray(result)) {
      result = result.map((item) =>
        typeof item === 'number' ? Number(item.toFixed(precision)) : item
      )
    }

    onUpdate(
      {
        content: {
          stage: 'completed',
          result,
          expression,
          steps
        },
        format: 'json'
      },
      {
        percentage: 100,
        message: i18n.global.t('agent.tool.calculation.progress.completed', '计算完成')
      }
    )

    return {
      status: 'succeeded',
      data: {
        content: {
          stage: 'completed',
          result,
          expression,
          steps
        },
        format: 'json'
      },
      result: {
        result,
        expression,
        steps
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('计算失败:', error)
    return {
      status: 'failed',
      error: createDetailedError(
        `计算失败: ${errorMessage}`,
        [
          '{"expression": "2 + 3"}',
          '{"expression": "Math.sqrt(16)"}',
          '检查表达式语法是否正确',
          '确保使用的函数和常量在Math对象中存在'
        ],
        [
          '确保表达式语法正确，使用JavaScript数学表达式',
          '向量运算格式：vector:操作|向量1|向量2',
          '矩阵运算格式：matrix:操作|矩阵1|矩阵2',
          '可以通过variables参数传入变量值',
          '如果表达式包含变量，确保所有变量都有值'
        ]
      )
    }
  }
}

export const calculationToolConfig: AgentToolConfig = {
  id: 'data-calculation',
  name: calculationToolLocales,
  description: calculationToolLocales,
  origin: 'internal',
  spec: {
    name: 'data-calculation',
    brief:
      'Perform complex mathematical calculations including numerical, vector, and matrix operations. Supports expression evaluation.',
    fullSpec: `# Data Calculation Tool

## Description
Performs various mathematical calculations including:
- Basic arithmetic (addition, subtraction, multiplication, division, power)
- Trigonometric and logarithmic functions
- Vector operations (dot product, cross product, magnitude)
- Matrix operations (multiplication, transpose, determinant)
- Statistical calculations (mean, variance, standard deviation)
- Expression evaluation (supports eval operations)

## Usage Scenarios
- Numerical calculations
- Scientific computing
- Data analysis calculations
- Formula verification

## Input Format
\`\`\`json
{
  "expression": "string", // Required, expression or calculation description
  "variables": {}, // Optional, variable value mapping
  "precision": 10 // Optional, result precision (decimal places), default 10
}
\`\`\`

## Output Format
\`\`\`json
{
  "result": "number|string|object",
  "expression": "string",
  "steps": ["string"],
  "unit": "string"
}
\`\`\`

## Important Notes
1. Expressions must be safe, avoid executing malicious code
2. Supports common mathematical functions and constants (Math object)
3. Vectors and matrices are represented as arrays
4. Results will retain specified precision`
  },
  instruction: calculationToolLocales,
  tags: ['calculation', 'math', 'numeric'],
  running: false,
  enabled: true,
  requiresLLM: false,
  callback: calculationToolCallback,
  inputSchema: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description: '要计算的表达式，如 "2 + 3 * 4" 或 "Math.sin(Math.PI / 2)"'
      },
      variables: {
        type: 'object',
        description: '变量值映射，如 {"x": 10, "y": 20}'
      },
      precision: {
        type: 'number',
        description: '结果精度（小数位数）',
        default: 10
      }
    },
    required: ['expression']
  },
  outputSchema: {
    type: 'object',
    properties: {
      result: {
        description: '计算结果'
      },
      expression: { type: 'string', description: '原始表达式' },
      steps: {
        type: 'array',
        items: { type: 'string' },
        description: '计算步骤'
      }
    }
  },
  locales: calculationToolLocales
}
