//所有主进程的事件处理函数

const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
import { mainWindow } from "./index";
export function mainCalls() {
    ipcMain.on('quit',quit);
    ipcMain.on('save', async (event, data) => {
        await save(data,false);
    });
    ipcMain.on('save-as',async (event,data)=>{
        await save(data,true);
    });
};

const quit = () => {
    app.quit()
}

const save=async (data,saveAs)=>{
    //console.log(data);
    let json=data.json;
    const obj=JSON.parse(json);
    if(obj.current_file_path==="" || saveAs){
        //console.log("文件路径为空");
        obj.current_file_path=await chooseSaveFile();
        //console.log(obj.current_file_path);
    }
    json=JSON.stringify(obj);
    if(obj.current_file_path){
        fs.writeFileSync(obj.current_file_path,json);
        //console.log("保存成功");
        mainWindow.webContents.send('save-success',obj.current_file_path);
    }
}


const chooseSaveFile = async () => {
    //console.log(win)
    const dateyyyyMMddhhmmss = new Date().toISOString().replace(/:/g, '-').replace('T', '_').split('.')[0];
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '保存文件',
      defaultPath: dateyyyyMMddhhmmss+ '保存的文件.json',
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
  
    //console.log(result); // 可以检查返回的 result 对象
    if (!result.canceled && result.filePath) {
      // 文件保存成功，发送文件路径给渲染进程
      mainWindow.webContents.send('save-file-path', result.filePath);
      //console.log(mainWindow.webContents);
      return result.filePath;
    }
  };