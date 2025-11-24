import { getSetting } from "./settings.js";
import { getMetaDocLlmConfig, verifyToken } from "./web-utils.ts";
import { queryKnowledgeBase } from "./rag_utils.js";
import { ragQueryReferencePrompt } from "./prompts";
import {
  handleLlmError,
  validateLlmConfig,
  LlmError,
  LlmErrorType,
} from "./llm-errors.js";
import {
  sendNonStreamRequest,
  sendStreamRequest,
  extractTextFromResponse,
  extractTextDeltaFromChunk,
  processThinkTag,
} from "./llm-http.js";

/**
 * 获取 LLM 配置
 * @returns {Promise<Object>} LLM 配置对象
 */
async function getLlmConfig() {
  const selectedLlm = await getSetting("selectedLlm");
  if (!selectedLlm) {
    throw new LlmError(LlmErrorType.INVALID_CONFIG, "未选择 LLM 类型");
  }

  let config = { type: selectedLlm };

  switch (selectedLlm) {
    case "metadoc": {
      const token = localStorage.getItem("loginToken");
      const modelName = await getSetting("metadocSelectedModel");

      const isLoggedIn = verifyToken(token);
      if (!isLoggedIn) {
        throw new LlmError(
          LlmErrorType.AUTH_ERROR,
          "请先登录 MetaDoc 账户",
          null,
          { showLoginDialog: true }
        );
      }

      const metadocConfig = await getMetaDocLlmConfig(token, modelName);
      config = { ...config, ...metadocConfig };
      break;
    }

    case "openai": {
      config.apiKey = await getSetting("openaiApiKey");
      config.apiUrl = await getSetting("openaiApiUrl");
      config.selectedModel = await getSetting("openaiSelectedModel");
      config.completionSuffix = await getSetting("openaiCompletionSuffix");
      config.chatSuffix = await getSetting("openaiChatSuffix");
      break;
    }

    case "openai-official": {
      config.apiKey = await getSetting("openaiOfficialApiKey");
      config.apiUrl = "https://api.openai.com/v1"; // 固定 URL
      config.selectedModel = await getSetting("openaiOfficialSelectedModel");
      config.completionSuffix = "";
      config.chatSuffix = "";
      break;
    }

    case "deepseek": {
      config.apiKey = await getSetting("deepseekApiKey");
      // DeepSeek 的 completions API 需要使用 beta URL，chat completions 使用标准 URL
      config.apiUrl = "https://api.deepseek.com"; // Chat completions 使用标准 URL
      config.completionApiUrl = "https://api.deepseek.com/beta"; // Completions 使用 beta URL
      config.selectedModel =
        (await getSetting("deepseekSelectedModel")) || "deepseek-chat";
      config.completionSuffix = "";
      config.chatSuffix = "";
      break;
    }

    case "ollama": {
      config.apiUrl = await getSetting("ollamaApiUrl");
      config.selectedModel = await getSetting("ollamaSelectedModel");
      break;
    }

    default:
      throw new LlmError(
        LlmErrorType.INVALID_CONFIG,
        `不支持的 LLM 类型: ${selectedLlm}`
      );
  }

  // 验证配置
  await validateLlmConfig(config);

  return config;
}

/**
 * 验证 API 是否启用和配置正确
 */
async function validateApi() {
  try {
    const enabled = await getSetting("llmEnabled");
    if (!enabled) {
      throw new LlmError(LlmErrorType.NOT_ENABLED, "LLM API 未启用");
    }

    const config = await getLlmConfig();
    if (!config.apiUrl && config.type !== "metadoc") {
      throw new LlmError(
        LlmErrorType.INVALID_CONFIG,
        "API URL 未配置"
      );
    }

    return true;
  } catch (error) {
    handleLlmError(error);
    return false;
  }
}

/**
 * 非流式补全请求
 */
async function answerQuestionNonStream(
  prompt,
  ref,
  meta = { temperature: 0 },
  signal = null,
  try_rag = false
) {
  if (try_rag) {
    prompt = await ragQueryInjection(prompt);
  }

  if (!(await validateApi())) {
    return;
  }

  const config = await getLlmConfig();
  const { type, apiUrl, apiKey, selectedModel, completionSuffix = "", completionApiUrl } = config;

  try {
    let url, payload, responseType;

    // 如果meta中有max_tokens，则使用它（用于自动补全限制）
    const maxTokens = meta.max_tokens;

    switch (type) {
      case "metadoc":
      case "openai":
      case "openai-official": {
        url = `${apiUrl}${completionSuffix}/completions`;
        payload = {
          model: selectedModel || "text-davinci-003",
          prompt,
          stream: false,
          ...(meta || {}),
        };
        // 如果指定了max_tokens，添加到payload中
        if (maxTokens !== undefined && maxTokens > 0) {
          payload.max_tokens = maxTokens;
        }
        responseType = "completion";
        break;
      }

      case "deepseek": {
        // DeepSeek 的 completions API 需要使用 beta URL
        const baseUrl = completionApiUrl || apiUrl;
        url = `${baseUrl}${completionSuffix}/completions`;
        payload = {
          model: selectedModel || "deepseek-chat",
          prompt,
          stream: false,
          ...(meta || {}),
        };
        // 如果指定了max_tokens，添加到payload中
        if (maxTokens !== undefined && maxTokens > 0) {
          payload.max_tokens = maxTokens;
        }
        responseType = "completion";
        break;
      }

      case "ollama": {
        url = `${apiUrl}/generate`;
        payload = {
          model: selectedModel,
          prompt,
          stream: false,
          ...(meta || {}),
        };
        // Ollama使用num_predict参数
        if (maxTokens !== undefined && maxTokens > 0) {
          payload.num_predict = maxTokens;
        }
        responseType = "completion";
        break;
      }

      default:
        throw new LlmError(
          LlmErrorType.INVALID_CONFIG,
          `不支持的 LLM 类型: ${type}`
        );
    }

    const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
    const result = await sendNonStreamRequest(url, payload, headers, signal);
    const text = extractTextFromResponse(result, responseType);
    const processedText = await processThinkTag(text);
    ref.value = processedText;
  } catch (error) {
    const llmError = handleLlmError(error, false);
    throw llmError;
  }
}

/**
 * 流式补全请求
 */
async function answerQuestionStream(
  prompt,
  ref,
  meta = {},
  signal = undefined,
  try_rag = false
) {
  if (try_rag) {
    prompt = await ragQueryInjection(prompt);
  }

  if (!(await validateApi())) {
    return;
  }

  const config = await getLlmConfig();
  const { type, apiUrl, apiKey, selectedModel, completionSuffix = "", completionApiUrl } = config;

  try {
    let url, payload, responseType;

    // 如果meta中有max_tokens，则使用它（用于自动补全限制）
    const maxTokens = meta.max_tokens;

    switch (type) {
      case "metadoc":
      case "openai":
      case "openai-official": {
        url = `${apiUrl}${completionSuffix}/completions`;
        payload = {
          model: selectedModel || "text-davinci-003",
          prompt,
          stream: true,
          ...(meta || {}),
        };
        // 如果指定了max_tokens，添加到payload中
        if (maxTokens !== undefined && maxTokens > 0) {
          payload.max_tokens = maxTokens;
        }
        responseType = "completion";
        break;
      }

      case "deepseek": {
        // DeepSeek 的 completions API 需要使用 beta URL
        const baseUrl = completionApiUrl || apiUrl;
        url = `${baseUrl}${completionSuffix}/completions`;
        payload = {
          model: selectedModel || "deepseek-chat",
          prompt,
          stream: true,
          ...(meta || {}),
        };
        // 如果指定了max_tokens，添加到payload中
        if (maxTokens !== undefined && maxTokens > 0) {
          payload.max_tokens = maxTokens;
        }
        responseType = "completion";
        break;
      }

      case "ollama": {
        url = `${apiUrl}/generate`;
        payload = {
          model: selectedModel,
          prompt,
          stream: true,
          ...(meta || {}),
        };
        // Ollama使用num_predict参数
        if (maxTokens !== undefined && maxTokens > 0) {
          payload.num_predict = maxTokens;
        }
        responseType = "completion";
        break;
      }

      default:
        throw new LlmError(
          LlmErrorType.INVALID_CONFIG,
          `不支持的 LLM 类型: ${type}`
        );
    }

    ref.value = ""; // 清空内容

    const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};

    await sendStreamRequest(
      url,
      payload,
      headers,
      signal,
      async (chunk) => {
        const delta = extractTextDeltaFromChunk(chunk, responseType);
        if (delta) {
          ref.value += delta;
          // 处理思考标签
          const processed = await processThinkTag(ref.value);
          if (processed !== ref.value) {
            ref.value = processed;
          }
        }
      }
    );
  } catch (error) {
    const llmError = handleLlmError(error, false);
    throw llmError;
  }
}

/**
 * 统一补全接口
 */
async function answerQuestion(
  prompt,
  ref,
  meta = { temperature: 0 },
  signal = {},
  try_rag = false
) {
  try {
    if (meta.stream) {
      await answerQuestionStream(prompt, ref, meta, signal, try_rag);
    } else {
      await answerQuestionNonStream(prompt, ref, meta, signal, try_rag);
    }
  } catch (error) {
    // 如果是需要显示登录对话框的错误
    if (error.details?.showLoginDialog) {
      const { default: eventBus } = await import("./event-bus.js");
      eventBus.emit("show-error", error.getUserMessage());
      eventBus.emit("toggle-user-profile");
    }
    throw error;
  }
}

/**
 * 准备对话请求配置
 */
async function requestLlm(conversation, signal, try_rag) {
  if (!(await validateApi())) {
    return null;
  }

  if (try_rag) {
    conversation = await ragQueryInjectionConversation(conversation);
  }

  const config = await getLlmConfig();
  const { type, apiUrl, apiKey, selectedModel, chatSuffix = "" } = config;

  return { type, apiUrl, apiKey, selectedModel, chatSuffix, conversation };
}

/**
 * 非流式对话请求
 */
async function continueConversationNonStream(
  conversation,
  ref,
  meta,
  signal,
  try_rag = false
) {
  const config = await requestLlm(conversation, signal, try_rag);
  if (!config) {
    return;
  }

  const { type, apiUrl, apiKey, selectedModel, chatSuffix } = config;

  try {
    let url, payload;

    switch (type) {
      case "openai":
      case "openai-official":
      case "deepseek":
      case "metadoc": {
        url = `${apiUrl}${chatSuffix}/chat/completions`;
        payload = {
          model: selectedModel,
          messages: conversation,
          stream: false,
          ...(meta || {}),
        };
        break;
      }

      case "ollama": {
        url = `${apiUrl}/chat`;
        payload = {
          model: selectedModel,
          messages: conversation,
          stream: false,
          ...(meta || {}),
        };
        break;
      }

      default:
        throw new LlmError(
          LlmErrorType.INVALID_CONFIG,
          `不支持的 LLM 类型: ${type}`
        );
    }

    const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
    const result = await sendNonStreamRequest(url, payload, headers, signal);
    const content = extractTextFromResponse(result, "chat");
    const processedContent = await processThinkTag(content);
    ref.value = processedContent;
  } catch (error) {
    const llmError = handleLlmError(error, false);
    throw llmError;
  }
}

/**
 * 流式对话请求
 */
async function continueConversationStream(
  conversation,
  ref,
  meta,
  signal = undefined,
  try_rag = false
) {
  const config = await requestLlm(conversation, signal, try_rag);
  if (!config) {
    return;
  }

  const { type, apiUrl, apiKey, selectedModel, chatSuffix } = config;

  try {
    let url, payload;

    switch (type) {
      case "openai":
      case "openai-official":
      case "deepseek":
      case "metadoc": {
        url = `${apiUrl}${chatSuffix}/chat/completions`;
        payload = {
          model: selectedModel,
          messages: conversation,
          stream: true,
          ...(meta || {}),
        };
        break;
      }

      case "ollama": {
        url = `${apiUrl}/chat`;
        payload = {
          model: selectedModel,
          messages: conversation,
          stream: true,
          ...(meta || {}),
        };
        break;
      }

      default:
        throw new LlmError(
          LlmErrorType.INVALID_CONFIG,
          `不支持的 LLM 类型: ${type}`
        );
    }

    ref.value = ""; // 清空内容

    const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};

    await sendStreamRequest(
      url,
      payload,
      headers,
      signal,
      async (chunk) => {
        const delta = extractTextDeltaFromChunk(chunk, "chat");
        if (delta) {
          ref.value += delta;
          // 处理思考标签
          const processed = await processThinkTag(ref.value);
          if (processed !== ref.value) {
            ref.value = processed;
          }
        }
      }
    );
  } catch (error) {
    const llmError = handleLlmError(error, false);
    throw llmError;
  }
}

/**
 * 统一对话接口
 */
async function continueConversation(
  conversation,
  ref,
  meta = { temperature: 0 },
  signal,
  try_rag = false
) {
  try {
    if (meta.stream) {
      await continueConversationStream(conversation, ref, meta, signal, try_rag);
    } else {
      await continueConversationNonStream(
        conversation,
        ref,
        meta,
        signal,
        try_rag
      );
    }
  } catch (error) {
    // 如果是需要显示登录对话框的错误
    if (error.details?.showLoginDialog) {
      const { default: eventBus } = await import("./event-bus.js");
      eventBus.emit("show-error", error.getUserMessage());
      eventBus.emit("toggle-user-profile");
    }
    throw error;
  }
}

/**
 * RAG 查询注入（补全模式）
 */
async function ragQueryInjection(originalPrompt) {
  const enabledRag = await getSetting("enableKnowledgeBase");
  if (!enabledRag) {
    return originalPrompt;
  }

  const response = await queryKnowledgeBase(originalPrompt);
  if (response.length === 0) {
    return originalPrompt;
  }
  return originalPrompt + ragQueryReferencePrompt(response);
}

/**
 * RAG 查询注入（对话模式）
 */
async function ragQueryInjectionConversation(originalConversation) {
  if (
    typeof originalConversation !== "object" ||
    !Array.isArray(originalConversation)
  ) {
    throw new Error("Invalid conversation format");
  }

  const enabledRag = await getSetting("enableKnowledgeBase");
  if (!enabledRag) {
    return originalConversation;
  }

  const response = await queryKnowledgeBase(
    originalConversation[originalConversation.length - 1].content
  );
  if (response.length === 0) {
    return originalConversation;
  }

  // 把 RAG 插入到倒数第二个位置
  const lastMessage = originalConversation[originalConversation.length - 1];
  originalConversation.pop();
  originalConversation.push({
    role: "user",
    content: ragQueryReferencePrompt(response),
  });
  originalConversation.push(lastMessage);

  return originalConversation;
}

export { answerQuestion, continueConversation };
