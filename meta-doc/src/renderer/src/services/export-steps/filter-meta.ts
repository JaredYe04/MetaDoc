/**
 * 过滤元数据步骤（可复用）
 * 从 Markdown 中移除元数据块，供导出前统一使用
 */

import { filterMetaDataFromMd } from '../../utils/md-utils'

/**
 * 过滤 Markdown 中的元数据（如 YAML front matter），返回纯内容
 */
export function filterMetaStep(markdown: string): string {
  return filterMetaDataFromMd(markdown)
}
