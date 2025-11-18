import type Vditor from "vditor";
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

interface HighlightMatch {
  element: HTMLSpanElement;
  range: TextRange;
  text: string;
  groups?: string[];
}

const HIGHLIGHT_CLASS = "md-editor-search-match";
const ACTIVE_CLASS = "md-editor-search-active";
const defaultState: EditorSearchState = {
  options: {
    text: "",
    matchCase: false,
    wholeWord: false,
    useRegex: false,
    preserveCase: false,
  },
  matches: [],
  currentIndex: -1,
};

export interface VditorAdapterOptions {
  getInstance: () => Vditor | null | undefined;
  syncMarkdown: (markdown: string) => void;
}

export class VditorTextEditorAdapter implements TextEditorAdapter {
  public readonly kind = "vditor";
  private readonly getInstance: () => Vditor | null | undefined;
  private readonly syncMarkdown: (markdown: string) => void;
  private state: EditorSearchState = { ...defaultState };
  private highlights: HighlightMatch[] = [];
  private isReplacing: boolean = false; // 标记是否正在执行替换操作
  private pendingEdits: Map<string, PendingEdit> = new Map(); // 待确认的编辑操作

  constructor(options: VditorAdapterOptions) {
    this.getInstance = options.getInstance;
    this.syncMarkdown = options.syncMarkdown;
  }

  configureSearch(
    options: SearchOptions,
    behavior?: { revealFirst?: boolean },
  ): EditorSearchState {
    const revealFirst = behavior?.revealFirst !== false;
    
    // 保存之前的索引，以便在重新搜索后恢复
    const previousIndex = this.state.currentIndex;
    const previousMatchText = this.state.matches[previousIndex]?.matchText;
    
    this.clearHighlights();
    const normalized: SearchOptions = {
      text: options.text ?? "",
      matchCase: !!options.matchCase,
      wholeWord: !!options.wholeWord,
      useRegex: !!options.useRegex,
      preserveCase: !!options.preserveCase,
    };
    this.state = {
      options: normalized,
      matches: [],
      currentIndex: -1,
    };

    if (!normalized.text) {
      return this.getSearchState();
    }

    const root = this.getEditableRoot();
    if (!root) {
      return this.getSearchState();
    }

    // 异步执行搜索，避免大量匹配时卡顿
    this.performAsyncSearch(root, normalized, previousIndex, previousMatchText, revealFirst);
    
    // 立即返回当前状态（此时 matches 还是空的，会在异步完成后更新）
    return this.getSearchState();
  }

  private performAsyncSearch(
    root: HTMLElement,
    normalized: SearchOptions,
    previousIndex: number,
    previousMatchText: string | undefined,
    revealFirst: boolean,
  ): void {
    // 使用 requestIdleCallback 或 setTimeout 来异步执行搜索
    const scheduleNext = (callback: () => void) => {
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(callback, { timeout: 50 });
      } else {
        setTimeout(callback, 0);
      }
    };
    
    scheduleNext(() => {
      try {
        const regex = this.buildRegex(normalized);
        const walker = document.createTreeWalker(
          root,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: (node) => {
              if (!node || !node.textContent) return NodeFilter.FILTER_REJECT;
              if (node.parentElement?.classList.contains(HIGHLIGHT_CLASS)) {
                return NodeFilter.FILTER_REJECT;
              }
              if (this.shouldSkipNode(node.parentElement)) {
                return NodeFilter.FILTER_REJECT;
              }
              return NodeFilter.FILTER_ACCEPT;
            },
          },
        );

        const highlights: HighlightMatch[] = [];
        let processedNodes = 0;
        const BATCH_SIZE = 50; // 每批处理50个文本节点

        const processBatch = () => {
          let currentNode = walker.nextNode() as Text | null;
          let batchCount = 0;
          
          while (currentNode && batchCount < BATCH_SIZE) {
            const textContent = currentNode.textContent ?? "";
            regex.lastIndex = 0;
            let match: RegExpExecArray | null;
            const fragments: { start: number; end: number; match: RegExpExecArray }[] = [];
            while ((match = regex.exec(textContent)) !== null) {
              const start = match.index;
              const end = start + match[0].length;
              fragments.push({ start, end, match });
              if (!regex.global) break;
              if (match[0].length === 0) {
                regex.lastIndex += 1;
              }
            }

            if (fragments.length) {
              const nodeHighlights: HighlightMatch[] = [];
              for (let i = fragments.length - 1; i >= 0; i -= 1) {
                const { start, end, match } = fragments[i];
                const range = document.createRange();
                range.setStart(currentNode, start);
                range.setEnd(currentNode, end);
                const span = document.createElement("span");
                span.className = HIGHLIGHT_CLASS;
                span.appendChild(range.extractContents());
                range.insertNode(span);
                nodeHighlights.push({
                  element: span,
                  range: this.getRangeFromElement(span),
                  text: match[0],
                  groups: Array.from(match),
                });
              }
              nodeHighlights.reverse().forEach((item) => {
                item.element.dataset.index = String(highlights.length);
                highlights.push(item);
              });
            }

            currentNode = walker.nextNode() as Text | null;
            batchCount++;
            processedNodes++;
          }

          // 如果还有节点需要处理，继续处理下一批
          if (currentNode) {
            scheduleNext(processBatch);
          } else {
            // 搜索完成，更新状态
            this.finishSearch(highlights, previousIndex, previousMatchText, revealFirst);
          }
        };
        
        processBatch();
      } catch (error) {
        console.warn("performAsyncSearch:error", error);
        this.state.matches = [];
        this.state.currentIndex = -1;
        this.highlights = [];
      }
    });
  }

  private finishSearch(
    highlights: HighlightMatch[],
    previousIndex: number,
    previousMatchText: string | undefined,
    revealFirst: boolean,
  ): void {
    this.highlights = highlights;
    this.state.matches = highlights.map((item, index) => {
      // 创建锚点（使用 highlight 元素作为锚点）
      const anchorId = `anchor-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`;
      const anchor: TextAnchor = {
        id: anchorId,
        type: "vditor-element",
        data: { element: item.element, range: item.range },
      };

      return {
        range: item.range,
        matchText: item.text,
        groups: item.groups,
        anchor,
        getCurrentRange: () => {
          // 通过 highlight 元素获取当前范围
          if (!item.element.parentNode) return null;
          return this.getRangeFromElement(item.element);
        },
        replace: (replacement: string) => {
          // 直接替换 highlight 元素的内容
          item.element.textContent = replacement;
          this.syncAfterMutation();
        },
        getContext: (options?: ContextOptions) => {
          const currentRange = this.getRangeFromElement(item.element);
          return this.getContext(currentRange, options);
        },
      };
    });
    
    // 尝试恢复到之前的索引位置（只保留索引值，不恢复光标位置）
    let targetIndex = -1;
    if (previousIndex >= 0 && highlights.length > 0) {
      // 如果之前的索引仍然有效，使用它
      if (previousIndex < highlights.length) {
        targetIndex = previousIndex;
      } else {
        // 如果之前的索引超出范围，尝试找到最接近的匹配
        // 优先尝试找到相同文本的匹配
        const sameTextIndex = highlights.findIndex(
          (h) => h.text === previousMatchText
        );
        if (sameTextIndex >= 0) {
          targetIndex = sameTextIndex;
        } else if (highlights.length > 0) {
          // 如果找不到相同文本，使用最后一个匹配
          targetIndex = Math.min(previousIndex, highlights.length - 1);
        }
      }
    } else if (revealFirst && highlights.length > 0) {
      targetIndex = 0;
    }
    
    this.state.currentIndex = targetIndex;
    // 注意：不调用 setActiveHighlight 来聚焦，只保留索引值，让用户通过"下一个"/"上一个"按钮来导航
    // 这样不会影响用户的编辑体验
    if (revealFirst && targetIndex >= 0 && highlights.length > 0) {
      // 只有在首次搜索时才跳转到第一个匹配
      this.setActiveHighlight(this.state.currentIndex, {
        focus: true,
      });
    } else {
      // 只更新高亮样式，不改变光标位置
      this.setActiveHighlight(this.state.currentIndex, {
        focus: false,
      });
    }
  }

  getSearchState(): EditorSearchState {
    return {
      options: { ...this.state.options },
      matches: this.state.matches.map((match) => ({
        range: { ...match.range },
        matchText: match.matchText,
        groups: match.groups ? [...match.groups] : undefined,
        anchor: match.anchor,
        getCurrentRange: match.getCurrentRange,
        replace: match.replace,
        getContext: match.getContext,
      })),
      currentIndex: this.state.currentIndex,
    };
  }

  find(direction: SearchDirection): EditorSearchState {
    if (!this.highlights.length) {
      return this.getSearchState();
    }
    const delta = direction === "next" ? 1 : -1;
    const baseIndex =
      this.state.currentIndex === -1
        ? direction === "next"
          ? -1
          : 0
        : this.state.currentIndex;
    this.state.currentIndex =
      (baseIndex + delta + this.highlights.length) %
      this.highlights.length;
    this.setActiveHighlight(this.state.currentIndex, { focus: true });
    return this.getSearchState();
  }

  replaceCurrent(replacement: string): EditorSearchState {
    if (this.state.currentIndex === -1 || !this.highlights.length) {
      return this.getSearchState();
    }
    const highlight = this.highlights[this.state.currentIndex];
    const value = this.computeReplacementText(highlight, replacement);
    this.isReplacing = true;
    try {
      highlight.element.textContent = value;
      this.syncAfterMutation();
      return this.configureSearch(this.state.options);
    } finally {
      this.isReplacing = false;
    }
  }

  replaceNext(replacement: string): EditorSearchState {
    if (!this.highlights.length) {
      return this.getSearchState();
    }
    if (this.state.currentIndex === -1) {
      this.find("next");
    }
    if (this.state.currentIndex === -1) {
      return this.getSearchState();
    }
    const highlight = this.highlights[this.state.currentIndex];
    const value = this.computeReplacementText(highlight, replacement);
    this.isReplacing = true;
    try {
      highlight.element.textContent = value;
      this.syncAfterMutation();
      const nextState = this.configureSearch(this.state.options);
      if (nextState.matches.length) {
        this.find("next");
      }
      return this.getSearchState();
    } finally {
      this.isReplacing = false;
    }
  }

  replaceAll(replacement: string): ReplaceOutcome {
    // 使用基于内容的查找，确保即使文本发生变化也能准确找到所有匹配
    const searchText = this.state.options.text;
    if (!searchText) {
      return { state: this.getSearchState(), replacedCount: 0 };
    }

    // 获取当前完整文本
    const fullText = this.getFullText();
    if (!fullText) {
      return { state: this.getSearchState(), replacedCount: 0 };
    }

    // 构建搜索正则表达式
    let regex: RegExp;
    try {
      if (this.state.options.useRegex) {
        regex = new RegExp(searchText, this.state.options.matchCase ? "g" : "gi");
      } else {
        const escaped = searchText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const pattern = this.state.options.wholeWord
          ? `(?<!\\w)${escaped}(?!\\w)`
          : escaped;
        regex = new RegExp(pattern, this.state.options.matchCase ? "g" : "gi");
      }
    } catch (error) {
      console.warn("replaceAll:regex-error", error);
      return { state: this.getSearchState(), replacedCount: 0 };
    }

    // 在文本字符串上进行替换（从后往前）
    const matches: Array<{ index: number; length: number; match: RegExpExecArray }> = [];
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(fullText)) !== null) {
      matches.push({
        index: match.index,
        length: match[0].length,
        match,
      });
      if (!regex.global) break;
      if (match[0].length === 0) {
        regex.lastIndex += 1;
      }
    }

    if (!matches.length) {
      return { state: this.getSearchState(), replacedCount: 0 };
    }

    this.isReplacing = true;
    try {
      // 从后往前构建新文本
      let newText = fullText;
      for (let i = matches.length - 1; i >= 0; i--) {
        const { index, length, match: matchData } = matches[i];
        let replacementText = replacement;
        
        // 处理正则表达式替换组
        if (this.state.options.useRegex && matchData) {
          replacementText = replacementText.replace(/\$(\d+)/g, (_full, indexStr) => {
            const index = Number(indexStr);
            if (Number.isNaN(index)) return "";
            return matchData[index] ?? "";
          });
        }
        
        // 处理大小写保留
        if (this.state.options.preserveCase && matchData) {
          replacementText = this.adjustCase(matchData[0], replacementText);
        }
        
        // 替换文本（从后往前，所以前面的位置不会受到影响）
        newText = newText.slice(0, index) + replacementText + newText.slice(index + length);
      }

      // 如果文本没有变化，直接返回
      if (newText === fullText) {
        return { state: this.getSearchState(), replacedCount: 0 };
      }

      // 一次性替换整个文本内容
      const instance = this.getInstance();
      if (instance) {
        instance.setValue(newText);
        this.syncAfterMutation();
      }

      // 重新搜索以更新状态
      const state = this.configureSearch(this.state.options);
      return { state, replacedCount: matches.length };
    } finally {
      this.isReplacing = false;
    }
  }

  clearSearch(): void {
    this.clearHighlights();
    this.state = { ...defaultState };
  }

  dispose(): void {
    this.clearSearch();
  }

  focus(): void {
    this.getEditableRoot()?.focus();
  }

  getSelectionText(): string {
    return window.getSelection()?.toString() ?? "";
  }

  getSelectionRange(): TextRange | null {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    const root = this.getEditableRoot();
    if (!root) return null;
    const plain = this.getPlainText(root);
    const startOffset = this.getOffsetFromRange(root, range.startContainer, range.startOffset);
    const endOffset = this.getOffsetFromRange(root, range.endContainer, range.endOffset);
    const start = this.offsetToPosition(plain, startOffset);
    const end = this.offsetToPosition(plain, endOffset);
    return { start, end };
  }

  insertText(text: string, opts?: { replaceSelection?: boolean }): void {
    const instance = this.getInstance();
    if (!instance) return;
    if (opts?.replaceSelection) {
      document.execCommand("insertText", false, text);
      this.syncAfterMutation();
    } else {
      instance.insertValue(text);
    }
  }

  async copy(): Promise<void> {
    const selection = this.getSelectionText();
    if (!selection) return;
    await navigator.clipboard.writeText(selection);
  }

  async cut(): Promise<void> {
    const selection = this.getSelectionText();
    if (!selection) return;
    await navigator.clipboard.writeText(selection);
    document.execCommand("delete");
    this.syncAfterMutation();
  }

  async paste(): Promise<void> {
    const text = await navigator.clipboard.readText();
    if (!text) return;
    document.execCommand("insertText", false, text);
    this.syncAfterMutation();
  }

  selectAll(): void {
    const root = this.getEditableRoot();
    if (!root) return;
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(root);
    selection.removeAllRanges();
    selection.addRange(range);
    root.focus();
  }

  goTo(position: TextPosition): void {
    const root = this.getEditableRoot();
    if (!root) return;
    const plain = this.getPlainText(root);
    const offset = this.positionToOffset(plain, position);
    this.setSelectionByOffset(root, offset, offset);
    root.focus();
  }

  goToRanges(ranges: TextRange[]): void {
    if (!ranges.length) return;
    const root = this.getEditableRoot();
    if (!root) return;
    const plain = this.getPlainText(root);
    const first = ranges[0];
    const start = this.positionToOffset(plain, first.start);
    const end = this.positionToOffset(plain, first.end);
    this.setSelectionByOffset(root, start, end);
    root.focus();
  }

  // ========== 文本获取 ==========
  getFullText(): string {
    const instance = this.getInstance();
    if (!instance) return "";
    return instance.getValue();
  }

  getTextAt(range: TextRange): string {
    const root = this.getEditableRoot();
    if (!root) return "";
    const plain = this.getPlainText(root);
    const start = this.positionToOffset(plain, range.start);
    const end = this.positionToOffset(plain, range.end);
    return plain.slice(start, end);
  }

  getLineText(line: number): string {
    const fullText = this.getFullText();
    const lines = fullText.split("\n");
    const safeLine = Math.max(0, Math.min(lines.length - 1, line - 1));
    return lines[safeLine] ?? "";
  }

  getLines(startLine: number, endLine: number): string[] {
    const fullText = this.getFullText();
    const lines = fullText.split("\n");
    const safeStart = Math.max(0, Math.min(lines.length - 1, startLine - 1));
    const safeEnd = Math.max(safeStart, Math.min(lines.length - 1, endLine - 1));
    return lines.slice(safeStart, safeEnd + 1);
  }

  getLineCount(): number {
    const fullText = this.getFullText();
    return fullText.split("\n").length;
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
    const maxResults = options?.maxResults ?? 5000;

    let regex: RegExp;
    try {
      if (useRegex) {
        regex = new RegExp(text, matchCase ? "g" : "gi");
      } else {
        const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const pattern = wholeWord ? `(?<!\\w)${escaped}(?!\\w)` : escaped;
        regex = new RegExp(pattern, matchCase ? "g" : "gi");
      }
    } catch (error) {
      console.warn("findTextByContent:regex-error", error);
      return [];
    }

    const results: FindResult[] = [];
    const lines = fullText.split("\n");
    let currentOffset = 0;

    for (let lineIndex = 0; lineIndex < lines.length && results.length < maxResults; lineIndex++) {
      const line = lines[lineIndex];
      regex.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = regex.exec(line)) !== null && results.length < maxResults) {
        if (!match) break; // TypeScript 类型保护
        
        const matchText = match[0];
        const startOffset = currentOffset + match.index;
        const endOffset = startOffset + matchText.length;
        const startLine = lineIndex + 1;
        const startColumn = match.index + 1;
        const endColumn = match.index + matchText.length + 1;

        const range: TextRange = {
          start: { line: startLine, column: startColumn },
          end: { line: startLine, column: endColumn },
        };

        // 创建锚点（基于文本内容）
        const anchorId = `anchor-${Date.now()}-${results.length}-${Math.random().toString(36).substr(2, 9)}`;
        const anchor: TextAnchor = {
          id: anchorId,
          type: "text-content",
          data: { range, matchText },
        };

        results.push({
          range,
          matchText,
          groups: useRegex ? [...match] : undefined,
          anchor,
          getCurrentRange: () => {
            // 直接返回当前范围（因为这是基于文本内容的查找，范围是准确的）
            return range;
          },
          replace: (replacement: string) => {
            // 直接使用当前范围进行替换
            this.replaceRange(range, replacement);
          },
          getContext: (contextOptions?: ContextOptions) => {
            return this.getContext(range, contextOptions);
          },
        });
      }

      currentOffset += line.length + 1; // +1 for newline
    }

    return results;
  }

  getContext(range: TextRange, options?: ContextOptions): string {
    const beforeLines = options?.beforeLines ?? 3;
    const afterLines = options?.afterLines ?? 3;
    const beforeChars = options?.beforeChars;
    const afterChars = options?.afterChars;

    const fullText = this.getFullText();
    const lines = fullText.split("\n");

    const startLine = Math.max(0, range.start.line - 1 - beforeLines);
    const endLine = Math.min(lines.length - 1, range.end.line - 1 + afterLines);

    let context = lines.slice(startLine, endLine + 1).join("\n");

    if (beforeChars !== undefined || afterChars !== undefined) {
      const rangeText = this.getTextAt(range);
      const plain = fullText.replace(/\r\n/g, "\n");
      const startOffset = this.positionToOffset(plain, range.start);
      const endOffset = this.positionToOffset(plain, range.end);
      const beforeText = beforeChars
        ? plain.slice(Math.max(0, startOffset - beforeChars), startOffset)
        : "";
      const afterText = afterChars
        ? plain.slice(endOffset, Math.min(plain.length, endOffset + afterChars))
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
    const root = this.getEditableRoot();
    if (!root) return;
    const plain = this.getPlainText(root);
    const start = this.positionToOffset(plain, range.start);
    const end = this.positionToOffset(plain, range.end);
    this.setSelectionByOffset(root, start, end);
    document.execCommand("insertText", false, text);
    this.syncAfterMutation();
  }

  deleteRange(range: TextRange): void {
    this.replaceRange(range, "");
  }

  insertAt(position: TextPosition, text: string): void {
    const root = this.getEditableRoot();
    if (!root) return;
    const plain = this.getPlainText(root);
    const offset = this.positionToOffset(plain, position);
    this.setSelectionByOffset(root, offset, offset);
    document.execCommand("insertText", false, text);
    this.syncAfterMutation();
  }

  applyEdits(edits: Array<{ range: TextRange; text: string }>): void {
    // 从后往前应用编辑，避免位置偏移
    const reversedEdits = [...edits].reverse();
    for (const edit of reversedEdits) {
      this.replaceRange(edit.range, edit.text);
    }
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
      console.warn("applyPendingEdit:error", error);
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

  // ========== 辅助方法 ==========
  private getOffsetFromRange(root: HTMLElement, node: Node, offset: number): number {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let charIndex = 0;
    let currentNode = walker.nextNode() as Text | null;

    while (currentNode) {
      if (currentNode === node) {
        return charIndex + offset;
      }
      charIndex += currentNode.length;
      currentNode = walker.nextNode() as Text | null;
    }

    return charIndex;
  }

  private syncAfterMutation() {
    const instance = this.getInstance();
    if (!instance) return;
    const markdown = instance.getValue();
    this.syncMarkdown(markdown);
  }

  private clearHighlights() {
    this.highlights.forEach(({ element }) => {
      const parent = element.parentNode;
      if (!parent) return;
      const textNode = document.createTextNode(element.textContent ?? "");
      parent.replaceChild(textNode, element);
      parent.normalize();
    });
    this.highlights = [];
  }

  private setActiveHighlight(index: number, opts?: { focus?: boolean }) {
    const shouldFocus = opts?.focus !== false;
    this.highlights.forEach((highlight, idx) => {
      if (idx === index && index >= 0) {
        highlight.element.classList.add(ACTIVE_CLASS);
        if (shouldFocus) {
          const range = document.createRange();
          range.selectNodeContents(highlight.element);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
          highlight.element.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      } else {
        highlight.element.classList.remove(ACTIVE_CLASS);
      }
    });
    if (index < 0 && shouldFocus) {
      window.getSelection()?.removeAllRanges();
    }
  }

  private computeReplacementText(
    highlight: HighlightMatch,
    replacement: string,
  ): string {
    let result = replacement;
    if (this.state.options.useRegex && highlight.groups) {
      result = result.replace(/\$(\d+)/g, (_full, indexStr) => {
        const index = Number(indexStr);
        if (Number.isNaN(index)) return "";
        return highlight.groups?.[index] ?? "";
      });
    }
    if (this.state.options.preserveCase) {
      result = this.adjustCase(highlight.text, result);
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

  private shouldSkipNode(element: Element | null): boolean {
    if (!element) return false;
    if (element.classList.contains("md-editor-search-ignore")) {
      return true;
    }
    const forbiddenSelectors = [
      ".vditor-ir__math",
      ".vditor-ir__preview",
      ".vditor-wysiwyg__block",
      ".vditor-panel",
      ".vditor-copy",
    ];
    return forbiddenSelectors.some((selector) => element.closest(selector));
  }

  private buildRegex(options: SearchOptions): RegExp {
    if (options.useRegex) {
      const flags = options.matchCase ? "g" : "gi";
      return new RegExp(options.text, flags);
    }
    const escaped = options.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = options.wholeWord
      ? `(?<!\\w)${escaped}(?!\\w)`
      : escaped;
    const flags = options.matchCase ? "g" : "gi";
    return new RegExp(pattern, flags);
  }

  private getEditableRoot(): HTMLElement | null {
    const instance = this.getInstance();
    const internal = (instance as any)?.vditor;
    if (!internal) return null;
    const mode = internal.currentMode ?? "ir";
    const element = internal[mode]?.element as HTMLElement | undefined;
    return element ?? null;
  }

  private getRangeFromElement(element: HTMLElement): TextRange {
    const preSelection = document.createRange();
    const root = this.getEditableRoot();
    if (!root) {
      return {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 1 },
      };
    }
    preSelection.selectNodeContents(root);
    preSelection.setEndBefore(element);
    const startOffset = preSelection.toString().length;
    const textContent = element.textContent ?? "";
    const endOffset = startOffset + textContent.length;
    const plain = this.getPlainText(root);
    const start = this.offsetToPosition(plain, startOffset);
    const end = this.offsetToPosition(plain, endOffset);
    return { start, end };
  }

  private getPlainText(root: HTMLElement): string {
    return root.innerText.replace(/\r\n/g, "\n");
  }

  private positionToOffset(text: string, position: TextPosition): number {
    const lines = text.split("\n");
    const lineIndex = Math.max(0, Math.min(position.line - 1, lines.length - 1));
    let offset = 0;
    for (let i = 0; i < lineIndex; i += 1) {
      offset += lines[i].length + 1;
    }
    const column = Math.max(0, position.column - 1);
    return offset + Math.min(column, lines[lineIndex].length);
  }

  private offsetToPosition(text: string, offset: number): TextPosition {
    const lines = text.split("\n");
    let remaining = offset;
    for (let i = 0; i < lines.length; i += 1) {
      const lineLength = lines[i].length + 1;
      if (remaining < lineLength) {
        return { line: i + 1, column: remaining + 1 };
      }
      remaining -= lineLength;
    }
    const lastLine = lines.length;
    return { line: lastLine, column: lines[lastLine - 1].length + 1 };
  }

  private setSelectionByOffset(
    root: HTMLElement,
    start: number,
    end: number,
  ): void {
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let charIndex = 0;
    let foundStart = false;
    let currentNode = walker.nextNode() as Text | null;

    while (currentNode) {
      const nextIndex = charIndex + currentNode.length;
      if (!foundStart && start >= charIndex && start <= nextIndex) {
        range.setStart(currentNode, start - charIndex);
        foundStart = true;
      }
      if (foundStart && end >= charIndex && end <= nextIndex) {
        range.setEnd(currentNode, end - charIndex);
        break;
      }
      charIndex = nextIndex;
      currentNode = walker.nextNode() as Text | null;
    }

    if (!foundStart) {
      range.selectNodeContents(root);
      range.collapse(false);
    }

    selection.removeAllRanges();
    selection.addRange(range);
  }
}

export function createVditorAdapter(
  options: VditorAdapterOptions,
): VditorTextEditorAdapter {
  return new VditorTextEditorAdapter(options);
}

