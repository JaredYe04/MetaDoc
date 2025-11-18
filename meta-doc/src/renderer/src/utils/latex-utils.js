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
    text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, content) => {
        const index = placeholders.length;
        placeholders.push('$$' + content + '$$');
        return `@@MATHBLOCK:${index}@@`;
    });

    // 再处理内联 $...$（避免和 $$...$$ 冲突，且不跨行）
    text = text.replace(/(^|[^\$])\$(?!\$)([^ \n][\s\S]*?[^ \n])\$(?!\$)/g, (m, prefix, content) => {
        const index = placeholders.length;
        placeholders.push('$' + content + '$');
        return `${prefix}@@MATHINLINE:${index}@@`;
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

export async function convertMarkdownToLatex(markdown, title = 'Generated Document') {
    // 提前抽取数学公式，避免后续字符转义破坏 TeX 语法
    const { text: markdownWithoutMath, placeholders } = extractMathPlaceholders(markdown);
    let body = await convertTokensToLatex(md.parse(markdownWithoutMath, {}));
    // 转换完成后再恢复数学公式原文
    body = restoreMathPlaceholders(body, placeholders);
    const latex = `
\\documentclass{article}
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
            case 'text': latex += escapeLatex(token.content); break;

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
            case 'code_block':
                latex += `\\begin{verbatim}\n${token.content}\\end{verbatim}\n\n`;
                break;

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
                        // 获取 IPC 渲染器
                        let ipcRenderer = null;
                        if (window && window.electron) {
                            ipcRenderer = window.electron.ipcRenderer;
                        } else {
                            const localIpcRenderer = (await import('./web-adapter/local-ipc-renderer.ts')).default;
                            ipcRenderer = localIpcRenderer;
                        }
                        
                        if (ipcRenderer) {
                            // 调用主进程转换 SVG 为 PDF
                            const result = await ipcRenderer.invoke('convert-svg-to-pdf', normalizedPath);
                            if (result.success && result.pdfPath) {
                                // 使用转换后的 PDF 路径
                                normalizedPath = result.pdfPath.replace(/\\/g, '/');
                            } else {
                                // 转换失败，使用原始 SVG 路径（可能会失败，但至少可以尝试）
                                console.warn('SVG 转 PDF 失败，使用原始路径:', result.error);
                            }
                        }
                    } catch (error) {
                        // IPC 调用失败，使用原始 SVG 路径
                        console.warn('SVG 转 PDF IPC 调用失败:', error);
                    }
                    
                    // 路径处理：使用 \detokenize 避免转义问题，保留下划线等字符
                    normalizedPath = normalizedPath.replace(/\\/g, '/').replace(/([{}])/g, '\\$1');
                    
                    // 对于 PDF（转换后的 SVG），使用标准的 includegraphics
                    latex += `
\\begin{figure}[h]
  \\centering
  \\includegraphics[width=0.8\\textwidth]{\\detokenize{${normalizedPath}}}
  \\caption{${alt}}
\\end{figure}
`;
                } else {
                    // 其他图片格式：需要转义所有特殊字符（包括下划线）
                    normalizedPath = normalizedPath.replace(/([#%&{}_])/g, '\\$1');
                    
                    latex += `
\\begin{figure}[h]
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
                latex += await convertTokensToLatex(token.children || []);
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
                latex += `\\begin{tabular}{${defaultAlign}}\n\\hline\n`;

                for (let row of rows) {
                    latex += row.cells.join(' & ') + ' \\\\ \\hline\n';
                }

                latex += '\\end{tabular}\n\n';
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
    let tableRows = [];
    let pendingListItem = null;
    let enumerateIndex = 1;

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

    for (let rawLine of lines) {
        const line = rawLine.trim();

        if (!line) {
            if (pendingListItem !== null && (inItemize || inEnumerate)) {
                pendingListItem += '\n';
                continue;
            }
            flushListItem();
            md += '\n';
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

        // --- itemize 列表 ---
        if (line.startsWith('\\begin{figure')) {
            flushListItem();
            continue;
        }
        if (line.startsWith('\\end{figure}')) {
            flushListItem();
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
        if (line.startsWith('\\includegraphics')) {
            flushListItem();
            const match = line.match(/\\includegraphics\[.*\]\{(.+)\}/);
            if (match) {
                const path = match[1];
                // caption 要在 figure 里
                md += `![](${decodeLatexPath(path)})\n\n`;
            }
            continue;
        }
        if (line.startsWith('\\caption{')) {
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
            tableRows = [];
            continue;
        }
        if (line.startsWith('\\end{tabular}')) {
            flushListItem();
            inTable = false;
            // 渲染 markdown 表格
            if (tableRows.length > 0) {
                const colCount = tableRows[0].length;
                md += '\n' + tableRows.map(r => '| ' + r.join(' | ') + ' |').join('\n') + '\n';
                md += '| ' + Array(colCount).fill('---').join(' | ') + ' |\n\n';
            }
            continue;
        }
        if (inTable && line.includes('&')) {
            const row = line.replace(/\\\\.*/, '').split('&').map(cell => cell.trim());
            tableRows.push(row);
            continue;
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
        const trimmed = rawLine.trim();
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
        if (trimmed === BEGIN_DOC || trimmed === END_DOC) {
            continue;
        }

        filtered.push(rawLine);
    }

    return filtered.join('\n');
}

function transformInlineLatex(line) {
    if (!line) return '';
    let text = line;
    text = text
        .replace(/\\textbf\{([^{}]*)\}/g, '**$1**')
        .replace(/\\textit\{([^{}]*)\}/g, '*$1*')
        .replace(/\\emph\{([^{}]*)\}/g, '*$1*')
        .replace(/\\sout\{([^{}]*)\}/g, '~~$1~~')
        .replace(/\\uline\{([^{}]*)\}/g, '<u>$1</u>')
        .replace(/\\texttt\{([^{}]*)\}/g, '`$1`')
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

