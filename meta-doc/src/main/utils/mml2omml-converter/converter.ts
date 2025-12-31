/**
 * AST 到 OMML 转换器
 * 
 * 第三层：数学 AST → OMML
 * 
 * 将解析后的数学 AST 转换为 OMML（Office Math Markup Language）格式
 * 
 * OMML 硬规则：
 * 1. 一个 <m:t> 不能包含多个数学 token
 * 2. 运算符不能当普通字符
 * 3. fence 必须用 <m:d>
 * 4. matrix 必须 <m:m> + <m:mr>
 */

import { MathAST, MathASTNode } from './parser';

/**
 * 将数学 AST 转换为 OMML 字符串
 * 
 * @param ast 数学 AST
 * @returns OMML 字符串
 */
export function convertASTToOMML(ast: MathAST): string {
  const children = ast.root.children;
  
  if (children.length === 0) {
    return '<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"></m:oMath>';
  }
  
  // 转换根节点的子节点
  const ommlContent = children.map(child => convertNode(child)).join('');
  
  return `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">${ommlContent}</m:oMath>`;
}

/**
 * 转换单个 AST 节点为 OMML
 */
function convertNode(node: MathASTNode): string {
  try {
    switch (node.type) {
      case 'Fraction':
        return convertFraction(node);
      case 'Sqrt':
        return convertSqrt(node);
      case 'Power':
        return convertPower(node);
      case 'Subscript':
        return convertSubscript(node);
      case 'SubSup':
        return convertSubSup(node);
      case 'Over':
        return convertOver(node);
      case 'Under':
        return convertUnder(node);
      case 'UnderOver':
        return convertUnderOver(node);
      case 'Delimiter':
        return convertDelimiter(node);
      case 'Matrix':
        return convertMatrix(node);
      case 'Operator':
        return convertOperator(node);
      case 'Text':
        return convertText(node);
      case 'Row':
        return convertRow(node);
      default:
        // 未知节点类型，尝试作为 Row 处理
        console.warn(`未知的 AST 节点类型: ${(node as any).type}`);
        if ('children' in node) {
          return convertRow(node as any);
        }
        return '';
    }
  } catch (error) {
    // 错误处理：如果转换失败，返回空或占位符
    console.error(`转换 AST 节点失败:`, error, node);
    return '';
  }
}

/**
 * 转换分数节点
 * OMML 模板: <m:f><m:num>...</m:num><m:den>...</m:den></m:f>
 */
function convertFraction(node: { numerator: MathASTNode[]; denominator: MathASTNode[] }): string {
  const numContent = convertNodesToOMML(node.numerator);
  const denContent = convertNodesToOMML(node.denominator);
  
  return `<m:f><m:num>${numContent}</m:num><m:den>${denContent}</m:den></m:f>`;
}

/**
 * 转换根号节点
 * OMML 模板: 
 * - 平方根: <m:rad><m:radPr></m:radPr><m:e>...</m:e></m:rad> (不包含 <m:deg>)
 * - n 次根: <m:rad><m:radPr><m:degHide m:val="0"/></m:radPr><m:deg>...</m:deg><m:e>...</m:e></m:rad>
 */
function convertSqrt(node: { radicand: MathASTNode[]; index?: MathASTNode[] }): string {
  const radicandContent = convertNodesToOMML(node.radicand);
  
  // 检查是否有有效的开方次数（必须是已定义且非空数组）
  const hasIndex = node.index !== undefined && Array.isArray(node.index) && node.index.length > 0;
  
  if (hasIndex) {
    // n 次根：需要显示开方次数
    const indexContent = convertNodesToOMML(node.index || []);
    return `<m:rad><m:radPr><m:degHide m:val="0"/></m:radPr><m:deg>${indexContent}</m:deg><m:e>${radicandContent}</m:e></m:rad>`;
  } else {
    // 平方根：不包含 <m:deg> 元素
    return `<m:rad><m:radPr></m:radPr><m:e>${radicandContent}</m:e></m:rad>`;
  }
}

/**
 * 转换幂节点
 * OMML 模板: <m:sSup><m:e>...</m:e><m:sup>...</m:sup></m:sSup>
 */
function convertPower(node: { base: MathASTNode[]; exponent: MathASTNode[] }): string {
  const baseContent = convertNodesToOMML(node.base);
  const expContent = convertNodesToOMML(node.exponent);
  
  return `<m:sSup><m:e>${baseContent}</m:e><m:sup>${expContent}</m:sup></m:sSup>`;
}

/**
 * 转换下标节点
 * OMML 模板: <m:sSub><m:e>...</m:e><m:sub>...</m:sub></m:sSub>
 */
function convertSubscript(node: { base: MathASTNode[]; subscript: MathASTNode[] }): string {
  const baseContent = convertNodesToOMML(node.base);
  const subContent = convertNodesToOMML(node.subscript);
  
  return `<m:sSub><m:e>${baseContent}</m:e><m:sub>${subContent}</m:sub></m:sSub>`;
}

/**
 * 转换上下标组合节点
 * OMML 模板: <m:sSubSup><m:e>...</m:e><m:sub>...</m:sub><m:sup>...</m:sup></m:sSubSup>
 * 注意：对于积分、求和等运算符，应该使用 <m:nary>，但这里先使用 <m:sSubSup>
 */
function convertSubSup(node: { base: MathASTNode[]; subscript: MathASTNode[]; superscript: MathASTNode[] }): string {
  const baseContent = convertNodesToOMML(node.base);
  const subContent = convertNodesToOMML(node.subscript);
  const supContent = convertNodesToOMML(node.superscript);
  
  // 检查 base 是否是积分或求和运算符，如果是，使用 <m:nary>
  const isIntegralOrSum = node.base.length === 1 && 
    node.base[0].type === 'Operator' && 
    ((node.base[0] as any).operator === '∫' || (node.base[0] as any).operator === '∑');
  
  if (isIntegralOrSum) {
    // 使用 <m:nary> 表示积分或求和
    const operatorNode = node.base[0] as any;
    const operator = operatorNode.operator;
    const operatorChar = escapeXmlAttribute(operator);
    return `<m:nary><m:naryPr><m:chr m:val="${operatorChar}"/></m:naryPr><m:sub>${subContent}</m:sub><m:sup>${supContent}</m:sup><m:e></m:e></m:nary>`;
  }
  
  return `<m:sSubSup><m:e>${baseContent}</m:e><m:sub>${subContent}</m:sub><m:sup>${supContent}</m:sup></m:sSubSup>`;
}

/**
 * 转换上标节点（mover）
 * OMML 模板: <m:groupChr><m:groupChrPr><m:pos m:val="top"/></m:groupChrPr><m:e>...</m:e></m:groupChr>
 * 注意：mover 在 OMML 中通常用 groupChr 表示
 */
function convertOver(node: { base: MathASTNode[]; accent: MathASTNode[] }): string {
  const baseContent = convertNodesToOMML(node.base);
  const accentContent = convertNodesToOMML(node.accent);
  
  // 使用 groupChr 表示上标
  return `<m:groupChr><m:groupChrPr><m:pos m:val="top"/></m:groupChrPr><m:e>${baseContent}</m:e><m:chr><m:groupChrPr><m:pos m:val="top"/></m:groupChrPr>${accentContent}</m:chr></m:groupChr>`;
}

/**
 * 转换下标节点（munder）
 * OMML 模板: <m:groupChr><m:groupChrPr><m:pos m:val="bot"/></m:groupChrPr><m:e>...</m:e></m:groupChr>
 * 注意：对于 lim 等运算符，base 必须在 <m:e> 中
 */
function convertUnder(node: { base: MathASTNode[]; accent: MathASTNode[] }): string {
  const baseContent = convertNodesToOMML(node.base);
  const accentContent = convertNodesToOMML(node.accent);
  
  // 如果 base 为空，创建一个占位符
  if (!baseContent) {
    return `<m:groupChr><m:groupChrPr><m:pos m:val="bot"/></m:groupChrPr><m:e><m:r><m:t></m:t></m:r></m:e><m:chr><m:groupChrPr><m:pos m:val="bot"/></m:groupChrPr>${accentContent}</m:chr></m:groupChr>`;
  }
  
  // 使用 groupChr 表示下标
  return `<m:groupChr><m:groupChrPr><m:pos m:val="bot"/></m:groupChrPr><m:e>${baseContent}</m:e><m:chr><m:groupChrPr><m:pos m:val="bot"/></m:groupChrPr>${accentContent}</m:chr></m:groupChr>`;
}

/**
 * 转换上下标节点（munderover）
 * OMML 模板: 对于求和、积分等运算符，使用 <m:nary>；对于其他情况，使用 groupChr
 */
function convertUnderOver(node: { base: MathASTNode[]; under: MathASTNode[]; over: MathASTNode[] }): string {
  const baseContent = convertNodesToOMML(node.base);
  const underContent = convertNodesToOMML(node.under);
  const overContent = convertNodesToOMML(node.over);
  
  // 检查 base 是否是积分或求和运算符
  const isIntegralOrSum = node.base.length === 1 && 
    node.base[0].type === 'Operator' && 
    ((node.base[0] as any).operator === '∫' || (node.base[0] as any).operator === '∑');
  
  if (isIntegralOrSum) {
    // 使用 <m:nary> 表示积分或求和
    const operatorNode = node.base[0] as any;
    const operator = operatorNode.operator;
    const operatorChar = escapeXmlAttribute(operator);
    // 注意：<m:e> 的内容应该在更高层级处理，这里先留空
    return `<m:nary><m:naryPr><m:chr m:val="${operatorChar}"/></m:naryPr><m:sub>${underContent}</m:sub><m:sup>${overContent}</m:sup><m:e></m:e></m:nary>`;
  }
  
  // 对于其他情况，使用嵌套的 groupChr 表示上下标
  // 注意：base 必须在 <m:e> 中
  if (!baseContent) {
    // 如果 base 为空，创建一个占位符
    return `<m:groupChr><m:groupChrPr><m:pos m:val="top"/></m:groupChrPr><m:e><m:groupChr><m:groupChrPr><m:pos m:val="bot"/></m:groupChrPr><m:e><m:r><m:t></m:t></m:r></m:e><m:chr><m:groupChrPr><m:pos m:val="bot"/></m:groupChrPr>${underContent}</m:chr></m:groupChr></m:e><m:chr><m:groupChrPr><m:pos m:val="top"/></m:groupChrPr>${overContent}</m:chr></m:groupChr>`;
  }
  
  return `<m:groupChr><m:groupChrPr><m:pos m:val="top"/></m:groupChrPr><m:e><m:groupChr><m:groupChrPr><m:pos m:val="bot"/></m:groupChrPr><m:e>${baseContent}</m:e><m:chr><m:groupChrPr><m:pos m:val="bot"/></m:groupChrPr>${underContent}</m:chr></m:groupChr></m:e><m:chr><m:groupChrPr><m:pos m:val="top"/></m:groupChrPr>${overContent}</m:chr></m:groupChr>`;
}

/**
 * 转换分隔符节点（括号等）
 * OMML 模板: <m:d><m:dPr><m:begChr m:val="..."/><m:endChr m:val="..."/></m:dPr><m:e>...</m:e></m:d>
 * 硬规则：fence 必须用 <m:d>
 */
function convertDelimiter(node: { open: string; close: string; content: MathASTNode[] }): string {
  const content = convertNodesToOMML(node.content);
  
  // 转义括号字符
  const openChar = escapeXmlAttribute(node.open);
  const closeChar = escapeXmlAttribute(node.close);
  
  return `<m:d><m:dPr><m:begChr m:val="${openChar}"/><m:endChr m:val="${closeChar}"/></m:dPr><m:e>${content}</m:e></m:d>`;
}

/**
 * 转换矩阵节点
 * OMML 模板: <m:m><m:mPr>...</m:mPr><m:mr>...</m:mr>...</m:m>
 * 硬规则：matrix 必须 <m:m> + <m:mr>
 */
function convertMatrix(node: { rows: MathASTNode[][] }): string {
  const matrixRows = node.rows.map(row => {
    // 每个单元格转换为 <m:e>（表达式）
    // 注意：row 是 MathASTNode[]，每个元素是一个单元格
    const cells = row.map(cell => {
      // cell 本身就是一个 MathASTNode，直接转换
      const cellContent = convertNode(cell);
      return `<m:e>${cellContent}</m:e>`;
    }).join('');
    // 使用 <m:mr> 而不是 <m:tr>
    return `<m:mr>${cells}</m:mr>`;
  }).join('');
  
  return `<m:m><m:mPr></m:mPr>${matrixRows}</m:m>`;
}

/**
 * 转换运算符节点
 * 硬规则：运算符不能当普通字符
 * 对于常见运算符，使用 OMML 的运算符结构
 */
function convertOperator(node: { operator: string }): string {
  const operator = node.operator.trim();
  
  // 常见运算符映射到 OMML 结构
  // 对于简单运算符，使用 <m:r><m:t>，但确保每个字符单独处理
  // 注意：某些运算符可能需要特殊处理，这里先实现基础版本
  
  // 将运算符的每个字符拆分成单独的 <m:r><m:t>
  // 硬规则：一个 <m:t> 不能包含多个数学 token
  return splitToSingleCharRuns(operator);
}

/**
 * 转换文本节点
 * 硬规则：一个 <m:t> 不能包含多个数学 token
 * 需要将每个字符拆分成单独的 <m:r><m:t>char</m:t></m:r>
 */
function convertText(node: { text: string }): string {
  const text = node.text;
  
  // 硬规则：一个 <m:t> 不能包含多个数学 token
  // 将每个字符拆分成单独的 run
  return splitToSingleCharRuns(text);
}

/**
 * 转换行节点
 */
function convertRow(node: { children: MathASTNode[] }): string {
  return convertNodesToOMML(node.children);
}

/**
 * 将多个 AST 节点转换为 OMML（内部辅助函数）
 */
function convertNodesToOMML(nodes: MathASTNode[]): string {
  return nodes.map(node => convertNode(node)).join('');
}

/**
 * 将字符串拆分为单个字符的 <m:r><m:t> 结构
 * 硬规则：一个 <m:t> 不能包含多个数学 token
 * 
 * @param text 要拆分的文本
 * @returns OMML 字符串，每个字符在单独的 <m:r><m:t> 中
 */
function splitToSingleCharRuns(text: string): string {
  if (!text) {
    return '';
  }
  
  // 将每个字符拆分成单独的 <m:r><m:t>char</m:t></m:r>
  // 注意：即使是空格、标点等，也要单独处理
  const chars = Array.from(text);
  
  return chars.map(char => {
    const escapedChar = escapeXml(char);
    return `<m:r><m:t>${escapedChar}</m:t></m:r>`;
  }).join('');
}

/**
 * 转义 XML 属性值中的特殊字符
 */
function escapeXmlAttribute(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * 转义 XML 文本内容中的特殊字符
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

