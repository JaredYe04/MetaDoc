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
 * 预计算所有行的起始偏移量，用于快速定位
 */
function computeLineStarts(text: string): number[] {
  const starts: number[] = [0];
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    if (ch === 13 /* \r */) {
      if (text.charCodeAt(i + 1) === 10 /* \n */) {
        i += 1;
      }
      starts.push(i + 1);
    } else if (ch === 10 /* \n */) {
      starts.push(i + 1);
    }
  }
  return starts;
}

/**
 * 使用二分查找快速定位行号
 */
function getLineNumberFromOffset(lineStarts: number[], offset: number): number {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineStarts[mid] <= offset) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return Math.max(1, high + 1);
}

/**
 * 高效的字符串搜索（非正则表达式模式）
 * 使用 indexOf 循环搜索，比正则表达式更快
 */
function searchPlainText(
  text: string,
  pattern: string,
  matchCase: boolean,
  wholeWord: boolean,
  startOffset: number,
  lineStarts: number[]
): TextSearchMatch[] {
  const matches: TextSearchMatch[] = [];
  const searchText = startOffset > 0 ? text.slice(startOffset) : text;
  const searchStartOffset = startOffset;
  
  const patternLower = matchCase ? pattern : pattern.toLowerCase();
  const textToSearch = matchCase ? searchText : searchText.toLowerCase();
  const patternLength = pattern.length;
  
  if (patternLength === 0) return matches;
  
  let searchIndex = 0;
  const textLength = textToSearch.length;
  
  // 字符类检查函数（用于wholeWord）
  const isWordChar = (char: string | undefined): boolean => {
    if (char === undefined) return false;
    return /[\w\u4e00-\u9fff]/.test(char);
  };
  
  while (searchIndex < textLength) {
    const index = textToSearch.indexOf(patternLower, searchIndex);
    if (index === -1) break;
    
    const absoluteStartOffset = searchStartOffset + index;
    const absoluteEndOffset = absoluteStartOffset + patternLength;
    
    // 检查整词匹配
    if (wholeWord) {
      const beforeChar = searchText[index - 1];
      const afterChar = searchText[index + patternLength];
      if (isWordChar(beforeChar) || isWordChar(afterChar)) {
        searchIndex = index + 1;
        continue;
      }
    }
    
    // 计算行号和列号
    const lineNum = getLineNumberFromOffset(lineStarts, absoluteStartOffset);
    const lineStartOffset = lineStarts[lineNum - 1] ?? 0;
    const colNum = absoluteStartOffset - lineStartOffset + 1;
    
    // 获取实际匹配的文本（保持原始大小写）
    const actualMatchText = searchText.substring(index, index + patternLength);
    
    matches.push({
      line: lineNum,
      column: colNum,
      match: actualMatchText,
      startOffset: absoluteStartOffset,
      endOffset: absoluteEndOffset,
    });
    
    searchIndex = index + 1;
  }
  
  return matches;
}

/**
 * 在文本中搜索匹配项
 * 优化：对于非正则表达式搜索，使用更高效的字符串搜索算法
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

  // 预计算行起始位置（一次性计算，避免重复计算）
  const lineStarts = computeLineStarts(text);

  // 对于非正则表达式的简单字符串搜索，使用更高效的算法
  if (!useRegex) {
    return searchPlainText(text, pattern, matchCase, wholeWord, startOffset, lineStarts);
  }

  // 对于正则表达式，使用原有的正则表达式搜索
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, matchCase ? "g" : "gi");
  } catch (error) {
    console.warn("searchInText:regex-error", error);
    return [];
  }

  const matches: TextSearchMatch[] = [];
  const searchText = startOffset > 0 ? text.slice(startOffset) : text;
  const searchStartOffset = startOffset;

  // 在搜索文本中查找匹配
  regex.lastIndex = 0;
  let match: RegExpExecArray | null;
  let guard = 0;
  const MAX_GUARD = 100000; // 防止空匹配导致的无限循环
  
  while ((match = regex.exec(searchText)) !== null) {
    if (!match) break;

    const matchText = match[0];
    if (!matchText.length) {
      regex.lastIndex += 1;
      if (++guard > MAX_GUARD) break;
      continue;
    }
    
    const relativeStartOffset = match.index;
    const relativeEndOffset = relativeStartOffset + matchText.length;
    const absoluteStartOffset = searchStartOffset + relativeStartOffset;
    const absoluteEndOffset = searchStartOffset + relativeEndOffset;

    // 使用预计算的行起始位置快速定位行号和列号
    const lineNum = getLineNumberFromOffset(lineStarts, absoluteStartOffset);
    const lineStartOffset = lineStarts[lineNum - 1] ?? 0;
    const colNum = absoluteStartOffset - lineStartOffset + 1;

    matches.push({
      line: lineNum,
      column: colNum,
      match: matchText,
      groups: match.length > 1 ? [...match] : undefined,
      startOffset: absoluteStartOffset,
      endOffset: absoluteEndOffset,
    });

    if (!regex.global) break;
  }

  return matches;
}

/**
 * 高效的字符串分批搜索（非正则表达式模式）
 */
async function* searchPlainTextBatched(
  text: string,
  pattern: string,
  matchCase: boolean,
  wholeWord: boolean,
  startOffset: number,
  lineStarts: number[],
  batchSize: number
): AsyncGenerator<TextSearchMatch[], void, unknown> {
  const searchText = startOffset > 0 ? text.slice(startOffset) : text;
  const searchStartOffset = startOffset;
  
  const patternLower = matchCase ? pattern : pattern.toLowerCase();
  const textToSearch = matchCase ? searchText : searchText.toLowerCase();
  const patternLength = pattern.length;
  
  if (patternLength === 0) return;
  
  let searchIndex = 0;
  const textLength = textToSearch.length;
  let batch: TextSearchMatch[] = [];
  
  // 字符类检查函数（用于wholeWord）
  const isWordChar = (char: string | undefined): boolean => {
    if (char === undefined) return false;
    return /[\w\u4e00-\u9fff]/.test(char);
  };
  
  while (searchIndex < textLength) {
    const index = textToSearch.indexOf(patternLower, searchIndex);
    if (index === -1) break;
    
    const absoluteStartOffset = searchStartOffset + index;
    const absoluteEndOffset = absoluteStartOffset + patternLength;
    
    // 检查整词匹配
    if (wholeWord) {
      const beforeChar = searchText[index - 1];
      const afterChar = searchText[index + patternLength];
      if (isWordChar(beforeChar) || isWordChar(afterChar)) {
        searchIndex = index + 1;
        continue;
      }
    }
    
    // 计算行号和列号
    const lineNum = getLineNumberFromOffset(lineStarts, absoluteStartOffset);
    const lineStartOffset = lineStarts[lineNum - 1] ?? 0;
    const colNum = absoluteStartOffset - lineStartOffset + 1;
    
    // 获取实际匹配的文本（保持原始大小写）
    const actualMatchText = searchText.substring(index, index + patternLength);
    
    batch.push({
      line: lineNum,
      column: colNum,
      match: actualMatchText,
      startOffset: absoluteStartOffset,
      endOffset: absoluteEndOffset,
    });
    
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
    
    searchIndex = index + 1;
  }
  
  // 返回剩余的匹配项
  if (batch.length > 0) {
    yield batch;
  }
}

/**
 * 分批搜索匹配项（异步迭代器方式）
 * 每批返回指定数量的匹配项，避免阻塞UI
 * 优化：对于非正则表达式搜索，使用更高效的字符串搜索算法
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

  // 预计算行起始位置（一次性计算，避免重复计算）
  const lineStarts = computeLineStarts(text);

  // 对于非正则表达式的简单字符串搜索，使用更高效的算法
  if (!useRegex) {
    yield* searchPlainTextBatched(text, pattern, matchCase, wholeWord, startOffset, lineStarts, batchSize);
    return;
  }

  // 对于正则表达式，使用原有的正则表达式搜索
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, matchCase ? "g" : "gi");
  } catch (error) {
    console.warn("searchInTextBatched:regex-error", error);
    return;
  }

  const searchText = startOffset > 0 ? text.slice(startOffset) : text;
  const searchStartOffset = startOffset;

  // 在搜索文本中查找匹配
  regex.lastIndex = 0;
  let match: RegExpExecArray | null;
  let batch: TextSearchMatch[] = [];
  let guard = 0;
  const MAX_GUARD = 100000; // 防止空匹配导致的无限循环

  while ((match = regex.exec(searchText)) !== null) {
    if (!match) break;

    const matchText = match[0];
    if (!matchText.length) {
      regex.lastIndex += 1;
      if (++guard > MAX_GUARD) break;
      continue;
    }

    const relativeStartOffset = match.index;
    const relativeEndOffset = relativeStartOffset + matchText.length;
    const absoluteStartOffset = searchStartOffset + relativeStartOffset;
    const absoluteEndOffset = searchStartOffset + relativeEndOffset;

    // 使用预计算的行起始位置快速定位行号和列号
    const lineNum = getLineNumberFromOffset(lineStarts, absoluteStartOffset);
    const lineStartOffset = lineStarts[lineNum - 1] ?? 0;
    const colNum = absoluteStartOffset - lineStartOffset + 1;

    batch.push({
      line: lineNum,
      column: colNum,
      match: matchText,
      groups: match.length > 1 ? [...match] : undefined,
      startOffset: absoluteStartOffset,
      endOffset: absoluteEndOffset,
    });

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
