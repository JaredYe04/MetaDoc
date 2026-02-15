/**
 * 工具会话数据库访问层
 * 提供数据分析、OCR、附件解析、绘图工具会话的CRUD操作
 */

import localIpcRenderer from '../web-adapter/local-ipc-renderer'
import { webMainCalls } from '../web-adapter/web-main-calls'

// 获取IPC渲染器
let ipcRenderer: typeof localIpcRenderer | null = null
if (typeof window !== 'undefined') {
  if ((window as any).electron?.ipcRenderer) {
    ipcRenderer = (window as any).electron.ipcRenderer
  } else {
    webMainCalls()
    ipcRenderer = localIpcRenderer
  }
}

export interface DataAnalysisSession {
  id: string
  title: string
  description?: string
  data_file_path?: string
  data_format?: string
  header_row_index?: number // 表头行索引（从0开始）
  analysis_result?: string // JSON格式
  report_markdown?: string
  analysis_request?: string // 分析需求提示词
  auto_group_by?: number // 自动聚合分析（0或1，SQLite存储为INTEGER）
  generate_report?: number // 生成AI报告（0或1，SQLite存储为INTEGER）
  created_at: string
  updated_at: string
}

export interface OcrSession {
  id: string
  title: string
  description?: string
  images?: string // JSON数组
  ocr_languages?: string // JSON数组
  ocr_results?: string // JSON格式
  created_at: string
  updated_at: string
}

export interface AttachmentSession {
  id: string
  title: string
  description?: string
  file_path: string
  file_name: string
  file_type?: string
  parsed_content?: string
  ai_analysis?: string
  created_at: string
  updated_at: string
}

export interface GraphSession {
  id: string
  title: string
  description?: string
  conversation_history?: string // JSON数组
  current_prompt?: string
  output_format?: string
  output_path?: string
  created_at: string
  updated_at: string
}

export interface FormulaRecognitionSession {
  id: string
  title: string
  description?: string
  canvas_image?: string // Base64编码的画布图片
  latex_result?: string // LaTeX公式
  brush_size?: number // 笔刷粗细（1-20）
  created_at: string
  updated_at: string
}

export interface AigcDetectionSession {
  id: string
  title: string
  description?: string
  article_content?: string // 文章内容
  content_source?: string // 内容来源：'file' | 'document'
  source_file_path?: string // 如果是文件上传，保存文件路径
  source_tab_id?: string // 如果是从文档tab获取，保存tab id
  overall_analysis?: string // 总体分析结果（JSON格式）
  paragraph_analyses?: string // 分段分析结果（JSON数组格式）
  report_markdown?: string // 生成的报告（Markdown格式）
  paragraph_texts?: string // 划分后的段落列表（JSON 字符串数组），分析时直接使用
  paragraph_paraphrases?: string // 每段改写后的文本（JSON 数组，与段落一一对应，null 表示未改写）
  language?: string // 语言：'zh' | 'en' 等
  domain?: string // 领域：'academic' | 'general' 等
  created_at: string
  updated_at: string
}

export interface AIChatSession {
  id: string
  title: string
  messages: string // JSON数组
  reference_store?: string // JSON数组
  created_at: number
  updated_at: number
}

/**
 * 数据分析会话CRUD
 */
export const dataAnalysisSessionsDb = {
  async getAll(): Promise<DataAnalysisSession[]> {
    if (!ipcRenderer) throw new Error('IPC渲染器不可用')
    return (await ipcRenderer.invoke('db-query', {
      sql: 'SELECT * FROM data_analysis_sessions ORDER BY updated_at DESC',
      params: []
    })) as DataAnalysisSession[]
  },

  async getById(id: string): Promise<DataAnalysisSession | null> {
    if (!ipcRenderer) throw new Error('IPC渲染器不可用')
    const results = (await ipcRenderer.invoke('db-query', {
      sql: 'SELECT * FROM data_analysis_sessions WHERE id = ?',
      params: [id]
    })) as DataAnalysisSession[]
    return results[0] || null
  },

  async create(session: Omit<DataAnalysisSession, 'created_at' | 'updated_at'>): Promise<void> {
    if (!ipcRenderer) throw new Error('IPC渲染器不可用')
    await ipcRenderer.invoke('db-execute', {
      sql: `INSERT INTO data_analysis_sessions 
            (id, title, description, data_file_path, data_format, header_row_index, analysis_result, report_markdown, analysis_request, auto_group_by, generate_report, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      params: [
        session.id,
        session.title,
        session.description || null,
        session.data_file_path || null,
        session.data_format || null,
        session.header_row_index !== undefined ? session.header_row_index : null,
        session.analysis_result || null,
        session.report_markdown || null,
        session.analysis_request || null,
        session.auto_group_by !== undefined ? (session.auto_group_by ? 1 : 0) : null,
        session.generate_report !== undefined ? (session.generate_report ? 1 : 0) : null
      ]
    })
  },

  async update(
    id: string,
    updates: Partial<Omit<DataAnalysisSession, 'id' | 'created_at'>>
  ): Promise<void> {
    if (!ipcRenderer) throw new Error('IPC渲染器不可用')
    const fields: string[] = []
    const params: any[] = []

    if (updates.title !== undefined) {
      fields.push('title = ?')
      params.push(updates.title)
    }
    if (updates.description !== undefined) {
      fields.push('description = ?')
      params.push(updates.description)
    }
    if (updates.data_file_path !== undefined) {
      fields.push('data_file_path = ?')
      params.push(updates.data_file_path)
    }
    if (updates.data_format !== undefined) {
      fields.push('data_format = ?')
      params.push(updates.data_format)
    }
    if (updates.header_row_index !== undefined) {
      fields.push('header_row_index = ?')
      params.push(updates.header_row_index !== null ? updates.header_row_index : null)
    }
    if (updates.analysis_result !== undefined) {
      fields.push('analysis_result = ?')
      params.push(updates.analysis_result)
    }
    if (updates.report_markdown !== undefined) {
      fields.push('report_markdown = ?')
      params.push(updates.report_markdown)
    }
    if (updates.analysis_request !== undefined) {
      fields.push('analysis_request = ?')
      params.push(updates.analysis_request || null)
    }
    if (updates.auto_group_by !== undefined) {
      fields.push('auto_group_by = ?')
      params.push(updates.auto_group_by ? 1 : 0)
    }
    if (updates.generate_report !== undefined) {
      fields.push('generate_report = ?')
      params.push(updates.generate_report ? 1 : 0)
    }

    fields.push('updated_at = CURRENT_TIMESTAMP')
    params.push(id)

    await ipcRenderer.invoke('db-execute', {
      sql: `UPDATE data_analysis_sessions SET ${fields.join(', ')} WHERE id = ?`,
      params
    })
  },

  async delete(id: string): Promise<void> {
    if (!ipcRenderer) throw new Error('IPC渲染器不可用')
    await ipcRenderer.invoke('db-execute', {
      sql: 'DELETE FROM data_analysis_sessions WHERE id = ?',
      params: [id]
    })
  }
}

/**
 * OCR会话CRUD
 */
export const ocrSessionsDb = {
  async getAll(): Promise<OcrSession[]> {
    if (!ipcRenderer) throw new Error('IPC渲染器不可用')
    return (await ipcRenderer.invoke('db-query', {
      sql: 'SELECT * FROM ocr_sessions ORDER BY updated_at DESC',
      params: []
    })) as OcrSession[]
  },

  async getById(id: string): Promise<OcrSession | null> {
    if (!ipcRenderer) throw new Error('IPC渲染器不可用')
    const results = (await ipcRenderer.invoke('db-query', {
      sql: 'SELECT * FROM ocr_sessions WHERE id = ?',
      params: [id]
    })) as OcrSession[]
    return results[0] || null
  },

  async create(session: Omit<OcrSession, 'created_at' | 'updated_at'>): Promise<void> {
    if (!ipcRenderer) throw new Error('IPC渲染器不可用')
    await ipcRenderer.invoke('db-execute', {
      sql: `INSERT INTO ocr_sessions 
            (id, title, description, images, ocr_languages, ocr_results, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      params: [
        session.id,
        session.title,
        session.description || null,
        session.images || null,
        session.ocr_languages || null,
        session.ocr_results || null
      ]
    })
  },

  async update(id: string, updates: Partial<Omit<OcrSession, 'id' | 'created_at'>>): Promise<void> {
    if (!ipcRenderer) throw new Error('IPC渲染器不可用')
    const fields: string[] = []
    const params: any[] = []

    if (updates.title !== undefined) {
      fields.push('title = ?')
      params.push(updates.title)
    }
    if (updates.description !== undefined) {
      fields.push('description = ?')
      params.push(updates.description)
    }
    if (updates.images !== undefined) {
      fields.push('images = ?')
      params.push(updates.images)
    }
    if (updates.ocr_languages !== undefined) {
      fields.push('ocr_languages = ?')
      params.push(updates.ocr_languages)
    }
    if (updates.ocr_results !== undefined) {
      fields.push('ocr_results = ?')
      params.push(updates.ocr_results)
    }

    fields.push('updated_at = CURRENT_TIMESTAMP')
    params.push(id)

    await ipcRenderer.invoke('db-execute', {
      sql: `UPDATE ocr_sessions SET ${fields.join(', ')} WHERE id = ?`,
      params
    })
  },

  async delete(id: string): Promise<void> {
    if (!ipcRenderer) throw new Error('IPC渲染器不可用')
    await ipcRenderer.invoke('db-execute', {
      sql: 'DELETE FROM ocr_sessions WHERE id = ?',
      params: [id]
    })
  }
}

/**
 * 附件解析会话CRUD
 */
export const attachmentSessionsDb = {
  async getAll(): Promise<AttachmentSession[]> {
    if (!ipcRenderer) throw new Error('IPC渲染器不可用')
    return (await ipcRenderer.invoke('db-query', {
      sql: 'SELECT * FROM attachment_sessions ORDER BY updated_at DESC',
      params: []
    })) as AttachmentSession[]
  },

  async getById(id: string): Promise<AttachmentSession | null> {
    if (!ipcRenderer) throw new Error('IPC渲染器不可用')
    const results = (await ipcRenderer.invoke('db-query', {
      sql: 'SELECT * FROM attachment_sessions WHERE id = ?',
      params: [id]
    })) as AttachmentSession[]
    return results[0] || null
  },

  async create(session: Omit<AttachmentSession, 'created_at' | 'updated_at'>): Promise<void> {
    if (!ipcRenderer) throw new Error('IPC渲染器不可用')
    await ipcRenderer.invoke('db-execute', {
      sql: `INSERT INTO attachment_sessions 
            (id, title, description, file_path, file_name, file_type, parsed_content, ai_analysis, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      params: [
        session.id,
        session.title,
        session.description || null,
        session.file_path,
        session.file_name,
        session.file_type || null,
        session.parsed_content || null,
        session.ai_analysis || null
      ]
    })
  },

  async update(
    id: string,
    updates: Partial<Omit<AttachmentSession, 'id' | 'created_at'>>
  ): Promise<void> {
    if (!ipcRenderer) throw new Error('IPC渲染器不可用')
    const fields: string[] = []
    const params: any[] = []

    if (updates.title !== undefined) {
      fields.push('title = ?')
      params.push(updates.title)
    }
    if (updates.description !== undefined) {
      fields.push('description = ?')
      params.push(updates.description)
    }
    if (updates.parsed_content !== undefined) {
      fields.push('parsed_content = ?')
      params.push(updates.parsed_content)
    }
    if (updates.ai_analysis !== undefined) {
      fields.push('ai_analysis = ?')
      params.push(updates.ai_analysis)
    }

    fields.push('updated_at = CURRENT_TIMESTAMP')
    params.push(id)

    await ipcRenderer.invoke('db-execute', {
      sql: `UPDATE attachment_sessions SET ${fields.join(', ')} WHERE id = ?`,
      params
    })
  },

  async delete(id: string): Promise<void> {
    if (!ipcRenderer) throw new Error('IPC渲染器不可用')
    await ipcRenderer.invoke('db-execute', {
      sql: 'DELETE FROM attachment_sessions WHERE id = ?',
      params: [id]
    })
  }
}

/**
 * 绘图工具会话CRUD
 */
export const graphSessionsDb = {
  async getAll(): Promise<GraphSession[]> {
    if (!ipcRenderer) throw new Error('IPC渲染器不可用')
    return (await ipcRenderer.invoke('db-query', {
      sql: 'SELECT * FROM graph_sessions ORDER BY updated_at DESC',
      params: []
    })) as GraphSession[]
  },

  async getById(id: string): Promise<GraphSession | null> {
    if (!ipcRenderer) throw new Error('IPC渲染器不可用')
    const results = (await ipcRenderer.invoke('db-query', {
      sql: 'SELECT * FROM graph_sessions WHERE id = ?',
      params: [id]
    })) as GraphSession[]
    return results[0] || null
  },

  async create(session: Omit<GraphSession, 'created_at' | 'updated_at'>): Promise<void> {
    if (!ipcRenderer) throw new Error('IPC渲染器不可用')
    await ipcRenderer.invoke('db-execute', {
      sql: `INSERT INTO graph_sessions 
            (id, title, description, conversation_history, current_prompt, output_format, output_path, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      params: [
        session.id,
        session.title,
        session.description || null,
        session.conversation_history || null,
        session.current_prompt || null,
        session.output_format || null,
        session.output_path || null
      ]
    })
  },

  async update(
    id: string,
    updates: Partial<Omit<GraphSession, 'id' | 'created_at'>>
  ): Promise<void> {
    if (!ipcRenderer) throw new Error('IPC渲染器不可用')
    const fields: string[] = []
    const params: any[] = []

    if (updates.title !== undefined) {
      fields.push('title = ?')
      params.push(updates.title)
    }
    if (updates.description !== undefined) {
      fields.push('description = ?')
      params.push(updates.description)
    }
    if (updates.conversation_history !== undefined) {
      fields.push('conversation_history = ?')
      params.push(updates.conversation_history)
    }
    if (updates.current_prompt !== undefined) {
      fields.push('current_prompt = ?')
      params.push(updates.current_prompt)
    }
    if (updates.output_format !== undefined) {
      fields.push('output_format = ?')
      params.push(updates.output_format)
    }
    if (updates.output_path !== undefined) {
      fields.push('output_path = ?')
      params.push(updates.output_path)
    }

    fields.push('updated_at = CURRENT_TIMESTAMP')
    params.push(id)

    await ipcRenderer.invoke('db-execute', {
      sql: `UPDATE graph_sessions SET ${fields.join(', ')} WHERE id = ?`,
      params
    })
  },

  async delete(id: string): Promise<void> {
    if (!ipcRenderer) throw new Error('IPC渲染器不可用')
    await ipcRenderer.invoke('db-execute', {
      sql: 'DELETE FROM graph_sessions WHERE id = ?',
      params: [id]
    })
  }
}

/**
 * AIChat会话CRUD（用于迁移）
 */
export const aiChatSessionsDb = {
  async getAll(): Promise<AIChatSession[]> {
    if (!ipcRenderer) throw new Error('IPC渲染器不可用')
    return (await ipcRenderer.invoke('db-query', {
      sql: 'SELECT * FROM ai_chat_sessions ORDER BY updated_at DESC',
      params: []
    })) as AIChatSession[]
  },

  async getById(id: string): Promise<AIChatSession | null> {
    if (!ipcRenderer) throw new Error('IPC渲染器不可用')
    const results = (await ipcRenderer.invoke('db-query', {
      sql: 'SELECT * FROM ai_chat_sessions WHERE id = ?',
      params: [id]
    })) as AIChatSession[]
    return results[0] || null
  },

  async create(session: AIChatSession): Promise<void> {
    if (!ipcRenderer) throw new Error('IPC渲染器不可用')
    await ipcRenderer.invoke('db-execute', {
      sql: `INSERT INTO ai_chat_sessions 
            (id, title, messages, reference_store, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      params: [
        session.id,
        session.title,
        session.messages,
        session.reference_store || null,
        session.created_at,
        session.updated_at
      ]
    })
  },

  async update(
    id: string,
    updates: Partial<Omit<AIChatSession, 'id' | 'created_at'>>
  ): Promise<void> {
    if (!ipcRenderer) throw new Error('IPC渲染器不可用')
    const fields: string[] = []
    const params: any[] = []

    if (updates.title !== undefined) {
      fields.push('title = ?')
      params.push(updates.title)
    }
    if (updates.messages !== undefined) {
      fields.push('messages = ?')
      params.push(updates.messages)
    }
    if (updates.reference_store !== undefined) {
      fields.push('reference_store = ?')
      params.push(updates.reference_store)
    }
    if (updates.updated_at !== undefined) {
      fields.push('updated_at = ?')
      params.push(updates.updated_at)
    }

    params.push(id)

    await ipcRenderer.invoke('db-execute', {
      sql: `UPDATE ai_chat_sessions SET ${fields.join(', ')} WHERE id = ?`,
      params
    })
  },

  async delete(id: string): Promise<void> {
    if (!ipcRenderer) throw new Error('IPC渲染器不可用')
    await ipcRenderer.invoke('db-execute', {
      sql: 'DELETE FROM ai_chat_sessions WHERE id = ?',
      params: [id]
    })
  },

  async tableExists(): Promise<boolean> {
    if (!ipcRenderer) throw new Error('IPC渲染器不可用')
    try {
      const results = (await ipcRenderer.invoke('db-query', {
        sql: "SELECT name FROM sqlite_master WHERE type='table' AND name='ai_chat_sessions'",
        params: []
      })) as Array<{ name: string }>
      return results.length > 0
    } catch {
      return false
    }
  }
}

/**
 * 公式识别会话CRUD
 */
export const formulaRecognitionSessionsDb = {
  async getAll(): Promise<FormulaRecognitionSession[]> {
    if (!ipcRenderer) throw new Error('IPC渲染器不可用')
    return (await ipcRenderer.invoke('db-query', {
      sql: 'SELECT * FROM formula_recognition_sessions ORDER BY updated_at DESC',
      params: []
    })) as FormulaRecognitionSession[]
  },

  async getById(id: string): Promise<FormulaRecognitionSession | null> {
    if (!ipcRenderer) throw new Error('IPC渲染器不可用')
    const results = (await ipcRenderer.invoke('db-query', {
      sql: 'SELECT * FROM formula_recognition_sessions WHERE id = ?',
      params: [id]
    })) as FormulaRecognitionSession[]
    return results[0] || null
  },

  async create(
    session: Omit<FormulaRecognitionSession, 'created_at' | 'updated_at'>
  ): Promise<void> {
    if (!ipcRenderer) throw new Error('IPC渲染器不可用')
    await ipcRenderer.invoke('db-execute', {
      sql: `INSERT INTO formula_recognition_sessions 
            (id, title, description, canvas_image, latex_result, brush_size, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      params: [
        session.id,
        session.title,
        session.description || null,
        session.canvas_image || null,
        session.latex_result || null,
        session.brush_size !== undefined ? session.brush_size : 2
      ]
    })
  },

  async update(
    id: string,
    updates: Partial<Omit<FormulaRecognitionSession, 'id' | 'created_at'>>
  ): Promise<void> {
    if (!ipcRenderer) throw new Error('IPC渲染器不可用')
    const fields: string[] = []
    const params: any[] = []

    if (updates.title !== undefined) {
      fields.push('title = ?')
      params.push(updates.title)
    }
    if (updates.description !== undefined) {
      fields.push('description = ?')
      params.push(updates.description || null)
    }
    if (updates.canvas_image !== undefined) {
      fields.push('canvas_image = ?')
      params.push(updates.canvas_image || null)
    }
    if (updates.latex_result !== undefined) {
      fields.push('latex_result = ?')
      params.push(updates.latex_result || null)
    }
    if (updates.brush_size !== undefined) {
      fields.push('brush_size = ?')
      params.push(updates.brush_size)
    }

    fields.push('updated_at = CURRENT_TIMESTAMP')
    params.push(id)

    await ipcRenderer.invoke('db-execute', {
      sql: `UPDATE formula_recognition_sessions SET ${fields.join(', ')} WHERE id = ?`,
      params
    })
  },

  async delete(id: string): Promise<void> {
    if (!ipcRenderer) throw new Error('IPC渲染器不可用')
    await ipcRenderer.invoke('db-execute', {
      sql: 'DELETE FROM formula_recognition_sessions WHERE id = ?',
      params: [id]
    })
  }
}

/**
 * AIGC检测会话CRUD
 */
export const aigcDetectionSessionsDb = {
  async getAll(): Promise<AigcDetectionSession[]> {
    if (!ipcRenderer) throw new Error('IPC渲染器不可用')
    return (await ipcRenderer.invoke('db-query', {
      sql: 'SELECT * FROM aigc_detection_sessions ORDER BY updated_at DESC',
      params: []
    })) as AigcDetectionSession[]
  },

  async getById(id: string): Promise<AigcDetectionSession | null> {
    if (!ipcRenderer) throw new Error('IPC渲染器不可用')
    const results = (await ipcRenderer.invoke('db-query', {
      sql: 'SELECT * FROM aigc_detection_sessions WHERE id = ?',
      params: [id]
    })) as AigcDetectionSession[]
    return results[0] || null
  },

  async create(session: Omit<AigcDetectionSession, 'created_at' | 'updated_at'>): Promise<void> {
    if (!ipcRenderer) throw new Error('IPC渲染器不可用')
    await ipcRenderer.invoke('db-execute', {
      sql: `INSERT INTO aigc_detection_sessions 
            (id, title, description, article_content, content_source, source_file_path, source_tab_id, overall_analysis, paragraph_analyses, report_markdown, paragraph_texts, paragraph_paraphrases, language, domain, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      params: [
        session.id,
        session.title,
        session.description || null,
        session.article_content || null,
        session.content_source || null,
        session.source_file_path || null,
        session.source_tab_id || null,
        session.overall_analysis || null,
        session.paragraph_analyses || null,
        session.report_markdown || null,
        session.paragraph_texts || null,
        session.paragraph_paraphrases || null,
        session.language || 'zh',
        session.domain || 'academic'
      ]
    })
  },

  async update(
    id: string,
    updates: Partial<Omit<AigcDetectionSession, 'id' | 'created_at'>>
  ): Promise<void> {
    if (!ipcRenderer) throw new Error('IPC渲染器不可用')
    const fields: string[] = []
    const params: any[] = []

    if (updates.title !== undefined) {
      fields.push('title = ?')
      params.push(updates.title)
    }
    if (updates.description !== undefined) {
      fields.push('description = ?')
      params.push(updates.description || null)
    }
    if (updates.article_content !== undefined) {
      fields.push('article_content = ?')
      params.push(updates.article_content || null)
    }
    if (updates.content_source !== undefined) {
      fields.push('content_source = ?')
      params.push(updates.content_source || null)
    }
    if (updates.source_file_path !== undefined) {
      fields.push('source_file_path = ?')
      params.push(updates.source_file_path || null)
    }
    if (updates.source_tab_id !== undefined) {
      fields.push('source_tab_id = ?')
      params.push(updates.source_tab_id || null)
    }
    if (updates.overall_analysis !== undefined) {
      fields.push('overall_analysis = ?')
      params.push(updates.overall_analysis || null)
    }
    if (updates.paragraph_analyses !== undefined) {
      fields.push('paragraph_analyses = ?')
      params.push(updates.paragraph_analyses || null)
    }
    if (updates.report_markdown !== undefined) {
      fields.push('report_markdown = ?')
      params.push(updates.report_markdown || null)
    }
    if (updates.paragraph_texts !== undefined) {
      fields.push('paragraph_texts = ?')
      params.push(updates.paragraph_texts || null)
    }
    if (updates.paragraph_paraphrases !== undefined) {
      fields.push('paragraph_paraphrases = ?')
      params.push(updates.paragraph_paraphrases || null)
    }
    if (updates.language !== undefined) {
      fields.push('language = ?')
      params.push(updates.language || 'zh')
    }
    if (updates.domain !== undefined) {
      fields.push('domain = ?')
      params.push(updates.domain || 'academic')
    }

    fields.push('updated_at = CURRENT_TIMESTAMP')
    params.push(id)

    await ipcRenderer.invoke('db-execute', {
      sql: `UPDATE aigc_detection_sessions SET ${fields.join(', ')} WHERE id = ?`,
      params
    })
  },

  async delete(id: string): Promise<void> {
    if (!ipcRenderer) throw new Error('IPC渲染器不可用')
    await ipcRenderer.invoke('db-execute', {
      sql: 'DELETE FROM aigc_detection_sessions WHERE id = ?',
      params: [id]
    })
  }
}
