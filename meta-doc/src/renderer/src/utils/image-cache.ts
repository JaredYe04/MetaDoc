/**
 * 图片缓存工具
 * 使用 Cache API 缓存从服务器获取的图片
 */

import { createRendererLogger } from "./logger.ts";

const CACHE_NAME = 'metadoc-image-cache-v1';

// 懒加载logger，避免初始化顺序问题
let loggerInstance: ReturnType<typeof createRendererLogger> | null = null;

function getLogger() {
  if (!loggerInstance) {
    loggerInstance = createRendererLogger('ImageCache');
  }
  return loggerInstance;
}

/**
 * 初始化缓存
 */
async function initCache(): Promise<Cache> {
  try {
    return await caches.open(CACHE_NAME);
  } catch (error) {
    getLogger().error('初始化图片缓存失败:', error);
    throw error;
  }
}

/**
 * 从缓存中获取图片 URL
 * @param imageUrl 原始图片 URL
 * @returns 缓存的图片 URL（blob URL）或 null
 */
export async function getCachedImageUrl(imageUrl: string): Promise<string | null> {
  if (!imageUrl) {
    return null;
  }

  try {
    const cache = await initCache();
    const cachedResponse = await cache.match(imageUrl);
    
    if (cachedResponse) {
      const blob = await cachedResponse.blob();
      const blobUrl = URL.createObjectURL(blob);
      getLogger().debug('从缓存获取图片:', imageUrl);
      return blobUrl;
    }
    
    return null;
  } catch (error) {
    getLogger().error('获取缓存图片失败:', error);
    return null;
  }
}

/**
 * 缓存图片 URL
 * @param imageUrl 原始图片 URL
 * @param imageData 图片数据（可选，如果不提供则从 URL 获取）
 */
export async function cacheImageUrl(imageUrl: string, imageData?: Blob | Response): Promise<void> {
  if (!imageUrl) {
    return;
  }

  try {
    const cache = await initCache();
    
    // 检查是否已缓存
    const existing = await cache.match(imageUrl);
    if (existing) {
      getLogger().debug('图片已缓存，跳过:', imageUrl);
      return;
    }

    let response: Response;
    
    if (imageData) {
      // 如果提供了图片数据，直接使用
      if (imageData instanceof Response) {
        response = imageData;
      } else {
        response = new Response(imageData, {
          headers: {
            'Content-Type': imageData.type || 'image/jpeg',
          },
        });
      }
    } else {
      // 从 URL 获取图片
      try {
        response = await fetch(imageUrl, {
          mode: 'cors',
          credentials: 'omit',
        });
        
        if (!response.ok) {
          getLogger().warn('获取图片失败:', imageUrl, response.status);
          return;
        }
      } catch (fetchError) {
        getLogger().error('获取图片时出错:', fetchError);
        return;
      }
    }

    // 存储到缓存
    await cache.put(imageUrl, response.clone());
    getLogger().debug('图片已缓存:', imageUrl);
  } catch (error) {
    getLogger().error('缓存图片失败:', error);
  }
}

/**
 * 获取图片 URL（带缓存）
 * 如果缓存中有，返回缓存的 blob URL；否则从服务器获取并缓存
 * @param imageUrl 原始图片 URL
 * @returns 图片 URL（可能是 blob URL 或原始 URL）
 */
export async function getImageUrlWithCache(imageUrl: string): Promise<string | null> {
  if (!imageUrl) {
    return null;
  }

  // 先检查缓存
  const cachedUrl = await getCachedImageUrl(imageUrl);
  if (cachedUrl) {
    return cachedUrl;
  }

  // 缓存中没有，从服务器获取并缓存
  await cacheImageUrl(imageUrl);
  
  // 再次从缓存获取（现在应该有了）
  const newCachedUrl = await getCachedImageUrl(imageUrl);
  if (newCachedUrl) {
    return newCachedUrl;
  }

  // 如果缓存失败，返回原始 URL
  return imageUrl;
}

/**
 * 清除所有图片缓存
 */
export async function clearImageCache(): Promise<void> {
  try {
    const deleted = await caches.delete(CACHE_NAME);
    if (deleted) {
      getLogger().info('图片缓存已清除');
    }
  } catch (error) {
    getLogger().error('清除图片缓存失败:', error);
  }
}

