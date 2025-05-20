import mitt from 'mitt';
import localIpcMain, { mainEmitter } from './local-ipc-main';

// 通用事件类型
type IpcEventMap = {
    [key: string]: any;
};

// mitt 实例
export const rendererEmitter = mitt<IpcEventMap>();


export const localIpcRenderer = (() => {
    function generateCallbackId(channel: string) {
        return `${channel}_cb_${Math.random().toString(36).slice(2)}`;
    }

    const DEFAULT_TIMEOUT = 5000;

    return {
        send: (channel: string, data?: any) => {
            mainEmitter.emit(channel, data);
        },

        on: (channel: string, func: (...args: any[]) => void) => {
            rendererEmitter.on(channel, func);
        },

        once: (channel: string, func: (...args: any[]) => void) => {
            const handler = (...args: any[]) => {
                rendererEmitter.off(channel, handler);
                func(...args);
            };
            rendererEmitter.on(channel, handler);
        },

        removeListener: (channel: string, func: (...args: any[]) => void) => {
            rendererEmitter.off(channel, func);
        },

        removeAllListeners: (channel: string) => {
            rendererEmitter.all.delete(channel);
        },

        /** ✅ invoke 支持 Promise、错误处理、超时 */
        invoke: (channel: string, ...args: any[]) => {
            return new Promise((resolve, reject) => {
                const callbackId = generateCallbackId(channel);

                const timeout = setTimeout(() => {
                    rendererEmitter.off(callbackId, responseHandler);
                    reject(new Error(`invoke timeout: ${channel}`));
                }, DEFAULT_TIMEOUT);

                const responseHandler = (error: any, result: any) => {
                    clearTimeout(timeout);
                    rendererEmitter.off(callbackId, responseHandler);
                    if (error) reject(new Error(error));
                    else resolve(result);
                };

                rendererEmitter.on(callbackId, responseHandler);

                // 转发给主进程的 _invokeHandler
                localIpcMain._invokeHandler(channel, args, callbackId);
            });
        }
    };
})();

export default localIpcRenderer;