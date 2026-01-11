import type { DocumentOutlineNode } from '../../../types';
import { generateMarkdownFromOutlineTree, extractOutlineTreeFromMarkdown } from './md-utils';
import {
  extractOutlineTreeFromLatex,
  generateLatexFromOutlineTree,
} from './latex-utils';

export type OutlineTextAdapterFormat = 'md' | 'tex' | string;

export interface OutlineTextAdapter {
  toText(outline: DocumentOutlineNode, existingText?: string): Promise<string>;
  fromText(text: string): DocumentOutlineNode;
}

class MarkdownOutlineAdapter implements OutlineTextAdapter {
  async toText(outline: DocumentOutlineNode): Promise<string> {
    return Promise.resolve(generateMarkdownFromOutlineTree(outline));
  }
  fromText(text: string): DocumentOutlineNode {
    // 完整从 Markdown 提取多层级大纲（包含文本映射）
    return extractOutlineTreeFromMarkdown(text);
  }
}

function splitLatexPreambleAndBody(tex: string): { preamble: string; body: string; postamble: string } {
  if (!tex) return { preamble: '', body: '', postamble: '' };
  const beginDoc = '\\begin{document}';
  const endDoc = '\\end{document}';
  const startIdx = tex.indexOf(beginDoc);
  const endIdx = tex.lastIndexOf(endDoc);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    return { preamble: tex, body: '', postamble: '' };
  }
  const preamble = tex.slice(0, startIdx);
  const body = tex.slice(startIdx + beginDoc.length, endIdx);
  const postamble = tex.slice(endIdx + endDoc.length);
  return { preamble, body, postamble };
}

class LatexOutlineAdapter implements OutlineTextAdapter {
  async toText(outline: DocumentOutlineNode, existingText?: string): Promise<string> {
    // 生成新的正文内容
    const generated = await generateLatexFromOutlineTree(outline);
    // 优先从 outline.extras 读取 preamble/postamble 以保持稳定
    const extras = outline?.extras?.latex as { preamble?: string; postamble?: string } | undefined;
    const preferPreamble = extras?.preamble;
    const preferPostamble = extras?.postamble;
    const source = existingText || '';
    const { preamble: preFromSrc, postamble: postFromSrc } = splitLatexPreambleAndBody(source);
    const { body } = splitLatexPreambleAndBody(generated);
    const preamble = typeof preferPreamble === 'string' ? preferPreamble : preFromSrc;
    const postamble = typeof preferPostamble === 'string' ? preferPostamble : postFromSrc;
    const beginDoc = '\\begin{document}';
    const endDoc = '\\end{document}';
    return `${preamble}${beginDoc}${body}${endDoc}${postamble}`;
  }
  fromText(text: string): DocumentOutlineNode {
    // 拆分以提取 preamble/postamble
    const { preamble, postamble } = splitLatexPreambleAndBody(text);
    // 从 LaTeX 提取大纲（内部先转 Markdown 再抽取）
    const outline = extractOutlineTreeFromLatex(text, true) as unknown as DocumentOutlineNode;
    // 在根节点 extras 上保存 LaTeX 额外信息，确保往返不丢失
    outline.extras = outline.extras || {};
    (outline.extras as any).latex = { preamble, postamble };
    return outline;
  }
}

export function getOutlineAdapter(format: OutlineTextAdapterFormat): OutlineTextAdapter {
  if (format === 'tex') return new LatexOutlineAdapter();
  // 默认使用Markdown适配器（包括'md'和其他格式）
  return new MarkdownOutlineAdapter();
}


