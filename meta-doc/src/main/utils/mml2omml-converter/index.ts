/**
 * MathML 到 OMML 转换器
 * 
 * 这是一个独立的模块，用于将 MathML 转换为 OMML（Office Math Markup Language）
 * 设计为可独立使用，未来可能单独开源
 * 
 * @module mml2omml-converter
 */

import { DOMParser } from '@xmldom/xmldom';
import { normalizeMathML, NormalizedMathML } from './normalizer';
import { parseToAST, MathAST } from './parser';
import { convertASTToOMML } from './converter';

/**
 * 将 MathML 字符串转换为 OMML 字符串
 * 
 * @param mathml MathML 字符串
 * @returns OMML 字符串
 * @throws 如果转换失败
 */
export function convertMathMLToOMML(mathml: string): string {
  try {
    // 第一层：解析和规范化
    const normalized = normalizeMathML(mathml);
    
    // 第二层：转换为数学 AST
    const ast = parseToAST(normalized);
    
    // 第三层：AST 转换为 OMML
    const omml = convertASTToOMML(ast);
    
    return omml;
  } catch (error) {
    throw new Error(`MathML 到 OMML 转换失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// 导出类型供外部使用
export type { NormalizedMathML, MathAST };

