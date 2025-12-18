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
    return await ipcRenderer.invoke('db-query', {
      sql: 'SELECT * FROM data_analysis_sessions ORDER BY updated_at DESC',
      params: []
    }) as DataAnalysisSession[]
  },

  async getById(id: string): Promise<DataAnalysisSession | null> {
    if (!ipcRenderer) throw new Error('IPC渲染器不可用')
    const results = await ipcRenderer.invoke('db-query', {
      sql: 'SELECT * FROM data_analysis_sessions WHERE id = ?',
      params: [id]
    }) as DataAnalysisSession[]
    return results[0] || null
  },

  async create(session: Omit<DataAnalysisSession, 'created_at' | 'updated_at'>): Promise<void> {
    if (!ipcRenderer) throw new Error('IPC渲染器不可用')
    await ipcRenderer.invoke('db-execute', {
      sql: `INSERT INTO data_analysis_sessions 
            (id, title, description, data_file_path, data_format, header_row_index, analysis_result, report_markdown, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      params: [
        session.id,
        session.title,
        session.description || null,
        session.data_file_path || null,
        session.data_format || null,
        session.header_row_index !== undefined ? session.header_row_index : null,
        session.analysis_result || null,
        session.report_markdown || null
      ]
    })
  },

  async update(id: string, updates: Partial<Omit<DataAnalysisSession, 'id' | 'created_at'>>): Promise<void> {
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
    return await ipcRenderer.invoke('db-query', {
      sql: 'SELECT * FROM ocr_sessions ORDER BY updated_at DESC',
      params: []
    }) as OcrSession[]
  },

  async getById(id: string): Promise<OcrSession | null> {
    if (!ipcRenderer) throw new Error('IPC渲染器不可用')
    const results = await ipcRenderer.invoke('db-query', {
      sql: 'SELECT * FROM ocr_sessions WHERE id = ?',
      params: [id]
    }) as OcrSession[]
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
    return await ipcRenderer.invoke('db-query', {
      sql: 'SELECT * FROM attachment_sessions ORDER BY updated_at DESC',
      params: []
    }) as AttachmentSession[]
  },

  async getById(id: string): Promise<AttachmentSession | null> {
    if (!ipcRenderer) throw new Error('IPC渲染器不可用')
    const results = await ipcRenderer.invoke('db-query', {
      sql: 'SELECT * FROM attachment_sessions WHERE id = ?',
      params: [id]
    }) as AttachmentSession[]
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

  async update(id: string, updates: Partial<Omit<AttachmentSession, 'id' | 'created_at'>>): Promise<void> {
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
    return await ipcRenderer.invoke('db-query', {
      sql: 'SELECT * FROM graph_sessions ORDER BY updated_at DESC',
      params: []
    }) as GraphSession[]
  },

  async getById(id: string): Promise<GraphSession | null> {
    if (!ipcRenderer) throw new Error('IPC渲染器不可用')
    const results = await ipcRenderer.invoke('db-query', {
      sql: 'SELECT * FROM graph_sessions WHERE id = ?',
      params: [id]
    }) as GraphSession[]
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

  async update(id: string, updates: Partial<Omit<GraphSession, 'id' | 'created_at'>>): Promise<void> {
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
    return await ipcRenderer.invoke('db-query', {
      sql: 'SELECT * FROM ai_chat_sessions ORDER BY updated_at DESC',
      params: []
    }) as AIChatSession[]
  },

  async getById(id: string): Promise<AIChatSession | null> {
    if (!ipcRenderer) throw new Error('IPC渲染器不可用')
    const results = await ipcRenderer.invoke('db-query', {
      sql: 'SELECT * FROM ai_chat_sessions WHERE id = ?',
      params: [id]
    }) as AIChatSession[]
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

  async update(id: string, updates: Partial<Omit<AIChatSession, 'id' | 'created_at'>>): Promise<void> {
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
      const results = await ipcRenderer.invoke('db-query', {
        sql: "SELECT name FROM sqlite_master WHERE type='table' AND name='ai_chat_sessions'",
        params: []
      }) as Array<{ name: string }>
      return results.length > 0
    } catch {
      return false
    }
  }
}

