import MarkdownIt from 'markdown-it';
import footnote from 'markdown-it-footnote';
import taskLists from 'markdown-it-task-lists';

const md = new MarkdownIt({
    html: false,
    breaks: false,
    linkify: true,
})
    .use(footnote)
    .use(taskLists, { enabled: true });
export function convertMarkdownToLatex(markdown,title = 'Generated Document') {
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
    let latex = '';
    const stack = [];

    for (const token of tokens) {
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

            case 'emoji':
                latex += convertEmojiToLatex(token.markup);
                break;

            case 'inline':
                latex += convertTokensToLatex(token.children || []);
                break;

            case 'table_open': latex += '\\begin{tabular}{|c|c|c|}\\hline\n'; break;
            case 'table_close': latex += '\\end{tabular}\n'; break;

            case 'thead_open':
            case 'tbody_open': break;

            case 'tr_open': latex += ''; break;
            case 'tr_close': latex += ' \\\\ \\hline\n'; break;

            case 'th':
            case 'td':
                latex += escapeLatex(token.content) + ' & ';
                break;

            default:
                break;
        }
    }

    return latex;
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

function normalizePathForLatex(path) {
    // 将 Windows 路径转换为 Unix 兼容路径，并避免特殊字符
    return path.replace(/\\/g, '/').replace(/([#%&{}_])/g, '\\$1');
}