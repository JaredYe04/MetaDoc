import axios from "axios";
import {ElMessage, ElMessageBox} from "element-plus";
import {model} from "./consts.js";



const apiUrl = "http://localhost:11434/api/generate";
export const default_resp='### 你好！我是你的AI文档助手！\n告诉我你的任何需求，我会尝试解决。\n';
export function saveTextAsFile(filename, content) {
  // 创建一个Blob对象，文件内容为`content`
  const blob = new Blob([content], { type: 'text/plain' });

  // 创建一个隐藏的a标签
  const link = document.createElement('a');

  // 为标签添加下载链接，创建一个指向Blob的URL
  link.href = URL.createObjectURL(blob);

  // 设置下载的文件名
  link.download = filename;

  // 触发点击事件，自动下载文件
  document.body.appendChild(link);
  link.click();

  // 清理URL对象和删除a标签
  URL.revokeObjectURL(link.href);
  document.body.removeChild(link);
}

export async function quickGenerate(prompt){
  const payload = {
    model: model,  // 模型类型
    prompt: prompt,
    stream: false
  };
  const res=await axios.post(apiUrl, payload);
  //console.log(res)
  return res.data.response;
}

export const onClickCode=(code,copy)=>{


    if(copy){
        //console.log(code);
        navigator.clipboard.writeText(code.innerText)
        ElMessage({
        message: '已复制代码',
        type: 'success',
        })
    }

    //console.log('trigger')
  //console.log(code.innerText);
  if(code.innerText.startsWith("#!/bin/bash")&&code.dontSave==null){

    ElMessageBox.confirm('是否保存bash脚本?', '提示', {
          confirmButtonText: '保存',
          cancelButtonText: '取消',
          type: 'info'
        }).then(
            async () => {
        saveTextAsFile(
          await quickGenerate('请依据bash脚本内容快速帮我想个最合适的文件名，切记不要有多余的解释和内容，直接输出文件名:' + code.innerText),
          code.innerText
        )

      ElMessage({
        type: 'success',
        message: '保存成功!'
      });
    }).catch(() => {
            code.dontSave=true;
        });

  }

};

export const bindCode=(copy=true)=>{
    const codes = document.getElementsByTagName('code');
    //console.log(codes.length);
    for(let i=0;i<codes.length;i++){
      codes[i].addEventListener('click',() =>  onClickCode(codes[i],copy),true)
    }
};




export async function generateDialogId(timestamp) {
     const encoder = new TextEncoder(); // 创建文本编码器
            const data = encoder.encode(timestamp); // 将字符串编码为 Uint8Array
            const hashBuffer = await crypto.subtle.digest('SHA-256', data); // 计算哈希值
            const hashArray = Array.from(new Uint8Array(hashBuffer)); // 将结果转换为字节数组
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join(''); // 转换为十六进制字符串
            //console.log('新对话id:'+hashHex);
            return hashHex;
}