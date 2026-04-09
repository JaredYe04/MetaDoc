/**
 * 应用内单元测试注册（供「设置 → 调试 → 单元测试」批量运行）。
 * 相同用例已迁移至 Vitest：在项目根目录执行 npm run test 运行。
 */
import { registerToolCallParserTests } from '../agent-framework/tool-call-parser-tests'
import { registerDatabaseTests } from './database-tests'
import { registerTitleFormatTests } from '../text/title-format-tests'
import { registerSearchReplaceTests } from './search-replace-tests'
import { registerLatexOMMLConversionTests } from './latex-omml-conversion-tests'
import { registerAiSchemaTaskTests } from '../ai/ai-schema-task-tests'

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
