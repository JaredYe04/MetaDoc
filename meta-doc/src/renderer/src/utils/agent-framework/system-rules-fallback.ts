/**
 * 当无法从 SQLite 读取规则时的兜底文案（与迁移 011 中系统规则语义一致）
 */
export const AGENT_SYSTEM_RULES_FALLBACK = `### markdown_math
Markdown math: use inline $...$ and block $$...$$ only. Do not use parentheses ( ) or square brackets [ ] for math delimiters.

### latex_chinese
LaTeX Chinese: use xeCJK, compile with XeLaTeX, and specify a valid Chinese font in the document preamble.

### diagram_layout
Diagrams: prefer orthogonal edges and avoid crossing lines where possible.`
