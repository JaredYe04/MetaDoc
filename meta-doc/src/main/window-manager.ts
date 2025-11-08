import { BrowserWindow, shell } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';

import { dispatchLanguageToWindow, t } from './i18n';

type AuxWindowId = 'setting' | 'aiChat' | 'formulaRecognition' | 'aiGraph';

interface WindowDefinition {
  id: AuxWindowId;
  route: string;
  titleKey: string;
  width: number;
  height: number;
  minWidth?: number;
  minHeight?: number;
}

interface WindowState {
  instance: BrowserWindow | null;
  ready: boolean;
  pendingShow: boolean;
}

type ParentProvider = () => BrowserWindow | null;

const windowDefinitions: Record<AuxWindowId, WindowDefinition> = {
  setting: {
    id: 'setting',
    route: '#/setting?windowType=setting',
    titleKey: 'main.windows.settingTitle',
    width: 800,
    height: 600,
    minWidth: 800,
    minHeight: 600
  },
  aiChat: {
    id: 'aiChat',
    route: '#/ai-chat?windowType=ai-chat',
    titleKey: 'main.windows.aiChatTitle',
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 600
  },
  formulaRecognition: {
    id: 'formulaRecognition',
    route: '#/fomula-recognition?windowType=fomula-recognition',
    titleKey: 'main.windows.formulaRecognitionTitle',
    width: 1280,
    height: 550
  },
  aiGraph: {
    id: 'aiGraph',
    route: '#/ai-graph?windowType=ai-graph',
    titleKey: 'main.windows.aiGraphTitle',
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 600
  }
};

const windowStates: Record<AuxWindowId, WindowState> = {
  setting: { instance: null, ready: false, pendingShow: false },
  aiChat: { instance: null, ready: false, pendingShow: false },
  formulaRecognition: { instance: null, ready: false, pendingShow: false },
  aiGraph: { instance: null, ready: false, pendingShow: false }
};

let parentWindowProvider: ParentProvider = () => null;

const resolveWindowUrl = (route: string): string => {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    return `${process.env['ELECTRON_RENDERER_URL']}/index.html${route}`;
  }

  const indexPath = join(__dirname, '../renderer/index.html');
  return `file://${indexPath}${route}`;
};

const setupWindowLifecycle = (id: AuxWindowId, win: BrowserWindow): void => {
  const definition = windowDefinitions[id];
  const state = windowStates[id];

  win.on('ready-to-show', () => {
    state.ready = true;
    if (state.pendingShow) {
      win.show();
      win.focus();
      state.pendingShow = false;
    }
  });

  win.webContents.on('did-finish-load', () => {
    dispatchLanguageToWindow(win);
    setWindowTitle(id);
  });

  win.webContents.on('page-title-updated', (event) => {
    event.preventDefault();
    setWindowTitle(id);
  });

  win.on('close', (event) => {
    if (win.isDestroyed()) return;
    event.preventDefault();
    state.pendingShow = false;
    win.hide();
  });

  win.on('closed', () => {
    windowStates[id] = { instance: null, ready: false, pendingShow: false };
  });

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  win.loadURL(resolveWindowUrl(definition.route));
  setWindowTitle(id);
};

const createAuxWindow = (id: AuxWindowId): BrowserWindow => {
  const definition = windowDefinitions[id];
  const state = windowStates[id];

  const parent = parentWindowProvider();

  const win = new BrowserWindow({
    width: definition.width,
    height: definition.height,
    minWidth: definition.minWidth,
    minHeight: definition.minHeight,
    parent: parent ?? undefined,
    modal: false,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: false,
      nodeIntegration: true
    }
  });

  state.instance = win;
  state.ready = false;
  state.pendingShow = false;

  setupWindowLifecycle(id, win);

  return win;
};

const getWindowState = (id: AuxWindowId): WindowState => windowStates[id];

const ensureWindow = (id: AuxWindowId): BrowserWindow => {
  const state = getWindowState(id);
  if (state.instance && !state.instance.isDestroyed()) {
    return state.instance;
  }
  return createAuxWindow(id);
};

const setWindowTitle = (id: AuxWindowId): void => {
  const state = getWindowState(id);
  const win = state.instance;
  if (!win || win.isDestroyed()) return;

  const definition = windowDefinitions[id];
  win.setTitle(t(definition.titleKey));
};

export const initWindowManager = (parentProvider: ParentProvider): void => {
  parentWindowProvider = parentProvider;
};

export const preloadAuxiliaryWindows = (): void => {
  (Object.keys(windowDefinitions) as AuxWindowId[]).forEach((id) => {
    ensureWindow(id);
  });
};

export const openAuxiliaryWindow = (id: AuxWindowId): void => {
  const state = getWindowState(id);
  const win = ensureWindow(id);

  if (state.ready) {
    win.show();
    win.focus();
  } else {
    state.pendingShow = true;
  }
};

export const refreshAuxiliaryWindowTitles = (): void => {
  (Object.keys(windowDefinitions) as AuxWindowId[]).forEach((id) => {
    setWindowTitle(id);
  });
};

export const dispatchLanguageToAuxWindows = (): void => {
  (Object.keys(windowDefinitions) as AuxWindowId[]).forEach((id) => {
    const state = getWindowState(id);
    if (state.instance && !state.instance.isDestroyed()) {
      dispatchLanguageToWindow(state.instance);
    }
  });
};

