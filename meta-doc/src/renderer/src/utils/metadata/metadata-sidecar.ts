/**
 * 元信息Sidecar文件工具
 * 用于读写隐藏的伴生文件（.filename.meta）
 * 复用 metadata-serializer.ts 中的序列化/反序列化逻辑，确保与嵌入注释的逻辑完全一致
 */

import { serializeMetadataToBase64, deserializeMetadataFromBase64 } from './metadata-serializer'

/**
 * 生成Sidecar文件路径
 * 在渲染进程中使用简单的字符串操作，避免依赖Node.js的path模块
 * @param filePath 原始文件路径
 * @returns Sidecar文件路径
 */
export function getSidecarPath(filePath: string): string {
  // 使用简单的字符串操作，兼容Windows和Unix路径
  const lastSeparator = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))

  if (lastSeparator === -1) {
    // 没有路径分隔符，只有文件名
    return `.${filePath}.meta`
  }

  const dir = filePath.substring(0, lastSeparator + 1)
  const basename = filePath.substring(lastSeparator + 1)
  return `${dir}.${basename}.meta`
}

/**
 * 将元数据序列化为二进制Buffer（复用metadata-serializer的逻辑）
 * @param metadata 要序列化的元数据对象
 * @returns Uint8Array 二进制数据
 */
export async function serializeMetadataToBuffer(metadata: any): Promise<Uint8Array> {
  try {
    // 复用已有的序列化逻辑：先序列化为Base64，再转换为Uint8Array
    // 这样可以确保与嵌入注释的逻辑完全一致
    const base64 = await serializeMetadataToBase64(metadata)

    // 将Base64字符串转换为Uint8Array
    const binaryString = atob(base64)
    const result = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      result[i] = binaryString.charCodeAt(i)
    }

    return result
  } catch (error) {
    throw new Error(`序列化元数据失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * 从二进制Buffer反序列化元数据（复用metadata-serializer的逻辑）
 * @param buffer Uint8Array 或 number[] 二进制数据
 * @returns 反序列化后的元数据对象
 */
export async function deserializeMetadataFromBuffer(buffer: Uint8Array | number[]): Promise<any> {
  try {
    // 将buffer转换为Uint8Array
    let uint8Buffer: Uint8Array
    if (buffer instanceof Uint8Array) {
      uint8Buffer = buffer
    } else if (Array.isArray(buffer)) {
      uint8Buffer = new Uint8Array(buffer)
    } else {
      throw new Error('Unsupported buffer type')
    }

    if (uint8Buffer.length === 0) {
      throw new Error('Buffer为空')
    }

    // 将Uint8Array转换为Base64字符串，然后复用已有的反序列化逻辑
    // 这样可以确保与嵌入注释的逻辑完全一致
    const binaryString = Array.from(uint8Buffer, (byte) => String.fromCharCode(byte)).join('')
    const base64 = btoa(binaryString)

    // 复用已有的反序列化逻辑
    return await deserializeMetadataFromBase64(base64)
  } catch (error) {
    throw new Error(`反序列化元数据失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}
