/**
 * LaTeX 到 OMML 转换测试用例
 * 测试从 LaTeX → OMML 的完整转换流程（使用 latex-to-omml 包）
 */

import { testFramework, type TestFunction } from './test-framework'

/**
 * 规范化 XML 字符串（移除空白和缩进，用于比较）
 */
function normalizeXml(xml: string): string {
  return xml
    .replace(/>\s+</g, '><') // 移除标签间的空白
    .replace(/\s+/g, ' ') // 规范化空白字符
    .replace(/\s*>\s*/g, '>') // 移除标签结束符周围的空白
    .replace(/\s*<\s*/g, '<') // 移除标签开始符周围的空白
    .trim()
}

/**
 * 获取 IPC 渲染器
 */
function getIpcRenderer(): any {
  if (typeof window !== 'undefined' && (window as any).electron) {
    return (window as any).electron.ipcRenderer
  } else {
    // 使用本地 IPC 渲染器（用于 Web 环境）
    const localIpcRenderer = require('./web-adapter/local-ipc-renderer').default
    return localIpcRenderer
  }
}

/**
 * 转换结果接口
 */
interface ConversionResult {
  latex: string
  omml: string
  normalizedOMML: string
}

/**
 * 转换 LaTeX 到 OMML（使用 latex-to-omml 包）
 * 直接转换，不再需要 MathML 中间步骤
 */
async function convertLatexToOMML(latex: string, displayMode: boolean): Promise<ConversionResult> {
  try {
    const ipcRenderer = getIpcRenderer()

    if (!ipcRenderer) {
      throw new Error('IPC 渲染器不可用，无法调用主进程函数')
    }

    // 直接调用主进程的 latex-to-omml IPC 处理器
    const omml = await ipcRenderer.invoke('latex-to-omml', latex, displayMode)

    if (!omml) {
      throw new Error('OMML 转换返回空结果')
    }

    // 规范化 OMML
    const normalizedOMML = normalizeXml(omml.trim())

    return {
      latex,
      omml: omml.trim(),
      normalizedOMML
    }
  } catch (error) {
    throw new Error(`转换失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * 创建测试用例的辅助函数
 */
function createTest(
  id: string,
  name: string,
  description: string,
  latex: string,
  displayMode: boolean,
  expectedContains?: string[]
): TestFunction {
  return {
    id: `latex-omml.${id}`,
    name,
    description,
    module: 'LaTeX 到 OMML 转换',
    fn: async () => {
      let conversionResult: ConversionResult | null = null

      try {
        // 执行转换
        conversionResult = await convertLatexToOMML(latex, displayMode)
        const normalized = conversionResult.normalizedOMML

        // 验证 OMML 结构
        if (!normalized.includes('<m:oMath')) {
          const errorMessage = `OMML 结构不正确，缺少 <m:oMath> 标签`
          // 创建包含完整信息的错误对象
          const error = new Error(errorMessage) as any
          error.conversionResult = conversionResult
          error.details = `结果: ${normalized.substring(0, 200)}`
          throw error
        }

        // 验证预期包含的内容
        if (expectedContains) {
          for (const expected of expectedContains) {
            if (!normalized.includes(expected)) {
              const errorMessage = `OMML 结构不正确，缺少预期内容 "${expected}"`
              // 创建包含完整信息的错误对象
              const error = new Error(errorMessage) as any
              error.conversionResult = conversionResult
              error.details = `结果: ${normalized.substring(0, 300)}`
              throw error
            }
          }
        }

        // 特殊检查：对于包含平方根的公式，确保不包含空的 <m:deg></m:deg>
        // 平方根应该使用 <m:rad><m:radPr></m:radPr><m:e>...</m:e></m:rad>，不包含 <m:deg>
        if (normalized.includes('<m:rad>')) {
          // 检查是否有空的 <m:deg></m:deg>（平方根不应该有这个）
          const emptyDegPattern = /<m:deg><\/m:deg>/
          if (emptyDegPattern.test(normalized)) {
            const errorMessage = 'OMML 结构不正确：平方根不应该包含空的 <m:deg></m:deg> 元素'
            const error = new Error(errorMessage) as any
            error.conversionResult = conversionResult
            error.details = `结果: ${normalized.substring(0, 500)}`
            throw error
          }
        }

        // 测试成功，返回完整信息
        return {
          passed: true,
          success: true,
          message: `${name} 转换成功`,
          latex: conversionResult.latex,
          omml: conversionResult.omml,
          normalizedOMML: conversionResult.normalizedOMML
        }
      } catch (error) {
        // 如果是转换过程中的错误
        if (error instanceof Error && error.message.includes('转换失败')) {
          // 转换失败，抛出异常（可能没有 conversionResult）
          throw error
        }

        // 验证失败，但转换可能成功，返回转换结果和错误信息
        if (conversionResult) {
          const errorObj = error as any
          return {
            passed: false,
            success: false,
            message: errorObj.message || '验证失败',
            error: errorObj.message || '验证失败',
            details: errorObj.details,
            latex: conversionResult.latex,
            omml: conversionResult.omml,
            normalizedOMML: conversionResult.normalizedOMML
          }
        }

        // 转换失败，抛出异常
        throw error
      }
    }
  }
}

// ============ 测试用例定义 ============

// 行内公式
const testEulerIdentity = createTest(
  'euler-identity',
  '欧拉恒等式（行内公式）',
  '测试行内公式 e^{iπ}+1=0 的转换',
  'e^{i\\pi}+1=0',
  false
)

const testBinomialExpansion = createTest(
  'binomial-expansion',
  '二项展开（行内公式）',
  '测试行内公式 (a+b)^2=a^2+2ab+b^2 的转换',
  '(a+b)^2=a^2+2ab+b^2',
  false
)

const testGradientOperator = createTest(
  'gradient-operator',
  '梯度算子（行内公式）',
  '测试行内公式 \\nabla f 的转换',
  '\\nabla f',
  false
)

// 块级公式
const testFourierTransform = createTest(
  'fourier-transform',
  '傅里叶变换（块级公式）',
  '测试块级公式 \\mathcal{F}(f)(\\xi)=\\int_{-\\infty}^{+\\infty}f(x)\\,e^{-2\\pi i x\\xi}\\,\\mathrm{d}x 的转换',
  '\\mathcal{F}(f)(\\xi)=\\int_{-\\infty}^{+\\infty}f(x)\\,e^{-2\\pi i x\\xi}\\,\\mathrm{d}x',
  true,
  ['∫']
)

const testLimitDefinition = createTest(
  'limit-definition',
  '极限定义（块级公式）',
  '测试块级公式 \\lim_{x\\to a} f(x) = L 的转换',
  '\\lim_{x\\to a} f(x) = L',
  true,
  ['<m:limLow>'] // OMML 中使用 <m:limLow> 结构表示 munder（下标极限），这是正确的 OMML 结构
)

const testPiecewiseFunction = createTest(
  'piecewise-function',
  '分段函数（块级公式，包含 < 符号）',
  '测试块级公式 g(x)=\\begin{cases}x^2, & x \\ge 0 \\\\ \\sin x, & x < 0\\end{cases} 的转换',
  'g(x)=\\begin{cases}x^2, & x \\ge 0 \\\\ \\sin x, & x < 0\\end{cases}',
  true
)

const testLaplacianOperator = createTest(
  'laplacian-operator',
  '拉普拉斯算子（块级公式）',
  '测试块级公式 \\Delta f = \\sum_{i=1}^{n}\\frac{\\partial^2 f}{\\partial x_i^2} 的转换',
  '\\Delta f = \\sum_{i=1}^{n}\\frac{\\partial^2 f}{\\partial x_i^2}',
  true,
  ['∑']
)

const testInnerProduct = createTest(
  'inner-product',
  '内积定义（块级公式）',
  '测试块级公式 \\langle \\mathbf{x},\\mathbf{y}\\rangle = \\sum_{i=1}^{n} x_i y_i 的转换',
  '\\langle \\mathbf{x},\\mathbf{y}\\rangle = \\sum_{i=1}^{n} x_i y_i',
  true,
  ['∑']
)

const testNormDefinition = createTest(
  'norm-definition',
  '范数定义（块级公式）',
  '测试块级公式 \\|\\mathbf{x}\\| = \\sqrt{\\langle \\mathbf{x},\\mathbf{x}\\rangle} 的转换',
  '\\|\\mathbf{x}\\| = \\sqrt{\\langle \\mathbf{x},\\mathbf{x}\\rangle}',
  true,
  ['<m:rad>'] // OMML 中使用 <m:rad> 结构表示根号
)

const testCauchySchwarz = createTest(
  'cauchy-schwarz',
  '柯西-施瓦茨不等式（块级公式）',
  '测试块级公式 |\\langle \\mathbf{x},\\mathbf{y}\\rangle| \\le \\|\\mathbf{x}\\|\\cdot\\|\\mathbf{y}\\| 的转换',
  '|\\langle \\mathbf{x},\\mathbf{y}\\rangle| \\le \\|\\mathbf{x}\\|\\cdot\\|\\mathbf{y}\\|',
  true
)

const testAlignedEnvironment = createTest(
  'aligned-environment',
  'aligned 环境（块级公式）',
  '测试块级公式 \\begin{aligned}f(t) &= \\langle \\mathbf{x}+t\\mathbf{y},\\mathbf{x}+t\\mathbf{y}\\rangle \\\\ &= \\|\\mathbf{x}\\|^2+2t\\langle \\mathbf{x},\\mathbf{y}\\rangle+t^2\\|\\mathbf{y}\\|^2\\end{aligned} 的转换',
  '\\begin{aligned}f(t) &= \\langle \\mathbf{x}+t\\mathbf{y},\\mathbf{x}+t\\mathbf{y}\\rangle \\\\ &= \\|\\mathbf{x}\\|^2+2t\\langle \\mathbf{x},\\mathbf{y}\\rangle+t^2\\|\\mathbf{y}\\|^2\\end{aligned}',
  true
)

const testMatrix = createTest(
  'matrix',
  '矩阵（块级公式）',
  '测试块级公式 \\mathbf{A} = \\begin{pmatrix}2 & 1 \\\\ 1 & 2\\end{pmatrix} 的转换',
  '\\mathbf{A} = \\begin{pmatrix}2 & 1 \\\\ 1 & 2\\end{pmatrix}',
  true
)

const testDeterminant = createTest(
  'determinant',
  '行列式（块级公式）',
  '测试块级公式 \\det(\\mathbf{A}-\\lambda I) = \\begin{vmatrix}2-\\lambda & 1 \\\\ 1 & 2-\\lambda\\end{vmatrix} = (2-\\lambda)^2-1 的转换',
  '\\det(\\mathbf{A}-\\lambda I) = \\begin{vmatrix}2-\\lambda & 1 \\\\ 1 & 2-\\lambda\\end{vmatrix} = (2-\\lambda)^2-1',
  true
)

const testDifferentialEquation = createTest(
  'differential-equation',
  '微分方程（块级公式）',
  '测试块级公式 \\frac{\\mathrm{d}y}{\\mathrm{d}x}+py = q(x) 的转换',
  '\\frac{\\mathrm{d}y}{\\mathrm{d}x}+py = q(x)',
  true,
  ['<m:f>'] // OMML 中使用 <m:f> 结构表示分数
)

const testSeries = createTest(
  'series',
  '级数（块级公式）',
  '测试块级公式 \\sum_{n=0}^{\\infty}\\frac{x^n}{n!} 的转换',
  '\\sum_{n=0}^{\\infty}\\frac{x^n}{n!}',
  true,
  ['∑']
)

// 错误日志中的公式
const testErrorCase1 = createTest(
  'error-case-1',
  '错误用例 1: 0\\lt',
  '测试错误日志中的公式 0\\lt 的转换',
  '0\\lt',
  false
)

const testErrorCase2 = createTest(
  'error-case-2',
  '错误用例 2: 分段函数（转义问题）',
  '测试错误日志中的分段函数公式（注意转义问题）',
  'g(x)=\\begin{cases}x^2, & x \\ge 0 \\\\ \\sin x, & x < 0\\end{cases}',
  true
)
// ================= 行内公式 =================

const testNestedSupSub = createTest(
  'nested-supsub',
  '上下标嵌套（行内）',
  '测试 a_{n_i}^{k^2}',
  'a_{n_i}^{k^2}',
  false
)

const testInlineFraction = createTest(
  'inline-fraction',
  '嵌套分数（行内）',
  '测试 \\frac{1}{1+\\frac{1}{x}}',
  '\\frac{1}{1+\\frac{1}{x}}',
  false,
  ['<m:f>'] // OMML 中使用 <m:f> 结构表示分数
)

const testInlineRelations = createTest(
  'inline-relations',
  '关系运算符（行内）',
  '测试 <, >, \\le, \\ge, \\neq',
  'a<b \\le c \\ge d \\neq e',
  false
)

const testInlineLogicSymbols = createTest(
  'inline-logic',
  '逻辑符号（行内）',
  '测试 \\forall \\exists \\in',
  '\\forall x\\in\\mathbb{R},\\ \\exists y>x',
  false
)

// ================= 块级公式 =================

const testInfiniteSeries = createTest(
  'infinite-series',
  '无穷级数',
  '测试求和符号与阶乘',
  '\\sum_{n=0}^{\\infty}\\frac{x^n}{n!}',
  true,
  ['∑']
)

const testIntegral = createTest(
  'integral',
  '定积分',
  '测试积分与微分符号',
  '\\int_{0}^{1} x^2\\,\\mathrm{d}x',
  true,
  ['∫']
)

const testPartialDerivative = createTest(
  'partial-derivative',
  '偏导数',
  '测试二阶偏导',
  '\\frac{\\partial^2 u}{\\partial x^2}+\\frac{\\partial^2 u}{\\partial y^2}=0',
  true
)

// ================= 容易出问题的边缘情况 =================

const testOverlineHatVec = createTest(
  'accent-symbols',
  '组合符号',
  '测试 \\overline \\hat \\vec',
  '\\vec{v}+\\hat{n}+\\overline{AB}',
  false
)

const testBigDelimiters = createTest(
  'big-delimiters',
  '可伸缩括号',
  '测试 \\left \\right',
  '\\left(\\frac{a}{b}\\right)^2',
  true
)

const testErrorCaseLt = createTest('error-lt', '错误用例：0\\lt', '测试 \\lt 转换', '0\\lt', false)

const testErrorCaseRawLt = createTest(
  'error-raw-lt',
  '错误用例：直接 <',
  '测试原始 < 符号',
  'x < y',
  false
)

const testComplexNestedSqrt = createTest(
  'complex-nested-sqrt',
  '复杂嵌套根号（平方根不应包含 deg）',
  '测试包含多个平方根的复杂公式，确保平方根不生成空的 <m:deg> 元素',
  '\\frac{1}{\\Bigl(\\sqrt{\\phi \\sqrt{5}}-\\phi\\Bigr) e^{\\frac25 \\pi}} = 1+\\frac{e^{-2\\pi}} {1+\\frac{e^{-4\\pi}} {1+\\frac{e^{-6\\pi}}{1+\\frac{e^{-8\\pi}}{1+\\cdots}}}}',
  true,
  ['<m:rad>'] // 应该包含 <m:rad> 结构
)

// ================= 复杂公式测试（包含 aligned 环境和 tag） =================

const testComplexAlignedWithTag = createTest(
  'complex-aligned-with-tag',
  '复杂 aligned 环境公式（包含 tag 标签）',
  '测试包含 \\begin{aligned} 环境、\\% 百分号、\\times 乘号、\\log 函数和 \\tag{1} 标签的复杂多行公式',
  '\\begin{aligned}\n\n\\mathcal{P} =\\;& \\beta_0 + \\beta_1 (I-\\bar I) + \\beta_2 (I-\\bar I)^2 + \\beta_3 \\log(1+T) + \\beta_4 \\log(1+n_a) \\\\\n\n&+ \\beta_5 \\log(1+O\\%) + \\beta_6 c + \\beta_7 R + \\beta_8 E_c + \\beta_9 \\log(1+A_e) \\\\\n\n&+ \\beta_{10} P_{SA} + \\beta_{11} (I \\times E_c) + \\beta_{12} (A_e \\times P_{SA}) \\\\\n\n&+ \\beta_{13} (O\\% \\times T) + \\beta_{14} (R \\times n_a) + \\beta_{15} (c \\times I) \\\\\n\n&+ \\beta_{16} (E_c \\times T) + \\beta_{17} (P_{SA} \\times \\log(1+n_a)) \\\\\n\n&+ \\beta_{18} (I \\times \\log(1+T)) + \\beta_{19} (A_e \\times T) + \\varepsilon,\n\n\\end{aligned}\n\n\\tag{1}',
  true,
  ['<m:m>'] // aligned 环境在 MathML 中被转换为 <mtable>，在 OMML 中转换为 <m:m>（矩阵）结构，这是正确的
)

// ============ 注册所有测试函数 ============

/**
 * 注册所有 LaTeX 到 OMML 转换测试用例
 */
export function registerLatexOMMLConversionTests() {
  testFramework.register(testEulerIdentity)
  testFramework.register(testBinomialExpansion)
  testFramework.register(testFourierTransform)
  testFramework.register(testLimitDefinition)
  testFramework.register(testPiecewiseFunction)
  testFramework.register(testGradientOperator)
  testFramework.register(testLaplacianOperator)
  testFramework.register(testInnerProduct)
  testFramework.register(testNormDefinition)
  testFramework.register(testCauchySchwarz)
  testFramework.register(testAlignedEnvironment)
  testFramework.register(testMatrix)
  testFramework.register(testDeterminant)
  testFramework.register(testDifferentialEquation)
  testFramework.register(testSeries)
  testFramework.register(testErrorCase1)
  testFramework.register(testErrorCase2)
  testFramework.register(testNestedSupSub)
  testFramework.register(testInlineFraction)
  testFramework.register(testInlineRelations)
  testFramework.register(testInlineLogicSymbols)

  testFramework.register(testInfiniteSeries)
  testFramework.register(testIntegral)
  testFramework.register(testPartialDerivative)

  testFramework.register(testOverlineHatVec)
  testFramework.register(testBigDelimiters)

  testFramework.register(testErrorCaseLt)
  testFramework.register(testErrorCaseRawLt)
  testFramework.register(testComplexNestedSqrt)
  testFramework.register(testComplexAlignedWithTag)
}
