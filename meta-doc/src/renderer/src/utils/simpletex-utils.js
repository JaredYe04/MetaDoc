import eventBus from "./event-bus";

const ipcRenderer = window.electron.ipcRenderer

// 配置 App 信息
const SIMPLETEX_APP_ID = "c0eEgzdZWYa6as0cP5QEVOGC";
const SIMPLETEX_APP_SECRET = "PxTHam5bqc9sZ1RhSd0Au0NfPNlEoOQQ";

// 生成指定长度的随机字符串
function randomStr(randomLength = 16) {
  const chars = 'AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz0123456789';
  let result = '';
  const len = chars.length;
  for (let i = 0; i < randomLength; i++) {
    result += chars.charAt(Math.floor(Math.random() * len));
  }
  return result;
}

// MD5 加密方法
async function md5(str) {
  return ipcRenderer.invoke('compute-md5', str)
}

// 生成请求头及签名数据，逻辑与 Python 版本一致
async function getReqData(reqData, appId, secret) {
  const header = {};
  header["timestamp"] = String(Math.floor(Date.now() / 1000));
  header["random-str"] = randomStr(16);
  header["app-id"] = appId;

  let preSignString = "";
  // 合并 reqData 与 header 的所有键，排序后拼接
  const sortedKeys = Object.keys(reqData).concat(Object.keys(header)).sort();
  sortedKeys.forEach((key, index) => {
    if (preSignString) {
      preSignString += "&";
    }
    if (key in header) {
      preSignString += key + "=" + header[key];
    } else {
      preSignString += key + "=" + reqData[key];
    }
  });
  preSignString += "&secret=" + secret;
  header["sign"] = await md5(preSignString);
  return { header, reqData };
}

// 示例上传函数，file 为 File 对象
export async function simpletexOcr(base64string) {
  // 请求参数数据（非文件型参数），根据需求填入
  let file;
  //把图片的base64转换为file
  const dataUrl = base64string;
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  file = new File([u8arr], 'ocr.png', { type: mime });



  const data = {};

  // 获取签名和请求头
  const { header, reqData } = await getReqData(data, SIMPLETEX_APP_ID, SIMPLETEX_APP_SECRET);

  // // 使用 FormData 封装文件及其它参数
  // const formData = new FormData();
  // formData.append("file", file);
  const fileBuffer = await file.arrayBuffer();
  // 将 reqData 中的其它参数也加入 FormData
  // 发送到主进程
  let result=await ipcRenderer.invoke('simpletex-ocr', {
    fileName: file.name, // 传递文件名
    fileType: file.type, // 传递文件类型
    fileBuffer: Buffer.from(fileBuffer), // 传递 Buffer
    reqData,
    header
  });
  console.log(result)
  if(result.err_info){
    eventBus.emit('show-error',result.err_info.err_msg)
    return result.err_info.err_msg
  }
  if(result.res){
    return result.res.info
  }
}

