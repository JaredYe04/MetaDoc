import mitt from 'mitt';
import { rendererEmitter } from './local-ipc-renderer';

// 通用事件类型
type IpcEventMap = {
    [key: string]: any;
};

// mitt 实例
export const mainEmitter = mitt<IpcEventMap>();

/** ✅ localIpcMain：模拟 ipcMain */
export const localIpcMain = (() => {
    const handlers = new Map<string, Function>();

    return {
        on: mainEmitter.on,
        off: mainEmitter.off,
        emit: mainEmitter.emit,

        /** ✅ 模拟 ipcMain.handle */
        handle: (channel: string, handler: (...args: any[]) => any | Promise<any>) => {
            handlers.set(channel, handler);
        },

        /** ✅ 被 invoke 调用时触发 */
        async _invokeHandler(channel: string, args: any[], callbackId: string) {
            console.log(channel, args, callbackId);
            const handler = handlers.get(channel);
            if (!handler) {
                rendererEmitter.emit(callbackId, `No handler registered for ${channel}`);
                return;
            }
            try {
                const result = await handler(...args);
                rendererEmitter.emit(callbackId, null, result);
            } catch (err: any) {
                rendererEmitter.emit(callbackId, err.message || String(err));
            }
        }
    };
})();

export default localIpcMain;