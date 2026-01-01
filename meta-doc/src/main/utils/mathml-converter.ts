/**
 * LaTeX 到 MathML 转换工具
 * 使用 mathjax-node 在主进程中进行转换
 */

const mjAPI = require('mathjax-node');
import { createMainLogger } from '../logger';

const logger = createMainLogger('MathMLConverter');

// 初始化 mathjax-node
let mathjaxInitialized = false;

/**
 * 初始化 MathJax
 */
function initializeMathJax(): void {
  if (mathjaxInitialized) {
    return;
  }

  mjAPI.config({
    MathJax: {
      // 使用 NativeMML 输出格式（MathJax 2.x 生成 MathML 的方式）
      // NativeMML 本身就会生成 MathML，不需要额外的扩展
      jax: ['input/TeX', 'output/NativeMML'],
      TeX: {
        extensions: ['AMSmath.js', 'AMSsymbols.js', 'noErrors.js', 'noUndefined.js']
      }
    }
  });

  mjAPI.start();
  mathjaxInitialized = true;
  logger.info('MathJax 初始化完成');
}

/**
 * 提取并移除 \tag 命令，返回标签内容和预处理后的 LaTeX
 * @param latex 原始 LaTeX 代码
 * @returns 包含标签内容和预处理后 LaTeX 的对象
 */
export function extractTagFromLatex(latex: string): { tag: string | null; processedLatex: string } {
  let processed = latex;
  let tag: string | null = null;
  
  // 匹配 \tag{...} 或 \tag*{...}（带星号的版本）
  // 在 LaTeX 中：
  // - \tag{1} 会自动添加括号，显示为 (1)
  // - \tag*{1} 不会添加括号，显示为 1
  const tagMatch = processed.match(/\\tag\*?\{([^}]*)\}/);
  if (tagMatch) {
    const tagContent = tagMatch[1].trim();
    // 判断是否为 \tag*（带星号）
    const isTagStar = tagMatch[0].startsWith('\\tag*');
    
    if (isTagStar) {
      // \tag*{...}：不添加括号，直接使用内容
      tag = tagContent;
    } else {
      // \tag{...}：需要添加括号（除非内容本身已经包含括号）
      // 检查内容是否已经以括号开头和结尾
      if (tagContent.startsWith('(') && tagContent.endsWith(')')) {
        // 已经包含括号，直接使用
        tag = tagContent;
      } else {
        // 没有括号，添加括号
        tag = `(${tagContent})`;
      }
    }
    
    // 移除 \tag 命令
    processed = processed.replace(/\\tag\*?\{[^}]*\}/g, '');
  }
  
  // 处理可能存在的多余空白（由于移除 \tag 导致的）
  // 注意：对于块级公式，换行符可能是公式格式的一部分（如 aligned 环境），应该保留
  // 只处理连续的空白字符（空格、制表符等），但保留换行符
  // 先规范化换行符（统一为 \n）
  processed = processed.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // 将多个连续的空格/制表符替换为单个空格，但保留换行符
  processed = processed.replace(/[ \t]+/g, ' ');
  // 移除首尾空白（包括换行符）
  processed = processed.trim();
  
  return { tag, processedLatex: processed };
}

/**
 * 预处理 LaTeX 代码，移除或处理 MathJax 不支持的命令
 * @param latex 原始 LaTeX 代码
 * @returns 预处理后的 LaTeX 代码
 */
function preprocessLatexForMathJax(latex: string): string {
  // 使用 extractTagFromLatex 提取标签并移除
  const { processedLatex } = extractTagFromLatex(latex);
  return processedLatex;
}

/**
 * 将 LaTeX 公式转换为 MathML
 * @param latex LaTeX 公式代码
 * @param displayMode 是否为块级公式
 * @returns MathML 字符串，如果转换失败则返回 null
 */
export async function convertLatexToMathML(
  latex: string,
  displayMode: boolean = false
): Promise<string | null> {
  try {
    // 确保 MathJax 已初始化
    if (!mathjaxInitialized) {
      initializeMathJax();
    }

    // 预处理 LaTeX 代码，移除 MathJax 不支持的命令（如 \tag）
    let preprocessedLatex = preprocessLatexForMathJax(latex);
    
    // 对于块级公式，MathJax 可能无法正确处理换行符
    // 将换行符替换为空格，因为 MathJax 会自动处理公式的换行
    // 注意：这不会影响公式的语义，因为 LaTeX 中的换行在数学模式中通常只是格式问题
    if (displayMode) {
      // 将换行符和周围的空白字符规范化
      preprocessedLatex = preprocessedLatex.replace(/\s*\n\s*/g, ' ');
    }
    
    // 调用 mathjax-node 进行转换
    // mathjax-node 使用回调模式，我们将其转换为 Promise
    logger.debug(`开始转换 LaTeX: ${preprocessedLatex.substring(0, 100)}${preprocessedLatex.length > 100 ? '...' : ''}`, { 
      originalLatex: latex.substring(0, 100),
      preprocessedLatex: preprocessedLatex.substring(0, 100),
      displayMode 
    });
    
    const result = await new Promise<{ mml?: string; html?: string; svg?: string; errors?: string[] }>((resolve, reject) => {
      mjAPI.typeset(
        {
          math: preprocessedLatex,
          format: 'TeX',
          mml: true,  // 请求 MathML 输出
          display: displayMode
        },
        (data: any) => {
          // // 记录返回的数据结构
          // logger.debug('MathJax 转换返回数据:', { 
          //   hasMml: !!data.mml,
          //   hasHtml: !!data.html,
          //   hasSvg: !!data.svg,
          //   hasErrors: !!(data.errors && data.errors.length > 0),
          //   keys: Object.keys(data),
          //   mmlLength: data.mml ? data.mml.length : 0,
          //   mmlPreview: data.mml ? data.mml.substring(0, 100) : null
          // });
          
          if (data.errors && data.errors.length > 0) {
            //输出html
            logger.error(`LaTeX 转换失败: ${data.errors.join(', ')}`, { 
              latex: preprocessedLatex,
              html: data.html,
              errors: data.errors
            });
            reject(new Error(data.errors.join(', ')));
          } else if (data.mml) {
            // // mathjax-node 返回的字段是 'mml'，不是 'mathml'
            // logger.info(`成功转换 LaTeX 为 MathML，长度: ${data.mml.length}`, { 
            //   latex: latex.substring(0, 50),
            //   mmlPreview: data.mml.substring(0, 200)
            // });
            resolve(data);
          } else {
            logger.warn('MathJax 转换返回空结果，但无错误', { 
              latex,
              dataKeys: Object.keys(data),
              dataPreview: JSON.stringify(data).substring(0, 200)
            });
            reject(new Error('MathJax 转换返回空结果'));
          }
        }
      );
    });

    const mathml = result.mml || null;
    if (!mathml) {
      logger.error('MathML 转换失败，返回空结果', { latex });
      return null;
    }
    return mathml;
  } catch (error) {
    logger.error('LaTeX 到 MathML 转换出错:', error);
    return null;
  }
}

/**
 * 批量转换 LaTeX 公式到 MathML
 * @param formulas 公式数组，每个元素包含 latex 和 displayMode
 * @returns MathML 字符串数组，失败的项为 null
 */
export async function convertLatexBatchToMathML(
  formulas: Array<{ latex: string; displayMode: boolean }>
): Promise<Array<string | null>> {
  // 确保 MathJax 已初始化
  if (!mathjaxInitialized) {
    initializeMathJax();
  }

  // 并行转换所有公式
  const promises = formulas.map(({ latex, displayMode }) =>
    convertLatexToMathML(latex, displayMode).catch(() => null)
  );

  return Promise.all(promises);
}

