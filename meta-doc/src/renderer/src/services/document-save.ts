import { serializeDocument } from './document-serializer';
import type { WorkspaceDocument } from '../stores/workspace';
import localIpcRenderer from '../utils/web-adapter/local-ipc-renderer';
import { webMainCalls } from '../utils/web-adapter/web-main-calls.js';

type SaveResult = {
  path: string;
  format: string;
} | null;

const resolveIpcRenderer = (): any => {
  if (typeof window !== 'undefined') {
    if (window.electron?.ipcRenderer) {
      return window.electron.ipcRenderer;
    }
    try {
      webMainCalls();
    } catch (error) {
      console.warn('[DocumentSave] 初始化 webMainCalls 失败', error);
    }
    return localIpcRenderer;
  }
  return null;
};

export const saveWorkspaceDocument = async (
  doc: WorkspaceDocument,
  options?: { saveAs?: boolean },
): Promise<SaveResult> => {
  const ipcRenderer: any = resolveIpcRenderer();
  if (!ipcRenderer || typeof ipcRenderer.invoke !== 'function') {
    console.warn('[DocumentSave] ipcRenderer 不可用，跳过保存');
    return null;
  }

  const payload = serializeDocument(doc);
  const result = await ipcRenderer.invoke('workspace-save-document', {
    data: payload,
    saveAs: options?.saveAs ?? doc.path === '',
  });

  if (!result || typeof result !== 'object') {
    return null;
  }

  const { path, format } = result as { path?: string; format?: string };
  if (!path) {
    return null;
  }

  return {
    path,
    format: format ?? doc.format,
  };
};

