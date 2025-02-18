import axios from "axios";
import { getSetting } from "../utils/settings.js";
import { ca } from "element-plus/es/locales.mjs";
import eventBus from "./event-bus.js";

/**
 * Helper to determine the current LLM settings (selected model and API details).
 */
async function getLlmConfig() {
  const selectedLlm = await getSetting("selectedLlm");
  const config = {};
  switch (selectedLlm) {
    case "openai":
      config.apiKey = await getSetting("openaiApiKey");
      config.apiUrl = await getSetting("openaiApiUrl");
      break;

    case "ollama":
      config.selectedModel = await getSetting("ollamaSelectedModel");
      config.apiUrl = await getSetting("ollamaApiUrl");
      break;

    case "claude":
      config.apiKey = await getSetting("claudeApiKey");
      config.apiUrl = await getSetting("claudeApiUrl");
      break;

    //文心一言，通义千问
    case "wenxin":
      config.apiUrl = await getSetting("wenxinApiUrl");
      config.apiKey = await getSetting("wenxinApiKey");
      break;

    case "tongyi":
      config.apiUrl = await getSetting("tongyiApiUrl");
      config.apiKey = await getSetting("tongyiApiKey");
      break;

    //gemini
    case "gemini":
      config.apiUrl = await getSetting("geminiApiUrl");
      config.apiKey = await getSetting("geminiApiKey");
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
  const { type, apiUrl, apiKey, selectedModel } = await getLlmConfig();

  switch (type) {
    case "openai":
      return axios
        .post(
          `${apiUrl}/completions`,
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
      .then((res) => res.data.response);
      //console.log(result)
      return result;

    case "claude":
      return axios
        .post(
          `${apiUrl}/chat`,
          {
            model: selectedModel || "claude-2",
            messages: [{ role: "user", content: prompt }],
          },
          {
            headers: { Authorization: `Bearer ${apiKey}` },
          }
        )
        .then((res) => res.data.completion);

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
  const { type, apiUrl, apiKey, selectedModel } = await getLlmConfig();

  async function handleStreamingRequest(url, payload, ref) {
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
              const parsed = JSON.parse(line); // 解析 JSON 行
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

  switch (type) {
    case "openai":
      await handleStreamingRequest(
        `${apiUrl}/completions`,
        {
          model: selectedModel || "text-davinci-003", // 默认模型
          prompt,
          stream: true,
          max_tokens: 1024, // 根据需求设置参数
          temperature: meta.temperature,
          options:{
            ...meta
          }
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

    case "wenxin":
      await handleStreamingRequest(
        `${apiUrl}/generate`,
        {
          model: selectedModel || "ERNIE-Bot", // 默认模型
          prompt,
          stream: true,
        },
        ref
      );
      break;

    case "tongyi":
      await handleStreamingRequest(
        `${apiUrl}/v1/generate`,
        {
          model: selectedModel || "tongyi-gpt", // 默认模型
          prompt,
          stream: true,
        },
        ref
      );
      break;

    case "gemini":
      await handleStreamingRequest(
        `${apiUrl}/v1/chat/completions`,
        {
          model: selectedModel || "gemini-1", // 默认模型
          prompt,
          stream: true,
        },
        ref
      );
      break;

    case "claude":
      await handleStreamingRequest(
        `${apiUrl}/v1/complete`,
        {
          model: selectedModel || "claude-2", // 默认模型
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
  const { type, apiUrl, apiKey, selectedModel } = await getLlmConfig();

  switch (type) {
    case "openai":
      return axios
        .post(
          `${apiUrl}/chat/completions`,
          {
            model: selectedModel || "gpt-4",
            messages: conversation,
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

    case "claude":
      return axios
        .post(
          `${apiUrl}/chat`,
          {
            model: selectedModel || "claude-2",
            messages: conversation,
          },
          {
            headers: { Authorization: `Bearer ${apiKey}` },
          }
        )
        .then((res) => res.data.completion);

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
  const { type, apiUrl, apiKey, selectedModel } = await getLlmConfig();

  switch (type) {
    case "openai":
      const source = new EventSource(`${apiUrl}/chat/completions?stream=true`);
      source.addEventListener("message", (event) => {
        const data = JSON.parse(event.data);
        if (data.choices && data.choices[0]) {
          ref.value += data.choices[0].delta?.content || "";
        }
      });
      source.addEventListener("error", () => source.close());
      break;

    case "ollama":
      const conversationPrompt = conversation
        .map((msg) => `${msg.role}: ${msg.content}`)
        .join("\n");
      const res = await axios.post(`${apiUrl}/stream`, {
        model: selectedModel,
        prompt: conversationPrompt,
      });
      ref.value = "";
      res.data.on("data", (chunk) => {
        ref.value += chunk.toString();
      });
      break;

    case "claude":
      // Replace with Claude's streaming endpoint if available.
      throw new Error("Streaming is not supported for Claude yet.");
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
