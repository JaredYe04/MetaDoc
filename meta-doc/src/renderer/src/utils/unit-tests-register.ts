import { registerToolCallParserTests } from './agent-framework/tool-call-parser-tests'
import { registerDatabaseTests } from './database-tests'
import { registerTitleFormatTests } from './title-format-tests'
import { registerSearchReplaceTests } from './search-replace-tests'
import { registerLatexOMMLConversionTests } from './latex-omml-conversion-tests'
import { registerAiSchemaTaskTests } from './ai-schema-task-tests'

export async function registerUnitTests(): Promise<void> {
  // 注册标题格式化测试用例
  registerTitleFormatTests()

  // 注册工具调用解析器测试用例
  registerToolCallParserTests()

  // 注册数据库测试用例
  registerDatabaseTests()

  // 注册查找替换测试用例
  registerSearchReplaceTests()

  // 注册 LaTeX 到 OMML 转换测试用例
  registerLatexOMMLConversionTests()

  // 注册 AI Schema Task 测试用例
  registerAiSchemaTaskTests()
}
