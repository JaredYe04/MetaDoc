import path from "path";
import { app } from 'electron';
export function getResourcesPath() {

  let p='';
  if (!app.isPackaged) {
      // 开发环境：Electron 启动目录
    p=path.resolve(__dirname, '../../resources');
  }
  else{
      // 打包环境：app.asar.unpacked/resources
  p=path.join(process.resourcesPath, '/app.asar.unpacked/resources');
  }

  //console.log('Resources path:', p);
  return p;
}

export function getVectorDatabasePath(){
    return path.join(getResourcesPath(), 'vector_database');
}