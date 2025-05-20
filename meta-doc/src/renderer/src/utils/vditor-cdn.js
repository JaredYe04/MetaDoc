import { isElectronEnv } from "./event-bus"


// export const getVditorCDN=()=>{
//     if (isElectronEnv){
//         console.log('当前环境是electron环境')
//         // console.log(window)
//         // console.log(window.electron)
//         //console.log(window.electron.ipcRenderer)
//         //return "https://unpkg.com/vditor@latest";
//         return "http://localhost:3000/vditor";
//     }
//     else{
//         console.log('当前环境不是electron环境')
//         //return null;
//         return "https://unpkg.com/vditor@latest";
//     }
// }

export const localVditorCDN= "http://localhost:3000/vditor";
export const vditorCDN="https://unpkg.com/vditor@latest";