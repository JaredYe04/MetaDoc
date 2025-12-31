/**
 * MathML 规范化器
 * 
 * 第一层：解析 & Normalize
 * - 展平嵌套 <mrow>
 * - 拆 <m:t>abc</m:t> → a b c
 * - 识别 fence（( ) [ ] ‖ ⟨ ⟩）
 * - 删除 MathJax 私有节点（MJX-TeXAtom-*）
 */

import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

/**
 * 规范化后的 MathML 结构
 */
export interface NormalizedMathML {
  root: Element;
  xml: string;
}

/**
 * 规范化 MathML
 * 
 * @param mathml 原始 MathML 字符串
 * @returns 规范化后的 MathML
 */
export function normalizeMathML(mathml: string): NormalizedMathML {
  // 解析 MathML
  const parser = new DOMParser({
    errorHandler: {
      warning: () => {},
      error: () => {},
      fatalError: () => {},
    },
  });
  
  // 包装在根元素中以便解析
  const wrappedMathML = `<math xmlns="http://www.w3.org/1998/Math/MathML">${mathml}</math>`;
  const doc = parser.parseFromString(wrappedMathML, 'text/xml');
  
  // 检查解析错误
  const parseError = doc.getElementsByTagName('parsererror');
  if (parseError.length > 0) {
    throw new Error(`MathML 解析失败: ${parseError[0].textContent}`);
  }
  
  const mathElement = doc.documentElement;
  if (!mathElement || mathElement.tagName !== 'math') {
    throw new Error('无法找到 MathML 根元素');
  }
  
  // 规范化处理
  normalizeElement(mathElement);
  
  // 序列化回字符串
  const serializer = new XMLSerializer();
  const normalizedXml = serializer.serializeToString(mathElement);
  
  return {
    root: mathElement,
    xml: normalizedXml,
  };
}

/**
 * 规范化单个元素及其子元素
 */
function normalizeElement(element: Element): void {
  const tagName = getLocalName(element);
  
  // 对于 <munder>、<mover>、<munderover>、<msubsup> 等结构，需要特殊处理
  // 这些结构的 base（第一个子元素）不应该被拆分
  const isSpecialStructure = tagName === 'munder' || tagName === 'mover' || 
                              tagName === 'munderover' || tagName === 'msubsup';
  
  // 1. 删除 MathJax 私有节点
  removeMathJaxPrivateNodes(element);
  
  // 2. 展平嵌套 <mrow>
  flattenMrow(element);
  
  if (isSpecialStructure) {
    // 对于特殊结构，base 不拆分，但需要规范化其内容
    const elementChildren = Array.from(element.childNodes).filter(
      n => n.nodeType === 1
    ) as Element[];
    
    if (elementChildren.length > 0) {
      // 第一个子元素（base）不拆分，但需要规范化其内容
      const baseElement = elementChildren[0];
      normalizeElement(baseElement); // 递归规范化 base 的内容
      
      // 其他子元素（accent）正常处理
      for (let i = 1; i < elementChildren.length; i++) {
        normalizeElement(elementChildren[i]);
      }
    }
  } else {
    // 3. 拆分 <m:t> 中的多个字符（非特殊结构）
    splitTextNodes(element);
    
    // 递归处理子元素
    const children = Array.from(element.childNodes);
    for (const child of children) {
      if (child.nodeType === 1) { // ELEMENT_NODE
        normalizeElement(child as Element);
      }
    }
  }
  
  // 4. 识别并标记 fence
  identifyFences(element);
}

/**
 * 删除 MathJax 私有节点（MJX-TeXAtom-*）
 */
function removeMathJaxPrivateNodes(element: Element): void {
  const children = Array.from(element.childNodes);
  for (const child of children) {
    if (child.nodeType === 1) {
      const childElement = child as Element;
      const className = childElement.getAttribute('class') || '';
      
      // 删除 MathJax 私有节点
      if (className.includes('MJX-TeXAtom-')) {
        // 将子节点提升到父节点
        const grandChildren = Array.from(childElement.childNodes);
        const parent = childElement.parentNode;
        if (parent) {
          for (const grandChild of grandChildren) {
            parent.insertBefore(grandChild.cloneNode(true), childElement);
          }
          parent.removeChild(childElement);
        }
      } else {
        // 递归处理子元素
        removeMathJaxPrivateNodes(childElement);
      }
    }
  }
}

/**
 * 展平嵌套 <mrow>
 * 将嵌套的 <mrow> 展平，只保留必要的层级
 */
function flattenMrow(element: Element): void {
  const children = Array.from(element.childNodes);
  for (const child of children) {
    if (child.nodeType === 1) {
      const childElement = child as Element;
      const tagName = getLocalName(childElement);
      
      if (tagName === 'mrow') {
        // 检查这个 mrow 是否只有一个子元素且也是 mrow
        const childChildren = Array.from(childElement.childNodes).filter(
          n => n.nodeType === 1
        ) as Element[];
        
        if (childChildren.length === 1 && getLocalName(childChildren[0]) === 'mrow') {
          // 展平：用内部 mrow 替换外部 mrow
          const innerMrow = childChildren[0];
          const parent = childElement.parentNode;
          if (parent) {
            // 复制内部 mrow 的所有子节点
            const innerChildren = Array.from(innerMrow.childNodes);
            for (const innerChild of innerChildren) {
              parent.insertBefore(innerChild.cloneNode(true), childElement);
            }
            parent.removeChild(childElement);
          }
        } else {
          // 递归处理子元素
          flattenMrow(childElement);
        }
      } else {
        // 递归处理子元素
        flattenMrow(childElement);
      }
    }
  }
}

/**
 * 拆分 <m:t> 中的多个字符
 * 将 <m:t>abc</m:t> 拆分为 <m:t>a</m:t><m:t>b</m:t><m:t>c</m:t>
 * 注意：对于 <munder>、<mover>、<munderover>、<msubsup> 等结构的 base，不应该拆分
 */
function splitTextNodes(element: Element): void {
  const children = Array.from(element.childNodes);
  for (const child of children) {
    if (child.nodeType === 1) {
      const childElement = child as Element;
      const tagName = getLocalName(childElement);
      
      // 对于 <munder>、<mover>、<munderover>、<msubsup> 等结构，不拆分第一个子元素（base）
      // 这些结构的第一个子元素应该保持完整
      const isSpecialStructure = tagName === 'munder' || tagName === 'mover' || 
                                  tagName === 'munderover' || tagName === 'msubsup';
      
      if (isSpecialStructure) {
        // 对于这些特殊结构，只拆分 accent 部分，不拆分 base
        const elementChildren = Array.from(childElement.childNodes).filter(
          n => n.nodeType === 1
        ) as Element[];
        
        if (elementChildren.length > 0) {
          // 第一个子元素（base）不拆分，直接递归处理其内容
          const baseElement = elementChildren[0];
          // 递归处理 base 的内容（但不拆分 base 本身）
          splitTextNodesInElement(baseElement, false); // false 表示不拆分
          
          // 其他子元素（accent）正常拆分
          for (let i = 1; i < elementChildren.length; i++) {
            splitTextNodes(elementChildren[i]);
          }
        }
      } else if (tagName === 'mtext' || tagName === 'mi' || tagName === 'mn' || tagName === 'mo') {
        // 查找文本内容
        const textNodes = Array.from(childElement.childNodes).filter(
          n => n.nodeType === 3 // TEXT_NODE
        ) as Text[];
        
        if (textNodes.length > 0) {
          const textContent = textNodes.map(n => n.nodeValue || '').join('');
          
          // 如果文本长度大于 1，需要拆分
          if (textContent.length > 1) {
            const parent = childElement.parentNode;
            if (parent) {
              // 为每个字符创建新的元素
              for (let i = 0; i < textContent.length; i++) {
                const char = textContent[i];
                const newElement = childElement.cloneNode(false) as Element;
                newElement.textContent = char;
                parent.insertBefore(newElement, childElement);
              }
              parent.removeChild(childElement);
            }
          }
        }
      } else {
        // 递归处理子元素
        splitTextNodes(childElement);
      }
    }
  }
}

/**
 * 在元素内部拆分文本节点（但不拆分元素本身）
 */
function splitTextNodesInElement(element: Element, shouldSplit: boolean): void {
  const children = Array.from(element.childNodes);
  for (const child of children) {
    if (child.nodeType === 1) {
      const childElement = child as Element;
      const tagName = getLocalName(childElement);
      
      if (tagName === 'mtext' || tagName === 'mi' || tagName === 'mn' || tagName === 'mo') {
        if (shouldSplit) {
          // 查找文本内容并拆分
          const textNodes = Array.from(childElement.childNodes).filter(
            n => n.nodeType === 3 // TEXT_NODE
          ) as Text[];
          
          if (textNodes.length > 0) {
            const textContent = textNodes.map(n => n.nodeValue || '').join('');
            
            // 如果文本长度大于 1，需要拆分
            if (textContent.length > 1) {
              const parent = childElement.parentNode;
              if (parent) {
                // 为每个字符创建新的元素
                for (let i = 0; i < textContent.length; i++) {
                  const char = textContent[i];
                  const newElement = childElement.cloneNode(false) as Element;
                  newElement.textContent = char;
                  parent.insertBefore(newElement, childElement);
                }
                parent.removeChild(childElement);
              }
            }
          }
        }
        // 如果不拆分，保持原样
      } else {
        // 递归处理子元素
        splitTextNodesInElement(childElement, shouldSplit);
      }
    }
  }
}

/**
 * 识别并标记 fence（括号、分隔符等）
 * Fence 包括：( ) [ ] { } ‖ ⟨ ⟩ | | 等
 */
function identifyFences(element: Element): void {
  const children = Array.from(element.childNodes);
  for (const child of children) {
    if (child.nodeType === 1) {
      const childElement = child as Element;
      const tagName = getLocalName(childElement);
      
      if (tagName === 'mo') {
        const textContent = childElement.textContent?.trim() || '';
        
        // 定义 fence 字符
        const fences = new Set([
          '(', ')', '[', ']', '{', '}', 
          '‖', '⟨', '⟩', '|', '|',
          '⌊', '⌋', '⌈', '⌉',  // 上下取整
          '⎛', '⎞', '⎝', '⎠',  // 大括号变体
        ]);
        
        if (fences.has(textContent)) {
          // 标记为 fence
          childElement.setAttribute('data-fence', 'true');
          childElement.setAttribute('data-fence-char', textContent);
        }
      }
      
      // 递归处理子元素
      identifyFences(childElement);
    }
  }
}

/**
 * 获取元素的本地名称（忽略命名空间）
 */
function getLocalName(element: Element): string {
  return element.localName || element.tagName.split(':').pop() || element.tagName;
}

