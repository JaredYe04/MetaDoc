import type Vditor from "vditor";
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

  constructor(options: VditorAdapterOptions) {
    this.getInstance = options.getInstance;
    this.syncMarkdown = options.syncMarkdown;
  }

  configureSearch(
    options: SearchOptions,
    behavior?: { revealFirst?: boolean },
  ): EditorSearchState {
    const revealFirst = behavior?.revealFirst !== false;
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

    let currentNode = walker.nextNode() as Text | null;
    while (currentNode) {
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
    }

    this.highlights = highlights;
    this.state.matches = highlights.map((item) => ({
      range: item.range,
      matchText: item.text,
      groups: item.groups,
    }));
    this.state.currentIndex =
      !revealFirst || !highlights.length ? -1 : 0;
    this.setActiveHighlight(this.state.currentIndex, {
      focus: revealFirst,
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
    highlight.element.textContent = value;
    this.syncAfterMutation();
    return this.configureSearch(this.state.options);
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
    highlight.element.textContent = value;
    this.syncAfterMutation();
    const nextState = this.configureSearch(this.state.options);
    if (nextState.matches.length) {
      this.find("next");
    }
    return this.getSearchState();
  }

  replaceAll(replacement: string): ReplaceOutcome {
    if (!this.highlights.length) {
      return { state: this.getSearchState(), replacedCount: 0 };
    }
    const count = this.highlights.length;
    this.highlights.forEach((highlight) => {
      highlight.element.textContent = this.computeReplacementText(
        highlight,
        replacement,
      );
    });
    this.syncAfterMutation();
    const state = this.configureSearch(this.state.options);
    return { state, replacedCount: count };
  }

  clearSearch(): void {
    this.clearHighlights();
    this.state = { ...defaultState };
  }

  focus(): void {
    this.getEditableRoot()?.focus();
  }

  getSelectionText(): string {
    return window.getSelection()?.toString() ?? "";
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

