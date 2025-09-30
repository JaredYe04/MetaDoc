import { getSetting } from './settings.js';
import localIpcRenderer from './web-adapter/local-ipc-renderer.ts'
let ipcRenderer = null
if (window && window.electron) {
  ipcRenderer = window.electron.ipcRenderer

} else {
  webMainCalls();
  ipcRenderer = localIpcRenderer
  //todo 说明当前环境不是electron环境，需要另外适配
}

export async function queryKnowledgeBase(question,){

    const scoreThreshold=await getSetting("knowledgeBaseScoreThreshold");
    const response = await ipcRenderer.invoke('query-knowledge-base', { question, scoreThreshold });
    return response;
}