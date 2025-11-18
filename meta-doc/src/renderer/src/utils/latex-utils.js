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

