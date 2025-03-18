
//事件总线

// 使用 Vue 实例作为事件总线

import mitt from 'mitt'
import {
  current_file_path,
  current_outline_tree,
  current_article,
  current_article_meta_data,
  dump2json,
  init,
  sync,
  current_ai_dialogs,
  load_from_json
} from './common-data.js'
import { getSetting, updateRecentDocs } from './settings.js'
import { path } from 'd3'
import { da } from 'element-plus/es/locales.mjs'
import { exportPDF, image2base64, image2local, md2html, md2htmlRaw } from './md-utils.js'
const ipcRenderer = window.electron.ipcRenderer
const eventBus = mitt()

export default eventBus



//监听save事件
eventBus.on('save', async (msg) => {
  //console.log(window.electron)
  if(msg==='auto-save'){
    if(current_file_path.value===''){
      return//如果没有文件路径，不进行自动保存
    }
  }
  sync();
  await ipcRenderer.send('save', { json: dump2json(),path:current_file_path.value ,html:await md2html(current_article.value)})
  eventBus.emit('is-need-save',false)
})

eventBus.on('is-need-save', (msg) => {
  //console.log('is-need-save',msg)
  ipcRenderer.send('is-need-save', msg)
})

eventBus.on('save-and-quit', async () => {
  sync();
  eventBus.emit('is-need-save',false)
  ipcRenderer.send('save-and-quit', { json: dump2json(),path:current_file_path.value ,html:await md2html(current_article.value)})
});

eventBus.on('open-doc', async (path) => {
  await init()
  eventBus.emit('is-need-save',false)
  ipcRenderer.send('open-doc',path)
})

eventBus.on('quit', () => {
  ipcRenderer.send('quit')
})

eventBus.on('save-as', async () => {
  sync();
  eventBus.emit('nav-to', '/article');
  eventBus.emit('is-need-save',false)
  ipcRenderer.send('save-as', { json: dump2json() ,path:'',html:await md2html(current_article.value)}) 
})

eventBus.on('new-doc', async () => {
  await init()
})

eventBus.on('close-doc',async ()=>{
  await init()
})

eventBus.on('export', async (format) => {
  sync();
  //eventBus.emit('nav-to', '/article');
  //如果是pdf则直接导出，否则需要系统调用
  const exportImageMode=await getSetting('exportImageMode')
  let md=current_article.value
  switch(exportImageMode){
    case 'base64':
      md=await image2base64(md)
    break;
    case 'local':
      md=await image2local(md)
    break;

  }
  

  if(format==='pdf'){
    exportPDF(md);
    document.body.style.cursor = 'wait';
    setTimeout(() => {
      document.body.style.cursor = 'auto';
    }, md.length);
  }else{
      let html;
      if(format==='html'){
        html = await md2html(md)
      }
      else{
        html = await md2htmlRaw(md)
      }
      ipcRenderer.send('export', { json: dump2json(md) ,html:html,format:format})
  }
})

eventBus.on('setting',()=>{
  ipcRenderer.send('setting')
})
eventBus.on('ai-chat',()=>{
  ipcRenderer.send('ai-chat')
})
eventBus.on('fomula-recognition',()=>{
  ipcRenderer.send('fomula-recognition')
})





eventBus.on('system-notification',(data)=>{
  //console.log(data)
  ipcRenderer.send('system-notification',data)

})

eventBus.on('theme-changed',()=>{
  ipcRenderer.send('request-sync-theme')
})

eventBus.on('sync-ai-dialogs', (dialogs) => {//只能由AICHAT组件触发
  ipcRenderer.send('sync-ai-dialogs',dialogs)
})
ipcRenderer.on('sync-ai-dialogs', (event,dialogs) => {//只能由主进程发送给主渲染进程
  current_ai_dialogs.value=dialogs
})


eventBus.on('fetch-ai-dialogs',()=>{//(这个事件只会被AICHAT组件触发)
  //console.log('fetch-ai-dialogs')
  ipcRenderer.send('fetch-ai-dialogs')//请求主进程获取对话数据
})
ipcRenderer.on('request-ai-dialogs',(event)=>{//主渲染进程接收到请求，返回对话数据给主进程，再由主进程转发给AICHAT组件
  //console.log('我把对话数据返回给主进程了')
  //console.log(JSON.parse(JSON.stringify(current_ai_dialogs.value)))
  ipcRenderer.send('response-ai-dialogs',JSON.parse(JSON.stringify(current_ai_dialogs.value)))
})
ipcRenderer.on('response-ai-dialogs',(event,dialogs)=>{//主进程发送给AICHAT组件对话数据
  //console.log('我收到了对话数据',dialogs)
  current_ai_dialogs.value=dialogs
  //console.log(dialogs)
  eventBus.emit('ai-dialogs-loaded')
})


ipcRenderer.on('fetch-ai-dialogs',(event,dialogs)=>{
  //todo
})

import { lightTheme, darkTheme, themeState } from './themes.js'

import { ElMessage } from 'element-plus'
import { ElMessageBox } from 'element-plus'

ipcRenderer.on('os-theme-changed', (event) => {
  eventBus.emit('theme-changed')
  eventBus.emit('sync-theme')

})
ipcRenderer.on('close-triggered', () => {
    //询问是否保存，有保存，放弃三个按钮
    ElMessageBox.confirm(
      '是否要保存当前文档？',
      '提示',
      {
        confirmButtonText: '保存',
        cancelButtonText: '放弃',
        showCancelButton: true,
        distinguishCancelAndClose: true,
        type: 'info',
      }
    )
      .then(() => {
        eventBus.emit('is-need-save',false)
        eventBus.emit('save-and-quit')
      })
      .catch((action) => {
        // eventBus.emit('is-need-save',false)
        // eventBus.emit('quit')
        if(action==='cancel'){
        eventBus.emit('is-need-save',false)
        eventBus.emit('quit')
        }
        else{
          eventBus.emit('is-need-save',true)
        }
      })
})

ipcRenderer.on('sync-theme', (event) => {
  eventBus.emit('sync-theme')//同步主题
})

//监听主进程的事件，转发给事件总线，从而可以在Vue组件中使用
ipcRenderer.on('update-current-path', (event, path) => {
  //console.log('update-current-path', path)
  current_file_path.value = path
})

ipcRenderer.on('save-success', (event, data) => {
  updateRecentDocs(data)
  eventBus.emit('save-success')
})

ipcRenderer.on('save-file-path', (event, path) => {
  eventBus.emit('save-file-path', path)
  current_file_path.value = path
  //路径改变，需要重新保存
})
ipcRenderer.on('export-success', (event, data) => {
  //console.log(data)
  eventBus.emit('export-success', data)
})

ipcRenderer.on('save-triggered',()=>{
  eventBus.emit('save')
})
ipcRenderer.on('save-as-triggered',()=>{
  eventBus.emit('save-as')
})
ipcRenderer.on('search-replace-triggered',()=>{

  eventBus.emit('search-replace')
})

ipcRenderer.on('open-doc-success', (event, data) => {

  load_from_json(data)
  eventBus.emit('refresh')//加载完之后进行刷新
  eventBus.emit('open-doc-success', data)
  //eventBus.emit('refresh')
})

// window.electron.onMessageFromMain((event, message) => {
//     console.log('收到来自主进程的消息:', message);
//   });

// //监听所有事件，给所有事件添加日志
// eventBus.onAny((event, ...args) => {
//     console.log('event:', event, 'args:', args);
// });
