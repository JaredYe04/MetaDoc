/**
 * LaTeX 标签提取工具
 * 从 LaTeX 代码中提取 \tag 命令，用于在 Word 中回写标签
 * 
 * 注意：此工具不依赖任何外部库，仅使用正则表达式提取标签
 */

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

