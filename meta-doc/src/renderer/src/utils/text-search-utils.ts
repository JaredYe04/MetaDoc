/**
 * 文本搜索工具函数
 * 从 grep-tool.ts 解耦出来的核心搜索逻辑，供编辑器适配器和工具复用
 */

export interface TextSearchMatch {
  line: number;          // 行号（1-based）
  column: number;        // 列号（1-based）
  match: string;         // 匹配的文本
  groups?: string[];     // 正则表达式捕获组（仅在正则表达式搜索模式下提供）
  startOffset: number;   // 在文本中的起始偏移量
  endOffset: number;     // 在文本中的结束偏移量
}

export interface TextSearchOptions {
  matchCase?: boolean;
  wholeWord?: boolean;
  useRegex?: boolean;
  startOffset?: number;  // 搜索起始偏移量（用于从光标位置开始搜索）
}

/**
 * 在文本中搜索匹配项
 */
export function searchInText(
  text: string,
  pattern: string,
  options: TextSearchOptions = {}
): TextSearchMatch[] {
  if (!text || !pattern) return [];

  const {
    matchCase = false,
    wholeWord = false,
    useRegex = false,
    startOffset = 0,
  } = options;

  let regex: RegExp;
  try {
    if (useRegex) {
      regex = new RegExp(pattern, matchCase ? "g" : "gi");
    } else {
      const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const patternStr = wholeWord
        ? `(?<!\\w)${escaped}(?!\\w)`
        : escaped;
      regex = new RegExp(patternStr, matchCase ? "g" : "gi");
    }
  } catch (error) {
    console.warn("searchInText:regex-error", error);
    return [];
  }

  const matches: TextSearchMatch[] = [];
  const lines = text.split(/\r?\n/);
  
  // 如果指定了startOffset，只搜索从该位置开始的内容
  const searchText = startOffset > 0 ? text.slice(startOffset) : text;
  const searchStartOffset = startOffset;

  // 计算搜索文本的起始行号和列号（用于计算绝对位置）
  let searchStartLine = 0;
  let searchStartColumn = 0;
  if (startOffset > 0) {
    let offset = 0;
    for (let i = 0; i < lines.length; i++) {
      const lineLength = lines[i].length;
      const lineEndOffset = offset + lineLength;
      
      if (startOffset <= lineEndOffset) {
        searchStartLine = i;
        searchStartColumn = startOffset - offset;
        break;
      }
      
      offset += lineLength + 1; // +1 for newline
    }
  }

  // 在搜索文本中查找匹配
  regex.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(searchText)) !== null) {
    if (!match) break;

    const matchText = match[0];
    const relativeStartOffset = match.index;
    const relativeEndOffset = relativeStartOffset + matchText.length;
    const absoluteStartOffset = searchStartOffset + relativeStartOffset;
    const absoluteEndOffset = searchStartOffset + relativeEndOffset;

    // 计算在原始文本中的行号和列号（从整个文本开始计算）
    let lineNum = 1;
    let colNum = 1;
    let offset = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineLength = line.length;
      const lineEndOffset = offset + lineLength;

      if (absoluteStartOffset <= lineEndOffset) {
        lineNum = i + 1; // 1-based
        colNum = absoluteStartOffset - offset + 1; // 1-based
        break;
      }

      offset += lineLength + 1; // +1 for newline
    }

    matches.push({
      line: lineNum,
      column: colNum,
      match: matchText,
      groups: useRegex && match.length > 1 ? [...match] : undefined,
      startOffset: absoluteStartOffset,
      endOffset: absoluteEndOffset,
    });

    if (!regex.global) break;
    if (match[0].length === 0) {
      regex.lastIndex += 1;
    }
  }

  return matches;
}

/**
 * 分批搜索匹配项（异步迭代器方式）
 * 每批返回指定数量的匹配项，避免阻塞UI
 */
export async function* searchInTextBatched(
  text: string,
  pattern: string,
  options: TextSearchOptions & { batchSize?: number } = {}
): AsyncGenerator<TextSearchMatch[], void, unknown> {
  if (!text || !pattern) return;

  const {
    matchCase = false,
    wholeWord = false,
    useRegex = false,
    startOffset = 0,
    batchSize = 10,
  } = options;

  let regex: RegExp;
  try {
    if (useRegex) {
      regex = new RegExp(pattern, matchCase ? "g" : "gi");
    } else {
      const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const patternStr = wholeWord
        ? `(?<!\\w)${escaped}(?!\\w)`
        : escaped;
      regex = new RegExp(patternStr, matchCase ? "g" : "gi");
    }
  } catch (error) {
    console.warn("searchInTextBatched:regex-error", error);
    return;
  }

  const lines = text.split(/\r?\n/);
  
  // 如果指定了startOffset，只搜索从该位置开始的内容
  const searchText = startOffset > 0 ? text.slice(startOffset) : text;
  const searchStartOffset = startOffset;

  // 在搜索文本中查找匹配
  regex.lastIndex = 0;
  let match: RegExpExecArray | null;
  let batch: TextSearchMatch[] = [];
  let processedCount = 0;

  while ((match = regex.exec(searchText)) !== null) {
    if (!match) break;

    const matchText = match[0];
    const relativeStartOffset = match.index;
    const relativeEndOffset = relativeStartOffset + matchText.length;
    const absoluteStartOffset = searchStartOffset + relativeStartOffset;
    const absoluteEndOffset = searchStartOffset + relativeEndOffset;

    // 计算在原始文本中的行号和列号（从整个文本开始计算）
    let lineNum = 1;
    let colNum = 1;
    let offset = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineLength = line.length;
      const lineEndOffset = offset + lineLength;

      if (absoluteStartOffset <= lineEndOffset) {
        lineNum = i + 1; // 1-based
        colNum = absoluteStartOffset - offset + 1; // 1-based
        break;
      }

      offset += lineLength + 1; // +1 for newline
    }

    batch.push({
      line: lineNum,
      column: colNum,
      match: matchText,
      groups: useRegex && match.length > 1 ? [...match] : undefined,
      startOffset: absoluteStartOffset,
      endOffset: absoluteEndOffset,
    });

    processedCount++;

    // 每批处理指定数量的匹配后，yield 当前批次
    if (batch.length >= batchSize) {
      yield batch;
      batch = [];
      
      // 使用 requestIdleCallback 或 setTimeout 让出控制权，避免阻塞UI
      await new Promise<void>((resolve) => {
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(() => resolve(), { timeout: 10 });
        } else {
          setTimeout(() => resolve(), 0);
        }
      });
    }

    if (!regex.global) break;
    if (match[0].length === 0) {
      regex.lastIndex += 1;
    }
  }

  // 返回剩余的匹配项
  if (batch.length > 0) {
    yield batch;
  }
}

/**
 * 计算替换文本（支持正则表达式捕获组和大小写保留）
 */
export function computeReplacementText(
  replacement: string,
  match: TextSearchMatch,
  options: {
    useRegex?: boolean;
    preserveCase?: boolean;
  } = {}
): string {
  let result = replacement;

  // 处理正则表达式捕获组
  if (options.useRegex && match.groups && match.groups.length > 0) {
    result = result.replace(/\$(\d+)|(\$\$)/g, (fullMatch, indexStr, literalDollar) => {
      if (literalDollar) {
        return "$";
      }
      const index = Number(indexStr);
      if (Number.isNaN(index) || index < 0 || index >= match.groups!.length) {
        return fullMatch;
      }
      return match.groups![index] ?? "";
    });
  }

  // 处理大小写保留
  if (options.preserveCase && match.match) {
    result = adjustCase(match.match, result);
  }

  return result;
}

/**
 * 调整目标文本的大小写以匹配源文本
 */
function adjustCase(source: string, target: string): string {
  if (!source) return target;
  if (source === source.toUpperCase()) {
    return target.toUpperCase();
  }
  if (source === source.toLowerCase()) {
    return target.toLowerCase();
  }
  if (
    source[0] === source[0].toUpperCase() &&
    source.slice(1) === source.slice(1).toLowerCase()
  ) {
    return target.charAt(0).toUpperCase() + target.slice(1);
  }
  return target;
}

/**
 * 将偏移量转换为行号和列号
 */
export function offsetToPosition(text: string, offset: number): { line: number; column: number } {
  const lines = text.split(/\r?\n/);
  let currentOffset = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineLength = lines[i].length;
    const lineEndOffset = currentOffset + lineLength;

    if (offset <= lineEndOffset) {
      return {
        line: i + 1, // 1-based
        column: offset - currentOffset + 1, // 1-based
      };
    }

    currentOffset += lineLength + 1; // +1 for newline
  }

  // 如果偏移量超出范围，返回最后一行
  const lastLine = lines.length;
  return {
    line: lastLine,
    column: (lines[lastLine - 1]?.length ?? 0) + 1,
  };
}

/**
 * 将行号和列号转换为偏移量
 */
export function positionToOffset(text: string, line: number, column: number): number {
  const lines = text.split(/\r?\n/);
  const lineIndex = Math.max(0, Math.min(line - 1, lines.length - 1));
  let offset = 0;

  for (let i = 0; i < lineIndex; i++) {
    offset += lines[i].length + 1; // +1 for newline
  }

  const colIndex = Math.max(0, column - 1);
  const lineLength = lines[lineIndex]?.length ?? 0;
  return offset + Math.min(colIndex, lineLength);
}
