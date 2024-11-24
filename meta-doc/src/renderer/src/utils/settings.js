import eventBus from "./event-bus";

const ipcRenderer = window.electron.ipcRenderer



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