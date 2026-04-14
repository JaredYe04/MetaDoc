/**
 * 文档元数据二进制序列化（与 `.metadoc/doc-meta/*.meta` 磁盘格式一致）
 */

import { serializeMetadataToBase64, deserializeMetadataFromBase64 } from './metadata-serializer'

/**
 * 将元数据序列化为二进制（msgpack / zstd，与 metadata-serializer 一致）
 */
export async function serializeMetadataToBuffer(metadata: any): Promise<Uint8Array> {
  try {
    const base64 = await serializeMetadataToBase64(metadata)
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
 * 从二进制反序列化元数据
 */
export async function deserializeMetadataFromBuffer(buffer: Uint8Array | number[]): Promise<any> {
  try {
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

    const binaryString = Array.from(uint8Buffer, (byte) => String.fromCharCode(byte)).join('')
    const base64 = btoa(binaryString)
    return await deserializeMetadataFromBase64(base64)
  } catch (error) {
    throw new Error(`反序列化元数据失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}
