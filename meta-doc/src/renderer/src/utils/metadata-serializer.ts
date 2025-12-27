/**
 * 元数据序列化工具
 * 使用 msgpack 序列化 + zstd 压缩，替代 JSON + Base64 的方式
 * 向后兼容：zstd+msgpack（新格式）、msgpack（旧格式）、JSON+Base64（最旧格式）
 */

import { encode, decode } from '@msgpack/msgpack';
import { ZstdInit, ZstdSimple } from '@oneidentity/zstd-js';

// zstd 库初始化状态
let zstdInitialized = false;
let zstdInitPromise: Promise<void> | null = null;

/**
 * 初始化 zstd 库（懒加载，只在第一次使用时初始化）
 */
async function ensureZstdInitialized(): Promise<void> {
  if (zstdInitialized) {
    return;
  }
  
  if (zstdInitPromise) {
    return zstdInitPromise;
  }
  
  zstdInitPromise = ZstdInit().then(() => {
    zstdInitialized = true;
  });
  
  return zstdInitPromise;
}

/**
 * 将对象序列化为 Base64 字符串（使用 msgpack + zstd 压缩）
 * @param obj 要序列化的对象
 * @returns Base64 编码的字符串
 */
export async function serializeMetadataToBase64(obj: any): Promise<string> {
  try {
    // 1. 使用 msgpack 编码
    const packed = encode(obj);
    
    // 2. 使用 zstd 压缩
    await ensureZstdInitialized();
    const compressed = ZstdSimple.compress(packed);
    
    // 3. 将 Uint8Array 转换为 Base64 字符串
    const binaryString = Array.from(compressed, byte => String.fromCharCode(byte)).join('');
    const base64 = btoa(binaryString);
    return base64;
  } catch (error) {
    throw new Error(`序列化元数据失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 将 Base64 字符串反序列化为对象
 * 向后兼容多种格式：
 * 1. zstd 压缩 + msgpack（新格式）
 * 2. msgpack（旧格式，没有 zstd）
 * 3. JSON + Base64（最旧格式）
 * 
 * @param base64Str Base64 编码的字符串
 * @returns 反序列化后的对象
 */
export async function deserializeMetadataFromBase64(base64Str: string): Promise<any> {
  // 将 Base64 字符串转换为 Uint8Array
  const binaryString = atob(base64Str);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  // 尝试格式1：zstd 压缩 + msgpack（新格式）
  try {
    await ensureZstdInitialized();
    const decompressed = ZstdSimple.decompress(bytes);
    const unpacked = decode(decompressed);
    return unpacked;
  } catch (zstdMsgpackError) {
    // 如果 zstd+msgpack 失败，尝试格式2：msgpack（没有 zstd 压缩）
    try {
      const unpacked = decode(bytes);
      return unpacked;
    } catch (msgpackError) {
      // 如果 msgpack 也失败，尝试格式3：旧的 JSON + Base64 格式
      try {
        // 旧的 JSON + Base64 格式解码逻辑
        // 1. Base64 解码（已经做了）
        // 2. 将二进制字符串转换为 URI 编码格式的字符串
        const uriEncoded = Array.prototype.map.call(binaryString, (c: string) => {
          return '%' + c.charCodeAt(0).toString(16).padStart(2, '0');
        }).join('');
        
        // 3. URI 解码得到 JSON 字符串
        const jsonStr = decodeURIComponent(uriEncoded);
        
        // 4. JSON 解析
        return JSON.parse(jsonStr);
      } catch (legacyError) {
        // 如果所有方式都失败，抛出错误
        throw new Error(
          `反序列化元数据失败: zstd+msgpack 解码失败, msgpack 解码失败 (${msgpackError instanceof Error ? msgpackError.message : String(msgpackError)}), ` +
          `旧的 JSON+Base64 解码也失败 (${legacyError instanceof Error ? legacyError.message : String(legacyError)})`
        );
      }
    }
  }
}
