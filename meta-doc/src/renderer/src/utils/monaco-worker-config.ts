/**
 * Monaco Editor Worker 配置工具
 * 统一管理所有 Monaco 编辑器的 Worker 配置，避免重复代码
 */

import * as monaco from 'monaco-editor'
import { i18n } from '../i18n.js'
import { getRuntimeServerBaseUrlSync } from '../config/runtime-server'

/**
 * 配置 Monaco Environment 的 Worker
 * 应该在创建任何 Monaco 编辑器之前调用
 */
export function setupMonacoWorker(): void {
  // 如果已经配置过，直接返回
  if ((window as any).MonacoEnvironment?.getWorker) {
    return
  }

  const baseUrl = getRuntimeServerBaseUrlSync()

  ;(window as any).MonacoEnvironment = {
    getWorker: function (moduleId: string, label: string) {
      let workerPath = ''

      switch (label) {
        case 'json':
          workerPath = `${baseUrl}/monaco/language/json/json.worker.js`
          break
        case 'css':
        case 'scss':
        case 'less':
          workerPath = `${baseUrl}/monaco/language/css/css.worker.js`
          break
        case 'html':
        case 'handlebars':
        case 'razor':
          workerPath = `${baseUrl}/monaco/language/html/html.worker.js`
          break
        case 'typescript':
        case 'javascript':
          workerPath = `${baseUrl}/monaco/language/typescript/ts.worker.js`
          break
        default:
          workerPath = `${baseUrl}/monaco/editor/editor.worker.js`
      }

      // ESM worker: 用 import() 动态导入
      const blob = new Blob([`import("${workerPath}");`], { type: 'application/javascript' })

      return new Worker(URL.createObjectURL(blob), { type: 'module' })
    }
  }
}

/**
 * LaTeX 常用命令列表
 * 包含常见的 LaTeX 命令，用于自动补全
 */
const LATEX_COMMANDS = [
  // 文档结构
  'documentclass',
  'usepackage',
  'begin',
  'end',
  'document',
  'input',
  'include',
  // 章节命令
  'part',
  'chapter',
  'section',
  'subsection',
  'subsubsection',
  'paragraph',
  'subparagraph',
  // 文本格式
  'textbf',
  'textit',
  'textsl',
  'texttt',
  'textsc',
  'textsf',
  'textrm',
  'textmd',
  'textup',
  'emph',
  'underline',
  'sout',
  'textcolor',
  'colorbox',
  'fcolorbox',
  // 字体大小
  'tiny',
  'scriptsize',
  'footnotesize',
  'small',
  'normalsize',
  'large',
  'Large',
  'LARGE',
  'huge',
  'Huge',
  // 对齐和换行
  'centering',
  'raggedright',
  'raggedleft',
  'newline',
  'linebreak',
  'pagebreak',
  'newpage',
  'clearpage',
  // 列表
  'itemize',
  'enumerate',
  'description',
  'item',
  // 表格
  'table',
  'tabular',
  'hline',
  'cline',
  'multicolumn',
  'multirow',
  // 图片和浮动体
  'includegraphics',
  'figure',
  'table',
  'caption',
  'label',
  'ref',
  'pageref',
  // 数学环境
  'equation',
  'align',
  'alignat',
  'gather',
  'multline',
  'eqnarray',
  'math',
  'displaymath',
  'equation*',
  'align*',
  'gather*',
  // 数学命令
  'frac',
  'sqrt',
  'sqrt[n]',
  'sum',
  'prod',
  'int',
  'oint',
  'iint',
  'iiint',
  'lim',
  'sup',
  'inf',
  'max',
  'min',
  'det',
  'exp',
  'log',
  'ln',
  'sin',
  'cos',
  'tan',
  'alpha',
  'beta',
  'gamma',
  'delta',
  'epsilon',
  'varepsilon',
  'zeta',
  'eta',
  'theta',
  'vartheta',
  'iota',
  'kappa',
  'lambda',
  'mu',
  'nu',
  'xi',
  'pi',
  'varpi',
  'rho',
  'varrho',
  'sigma',
  'varsigma',
  'tau',
  'upsilon',
  'phi',
  'varphi',
  'chi',
  'psi',
  'omega',
  'Gamma',
  'Delta',
  'Theta',
  'Lambda',
  'Xi',
  'Pi',
  'Sigma',
  'Upsilon',
  'Phi',
  'Psi',
  'Omega',
  'cdot',
  'cdots',
  'ldots',
  'vdots',
  'ddots',
  'pm',
  'mp',
  'times',
  'div',
  'ast',
  'star',
  'circ',
  'bullet',
  'cap',
  'cup',
  'uplus',
  'sqcap',
  'sqcup',
  'vee',
  'wedge',
  'setminus',
  'wr',
  'diamond',
  'bigtriangleup',
  'bigtriangledown',
  'triangleleft',
  'triangleright',
  'lhd',
  'rhd',
  'unlhd',
  'unrhd',
  'oplus',
  'ominus',
  'otimes',
  'oslash',
  'odot',
  'leq',
  'prec',
  'preceq',
  'll',
  'subset',
  'subseteq',
  'sqsubset',
  'sqsubseteq',
  'in',
  'vdash',
  'smile',
  'frown',
  'geq',
  'succ',
  'succeq',
  'gg',
  'supset',
  'supseteq',
  'sqsupset',
  'sqsupseteq',
  'ni',
  'dashv',
  'mid',
  'parallel',
  'equiv',
  'sim',
  'simeq',
  'asymp',
  'approx',
  'cong',
  'neq',
  'doteq',
  'propto',
  'models',
  'perp',
  'leftarrow',
  'Leftarrow',
  'rightarrow',
  'Rightarrow',
  'leftrightarrow',
  'Leftrightarrow',
  'mapsto',
  'hookleftarrow',
  'leftharpoonup',
  'leftharpoondown',
  'rightleftharpoons',
  'longleftarrow',
  'Longleftarrow',
  'longrightarrow',
  'Longrightarrow',
  'longleftrightarrow',
  'Longleftrightarrow',
  'longmapsto',
  'hookrightarrow',
  'rightharpoonup',
  'rightharpoondown',
  'leadsto',
  'uparrow',
  'Uparrow',
  'downarrow',
  'Downarrow',
  'updownarrow',
  'Updownarrow',
  'nearrow',
  'searrow',
  'swarrow',
  'nwarrow',
  // 间距
  'quad',
  'qquad',
  'hspace',
  'vspace',
  'hfill',
  'vfill',
  // 引用和脚注
  'cite',
  'footnote',
  'marginpar',
  // 目录和标签
  'tableofcontents',
  'listoffigures',
  'listoftables',
  'bibliography',
  'bibliographystyle',
  // 其他常用命令
  'maketitle',
  'title',
  'author',
  'date',
  'thanks',
  'and',
  'abstract',
  'thanks',
  'today',
  'verb',
  'verbatim',
  'lstlisting',
  'url',
  'href',
  'email',
  'index',
  'glossary',
  'addcontentsline',
  'addtocontents',
  'appendix',
  'appendixpage',
  'frontmatter',
  'mainmatter',
  'backmatter'
]

/**
 * LaTeX 自动补全提供器
 * 根据用户输入的前缀，提供匹配的 LaTeX 命令补全建议
 */
function createLatexCompletionProvider(): monaco.languages.CompletionItemProvider {
  return {
    provideCompletionItems: (model, position) => {
      // 获取当前行的文本
      const lineText = model.getLineContent(position.lineNumber)
      const textUntilPosition = lineText.substring(0, position.column - 1)

      // 检查是否在输入命令（以 \ 开头，后面跟着字母）
      // 匹配模式：\ 后面跟着0个或多个字母，且光标在命令中间或末尾
      const commandMatch = textUntilPosition.match(/\\([a-zA-Z]*)$/)

      if (!commandMatch) {
        // 如果不在输入命令，返回空数组
        return { suggestions: [] }
      }

      // 提取已输入的命令前缀（去掉反斜杠，转为小写用于匹配）
      const prefix = commandMatch[1].toLowerCase()

      // 过滤匹配的命令（不区分大小写）
      // 如果前缀为空（只输入了 \），显示所有命令
      const matchedCommands =
        prefix === ''
          ? LATEX_COMMANDS
          : LATEX_COMMANDS.filter((cmd) => cmd.toLowerCase().startsWith(prefix))

      // 如果没有匹配的命令，返回空数组
      if (matchedCommands.length === 0) {
        return { suggestions: [] }
      }

      // 计算替换范围：从反斜杠开始到当前位置
      const backslashPos = textUntilPosition.lastIndexOf('\\')
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: backslashPos + 1, // 从反斜杠后开始
        endColumn: position.column
      }

      // 转换为 Monaco 的补全项
      const suggestions: monaco.languages.CompletionItem[] = matchedCommands.map((cmd) => {
        // 计算插入的文本（完整的命令，包括反斜杠）
        const insertText = `\\${cmd}`

        // 根据命令类型设置不同的详情和文档
        let detail = 'LaTeX Command'
        let documentation = `LaTeX command: \\${cmd}`

        // 从 i18n 获取命令文档（如果存在）
        try {
          const i18nKey = `latexEditor.commandDocs.${cmd}`
          const i18nDoc = i18n.global.t(i18nKey)
          // 如果翻译存在且不是 key 本身（说明找到了翻译）
          if (i18nDoc && i18nDoc !== i18nKey) {
            documentation = i18nDoc
          }
        } catch (error) {
          // 如果 i18n 未初始化或出错，使用默认文档
          // 静默失败，继续使用默认值
        }

        // 保留原有的英文文档作为后备（如果 i18n 未找到翻译）
        const commandDocs: Record<string, string> = {
          // Document structure
          documentclass:
            'Set document class. Example: \\documentclass{article} or \\documentclass[12pt]{report}',
          usepackage:
            'Load a LaTeX package. Example: \\usepackage{graphicx} or \\usepackage[utf8]{inputenc}',
          begin:
            'Start an environment. Example: \\begin{document}, \\begin{equation}, \\begin{figure}',
          end: 'End an environment. Example: \\end{document}, \\end{equation}, \\end{figure}',
          document: 'Main document environment. Example: \\begin{document} ... \\end{document}',
          input: 'Input another LaTeX file. Example: \\input{chapter1.tex}',
          include: 'Include another LaTeX file with page break. Example: \\include{appendix}',

          // Sectioning commands
          part: 'Create a part (highest level). Example: \\part{Introduction}',
          chapter: 'Create a chapter (book/report class). Example: \\chapter{Background}',
          section: 'Create a section. Example: \\section{Methodology}',
          subsection: 'Create a subsection. Example: \\subsection{Data Collection}',
          subsubsection: 'Create a subsubsection. Example: \\subsubsection{Sampling Method}',
          paragraph: 'Create a paragraph heading. Example: \\paragraph{Note}',
          subparagraph: 'Create a subparagraph heading. Example: \\subparagraph{Details}',

          // Text formatting
          textbf: 'Bold text. Example: \\textbf{important text}',
          textit: 'Italic text. Example: \\textit{emphasized text}',
          textsl: 'Slanted text. Example: \\textsl{slanted text}',
          texttt: 'Typewriter (monospace) text. Example: \\texttt{code}',
          textsc: 'Small caps text. Example: \\textsc{Title}',
          textsf: 'Sans serif text. Example: \\textsf{sans serif}',
          textrm: 'Roman (serif) text. Example: \\textrm{roman text}',
          textmd: 'Medium weight text. Example: \\textmd{normal weight}',
          textup: 'Upright text. Example: \\textup{upright text}',
          emph: 'Emphasized text (usually italic). Example: \\emph{emphasis}',
          underline: 'Underline text. Example: \\underline{underlined}',
          sout: 'Strikethrough text. Example: \\sout{deleted}',
          textcolor:
            'Colored text. Example: \\textcolor{red}{text} or \\textcolor[rgb]{1,0,0}{text}',
          colorbox: 'Colored background box. Example: \\colorbox{yellow}{highlighted}',
          fcolorbox: 'Framed colored box. Example: \\fcolorbox{red}{yellow}{text}',

          // Font sizes
          tiny: 'Tiny font size. Example: {\\tiny smallest text}',
          scriptsize: 'Script size font. Example: {\\scriptsize small text}',
          footnotesize: 'Footnote size font. Example: {\\footnotesize footnote text}',
          small: 'Small font size. Example: {\\small small text}',
          normalsize: 'Normal font size. Example: {\\normalsize normal text}',
          large: 'Large font size. Example: {\\large large text}',
          Large: 'Larger font size. Example: {\\Large larger text}',
          LARGE: 'Very large font size. Example: {\\LARGE very large}',
          huge: 'Huge font size. Example: {\\huge huge text}',
          Huge: 'Largest font size. Example: {\\Huge largest text}',

          // Alignment and line breaks
          centering: 'Center text. Example: \\centering (declaration, affects following text)',
          raggedright: 'Left align text. Example: \\raggedright',
          raggedleft: 'Right align text. Example: \\raggedleft',
          newline: 'Line break. Example: text\\newline next line',
          linebreak: 'Line break with penalty. Example: text\\linebreak',
          pagebreak: 'Page break. Example: \\pagebreak or \\pagebreak[4]',
          newpage: 'Start new page. Example: \\newpage',
          clearpage: 'Clear page and start new page. Example: \\clearpage',

          // Lists
          itemize:
            'Unordered list environment. Example: \\begin{itemize} \\item First \\item Second \\end{itemize}',
          enumerate:
            'Ordered list environment. Example: \\begin{enumerate} \\item First \\item Second \\end{enumerate}',
          description:
            'Description list environment. Example: \\begin{description} \\item[Term] Description \\end{description}',
          item: 'List item. Example: \\item First item or \\item[Label] Item with label',

          // Tables
          table: 'Table float environment. Example: \\begin{table} ... \\end{table}',
          tabular: 'Tabular environment. Example: \\begin{tabular}{lcr} ... \\end{tabular}',
          hline: 'Horizontal line in table. Example: \\hline',
          cline: 'Partial horizontal line. Example: \\cline{1-3}',
          multicolumn: 'Multi-column cell. Example: \\multicolumn{3}{c}{Centered}',
          multirow: 'Multi-row cell (requires multirow package). Example: \\multirow{2}{*}{Text}',

          // Figures and floats
          figure: 'Figure float environment. Example: \\begin{figure} ... \\end{figure}',
          includegraphics:
            'Include graphics. Example: \\includegraphics{image.png} or \\includegraphics[width=0.5\\textwidth]{image}',
          caption: 'Caption for float. Example: \\caption{Figure description}',
          label: 'Create label for cross-reference. Example: \\label{fig:myfigure}',
          ref: 'Cross-reference to label. Example: \\ref{fig:myfigure}',
          pageref: 'Reference to page number. Example: \\pageref{fig:myfigure}',

          // Math environments
          equation:
            'Numbered equation environment. Example: \\begin{equation} E=mc^2 \\end{equation}',
          'equation*':
            'Unnumbered equation environment. Example: \\begin{equation*} E=mc^2 \\end{equation*}',
          align:
            'Aligned equations (numbered). Example: \\begin{align} x &= 1 \\\\ y &= 2 \\end{align}',
          'align*':
            'Aligned equations (unnumbered). Example: \\begin{align*} x &= 1 \\\\ y &= 2 \\end{align*}',
          alignat:
            'Aligned equations with spacing control. Example: \\begin{alignat}{2} ... \\end{alignat}',
          gather:
            'Gathered equations (numbered). Example: \\begin{gather} x=1 \\\\ y=2 \\end{gather}',
          'gather*':
            'Gathered equations (unnumbered). Example: \\begin{gather*} x=1 \\\\ y=2 \\end{gather*}',
          multline:
            'Multi-line equation (numbered). Example: \\begin{multline} ... \\end{multline}',
          eqnarray: 'Equation array (numbered). Example: \\begin{eqnarray} ... \\end{eqnarray}',
          math: 'Inline math mode. Example: $x^2$ or \\(x^2\\)',
          displaymath: 'Display math mode. Example: $$x^2$$ or \\[x^2\\]',

          // Math commands - fractions and roots
          frac: 'Fraction. Example: \\frac{numerator}{denominator} or \\frac{1}{2}',
          sqrt: 'Square root. Example: \\sqrt{x} or \\sqrt[n]{x} for nth root',
          sum: 'Summation symbol. Example: \\sum_{i=1}^{n} or \\sum',
          prod: 'Product symbol. Example: \\prod_{i=1}^{n}',
          int: 'Integral. Example: \\int_{a}^{b} f(x) dx',
          oint: 'Contour integral. Example: \\oint_C f(z) dz',
          iint: 'Double integral. Example: \\iint_D f(x,y) dx dy',
          iiint: 'Triple integral. Example: \\iiint_V f(x,y,z) dx dy dz',

          // Math commands - limits and functions
          lim: 'Limit. Example: \\lim_{x \\to \\infty} or \\lim',
          sup: 'Supremum. Example: \\sup_{x \\in A}',
          inf: 'Infimum. Example: \\inf_{x \\in A}',
          max: 'Maximum. Example: \\max_{x \\in A}',
          min: 'Minimum. Example: \\min_{x \\in A}',
          det: 'Determinant. Example: \\det(A)',
          exp: 'Exponential function. Example: \\exp(x)',
          log: 'Logarithm. Example: \\log(x)',
          ln: 'Natural logarithm. Example: \\ln(x)',
          sin: 'Sine function. Example: \\sin(x)',
          cos: 'Cosine function. Example: \\cos(x)',
          tan: 'Tangent function. Example: \\tan(x)',

          // Greek letters (lowercase)
          alpha: 'Greek letter alpha (α). Example: $\\alpha$',
          beta: 'Greek letter beta (β). Example: $\\beta$',
          gamma: 'Greek letter gamma (γ). Example: $\\gamma$',
          delta: 'Greek letter delta (δ). Example: $\\delta$',
          epsilon: 'Greek letter epsilon (ε). Example: $\\epsilon$',
          varepsilon: 'Greek letter varepsilon (ε). Example: $\\varepsilon$',
          zeta: 'Greek letter zeta (ζ). Example: $\\zeta$',
          eta: 'Greek letter eta (η). Example: $\\eta$',
          theta: 'Greek letter theta (θ). Example: $\\theta$',
          vartheta: 'Greek letter vartheta (ϑ). Example: $\\vartheta$',
          iota: 'Greek letter iota (ι). Example: $\\iota$',
          kappa: 'Greek letter kappa (κ). Example: $\\kappa$',
          lambda: 'Greek letter lambda (λ). Example: $\\lambda$',
          mu: 'Greek letter mu (μ). Example: $\\mu$',
          nu: 'Greek letter nu (ν). Example: $\\nu$',
          xi: 'Greek letter xi (ξ). Example: $\\xi$',
          pi: 'Greek letter pi (π). Example: $\\pi$',
          varpi: 'Greek letter varpi (ϖ). Example: $\\varpi$',
          rho: 'Greek letter rho (ρ). Example: $\\rho$',
          varrho: 'Greek letter varrho (ϱ). Example: $\\varrho$',
          sigma: 'Greek letter sigma (σ). Example: $\\sigma$',
          varsigma: 'Greek letter varsigma (ς). Example: $\\varsigma$',
          tau: 'Greek letter tau (τ). Example: $\\tau$',
          upsilon: 'Greek letter upsilon (υ). Example: $\\upsilon$',
          phi: 'Greek letter phi (φ). Example: $\\phi$',
          varphi: 'Greek letter varphi (ϕ). Example: $\\varphi$',
          chi: 'Greek letter chi (χ). Example: $\\chi$',
          psi: 'Greek letter psi (ψ). Example: $\\psi$',
          omega: 'Greek letter omega (ω). Example: $\\omega$',

          // Greek letters (uppercase)
          Gamma: 'Greek letter Gamma (Γ). Example: $\\Gamma$',
          Delta: 'Greek letter Delta (Δ). Example: $\\Delta$',
          Theta: 'Greek letter Theta (Θ). Example: $\\Theta$',
          Lambda: 'Greek letter Lambda (Λ). Example: $\\Lambda$',
          Xi: 'Greek letter Xi (Ξ). Example: $\\Xi$',
          Pi: 'Greek letter Pi (Π). Example: $\\Pi$',
          Sigma: 'Greek letter Sigma (Σ). Example: $\\Sigma$',
          Upsilon: 'Greek letter Upsilon (Υ). Example: $\\Upsilon$',
          Phi: 'Greek letter Phi (Φ). Example: $\\Phi$',
          Psi: 'Greek letter Psi (Ψ). Example: $\\Psi$',
          Omega: 'Greek letter Omega (Ω). Example: $\\Omega$',

          // Math operators and symbols
          cdot: 'Center dot (·). Example: $a \\cdot b$',
          cdots: 'Center dots (⋯). Example: $x_1, x_2, \\cdots, x_n$',
          ldots: 'Lower dots (…). Example: $x_1, x_2, \\ldots, x_n$',
          vdots: 'Vertical dots (⋮). Example: $\\vdots$',
          ddots: 'Diagonal dots (⋱). Example: $\\ddots$',
          pm: 'Plus-minus (±). Example: $x \\pm y$',
          mp: 'Minus-plus (∓). Example: $x \\mp y$',
          times: 'Times (×). Example: $a \\times b$',
          div: 'Division (÷). Example: $a \\div b$',
          ast: 'Asterisk (∗). Example: $a \\ast b$',
          star: 'Star (⋆). Example: $a \\star b$',
          circ: 'Circle (∘). Example: $f \\circ g$',
          bullet: 'Bullet (•). Example: $a \\bullet b$',

          // Set operations
          cap: 'Intersection (∩). Example: $A \\cap B$',
          cup: 'Union (∪). Example: $A \\cup B$',
          uplus: 'Multiset union (⊎). Example: $A \\uplus B$',
          sqcap: 'Square cap (⊓). Example: $A \\sqcap B$',
          sqcup: 'Square cup (⊔). Example: $A \\sqcup B$',
          vee: 'Logical or (∨). Example: $p \\vee q$',
          wedge: 'Logical and (∧). Example: $p \\wedge q$',
          setminus: 'Set difference (∖). Example: $A \\setminus B$',
          wr: 'Wreath product (≀). Example: $G \\wr H$',
          diamond: 'Diamond (⋄). Example: $a \\diamond b$',

          // Relations
          leq: 'Less than or equal (≤). Example: $x \\leq y$',
          prec: 'Precedes (≺). Example: $a \\prec b$',
          preceq: 'Precedes or equal (≼). Example: $a \\preceq b$',
          ll: 'Much less than (≪). Example: $x \\ll y$',
          subset: 'Subset (⊂). Example: $A \\subset B$',
          subseteq: 'Subset or equal (⊆). Example: $A \\subseteq B$',
          sqsubset: 'Square subset (⊏). Example: $A \\sqsubset B$',
          sqsubseteq: 'Square subset or equal (⊑). Example: $A \\sqsubseteq B$',
          in: 'Element of (∈). Example: $x \\in A$',
          vdash: 'Proves (⊢). Example: $\\Gamma \\vdash \\phi$',
          smile: 'Smile (⌣). Example: $a \\smile b$',
          frown: 'Frown (⌢). Example: $a \\frown b$',
          geq: 'Greater than or equal (≥). Example: $x \\geq y$',
          succ: 'Succeeds (≻). Example: $a \\succ b$',
          succeq: 'Succeeds or equal (≽). Example: $a \\succeq b$',
          gg: 'Much greater than (≫). Example: $x \\gg y$',
          supset: 'Superset (⊃). Example: $A \\supset B$',
          supseteq: 'Superset or equal (⊇). Example: $A \\supseteq B$',
          sqsupset: 'Square superset (⊐). Example: $A \\sqsupset B$',
          sqsupseteq: 'Square superset or equal (⊒). Example: $A \\sqsupseteq B$',
          ni: 'Contains as member (∋). Example: $A \\ni x$',
          dashv: 'Left tack (⊣). Example: $\\phi \\dashv \\Gamma$',
          mid: 'Mid (∣). Example: $a \\mid b$',
          parallel: 'Parallel (∥). Example: $l_1 \\parallel l_2$',
          equiv: 'Equivalent (≡). Example: $a \\equiv b$',
          sim: 'Similar (∼). Example: $A \\sim B$',
          simeq: 'Similar or equal (≃). Example: $A \\simeq B$',
          asymp: 'Asymptotic (≍). Example: $f(x) \\asymp g(x)$',
          approx: 'Approximately (≈). Example: $x \\approx y$',
          cong: 'Congruent (≅). Example: $A \\cong B$',
          neq: 'Not equal (≠). Example: $a \\neq b$',
          doteq: 'Dotequal (≐). Example: $a \\doteq b$',
          propto: 'Proportional (∝). Example: $x \\propto y$',
          models: 'Models (⊨). Example: $\\Gamma \\models \\phi$',
          perp: 'Perpendicular (⊥). Example: $l_1 \\perp l_2$',

          // Arrows
          leftarrow: 'Left arrow (←). Example: $x \\leftarrow y$',
          Leftarrow: 'Double left arrow (⇐). Example: $x \\Leftarrow y$',
          rightarrow: 'Right arrow (→). Example: $x \\rightarrow y$',
          Rightarrow: 'Double right arrow (⇒). Example: $x \\Rightarrow y$',
          leftrightarrow: 'Left-right arrow (↔). Example: $x \\leftrightarrow y$',
          Leftrightarrow: 'Double left-right arrow (⇔). Example: $x \\Leftrightarrow y$',
          mapsto: 'Maps to (↦). Example: $x \\mapsto f(x)$',
          hookleftarrow: 'Hook left arrow (↩). Example: $A \\hookleftarrow B$',
          leftharpoonup: 'Left harpoon up (↼). Example: $x \\leftharpoonup y$',
          leftharpoondown: 'Left harpoon down (↽). Example: $x \\leftharpoondown y$',
          rightleftharpoons: 'Right-left harpoons (⇌). Example: $x \\rightleftharpoons y$',
          longleftarrow: 'Long left arrow (⟵). Example: $x \\longleftarrow y$',
          Longleftarrow: 'Long double left arrow (⟸). Example: $x \\Longleftarrow y$',
          longrightarrow: 'Long right arrow (⟶). Example: $x \\longrightarrow y$',
          Longrightarrow: 'Long double right arrow (⟹). Example: $x \\Longrightarrow y$',
          longleftrightarrow: 'Long left-right arrow (⟷). Example: $x \\longleftrightarrow y$',
          Longleftrightarrow:
            'Long double left-right arrow (⟺). Example: $x \\Longleftrightarrow y$',
          longmapsto: 'Long maps to (⟼). Example: $x \\longmapsto f(x)$',
          hookrightarrow: 'Hook right arrow (↪). Example: $A \\hookrightarrow B$',
          rightharpoonup: 'Right harpoon up (⇀). Example: $x \\rightharpoonup y$',
          rightharpoondown: 'Right harpoon down (⇁). Example: $x \\rightharpoondown y$',
          leadsto: 'Leads to (⇝). Example: $x \\leadsto y$',
          uparrow: 'Up arrow (↑). Example: $x \\uparrow$',
          Uparrow: 'Double up arrow (⇑). Example: $x \\Uparrow$',
          downarrow: 'Down arrow (↓). Example: $x \\downarrow$',
          Downarrow: 'Double down arrow (⇓). Example: $x \\Downarrow$',
          updownarrow: 'Up-down arrow (↕). Example: $x \\updownarrow$',
          Updownarrow: 'Double up-down arrow (⇕). Example: $x \\Updownarrow$',
          nearrow: 'North-east arrow (↗). Example: $\\nearrow$',
          searrow: 'South-east arrow (↘). Example: $\\searrow$',
          swarrow: 'South-west arrow (↙). Example: $\\swarrow$',
          nwarrow: 'North-west arrow (↖). Example: $\\nwarrow$',

          // Spacing
          quad: 'Quad space (1em). Example: text\\quad more text',
          qquad: 'Double quad space (2em). Example: text\\qquad more text',
          hspace: 'Horizontal space. Example: \\hspace{1cm} or \\hspace{2em}',
          vspace: 'Vertical space. Example: \\vspace{1cm} or \\vspace{2em}',
          hfill: 'Horizontal fill. Example: left\\hfill right',
          vfill: 'Vertical fill. Example: \\vfill',

          // Citations and footnotes
          cite: 'Cite reference. Example: \\cite{key} or \\cite[page]{key}',
          footnote: 'Create footnote. Example: text\\footnote{footnote text}',
          marginpar: 'Margin paragraph. Example: \\marginpar{Note}',

          // Table of contents and bibliography
          tableofcontents: 'Generate table of contents. Example: \\tableofcontents',
          listoffigures: 'Generate list of figures. Example: \\listoffigures',
          listoftables: 'Generate list of tables. Example: \\listoftables',
          bibliography: 'Bibliography. Example: \\bibliography{references}',
          bibliographystyle: 'Bibliography style. Example: \\bibliographystyle{plain}',

          // Document metadata
          maketitle: 'Generate title page. Example: \\maketitle',
          title: 'Document title. Example: \\title{My Document}',
          author: 'Document author. Example: \\author{John Doe}',
          date: 'Document date. Example: \\date{\\today} or \\date{2024}',
          thanks: 'Thanks note. Example: \\author{John\\thanks{Thanks to...}}',
          and: 'Author separator. Example: \\author{John \\and Jane}',
          abstract: 'Abstract environment. Example: \\begin{abstract} ... \\end{abstract}',
          today: 'Current date. Example: \\date{\\today}',

          // Code and verbatim
          verb: 'Verbatim inline text. Example: \\verb|code| or \\verb+code+',
          verbatim: 'Verbatim environment. Example: \\begin{verbatim} code \\end{verbatim}',
          lstlisting:
            'Code listing (requires listings package). Example: \\begin{lstlisting} ... \\end{lstlisting}',

          // URLs and links
          url: 'URL (requires url or hyperref package). Example: \\url{https://example.com}',
          href: 'Hyperlink (requires hyperref package). Example: \\href{https://example.com}{link text}',
          email: 'Email (requires url package). Example: \\email{user@example.com}',

          // Index and glossary
          index: 'Index entry. Example: \\index{keyword}',
          glossary: 'Glossary entry. Example: \\glossary{term}',

          // Table of contents manipulation
          addcontentsline: 'Add entry to TOC. Example: \\addcontentsline{toc}{section}{Title}',
          addtocontents: 'Add to TOC file. Example: \\addtocontents{toc}{\\protect\\newpage}',

          // Document structure
          appendix: 'Start appendix. Example: \\appendix',
          appendixpage: 'Appendix page (requires appendix package). Example: \\appendixpage',
          frontmatter: 'Front matter (book class). Example: \\frontmatter',
          mainmatter: 'Main matter (book class). Example: \\mainmatter',
          backmatter: 'Back matter (book class). Example: \\backmatter'
        }

        // 如果 i18n 没有找到翻译，使用后备的英文文档
        if (documentation === `LaTeX command: \\${cmd}` && commandDocs[cmd]) {
          documentation = commandDocs[cmd]
        }

        return {
          label: insertText,
          kind: monaco.languages.CompletionItemKind.Function,
          detail: detail,
          documentation: documentation,
          insertText: insertText,
          range: range,
          sortText: cmd.toLowerCase() // 用于排序
        }
      })

      // 按字母顺序排序
      suggestions.sort((a, b) => {
        const aText = a.insertText as string
        const bText = b.insertText as string
        return aText.localeCompare(bText)
      })

      return { suggestions }
    },

    // 触发字符：当用户输入这些字符时触发补全
    triggerCharacters: ['\\']
  }
}

/**
 * 注册 LaTeX 语言支持
 * 如果已经注册过，则跳过
 */
export function registerLatexLanguage(): void {
  if (monaco.languages.getLanguages().find((l) => l.id === 'latex')) {
    return
  }

  monaco.languages.register({ id: 'latex' })
  monaco.languages.setMonarchTokensProvider('latex', {
    defaultToken: '',
    tokenPostfix: '.tex',
    tokenizer: {
      root: [
        [/\\[a-zA-Z]+/, 'keyword'], // LaTeX 命令
        [/%.*$/, 'comment'], // 注释
        [/\$[^$]*\$/, 'string'], // 行内公式
        [/{|}/, 'delimiter'], // 花括号
        [/\[|\]/, 'delimiter'], // 中括号
        [/[^\s]+/, ''] // 其他文本
      ]
    }
  })

  // 注册自动补全提供器
  monaco.languages.registerCompletionItemProvider('latex', createLatexCompletionProvider())
}

/**
 * 初始化 Monaco 环境（Worker + LaTeX 语言）
 * 应该在应用启动时调用一次
 */
export function initMonacoEnvironment(): void {
  setupMonacoWorker()
  registerLatexLanguage()
}
