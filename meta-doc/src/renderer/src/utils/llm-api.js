import { getSetting } from "./settings.js";
import { getMetaDocLlmConfig, verifyToken } from "./web-utils.ts";
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
  extractUsageFromResponse,
} from "./llm-http.js";
import { recordLlmRequest } from "./llm-statistics-service.js";
import { createRendererLogger } from "./logger.ts";
import OpenAI from "openai";

/**
 * 获取自定义LLM配置对象
 * @param {Object} customConfig - 自定义LLM配置
 * @returns {Object} LLM配置对象
 */
function getCustomLlmConfigObject(customConfig) {
  if (!customConfig || !customConfig.baseUrl || !customConfig.model) {
    throw new LlmError(LlmErrorType.INVALID_CONFIG, "自定义LLM配置无效：缺少baseUrl或model");
  }

  const type = customConfig.type || 'openai-compatible';
  
  return {
    type: type,
    apiUrl: customConfig.baseUrl,
    apiKey: customConfig.apiKey,
    selectedModel: customConfig.model,
    completionSuffix: customConfig.completionSuffix || '',
    chatSuffix: customConfig.chatSuffix || '/chat/completions',
    completionApiUrl: type === 'deepseek' ? `${customConfig.baseUrl}/beta` : undefined,
    // 保留原始配置以便后续使用
    _customConfig: customConfig
  };
}

/**
 * 获取 LLM 配置
 * @param {Object} customConfig - 可选的自定义LLM配置（如果提供则使用此配置）
 * @returns {Promise<Object>} LLM 配置对象
 */
async function getLlmConfig(customConfig = null) {
  // 如果提供了自定义配置，优先使用
  if (customConfig) {
    return getCustomLlmConfigObject(customConfig);
  }
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

    case "manual": {
      // 手动API类型：使用Express服务器的模拟接口
      config.apiUrl = "http://localhost:52521/api/llm";
      config.selectedModel = "manual-model";
      config.apiKey = ""; // manual类型不需要apiKey
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

  // 获取全局温度配置（如果meta中没有指定）
  const globalTemperature = await getSetting("llmTemperature");
  if (globalTemperature !== undefined && !config.temperature) {
    config.temperature = globalTemperature;
  }

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
    if (!config.apiUrl && config.type !== "metadoc" && config.type !== "manual") {
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
 * 最终验证和转换消息格式，确保所有content都是字符串
 * 这是发送到API之前的最后一道防线
 */
function finalizeMessagesForAPI(messages, logger) {
  if (!Array.isArray(messages)) {
    return messages;
  }
  
  return messages.map((msg, index) => {
    if (!msg || typeof msg !== 'object') {
      return msg;
    }
    
    const result = {
      role: msg.role
    };
    
    // 处理content字段
    if (msg.role === 'assistant' && msg.tool_calls) {
      // assistant消息有tool_calls时，content可以是null
      // 确保tool_calls格式正确
      // buildHistoryMessages已经输出了正确格式的tool_calls（arguments是JSON字符串）
      // 这里只需要简单验证，确保格式正确
      if (Array.isArray(msg.tool_calls)) {
        result.tool_calls = msg.tool_calls.map((tc) => {
          if (typeof tc === 'object' && tc !== null && tc.function) {
            // 确保arguments是JSON字符串
            let argumentsString = '';
            if (typeof tc.function.arguments === 'string') {
              // 已经是字符串，验证是否为有效JSON
              try {
                JSON.parse(tc.function.arguments);
                argumentsString = tc.function.arguments;
              } catch {
                logger.error(`[finalizeMessagesForAPI] 消息[${index}] tool_call arguments不是有效的JSON字符串:`, tc.function.arguments);
                argumentsString = '{}';
              }
            } else if (typeof tc.function.arguments === 'object' && tc.function.arguments !== null) {
              // 如果是对象，序列化为JSON字符串（这种情况不应该发生，但作为安全措施）
              try {
                argumentsString = JSON.stringify(tc.function.arguments);
              } catch {
                logger.error(`[finalizeMessagesForAPI] 消息[${index}] tool_call arguments序列化失败:`, tc.function.arguments);
                argumentsString = '{}';
              }
            } else {
              argumentsString = '{}';
            }
            
            return {
              id: tc.id || `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              type: 'function',
              function: {
                name: tc.function.name || '',
                arguments: argumentsString // OpenAI API要求：必须是JSON字符串！
              }
            };
          }
          return tc;
        });
      } else {
        logger.error(`[finalizeMessagesForAPI] 消息[${index}] tool_calls不是数组:`, typeof msg.tool_calls, msg.tool_calls);
        result.tool_calls = [];
      }
      
      result.content = (msg.content && typeof msg.content === 'string' && msg.content.trim()) 
        ? msg.content 
        : null;
    } else if (msg.role === 'tool') {
      // tool消息：content在buildHistoryMessages时已经从markdown字段获取并确保是字符串
      // 这里只需要简单验证
      result.content = typeof msg.content === 'string' ? msg.content : '';
      result.tool_call_id = msg.tool_call_id;
      if (msg.name) {
        result.name = msg.name;
      }
    } else {
      // 其他消息类型：content必须是字符串
      let content = msg.content;
      
      if (content === null || content === undefined) {
        content = '';
      } else if (typeof content !== 'string') {
        // 记录错误日志
        logger.error(`[finalizeMessagesForAPI] 消息[${index}] (role: ${msg.role}) 的content不是字符串:`, {
          contentType: typeof content,
          content: content
        });
        
        // 强制转换为字符串
        try {
          content = typeof content === 'object'
            ? JSON.stringify(content)
            : String(content || '');
        } catch (error) {
          logger.error(`[finalizeMessagesForAPI] 消息[${index}] content序列化失败:`, error);
          content = '';
        }
      }
      
      result.content = content;
    }
    
    return result;
  });
}

/**
 * 清理消息格式，确保符合OpenAI API规范
 * 移除不应该存在的字段（如type），确保必需字段存在
 * @param {Array} messages - 消息数组
 * @returns {Array} 清理后的消息数组
 */
function sanitizeMessages(messages) {
  const logger = createRendererLogger("LLM-API");
  if (!Array.isArray(messages)) {
    return messages;
  }

  return messages.map((msg, index) => {
    if (!msg || typeof msg !== 'object') {
      return msg;
    }

    // 创建全新的消息对象，避免修改原始对象
    const sanitized = {
      role: msg.role
    };

    // 处理content字段：确保所有content都是字符串（除了assistant的tool_calls消息）
    let content = msg.content;
    
    // 对于tool消息，content必须是字符串，绝对不能是对象
    if (msg.role === 'tool') {
      // Tool消息的content处理
      if (content === null || content === undefined) {
        content = '';
      } else if (typeof content !== 'string') {
        // 记录错误
        logger.error(`[sanitizeMessages] 消息[${index}] (tool) content不是字符串:`, {
          contentType: typeof content,
          content: content
        });
        
        // 强制转换为字符串
        try {
          // 如果content是ToolCallbackData格式（包含content和format字段），提取content
          if (typeof content === 'object' && content !== null && 'content' in content && 'format' in content) {
            const extractedContent = content.content;
            if (typeof extractedContent === 'string') {
              content = extractedContent;
            } else {
              content = JSON.stringify(extractedContent);
            }
          } else {
            // 直接序列化整个对象
            content = JSON.stringify(content);
          }
        } catch (error) {
          logger.error(`[sanitizeMessages] 消息[${index}] (tool) content序列化失败:`, error);
          content = '';
        }
      }
      // 最终强制转换为字符串
      sanitized.content = String(content || '');
      
      // 添加tool消息必需字段
      if (msg.tool_call_id) {
        sanitized.tool_call_id = msg.tool_call_id;
      }
      if (msg.name) {
        sanitized.name = msg.name;
      }
    } else if (msg.role === 'assistant' && msg.tool_calls) {
      // Assistant消息有tool_calls时，content可以是null
      sanitized.content = (content && typeof content === 'string' && content.trim()) ? content : null;
    } else {
      // 其他消息类型：content必须是字符串
      if (content === null || content === undefined) {
        sanitized.content = '';
      } else if (typeof content !== 'string') {
        // 记录错误
        logger.error(`[sanitizeMessages] 消息[${index}] (${msg.role}) content不是字符串:`, {
          contentType: typeof content,
          content: content
        });
        
        // 强制转换为字符串
        try {
          if (typeof content === 'object') {
            sanitized.content = JSON.stringify(content);
          } else {
            sanitized.content = String(content);
          }
        } catch (error) {
          logger.error(`[sanitizeMessages] 消息[${index}] (${msg.role}) content序列化失败:`, error);
          sanitized.content = '';
        }
      } else {
        sanitized.content = content;
      }
    }

    // 如果是assistant消息且有tool_calls，直接使用（buildHistoryMessages已经处理好了）
    // 只做简单验证，确保arguments是JSON字符串
    if (msg.role === 'assistant' && msg.tool_calls && Array.isArray(msg.tool_calls)) {
      sanitized.tool_calls = msg.tool_calls.map(tc => {
        if (typeof tc === 'object' && tc !== null && tc.function) {
          // OpenAI API要求：arguments必须是JSON字符串！
          // buildHistoryMessages已经输出了正确格式，这里只需要验证
          let argumentsString = '';
          if (typeof tc.function.arguments === 'string') {
            // 已经是字符串，验证是否为有效JSON
            try {
              JSON.parse(tc.function.arguments);
              argumentsString = tc.function.arguments;
            } catch {
              logger.error(`[sanitizeMessages] 消息[${index}] tool_call arguments不是有效的JSON字符串:`, tc.function.arguments);
              argumentsString = '{}';
            }
          } else if (typeof tc.function.arguments === 'object' && tc.function.arguments !== null) {
            // 如果是对象（不应该发生，但作为安全措施），序列化为JSON字符串
            try {
              argumentsString = JSON.stringify(tc.function.arguments);
            } catch {
              logger.error(`[sanitizeMessages] 消息[${index}] tool_call arguments序列化失败:`, tc.function.arguments);
              argumentsString = '{}';
            }
          } else {
            argumentsString = '{}';
          }
          
          return {
            id: tc.id || `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'function',
            function: {
              name: tc.function.name || '',
              arguments: argumentsString // OpenAI API要求：必须是JSON字符串！
            }
          };
        }
        return tc;
      });
      
      // 如果有tool_calls，content应该为null（如果原content为空）
      if (!sanitized.content || !sanitized.content.trim()) {
        sanitized.content = null;
      }
    }

    // Tool消息的额外字段已经在上面处理过了，这里只需要移除不需要的字段
    if (msg.role === 'tool') {
      // 移除不应该发送到LLM API的字段（如tool_config等）
      // 这些字段只在会话存储中使用，不应该发送到LLM
      delete sanitized.tool_config;
      delete sanitized.outputs;
      delete sanitized.tool;
      delete sanitized.status;
      delete sanitized.summary;
      delete sanitized.error;
      delete sanitized.type;
    }

    // 移除不应该存在的字段（如type）
    // 注意：tool_calls内部的type字段是必需的，不应该移除
    
    // 最后检查：对于所有消息（除了assistant的tool_calls消息），确保content是字符串
    if (sanitized.role !== 'assistant' || !sanitized.tool_calls) {
      if (sanitized.content !== null && sanitized.content !== undefined && typeof sanitized.content !== 'string') {
        try {
          sanitized.content = typeof sanitized.content === 'object'
            ? JSON.stringify(sanitized.content)
            : String(sanitized.content);
        } catch {
          sanitized.content = String(sanitized.content || '');
        }
      }
    }

    return sanitized;
  });
}

/**
 * 非流式补全请求
 */
async function answerQuestionNonStream(
  prompt,
  ref,
  meta = {},
  signal = null,
  customLlmConfig = null
) {
  // 如果有自定义配置，跳过全局验证
  if (!customLlmConfig && !(await validateApi())) {
    return;
  }

  const config = await getLlmConfig(customLlmConfig || (meta?.customLlmConfig || null));
  const { type, apiUrl, apiKey, selectedModel, completionSuffix = "", completionApiUrl, temperature } = config;
  
  // 使用meta中的temperature，如果没有则使用配置中的temperature，最后使用默认值1.3
  const effectiveTemperature = meta.temperature ?? temperature ?? 1.3;

  try {
    // 如果meta中有max_tokens，则使用它（用于自动补全限制）
    const maxTokens = meta.max_tokens;

    // 对于ollama和manual类型，使用原有的fetch方式
    if (type === "ollama" || type === "manual") {
      let url, payload, responseType;
      
      if (type === "ollama") {
        url = `${apiUrl}/generate`;
        payload = {
          model: selectedModel,
          prompt,
          stream: false,
          temperature: effectiveTemperature,
          ...(meta || {}),
        };
        // Ollama使用num_predict参数
        if (maxTokens !== undefined && maxTokens > 0) {
          payload.num_predict = maxTokens;
        }
        responseType = "completion";
      } else {
        // manual类型：使用Express服务器的模拟接口
        url = `http://localhost:52521/api/llm/completions`;
        payload = {
          model: selectedModel || "manual-model",
          prompt,
          stream: false,
          temperature: effectiveTemperature,
          ...(meta || {}),
        };
        if (maxTokens !== undefined && maxTokens > 0) {
          payload.max_tokens = maxTokens;
        }
        responseType = "completion";
      }

      const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
      const result = await sendNonStreamRequest(url, payload, headers, signal);
      const text = extractTextFromResponse(result, responseType);
      const processedText = await processThinkTag(text);
      ref.value = processedText;
      
      // 记录 token 统计
      try {
        const usage = extractUsageFromResponse(result);
        if (usage) {
          await recordLlmRequest(usage, selectedModel, 'completion');
        }
      } catch (error) {
        const logger = createRendererLogger("LLM-API");
        logger.warn('记录 token 统计失败:', error);
      }
      return;
    }

    // 对于OpenAI兼容的API，使用OpenAI SDK
    const baseURL = type === "deepseek" && completionApiUrl 
      ? completionApiUrl 
      : apiUrl;
    const finalUrl = `${baseURL}${completionSuffix}`;
    
    const openai = new OpenAI({
      apiKey: apiKey || "dummy-key", // manual类型可能没有apiKey
      baseURL: finalUrl,
      defaultQuery: {},
      defaultHeaders: {},
      dangerouslyAllowBrowser: true, // Electron环境需要此选项
    });

    const completionParams = {
      model: selectedModel || (type === "deepseek" ? "deepseek-chat" : "text-davinci-003"),
      prompt: prompt,
      temperature: effectiveTemperature,
      ...(meta || {}),
    };
    
    if (maxTokens !== undefined && maxTokens > 0) {
      completionParams.max_tokens = maxTokens;
    }

    const completion = await openai.completions.create(completionParams, {
      signal: signal,
    });

    const text = completion.choices[0]?.text || "";
    const processedText = await processThinkTag(text);
    ref.value = processedText;
    
    // 记录 token 统计
    try {
      const usage = completion.usage ? {
        prompt_tokens: completion.usage.prompt_tokens || 0,
        completion_tokens: completion.usage.completion_tokens || 0,
        total_tokens: completion.usage.total_tokens || 0,
      } : null;
      if (usage) {
        await recordLlmRequest(usage, selectedModel, 'completion');
      }
    } catch (error) {
      // 统计失败不影响主流程
      const logger = createRendererLogger("LLM-API");
      logger.warn('记录 token 统计失败:', error);
    }
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
  customLlmConfig = null
) {
  // 如果有自定义配置，跳过全局验证
  if (!customLlmConfig && !(await validateApi())) {
    return;
  }

  const config = await getLlmConfig(customLlmConfig || (meta?.customLlmConfig || null));
  const { type, apiUrl, apiKey, selectedModel, completionSuffix = "", completionApiUrl, temperature } = config;
  
  // 使用meta中的temperature，如果没有则使用配置中的temperature，最后使用默认值1.3
  const effectiveTemperature = meta.temperature ?? temperature ?? 1.3;

  try {
    // 如果meta中有max_tokens，则使用它（用于自动补全限制）
    const maxTokens = meta.max_tokens;

    // 对于ollama和manual类型，使用原有的fetch方式
    if (type === "ollama" || type === "manual") {
      let url, payload, responseType;
      
      if (type === "ollama") {
        url = `${apiUrl}/generate`;
        payload = {
          model: selectedModel,
          prompt,
          stream: true,
          temperature: effectiveTemperature,
          ...(meta || {}),
        };
        // Ollama使用num_predict参数
        if (maxTokens !== undefined && maxTokens > 0) {
          payload.num_predict = maxTokens;
        }
        responseType = "completion";
      } else {
        // manual类型：使用Express服务器的模拟接口
        url = `http://localhost:52521/api/llm/completions`;
        payload = {
          model: selectedModel || "manual-model",
          prompt,
          stream: true,
          temperature: effectiveTemperature,
          ...(meta || {}),
        };
        if (maxTokens !== undefined && maxTokens > 0) {
          payload.max_tokens = maxTokens;
        }
        responseType = "completion";
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
        },
        async (lastChunk) => {
          // 流式响应完成时，记录 token 统计
          try {
            const usage = extractUsageFromResponse(lastChunk);
            if (usage) {
              await recordLlmRequest(usage, selectedModel, 'completion');
            }
          } catch (error) {
            // 统计失败不影响主流程
            const logger = createRendererLogger("LLM-API");
            logger.warn('记录 token 统计失败:', error);
          }
        }
      );
      return;
    }

    // 对于OpenAI兼容的API，使用OpenAI SDK
    const baseURL = type === "deepseek" && completionApiUrl 
      ? completionApiUrl 
      : apiUrl;
    const finalUrl = `${baseURL}${completionSuffix}`;
    
    const openai = new OpenAI({
      apiKey: apiKey || "dummy-key",
      baseURL: finalUrl,
      defaultQuery: {},
      defaultHeaders: {},
      dangerouslyAllowBrowser: true, // Electron环境需要此选项
    });

    const completionParams = {
      model: selectedModel || (type === "deepseek" ? "deepseek-chat" : "text-davinci-003"),
      prompt: prompt,
      stream: true,
      temperature: effectiveTemperature,
      ...(meta || {}),
    };
    
    if (maxTokens !== undefined && maxTokens > 0) {
      completionParams.max_tokens = maxTokens;
    }

    ref.value = ""; // 清空内容
    let lastUsage = null;

    const stream = await openai.completions.create(completionParams, {
      signal: signal,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.text || "";
      if (delta) {
        ref.value += delta;
        // 处理思考标签
        const processed = await processThinkTag(ref.value);
        if (processed !== ref.value) {
          ref.value = processed;
        }
      }
      // 保存usage信息（如果有）
      if (chunk.usage) {
        lastUsage = chunk.usage;
      }
    }

    // 流式响应完成时，记录 token 统计
    try {
      if (lastUsage) {
        const usage = {
          prompt_tokens: lastUsage.prompt_tokens || 0,
          completion_tokens: lastUsage.completion_tokens || 0,
          total_tokens: lastUsage.total_tokens || 0,
        };
        await recordLlmRequest(usage, selectedModel, 'completion');
      }
    } catch (error) {
      // 统计失败不影响主流程
      const logger = createRendererLogger("LLM-API");
      logger.warn('记录 token 统计失败:', error);
    }
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
  meta = {},
  signal = {},
  customLlmConfig = null
) {
  try {
    // 从meta中提取自定义配置（如果存在）
    const effectiveCustomConfig = customLlmConfig || meta?.customLlmConfig || null;
    
    if (meta.stream) {
      await answerQuestionStream(prompt, ref, meta, signal, effectiveCustomConfig);
    } else {
      await answerQuestionNonStream(prompt, ref, meta, signal, effectiveCustomConfig);
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
async function requestLlm(conversation, signal, customLlmConfig = null) {
  // 如果有自定义配置，跳过全局验证
  if (!customLlmConfig && !(await validateApi())) {
    return null;
  }

  const config = await getLlmConfig(customLlmConfig);
  const { type, apiUrl, apiKey, selectedModel, chatSuffix = "", temperature } = config;

  return { type, apiUrl, apiKey, selectedModel, chatSuffix, temperature, conversation };
}

/**
 * 非流式对话请求
 */
async function continueConversationNonStream(
  conversation,
  ref,
  meta,
  signal,
  customLlmConfig = null
) {
  const logger = createRendererLogger("LLM-API");
  const effectiveCustomConfig = customLlmConfig || meta?.customLlmConfig || null;
  const config = await requestLlm(conversation, signal, effectiveCustomConfig);
  if (!config) {
    return;
  }

  const { type, apiUrl, apiKey, selectedModel, chatSuffix, temperature } = config;
  
  // 使用meta中的temperature，如果没有则使用配置中的temperature，最后使用默认值1.3
  const effectiveTemperature = meta?.temperature ?? temperature ?? 1.3;

  try {
    // 对于ollama和manual类型，使用原有的fetch方式
    if (type === "ollama" || type === "manual") {
      let url, payload;
      
      if (type === "ollama") {
        url = `${apiUrl}/chat`;
        payload = {
          model: selectedModel,
          messages: conversation,
          stream: false,
          temperature: effectiveTemperature,
          ...(meta || {}),
        };
      } else {
        // manual类型：使用Express服务器的模拟接口
        url = `http://localhost:52521/api/llm/chat/completions`;
        // 清理并验证消息格式
        let sanitizedMsgs = sanitizeMessages(conversation);
        sanitizedMsgs = finalizeMessagesForAPI(sanitizedMsgs, logger);
        payload = {
          model: selectedModel || "manual-model",
          messages: sanitizedMsgs,
          stream: false,
          temperature: effectiveTemperature,
          ...(meta || {}),
        };
      }

      const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
      const result = await sendNonStreamRequest(url, payload, headers, signal);
      const content = extractTextFromResponse(result, "chat");
      const processedContent = await processThinkTag(content);
      ref.value = processedContent;
      
      // 记录 token 统计
      try {
        const usage = extractUsageFromResponse(result);
        if (usage) {
          await recordLlmRequest(usage, selectedModel, 'chat');
        }
      } catch (error) {
        logger.warn('记录 token 统计失败:', error);
      }
      return;
    }

    // 对于OpenAI兼容的API，使用OpenAI SDK
    // 清理并验证消息格式
    let sanitizedMsgs = sanitizeMessages(conversation);
    
    // 最终验证和转换：这是发送到API之前的最后一道防线
    sanitizedMsgs = finalizeMessagesForAPI(sanitizedMsgs, logger);
    
    const finalUrl = `${apiUrl}${chatSuffix}`;
    
    const openai = new OpenAI({
      apiKey: apiKey || "dummy-key",
      baseURL: finalUrl,
      defaultQuery: {},
      defaultHeaders: {},
      dangerouslyAllowBrowser: true, // Electron环境需要此选项
    });

    const chatParams = {
      model: selectedModel,
      messages: sanitizedMsgs,
      temperature: effectiveTemperature,
      ...(meta || {}),
    };

    const completion = await openai.chat.completions.create(chatParams, {
      signal: signal,
    });

    const content = completion.choices[0]?.message?.content || "";
    const processedContent = await processThinkTag(content);
    ref.value = processedContent;
    
    // 记录 token 统计
    try {
      const usage = completion.usage ? {
        prompt_tokens: completion.usage.prompt_tokens || 0,
        completion_tokens: completion.usage.completion_tokens || 0,
        total_tokens: completion.usage.total_tokens || 0,
      } : null;
      if (usage) {
        await recordLlmRequest(usage, selectedModel, 'chat');
      }
    } catch (error) {
      // 统计失败不影响主流程
      logger.warn('记录 token 统计失败:', error);
    }
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
  customLlmConfig = null
) {
  const logger = createRendererLogger("LLM-API");
  const effectiveCustomConfig = customLlmConfig || meta?.customLlmConfig || null;
  const config = await requestLlm(conversation, signal, effectiveCustomConfig);
  if (!config) {
    return;
  }

  const { type, apiUrl, apiKey, selectedModel, chatSuffix, temperature } = config;
  
  // 使用meta中的temperature，如果没有则使用配置中的temperature，最后使用默认值1.3
  const effectiveTemperature = meta?.temperature ?? temperature ?? 1.3;

  try {
    // 对于ollama和manual类型，使用原有的fetch方式
    if (type === "ollama" || type === "manual") {
      let url, payload;
      
      if (type === "ollama") {
        url = `${apiUrl}/chat`;
        payload = {
          model: selectedModel,
          messages: conversation,
          stream: true,
          temperature: effectiveTemperature,
          ...(meta || {}),
        };
      } else {
        // manual类型：使用Express服务器的模拟接口
        url = `http://localhost:52521/api/llm/chat/completions`;
        // 清理并验证消息格式
        let sanitizedMsgs = sanitizeMessages(conversation);
        sanitizedMsgs = finalizeMessagesForAPI(sanitizedMsgs, logger);
        payload = {
          model: selectedModel || "manual-model",
          messages: sanitizedMsgs,
          stream: true,
          temperature: effectiveTemperature,
          ...(meta || {}),
        };
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
        },
        async (lastChunk) => {
          // 流式响应完成时，记录 token 统计
          try {
            const usage = extractUsageFromResponse(lastChunk);
            if (usage) {
              await recordLlmRequest(usage, selectedModel, 'chat');
            }
          } catch (error) {
            // 统计失败不影响主流程
            logger.warn('记录 token 统计失败:', error);
          }
        }
      );
      return;
    }

    // 对于OpenAI兼容的API，使用OpenAI SDK
    // 清理并验证消息格式
    let sanitizedMsgs = sanitizeMessages(conversation);
    
    // 最终验证和转换：这是发送到API之前的最后一道防线
    sanitizedMsgs = finalizeMessagesForAPI(sanitizedMsgs, logger);
    
    const finalUrl = `${apiUrl}${chatSuffix}`;
    
    const openai = new OpenAI({
      apiKey: apiKey || "dummy-key",
      baseURL: finalUrl,
      defaultQuery: {},
      defaultHeaders: {},
      dangerouslyAllowBrowser: true, // Electron环境需要此选项
    });

    const chatParams = {
      model: selectedModel,
      messages: sanitizedMsgs,
      stream: true,
      temperature: effectiveTemperature,
      ...(meta || {}),
    };

    ref.value = ""; // 清空内容
    let lastUsage = null;

    const stream = await openai.chat.completions.create(chatParams, {
      signal: signal,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || "";
      if (delta) {
        ref.value += delta;
        // 处理思考标签
        const processed = await processThinkTag(ref.value);
        if (processed !== ref.value) {
          ref.value = processed;
        }
      }
      // 保存usage信息（如果有）
      if (chunk.usage) {
        lastUsage = chunk.usage;
      }
    }

    // 流式响应完成时，记录 token 统计
    try {
      if (lastUsage) {
        const usage = {
          prompt_tokens: lastUsage.prompt_tokens || 0,
          completion_tokens: lastUsage.completion_tokens || 0,
          total_tokens: lastUsage.total_tokens || 0,
        };
        await recordLlmRequest(usage, selectedModel, 'chat');
      }
    } catch (error) {
      // 统计失败不影响主流程
      logger.warn('记录 token 统计失败:', error);
    }
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
  meta = {},
  signal,
  customLlmConfig = null
) {
  const logger = createRendererLogger("LLM-API");
  try {
    // 从meta中提取自定义配置（如果存在）
    const effectiveCustomConfig = customLlmConfig || meta?.customLlmConfig || null;
    
    // 设置默认值：如果没有指定stream，默认使用流式输出
    // 关键修复：确保stream默认为true，而不是undefined
    const shouldStream = meta?.stream !== false && (meta?.stream === true || meta?.stream === undefined);
    
    // 记录meta信息用于调试
    logger.debug('[continueConversation] meta参数检查:', {
      stream: meta?.stream,
      streamType: typeof meta?.stream,
      metaKeys: meta && typeof meta === 'object' ? Object.keys(meta) : [],
      hasStream: meta && typeof meta === 'object' && 'stream' in meta,
      shouldStream: shouldStream,
      metaValue: JSON.stringify(meta)
    });
    
    if (shouldStream) {
      logger.debug('[continueConversation] 使用流式输出模式');
      await continueConversationStream(conversation, ref, meta, signal, effectiveCustomConfig);
    } else {
      logger.warn(`[continueConversation] 使用非流式输出模式！meta.stream=${meta?.stream}, meta=${JSON.stringify(meta)}`);
      await continueConversationNonStream(
        conversation,
        ref,
        meta,
        signal,
        effectiveCustomConfig
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

// RAG查询注入功能已移除，现在通过Agent Tool系统调用

// 导出sanitizeMessages函数，供其他模块使用
export { answerQuestion, continueConversation, sanitizeMessages };
