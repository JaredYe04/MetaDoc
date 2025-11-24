import { getSetting } from './settings.js';
import { waitForService } from './service-status.ts';
import { webMainCalls } from './web-adapter/web-main-calls.js';
import localIpcRenderer from './web-adapter/local-ipc-renderer.ts'
let ipcRenderer = null
if (window && window.electron) {
  ipcRenderer = window.electron.ipcRenderer

} else {
  webMainCalls();
  ipcRenderer = localIpcRenderer
  //todo 说明当前环境不是electron环境，需要另外适配
}

export async function queryKnowledgeBase(question, scoreThreshold){
    await waitForService('rag');
    // 如果未提供scoreThreshold，从设置中获取
    if (scoreThreshold === undefined) {
        scoreThreshold = await getSetting("knowledgeBaseScoreThreshold");
    }
    const response = await ipcRenderer.invoke('query-knowledge-base', { question, scoreThreshold });
    return response;
}