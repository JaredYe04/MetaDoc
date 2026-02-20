import { isElectronEnv } from './event-bus'

// export const getVditorCDN=()=>{
//     if (isElectronEnv){
//         console.log('当前环境是electron环境')
//         // console.log(window)
//         // console.log(window.electron)
//         //console.log(window.electron.ipcRenderer)
//         //return "https://unpkg.com/vditor@latest";
//         return "http://localhost:52521/vditor";
//     }
//     else{
//         console.log('当前环境不是electron环境')
//         //return null;
//         return "https://unpkg.com/vditor@latest";
//     }
// }

import { getRuntimeServerBaseUrlSync } from '../config/runtime-server'
export const getLocalVditorCDN = () => getRuntimeServerBaseUrlSync() + '/vditor'
/** @deprecated 使用 getLocalVditorCDN() 以支持可配置的运行时服务器 */
export const localVditorCDN = () => getLocalVditorCDN()
export const vditorCDN = 'https://unpkg.com/vditor@latest'
