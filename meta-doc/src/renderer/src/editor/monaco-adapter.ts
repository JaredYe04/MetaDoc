import * as monaco from "monaco-editor";
import {
  EditorSearchState,
  FindResult,
  ReplaceOutcome,
  SearchDirection,
  SearchOptions,
  TextEditorAdapter,
  TextPosition,
  TextRange,
} from "./text-editor-types";
import { createRendererLogger, RendererLogger } from "../utils/logger";

const WORD_SEPARATORS_FALLBACK =
  "~!@#$%^&*()-=+[{]}\\|;:'\",.<>/?`´\"“”‘’、，。；：《》（）【】";
const MAX_MATCHES = 5000;
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
    const text = editor.getValue();
    logger.debug("configureSearch:text", text);
    const lineStarts = this.computeLineStarts(text);
    const findResults = this.scanTextForMatches(text, normalized, lineStarts);
    logger.debug("configureSearch:findResults", findResults);
    this.state.matches = findResults;
    this.state.currentIndex =
      !revealFirst || !findResults.length ? -1 : 0;
    this.applyDecorations(this.state.matches, this.state.currentIndex);
    if (revealFirst && findResults.length) {
      this.revealMatch(findResults[0]);
    }

    logTrace("configureSearch:done", {
      totalMatches: findResults.length,
      highlighted: Math.min(findResults.length, MAX_HIGHLIGHTED_MATCHES),
      revealFirst,
    });
    return this.getSearchState();
  }

  getSearchState(): EditorSearchState {
    return {
      options: { ...this.state.options },
      matches: this.state.matches.map((match) => ({
        range: { ...match.range },
        matchText: match.matchText,
        groups: match.groups ? [...match.groups] : undefined,
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
    this.applyDecorations(this.state.matches, nextIndex);
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
    this.performReplacement(currentMatch, replacement);
    this.configureSearch(this.state.options);
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
    this.performReplacement(currentMatch, replacement);
    this.configureSearch(this.state.options);
    logTrace("replaceNext:done", { index: afterFind.currentIndex });
    return this.getSearchState();
  }

  replaceAll(replacement: string): ReplaceOutcome {
    if (!this.state.matches.length) {
      logTrace("replaceAll:skip-empty");
      return { state: this.getSearchState(), replacedCount: 0 };
    }

    const editor = this.getEditor();
    if (!editor) {
      logTrace("replaceAll:no-editor");
      return { state: this.getSearchState(), replacedCount: 0 };
    }

    const edits = this.state.matches.map((match) => ({
      range: this.toMonacoRange(match.range),
      text: this.computeReplacementText(match, replacement),
      forceMoveMarkers: true,
    }));

    editor.pushUndoStop();
    editor.executeEdits("search-replace-all", edits);
    editor.pushUndoStop();
    const replacedCount = edits.length;

    this.configureSearch(this.state.options);
    logTrace("replaceAll:done", { replacedCount });
    return { state: this.getSearchState(), replacedCount };
  }

  clearSearch(): void {
    this.clearDecorations();
    this.state = { ...defaultSearchState };
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
    editor.executeEdits("insert-text", [
      {
        range,
        text,
        forceMoveMarkers: true,
      },
    ]);
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

  private performReplacement(match: FindResult, replacement: string) {
    const editor = this.getEditor();
    if (!editor) return;
    const replacementText = this.computeReplacementText(match, replacement);
    const range = this.toMonacoRange(match.range);
    editor.pushUndoStop();
    editor.executeEdits("search-replace", [
      {
        range,
        text: replacementText,
        forceMoveMarkers: true,
      },
    ]);
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
    if (this.state.options.useRegex && match.groups) {
      result = result.replace(/\$(\d+)/g, (_full, indexStr) => {
        const index = Number(indexStr);
        if (Number.isNaN(index)) return "";
        return match.groups?.[index] ?? "";
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

  private applyDecorations(matches: FindResult[], activeIndex: number) {
    const highlightable = matches.slice(0, MAX_HIGHLIGHTED_MATCHES);
    const decorations = highlightable.map((match, index) => {
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
  ): FindResult[] {
    const results: FindResult[] = [];
    if (!text || !options.text) return results;
    const regex = this.buildSearchRegex(options);
    if (!regex) return results;
    const separators = this.getWordSeparators();
    let guard = 0;
    while (results.length < MAX_MATCHES) {
      const match = regex.exec(text);
      if (!match) break;
      const value = match[0];
      const start = match.index;
      const end = start + value.length;
      if (!value.length) {
        regex.lastIndex += 1;
        if (++guard > MAX_MATCHES) break;
        continue;
      }
      if (
        options.wholeWord &&
        !this.isWholeWordBoundary(text, start, end, separators)
      ) {
        continue;
      }
      results.push({
        range: this.offsetsToRange(start, end, lineStarts),
        matchText: value,
        groups: options.useRegex ? [...match] : undefined,
      });
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

