/**
 * 环境变量工具函数
 * 封装从主进程获取环境变量的逻辑
 */

import localIpcRenderer from './web-adapter/local-ipc-renderer';

let ipcRenderer: any = null;

// 初始化 ipcRenderer
if (typeof window !== 'undefined' && (window as any).electron) {
  ipcRenderer = (window as any).electron.ipcRenderer;
} else {
  ipcRenderer = localIpcRenderer;
}

/**
 * 获取环境变量
 * @param key 环境变量键名
 * @returns 环境变量值，如果不存在则返回 undefined
 */
export async function getEnv(key: string): Promise<string | undefined> {
  try {
    return await ipcRenderer.invoke('get-env', key);
  } catch (error) {
    console.error(`Error getting env for key "${key}":`, error);
    return undefined;
  }
}

/**
 * 获取多个环境变量
 * @param keys 环境变量键名数组
 * @returns 环境变量键值对对象
 */
export async function getEnvs(keys: string[]): Promise<Record<string, string | undefined>> {
  const result: Record<string, string | undefined> = {};
  await Promise.all(
    keys.map(async (key) => {
      result[key] = await getEnv(key);
    })
  );
  return result;
}

