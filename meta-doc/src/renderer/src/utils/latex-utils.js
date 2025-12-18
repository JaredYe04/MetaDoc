import MarkdownIt from 'markdown-it';
import footnote from 'markdown-it-footnote';
import taskLists from 'markdown-it-task-lists';
import { extractOutlineTreeFromMarkdown, generateMarkdownFromOutlineTree } from './md-utils';

const md = new MarkdownIt({
    html: false,
    breaks: false,
    linkify: true,
})
    .use(footnote)
    .use(taskLists, { enabled: true });

// 数学公式占位处理：将 $...$ 与 $$...$$ 暂存，避免在后续转义中被破坏
// 占位符仅使用不会被 escapeLatex 处理的字符：字母与 @ : 数字，避免下划线等
function extractMathPlaceholders(source) {
    const placeholders = [];
    let text = source;

    // 先处理块级 $$...$$（可跨行）
    // 使用负向后顾断言避免匹配转义的 \$$
    text = text.replace(/(?<!\\)\$\$([\s\S]+?)(?<!\\)\$\$/g, (match, content) => {
        const index = placeholders.length;
        placeholders.push('$$' + content + '$$');
        return `@@MATHBLOCK:${index}@@`;
    });

    // 再处理内联 $...$（避免和 $$...$$ 冲突，且不跨行）
    // 使用负向后顾断言避免匹配转义的 \$，且行内公式不应该跨行
    // 注意：不要求 $ 前后不能有空格，只要不是转义的 $ 即可
    text = text.replace(/(?<!\\)\$(?!\$)([^\n$]+?)(?<!\\)\$/g, (match, content) => {
        const index = placeholders.length;
        placeholders.push('$' + content + '$');
        return `@@MATHINLINE:${index}@@`;
    });

    return { text, placeholders };
}

function restoreMathPlaceholders(text, placeholders) {
    if (!placeholders || placeholders.length === 0) return text;
    let result = text;
    // 恢复块级
    result = result.replace(/@@MATHBLOCK:(\d+)@@/g, (_, idx) => {
        const i = parseInt(idx, 10);
        return placeholders[i] ?? '';
    });
    // 恢复内联
    result = result.replace(/@@MATHINLINE:(\d+)@@/g, (_, idx) => {
        const i = parseInt(idx, 10);
        return placeholders[i] ?? '';
    });
    return result;
}

export async function convertMarkdownToLatex(markdown, title = 'Generated Document', options = {}) {
    // 选项：
    // - includePreamble: 是否包含完整的 LaTeX 文档结构（documentclass、package 等），默认 true
    // - documentClass: 文档类，默认 'article'
    const { 
        includePreamble = true, 
        documentClass = 'article' 
    } = options;
    
    // 处理引用格式：将 [[1](#ref-1)] 转换为 \cite{1}
    // 同时收集参考文献信息
    const bibliography = new Map();
    let processedMarkdown = markdown;
    
    // 提取参考文献列表：通过查找所有 <div id="ref-X"/> 锚点
    // 不依赖标题文本，因为不同语言可能有不同的标题（如 "References", "参考文献" 等）
    // 匹配格式：<div id="ref-X"/> 后跟 [数字] 和内容
    // 改进正则表达式：更灵活地匹配内容，直到下一个参考文献或标题
    // 使用更精确的匹配：确保能匹配到所有参考文献项
    // 注意：在非多行模式下，$ 匹配字符串结尾
    const refItemPattern = '<div id="ref-([^"]+)"\\s*/>\\s*\\n\\n\\[(\\d+)\\]\\s*([\\s\\S]*?)(?=\\n\\n<div id="ref-|\\n##|\\n#|$)';
    const refItemRegex = new RegExp(refItemPattern, 'gs');
    let refMatch;
    const refItemsToRemove = [];
    
    // 重置正则表达式的 lastIndex（确保从头开始匹配）
    refItemRegex.lastIndex = 0;
    // 查找所有参考文献项
    while ((refMatch = refItemRegex.exec(markdown)) !== null) {
        const refId = refMatch[1];
        const refNum = refMatch[2];
        const refContent = refMatch[3].trim();
        bibliography.set(refId, { num: refNum, content: refContent });
        // 记录需要移除的内容（包括锚点和参考文献内容）
        refItemsToRemove.push({
            fullMatch: refMatch[0],
            startIndex: refMatch.index,
            endIndex: refMatch.index + refMatch[0].length
        });
    }
    
    // 移除所有参考文献项（从后往前移除，避免索引偏移）
    refItemsToRemove.sort((a, b) => b.startIndex - a.startIndex);
    refItemsToRemove.forEach(item => {
        processedMarkdown = processedMarkdown.substring(0, item.startIndex) + 
                           processedMarkdown.substring(item.endIndex);
    });
    
    // 移除参考文献部分的标题（如果存在，但不依赖它来检测）
    // 移除任何紧跟在 <div id="ref- 之前的标题（## 或 # 开头的行）
    // 这样无论标题是什么语言或文本，都能被正确移除
    // 匹配格式：标题行 + 至少一个空行 + <div id="ref-
    // 改进：更灵活地匹配标题和空行
    processedMarkdown = processedMarkdown.replace(/^#{1,6}\s+[^\n]*\s*\n+\s*(?=\n*<div id="ref-)/gm, '');
    
    // 将引用格式 [[1](#ref-1)] 转换为 \cite{1}
    processedMarkdown = processedMarkdown.replace(/\[\[([^\]]+)\]\(#ref-([^)]+)\)\]/g, (match, citationNum, refId) => {
        return `\\cite{${refId}}`;
    });
    
    // 提前抽取数学公式，避免后续字符转义破坏 TeX 语法
    const { text: markdownWithoutMath, placeholders } = extractMathPlaceholders(processedMarkdown);
    let body = await convertTokensToLatex(md.parse(markdownWithoutMath, {}));
    // 转换完成后再恢复数学公式原文
    body = restoreMathPlaceholders(body, placeholders);
    
    // 添加参考文献列表
    if (bibliography.size > 0) {
        body += '\n\n\\begin{thebibliography}{99}\n';
        // 按编号排序
        const sortedRefs = Array.from(bibliography.entries()).sort((a, b) => {
            const numA = parseInt(a[1].num);
            const numB = parseInt(b[1].num);
            if (!isNaN(numA) && !isNaN(numB)) {
                return numA - numB;
            }
            return a[1].num.localeCompare(b[1].num);
        });
        sortedRefs.forEach(([refId, ref]) => {
            body += `\\bibitem{${refId}} ${ref.content}\n`;
        });
        body += '\\end{thebibliography}\n';
    }
    
    // 如果不需要包含完整文档结构，只返回转换后的内容
    if (!includePreamble) {
        return body.trim();
    }
    
    // 包含完整的 LaTeX 文档结构
    const latex = `
\\documentclass{${documentClass}}
\\usepackage{fontspec}
\\usepackage{xeCJK}
\\usepackage{graphicx}
\\usepackage{hyperref}
\\usepackage{amsmath}
\\usepackage{amssymb}
\\usepackage{ulem}
\\usepackage{geometry}
\\usepackage{color}
\\usepackage{fancyhdr}
\\usepackage{lastpage}
\\usepackage{float}
\\usepackage{placeins}

% 英文正文字体
\\setmainfont{Times New Roman} % 英文正文
\\setsansfont{Arial}           % 英文无衬线体
\\setmonofont{Consolas}        % 英文等宽字体

% 中文字体
\\setCJKmainfont{SimSun}       % 中文正文
\\setCJKsansfont{Microsoft YaHei} % 中文无衬线体
\\setCJKmonofont{FangSong}     % 中文等宽字体（可选）

\\geometry{margin=1in}
\\pagestyle{fancy}
\\fancyhf{}
\\lhead{${title}}
\\rhead{Page \\thepage\\,of\\,\\pageref{LastPage}}
\\cfoot{\\thepage}
\\setmainfont{Times New Roman}
\\begin{document}
${body}
\\label{LastPage}
\\end{document}
  `.trim();
    return latex;
}

async function convertTokensToLatex(tokens) {
    const blocks = splitTokensIntoBlocks(tokens);
    let latex = '';

    for (const block of blocks) {
        latex += await convertBlockToLatex(block) + '\n\n';
    }

    return latex.trim();
}

async function convertBlockToLatex(tokens) {
    // 如果整个块只包含图片，直接按 figure 渲染
    const imageOnly = extractImageOnly(tokens);
    if (imageOnly) {
        return renderFigureLatex(imageOnly);
    }

    let latex = '';
    const stack = [];
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        switch (token.type) {
            case 'heading_open': {
                const level = parseInt(token.tag.slice(1));
                const cmd = ['section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph', 'textbf'][level - 1] || 'textbf';
                latex += `\\${cmd}{`;
                stack.push('heading');
                break;
            }

            case 'heading_close':
                if (stack.pop() === 'heading') latex += '}\n\n';
                break;

            case 'paragraph_open': latex += '\n\n'; break;
            case 'paragraph_close': latex += '\n\n'; break;
            case 'text': {
                // 检测文本是否包含 LaTeX 环境或命令
                // 如果包含，则不转义，直接输出（因为已经是 LaTeX 代码）
                const content = token.content || '';
                // 检测常见的 LaTeX 环境开始标记
                const hasLatexEnv = /\\begin\{[^}]+\}/.test(content) || 
                                   /\\end\{[^}]+\}/.test(content) ||
                                   /\\[a-zA-Z@]+\*?(\[[^\]]*\])?\{/.test(content);
                
                if (hasLatexEnv) {
                    // 包含 LaTeX 代码，直接输出不转义
                    latex += content;
                } else {
                    // 普通文本，需要转义
                    latex += escapeLatex(content);
                }
                break;
            }

            case 'em_open': latex += '\\emph{'; stack.push('em'); break;
            case 'em_close': if (stack.pop() === 'em') latex += '}'; break;

            case 'strong_open': latex += '\\textbf{'; stack.push('strong'); break;
            case 'strong_close': if (stack.pop() === 'strong') latex += '}'; break;

            case 's_open': latex += '\\sout{'; stack.push('s'); break;
            case 's_close': if (stack.pop() === 's') latex += '}'; break;

            case 'bullet_list_open': latex += '\\begin{itemize}\n'; stack.push('list'); break;
            case 'bullet_list_close': if (stack.pop() === 'list') latex += '\\end{itemize}\n'; break;

            case 'ordered_list_open': latex += '\\begin{enumerate}\n'; stack.push('olist'); break;
            case 'ordered_list_close': if (stack.pop() === 'olist') latex += '\\end{enumerate}\n'; break;

            case 'list_item_open': latex += '\\item '; break;
            case 'list_item_close': latex += '\n'; break;

            case 'code_inline': latex += `\\texttt{${escapeLatex(token.content)}}`; break;

            case 'fence':
            case 'code_block': {
                const language = (token.info || '').trim().toLowerCase();
                if (language === 'latex') {
                    latex += token.content;
                } else if (language) {
                    // 优先映射到 lstlisting，保留语言信息
                    latex += `\\begin{lstlisting}[language=${language}]\n${token.content}\\end{lstlisting}\n\n`;
                } else {
                    latex += `\\begin{verbatim}\n${token.content}\\end{verbatim}\n\n`;
                }
                break;
            }

            case 'blockquote_open': latex += '\\begin{quote}\n'; stack.push('quote'); break;
            case 'blockquote_close': if (stack.pop() === 'quote') latex += '\\end{quote}\n'; break;

            case 'hr': latex += '\n\\hrulefill\n'; break;

            case 'link_open': {
                const href = token.attrs?.find(([k]) => k === 'href')?.[1] || '';
                latex += `\\href{${href}}{`; stack.push('link'); break;
            }
            case 'link_close': if (stack.pop() === 'link') latex += '}'; break;

            case 'image': {
                let src = token.attrs.find(([k]) => k === 'src')?.[1] || '';
                const alt = escapeLatex(token.content || '');

                try {
                    src = decodeURIComponent(src);
                } catch (e) {
                    // 如果 decode 失败，保持原样
                }

                // 检测是否为 SVG 文件
                const isSvg = src.toLowerCase().endsWith('.svg');
                
                // 路径处理：统一转换为正斜杠
                let normalizedPath = src.replace(/\\/g, '/');
                
                if (isSvg) {
                    // SVG 文件需要转换为 PDF
                    try {
                        const { convertSvgToPdf } = await import('./svg-to-pdf-utils.js');
                        // 使用统一的 SVG 转 PDF 工具函数
                        normalizedPath = await convertSvgToPdf(normalizedPath, { returnUrl: false });
                    } catch (error) {
                        // 转换失败，使用原始 SVG 路径（可能会失败，但至少可以尝试）
                        console.warn('SVG 转 PDF 失败，使用原始路径:', error);
                    }
                    
                    // 路径处理：使用 \detokenize 避免转义问题，保留下划线等字符
                    // 注意：\detokenize 的参数不应该被转义，因为 \detokenize 会处理所有特殊字符
                    // 只需要统一路径分隔符即可
                    normalizedPath = normalizedPath.replace(/\\/g, '/');
                    
                    // 对于 PDF（转换后的 SVG），使用标准的 includegraphics
                    // 使用 [H] 强制图片在当前位置，不允许浮动
                    latex += `
\\begin{figure}[H]
  \\centering
  \\includegraphics[width=0.8\\textwidth]{\\detokenize{${normalizedPath}}}
  \\caption{${alt}}
\\end{figure}
`;
                } else {
                    // 其他图片格式：需要转义所有特殊字符（包括下划线）
                    normalizedPath = normalizedPath.replace(/([#%&{}_])/g, '\\$1');
                    
                    // 使用 [H] 强制图片在当前位置，不允许浮动
                    latex += `
\\begin{figure}[H]
  \\centering
  \\includegraphics[width=0.8\\textwidth]{${normalizedPath}}
  \\caption{${alt}}
\\end{figure}
`;
                }
                break;
            }

            case 'footnote_ref': {
                const id = token.meta.id + 1;
                latex += `\\footnote{[fn${id}]}`;
                break;
            }

            case 'footnote_block_open': latex += '\n% Footnotes\n'; break;

            case 'footnote_open': {
                const id = token.meta.id + 1;
                latex += `\\footnotetext[${id}]{`;
                stack.push('footnote');
                break;
            }

            case 'footnote_close': if (stack.pop() === 'footnote') latex += '}\n'; break;
            case 'inline':
                // 检查 inline 中是否只有图片（块级图片的情况）
                const inlineChildren = token.children || [];
                const hasOnlyImage = inlineChildren.length === 1 && inlineChildren[0].type === 'image';
                
                if (hasOnlyImage) {
                    // 如果是块级图片（整个 inline 只包含一个图片），直接处理图片
                    const imageToken = inlineChildren[0];
                    let src = imageToken.attrs.find(([k]) => k === 'src')?.[1] || '';
                    const alt = escapeLatex(imageToken.content || '');

                    try {
                        src = decodeURIComponent(src);
                    } catch (e) {
                        // 如果 decode 失败，保持原样
                    }

                    // 检测是否为 SVG 文件
                    const isSvg = src.toLowerCase().endsWith('.svg');
                    
                    // 路径处理：统一转换为正斜杠
                    let normalizedPath = src.replace(/\\/g, '/');
                    
                    if (isSvg) {
                        // SVG 文件需要转换为 PDF
                        try {
                            const { convertSvgToPdf } = await import('./svg-to-pdf-utils.js');
                            normalizedPath = await convertSvgToPdf(normalizedPath, { returnUrl: false });
                        } catch (error) {
                            console.warn('SVG 转 PDF 失败，使用原始路径:', error);
                        }
                        
                        // 路径处理：使用 \detokenize 避免转义问题，保留下划线等字符
                        // 注意：\detokenize 的参数不应该被转义，因为 \detokenize 会处理所有特殊字符
                        // 只需要统一路径分隔符即可
                        normalizedPath = normalizedPath.replace(/\\/g, '/');
                        
                        // 使用 [H] 强制图片在当前位置，不允许浮动
                        latex += `
\\begin{figure}[H]
  \\centering
  \\includegraphics[width=0.8\\textwidth]{\\detokenize{${normalizedPath}}}
  \\caption{${alt}}
\\end{figure}
`;
                    } else {
                        normalizedPath = normalizedPath.replace(/([#%&{}_])/g, '\\$1');
                        
                        // 使用 [H] 强制图片在当前位置，不允许浮动
                        latex += `
\\begin{figure}[H]
  \\centering
  \\includegraphics[width=0.8\\textwidth]{${normalizedPath}}
  \\caption{${alt}}
\\end{figure}
`;
                    }
                } else {
                    // 如果不是块级图片，正常处理 inline 内容
                    latex += await convertTokensToLatex(inlineChildren);
                }
                break;

            case 'emoji':
                latex += convertEmojiToLatex(token.markup);
                break;
            case 'table_open': {
                const { latex: tableLatex, offset } = convertMarkdownTableTokensToLatex(tokens, i);
                latex += tableLatex;
                i = offset;
                break;
            }

            default:
                break;
        }
    }

    return latex;
}
function splitTokensIntoBlocks(tokens) {
    const blocks = [];
    let currentBlock = [];

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];

        // 如果是 heading_open，则从这里开始新的一段
        if (token.type === 'heading_open' && currentBlock.length > 0) {
            blocks.push(currentBlock);
            currentBlock = [];
        }

        // 检查是否是段落，如果是段落且只包含一个图片，则将其作为独立块
        if (token.type === 'paragraph_open') {
            // 查找对应的 paragraph_close
            let paragraphEnd = -1;
            let depth = 1;
            for (let j = i + 1; j < tokens.length; j++) {
                if (tokens[j].type === 'paragraph_open') depth++;
                if (tokens[j].type === 'paragraph_close') {
                    depth--;
                    if (depth === 0) {
                        paragraphEnd = j;
                        break;
                    }
                }
                // 如果遇到其他块级元素，说明段落提前结束
                if (tokens[j].type === 'heading_open' || tokens[j].type === 'fence' || tokens[j].type === 'code_block') {
                    break;
                }
            }
            
            if (paragraphEnd >= 0) {
                // 检查段落中是否只有图片（没有其他文本内容）
                let hasImage = false;
                let hasOtherContent = false;
                
                for (let j = i + 1; j < paragraphEnd; j++) {
                    const t = tokens[j];
                    if (t.type === 'image') {
                        hasImage = true;
                    } else if (t.type === 'inline' && t.children) {
                        // 检查 inline 中的内容
                        for (const child of t.children) {
                            if (child.type === 'image') {
                                hasImage = true;
                            } else if (child.type === 'text' && child.content && child.content.trim().length > 0) {
                                hasOtherContent = true;
                            } else if (child.type !== 'image' && child.type !== 'softbreak' && child.type !== 'hardbreak') {
                                // 有其他非图片内容
                                hasOtherContent = true;
                            }
                        }
                    } else if (t.type !== 'paragraph_open' && t.type !== 'paragraph_close') {
                        hasOtherContent = true;
                    }
                }
                
                // 如果段落中只有图片（没有其他内容），将其作为独立块
                if (hasImage && !hasOtherContent) {
                    // 如果当前块不为空，先保存当前块
                    if (currentBlock.length > 0) {
                        blocks.push(currentBlock);
                        currentBlock = [];
                    }
                    // 将整个段落（包含图片）作为独立块
                    const imageBlock = [];
                    for (let j = i; j <= paragraphEnd; j++) {
                        imageBlock.push(tokens[j]);
                    }
                    blocks.push(imageBlock);
                    // 跳过已处理的 tokens
                    i = paragraphEnd;
                    continue;
                }
            }
        }

        currentBlock.push(token);
    }

    if (currentBlock.length > 0) {
        blocks.push(currentBlock);
    }

    return blocks;
}
// LaTeX 特殊字符转义
// 注意：转义顺序很重要，必须按正确顺序处理
// Missing endcsname 错误通常由未转义的 # 字符引起
function escapeLatex(str) {
    if (!str) return '';
    
    let result = String(str);
    
    // 转义顺序很重要：
    // 1. 先转义反斜杠（必须最先处理）
    result = result.replace(/\\/g, '\\textbackslash{}');
    
    // 2. 转义所有特殊字符（按 LaTeX 规则）
    // 注意：大括号必须转义，否则会导致命令参数解析错误
    result = result
        .replace(/([{}])/g, '\\$1')      // 大括号（必须转义，避免命令参数错误）
        .replace(/#/g, '\\#')             // 井号（这是导致 Missing endcsname 的主要原因）
        .replace(/\$/g, '\\$')            // 美元符号
        .replace(/&/g, '\\&')             // 和号
        .replace(/%/g, '\\%')            // 百分号
        .replace(/_/g, '\\_')            // 下划线
        .replace(/~/g, '\\textasciitilde{}')  // 波浪号
        .replace(/\^/g, '\\^{}');        // 插入符号
    
    return result;
}

// 检测当前块是否仅包含图片，返回图片 token
function extractImageOnly(tokens) {
    if (!tokens || tokens.length === 0) return null;
    const inline = tokens.find(t => t.type === 'inline');
    if (!inline || !inline.children) return null;
    const images = inline.children.filter(c => c.type === 'image');
    if (images.length === 0) return null;
    const nonImage = inline.children.filter(c => {
        if (c.type === 'image' || c.type === 'softbreak' || c.type === 'hardbreak') return false;
        if (c.type === 'text' && (!c.content || !c.content.trim())) return false;
        return true;
    });
    if (nonImage.length > 0) return null;
    return images[0];
}

function renderFigureLatex(imageToken) {
    const src = imageToken.attrs?.find(([k]) => k === 'src')?.[1] || '';
    const alt = escapeLatex(imageToken.content || '');
    const title = imageToken.attrs?.find(([k]) => k === 'title')?.[1] || '';
    const caption = title || alt;
    const path = src.replace(/\\/g, '/');
    let latex = '\\begin{figure}[H]\n\\centering\n';
    latex += `\\includegraphics[width=\\linewidth]{${path}}\n`;
    if (caption) {
        latex += `\\caption{${caption}}\n`;
    }
    latex += '\\end{figure}';
    return latex;
}

// Emoji 转 LaTeX 表示（可以改成 unicode 或 TikZ 绘图）
function convertEmojiToLatex(emojiName) {
    const emojiMap = {
        smile: '\\smiley{}',
        heart: '\\heartsuit{}',
        check: '\\checkmark{}',
        x: '$\\times$',
    };
    return emojiMap[emojiName] || '';
}


// 主处理函数
function convertMarkdownTableTokensToLatex(tokens, startIndex) {
    let latex = '';
    let i = startIndex;

    let rows = [];
    let alignSpec = [];
    let currentRow = [];
    let collectingRow = false;
    let inHeader = false;

    while (i < tokens.length) {
        const token = tokens[i];

        switch (token.type) {
            case 'thead_open':
                inHeader = true;
                break;

            case 'thead_close':
                inHeader = false;
                break;

            case 'tr_open':
                currentRow = [];
                collectingRow = true;
                break;

            case 'tr_close':
                if (collectingRow) {
                    rows.push({ cells: currentRow, isHeader: inHeader });
                    currentRow = [];
                    collectingRow = false;
                }
                break;

            case 'th_open':
            case 'td_open': {
                const nextToken = tokens[i + 1];
                let content = '';

                if (nextToken?.type === 'inline') {
                    content = escapeLatex(nextToken.content || '');
                }

                currentRow.push(content);
                break;
            }

            case 'table_close':
                // 渲染表格
                const columnCount = Math.max(...rows.map(r => r.cells.length));
                if (columnCount === 0) return { latex: '', offset: i };

                const defaultAlign = '|c'.repeat(columnCount) + '|';
                // 默认使用 longtable，兼容长表
                latex += `\\begin{longtable}{${defaultAlign}}\n\\hline\n`;

                rows.forEach((row, idx) => {
                    latex += row.cells.join(' & ') + ' \\\\ \\hline\n';
                    // 处理表头分隔
                    if (row.isHeader && idx === 0) {
                        latex += '\\endfirsthead\n\\hline\n';
                        latex += row.cells.join(' & ') + ' \\\\ \\hline\n';
                        latex += '\\endhead\n\\hline\n';
                    }
                });

                latex += '\\end{longtable}\n\n';
                return { latex, offset: i };
        }

        i++;
    }

    return { latex: '', offset: i };
}

/**
 * 从 LaTeX 中提取纯文本内容（用于分词等用途）
 * 移除所有 LaTeX 命令、环境，只保留实际文本内容
 */
export function extractPlainTextFromLatex(latex) {
    if (!latex) return '';
    
    const sanitized = sanitizeLatexInput(latex);
    let lines = sanitized.split('\n');
    let text = '';
    
    let inVerbatim = false;
    let inItemize = false;
    let inEnumerate = false;
    let inQuote = false;
    let inTable = false;
    
    // 辅助函数：提取大括号中的内容（处理嵌套）
    const extractBraceContent = (str, startIdx = 0) => {
        if (str[startIdx] !== '{') return '';
        let depth = 0;
        let i = startIdx;
        while (i < str.length) {
            if (str[i] === '{') depth++;
            else if (str[i] === '}') {
                depth--;
                if (depth === 0) {
                    return str.substring(startIdx + 1, i);
                }
            }
            i++;
        }
        return '';
    };
    
    // 辅助函数：移除 LaTeX 命令，保留文本内容
    const removeLatexCommands = (str) => {
        let result = str;
        // 移除命令及其参数：\command{content} -> content
        result = result.replace(/\\[a-zA-Z@]+\*?(\[[^\]]*\])?\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, '$2');
        // 移除简单命令：\command -> ''
        result = result.replace(/\\[a-zA-Z@]+\*?(\[[^\]]*\])?/g, '');
        // 移除单独的 { }（但保留内容）
        result = result.replace(/\{([^{}]*)\}/g, '$1');
        return result.trim();
    };
    
    for (let rawLine of lines) {
        const line = rawLine.trim();
        
        if (!line) {
            text += '\n';
            continue;
        }
        
        // 跳过 verbatim 环境（代码块）
        if (line.startsWith('\\begin{verbatim}')) {
            inVerbatim = true;
            continue;
        }
        if (line.startsWith('\\end{verbatim}')) {
            inVerbatim = false;
            continue;
        }
        if (inVerbatim) {
            continue;
        }
        
        // 跳过 figure 环境
        if (line.startsWith('\\begin{figure') || line.startsWith('\\end{figure}')) {
            continue;
        }
        if (line.startsWith('\\caption{')) {
            // 提取 caption 中的文本
            const captionMatch = line.match(/\\caption\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/);
            if (captionMatch) {
                text += removeLatexCommands(captionMatch[1]) + '\n';
            }
            continue;
        }
        if (line.startsWith('\\includegraphics')) {
            continue;
        }
        
        // 处理列表环境
        if (line.startsWith('\\begin{itemize}')) {
            inItemize = true;
            continue;
        }
        if (line.startsWith('\\end{itemize}')) {
            inItemize = false;
            text += '\n';
            continue;
        }
        if (line.startsWith('\\begin{enumerate}')) {
            inEnumerate = true;
            continue;
        }
        if (line.startsWith('\\end{enumerate}')) {
            inEnumerate = false;
            text += '\n';
            continue;
        }
        
        // 处理 blockquote
        if (line.startsWith('\\begin{quote}')) {
            inQuote = true;
            continue;
        }
        if (line.startsWith('\\end{quote}')) {
            inQuote = false;
            text += '\n';
            continue;
        }
        if (inQuote) {
            // quote 环境中的文本直接提取
            const quoteText = removeLatexCommands(line);
            if (quoteText) {
                text += quoteText + '\n';
            }
            continue;
        }
        
        // 处理表格
        if (line.startsWith('\\begin{tabular}')) {
            inTable = true;
            continue;
        }
        if (line.startsWith('\\end{tabular}')) {
            inTable = false;
            text += '\n';
            continue;
        }
        if (inTable) {
            // 从表格行中提取文本
            const cells = line.replace(/\\\\.*/, '').split('&').map(cell => cell.trim());
            const cellTexts = cells
                .map(cell => removeLatexCommands(cell))
                .filter(c => c);
            if (cellTexts.length > 0) {
                text += cellTexts.join(' ') + '\n';
            }
            continue;
        }
        
        // 提取标题文本（section, subsection 等）
        const headingMatch = line.match(/^\\(section|subsection|subsubsection|paragraph|subparagraph)\*?\{(.+)\}/);
        if (headingMatch) {
            const title = removeLatexCommands(headingMatch[2]);
            if (title) {
                text += title + '\n';
            }
            continue;
        }
        
        // 提取 item 文本
        if (line.startsWith('\\item')) {
            const itemText = line.replace(/^\\item(\[[^\]]*\])?\s*/, '');
            const cleanedText = removeLatexCommands(itemText);
            if (cleanedText) {
                text += cleanedText + '\n';
            }
            continue;
        }
        
        // 提取链接文本
        const linkMatch = line.match(/\\href\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/);
        if (linkMatch) {
            const linkText = removeLatexCommands(linkMatch[2]);
            if (linkText) {
                text += linkText + '\n';
            }
            continue;
        }
        
        // 跳过纯命令行（如 \centering, \newline 等）
        if (line.startsWith('\\') && IGNORED_INLINE_COMMAND_REGEX.test(line)) {
            continue;
        }
        
        // 处理普通文本行（可能包含 LaTeX 命令的文本）
        // 先尝试移除 LaTeX 命令，保留文本内容
        let plainText = removeLatexCommands(line);
        
        // 如果移除命令后还有内容，添加
        if (plainText) {
            // 进一步清理：移除多余的空白字符
            plainText = plainText.replace(/\s+/g, ' ').trim();
            if (plainText && plainText.length > 0) {
                text += plainText + '\n';
            }
        } else if (!line.startsWith('\\')) {
            // 如果整行都不是命令开头，说明是纯文本，直接用 transformInlineLatex 处理
            const transformedText = transformInlineLatex(line);
            if (transformedText && transformedText.trim()) {
                text += transformedText.trim() + '\n';
            }
        }
    }
    
    // 最终清理：移除多余的换行，保留合理的段落分隔
    // 先按行处理，移除每行内的多余空格，然后处理换行
    lines = text.split('\n');
    const cleanedLines = lines
        .map(line => line.replace(/\s+/g, ' ').trim()) // 合并每行内的多余空格
        .filter(line => line.length > 0); // 移除空行
    
    return cleanedLines
        .join('\n')
        .replace(/\n{3,}/g, '\n\n') // 合并多个换行（但不应有这种情况，因为已经移除了空行）
        .trim();
}

export function convertLatexToMarkdown(latex) {
    const sanitized = sanitizeLatexInput(latex);
    const lines = sanitized.split('\n');
    let md = '';
    let inItemize = false;
    let inEnumerate = false;
    let inQuote = false;
    let inVerbatim = false;
    let inTable = false;
    let tableType = null; // tabular / longtable
    let tableRows = [];
    let tableCaption = '';
    let headerBreakIndex = null;
    let inFigure = false;
    let figureContent = '';
    let figureDepth = 0;
    let inEquation = false;
    let equationLines = [];
    let inLstlisting = false;
    let lstLanguage = '';
    let lstLines = [];
    let longtblrOptionsBuffer = null;
    let pendingListItem = null;
    let enumerateIndex = 1;
    
    // 参考文献相关变量
    let bibliography = new Map(); // 存储 \bibitem{key}{content}
    let inBibliography = false; // 是否在 thebibliography 环境中
    let currentBibItem = null; // 当前正在处理的 bibitem key
    
    // 未识别环境的栈（用于跟踪嵌套的未识别环境）
    let unknownEnvStack = [];
    // 已处理的环境列表
    const knownEnvironments = new Set([
        'lstlisting', 'letter', 'equation', 'verbatim', 'figure', 
        'itemize', 'enumerate', 'quote', 'tabular', 'longtable', 
        'longtblr', 'center', 'document', 'thebibliography'
    ]);

    const headingMap = {
        section: '#',
        subsection: '##',
        subsubsection: '###',
    };

    const flushListItem = () => {
        if (pendingListItem === null) {
            return;
        }
        const normalized = pendingListItem.trim();
        pendingListItem = null;
        if (!normalized) {
            return;
        }
        if (inEnumerate) {
            md += `${enumerateIndex}. ${normalized}\n`;
            enumerateIndex += 1;
        } else {
            md += `- ${normalized}\n`;
        }
    };

    const appendToPendingItem = (text) => {
        const value = text.trim();
        if (!value) return;
        if (!pendingListItem || pendingListItem.trim().length === 0) {
            pendingListItem = value;
        } else {
            pendingListItem += `\n  ${value}`;
        }
    };

    const renderMarkdownTable = (rows, caption, headerIndex = 0) => {
        if (!rows || rows.length === 0) return '';
        const colCount = Math.max(...rows.map(r => r.length));
        const normalizedRows = rows.map(r => {
            const clone = [...r];
            while (clone.length < colCount) clone.push('');
            return clone;
        });
        const safeHeaderIndex = Math.min(Math.max(headerIndex, 0), normalizedRows.length - 1);
        const header = normalizedRows[safeHeaderIndex];
        const body = normalizedRows.filter((_, idx) => idx !== safeHeaderIndex);
        let tableMd = '';
        if (caption) {
            tableMd += `**${caption}**\n\n`;
        }
        tableMd += '| ' + header.join(' | ') + ' |\n';
        tableMd += '| ' + Array(colCount).fill('---').join(' | ') + ' |\n';
        for (const row of body) {
            tableMd += '| ' + row.join(' | ') + ' |\n';
        }
        return tableMd + '\n';
    };

    const pushTableRows = () => {
        if (tableRows.length === 0) return;
        const headerIdx = headerBreakIndex !== null && headerBreakIndex > 0 ? headerBreakIndex - 1 : 0;
        md += renderMarkdownTable(tableRows, tableCaption, headerIdx);
        tableRows = [];
        tableCaption = '';
        tableType = null;
        headerBreakIndex = null;
    };

    // 辅助函数：提取大括号中的内容（处理嵌套和转义）
    const extractBraceContent = (str, startIdx = 0) => {
        if (startIdx >= str.length || str[startIdx] !== '{') return { content: '', endIdx: startIdx };
        let depth = 0;
        let i = startIdx;
        while (i < str.length) {
            // 检查是否是数学公式占位符（@@MATH...@@）
            if (str.substr(i).startsWith('@@MATH')) {
                // 跳过整个占位符
                const placeholderEnd = str.indexOf('@@', i + 6);
                if (placeholderEnd !== -1) {
                    i = placeholderEnd + 2;
                    continue;
                }
            }
            // 检查是否是转义字符（\ 后面跟着 { 或 }）
            if (str[i] === '\\' && i + 1 < str.length) {
                // 跳过转义字符和下一个字符
                i += 2;
                continue;
            }
            if (str[i] === '{') {
                depth++;
            } else if (str[i] === '}') {
                depth--;
                if (depth === 0) {
                    return { content: str.substring(startIdx + 1, i), endIdx: i + 1 };
                }
            }
            i++;
        }
        return { content: '', endIdx: str.length };
    };

    // 处理嵌套的 tabular 环境
    const processNestedTabular = (content) => {
        let result = content;
        // 处理嵌套的 tabular 环境：提取其中的内容
        // 匹配 \begin{tabular}[c]{@{}l@{}}...\end{tabular}
        // 需要处理嵌套的 tabular（递归处理）
        let changed = true;
        while (changed) {
            changed = false;
            const tabularRegex = /\\begin\{tabular\}(?:\[[^\]]*\])?\{[^}]*\}([\s\S]*?)\\end\{tabular\}/g;
            result = result.replace(tabularRegex, (match, innerContent) => {
                changed = true;
                // 提取 tabular 内的内容，移除列对齐标记
                let inner = innerContent;
                inner = inner.replace(/@\{\}/g, '');
                inner = inner.replace(/@\{[^}]*\}/g, '');
                // 将 \\ 转换为换行
                inner = inner.replace(/\\\\/g, '\n');
                // 移除多余的大括号
                inner = inner.replace(/^\{|\}$/g, '');
                return inner.trim();
            });
        }
        // 移除列对齐标记（如果还有残留）
        result = result.replace(/@\{\}/g, '');
        result = result.replace(/@\{[^}]*\}/g, '');
        // 移除换行符命令，保留实际换行
        result = result.replace(/\\\\/g, '\n');
        return result.trim();
    };

    const parseTableRow = (raw) => {
        let clean = raw;
        
        // 移除行尾的换行命令和 \endfirsthead 等
        clean = clean.replace(/\\\\.*$/, '');
        clean = clean.replace(/\\endfirsthead\b/g, '');
        clean = clean.replace(/\\endhead\b/g, '');
        clean = clean.replace(/\\endfoot\b/g, '');
        clean = clean.replace(/\\endlastfoot\b/g, '');
        
        // 先保护数学公式，避免在处理大括号时被破坏
        // 支持块级公式 $$...$$ 和内联公式 $...$
        const mathPlaceholders = [];
        // 先处理块级公式 $$...$$（避免和内联公式冲突）
        clean = clean.replace(/\$\$[\s\S]*?\$\$/g, (match) => {
            const idx = mathPlaceholders.length;
            mathPlaceholders.push(match);
            return `@@MATHBLOCK${idx}@@`;
        });
        // 再处理内联公式 $...$
        clean = clean.replace(/\$[^$]*\$/g, (match) => {
            const idx = mathPlaceholders.length;
            mathPlaceholders.push(match);
            return `@@MATHINLINE${idx}@@`;
        });
        
        // 移除控制命令
        clean = clean.replace(/\\centering\b/g, '');
        clean = clean.replace(/\\label\{[^}]*\}/g, '');
        
        // 先处理嵌套的 tabular 环境（在解析单元格之前）
        clean = processNestedTabular(clean);
        
        // 处理 multicolumn 和 multirow：提取内容，忽略列数和对齐
        // 需要处理嵌套大括号，并保护大括号内的 & 符号
        let processed = '';
        let i = 0;
        while (i < clean.length) {
            if (clean.substr(i).startsWith('\\multicolumn')) {
                // 找到 \multicolumn{num}{align}{content}
                const match = clean.substr(i).match(/\\multicolumn\{([^}]+)\}\{([^}]+)\}/);
                if (match) {
                    const numEnd = i + match[0].length;
                    // 提取 content（可能包含嵌套大括号）
                    const braceResult = extractBraceContent(clean, numEnd);
                    let content = braceResult.content;
                    // 移除内容中的 \centering 等命令
                    content = content.replace(/\\centering\b/g, '');
                    content = content.replace(/\\label\{[^}]*\}/g, '');
                    // 清理多余空格
                    content = content.trim();
                    // 保护 multicolumn 内容中的 & 符号，避免被后续分割
                    // 将 & 替换为占位符，稍后在单元格处理时恢复
                    content = content.replace(/&/g, '@@AMPERSAND@@');
                    processed += content;
                    i = braceResult.endIdx;
                    continue;
                }
            } else if (clean.substr(i).startsWith('\\multirow')) {
                // 处理 multirow
                const match = clean.substr(i).match(/\\multirow\{([^}]+)\}\{([^}]+)\}/);
                if (match) {
                    const numEnd = i + match[0].length;
                    const braceResult = extractBraceContent(clean, numEnd);
                    let content = braceResult.content;
                    // 保护 multirow 内容中的 & 符号
                    content = content.replace(/&/g, '@@AMPERSAND@@');
                    processed += content;
                    i = braceResult.endIdx;
                    continue;
                }
            } else if (clean[i] === '{' && (i === 0 || clean[i - 1] !== '\\')) {
                // 检查是否是列对齐标记（如 {m{4cm}} 或 {c}）
                const nextChars = clean.substr(i + 1, 10);
                if (/^[clr]}$/.test(nextChars) || /^m\{[^}]*\}/.test(nextChars)) {
                    // 这是列对齐标记，跳过
                    const braceResult = extractBraceContent(clean, i);
                    i = braceResult.endIdx;
                    continue;
                }
                // 检查大括号内容中是否包含数学公式占位符
                // 如果包含，说明这是数学公式的一部分，不应该提取大括号
                const bracePreview = clean.substr(i, Math.min(100, clean.length - i));
                if (bracePreview.includes('@@MATH')) {
                    // 包含数学公式占位符，保留原样
                    processed += clean[i];
                    i++;
                    continue;
                }
                // 处理普通大括号包裹的内容（多行单元格）
                const braceResult = extractBraceContent(clean, i);
                // 保留大括号中的内容，但处理换行
                let content = braceResult.content;
                // 将 \\ 转换为换行
                content = content.replace(/\\\\/g, '\n');
                // 保护大括号内的 & 符号（多行单元格中可能包含 &）
                // 转义的 & (\&) 应该转换为普通的 &，所以先转换转义的 &，再保护所有的 &
                content = content.replace(/\\&/g, '&');
                content = content.replace(/&/g, '@@AMPERSAND@@');
                processed += content;
                i = braceResult.endIdx;
                continue;
            } else if (clean[i] === '\\' && i + 1 < clean.length && clean[i + 1] === '{') {
                // 处理转义的大括号 \{，转换为普通大括号（在单元格中应该显示为 {）
                processed += '{';
                i += 2;
                continue;
            } else if (clean[i] === '\\' && i + 1 < clean.length && clean[i + 1] === '}') {
                // 处理转义的大括号 \}，转换为普通大括号（在单元格中应该显示为 }）
                processed += '}';
                i += 2;
                continue;
            } else {
                processed += clean[i];
                i++;
            }
        }
        
        clean = processed;
        
        // 恢复数学公式
        mathPlaceholders.forEach((math, idx) => {
            // 先恢复块级公式
            clean = clean.replace(`@@MATHBLOCK${idx}@@`, math);
            // 再恢复内联公式
            clean = clean.replace(`@@MATHINLINE${idx}@@`, math);
        });
        
        // 移除列对齐标记（如 m{4cm}，如果还有残留）
        clean = clean.replace(/\{m\{[^}]*\}\}/g, '');
        clean = clean.replace(/\{[clr]\}/g, '');
        
        // 将行尾的 \\ 转换为空格
        clean = clean.replace(/\\\\/g, ' ');
        
        // 移除多余的空白字符，但保留换行
        clean = clean.replace(/[ \t]+/g, ' ');
        clean = clean.replace(/\n\s*\n/g, '\n');
        
        // 分割单元格（只分割不在占位符中的 &）
        const parts = clean.split('&').map(cell => {
            let cellContent = cell.trim();
            // 恢复单元格内的 & 符号
            cellContent = cellContent.replace(/@@AMPERSAND@@/g, '&');
            // 移除残留的大括号（如果还有，但要小心不要破坏数学公式）
            // 只移除开头和结尾的单独大括号，不要移除数学公式中的大括号
            cellContent = cellContent.replace(/^\{([^{$]*)\}$/, '$1');
            // 转换内联 LaTeX（但保留数学公式）
            cellContent = transformInlineLatex(cellContent);
            // 将换行转换为空格（Markdown 表格单元格不支持换行）
            cellContent = cellContent.replace(/\n/g, ' ');
            // 清理多余空格（但保留数学公式中的空格）
            // 先保护数学公式
            const mathPlaceholders = [];
            // 先保护块级公式
            cellContent = cellContent.replace(/\$\$[\s\S]*?\$\$/g, (match) => {
                const idx = mathPlaceholders.length;
                mathPlaceholders.push(match);
                return `@@MATH${idx}@@`;
            });
            // 再保护内联公式
            cellContent = cellContent.replace(/\$[^$]*\$/g, (match) => {
                const idx = mathPlaceholders.length;
                mathPlaceholders.push(match);
                return `@@MATH${idx}@@`;
            });
            // 清理多余空格
            cellContent = cellContent.replace(/\s+/g, ' ').trim();
            // 恢复数学公式
            mathPlaceholders.forEach((math, idx) => {
                cellContent = cellContent.replace(`@@MATH${idx}@@`, math);
            });
            return cellContent;
        });
        
        return parts;
    };

    for (let rawLine of lines) {
        let line = rawLine.trim();
        if (tableRows.length === 0) return;
        const headerIdx = headerBreakIndex !== null && headerBreakIndex > 0 ? headerBreakIndex - 1 : 0;
        md += renderMarkdownTable(tableRows, tableCaption, headerIdx);
        tableRows = [];
        tableCaption = '';
        tableType = null;
        headerBreakIndex = null;
    };

    // 辅助函数：提取大括号中的内容（处理嵌套和转义）
    const extractBraceContent = (str, startIdx = 0) => {
        if (startIdx >= str.length || str[startIdx] !== '{') return { content: '', endIdx: startIdx };
        let depth = 0;
        let i = startIdx;
        while (i < str.length) {
            // 检查是否是数学公式占位符（@@MATH...@@）
            if (str.substr(i).startsWith('@@MATH')) {
                // 跳过整个占位符
                const placeholderEnd = str.indexOf('@@', i + 6);
                if (placeholderEnd !== -1) {
                    i = placeholderEnd + 2;
                    continue;
                }
            }
            // 检查是否是转义字符（\ 后面跟着 { 或 }）
            if (str[i] === '\\' && i + 1 < str.length) {
                // 跳过转义字符和下一个字符
                i += 2;
                continue;
            }
            if (str[i] === '{') {
                depth++;
            } else if (str[i] === '}') {
                depth--;
                if (depth === 0) {
                    return { content: str.substring(startIdx + 1, i), endIdx: i + 1 };
                }
            }
            i++;
        }
        return { content: '', endIdx: str.length };
    };

    // 处理嵌套的 tabular 环境
    const processNestedTabular = (content) => {
        let result = content;
        // 处理嵌套的 tabular 环境：提取其中的内容
        // 匹配 \begin{tabular}[c]{@{}l@{}}...\end{tabular}
        // 需要处理嵌套的 tabular（递归处理）
        let changed = true;
        while (changed) {
            changed = false;
            const tabularRegex = /\\begin\{tabular\}(?:\[[^\]]*\])?\{[^}]*\}([\s\S]*?)\\end\{tabular\}/g;
            result = result.replace(tabularRegex, (match, innerContent) => {
                changed = true;
                // 提取 tabular 内的内容，移除列对齐标记
                let inner = innerContent;
                inner = inner.replace(/@\{\}/g, '');
                inner = inner.replace(/@\{[^}]*\}/g, '');
                // 将 \\ 转换为换行
                inner = inner.replace(/\\\\/g, '\n');
                // 移除多余的大括号
                inner = inner.replace(/^\{|\}$/g, '');
                return inner.trim();
            });
        }
        // 移除列对齐标记（如果还有残留）
        result = result.replace(/@\{\}/g, '');
        result = result.replace(/@\{[^}]*\}/g, '');
        // 移除换行符命令，保留实际换行
        result = result.replace(/\\\\/g, '\n');
        return result.trim();
    };

    const parseTableRow = (raw) => {
        let clean = raw;
        
        // 移除行尾的换行命令和 \endfirsthead 等
        clean = clean.replace(/\\\\.*$/, '');
        clean = clean.replace(/\\endfirsthead\b/g, '');
        clean = clean.replace(/\\endhead\b/g, '');
        clean = clean.replace(/\\endfoot\b/g, '');
        clean = clean.replace(/\\endlastfoot\b/g, '');
        
        // 先保护数学公式，避免在处理大括号时被破坏
        // 支持块级公式 $$...$$ 和内联公式 $...$
        const mathPlaceholders = [];
        // 先处理块级公式 $$...$$（避免和内联公式冲突）
        clean = clean.replace(/\$\$[\s\S]*?\$\$/g, (match) => {
            const idx = mathPlaceholders.length;
            mathPlaceholders.push(match);
            return `@@MATHBLOCK${idx}@@`;
        });
        // 再处理内联公式 $...$
        clean = clean.replace(/\$[^$]*\$/g, (match) => {
            const idx = mathPlaceholders.length;
            mathPlaceholders.push(match);
            return `@@MATHINLINE${idx}@@`;
        });
        
        // 移除控制命令
        clean = clean.replace(/\\centering\b/g, '');
        clean = clean.replace(/\\label\{[^}]*\}/g, '');
        
        // 先处理嵌套的 tabular 环境（在解析单元格之前）
        clean = processNestedTabular(clean);
        
        // 处理 multicolumn 和 multirow：提取内容，忽略列数和对齐
        // 需要处理嵌套大括号，并保护大括号内的 & 符号
        let processed = '';
        let i = 0;
        while (i < clean.length) {
            if (clean.substr(i).startsWith('\\multicolumn')) {
                // 找到 \multicolumn{num}{align}{content}
                const match = clean.substr(i).match(/\\multicolumn\{([^}]+)\}\{([^}]+)\}/);
                if (match) {
                    const numEnd = i + match[0].length;
                    // 提取 content（可能包含嵌套大括号）
                    const braceResult = extractBraceContent(clean, numEnd);
                    let content = braceResult.content;
                    // 移除内容中的 \centering 等命令
                    content = content.replace(/\\centering\b/g, '');
                    content = content.replace(/\\label\{[^}]*\}/g, '');
                    // 清理多余空格
                    content = content.trim();
                    // 保护 multicolumn 内容中的 & 符号，避免被后续分割
                    // 将 & 替换为占位符，稍后在单元格处理时恢复
                    content = content.replace(/&/g, '@@AMPERSAND@@');
                    processed += content;
                    i = braceResult.endIdx;
                    continue;
                }
            } else if (clean.substr(i).startsWith('\\multirow')) {
                // 处理 multirow
                const match = clean.substr(i).match(/\\multirow\{([^}]+)\}\{([^}]+)\}/);
                if (match) {
                    const numEnd = i + match[0].length;
                    const braceResult = extractBraceContent(clean, numEnd);
                    let content = braceResult.content;
                    // 保护 multirow 内容中的 & 符号
                    content = content.replace(/&/g, '@@AMPERSAND@@');
                    processed += content;
                    i = braceResult.endIdx;
                    continue;
                }
            } else if (clean[i] === '{' && (i === 0 || clean[i - 1] !== '\\')) {
                // 检查是否是列对齐标记（如 {m{4cm}} 或 {c}）
                const nextChars = clean.substr(i + 1, 10);
                if (/^[clr]}$/.test(nextChars) || /^m\{[^}]*\}/.test(nextChars)) {
                    // 这是列对齐标记，跳过
                    const braceResult = extractBraceContent(clean, i);
                    i = braceResult.endIdx;
                    continue;
                }
                // 检查大括号内容中是否包含数学公式占位符
                // 如果包含，说明这是数学公式的一部分，不应该提取大括号
                const bracePreview = clean.substr(i, Math.min(100, clean.length - i));
                if (bracePreview.includes('@@MATH')) {
                    // 包含数学公式占位符，保留原样
                    processed += clean[i];
                    i++;
                    continue;
                }
                // 处理普通大括号包裹的内容（多行单元格）
                const braceResult = extractBraceContent(clean, i);
                // 保留大括号中的内容，但处理换行
                let content = braceResult.content;
                // 将 \\ 转换为换行
                content = content.replace(/\\\\/g, '\n');
                // 保护大括号内的 & 符号（多行单元格中可能包含 &）
                content = content.replace(/&/g, '@@AMPERSAND@@');
                processed += content;
                i = braceResult.endIdx;
                continue;
            } else {
                processed += clean[i];
                i++;
            }
        }
        
        clean = processed;
        
        // 恢复数学公式
        mathPlaceholders.forEach((math, idx) => {
            // 先恢复块级公式
            clean = clean.replace(`@@MATHBLOCK${idx}@@`, math);
            // 再恢复内联公式
            clean = clean.replace(`@@MATHINLINE${idx}@@`, math);
        });
        
        // 移除列对齐标记（如 m{4cm}，如果还有残留）
        clean = clean.replace(/\{m\{[^}]*\}\}/g, '');
        clean = clean.replace(/\{[clr]\}/g, '');
        
        // 将行尾的 \\ 转换为空格
        clean = clean.replace(/\\\\/g, ' ');
        
        // 移除多余的空白字符，但保留换行
        clean = clean.replace(/[ \t]+/g, ' ');
        clean = clean.replace(/\n\s*\n/g, '\n');
        
        // 分割单元格（只分割不在占位符中的 &）
        const parts = clean.split('&').map(cell => {
            let cellContent = cell.trim();
            // 恢复单元格内的 & 符号
            cellContent = cellContent.replace(/@@AMPERSAND@@/g, '&');
            // 移除残留的大括号（如果还有，但要小心不要破坏数学公式）
            // 只移除开头和结尾的单独大括号，不要移除数学公式中的大括号
            cellContent = cellContent.replace(/^\{([^{$]*)\}$/, '$1');
            // 转换内联 LaTeX（但保留数学公式）
            cellContent = transformInlineLatex(cellContent);
            // 将换行转换为空格（Markdown 表格单元格不支持换行）
            cellContent = cellContent.replace(/\n/g, ' ');
            // 清理多余空格（但保留数学公式中的空格）
            // 先保护数学公式
            const mathPlaceholders = [];
            // 先保护块级公式
            cellContent = cellContent.replace(/\$\$[\s\S]*?\$\$/g, (match) => {
                const idx = mathPlaceholders.length;
                mathPlaceholders.push(match);
                return `@@MATH${idx}@@`;
            });
            // 再保护内联公式
            cellContent = cellContent.replace(/\$[^$]*\$/g, (match) => {
                const idx = mathPlaceholders.length;
                mathPlaceholders.push(match);
                return `@@MATH${idx}@@`;
            });
            // 清理多余空格
            cellContent = cellContent.replace(/\s+/g, ' ').trim();
            // 恢复数学公式
            mathPlaceholders.forEach((math, idx) => {
                cellContent = cellContent.replace(`@@MATH${idx}@@`, math);
            });
            return cellContent;
        });
        
        return parts;
    };

    for (let rawLine of lines) {
        let line = rawLine.trim();

        if (line.startsWith('%')) {
            continue;
        }

        // 去掉纯注释行
        if (!line) {
            if (pendingListItem !== null && (inItemize || inEnumerate)) {
                pendingListItem += '\n';
                continue;
            }
            flushListItem();
            md += '\n';
            continue;
        }

        // --- lstlisting 代码块 ---
        if (line.startsWith('\\begin{lstlisting')) {
            flushListItem();
            inLstlisting = true;
            const langMatch = line.match(/language=([a-zA-Z0-9]+)/);
            lstLanguage = langMatch ? langMatch[1].toLowerCase() : '';
            lstLines = [];
            continue;
        }
        if (line.startsWith('\\end{lstlisting}')) {
            inLstlisting = false;
            const langSuffix = lstLanguage ? lstLanguage : '';
            md += '```' + langSuffix + '\n' + lstLines.join('\n') + '\n```\n\n';
            lstLanguage = '';
            lstLines = [];
            continue;
        }
        if (inLstlisting) {
            lstLines.push(rawLine);
            continue;
        }

        // 处理 longtblr 选项的跨行累积
        if (longtblrOptionsBuffer !== null) {
            longtblrOptionsBuffer += rawLine;
            if (rawLine.includes(']')) {
                const options = longtblrOptionsBuffer.slice(0, longtblrOptionsBuffer.indexOf(']'));
                const capMatch = options.match(/caption\s*=\s*\{([^}]*)\}/i);
                if (capMatch && capMatch[1]) tableCaption = capMatch[1].trim();
                longtblrOptionsBuffer = null;
            }
            continue;
        }

        // --- letter 环境（仅作为标题保留） ---
        if (line.startsWith('\\begin{letter')) {
            flushListItem();
            const m = line.match(/\\begin\{letter\}\{([^}]*)\}/);
            if (m && m[1]) {
                md += `### ${transformInlineLatex(m[1])}\n\n`;
            }
            continue;
        }
        if (line.startsWith('\\end{letter}')) {
            flushListItem();
            md += '\n';
            continue;
        }

        // --- equation 环境 ---
        const inlineEquation = line.match(/\\begin\{equation\*?\}\s*(.+)\s*\\end\{equation\*?\}/);
        if (inlineEquation) {
            flushListItem();
            md += `$$ ${inlineEquation[1].trim()} $$\n\n`;
            continue;
        }
        const displayMatch = line.match(/^\\\[(.*)\\\]$/);
        if (displayMatch) {
            flushListItem();
            md += `$$ ${displayMatch[1].trim()} $$\n\n`;
            continue;
        }
        if (line.startsWith('\\begin{equation')) {
            flushListItem();
            inEquation = true;
            equationLines = [];
            continue;
        }
        if (line === '\\[') {
            flushListItem();
            inEquation = true;
            equationLines = [];
            continue;
        }
        if (inEquation) {
            if (line.startsWith('\\end{equation}') || line === '\\]') {
                const eq = equationLines.join(' ').trim();
                if (eq) {
                    md += `$$ ${eq} $$\n\n`;
                }
                inEquation = false;
                equationLines = [];
            } else {
                equationLines.push(line);
            }
            continue;
        }

        // --- verbatim (代码块) ---
        if (line.startsWith('\\begin{verbatim}')) {
            flushListItem();
            inVerbatim = true;
            md += '```\n';
            continue;
        }
        if (line.startsWith('\\end{verbatim}')) {
            inVerbatim = false;
            md += '```\n\n';
            continue;
        }
        if (inVerbatim) {
            md += rawLine + '\n';
            continue;
        }

        // --- figure 环境 ---
        if (line.startsWith('\\begin{figure')) {
            flushListItem();
            inFigure = true;
            figureDepth = 1;
            figureContent = '';
            continue;
        }
        if (line.startsWith('\\end{figure}')) {
            figureDepth--;
            if (figureDepth === 0) {
                // 从 figure 内容提取图片与标题
                const imgMatch = figureContent.match(/\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/);
                const captionMatch = figureContent.match(/\\caption\{([^}]*)\}/);
                const path = imgMatch ? decodeLatexPath(imgMatch[1]) : '';
                const caption = captionMatch ? captionMatch[1].trim() : '';
                if (path) {
                    md += `![${caption}](${path})\n\n`;
                } else if (figureContent.trim()) {
                    // 无法识别图片时，降级为普通文本
                    md += transformInlineLatex(figureContent.trim()) + '\n\n';
                }
                inFigure = false;
                figureContent = '';
            }
            continue;
        }
        if (inFigure) {
            if (line.startsWith('\\begin{figure')) {
                figureDepth++;
            }
            figureContent += rawLine + '\n';
            continue;
        }

        if (line.startsWith('\\begin{itemize}')) {
            flushListItem();
            inItemize = true;
            continue;
        }
        if (line.startsWith('\\end{itemize}')) {
            flushListItem();
            inItemize = false;
            md += '\n';
            continue;
        }

        // --- enumerate 列表 ---
        if (line.startsWith('\\begin{enumerate}')) {
            flushListItem();
            inEnumerate = true;
            enumerateIndex = 1;
            continue;
        }
        if (line.startsWith('\\end{enumerate}')) {
            flushListItem();
            inEnumerate = false;
            md += '\n';
            continue;
        }

        if (line.startsWith('\\item')) {
            flushListItem();
            const itemText = transformInlineLatex(line.replace(/^\\item(\[[^\]]*\])?\s*/, ''));
            pendingListItem = itemText;
            if (!inItemize && !inEnumerate) {
                flushListItem();
            }
            continue;
        }

        // 如果在列表环境中且当前行是纯文本，追加到当前列表项
        if ((inItemize || inEnumerate) && !line.startsWith('\\')) {
            const continuation = transformInlineLatex(line);
            appendToPendingItem(continuation);
            continue;
        }

        // --- blockquote ---
        if (line.startsWith('\\begin{quote}')) {
            flushListItem();
            inQuote = true;
            continue;
        }
        if (line.startsWith('\\end{quote}')) {
            flushListItem();
            inQuote = false;
            md += '\n';
            continue;
        }
        if (inQuote) {
            md += `> ${line}\n`;
            continue;
        }

        // --- hr ---
        if (line === '\\hrulefill') {
            flushListItem();
            md += '\n---\n\n';
            continue;
        }

        // --- headings ---
        const headingMatch = line.match(/^\\(section|subsection|subsubsection)\*?\{(.+)\}/);
        if (headingMatch) {
            flushListItem();
            const cmd = headingMatch[1];
            const title = headingMatch[2];
            const prefix = headingMap[cmd] || '#';
            md += `${prefix} ${title}\n\n`;
            continue;
        }

        // --- 图片 ---
        // 注意：如果图片在 figure 环境中，已经在 figure 处理中包含了，这里跳过
        if (!inFigure && line.startsWith('\\includegraphics')) {
            flushListItem();
            const match = line.match(/\\includegraphics\[.*\]\{(.+)\}/);
            if (match) {
                const path = match[1];
                // caption 要在 figure 里
                md += `![](${decodeLatexPath(path)})\n\n`;
            }
            continue;
        }
        if (!inFigure && line.startsWith('\\caption{')) {
            const caption = line.replace(/\\caption\{(.+)\}/, '$1');
            md = md.replace(/!\[\]\((.+?)\)/, `![$1]($1 "${caption}")`);
            continue;
        }

        // --- 链接 ---
        const linkMatch = line.match(/\\href\{(.+?)\}\{(.+?)\}/);
        if (linkMatch) {
            flushListItem();
            md += `[${linkMatch[2]}](${linkMatch[1]})\n\n`;
            continue;
        }

        // --- 表格 ---
        if (line.startsWith('\\begin{tabular}')) {
            flushListItem();
            inTable = true;
            tableType = 'tabular';
            tableRows = [];
            continue;
        }
        if (line.startsWith('\\begin{longtblr}')) {
            flushListItem();
            inTable = true;
            tableType = 'longtblr';
            tableRows = [];
            tableCaption = '';
            headerBreakIndex = null;
            // 解析 caption 选项，可跨行
            if (line.includes('[') && !line.includes(']')) {
                longtblrOptionsBuffer = line.slice(line.indexOf('[') + 1);
            } else {
                const options = line.includes('[') && line.includes(']')
                    ? line.slice(line.indexOf('[') + 1, line.lastIndexOf(']'))
                    : '';
                if (options) {
                    const capMatch = options.match(/caption\s*=\s*\{([^}]*)\}/i);
                    if (capMatch && capMatch[1]) tableCaption = capMatch[1].trim();
                }
            }
            continue;
        }
        if (line.startsWith('\\begin{longtable}')) {
            flushListItem();
            inTable = true;
            tableType = 'longtable';
            tableRows = [];
            tableCaption = '';
            headerBreakIndex = null;
            continue;
        }
        if (inTable && line.includes('\\caption{')) {
            // 提取 caption 内容，处理 \caption{...}\label{...} \\ 格式
            // 注意：caption 可能在行的开头，也可能在中间（后面可能有 \\ 或其他内容）
            const capMatch = line.match(/\\caption\{([^}]*)\}/);
            if (capMatch && capMatch[1]) {
                tableCaption = transformInlineLatex(capMatch[1].trim());
            }
            // 移除 caption 和 label，检查剩余内容
            let remainingLine = line.replace(/\\caption\{[^}]*\}/, '')
                                    .replace(/\\label\{[^}]*\}/, '')
                                    .replace(/\\\\/g, '')
                                    .trim();
            // 如果这一行只有 caption 和可能的 label/\\，则跳过这一行
            if (remainingLine.length === 0) {
                continue;
            }
            // 否则，移除 caption 和 label，继续处理剩余内容
            line = remainingLine;
        }
        if (inTable && (line.startsWith('\\end{tabular}') || line.startsWith('\\end{longtable}') || line.startsWith('\\end{longtblr}'))) {
            flushListItem();
            inTable = false;
            pushTableRows();
            continue;
        }
        if (inTable) {
            // 移除行中的 \endfirsthead 等命令（可能在行中或行尾）
            line = line.replace(/\\endfirsthead\b/g, '');
            line = line.replace(/\\endhead\b/g, '');
            line = line.replace(/\\endfoot\b/g, '');
            line = line.replace(/\\endlastfoot\b/g, '');
            line = line.trim();
            
            if (!line) {
                continue;
            }
            
            if (/^\\hline\b/i.test(line)) {
                continue;
            }
            if (/^\\endfirsthead/i.test(line)) {
                tableRows = [];
                headerBreakIndex = null;
                continue;
            }
            if (/^\\(toprule|midrule|bottomrule)\b/i.test(line)) {
                if (headerBreakIndex === null && /midrule/i.test(line)) {
                    headerBreakIndex = tableRows.length;
                }
                continue;
            }
            if (/^\\end(firsthead|head|foot|lastfoot)/i.test(line)) {
                continue;
            }
            if (/^\\(label|centering|vline|hline)/i.test(line)) {
                continue;
            }
            // 跳过续页标记行
            // 检查是否是续页标记（可能跨多行，通过 % 连接）
            if (/\\multicolumn\{[^}]+\}\{[^}]+\}.*%/.test(line) && 
                (line.includes('\\tablename') || line.includes('Continued'))) {
                continue;
            }
            if (/\\multicolumn\{[^}]+\}\{[^}]+\}\{.*\\tablename.*\\thetable/i.test(line) || 
                /Continued from previous page/i.test(line) || 
                /Continued on next page/i.test(line)) {
                continue;
            }
            // 跳过纯 multicolumn 续页标记（只有 multicolumn 没有内容或只有续页文本）
            if (/^\\multicolumn\{[^}]+\}\{[^}]+\}\{.*Continued/i.test(line)) {
                continue;
            }
            // 跳过只有 multicolumn{2}{c}% 这样的续页标记行
            if (/^\\multicolumn\{[^}]+\}\{[^}]+\}%?\s*$/.test(line) || 
                (/^\\multicolumn\{[^}]+\}\{[^}]+\}%/.test(line) && !line.includes('&'))) {
                continue;
            }
            
            // 检查是否是表格行（包含 &）
            if (line.includes('&')) {
                const row = parseTableRow(line);
                if (row.length > 0) {
                    tableRows.push(row);
                }
                continue;
            }
        }

        // --- 参考文献环境 ---
        if (line.startsWith('\\begin{thebibliography}')) {
            flushListItem();
            inBibliography = true;
            continue;
        }
        if (line.startsWith('\\end{thebibliography}')) {
            flushListItem();
            inBibliography = false;
            currentBibItem = null;
            // 注意：参考文献列表会在函数结束时统一输出，避免重复
            continue;
        }
        
        // --- 处理 \bibitem ---
        const bibitemMatch = line.match(/\\bibitem(?:\[[^\]]*\])?\{([^}]+)\}/);
        if (bibitemMatch) {
            currentBibItem = bibitemMatch[1];
            // 提取 bibitem 后面的内容
            const afterBibitem = line.replace(/\\bibitem(?:\[[^\]]*\])?\{[^}]+\}\s*/, '').trim();
            if (afterBibitem) {
                bibliography.set(currentBibItem, transformInlineLatex(afterBibitem));
            } else {
                bibliography.set(currentBibItem, '');
            }
            // 如果在 thebibliography 环境中，跳过这一行
            if (inBibliography) {
                continue;
            }
            // 如果不在 thebibliography 环境中，继续处理这一行（移除 \bibitem，保留内容）
            line = afterBibitem;
        }
        
        // 如果当前在处理 bibitem 且在 thebibliography 环境中，继续收集内容
        if (inBibliography && currentBibItem !== null) {
            const content = transformInlineLatex(line);
            if (content.trim()) {
                const existing = bibliography.get(currentBibItem) || '';
                bibliography.set(currentBibItem, existing + (existing ? ' ' : '') + content.trim());
            }
            continue;
        }
        
        // --- 处理 \cite ---
        // 处理行中的 \cite{key} 或 \cite{key1,key2}
        if (line.includes('\\cite')) {
            // 匹配 \cite{key} 或 \cite{key1,key2,key3}
            line = line.replace(/\\cite\{([^}]+)\}/g, (match, keys) => {
                // 分割多个 key（用逗号分隔）
                const keyList = keys.split(',').map(k => k.trim()).filter(k => k);
                // 转换为 Markdown 引用格式 [[1](#ref-1)][[2](#ref-2)]
                return keyList.map(k => `[[${k}](#ref-${k})]`).join('');
            });
        }
        
        // --- 脚注 ---
        const footnoteMatch = line.match(/\\footnote\{(.+)\}/);
        if (footnoteMatch) {
            flushListItem();
            md += `[^1]: ${footnoteMatch[1]}\n`;
            continue;
        }

        // --- 内联格式 ---
        if (line.startsWith('\\begin{center}') || line.startsWith('\\end{center}')) {
            flushListItem();
            continue;
        }

        // --- 处理未识别的环境 ---
        // 检测 \begin{xxx} 和 \end{xxx}
        const beginMatch = line.match(/^\\begin\{([^}]+)\}/);
        const endMatch = line.match(/^\\end\{([^}]+)\}/);
        
        if (beginMatch) {
            const envName = beginMatch[1];
            // 如果是未识别的环境，开始跟踪
            if (!knownEnvironments.has(envName)) {
                unknownEnvStack.push(envName);
                flushListItem();
                // 移除 \begin{xxx}，保留后面的内容（如果有）
                const afterBegin = line.replace(/^\\begin\{[^}]+\}(?:\[[^\]]*\])?/, '').trim();
                if (afterBegin) {
                    const text = transformInlineLatex(afterBegin);
                    if (text.trim()) {
                        md += text + '\n';
                    }
                }
                continue;
            }
        }
        
        if (endMatch) {
            const envName = endMatch[1];
            // 如果是未识别的环境，结束跟踪
            if (!knownEnvironments.has(envName)) {
                // 检查栈中是否有匹配的环境（支持嵌套）
                const envIndex = unknownEnvStack.lastIndexOf(envName);
                if (envIndex !== -1) {
                    // 移除从匹配位置到栈顶的所有环境（处理嵌套情况）
                    unknownEnvStack = unknownEnvStack.slice(0, envIndex);
                    flushListItem();
                    // 移除 \end{xxx}，保留前面的内容（如果有）
                    const beforeEnd = line.replace(/\\end\{[^}]+\}.*$/, '').trim();
                    if (beforeEnd) {
                        const text = transformInlineLatex(beforeEnd);
                        if (text.trim()) {
                            md += text + '\n';
                        }
                    }
                    continue;
                }
            }
        }
        
        // 如果当前在未识别的环境中，保留内容
        // 注意：这里不处理 \begin{xxx} 和 \end{xxx}，因为它们会在上面的逻辑中处理
        if (unknownEnvStack.length > 0) {
            const text = transformInlineLatex(line);
            if (text.trim()) {
                md += text + '\n';
            }
            continue;
        }

        // 跳过控制命令（不产生可见内容的命令）
        if (CONTROL_COMMAND_REGEX.test(line)) {
            flushListItem();
            continue;
        }

        if (IGNORED_INLINE_COMMAND_REGEX.test(line)) {
            continue;
        }

        const text = transformInlineLatex(line);
        flushListItem();

        if (text.trim()) {
            md += text + '\n';
        }
    }

    flushListItem();

    // 输出参考文献列表（如果不在 thebibliography 环境中，也要输出）
    // 不输出标题，只输出 <div id="ref-X"/> 和内容，让用户自己决定是否添加标题
    if (bibliography.size > 0) {
        md += '\n';
        // 按 key 排序输出
        const sortedKeys = Array.from(bibliography.keys()).sort((a, b) => {
            // 尝试按数字排序，如果不是数字则按字符串排序
            const numA = parseInt(a);
            const numB = parseInt(b);
            if (!isNaN(numA) && !isNaN(numB)) {
                return numA - numB;
            }
            return a.localeCompare(b);
        });
        sortedKeys.forEach((key, index) => {
            const content = bibliography.get(key);
            // 添加锚点并输出参考文献
            md += `<div id="ref-${key}"/>\n\n`;
            md += `[${index + 1}] ${content}\n\n`;
        });
    }

    return md.trim();
}

// 路径反转义
function decodeLatexPath(path) {
    return path
        .replace(/\\([#%&{}_])/g, '$1')
        .replace(/\\/g, '/');
}


export function extractOutlineTreeFromLatex(latex, bypassText = false) {
    const md = convertLatexToMarkdown(latex); // 需要写/引入一个 LaTeX→Markdown 转换器
    return extractOutlineTreeFromMarkdown(md, bypassText);
}

/**
 * 从 LaTeX 文本中提取完整的大纲（返回Markdown格式，而非JSON）
 * @param latex LaTeX文本
 * @param bypassText 是否跳过文本内容
 * @returns 完整的Markdown大纲字符串（包含标题和文本内容）
 */
export function extractOutlineTreeFromLatexLight(latex, bypassText = false) {
    const md = convertLatexToMarkdown(latex);
    const outlineTree = extractOutlineTreeFromMarkdown(md, bypassText);
    return generateMarkdownFromOutlineTree(outlineTree);
}
export function generateLatexFromOutlineTree(outline_tree, title = 'Generated Document') {
    // 先生成 Markdown
    const md = generateMarkdownFromOutlineTree(outline_tree);
    // 再用你现有的转换方法转 LaTeX
    return convertMarkdownToLatex(md, title);
}

const PREAMBLE_COMMAND_REGEX = /^\\(documentclass|usepackage|set(?:main|sans|mono|CJK(?:main|sans|mono))font|geometry|pagestyle|fancyhf|lhead|rhead|cfoot|title|author|date|thanks|linespread|hypersetup|renewcommand|setcounter|addtolength|footnotesize|scriptsize|fontsize|clearpage|newpage|thispagestyle|maketitle)\b/i;
const LABEL_COMMAND_REGEX = /^\\label\{.*\}$/;
const BEGIN_DOC = '\\begin{document}';
const END_DOC = '\\end{document}';
const IGNORED_INLINE_COMMAND_REGEX = /^\\(setlength|noindent|centering|raggedright|raggedleft|hspace|vspace|newline|bigskip|smallskip)\b/i;
// 控制命令：这些命令不产生可见内容，应该被忽略
const CONTROL_COMMAND_REGEX = /^\\(tableofcontents|listoffigures|listoftables|cleardoublepage|clearpage|newpage|thispagestyle|pagestyle|pagenumbering|setcounter|addtocounter|markboth|markright|phantomsection)\b/i;

function sanitizeLatexInput(latex) {
    if (!latex) return '';
    const normalized = latex.replace(/\r\n/g, '\n');
    const startIdx = normalized.indexOf(BEGIN_DOC);
    const endIdx = normalized.lastIndexOf(END_DOC);
    let body = normalized;

    if (startIdx !== -1) {
        const contentStart = startIdx + BEGIN_DOC.length;
        body = normalized.slice(contentStart, endIdx !== -1 ? endIdx : undefined);
    }

    const lines = body.split('\n');
    const filtered = [];

    for (let rawLine of lines) {
        // 移除未转义的注释
        const withoutComment = rawLine.replace(/(^|[^\\])%.*$/, '$1').replace(/\s+$/, '');
        const trimmed = withoutComment.trim();
        if (!trimmed) {
            filtered.push('');
            continue;
        }

        if (PREAMBLE_COMMAND_REGEX.test(trimmed)) {
            continue;
        }
        if (LABEL_COMMAND_REGEX.test(trimmed)) {
            continue;
        }
        // 过滤控制命令（不产生可见内容的命令）
        if (CONTROL_COMMAND_REGEX.test(trimmed)) {
            continue;
        }
        if (trimmed === BEGIN_DOC || trimmed === END_DOC) {
            continue;
        }

        filtered.push(withoutComment);
    }

    return filtered.join('\n');
}

function transformInlineLatex(line) {
    if (!line) return '';
    let text = line;
    
    // 先保护数学公式（$...$ 和 \(...\) 和 \[...\]）
    const mathPlaceholders = [];
    const mathTypes = []; // 记录每个占位符的类型
    // 保护块级数学公式 \[...\]（非贪婪匹配）
    text = text.replace(/\\\[[\s\S]*?\\\]/g, (match) => {
        const idx = mathPlaceholders.length;
        mathPlaceholders.push(match);
        mathTypes.push('block');
        return `@@MATH${idx}@@`;
    });
    // 保护内联数学公式 \(...\)（非贪婪匹配，支持嵌套括号）
    text = text.replace(/\\\([\s\S]*?\\\)/g, (match) => {
        const idx = mathPlaceholders.length;
        mathPlaceholders.push(match);
        mathTypes.push('inline');
        return `@@MATH${idx}@@`;
    });
    // 保护 $...$ 数学公式（非贪婪匹配）
    text = text.replace(/\$[^$]*?\$/g, (match) => {
        const idx = mathPlaceholders.length;
        mathPlaceholders.push(match);
        mathTypes.push('dollar');
        return `@@MATH${idx}@@`;
    });
    
    // 先移除控制命令（不产生可见内容的命令）
    text = text.replace(/\\tableofcontents\b/g, '')
        .replace(/\\listoffigures\b/g, '')
        .replace(/\\listoftables\b/g, '')
        .replace(/\\cleardoublepage\b/g, '')
        .replace(/\\clearpage\b/g, '')
        .replace(/\\newpage\b/g, '')
        .replace(/\\thispagestyle\{[^}]*\}\b/g, '')
        .replace(/\\pagestyle\{[^}]*\}\b/g, '')
        .replace(/\\pagenumbering\{[^}]*\}\b/g, '')
        .replace(/\\setcounter\{[^}]*\}\{[^}]*\}\b/g, '')
        .replace(/\\addtocounter\{[^}]*\}\{[^}]*\}\b/g, '')
        .replace(/\\markboth\{[^}]*\}\{[^}]*\}\b/g, '')
        .replace(/\\markright\{[^}]*\}\b/g, '')
        .replace(/\\phantomsection\b/g, '');
    
    // 移除表格相关的控制命令
    text = text.replace(/\\centering\b/g, '');
    
    // 辅助函数：提取大括号内容（处理嵌套，跳过数学公式占位符）
    const extractBrace = (str, startIdx) => {
        if (startIdx >= str.length || str[startIdx] !== '{') return { content: '', endIdx: startIdx };
        let depth = 0;
        let i = startIdx;
        while (i < str.length) {
            // 跳过数学公式占位符
            if (str.substr(i).startsWith('@@MATH')) {
                const placeholderEnd = str.indexOf('@@', i + 6);
                if (placeholderEnd !== -1) {
                    i = placeholderEnd + 2;
                    continue;
                }
            }
            if (str[i] === '\\' && i + 1 < str.length) {
                i += 2;
                continue;
            }
            if (str[i] === '{') depth++;
            else if (str[i] === '}') {
                depth--;
                if (depth === 0) {
                    return { content: str.substring(startIdx + 1, i), endIdx: i + 1 };
                }
            }
            i++;
        }
        return { content: '', endIdx: str.length };
    };
    
    // 处理嵌套大括号的命令（如 \textbf{...}）
    const processNestedCommands = (str) => {
        let result = '';
        let i = 0;
        while (i < str.length) {
            // 处理 \textbf{...}
            if (str.substr(i).startsWith('\\textbf')) {
                const match = str.substr(i).match(/\\textbf/);
                if (match) {
                    const cmdEnd = i + match[0].length;
                    const brace = extractBrace(str, cmdEnd);
                    result += '**' + processNestedCommands(brace.content) + '**';
                    i = brace.endIdx;
                    continue;
                }
            }
            // 处理 \textit{...}
            if (str.substr(i).startsWith('\\textit')) {
                const match = str.substr(i).match(/\\textit/);
                if (match) {
                    const cmdEnd = i + match[0].length;
                    const brace = extractBrace(str, cmdEnd);
                    result += '*' + processNestedCommands(brace.content) + '*';
                    i = brace.endIdx;
                    continue;
                }
            }
            // 处理 \emph{...}
            if (str.substr(i).startsWith('\\emph')) {
                const match = str.substr(i).match(/\\emph/);
                if (match) {
                    const cmdEnd = i + match[0].length;
                    const brace = extractBrace(str, cmdEnd);
                    result += '*' + processNestedCommands(brace.content) + '*';
                    i = brace.endIdx;
                    continue;
                }
            }
            // 处理 \sout{...}
            if (str.substr(i).startsWith('\\sout')) {
                const match = str.substr(i).match(/\\sout/);
                if (match) {
                    const cmdEnd = i + match[0].length;
                    const brace = extractBrace(str, cmdEnd);
                    result += '~~' + processNestedCommands(brace.content) + '~~';
                    i = brace.endIdx;
                    continue;
                }
            }
            // 处理 \uline{...}
            if (str.substr(i).startsWith('\\uline')) {
                const match = str.substr(i).match(/\\uline/);
                if (match) {
                    const cmdEnd = i + match[0].length;
                    const brace = extractBrace(str, cmdEnd);
                    result += '<u>' + processNestedCommands(brace.content) + '</u>';
                    i = brace.endIdx;
                    continue;
                }
            }
            // 处理 \texttt{...}
            if (str.substr(i).startsWith('\\texttt')) {
                const match = str.substr(i).match(/\\texttt/);
                if (match) {
                    const cmdEnd = i + match[0].length;
                    const brace = extractBrace(str, cmdEnd);
                    result += '`' + processNestedCommands(brace.content) + '`';
                    i = brace.endIdx;
                    continue;
                }
            }
            // 处理 \ref{...}
            if (str.substr(i).startsWith('\\ref')) {
                const match = str.substr(i).match(/\\ref/);
                if (match) {
                    const cmdEnd = i + match[0].length;
                    const brace = extractBrace(str, cmdEnd);
                    result += brace.content;
                    i = brace.endIdx;
                    continue;
                }
            }
            // 处理 \cite{...}
            if (str.substr(i).startsWith('\\cite')) {
                const match = str.substr(i).match(/\\cite/);
                if (match) {
                    const cmdEnd = i + match[0].length;
                    const brace = extractBrace(str, cmdEnd);
                    // 分割多个 key（用逗号分隔）
                    const keyList = brace.content.split(',').map(k => k.trim()).filter(k => k);
                    // 转换为 Markdown 引用格式 [[1](#ref-1)][[2](#ref-2)]
                    result += keyList.map(k => `[[${k}](#ref-${k})]`).join('');
                    i = brace.endIdx;
                    continue;
                }
            }
            result += str[i];
            i++;
        }
        return result;
    };
    
    // 先处理嵌套命令
    text = processNestedCommands(text);
    
    // 恢复数学公式占位符并转换
    mathPlaceholders.forEach((math, idx) => {
        let converted = math;
        const type = mathTypes[idx];
        // 转换 \(...\) 为 $...$
        if (type === 'inline') {
            converted = '$' + math.slice(2, -2) + '$';
        }
        // 转换 \[...\] 为 $$...$$
        else if (type === 'block') {
            converted = '$$' + math.slice(2, -2).trim() + '$$';
        }
        // $...$ 保持不变
        // else if (type === 'dollar') {
        //     converted = math;
        // }
        text = text.replace(`@@MATH${idx}@@`, converted);
    });
    
    // 处理转义的字符：转义的 & 符号应该转换为普通的 &
    // 注意：这应该在处理其他命令之后，但在最终输出之前
    text = text.replace(/\\&/g, '&');
    
    // 处理其他简单替换
    text = text
        .replace(/\\begin\{center\}|\s*\\end\{center\}/g, '')
        .replace(/\\%/g, '%');

    text = text
        .replace(/\\smiley\{\}/g, ':smile:')
        .replace(/\\heartsuit\{\}/g, ':heart:')
        .replace(/\\checkmark\{\}/g, ':check:')
        .replace(/\$\\times\$/g, ':x:');

    text = text.replace(/~+/g, ' ');

    return text.trimEnd();
}


