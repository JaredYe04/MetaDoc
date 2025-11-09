import eventBus, { getWindowType } from './event-bus';
import localIpcRenderer from './web-adapter/local-ipc-renderer.ts';
import { webMainCalls } from './web-adapter/web-main-calls.js';
import { createRendererLogger } from './logger.ts';
const logger = createRendererLogger('ServiceStatus');
type ServiceName = 'express' | 'rag';
type ServiceState = 'idle' | 'loading' | 'ready' | 'error';

interface ServiceStatusInfo {
  state: ServiceState;
  error?: string;
}

type ServiceStatusMap = Record<ServiceName, ServiceStatusInfo>;

interface Waiter {
  resolve: () => void;
  reject: (error: Error) => void;
  timer?: number;
}

const DEFAULT_STATUS: ServiceStatusMap = {
  express: { state: 'idle' },
  rag: { state: 'idle' }
};

const status: ServiceStatusMap = {
  express: { ...DEFAULT_STATUS.express },
  rag: { ...DEFAULT_STATUS.rag }
};

const waiters: Record<ServiceName, Waiter[]> = {
  express: [],
  rag: []
};

let ipcRenderer: typeof window.electron['ipcRenderer'] | typeof localIpcRenderer | null = null;
let initialized = false;

const ensureIpcRenderer = () => {
  if (ipcRenderer) {
    return;
  }

  if (typeof window !== 'undefined' && window.electron?.ipcRenderer) {
    ipcRenderer = window.electron.ipcRenderer;
  } else {
    webMainCalls();
    ipcRenderer = localIpcRenderer;
  }
};

const cloneStatus = (): ServiceStatusMap => ({
  express: { ...status.express },
  rag: { ...status.rag }
});

const notifyWaiters = (service: ServiceName): void => {
  const current = status[service];
  if (current.state === 'ready') {
    waiters[service].splice(0).forEach(waiter => {
      if (waiter.timer) {
        clearTimeout(waiter.timer);
      }
      waiter.resolve();
    });
  } else if (current.state === 'error') {
    const errorMessage = current.error || `Service ${service} failed to start`;
    waiters[service].splice(0).forEach(waiter => {
      if (waiter.timer) {
        clearTimeout(waiter.timer);
      }
      waiter.reject(new Error(errorMessage));
    });
  }
};

const applyStatusSnapshot = (snapshot: Partial<ServiceStatusMap> | null | undefined): void => {
  if (!snapshot) {
    return;
  }

  let changed = false;

  (Object.keys(snapshot) as ServiceName[]).forEach(service => {
    const nextInfo = snapshot[service];
    if (!nextInfo) {
      return;
    }

    const prevInfo = status[service];
    if (prevInfo.state !== nextInfo.state || prevInfo.error !== nextInfo.error) {
      status[service] = {
        state: nextInfo.state,
        error: nextInfo.error
      };
      changed = true;
      notifyWaiters(service);
    }
  });

  if (changed) {
    eventBus.emit('service-status-updated', cloneStatus());
  }
};

export const initServiceStatusWatcher = async (): Promise<void> => {
  if (initialized) {
    return;
  }

  ensureIpcRenderer();

  if (!ipcRenderer || typeof ipcRenderer.invoke !== 'function') {
    initialized = true;
    return;
  }

  try {
    const snapshot = await ipcRenderer.invoke('get-service-status');
    applyStatusSnapshot(snapshot);
  } catch (error) {
    logger.warn('[ServiceStatus] 获取服务状态失败', error);
  }

  if (typeof ipcRenderer.on === 'function') {
    ipcRenderer.on('service-status-updated', (_event:any, snapshot: ServiceStatusMap) => {
      applyStatusSnapshot(snapshot);
    });
  }

  initialized = true;
};

const awaitInitialization = async () => {
  if (!initialized) {
    await initServiceStatusWatcher();
  }
};

const DEFAULT_TIMEOUT = 30000;

export const waitForService = async (service: ServiceName, options?: { timeout?: number }): Promise<void> => {
  await awaitInitialization();

  const current = status[service];
  if (current.state === 'ready') {
    return;
  }

  if (current.state === 'error') {
    throw new Error(current.error || `Service ${service} failed to start`);
  }

  return new Promise<void>((resolve, reject) => {
    const waiter: Waiter = { resolve, reject };

    const timeoutMs = options?.timeout ?? DEFAULT_TIMEOUT;
    if (timeoutMs > 0) {
      waiter.timer = window.setTimeout(() => {
        const index = waiters[service].indexOf(waiter);
        if (index !== -1) {
          waiters[service].splice(index, 1);
        }
        reject(new Error(`Waiting for service ${service} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }

    waiters[service].push(waiter);
  });
};

export const getServiceStatusSnapshot = (): ServiceStatusMap => cloneStatus();

