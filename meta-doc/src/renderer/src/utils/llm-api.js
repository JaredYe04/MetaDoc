import axios from "axios";
import { getSetting } from "../utils/settings.js";
import { ca } from "element-plus/es/locales.mjs";
import eventBus from "./event-bus.js";
import { max } from "d3";
import { getMetaDocLlmConfig, verifyToken } from "./web-utils.ts";
import { queryKnowledgeBase } from "./rag_utils.js";
import { ragQueryReferencePrompt } from "./prompts.js";

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

      const isLoggedIn = verifyToken(token);
      if (!isLoggedIn) {
        eventBus.emit('show-error', '请先登录！')
        eventBus.emit('toggle-user-profile')
        return {};
      }
      config = await getMetaDocLlmConfig(token, modelName);
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
async function answerQuestionNonStream(prompt, ref, meta = { temperature: 0 }, signal = {}, try_rag = false) {
  if (try_rag) {
    prompt = await ragQueryInjection(prompt);
  }
  if (!(await validateApi())) { return }

  const { type, apiUrl, apiKey, selectedModel, completionSuffix = '' } = await getLlmConfig();

  async function handleRequest(url, payload, ref) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify(payload),
        signal, // ✅ 支持中止
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json(); // 一次性读取 JSON

      let text = "";
      if (result.response !== undefined) {
        text = result.response;
      } else if (result.choices && result.choices[0]) {
        text = result.choices[0].text || result.choices[0].message?.content || "";
      }

      const autoRemoveThinkTag = await getSetting('autoRemoveThinkTag');
      if (autoRemoveThinkTag && text.trim().endsWith('</think>')) {
        text = "";
      }
      ref.value = text;

    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('请求已中止');
        throw error; // 重新抛出中止异常，供上层处理
      }
      console.error("非流式请求出错:", error);
    }
  }

  switch (type) {
    case "metadoc":
    case "openai":
      await handleRequest(
        `${apiUrl}${completionSuffix}/completions`,
        {
          model: selectedModel || "text-davinci-003",
          prompt,
          stream: false,
          ...(meta || {}),
        },
        ref
      );
      break;

    case "ollama":
      await handleRequest(
        `${apiUrl}/generate`,
        {
          model: selectedModel,
          prompt,
          stream: false,
          ...(meta || {}),
        },
        ref
      );
      break;

    default:
      throw new Error(`Unsupported LLM type: ${type}`);
  }
}

/**
 * Answer a question (streaming).
 * @param {string} prompt - The prompt to ask.
 * @param {object} ref - A reactive reference to store the result incrementally.
 */
async function validateApi() {
  const enabled = await getSetting('llmEnabled')
  let flag = true;
  if (!enabled) flag = false;
  else {
    const { type, apiUrl, apiKey, selectedModel } = await getLlmConfig();
    if (!apiUrl) flag = false;

  }

  if (!flag) {
    eventBus.emit('show-error', 'LLM API未启用，或配置不正确！')
  }
  return flag;
}

async function answerQuestionStream(prompt, ref, meta = {}, signal = {}, try_rag = false) {
  if (try_rag) {
    prompt = await ragQueryInjection(prompt);
  }
  if (!(await validateApi())) { return }
  const { type, apiUrl, apiKey, selectedModel, completionSuffix = '' } = await getLlmConfig();

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
      //console.log("开始处理流数据...");
      ref.value = ""; // 清空内容

      const autoRemoveThinkTag = await getSetting('autoRemoveThinkTag')

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
          if (signal.aborted) {
            throw new DOMException('Aborted', 'AbortError')
          }
          if (line.trim()) {
            try {
              let json = '';
              if (line.startsWith('data: ')) {
                json = line.replace(/^data: /, ""); // 解析 OpenAI 的 NDJSON 行，去掉前缀
              }
              else json = line; // 直接使用其他类型的 NDJSON 行
              if (json === '[DONE]') continue; // 处理 OpenAI 的结束标志
              const parsed = JSON.parse(json); // 解析 JSON 行
              //ref.value += parsed.response || parsed.choices?.[0]?.text || "";
              let text = "";
              if (parsed.response !== undefined) {
                text = parsed.response;
              } else if (parsed.choices && parsed.choices[0] && parsed.choices[0].text) {
                text = parsed.choices[0].text;
              }
              ref.value += text;

              if (autoRemoveThinkTag) {
                if (ref.value.trim().endsWith('</think>')) {
                  ref.value = '';//清空
                }
              }
              if (ref.value.trim() === '') {
                ref.value = '';//清空
              }
            } catch (err) {
              if (error.name === 'AbortError') {
                throw error; // 重新抛出中止异常
              }
              console.error("JSON 解析错误:", error);
            }
          }
        }
      }
    } catch (error) {
      console.error("请求出错:", error);
      //如果是取消请求的错误，则抛出中止异常
      if (error.name === 'AbortError') {
        throw error; // 重新抛出中止异常
      }
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
 * 统一对话补全接口
 * @param {string} prompt - 用户输入的 prompt
 * @param {Ref<string>} ref - Vue ref，用于存放返回结果
 * @param {Object} meta - 可选参数，如 temperature 等
 * @param {boolean} streaming - 是否使用流式返回
 * @param {Object} signal - 可选的中断信号
 * @param {boolean} try_rag - 是否使用 RAG 注入
 */
async function answerQuestion(prompt, ref, meta = { temperature: 0 }, signal = {}, try_rag = false) {
  if (meta.stream) {
    // 调用流式版本
    await answerQuestionStream(prompt, ref, meta, signal, try_rag);
  } else {
    // 调用非流式版本
    await answerQuestionNonStream(prompt, ref, meta, signal, try_rag);
  }
}

// 公共方法：请求并返回 response
async function requestLlm(conversation, signal, try_rag) {
  if (!(await validateApi())) return null;
  if (try_rag) {
    conversation = await ragQueryInjectionConversation(conversation);
  }

  const { type, apiUrl, apiKey, selectedModel, chatSuffix = '' } = await getLlmConfig();

  return { type, apiUrl, apiKey, selectedModel, chatSuffix, conversation };
}
async function continueConversation(conversation, ref, meta = { temperature: 0 }, signal, try_rag = false) {
  if (meta.stream) {
    // 调用流式版本
    await continueConversationStream(conversation, ref, meta, signal, try_rag);
  } else {
    // 调用非流式版本
    await continueConversationNonStream(conversation, ref, meta, signal, try_rag);
  }
}
// 非流式版本
async function continueConversationNonStream(conversation, ref, meta, signal, try_rag = false) {
  const config = await requestLlm(conversation, signal, try_rag);
  if (!config) return;

  const { type, apiUrl, apiKey, selectedModel, chatSuffix } = config;
  const autoRemoveThinkTag = await getSetting('autoRemoveThinkTag');

  switch (type) {
    case "openai":
    case "metadoc": {
      const payload = {
        model: selectedModel,
        messages: conversation,
        stream: false,
      };

      const response = await fetch(`${apiUrl}${chatSuffix}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal,
      });

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";
      ref.value = autoRemoveThinkTag && content.trim().endsWith('</think>')
        ? ""
        : content;
      break;
    }

    case "ollama": {
      const payload = {
        model: selectedModel,
        messages: conversation,
        stream: false,
      };

      const response = await fetch(`${apiUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal,
      });

      const data = await response.json();
      const content = data.message?.content || "";
      ref.value = autoRemoveThinkTag && content.trim().endsWith('</think>')
        ? ""
        : content;
      break;
    }

    default:
      throw new Error(`Unsupported LLM type: ${type}`);
  }
}

// 流式版本
async function continueConversationStream(conversation, ref, meta, signal = {}, try_rag = false) {
  const config = await requestLlm(conversation, signal, try_rag);
  if (!config) return;

  const { type, apiUrl, apiKey, selectedModel, chatSuffix } = config;
  const autoRemoveThinkTag = await getSetting('autoRemoveThinkTag');

  switch (type) {
    case "openai":
    case "metadoc": {
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
        signal,
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
            let json = line.startsWith('data: ')
              ? line.replace(/^data: /, "")
              : line;
            if (json === '[DONE]') continue;

            if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
            const data = JSON.parse(json);
            const delta = data.choices?.[0]?.delta?.content;
            if (delta) {
              ref.value += delta;
              if (autoRemoveThinkTag && ref.value.trim().endsWith('</think>')) {
                ref.value = '';
              }
            }
          } catch (error) {
            if (error.name === 'AbortError') throw error;
            console.error('JSON 解析错误:', error);
          }
        }
      }
      break;
    }

    case "ollama": {
      const payload = {
        model: selectedModel,
        messages: conversation,
        stream: true,
      };

      const response = await fetch(`${apiUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal,
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
            const content = data.message?.content;
            if (content) {
              ref.value += content;
              if (autoRemoveThinkTag && ref.value.trim().endsWith('</think>')) {
                ref.value = '';
              }
            }
          } catch (error) {
            if (error.name === 'AbortError') throw error;
            console.error('JSON 解析错误:', error);
          }
        }
      }
      break;
    }

    default:
      throw new Error(`Unsupported LLM type: ${type}`);
  }
}

async function ragQueryInjection(originalPrompt) {
  const enabledRag = await getSetting('enableKnowledgeBase')
  if (!enabledRag) {
    return originalPrompt;
  }

  const response = await queryKnowledgeBase(originalPrompt);
  if (response.length === 0) {
    return originalPrompt;
  }
  return originalPrompt + ragQueryReferencePrompt(response);
}

async function ragQueryInjectionConversation(originalConversation) {
  if (typeof originalConversation !== "object" || !Array.isArray(originalConversation)) {
    throw new Error("Invalid conversation format");
  }
  const enabledRag = await getSetting('enableKnowledgeBase')
  if (!enabledRag) {
    return originalConversation;
  }
  const response = await queryKnowledgeBase(originalConversation[originalConversation.length - 2].content);
  if (response.length === 0) {
    return originalConversation;
  }
  //把rag插入到倒数第二个中
  const top = originalConversation[originalConversation.length - 1];
  originalConversation.pop();
  originalConversation.push({
    "role": "user",
    "content": ragQueryReferencePrompt(response)
  });
  originalConversation.push(top);
  //console.log(top)
  return originalConversation;
}

export {
  answerQuestion,
  continueConversation,
};
