import eventBus from './event-bus'
import messageBridge from '../bridge/message-bridge'
import { webMainCalls } from './web-adapter/web-main-calls'
import { getEnv } from './env-utils'

if (typeof window !== 'undefined' && !window.electron?.ipcRenderer) {
  webMainCalls()
}

// 配置 App 信息（从环境变量获取）
let SIMPLETEX_APP_ID = null
let SIMPLETEX_APP_SECRET = null

// 从主进程获取环境变量
async function loadEnvVars() {
  if (SIMPLETEX_APP_ID === null || SIMPLETEX_APP_SECRET === null) {
    SIMPLETEX_APP_ID = await getEnv('SIMPLETEX_APP_ID')
    SIMPLETEX_APP_SECRET = await getEnv('SIMPLETEX_APP_SECRET')

    if (!SIMPLETEX_APP_ID || !SIMPLETEX_APP_SECRET) {
      console.warn('SimpleTex API 配置未找到，请检查 .env 文件')
    }
  }
}

// 生成指定长度的随机字符串
function randomStr(randomLength = 16) {
  const chars = 'AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz0123456789'
  let result = ''
  const len = chars.length
  for (let i = 0; i < randomLength; i++) {
    result += chars.charAt(Math.floor(Math.random() * len))
  }
  return result
}

// MD5 加密方法
async function md5(str) {
  return messageBridge.invoke('compute-md5', str)
}

// 生成请求头及签名数据，逻辑与 Python 版本一致
async function getReqData(reqData, appId, secret) {
  const header = {}
  header['timestamp'] = String(Math.floor(Date.now() / 1000))
  header['random-str'] = randomStr(16)
  header['app-id'] = appId

  let preSignString = ''
  // 合并 reqData 与 header 的所有键，排序后拼接
  const sortedKeys = Object.keys(reqData).concat(Object.keys(header)).sort()
  sortedKeys.forEach((key, index) => {
    if (preSignString) {
      preSignString += '&'
    }
    if (key in header) {
      preSignString += key + '=' + header[key]
    } else {
      preSignString += key + '=' + reqData[key]
    }
  })
  preSignString += '&secret=' + secret
  header['sign'] = await md5(preSignString)
  return { header, reqData }
}

// 示例上传函数，file 为 File 对象
export async function simpletexOcr(base64string) {
  // 加载环境变量
  await loadEnvVars()

  if (!SIMPLETEX_APP_ID || !SIMPLETEX_APP_SECRET) {
    eventBus.emit('show-error', 'SimpleTex API 配置未找到，请检查 .env 文件')
    return 'SimpleTex API 配置未找到'
  }

  // 请求参数数据（非文件型参数），根据需求填入
  let file
  //把图片的base64转换为file
  const dataUrl = base64string
  const arr = dataUrl.split(',')
  const mime = arr[0].match(/:(.*?);/)[1]
  const bstr = atob(arr[1])
  let n = bstr.length
  const u8arr = new Uint8Array(n)
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n)
  }
  file = new File([u8arr], 'ocr.png', { type: mime })

  const data = {}

  // 获取签名和请求头
  const { header, reqData } = await getReqData(data, SIMPLETEX_APP_ID, SIMPLETEX_APP_SECRET)

  // // 使用 FormData 封装文件及其它参数
  // const formData = new FormData();
  // formData.append("file", file);
  const fileBuffer = await file.arrayBuffer()
  // 将 reqData 中的其它参数也加入 FormData
  // 发送到主进程
  // 注意：浏览器环境不支持 Buffer，直接传递 ArrayBuffer，主进程会处理
  // IPC 可以序列化 ArrayBuffer，主进程会使用 Buffer.from() 转换
  let result = await messageBridge.invoke('simpletex-ocr', {
    fileName: file.name, // 传递文件名
    fileType: file.type, // 传递文件类型
    fileBuffer: fileBuffer, // 直接传递 ArrayBuffer，主进程会转换为 Buffer
    reqData,
    header
  })
  console.log(result)
  if (result.err_info) {
    eventBus.emit('show-error', result.err_info.err_msg)
    return result.err_info.err_msg
  }
  if (result.res) {
    return result.res.info
  }
}
