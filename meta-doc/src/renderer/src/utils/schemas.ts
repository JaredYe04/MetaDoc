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

