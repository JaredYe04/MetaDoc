/**
 * 元数据序列化工具（`.metadoc/doc-meta/*.meta` 等二进制格式）
 * 写入：msgpack；较大时用 zstd 压缩并加 0x01 前缀，较小时 0x00 + 原始 msgpack。
 * 读取：兼容 0x01/0x00 标记、无标记 zstd、纯 msgpack、旧 JSON+Base64。
 *
 * 注意：Agent 工作区会话 .msess 不使用本文件的写入路径，见 agent-workspace-persistence（仅 msgpack）。
 */

import { encode, decode } from '@msgpack/msgpack'
import { ZstdInit, ZstdSimple } from '@oneidentity/zstd-js'

// zstd 库初始化状态
let zstdInitialized = false
let zstdInitPromise: Promise<void> | null = null

/**
 * 初始化 zstd 库（懒加载，只在第一次使用时初始化）
 */
async function ensureZstdInitialized(): Promise<void> {
  if (zstdInitialized) {
    return
  }

  if (zstdInitPromise) {
    return zstdInitPromise
  }

  zstdInitPromise = ZstdInit().then(() => {
    zstdInitialized = true
  })

  return zstdInitPromise
}

/**
 * 将对象序列化为 Base64 字符串（msgpack；足够大时 zstd 压缩，与 Sidecar 一致）
 * @param obj 要序列化的对象
 * @returns Base64 编码的字符串
 */
export async function serializeMetadataToBase64(obj: any): Promise<string> {
  try {
    const packed = encode(obj)
    const MIN_ZSTD_LENGTH = 100
    if (packed.length < MIN_ZSTD_LENGTH) {
      const result = new Uint8Array(packed.length + 1)
      result[0] = 0x00
      result.set(packed, 1)
      const binaryString = Array.from(result, (byte) => String.fromCharCode(byte)).join('')
      return btoa(binaryString)
    }
    await ensureZstdInitialized()
    const compressed = ZstdSimple.compress(packed)
    const result = new Uint8Array(compressed.length + 1)
    result[0] = 0x01
    result.set(compressed, 1)
    const binaryString = Array.from(result, (byte) => String.fromCharCode(byte)).join('')
    return btoa(binaryString)
  } catch (error) {
    throw new Error(`序列化元数据失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * 将 Base64 字符串反序列化为对象
 * 向后兼容多种格式：
 * 1. 带标记的格式：
 *    - 0x01: zstd + msgpack（Sidecar 等大体积写入）
 *    - 0x00: 未压缩 msgpack（小体积 Sidecar，或 Agent .msess 专用写入）
 * 2. zstd 压缩 + msgpack（旧格式，没有标记）
 * 3. msgpack（旧格式，没有 zstd）
 * 4. JSON + Base64（最旧格式）
 *
 * @param base64Str Base64 编码的字符串
 * @returns 反序列化后的对象
 */
export async function deserializeMetadataFromBase64(base64Str: string): Promise<any> {
  // 将 Base64 字符串转换为 Uint8Array
  const binaryString = atob(base64Str)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }

  // 检查是否有标记字节（新格式）
  if (bytes.length > 0) {
    const flag = bytes[0]

    // 格式1a：标记为 0x01，表示 zstd 压缩 + msgpack
    if (flag === 0x01) {
      try {
        await ensureZstdInitialized()
        const compressed = bytes.slice(1)
        const decompressed = ZstdSimple.decompress(compressed)
        const unpacked = decode(decompressed)
        return unpacked
      } catch (error) {
        throw new Error(
          `反序列化元数据失败: zstd 解压失败 (${error instanceof Error ? error.message : String(error)})`
        )
      }
    }

    // 格式1b：标记为 0x00，表示未压缩的 msgpack（数据太小）
    if (flag === 0x00) {
      try {
        const packed = bytes.slice(1)
        const unpacked = decode(packed)
        return unpacked
      } catch (error) {
        throw new Error(
          `反序列化元数据失败: msgpack 解码失败 (${error instanceof Error ? error.message : String(error)})`
        )
      }
    }
  }

  // 尝试格式2：zstd 压缩 + msgpack（旧格式，没有标记）
  try {
    await ensureZstdInitialized()
    const decompressed = ZstdSimple.decompress(bytes)
    const unpacked = decode(decompressed)
    return unpacked
  } catch (zstdMsgpackError) {
    // 如果 zstd+msgpack 失败，尝试格式3：msgpack（没有 zstd 压缩）
    try {
      const unpacked = decode(bytes)
      return unpacked
    } catch (msgpackError) {
      // 如果 msgpack 也失败，尝试格式4：旧的 JSON + Base64 格式
      try {
        // 旧的 JSON + Base64 格式解码逻辑
        // 1. Base64 解码（已经做了）
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
        // 如果所有方式都失败，抛出错误
        throw new Error(
          `反序列化元数据失败: 带标记格式解码失败, zstd+msgpack 解码失败, msgpack 解码失败 (${msgpackError instanceof Error ? msgpackError.message : String(msgpackError)}), ` +
            `旧的 JSON+Base64 解码也失败 (${legacyError instanceof Error ? legacyError.message : String(legacyError)})`
        )
      }
    }
  }
}
