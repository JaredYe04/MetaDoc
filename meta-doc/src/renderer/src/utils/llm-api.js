import axios from "axios";
import { getSetting } from "../utils/settings.js";
import { ca } from "element-plus/es/locales.mjs";
import eventBus from "./event-bus.js";
import { max } from "d3";
import { getMetaDocLlmConfig, verifyToken } from "./web-utils.ts";

/**
 * Helper to determine the current LLM settings (selected model and API details).
 */
async function getLlmConfig() {
  const selectedLlm = await getSetting("selectedLlm");
  let config = {};
  switch (selectedLlm) {
    case "metadoc":
      //const token = sessionStorage.getItem('loginToken')
      const token = localStorage.getItem('loginToken')
      const modelName = await getSetting('metadocSelectedModel')

      const isLoggedIn=verifyToken(token);
      if(!isLoggedIn){
        eventBus.emit('show-error','请先登录！')
        eventBus.emit('toggle-user-profile')
        return {};
      }
      config=await getMetaDocLlmConfig(token,modelName);
      //console.log(config)
      break;
    case "openai":
      config.apiKey = await getSetting("openaiApiKey");
      config.apiUrl = await getSetting("openaiApiUrl");
      config.selectedModel = await getSetting("openaiSelectedModel");
      config.completionSuffix = await getSetting("openaiCompletionSuffix");
      config.chatSuffix = await getSetting("openaiChatSuffix");
      break;

    case "ollama":
      config.selectedModel = await getSetting("ollamaSelectedModel");
      config.apiUrl = await getSetting("ollamaApiUrl");
      break;
  }
  //console.log({ type: selectedLlm, ...config })
  return { type: selectedLlm, ...config };
}

/**
 * Answer a question (non-streaming).
 * @param {string} prompt - The prompt to ask.
 * @returns {Promise<string>} - The response from the model.
 */
async function answerQuestion(prompt,meta={temperature:0}) {
  const { type, apiUrl, apiKey, selectedModel,completionSuffix='' } = await getLlmConfig();
  const autoRemoveThinkTag=await getSetting('autoRemoveThinkTag')
  switch (type) {
    case "openai":
    case "metadoc":
      return axios
        .post(
          `${apiUrl}${completionSuffix}/completions`,
          {
            model: selectedModel || "gpt-4",
            prompt,
            max_tokens: 500,
            options:{
              ...meta
            }
          },
          {
            headers: { Authorization: `Bearer ${apiKey}` },
          }
        )
        .then((res) => res.data.choices[0].text);

    case "ollama":
      //console.log(`${apiUrl}/generate`)
      //console.log({ model: selectedModel, prompt })
      const result=await axios
      .post(`${apiUrl}/generate`, { model: selectedModel, prompt, stream:false})
      .then((res) => {
        let result=res.data.response;
        //console.log(result)
        if(autoRemoveThinkTag){
          //查找</think>标签，删除标签以及之前的内容
          const index=result.indexOf('</think>');
          if(index>=0){
            result=result.substring(index+8).trim();
          }
        }
        return result;
        
      })
      return result;
    default:
      throw new Error(`Unsupported LLM type: ${type}`);
  }
}

/**
 * Answer a question (streaming).
 * @param {string} prompt - The prompt to ask.
 * @param {object} ref - A reactive reference to store the result incrementally.
 */
async function validateApi(){
  const enabled=await getSetting('llmEnabled')
  let flag=true;
  if(!enabled)flag=false;
  else{
    const { type, apiUrl, apiKey, selectedModel } = await getLlmConfig();
    if(!apiUrl)flag=false;
    
  }

  if(!flag){
    eventBus.emit('show-error','LLM API未启用，或配置不正确！')
  }
  return flag;
}

async function answerQuestionStream(prompt, ref,meta={temperature:0}) {
  if(!(await validateApi())){return}
  
  const { type, apiUrl, apiKey, selectedModel,completionSuffix='' } = await getLlmConfig();

  async function handleStreamingRequest(url, payload, ref) {
    //console.log(payload)
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}), // 如果需要 API 密钥
        },
        body: JSON.stringify(payload),
      });
     
      const reader = response.body.getReader(); // 获取流
      const decoder = new TextDecoder("utf-8"); // 解码器
      let ndjson = ""; // 用于拼接未完成的 NDJSON 行
      ref.value = ""; // 清空内容

      const autoRemoveThinkTag=await getSetting('autoRemoveThinkTag')

      while (true) {
        const { done, value } = await reader.read(); // 从流中读取数据
        if (done) {
          break;
        }

        // 解码当前块数据
        ndjson += decoder.decode(value, { stream: true });

        // 按行解析 NDJSON 格式
        let lines = ndjson.split("\n"); // 按换行符分割
        ndjson = lines.pop(); // 保留未完成的行供下次解析

        for (const line of lines) {
          if (line.trim()) {
            try {
              let json='';
              if(line.startsWith('data: ')) {
                json = line.replace(/^data: /, ""); // 解析 OpenAI 的 NDJSON 行，去掉前缀
              }
              else json = line; // 直接使用其他类型的 NDJSON 行
              const parsed = JSON.parse(json); // 解析 JSON 行
              ref.value += parsed.response || parsed.choices?.[0]?.text || ""; // 更新响应值
              if(autoRemoveThinkTag){
                if(ref.value.trim().endsWith('</think>')){
                  ref.value='';//清空
                }
              }
              if(ref.value.trim()===''){
                ref.value='';//清空
              }
            } catch (err) {
              console.error("JSON 解析错误:", err);
            }
          }
        }
      }
    } catch (error) {
      console.error("请求出错:", error);
    }
  }
  //console.log(completionSuffix)
  switch (type) {
    case "metadoc":
    case "openai":
      await handleStreamingRequest(
        `${apiUrl}${completionSuffix}/completions`,
        {
          model: selectedModel || "text-davinci-003", // 默认模型
          prompt,
          stream: true,
        },
        ref
      );
      break;

    case "ollama":
      await handleStreamingRequest(
        `${apiUrl}/generate`,
        {
          model: selectedModel,
          prompt,
          stream: true,
        },
        ref
      );
      break;
    default:
      throw new Error(`Unsupported LLM type: ${type}`);
  }
}



/**
 * Continue a conversation (non-streaming).
 * @param {object[]} conversation - The conversation history.
 * @returns {Promise<string>} - The response from the model.
 */
async function continueConversation(conversation) {
  const { type, apiUrl, apiKey, selectedModel,chatSuffix='' } = await getLlmConfig();

  switch (type) {
    case "openai":
    case "metadoc":
      return axios
        .post(
          `${apiUrl}${chatSuffix}/chat/completions`,
          {
            model: selectedModel || "gpt-4",
            messages: conversation,
            max_tokens: 1024,
            temperature: 0.7,
          },
          {
            headers: { Authorization: `Bearer ${apiKey}` },
          }
        )
        .then((res) => res.data.choices[0].message.content);

    case "ollama":
      const userMessages = conversation
        .filter((msg) => msg.role === "user")
        .map((msg) => msg.content)
        .join("\n");
      return axios
        .post(`${apiUrl}/generate`, { model: selectedModel, prompt: userMessages })
        .then((res) => res.data.response);

    default:
      throw new Error(`Unsupported LLM type: ${type}`);
  }
}

/**
 * Continue a conversation (streaming).
 * @param {object[]} conversation - The conversation history.
 * @param {object} ref - A reactive reference to store the result incrementally.
 */
async function continueConversationStream(conversation, ref) {
  if (!(await validateApi())) {
    return;
  }
  
  const { type, apiUrl, apiKey, selectedModel,chatSuffix='' } = await getLlmConfig();
  //console.log({ type, apiUrl, apiKey, selectedModel });
  
  const autoRemoveThinkTag = await getSetting('autoRemoveThinkTag');

  switch (type) {
    case "openai":
    case "metadoc":
      {
      const payload = {
        model: selectedModel,
        messages: conversation,
        stream: true,
      };
      
      const response = await fetch(`${apiUrl}${chatSuffix}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        
        for (const line of lines) {
          let json='';
          if (!line.trim()) continue;
          try {
            if(line.startsWith('data: ')) {
              json = line.replace(/^data: /, ""); // 解析 OpenAI 的 NDJSON 行，去掉前缀
            }
            else json = line; // 直接使用其他类型的 NDJSON 行
            const data = JSON.parse(json);
            if (data.choices && data.choices[0]) {
              ref.value += data.choices[0].delta?.content || "";
              if (autoRemoveThinkTag && ref.value.trim().endsWith('</think>')) {
                ref.value = '';
              }
            }
            
          } catch (err) {
            console.error('JSON 解析错误:', err);
          }
        }
      }
      break;
    }
    
    case "ollama": {
      const payload = {
        model: selectedModel,
        messages: conversation,
      };
      
      const response = await fetch(`${apiUrl}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.message?.content) {
              ref.value += data.message.content;
              if (autoRemoveThinkTag && ref.value.trim().endsWith('</think>')) {
                ref.value = '';
              }
            }
          } catch (err) {
            console.error('JSON 解析错误:', err);
          }
        }
      }
      break;
    }
    
    default:
      throw new Error(`Unsupported LLM type: ${type}`);
  }
}


export {
  answerQuestion,
  answerQuestionStream,
  continueConversation,
  continueConversationStream,
};
