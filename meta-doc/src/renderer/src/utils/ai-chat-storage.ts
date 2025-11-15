import type { AIDialog } from '../../../types';

const STORAGE_KEY = 'meta-doc-ai-chat-dialogs';
const DEFAULT_LIMIT = 50;

function isBrowserEnvironment(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function readAiChatDialogs(): AIDialog[] {
  if (!isBrowserEnvironment()) {
    return [];
  }
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return [];
    }
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (error) {
    console.warn('[AIChatStorage] Failed to parse dialogs', error);
  }
  return [];
}

export function writeAiChatDialogs(dialogs: AIDialog[]): void {
  if (!isBrowserEnvironment()) {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(dialogs));
  } catch (error) {
    console.warn('[AIChatStorage] Failed to persist dialogs', error);
  }
}

export function prependAiChatDialog(dialog: AIDialog, limit = DEFAULT_LIMIT): void {
  const dialogs = readAiChatDialogs();
  dialogs.unshift(dialog);
  writeAiChatDialogs(dialogs.slice(0, limit));
}

