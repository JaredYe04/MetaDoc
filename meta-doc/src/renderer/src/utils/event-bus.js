//事件总线


// 使用 Vue 实例作为事件总线

import mitt from 'mitt';
import './common-data.js';
import { current_file_path, current_outline_tree, current_article, current_article_meta_data , dump2json, init} from './common-data.js';
const ipcRenderer =  window.electron.ipcRenderer
const eventBus = mitt();

export default eventBus;

//监听save事件
eventBus.on('save',()=>{
    //console.log(window.electron)
    ipcRenderer.send('save',{json:dump2json()});
});

eventBus.on('quit',()=>{
    ipcRenderer.send('quit');
});

eventBus.on('save-as',()=>{

    ipcRenderer.send('save-as',{json:dump2json()});
});

eventBus.on('new-doc',()=>{
    init();
});


//监听主进程的事件
ipcRenderer.on('save-success',(event,data)=>{
    eventBus.emit('save-success',data);
});

ipcRenderer.on('save-file-path',(event,path)=>{ 
    eventBus.emit('save-file-path',path);
    current_file_path.value=path;
    //路径改变，需要重新保存
});

// window.electron.onMessageFromMain((event, message) => {
//     console.log('收到来自主进程的消息:', message);
//   });



// //监听所有事件，给所有事件添加日志
// eventBus.onAny((event, ...args) => {
//     console.log('event:', event, 'args:', args);
// });