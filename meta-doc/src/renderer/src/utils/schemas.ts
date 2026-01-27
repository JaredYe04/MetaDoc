import { extractOuterJsonString } from './regex-utils';

export interface SchemaDefinition<T = unknown> {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  example?: string;
}

export interface DocumentTitleSchemaResult {
  title: string;
  keywords?: string[];
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
        maxLength: 40,
      },
      keywords: {
        type: 'array',
        description: '可选关键词列表',
        items: {
          type: 'string',
          maxLength: 12,
        },
        maxItems: 5,
      },
    },
  },
  example: '{"title":"周报需求讨论","keywords":["周报","需求"]}',
};

export function buildSchemaPrompt<T>(
  schema: SchemaDefinition<T>,
  instruction: string,
): string {
  const schemaText = JSON.stringify(schema.schema, null, 2);
  const exampleSection = schema.example
    ? `示例输出：\n${schema.example}\n`
    : '';
  return `${instruction}
请严格输出一个符合以下 JSON Schema 的结果，不要添加任何解释或多余文本：
${schemaText}
${exampleSection}`.trim();
}

export function parseSchemaJson<T>(
  rawText: string,
  schema?: SchemaDefinition<T>,
): T {
  const jsonString = extractOuterJsonString(rawText);
  if (!jsonString) {
    throw new Error(
      schema
        ? `未能解析出符合 ${schema.name} 的 JSON 结果`
        : '未能解析出合法的 JSON 结果',
    );
  }
  return JSON.parse(jsonString) as T;
}

// AIGC 检测相关 Schema
export interface AigcDimensionScore {
  sentence_uniformity: number; // 0-10
  lexical_diversity: number; // 0-10
  reasoning_smoothness: number; // 0-10
  personal_trace: number; // 0-10
  stylistic_risk: number; // 0-10
  over_explanation: number; // 0-10
  hedging_pattern: number; // 0-10
}

export interface AigcAnalysisResult extends AigcDimensionScore {
  overall_aigc_risk: number; // 0-100
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  concise_suggestions: string[];
}

export const AIGC_ANALYSIS_SCHEMA: SchemaDefinition<AigcAnalysisResult> = {
  name: 'aigc_analysis_schema_v1',
  description: 'AIGC风格风险评估结果',
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
      'overall_aigc_risk',
      'risk_level',
      'concise_suggestions'
    ],
    properties: {
      sentence_uniformity: {
        type: 'number',
        description: '句式统一性评分（0-10，10表示高度统一）',
        minimum: 0,
        maximum: 10
      },
      lexical_diversity: {
        type: 'number',
        description: '词汇多样性评分（0-10，10表示词汇重复、保守）',
        minimum: 0,
        maximum: 10
      },
      reasoning_smoothness: {
        type: 'number',
        description: '逻辑平滑度评分（0-10，10表示过于平滑）',
        minimum: 0,
        maximum: 10
      },
      personal_trace: {
        type: 'number',
        description: '个人思考痕迹评分（0-10，10表示缺乏个人痕迹）',
        minimum: 0,
        maximum: 10
      },
      stylistic_risk: {
        type: 'number',
        description: '风格风险评分（0-10，10表示高度符合AIGC模板）',
        minimum: 0,
        maximum: 10
      },
      over_explanation: {
        type: 'number',
        description: '过度解释评分（0-10，10表示教科书式解释）',
        minimum: 0,
        maximum: 10
      },
      hedging_pattern: {
        type: 'number',
        description: '模糊限定词使用评分（0-10，10表示大量使用）',
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
    overall_aigc_risk: 78,
    risk_level: 'HIGH',
    concise_suggestions: [
      '增加具体研究背景或个人判断',
      '拆分长句并调整语序',
      '减少模板化过渡语'
    ]
  })
};

