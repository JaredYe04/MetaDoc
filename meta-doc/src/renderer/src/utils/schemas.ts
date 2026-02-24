import { extractOuterJsonString } from './regex-utils'

export interface SchemaDefinition<T = unknown> {
  name: string
  description: string
  schema: Record<string, unknown>
  example?: string
}

export interface DocumentTitleSchemaResult {
  title: string
  keywords?: string[]
}

export const DOCUMENT_TITLE_SCHEMA: SchemaDefinition<DocumentTitleSchemaResult> = {
  name: 'document_title_schema_v1',
  description: '生成对话标题以及可选的关键词列表',
  schema: {
    type: 'object',
    required: ['title'],
    properties: {
      title: {
        type: 'string',
        description: '简洁明了的对话标题，避免标点，建议 4-20 个字符',
        maxLength: 40
      },
      keywords: {
        type: 'array',
        description: '可选关键词列表',
        items: {
          type: 'string',
          maxLength: 12
        },
        maxItems: 5
      }
    }
  },
  example: '{"title":"周报需求讨论","keywords":["周报","需求"]}'
}

/** 大纲章节推荐关键词（根据本节标题与整体大纲生成，用于指导 AI 撰写） */
export interface OutlineSectionKeywordsResult {
  keywords: string[]
}

export const OUTLINE_SECTION_KEYWORDS_SCHEMA: SchemaDefinition<OutlineSectionKeywordsResult> = {
  name: 'outline_section_keywords_schema_v1',
  description: '根据本节标题与整体大纲生成推荐关键词列表',
  schema: {
    type: 'object',
    required: ['keywords'],
    properties: {
      keywords: {
        type: 'array',
        description:
          '推荐关键词，用于指导本节内容风格与重点，如：严谨、学术风、抒情、创意、计算机等',
        items: {
          type: 'string',
          maxLength: 12
        },
        minItems: 3,
        maxItems: 10
      }
    }
  },
  example: '{"keywords":["严谨","学术风","计算机"]}'
}

export function buildSchemaPrompt<T>(schema: SchemaDefinition<T>, instruction: string): string {
  const schemaText = JSON.stringify(schema.schema, null, 2)
  const exampleSection = schema.example ? `示例输出：\n${schema.example}\n` : ''
  return `${instruction}
请严格输出一个符合以下 JSON Schema 的结果，不要添加任何解释或多余文本：
${schemaText}
${exampleSection}`.trim()
}

export function parseSchemaJson<T>(rawText: string, schema?: SchemaDefinition<T>): T {
  const jsonString = extractOuterJsonString(rawText)
  if (!jsonString) {
    throw new Error(
      schema ? `未能解析出符合 ${schema.name} 的 JSON 结果` : '未能解析出合法的 JSON 结果'
    )
  }
  return JSON.parse(jsonString) as T
}

// AIGC 检测相关 Schema
// 统一方向：所有维度均为 0-10，分数越高表示该维度上越像 AIGC、风险越大（无反向指标）
export interface AigcDimensionScore {
  sentence_uniformity: number
  /** 词汇重复/保守程度，10=重复保守=高 AIGC 风险（勿与“多样性”混淆：高分=低多样性=风险） */
  lexical_diversity: number
  reasoning_smoothness: number
  personal_trace: number
  stylistic_risk: number
  over_explanation: number
  hedging_pattern: number
  // 新增：更细致地判断 AIGC 可能性
  opening_transition_pattern: number // 开头与过渡语模板化（首先、其次、综上所述等）
  structural_repetition: number // 结构重复（段落/句式过于规整）
  abstractness: number // 抽象与空洞（缺乏具体例证）
  emotional_flatness: number // 情感平淡（缺乏情绪起伏）
  formulaic_closure: number // 套路化收尾（总结/展望/建议三板斧）
}

/** 各维度权重（用于加权计算总体风险），权重越高该维度对 AIGC 判定的影响越大 */
export const AIGC_DIMENSION_WEIGHTS: Record<keyof AigcDimensionScore, number> = {
  sentence_uniformity: 1.0,
  lexical_diversity: 1.0,
  reasoning_smoothness: 1.0,
  personal_trace: 1.15,
  stylistic_risk: 1.2,
  over_explanation: 1.2,
  hedging_pattern: 1.0,
  opening_transition_pattern: 1.15,
  structural_repetition: 1.1,
  abstractness: 1.1,
  emotional_flatness: 1.05,
  formulaic_closure: 1.15
}

/** 高分放大：幂次（>1 时高分维度对基础分放大更明显） */
export const AIGC_POWER_MEAN_P = 1.5
/** 一票否决阈值：任一维度 ≥ 该值时触发额外加分 */
export const AIGC_VETO_THRESHOLD = 7
/** 一票否决加分系数：bonus = AIGC_VETO_BONUS_FACTOR * (max - threshold)^2 */
export const AIGC_VETO_BONUS_FACTOR = 5

export interface AigcAnalysisResult extends AigcDimensionScore {
  overall_aigc_risk: number // 0-100
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH'
  concise_suggestions: string[]
}

export const AIGC_ANALYSIS_SCHEMA: SchemaDefinition<AigcAnalysisResult> = {
  name: 'aigc_analysis_schema_v2',
  description: 'AIGC风格风险评估结果（多维度加权）',
  schema: {
    type: 'object',
    required: [
      'sentence_uniformity',
      'lexical_diversity',
      'reasoning_smoothness',
      'personal_trace',
      'stylistic_risk',
      'over_explanation',
      'hedging_pattern',
      'opening_transition_pattern',
      'structural_repetition',
      'abstractness',
      'emotional_flatness',
      'formulaic_closure',
      'overall_aigc_risk',
      'risk_level',
      'concise_suggestions'
    ],
    properties: {
      sentence_uniformity: {
        type: 'number',
        description: '句式统一性评分（0-10，10表示越统一，AIGC风险越高）',
        minimum: 0,
        maximum: 10
      },
      lexical_diversity: {
        type: 'number',
        description: '词汇重复/保守程度评分（0-10，10表示词汇越重复、保守，AIGC风险越高）',
        minimum: 0,
        maximum: 10
      },
      reasoning_smoothness: {
        type: 'number',
        description: '逻辑平滑度评分（0-10，10表示越平滑，AIGC风险越高）',
        minimum: 0,
        maximum: 10
      },
      personal_trace: {
        type: 'number',
        description: '个人思考痕迹缺失程度（0-10，10表示越缺乏个人痕迹，AIGC风险越高）',
        minimum: 0,
        maximum: 10
      },
      stylistic_risk: {
        type: 'number',
        description: '风格风险评分（0-10，10表示越符合AIGC模板，风险越高）',
        minimum: 0,
        maximum: 10
      },
      over_explanation: {
        type: 'number',
        description: '过度解释评分（0-10，10表示越教科书式解释，AIGC风险越高）',
        minimum: 0,
        maximum: 10
      },
      hedging_pattern: {
        type: 'number',
        description: '模糊限定词使用评分（0-10，10表示使用越多，AIGC风险越高）',
        minimum: 0,
        maximum: 10
      },
      opening_transition_pattern: {
        type: 'number',
        description: '过渡语模板化评分（0-10，10表示模板化过渡越多，AIGC风险越高）',
        minimum: 0,
        maximum: 10
      },
      structural_repetition: {
        type: 'number',
        description: '结构重复评分（0-10，10表示结构越规整重复，AIGC风险越高）',
        minimum: 0,
        maximum: 10
      },
      abstractness: {
        type: 'number',
        description: '抽象与空洞评分（0-10，10表示越泛泛而谈、缺乏例证，AIGC风险越高）',
        minimum: 0,
        maximum: 10
      },
      emotional_flatness: {
        type: 'number',
        description: '情感平淡评分（0-10，10表示越缺乏情绪起伏，AIGC风险越高）',
        minimum: 0,
        maximum: 10
      },
      formulaic_closure: {
        type: 'number',
        description: '套路化收尾评分（0-10，10表示结尾越套路化，AIGC风险越高）',
        minimum: 0,
        maximum: 10
      },
      overall_aigc_risk: {
        type: 'number',
        description: '总体AIGC风险评分（0-100）',
        minimum: 0,
        maximum: 100
      },
      risk_level: {
        type: 'string',
        enum: ['LOW', 'MEDIUM', 'HIGH'],
        description: '风险等级'
      },
      concise_suggestions: {
        type: 'array',
        items: {
          type: 'string'
        },
        description: '简洁的修改建议'
      }
    }
  },
  example: JSON.stringify({
    sentence_uniformity: 8,
    lexical_diversity: 6,
    reasoning_smoothness: 9,
    personal_trace: 3,
    stylistic_risk: 8,
    over_explanation: 7,
    hedging_pattern: 6,
    opening_transition_pattern: 7,
    structural_repetition: 6,
    abstractness: 5,
    emotional_flatness: 7,
    formulaic_closure: 8,
    overall_aigc_risk: 72,
    risk_level: 'HIGH',
    concise_suggestions: ['增加具体研究背景或个人判断', '拆分长句并调整语序', '减少模板化过渡语']
  })
}
