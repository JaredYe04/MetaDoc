/**
 * 文档标题提取工具
 * 支持从 Markdown 和 LaTeX 文档中提取标题
 */

/**
 * 从 Markdown 内容中提取标题
 */
export function extractTitleFromMarkdown(content: string): string | null {
  if (!content || typeof content !== 'string') {
    return null;
  }

  // 移除 Markdown 中的元信息标记（<!--meta-info: ... -->）
  const contentWithoutMeta = content.replace(/<!--meta-info:[^>]*-->/g, '').trim();

  // 尝试匹配第一个标题（# 开头）
  const firstTitleMatch = contentWithoutMeta.match(/^(#+)\s+(.+)$/m);
  if (firstTitleMatch) {
    const title = firstTitleMatch[2].trim();
    // 移除可能的 Markdown 格式标记
    return title.replace(/\*\*|__|\*|_|`/g, '').trim();
  }

  return null;
}

/**
 * 从 LaTeX 内容中提取标题
 */
export function extractTitleFromLatex(content: string): string | null {
  if (!content || typeof content !== 'string') {
    return null;
  }

  // 移除 LaTeX 中的元信息标记（%META-INFO: ... 和警告行）
  const contentWithoutMeta = content
    .replace(/% 请勿手动修改此行及下面的 META-INFO.*\n?/g, '')
    .replace(/%META-INFO:[^\n]*\n?/g, '')
    .trim();

  // 尝试匹配 \title{} 命令（文档标题）
  const titleMatch = contentWithoutMeta.match(/\\title\{([^}]+)\}/);
  if (titleMatch) {
    return titleMatch[1].trim();
  }

  // 尝试匹配 \section{}（一级标题）
  const sectionMatch = contentWithoutMeta.match(/\\section\{([^}]+)\}/);
  if (sectionMatch) {
    return sectionMatch[1].trim();
  }

  // 尝试匹配 \subsection{}（二级标题）
  const subsectionMatch = contentWithoutMeta.match(/\\subsection\{([^}]+)\}/);
  if (subsectionMatch) {
    return subsectionMatch[1].trim();
  }

  // 尝试匹配 \subsubsection{}（三级标题）
  const subsubsectionMatch = contentWithoutMeta.match(/\\subsubsection\{([^}]+)\}/);
  if (subsubsectionMatch) {
    return subsubsectionMatch[1].trim();
  }

  return null;
}

/**
 * 从文档内容中提取标题（根据格式自动选择）
 */
export function extractTitleFromContent(
  content: string,
  format: 'md' | 'tex'
): string | null {
  if (!content || typeof content !== 'string') {
    return null;
  }

  if (format === 'md') {
    return extractTitleFromMarkdown(content);
  } else if (format === 'tex') {
    return extractTitleFromLatex(content);
  }

  return null;
}

/**
 * 清理标题，使其适合作为文件名
 */
export function sanitizeTitleForFilename(title: string): string {
  if (!title || typeof title !== 'string') {
    return '';
  }

  // 移除或替换不适合文件名的字符
  return title
    .trim()
    .replace(/[<>:"/\\|?*]/g, '') // 移除 Windows 不允许的字符
    .replace(/\s+/g, ' ') // 合并多个空格
    .replace(/^\s+|\s+$/g, '') // 移除首尾空格
    .substring(0, 100); // 限制长度
}

