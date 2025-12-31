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

    // 调用 mathjax-node 进行转换
    // mathjax-node 使用回调模式，我们将其转换为 Promise
    // logger.debug(`开始转换 LaTeX: ${latex.substring(0, 50)}${latex.length > 50 ? '...' : ''}`, { 
    //   latex, 
    //   displayMode 
    // });
    
    const result = await new Promise<{ mml?: string; html?: string; svg?: string; errors?: string[] }>((resolve, reject) => {
      mjAPI.typeset(
        {
          math: latex,
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
            logger.warn(`LaTeX 转换失败: ${data.html}`, { latex });
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

