/**
 * 图片处理服务
 * 支持三种图片处理模式：
 * 1. original - 保留原始链接
 * 2. base64 - Base64 嵌入（仅 HTML 和 Markdown）
 * 3. folder - 保存到文件夹并更新链接
 */

import { image2base64, local2image } from '../utils/md-utils';
import { createRendererLogger } from '../utils/logger';

const logger = createRendererLogger('ImageProcessor');

export type ImageProcessingMode = 'original' | 'base64' | 'folder';

export interface ImageProcessingOptions {
  mode: ImageProcessingMode;
  // 对于 folder 模式，需要提供目标文件夹路径（在 main 进程中处理）
  targetFolder?: string;
}

/**
 * 处理 Markdown 中的图片
 * @param markdown - 原始 Markdown 内容
 * @param mode - 图片处理模式
 * @param targetFormat - 目标格式
 * @returns 处理后的 Markdown 内容
 */
export async function processMarkdownImages(
  markdown: string,
  mode: ImageProcessingMode,
  targetFormat: 'html' | 'md' | 'tex'
): Promise<string> {
  if (mode === 'original') {
    // 保留原始链接，不做处理
    return markdown;
  }

  if (mode === 'base64') {
    // Base64 嵌入（仅 HTML 和 Markdown 支持）
    if (targetFormat === 'tex') {
      logger.warn('LaTeX 格式不支持 Base64 嵌入，将使用原始链接');
      return markdown;
    }
    
    // 先确保图片是 HTTP URL 格式
    let processed = await local2image(markdown);
    // 然后转换为 Base64
    processed = await image2base64(processed);
    return processed;
  }

  if (mode === 'folder') {
    // 文件夹模式：在导出时由 main 进程处理
    // 这里只确保图片是 HTTP URL 格式，实际保存到文件夹的逻辑在 main 进程
    return await local2image(markdown);
  }

  return markdown;
}

/**
 * 处理 HTML 中的图片
 * @param html - 原始 HTML 内容
 * @param mode - 图片处理模式
 * @returns 处理后的 HTML 内容
 */
export async function processHtmlImages(
  html: string,
  mode: ImageProcessingMode
): Promise<string> {
  if (mode === 'original') {
    return html;
  }

  if (mode === 'base64') {
    // 将 HTML 中的图片 URL 转换为 Base64
    // 提取所有 img 标签的 src
    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    const matches = Array.from(html.matchAll(imgRegex));
    
    let processedHtml = html;
    for (const match of matches) {
      const imgTag = match[0];
      const src = match[1];
      
      // 如果是 HTTP URL，转换为 Base64
      if (src.startsWith('http://localhost:52521/images/')) {
        try {
          const response = await fetch(src);
          if (!response.ok) continue;
          
          const blob = await response.blob();
          const reader = new FileReader();
          const dataUrl = await new Promise<string>((resolve, reject) => {
            reader.onload = () => {
              if (reader.result && typeof reader.result === 'string') {
                resolve(reader.result);
              } else {
                reject(new Error('读取图片数据失败'));
              }
            };
            reader.onerror = () => reject(new Error('FileReader 错误'));
            reader.readAsDataURL(blob);
          });
          
          // 替换 src
          processedHtml = processedHtml.replace(imgTag, imgTag.replace(src, dataUrl));
        } catch (error) {
          logger.warn(`转换图片失败: ${src}`, error);
        }
      }
    }
    
    return processedHtml;
  }

  if (mode === 'folder') {
    // 文件夹模式：在导出时由 main 进程处理
    // 这里不做处理，保持 HTTP URL
    return html;
  }

  return html;
}

/**
 * 提取 Markdown 中的所有图片 URL
 */
export function extractImageUrls(markdown: string): string[] {
  const urls: string[] = [];
  const regex = /!\[.*?\]\((.*?)\)/g;
  let match;
  
  while ((match = regex.exec(markdown)) !== null) {
    const url = match[1];
    if (url.startsWith('http://localhost:52521/images/')) {
      urls.push(url);
    }
  }
  
  return urls;
}

/**
 * 提取 HTML 中的所有图片 URL
 */
export function extractImageUrlsFromHtml(html: string): string[] {
  const urls: string[] = [];
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  const matches = Array.from(html.matchAll(imgRegex));
  
  for (const match of matches) {
    const src = match[1];
    if (src.startsWith('http://localhost:52521/images/')) {
      urls.push(src);
    }
  }
  
  return urls;
}

