/**
 * MathML 到数学 AST 解析器
 * 
 * 第二层：MathML → 数学 AST
 * 
 * 支持的 MathML 元素到 AST 节点的映射：
 * - <mfrac> → Fraction
 * - <msqrt> → Sqrt
 * - <msup> → Power
 * - <msub> → Subscript
 * - fence <mo> → Delimiter
 * - <mtable> → Matrix
 * - <mo>+</mo> → Operator
 */

import { Element, Node } from '@xmldom/xmldom';

/**
 * 数学 AST 节点类型
 */
export type MathASTNode =
  | FractionNode
  | SqrtNode
  | PowerNode
  | SubscriptNode
  | DelimiterNode
  | MatrixNode
  | OperatorNode
  | TextNode
  | RowNode
  | OverNode
  | UnderNode
  | UnderOverNode
  | SubSupNode
  | RootNode;

/**
 * AST 根节点
 */
export interface RootNode {
  type: 'Root';
  children: MathASTNode[];
}

/**
 * 分数节点
 */
export interface FractionNode {
  type: 'Fraction';
  numerator: MathASTNode[];
  denominator: MathASTNode[];
}

/**
 * 根号节点
 */
export interface SqrtNode {
  type: 'Sqrt';
  radicand: MathASTNode[];
  index?: MathASTNode[]; // 可选，用于 n 次根
}

/**
 * 幂节点
 */
export interface PowerNode {
  type: 'Power';
  base: MathASTNode[];
  exponent: MathASTNode[];
}

/**
 * 下标节点
 */
export interface SubscriptNode {
  type: 'Subscript';
  base: MathASTNode[];
  subscript: MathASTNode[];
}

/**
 * 分隔符节点（括号、大括号等）
 */
export interface DelimiterNode {
  type: 'Delimiter';
  open: string; // 开括号字符
  close: string; // 闭括号字符
  content: MathASTNode[];
}

/**
 * 矩阵节点
 */
export interface MatrixNode {
  type: 'Matrix';
  rows: MathASTNode[][]; // 矩阵的行，每行是一个节点数组
}

/**
 * 运算符节点
 */
export interface OperatorNode {
  type: 'Operator';
  operator: string; // 运算符字符，如 +, -, ×, ÷, =, <, > 等
}

/**
 * 文本节点
 */
export interface TextNode {
  type: 'Text';
  text: string;
}

/**
 * 行节点（mrow 或隐式行）
 */
export interface RowNode {
  type: 'Row';
  children: MathASTNode[];
}

/**
 * 上标节点（mover）
 */
export interface OverNode {
  type: 'Over';
  base: MathASTNode[];
  accent: MathASTNode[];
}

/**
 * 下标节点（munder）
 */
export interface UnderNode {
  type: 'Under';
  base: MathASTNode[];
  accent: MathASTNode[];
}

/**
 * 上下标节点（munderover）
 */
export interface UnderOverNode {
  type: 'UnderOver';
  base: MathASTNode[];
  under: MathASTNode[];
  over: MathASTNode[];
}

/**
 * 上下标组合节点（msubsup）
 */
export interface SubSupNode {
  type: 'SubSup';
  base: MathASTNode[];
  subscript: MathASTNode[];
  superscript: MathASTNode[];
}

/**
 * 数学 AST
 */
export interface MathAST {
  root: RootNode;
}

/**
 * 将规范化后的 MathML 解析为数学 AST
 * 
 * @param normalized 规范化后的 MathML
 * @returns 数学 AST
 */
export function parseToAST(normalized: { root: Element }): MathAST {
  const rootElement = normalized.root;
  
  // 解析根元素的子节点
  const children = parseChildren(rootElement);
  
  // 在顶层处理 Delimiter 配对
  const pairedChildren = pairDelimiters(children);
  
  // 解析根元素
  const rootNode: RootNode = {
    type: 'Root',
    children: pairedChildren,
  };
  
  return {
    root: rootNode,
  };
}

/**
 * 解析元素的子节点
 * 支持识别和配对 Delimiter（括号）
 * 注意：如果元素只有文本内容（没有子元素），需要特殊处理
 */
function parseChildren(element: Element): MathASTNode[] {
  const childNodes = Array.from(element.childNodes);
  const nodes: (MathASTNode | null)[] = [];
  
  // 检查是否有子元素节点
  const elementChildren = childNodes.filter(n => n.nodeType === 1) as Element[];
  const textNodes = childNodes.filter(n => n.nodeType === 3) as Text[];
  
  // 如果有子元素，解析所有子元素
  if (elementChildren.length > 0) {
    for (const childElement of elementChildren) {
      const node = parseElement(childElement);
      nodes.push(node);
    }
  } else if (textNodes.length > 0) {
    // 只有文本节点，没有子元素，直接解析当前元素
    // 这种情况出现在 <mo>∫</mo>、<mi>x</mi> 等只有文本内容的元素
    const node = parseElement(element);
    if (node) {
      return [node];
    }
  }
  
  // 过滤掉 null 节点
  const validNodes = nodes.filter((n): n is MathASTNode => n !== null);
  
  return validNodes;
}

/**
 * 配对 Delimiter（括号）
 * 识别配对的括号并创建 Delimiter 节点
 */
function pairDelimiters(nodes: MathASTNode[]): MathASTNode[] {
  const result: MathASTNode[] = [];
  const fenceStack: Array<{ index: number; char: string; isOpen: boolean }> = [];
  const fencePairs: Array<{ openIndex: number; closeIndex: number; openChar: string; closeChar: string }> = [];
  
  // 第一遍：识别所有 fence 字符
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.type === 'Operator') {
      const char = node.operator;
      const isOpen = isOpenFence(char);
      const isClose = isCloseFence(char);
      
      if (isOpen) {
        fenceStack.push({ index: i, char, isOpen: true });
      } else if (isClose && fenceStack.length > 0) {
        // 查找匹配的开括号
        let matched = false;
        for (let j = fenceStack.length - 1; j >= 0; j--) {
          const openFence = fenceStack[j];
          if (arePairedFences(openFence.char, char)) {
            fencePairs.push({
              openIndex: openFence.index,
              closeIndex: i,
              openChar: openFence.char,
              closeChar: char,
            });
            fenceStack.splice(j, 1);
            matched = true;
            break;
          }
        }
        if (!matched) {
          // 未匹配的闭括号，保持为 Operator
        }
      }
    }
  }
  
  // 第二遍：构建结果，将配对的括号转换为 Delimiter
  const usedIndices = new Set<number>();
  for (const pair of fencePairs) {
    if (usedIndices.has(pair.openIndex) || usedIndices.has(pair.closeIndex)) {
      continue; // 已经被使用
    }
    
    // 提取括号之间的内容
    const content: MathASTNode[] = [];
    for (let i = pair.openIndex + 1; i < pair.closeIndex; i++) {
      if (!usedIndices.has(i)) {
        content.push(nodes[i]);
        usedIndices.add(i);
      }
    }
    
    // 创建 Delimiter 节点
    result.push({
      type: 'Delimiter',
      open: pair.openChar,
      close: pair.closeChar,
      content,
    });
    
    usedIndices.add(pair.openIndex);
    usedIndices.add(pair.closeIndex);
  }
  
  // 添加未使用的节点
  for (let i = 0; i < nodes.length; i++) {
    if (!usedIndices.has(i)) {
      result.push(nodes[i]);
    }
  }
  
  return result;
}

/**
 * 判断是否是开括号
 */
function isOpenFence(char: string): boolean {
  const openFences = ['(', '[', '{', '⟨', '⌊', '⌈', '⎛', '⎝'];
  return openFences.includes(char);
}

/**
 * 判断是否是闭括号
 */
function isCloseFence(char: string): boolean {
  const closeFences = [')', ']', '}', '⟩', '⌋', '⌉', '⎞', '⎠'];
  return closeFences.includes(char);
}

/**
 * 判断两个括号是否配对
 */
function arePairedFences(open: string, close: string): boolean {
  const pairs: Record<string, string> = {
    '(': ')',
    '[': ']',
    '{': '}',
    '⟨': '⟩',
    '⌊': '⌋',
    '⌈': '⌉',
    '⎛': '⎞',
    '⎝': '⎠',
  };
  return pairs[open] === close;
}

/**
 * 解析单个 MathML 元素
 */
function parseElement(element: Element): MathASTNode | null {
  const tagName = getLocalName(element);
  
  try {
    switch (tagName) {
      case 'mfrac':
        return parseFraction(element);
      case 'msqrt':
        return parseSqrt(element);
      case 'mroot':
        return parseRoot(element);
      case 'msup':
        return parsePower(element);
      case 'msub':
        return parseSubscript(element);
      case 'msubsup':
        return parseSubSup(element);
      case 'mover':
        return parseOver(element);
      case 'munder':
        return parseUnder(element);
      case 'munderover':
        return parseUnderOver(element);
      case 'mtable':
        return parseMatrix(element);
      case 'mo':
        return parseOperator(element);
      case 'mi':
      case 'mn':
      case 'mtext':
        return parseText(element);
      case 'mrow':
        return parseRow(element);
      case 'mspace':
      case 'mphantom':
        // 忽略空白和占位符
        return null;
      default:
        // 未知元素，尝试作为行处理
        return parseRow(element);
    }
  } catch (error) {
    // 错误处理：如果解析失败，尝试作为行处理
    console.warn(`解析 MathML 元素 ${tagName} 失败:`, error);
    return parseRow(element);
  }
}

/**
 * 解析分数 <mfrac>
 */
function parseFraction(element: Element): FractionNode {
  const children = Array.from(element.childNodes).filter(
    n => n.nodeType === 1
  ) as Element[];
  
  if (children.length < 2) {
    throw new Error('<mfrac> 需要至少两个子元素');
  }
  
  return {
    type: 'Fraction',
    numerator: parseChildren(children[0]),
    denominator: parseChildren(children[1]),
  };
}

/**
 * 解析平方根 <msqrt>
 */
function parseSqrt(element: Element): SqrtNode {
  return {
    type: 'Sqrt',
    radicand: parseChildren(element),
  };
}

/**
 * 解析 n 次根 <mroot>
 */
function parseRoot(element: Element): SqrtNode {
  const children = Array.from(element.childNodes).filter(
    n => n.nodeType === 1
  ) as Element[];
  
  if (children.length < 2) {
    throw new Error('<mroot> 需要至少两个子元素');
  }
  
  return {
    type: 'Sqrt',
    radicand: parseChildren(children[0]),
    index: parseChildren(children[1]),
  };
}

/**
 * 解析幂 <msup>
 */
function parsePower(element: Element): PowerNode {
  const children = Array.from(element.childNodes).filter(
    n => n.nodeType === 1
  ) as Element[];
  
  if (children.length < 2) {
    throw new Error('<msup> 需要至少两个子元素');
  }
  
  return {
    type: 'Power',
    base: parseChildren(children[0]),
    exponent: parseChildren(children[1]),
  };
}

/**
 * 解析下标 <msub>
 */
function parseSubscript(element: Element): SubscriptNode {
  const children = Array.from(element.childNodes).filter(
    n => n.nodeType === 1
  ) as Element[];
  
  if (children.length < 2) {
    throw new Error('<msub> 需要至少两个子元素');
  }
  
  return {
    type: 'Subscript',
    base: parseChildren(children[0]),
    subscript: parseChildren(children[1]),
  };
}

/**
 * 解析矩阵 <mtable>
 */
function parseMatrix(element: Element): MatrixNode {
  // <mtable> 包含 <mtr> (行)，<mtr> 包含 <mtd> (单元格)
  const rows: MathASTNode[][] = [];
  const tableChildren = Array.from(element.childNodes).filter(
    n => n.nodeType === 1 && getLocalName(n as Element) === 'mtr'
  ) as Element[];
  
  for (const rowElement of tableChildren) {
    const cells: MathASTNode[] = [];
    const cellElements = Array.from(rowElement.childNodes).filter(
      n => n.nodeType === 1 && getLocalName(n as Element) === 'mtd'
    ) as Element[];
    
    for (const cellElement of cellElements) {
      // 每个单元格的内容解析为一个 Row 节点（包含单元格内的所有节点）
      const cellContent = parseChildren(cellElement);
      if (cellContent.length === 0) {
        // 空单元格，创建一个空的 Text 节点
        cells.push({ type: 'Text', text: '' });
      } else if (cellContent.length === 1) {
        // 单个节点，直接使用
        cells.push(cellContent[0]);
      } else {
        // 多个节点，包装为 Row
        cells.push({
          type: 'Row',
          children: cellContent,
        });
      }
    }
    
    rows.push(cells);
  }
  
  return {
    type: 'Matrix',
    rows,
  };
}

/**
 * 解析运算符 <mo>
 */
function parseOperator(element: Element): OperatorNode | null {
  const textContent = element.textContent?.trim() || '';
  
  // 注意：Delimiter 的配对在 parseChildren 中处理
  // 这里只返回 Operator 节点
  
  if (textContent) {
    return {
      type: 'Operator',
      operator: textContent,
    };
  }
  
  return null;
}

/**
 * 解析上标 <mover>
 */
function parseOver(element: Element): OverNode {
  const children = Array.from(element.childNodes).filter(
    n => n.nodeType === 1
  ) as Element[];
  
  if (children.length < 2) {
    throw new Error('<mover> 需要至少两个子元素');
  }
  
  // base 是第一个子元素，需要解析它（可能包含子元素，也可能只有文本）
  const baseNode = parseElement(children[0]);
  const base = baseNode ? [baseNode] : [];
  
  // accent 是第二个子元素
  const accent = parseChildren(children[1]);
  
  return {
    type: 'Over',
    base,
    accent,
  };
}

/**
 * 解析下标 <munder>
 */
function parseUnder(element: Element): UnderNode {
  const children = Array.from(element.childNodes).filter(
    n => n.nodeType === 1
  ) as Element[];
  
  if (children.length < 2) {
    throw new Error('<munder> 需要至少两个子元素');
  }
  
  // base 是第一个子元素，需要解析它（可能包含子元素，也可能只有文本）
  const baseNode = parseElement(children[0]);
  const base = baseNode ? [baseNode] : [];
  
  // accent 是第二个子元素
  const accent = parseChildren(children[1]);
  
  return {
    type: 'Under',
    base,
    accent,
  };
}

/**
 * 解析上下标 <munderover>
 */
function parseUnderOver(element: Element): UnderOverNode {
  const children = Array.from(element.childNodes).filter(
    n => n.nodeType === 1
  ) as Element[];
  
  if (children.length < 3) {
    throw new Error('<munderover> 需要至少三个子元素');
  }
  
  // base 是第一个子元素，需要解析它（可能包含子元素，也可能只有文本）
  const baseNode = parseElement(children[0]);
  const base = baseNode ? [baseNode] : [];
  
  // under 是第二个子元素
  const under = parseChildren(children[1]);
  
  // over 是第三个子元素
  const over = parseChildren(children[2]);
  
  return {
    type: 'UnderOver',
    base,
    under,
    over,
  };
}

/**
 * 解析上下标组合 <msubsup>
 */
function parseSubSup(element: Element): SubSupNode {
  const children = Array.from(element.childNodes).filter(
    n => n.nodeType === 1
  ) as Element[];
  
  if (children.length < 3) {
    throw new Error('<msubsup> 需要至少三个子元素');
  }
  
  // base 是第一个子元素，需要解析它（可能包含子元素，也可能只有文本）
  const baseNode = parseElement(children[0]);
  const base = baseNode ? [baseNode] : [];
  
  // subscript 是第二个子元素
  const subscript = parseChildren(children[1]);
  
  // superscript 是第三个子元素
  const superscript = parseChildren(children[2]);
  
  return {
    type: 'SubSup',
    base,
    subscript,
    superscript,
  };
}

/**
 * 获取配对的括号字符
 */
function getPairedFence(char: string): string {
  const pairs: Record<string, string> = {
    '(': ')',
    ')': '(',
    '[': ']',
    ']': '[',
    '{': '}',
    '}': '{',
    '⟨': '⟩',
    '⟩': '⟨',
    '⌊': '⌋',
    '⌋': '⌊',
    '⌈': '⌉',
    '⌉': '⌈',
    '⎛': '⎞',
    '⎞': '⎛',
    '⎝': '⎠',
    '⎠': '⎝',
    '|': '|',
    '‖': '‖',
  };
  
  return pairs[char] || char;
}

/**
 * 解析文本元素 <mi>, <mn>, <mtext>
 */
function parseText(element: Element): TextNode {
  const textContent = element.textContent?.trim() || '';
  return {
    type: 'Text',
    text: textContent,
  };
}

/**
 * 解析行 <mrow>
 */
function parseRow(element: Element): RowNode {
  return {
    type: 'Row',
    children: parseChildren(element),
  };
}

/**
 * 获取元素的本地名称（忽略命名空间）
 */
function getLocalName(element: Element): string {
  return element.localName || element.tagName.split(':').pop() || element.tagName;
}

