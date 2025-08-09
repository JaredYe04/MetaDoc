import localIpcRenderer from './web-adapter/local-ipc-renderer.ts'
let ipcRenderer = null
if (window && window.electron) {
  ipcRenderer = window.electron.ipcRenderer

} else {
  webMainCalls();
  ipcRenderer = localIpcRenderer
  //todo 说明当前环境不是electron环境，需要另外适配
}

export async function queryKnowledgeBase(question,k=3){
    const response = await ipcRenderer.invoke('query-knowledge-base', { question, k });
    //console.log(`Knowledge base query response: ${JSON.stringify(response)}`);
    return response;
}