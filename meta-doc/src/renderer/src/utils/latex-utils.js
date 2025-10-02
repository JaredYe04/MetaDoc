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
export function convertMarkdownToLatex(markdown, title = 'Generated Document') {
    const body = convertTokensToLatex(md.parse(markdown, {}));
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

\\setmainfont{SimSun} % Windows宋体
\\setsansfont{Microsoft YaHei}
\\setCJKmainfont{SimSun} % 中文字体
\\setmonofont{Consolas}

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

function convertTokensToLatex(tokens) {
    const blocks = splitTokensIntoBlocks(tokens);
    let latex = '';

    for (const block of blocks) {
        latex += convertBlockToLatex(block) + '\n\n';
    }

    return latex.trim();
}

function convertBlockToLatex(tokens) {
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

                src = src.replace(/\\/g, '/').replace(/([#%&{}_])/g, '\\$1');

                latex += `
\\begin{figure}[h]
  \\centering
  \\includegraphics[width=0.8\\textwidth]{${src}}
  \\caption{${alt}}
\\end{figure}
`;
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
                latex += convertTokensToLatex(token.children || []);
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
function escapeLatex(str) {
    return str
        .replace(/\\/g, '\\textbackslash{}')
        .replace(/([{}_$&#%])/g, '\\$1')
        .replace(/~/g, '\\textasciitilde{}')
        .replace(/\^/g, '\\^{}');
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
    const lines = latex.split('\n');
    let md = '';
    let inItemize = false;
    let inEnumerate = false;
    let inQuote = false;
    let inVerbatim = false;
    let inTable = false;
    let tableRows = [];

    const headingMap = {
        'section': '#',
        'subsection': '##',
        'subsubsection': '###',
        'paragraph': '####',
        'subparagraph': '#####'
    };

    for (let line of lines) {
        line = line.trim();

        // --- verbatim (代码块) ---
        if (line.startsWith('\\begin{verbatim}')) {
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
            md += line + '\n';
            continue;
        }

        // --- itemize 列表 ---
        if (line.startsWith('\\begin{itemize}')) {
            inItemize = true;
            continue;
        }
        if (line.startsWith('\\end{itemize}')) {
            inItemize = false;
            md += '\n';
            continue;
        }

        // --- enumerate 列表 ---
        if (line.startsWith('\\begin{enumerate}')) {
            inEnumerate = true;
            continue;
        }
        if (line.startsWith('\\end{enumerate}')) {
            inEnumerate = false;
            md += '\n';
            continue;
        }

        if (line.startsWith('\\item ')) {
            if (inItemize) {
                md += `- ${line.replace(/^\\item\s*/, '')}\n`;
            } else if (inEnumerate) {
                md += `1. ${line.replace(/^\\item\s*/, '')}\n`;
            }
            continue;
        }

        // --- blockquote ---
        if (line.startsWith('\\begin{quote}')) {
            inQuote = true;
            continue;
        }
        if (line.startsWith('\\end{quote}')) {
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
            md += '\n---\n\n';
            continue;
        }

        // --- headings ---
        const headingMatch = line.match(/^\\(section|subsection|subsubsection|paragraph|subparagraph)\{(.+)\}/);
        if (headingMatch) {
            const cmd = headingMatch[1];
            const title = headingMatch[2];
            const prefix = headingMap[cmd] || '#';
            md += `${prefix} ${title}\n\n`;
            continue;
        }

        // --- 图片 ---
        if (line.startsWith('\\includegraphics')) {
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
            md += `[${linkMatch[2]}](${linkMatch[1]})\n\n`;
            continue;
        }

        // --- 表格 ---
        if (line.startsWith('\\begin{tabular}')) {
            inTable = true;
            tableRows = [];
            continue;
        }
        if (line.startsWith('\\end{tabular}')) {
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
            md += `[^1]: ${footnoteMatch[1]}\n`;
            continue;
        }

        // --- 内联格式 ---
        let text = line;
        text = text
            .replace(/\\textbf\{(.+?)\}/g, '**$1**')   // 粗体
            .replace(/\\emph\{(.+?)\}/g, '*$1*')       // 斜体
            .replace(/\\sout\{(.+?)\}/g, '~~$1~~')     // 删除线
            .replace(/\\texttt\{(.+?)\}/g, '`$1`');    // 行内代码

        // emoji （你原来是 smile/heart/check/x）
        text = text
            .replace(/\\smiley\{\}/g, ':smile:')
            .replace(/\\heartsuit\{\}/g, ':heart:')
            .replace(/\\checkmark\{\}/g, ':check:')
            .replace(/\$\\times\$/g, ':x:');

        if (text.trim()) {
            md += text + '\n';
        }
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
export function generateLatexFromOutlineTree(outline_tree, title = 'Generated Document') {
    // 先生成 Markdown
    const md = generateMarkdownFromOutlineTree(outline_tree);
    // 再用你现有的转换方法转 LaTeX
    return convertMarkdownToLatex(md, title);
}

