import eventBus from "./event-bus";
import localIpcRenderer from "./web-adapter/local-ipc-renderer";
import { webMainCalls } from "./web-adapter/web-main-calls";

let ipcRenderer = null
if (window && window.electron) {
  ipcRenderer = window.electron.ipcRenderer
} else {
  webMainCalls();
  ipcRenderer=localIpcRenderer
  //todo 说明当前环境不是electron环境，需要另外适配
}


export async function getSetting(key){
    const result=await ipcRenderer.invoke('get-setting', { key: key });
    return result;
}

export async function setSetting(key,value){
    ipcRenderer.invoke('set-setting', { key: key, value: value });
}

export async function updateRecentDocs(filePath){
    ipcRenderer.invoke('update-recent-docs',{path:filePath});
}

export async function getRecentDocs(){
    return await ipcRenderer.invoke('get-recent-docs');
} 

export async function getImagePath(){
    return await ipcRenderer.invoke('get-image-path');
}