export interface TextPosition {
  line: number;
  column: number;
}

export interface TextRange {
  start: TextPosition;
  end: TextPosition;
}

export interface SearchOptions {
  text: string;
  matchCase?: boolean;
  wholeWord?: boolean;
  useRegex?: boolean;
  preserveCase?: boolean;
}

export interface FindResult {
  range: TextRange;
  matchText: string;
  groups?: string[];
}

export interface EditorSearchState {
  options: SearchOptions;
  matches: FindResult[];
  currentIndex: number;
}

export type SearchDirection = "next" | "previous";

export interface ReplaceOutcome {
  state: EditorSearchState;
  replacedCount: number;
}

export interface ConfigureSearchBehavior {
  revealFirst?: boolean;
}

export interface TextEditorAdapter {
  readonly kind: string;
  configureSearch(
    options: SearchOptions,
    behavior?: ConfigureSearchBehavior,
  ): EditorSearchState;
  getSearchState(): EditorSearchState;
  find(direction: SearchDirection): EditorSearchState;
  replaceCurrent(replacement: string): EditorSearchState;
  replaceNext(replacement: string): EditorSearchState;
  replaceAll(replacement: string): ReplaceOutcome;
  clearSearch(): void;

  focus(): void;
  getSelectionText(): string;
  insertText(text: string, opts?: { replaceSelection?: boolean }): void;

  copy(): Promise<void>;
  cut(): Promise<void>;
  paste(): Promise<void>;

  goTo(position: TextPosition): void;
  goToRanges(ranges: TextRange[]): void;
}

