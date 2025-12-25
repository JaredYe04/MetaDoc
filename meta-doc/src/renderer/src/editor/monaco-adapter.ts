import * as monaco from "monaco-editor";
import {
  ContextOptions,
  EditorSearchState,
  FindByContentOptions,
  FindResult,
  PendingEdit,
  ReplaceOutcome,
  SearchDirection,
  SearchOptions,
  TextAnchor,
  TextEditorAdapter,
  TextPosition,
  TextRange,
} from "./text-editor-types";
import { createRendererLogger, RendererLogger } from "../utils/logger";

const WORD_SEPARATORS_FALLBACK =
  "~!@#$%^&*()-=+[{]}\\|;:'\",.<>/?`´\"“”‘’、，。；：《》（）【】";
const MAX_MATCHES = Number.MAX_SAFE_INTEGER; // 对于 Monaco 编辑器，性能足够好，不需要限制匹配数量
const MAX_HIGHLIGHTED_MATCHES = 512;

let logger:RendererLogger;
const logTrace = (...args: unknown[]) => {
  if(!logger){
    logger=createRendererLogger("MonacoAdapter");
  }
  // eslint-disable-next-line no-console
  logger.debug(...args);
};

const defaultSearchState: EditorSearchState = {
  options: {
    text: "",
    matchCase: false,
    useRegex: false,
    wholeWord: false,
    preserveCase: false,
  },
  matches: [],
  currentIndex: -1,
};

export class MonacoTextEditorAdapter implements TextEditorAdapter {
  public readonly kind = "monaco";

  private readonly editorId: string;
  private decorationIds: string[] = [];
  private state: EditorSearchState = { ...defaultSearchState };
  private isReplacing: boolean = false; // 标记是否正在执行替换操作
  private pendingEdits: Map<string, PendingEdit> = new Map(); // 待确认的编辑操作
  private anchorMarkers: Map<string, string> = new Map(); // 锚点 ID -> Monaco decoration ID 的映射

  constructor(editorId: string) {
    this.editorId = editorId;
  }

  configureSearch(
    options: SearchOptions,
    behavior?: { revealFirst?: boolean },
  ): EditorSearchState {
    const revealFirst = behavior?.revealFirst !== false;
    logTrace("configureSearch:start", {
      textLength: options.text?.length ?? 0,
      behavior,
    });
    
    const normalized: Required<SearchOptions> = {
      text: options.text ?? "",
      matchCase: !!options.matchCase,
      wholeWord: !!options.wholeWord,
      useRegex: !!options.useRegex,
      preserveCase: !!options.preserveCase,
    };
    logger.debug("configureSearch:normalized", normalized);

    // 保存之前的索引，以便在重新搜索后恢复
    const previousIndex = this.state.currentIndex;
    const previousMatchText = this.state.matches[previousIndex]?.matchText;

    this.state = {
      options: normalized,
      matches: [],
      currentIndex: -1,
    };
    this.clearDecorations();
    logger.debug("configureSearch:state", this.state);
    const editor = this.getEditor();
    if (!editor) {
      logTrace("configureSearch:no-editor");
      return this.state;
    }
    if (!normalized.text) {
      return this.state;
    }
    
    // 异步执行搜索，避免大量匹配时卡顿
    this.performAsyncSearch(editor, normalized, previousIndex, previousMatchText, revealFirst);
    
    // 立即返回当前状态（此时 matches 还是空的，会在异步完成后更新）
    return this.getSearchState();
  }

  private performAsyncSearch(
    editor: monaco.editor.IStandaloneCodeEditor,
    normalized: Required<SearchOptions>,
    previousIndex: number,
    previousMatchText: string | undefined,
    revealFirst: boolean,
  ): void {
    const text = editor.getValue();
    const lineStarts = this.computeLineStarts(text);
    
    // 获取当前光标位置，从光标位置开始搜索
    const selection = editor.getSelection();
    const startOffset = selection
      ? editor.getModel()?.getOffsetAt(selection.getStartPosition()) ?? 0
      : 0;
    
    // 使用 requestIdleCallback 或 setTimeout 来异步执行搜索
    const scheduleNext = (callback: () => void) => {
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(callback, { timeout: 50 });
      } else {
        setTimeout(callback, 0);
      }
    };
    
    // 异步执行搜索，避免阻塞 UI
    scheduleNext(() => {
      try {
    const findResults = this.scanTextForMatches(text, normalized, lineStarts, startOffset);
        this.finishSearch(findResults, previousIndex, previousMatchText, revealFirst);
      } catch (error) {
        logTrace("performAsyncSearch:error", error);
        this.state.matches = [];
        this.state.currentIndex = -1;
        this.applyDecorations([], -1);
      }
    });
  }

  private finishSearch(
    findResults: FindResult[],
    previousIndex: number,
    previousMatchText: string | undefined,
    revealFirst: boolean,
  ): void {
    logger.debug("configureSearch:findResults", findResults);
    this.state.matches = findResults;
    
    // 尝试恢复到之前的索引位置（只保留索引值，不恢复光标位置）
    let targetIndex = -1;
    if (previousIndex >= 0 && findResults.length > 0) {
      // 如果之前的索引仍然有效，使用它
      if (previousIndex < findResults.length) {
        targetIndex = previousIndex;
      } else {
        // 如果之前的索引超出范围，尝试找到最接近的匹配
        // 优先尝试找到相同文本的匹配
        const sameTextIndex = findResults.findIndex(
          (m) => m.matchText === previousMatchText
        );
        if (sameTextIndex >= 0) {
          targetIndex = sameTextIndex;
        } else if (findResults.length > 0) {
          // 如果找不到相同文本，使用最后一个匹配
          targetIndex = Math.min(previousIndex, findResults.length - 1);
        }
      }
    } else if (revealFirst && findResults.length > 0) {
      targetIndex = 0;
    }
    
    this.state.currentIndex = targetIndex;
    // 不在搜索时添加所有装饰，只在用户点击列表项时添加（类似 vditor）
    // this.applyDecorations(this.state.matches, this.state.currentIndex);
    // 注意：不调用 revealMatch，只保留索引值，让用户通过"下一个"/"上一个"按钮来导航
    // 这样不会影响用户的编辑体验
    if (revealFirst && targetIndex >= 0 && findResults.length > 0) {
      // 只有在首次搜索时才跳转到第一个匹配并添加装饰
      this.applyDecorations([findResults[targetIndex]], 0);
      this.revealMatch(findResults[targetIndex]);
    }

    logTrace("configureSearch:done", {
      totalMatches: findResults.length,
      highlighted: Math.min(findResults.length, MAX_HIGHLIGHTED_MATCHES),
      revealFirst,
      restoredIndex: targetIndex,
    });
  }

  getSearchState(): EditorSearchState {
    return {
      options: { ...this.state.options },
      matches: this.state.matches.map((match) => ({
        range: { ...match.range },
        anchor: match.anchor,
        matchText: match.matchText,
        groups: match.groups ? [...match.groups] : undefined,
        // 保留偏移量信息
        startOffset: (match as any).startOffset,
        endOffset: (match as any).endOffset,
      })),
      currentIndex: this.state.currentIndex,
    };
  }

  find(direction: SearchDirection): EditorSearchState {
    logTrace("find:start", { direction });
    if (!this.state.matches.length) {
      logTrace("find:skip-empty");
      return this.getSearchState();
    }

    const delta = direction === "next" ? 1 : -1;
    const nextIndex =
      (this.state.currentIndex + delta + this.state.matches.length) %
      this.state.matches.length;
    this.state.currentIndex = nextIndex;
    const match = this.state.matches[nextIndex];
    logTrace("find:match", { match });
    // 只高亮当前匹配，不高亮所有匹配（类似 vditor）
    this.applyDecorations([match], 0);
    logTrace("find:applyDecorations:done");
    this.revealMatch(match);
    logTrace("find:revealMatch:done");
    return this.getSearchState();
  }

  replaceCurrent(replacement: string): EditorSearchState {
    if (!this.state.matches.length) {
      logTrace("replaceCurrent:skip-empty");
      return this.getSearchState();
    }
    if (this.state.currentIndex < 0) {
      this.state.currentIndex = 0;
    }
    const currentMatch = this.state.matches[this.state.currentIndex];
    this.isReplacing = true;
    try {
    this.performReplacement(currentMatch, replacement);
    this.configureSearch(this.state.options);
    } finally {
      this.isReplacing = false;
    }
    logTrace("replaceCurrent:done", { index: this.state.currentIndex });
    return this.getSearchState();
  }

  replaceNext(replacement: string): EditorSearchState {
    if (!this.state.matches.length) {
      logTrace("replaceNext:skip-empty");
      return this.getSearchState();
    }
    const stateBefore = this.getSearchState();
    if (stateBefore.currentIndex === -1) {
      this.find("next");
    }
    const afterFind = this.getSearchState();
    if (afterFind.currentIndex === -1) {
      return afterFind;
    }
    const currentMatch = afterFind.matches[afterFind.currentIndex];
    this.isReplacing = true;
    try {
    this.performReplacement(currentMatch, replacement);
    this.configureSearch(this.state.options);
    } finally {
      this.isReplacing = false;
    }
    logTrace("replaceNext:done", { index: afterFind.currentIndex });
    return this.getSearchState();
  }

  replaceAll(replacement: string): ReplaceOutcome {
    // 使用基于内容的查找，创建带锚点的 FindResult
    const searchText = this.state.options.text;
    if (!searchText) {
      return { state: this.getSearchState(), replacedCount: 0 };
    }

    // 重新查找所有匹配（基于当前文本内容，创建锚点）
    const matches = this.findTextByContent(searchText, {
      matchCase: this.state.options.matchCase,
      wholeWord: this.state.options.wholeWord,
      useRegex: this.state.options.useRegex,
    });

    if (!matches.length) {
      return { state: this.getSearchState(), replacedCount: 0 };
    }

    this.isReplacing = true;
    try {
      // 使用锚点的 replace 方法，从后往前替换
      // 注意：即使从后往前，由于使用锚点，每个替换都是基于当前实际位置
      const reversedMatches = [...matches].reverse();
      let replacedCount = 0;

      for (const match of reversedMatches) {
        let replacementText = replacement;
        // 处理正则表达式替换组
        if (this.state.options.useRegex && match.groups && match.groups.length > 0) {
          // 处理 $1, $2, $3... 等捕获组引用
          // 同时也支持 $$ 表示字面量 $
          replacementText = replacementText.replace(/\$(\d+)|(\$\$)/g, (fullMatch, indexStr, literalDollar) => {
            // 如果是 $$，返回单个 $
            if (literalDollar) {
              return "$";
            }
            // 如果是 $1, $2 等，返回对应的捕获组
            const index = Number(indexStr);
            if (Number.isNaN(index) || index < 0 || index >= match.groups!.length) {
              return fullMatch; // 如果索引无效，返回原始字符串
            }
            return match.groups![index] ?? "";
          });
        }
        // 处理大小写保留
        if (this.state.options.preserveCase) {
          replacementText = this.adjustCase(match.matchText, replacementText);
        }
        
        // 使用锚点的 replace 方法
        if (match.replace) {
          match.replace(replacementText);
          replacedCount++;
        }
      }

      // 清理所有锚点
      this.clearAnchors();

      // 重新搜索以更新状态
    this.configureSearch(this.state.options);
    logTrace("replaceAll:done", { replacedCount });
    return { state: this.getSearchState(), replacedCount };
    } finally {
      this.isReplacing = false;
    }
  }

  private clearAnchors(): void {
    const editor = this.getEditor();
    if (editor && this.anchorMarkers.size > 0) {
      const decorationIds = Array.from(this.anchorMarkers.values());
      editor.deltaDecorations(decorationIds, []);
      this.anchorMarkers.clear();
    }
  }

  clearSearch(): void {
    this.clearDecorations();
    this.clearAnchors();
    this.state = { ...defaultSearchState };
  }

  private setupContentChangeListener(): void {
    // 已移除文本更新触发的自动重新搜索逻辑
    // 搜索和替换现在基于实时文本内容，不需要监听内容变化
  }

  dispose(): void {
    this.clearSearch();
  }

  focus(): void {
    this.getEditor()?.focus();
  }

  getSelectionText(): string {
    const editor = this.getEditor();
    if (!editor) return "";
    const model = editor.getModel();
    if (!model) return "";
    const selection = editor.getSelection();
    if (!selection) return "";
    return model.getValueInRange(selection);
  }

  getSelectionRange(): TextRange | null {
    const editor = this.getEditor();
    if (!editor) return null;
    const selection = editor.getSelection();
    if (!selection) return null;
    return this.fromMonacoRange(selection);
  }

  insertText(text: string, opts?: { replaceSelection?: boolean }): void {
    const editor = this.getEditor();
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;
    const selection = editor.getSelection();
    if (!selection) {
      const position = editor.getPosition();
      editor.trigger("keyboard", "type", { text });
      if (position) {
        const startOffset = model.getOffsetAt(position);
        const endOffset = startOffset + text.length;
        const endPosition = model.getPositionAt(endOffset);
        editor.setPosition(endPosition);
        editor.revealPositionInCenter(endPosition);
      }
      return;
    }
    const range = opts?.replaceSelection
      ? new monaco.Range(
          selection.startLineNumber,
          selection.startColumn,
          selection.endLineNumber,
          selection.endColumn,
        )
      : new monaco.Range(
          selection.endLineNumber,
          selection.endColumn,
          selection.endLineNumber,
          selection.endColumn,
        );
    const startPosition = new monaco.Position(
      range.startLineNumber,
      range.startColumn,
    );
    const startOffset = model.getOffsetAt(startPosition);
    // executeEdits的第三个参数应该是undefined，而不是空数组
    editor.executeEdits("insert-text", [
      {
        range,
        text,
        forceMoveMarkers: true,
      },
    ], undefined);
    editor.pushUndoStop();
    const endOffset = startOffset + text.length;
    const endPosition = model.getPositionAt(endOffset);
    const newSelection = new monaco.Selection(
      endPosition.lineNumber,
      endPosition.column,
      endPosition.lineNumber,
      endPosition.column,
    );
    editor.setSelection(newSelection);
    editor.revealPositionInCenter(endPosition);
    logTrace("insertText:done", {
      length: text.length,
      replaceSelection: !!opts?.replaceSelection,
    });
  }

  async copy(): Promise<void> {
    const text = this.getSelectionText();
    if (!text) return;
    await navigator.clipboard.writeText(text);
  }

  async cut(): Promise<void> {
    const text = this.getSelectionText();
    if (!text) return;
    await navigator.clipboard.writeText(text);
    this.insertText("", { replaceSelection: true });
  }

  async paste(): Promise<void> {
    const text = await navigator.clipboard.readText();
    if (!text) return;
    this.insertText(text, { replaceSelection: true });
  }

  selectAll(): void {
    const editor = this.getEditor();
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;
    const fullRange = model.getFullModelRange();
    editor.setSelection(fullRange);
    editor.focus();
  }

  goTo(position: TextPosition): void {
    const editor = this.getEditor();
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;
    const safeLine = Math.max(1, Math.min(model.getLineCount(), position.line));
    const safeColumn = Math.max(
      1,
      Math.min(model.getLineMaxColumn(safeLine), position.column),
    );
    const pos = new monaco.Position(safeLine, safeColumn);
    editor.setPosition(pos);
    editor.revealPositionInCenter(pos);
  }

  goToRanges(ranges: TextRange[]): void {
    const selections = ranges.map(
      (range) =>
        new monaco.Selection(
          range.start.line,
          range.start.column,
          range.end.line,
          range.end.column,
        ),
    );
    const editor = this.getEditor();
    if (!editor) return;
    if (selections.length) {
      editor.setSelections(selections);
      editor.revealRangeInCenter(selections[0]);
    }
  }

  // ========== 文本获取 ==========
  getFullText(): string {
    const editor = this.getEditor();
    if (!editor) return "";
    const model = editor.getModel();
    if (!model) return "";
    return model.getValue();
  }

  getTextAt(range: TextRange): string {
    const editor = this.getEditor();
    if (!editor) return "";
    const model = editor.getModel();
    if (!model) return "";
    const monacoRange = this.toMonacoRange(range);
    return model.getValueInRange(monacoRange);
  }

  getLineText(line: number): string {
    const editor = this.getEditor();
    if (!editor) return "";
    const model = editor.getModel();
    if (!model) return "";
    const safeLine = Math.max(1, Math.min(model.getLineCount(), line));
    return model.getLineContent(safeLine);
  }

  getLines(startLine: number, endLine: number): string[] {
    const editor = this.getEditor();
    if (!editor) return [];
    const model = editor.getModel();
    if (!model) return [];
    const lineCount = model.getLineCount();
    const safeStart = Math.max(1, Math.min(lineCount, startLine));
    const safeEnd = Math.max(safeStart, Math.min(lineCount, endLine));
    const lines: string[] = [];
    for (let i = safeStart; i <= safeEnd; i++) {
      lines.push(model.getLineContent(i));
    }
    return lines;
  }

  getLineCount(): number {
    const editor = this.getEditor();
    if (!editor) return 0;
    const model = editor.getModel();
    if (!model) return 0;
    return model.getLineCount();
  }

  // ========== 精准定位和查找 ==========
  findTextByContent(
    text: string,
    options?: FindByContentOptions,
  ): FindResult[] {
    const fullText = this.getFullText();
    if (!fullText || !text) return [];

    const matchCase = options?.matchCase ?? false;
    const wholeWord = options?.wholeWord ?? false;
    const useRegex = options?.useRegex ?? false;
    const maxResults = options?.maxResults ?? MAX_MATCHES;

    let regex: RegExp;
    try {
      if (useRegex) {
        regex = new RegExp(text, matchCase ? "g" : "gi");
      } else {
        const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        regex = new RegExp(escaped, matchCase ? "g" : "gi");
      }
    } catch (error) {
      logTrace("findTextByContent:regex-error", error);
      return [];
    }

    const lineStarts = this.computeLineStarts(fullText);
    const separators = this.getWordSeparators();
    const results: FindResult[] = [];

    let match: RegExpExecArray | null;
    regex.lastIndex = 0;
    while ((match = regex.exec(fullText)) !== null && results.length < maxResults) {
      const start = match.index;
      const end = start + match[0].length;

      if (wholeWord && !this.isWholeWordBoundary(fullText, start, end, separators)) {
        continue;
      }

      const range = this.offsetsToRange(start, end, lineStarts);
      const anchorId = `anchor-${Date.now()}-${results.length}-${Math.random().toString(36).substr(2, 9)}`;
      
      // 创建锚点装饰（不可见，仅用于跟踪位置）
      const editor = this.getEditor();
      if (editor) {
        const monacoRange = this.toMonacoRange(range);
        const decorationId = editor.deltaDecorations([], [
          {
            range: monacoRange,
            options: {
              // 使用 NeverGrowsWhenTypingAtEdges 确保锚点不会因为输入而移动
              stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
              // 不显示任何视觉效果
              className: "",
            },
          },
        ])[0];
        this.anchorMarkers.set(anchorId, decorationId);
      }

      const anchor: TextAnchor = {
        id: anchorId,
        type: "monaco-marker",
        data: { range },
      };

      // 创建 FindResult，包含锚点和动态方法
      const findResult: FindResult = {
        range,
        matchText: match[0],
        groups: useRegex ? [...match] : undefined,
        anchor,
        getCurrentRange: () => {
          const editor = this.getEditor();
          if (!editor) return null;
          const decorationId = this.anchorMarkers.get(anchorId);
          if (!decorationId) return null;
          const model = editor.getModel();
          if (!model) return null;
          
          // 获取所有装饰，找到对应的装饰
          const decorations = model.getAllDecorations();
          const decoration = decorations.find(d => d.id === decorationId);
          if (!decoration) return null;
          return this.fromMonacoRange(decoration.range);
        },
        replace: (replacement: string) => {
          const editor = this.getEditor();
          if (!editor) return;
          const decorationId = this.anchorMarkers.get(anchorId);
          if (!decorationId) return;
          const model = editor.getModel();
          if (!model) return;
          
          // 获取当前实际范围（基于锚点）
          const decorations = model.getAllDecorations();
          const decoration = decorations.find(d => d.id === decorationId);
          if (!decoration) return;
          
          const currentRange = decoration.range;
          editor.pushUndoStop();
          // executeEdits的第三个参数应该是undefined，避免Monaco内部错误
          editor.executeEdits("anchor-replace", [
            {
              range: currentRange,
              text: replacement,
              forceMoveMarkers: true,
            },
          ], undefined);
          editor.pushUndoStop();
          
          // 更新锚点位置
          const newRange = new monaco.Range(
            currentRange.startLineNumber,
            currentRange.startColumn,
            currentRange.startLineNumber,
            currentRange.startColumn + replacement.length,
          );
          editor.deltaDecorations([decorationId], [
            {
              range: newRange,
              options: {
                stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
                className: "",
              },
            },
          ]);
        },
        getContext: (options?: ContextOptions) => {
          const currentRange = findResult.getCurrentRange?.();
          if (!currentRange) return "";
          return this.getContext(currentRange, options);
        },
      };

      results.push(findResult);
    }

    return results;
  }

  getContext(range: TextRange, options?: ContextOptions): string {
    const editor = this.getEditor();
    if (!editor) return "";
    const model = editor.getModel();
    if (!model) return "";

    const beforeLines = options?.beforeLines ?? 3;
    const afterLines = options?.afterLines ?? 3;
    const beforeChars = options?.beforeChars;
    const afterChars = options?.afterChars;

    const startLine = Math.max(1, range.start.line - beforeLines);
    const endLine = Math.min(model.getLineCount(), range.end.line + afterLines);

    let context = "";
    for (let i = startLine; i <= endLine; i++) {
      context += model.getLineContent(i) + "\n";
    }

    // 如果指定了字符数限制，进一步裁剪
    if (beforeChars !== undefined || afterChars !== undefined) {
      const rangeText = this.getTextAt(range);
      const rangeStartOffset = model.getOffsetAt(
        new monaco.Position(range.start.line, range.start.column),
      );
      const rangeEndOffset = model.getOffsetAt(
        new monaco.Position(range.end.line, range.end.column),
      );
      const fullText = model.getValue();
      const beforeText = beforeChars
        ? fullText.slice(Math.max(0, rangeStartOffset - beforeChars), rangeStartOffset)
        : "";
      const afterText = afterChars
        ? fullText.slice(rangeEndOffset, Math.min(fullText.length, rangeEndOffset + afterChars))
        : "";
      context = beforeText + rangeText + afterText;
    }

    return context.trim();
  }

  locateText(text: string, options?: FindByContentOptions): TextRange | null {
    const results = this.findTextByContent(text, { ...options, maxResults: 1 });
    return results.length > 0 ? results[0].range : null;
  }

  // ========== 编辑操作 ==========
  replaceRange(range: TextRange, text: string): void {
    const editor = this.getEditor();
    if (!editor) return;
    const monacoRange = this.toMonacoRange(range);
    editor.pushUndoStop();
    // executeEdits的第三个参数应该是undefined，避免Monaco内部错误
    editor.executeEdits("replace-range", [
      {
        range: monacoRange,
        text,
        forceMoveMarkers: true,
      },
    ], undefined);
    editor.pushUndoStop();
  }

  deleteRange(range: TextRange): void {
    this.replaceRange(range, "");
  }

  insertAt(position: TextPosition, text: string): void {
    const editor = this.getEditor();
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;
    const safeLine = Math.max(1, Math.min(model.getLineCount(), position.line));
    const safeColumn = Math.max(
      1,
      Math.min(model.getLineMaxColumn(safeLine), position.column),
    );
    const pos = new monaco.Position(safeLine, safeColumn);
    editor.pushUndoStop();
    // executeEdits的第三个参数应该是undefined，避免Monaco内部错误
    editor.executeEdits("insert-at", [
      {
        range: new monaco.Range(safeLine, safeColumn, safeLine, safeColumn),
        text,
        forceMoveMarkers: true,
      },
    ], undefined);
    editor.pushUndoStop();
    editor.setPosition(new monaco.Position(safeLine, safeColumn + text.length));
    editor.revealPositionInCenter(editor.getPosition()!);
  }

  applyEdits(edits: Array<{ range: TextRange; text: string }>): void {
    const editor = this.getEditor();
    if (!editor) return;
    // 从后往前应用编辑，避免位置偏移
    const monacoEdits = edits
      .map((edit) => ({
        range: this.toMonacoRange(edit.range),
        text: edit.text,
        forceMoveMarkers: true,
      }))
      .reverse();
    editor.pushUndoStop();
    // executeEdits的第三个参数应该是undefined，避免Monaco内部错误
    editor.executeEdits("apply-edits", monacoEdits, undefined);
    editor.pushUndoStop();
  }

  // ========== Pending 编辑操作 ==========
  createPendingEdit(edit: Omit<PendingEdit, "id">): string {
    const id = `pending-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const pendingEdit: PendingEdit = {
      ...edit,
      id,
    };
    this.pendingEdits.set(id, pendingEdit);
    return id;
  }

  applyPendingEdit(id: string): void {
    const edit = this.pendingEdits.get(id);
    if (!edit) return;

    try {
      switch (edit.type) {
        case "insert":
          if (edit.position) {
            this.insertAt(edit.position, edit.text);
          }
          break;
        case "delete":
          if (edit.range) {
            this.deleteRange(edit.range);
          }
          break;
        case "replace":
          if (edit.range) {
            this.replaceRange(edit.range, edit.text);
          }
          break;
      }
      this.pendingEdits.delete(id);
    } catch (error) {
      logTrace("applyPendingEdit:error", error);
    }
  }

  rejectPendingEdit(id: string): void {
    this.pendingEdits.delete(id);
  }

  getPendingEdits(): PendingEdit[] {
    return Array.from(this.pendingEdits.values());
  }

  clearPendingEdits(): void {
    this.pendingEdits.clear();
  }

  private performReplacement(match: FindResult, replacement: string) {
    const editor = this.getEditor();
    if (!editor) return;
    const replacementText = this.computeReplacementText(match, replacement);
    const range = this.toMonacoRange(match.range);
    editor.pushUndoStop();
    // executeEdits的第三个参数应该是undefined，避免Monaco内部错误
    editor.executeEdits("search-replace", [
      {
        range,
        text: replacementText,
        forceMoveMarkers: true,
      },
    ], undefined);
    editor.pushUndoStop();
    const selection = new monaco.Selection(
      range.startLineNumber,
      range.startColumn,
      range.startLineNumber,
      range.startColumn + replacementText.length,
    );
    editor.setSelection(selection);
    editor.revealRangeInCenter(selection);
    logTrace("performReplacement", {
      range,
      replacementLength: replacementText.length,
    });
  }

  private computeReplacementText(match: FindResult, replacement: string): string {
    let result = replacement;
    if (this.state.options.useRegex && match.groups && match.groups.length > 0) {
      // 处理 $1, $2, $3... 等捕获组引用
      // 同时也支持 $$ 表示字面量 $
      result = result.replace(/\$(\d+)|(\$\$)/g, (fullMatch, indexStr, literalDollar) => {
        // 如果是 $$，返回单个 $
        if (literalDollar) {
          return "$";
        }
        // 如果是 $1, $2 等，返回对应的捕获组
        const index = Number(indexStr);
        if (Number.isNaN(index) || index < 0 || index >= match.groups!.length) {
          return fullMatch; // 如果索引无效，返回原始字符串
        }
        return match.groups![index] ?? "";
      });
    }
    if (this.state.options.preserveCase) {
      result = this.adjustCase(match.matchText, result);
    }
    return result;
  }

  private adjustCase(source: string, target: string): string {
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

  private revealMatch(match: FindResult) {
    const editor = this.getEditor();
    if (!editor) return;
    const range = this.toMonacoRange(match.range);
    editor.setSelection(range);
    editor.revealRangeInCenter(range);
  }

  // 将 applyDecorations 改为 public，以便 SearchReplaceMenu 可以调用
  applyDecorations(matches: FindResult[], activeIndex: number) {
    // 只高亮传入的匹配（通常只有一个）
    const decorations = matches.map((match, index) => {
      const isActive = index === activeIndex;
      return {
        range: this.toMonacoRange(match.range),
        options: {
          className: isActive
            ? "md-editor-search-active"
            : "md-editor-search-match",
          isWholeLine: false,
        },
      } as monaco.editor.IModelDeltaDecoration;
    });
    const editor = this.getEditor();
    if (!editor) return;
    this.decorationIds = editor.deltaDecorations(
      this.decorationIds,
      decorations,
    );
  }

  private clearDecorations() {
    if (!this.decorationIds.length) return;
    const editor = this.getEditor();
    if (!editor) {
      this.decorationIds = [];
      return;
    }
    this.decorationIds = editor.deltaDecorations(this.decorationIds, []);
    logger.debug("clearDecorations:done", { decorationIds: this.decorationIds });
  }

  private fromMonacoRange(range: monaco.Range): TextRange {
    return {
      start: { line: range.startLineNumber, column: range.startColumn },
      end: { line: range.endLineNumber, column: range.endColumn },
    };
  }

  private toMonacoRange(range: TextRange): monaco.Range {
    return new monaco.Range(
      range.start.line,
      range.start.column,
      range.end.line,
      range.end.column,
    );
  }

  private getWordSeparators(): string {
    try {
      const editor = this.getEditor();
      if (editor) {
        const option = editor.getOption(
          monaco.editor.EditorOption.wordSeparators,
        );
        if (typeof option === "string" && option.length) return option;
      }
    } catch (error) {
      // ignore
    }
    return WORD_SEPARATORS_FALLBACK;
  }

  private computeLineStarts(text: string): number[] {
    const starts: number[] = [0];
    for (let i = 0; i < text.length; i += 1) {
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

  private scanTextForMatches(
    text: string,
    options: Required<SearchOptions>,
    lineStarts: number[],
    startOffset: number = 0,
  ): FindResult[] {
    const results: FindResult[] = [];
    if (!text || !options.text) return results;
    const regex = this.buildSearchRegex(options);
    if (!regex) return results;
    const separators = this.getWordSeparators();
    
    // 从指定偏移量开始搜索
    const searchText = startOffset > 0 ? text.slice(startOffset) : text;
    const searchStartOffset = startOffset;
    
    // 对于 Monaco 编辑器，性能足够好，不需要限制匹配数量
    // 但保留 guard 机制防止空匹配时的无限循环
    const BATCH_SIZE = 100; // 每批处理100个匹配
    let guard = 0;
    let processedCount = 0;
    const MAX_GUARD = 100000; // guard 的最大值，防止无限循环
    
    // 移除 MAX_MATCHES 限制，允许查找所有匹配
    regex.lastIndex = 0;
    while (true) {
      const match = regex.exec(searchText);
      if (!match) break;
      const value = match[0];
      const relativeStart = match.index;
      const relativeEnd = relativeStart + value.length;
      const absoluteStart = searchStartOffset + relativeStart;
      const absoluteEnd = searchStartOffset + relativeEnd;
      
      if (!value.length) {
        regex.lastIndex += 1;
        if (++guard > MAX_GUARD) break; // 防止空匹配导致的无限循环
        continue;
      }
      
      if (
        options.wholeWord &&
        !this.isWholeWordBoundary(text, absoluteStart, absoluteEnd, separators)
      ) {
        continue;
      }
      
      results.push({
        range: this.offsetsToRange(absoluteStart, absoluteEnd, lineStarts),
        matchText: value,
        groups: options.useRegex ? [...match] : undefined,
        anchor: null as unknown as TextAnchor,
        // 添加偏移量信息，用于生成上下文
        startOffset: absoluteStart,
        endOffset: absoluteEnd,
      } as FindResult & { startOffset: number; endOffset: number });

      processedCount++;
      // 这里保持同步，但通过分批处理来减少单次阻塞时间
    }
    
    return results;
  }

  private buildSearchRegex(options: Required<SearchOptions>): RegExp | null {
    try {
      if (options.useRegex) {
        const flags = options.matchCase ? "g" : "gi";
        return new RegExp(options.text, flags);
      }
      const escaped = options.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const flags = options.matchCase ? "g" : "gi";
      return new RegExp(escaped, flags);
    } catch (error) {
      logTrace("buildSearchRegex:error", error);
      throw error;
    }
  }

  private offsetsToRange(
    start: number,
    end: number,
    lineStarts: number[],
  ): TextRange {
    return {
      start: this.offsetToPosition(start, lineStarts),
      end: this.offsetToPosition(end, lineStarts),
    };
  }

  private offsetToPosition(
    offset: number,
    lineStarts: number[],
  ): TextPosition {
    const line = this.getLineNumberFromOffset(lineStarts, offset);
    const lineStart = lineStarts[line - 1] ?? 0;
    return {
      line,
      column: offset - lineStart + 1,
    };
  }

  private getLineNumberFromOffset(
    lineStarts: number[],
    offset: number,
  ): number {
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

  private isWholeWordBoundary(
    text: string,
    start: number,
    end: number,
    separators: string,
  ): boolean {
    const before = text[start - 1];
    const after = text[end];
    return (
      this.isSeparatorChar(before, separators) &&
      this.isSeparatorChar(after, separators)
    );
  }

  private isSeparatorChar(
    char: string | undefined,
    separators: string,
  ): boolean {
    if (char === undefined) return true;
    if (separators.includes(char)) return true;
    return /\s/.test(char);
  }

  private getEditor(): monaco.editor.IStandaloneCodeEditor | null {
    const registry =
      ((monaco.editor as unknown as { getEditors?: () => monaco.editor.IStandaloneCodeEditor[] })
        .getEditors?.() ?? []) as monaco.editor.IStandaloneCodeEditor[];
    const found = registry.find((instance) => instance.getId?.() === this.editorId);
    if (!found) {
      logTrace("getEditor:not-found", { editorId: this.editorId });
    }
    return found ?? null;
  }
}

export function createMonacoAdapter(
  editorId: string | null | undefined,
): MonacoTextEditorAdapter | null {
  if (!editorId) return null;
  return new MonacoTextEditorAdapter(editorId);
}

