/**
 * 主进程元数据序列化服务
 * 使用 msgpack 进行高效的序列化/反序列化，替代 JSON + Base64 的方式
 */

import { encode, decode } from '@msgpack/msgpack'

/**
 * 将对象序列化为 Base64 字符串（使用 msgpack）
 * @param obj 要序列化的对象
 * @returns Base64 编码的字符串
 */
export function serializeMetadataToBase64(obj: any): string {
  try {
    // 使用 msgpack 编码
    const packed = encode(obj)
    // 将 Uint8Array 转换为 Base64 字符串
    const base64 = Buffer.from(packed).toString('base64')
    return base64
  } catch (error) {
    throw new Error(`序列化元数据失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * 将 Base64 字符串反序列化为对象（使用 msgpack，向后兼容旧的 JSON + Base64 格式）
 * @param base64Str Base64 编码的字符串
 * @returns 反序列化后的对象
 */
export function deserializeMetadataFromBase64(base64Str: string): any {
  // 首先尝试使用 msgpack 解码（新格式）
  try {
    const buffer = Buffer.from(base64Str, 'base64')
    const unpacked = decode(buffer)
    return unpacked
  } catch (msgpackError) {
    // 如果 msgpack 解码失败，尝试使用旧的 JSON + Base64 格式（向后兼容）
    try {
      // 旧的 JSON + Base64 格式解码逻辑
      // 1. Base64 解码
      const binaryString = Buffer.from(base64Str, 'base64').toString('binary')

      // 2. 将二进制字符串转换为 URI 编码格式的字符串
      const uriEncoded = Array.prototype.map
        .call(binaryString, (c: string) => {
          return '%' + c.charCodeAt(0).toString(16).padStart(2, '0')
        })
        .join('')

      // 3. URI 解码得到 JSON 字符串
      const jsonStr = decodeURIComponent(uriEncoded)

      // 4. JSON 解析
      return JSON.parse(jsonStr)
    } catch (legacyError) {
      // 如果两种方式都失败，抛出错误
      throw new Error(
        `反序列化元数据失败: msgpack 解码失败 (${msgpackError instanceof Error ? msgpackError.message : String(msgpackError)}), ` +
          `旧的 JSON+Base64 解码也失败 (${legacyError instanceof Error ? legacyError.message : String(legacyError)})`
      )
    }
  }
}
