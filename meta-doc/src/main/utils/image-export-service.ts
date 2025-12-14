/**
 * 图片导出服务（Main 进程）
 * 负责将图片保存到导出文件夹
 */

import fs from 'fs';
import path from 'path';
import http from 'http';
import { createMainLogger } from '../logger';
import { imageUploadDir } from '../express-server';

const logger = createMainLogger('ImageExportService');

export interface ImageExportResult {
  originalUrl: string;
  savedPath: string;
  relativePath: string;
}

/**
 * 将图片保存到指定文件夹
 * @param imageUrl - 图片 URL（http://localhost:52521/images/filename）
 * @param targetFolder - 目标文件夹路径
 * @param imageName - 图片文件名（可选，如果不提供则从 URL 提取）
 * @returns 保存结果
 */
export async function saveImageToFolder(
  imageUrl: string,
  targetFolder: string,
  imageName?: string
): Promise<ImageExportResult> {
  try {
    // 确保目标文件夹存在
    if (!fs.existsSync(targetFolder)) {
      fs.mkdirSync(targetFolder, { recursive: true });
    }

    // 从 URL 提取文件名
    let fileName = imageName;
    if (!fileName) {
      if (imageUrl.startsWith('http://localhost:52521/images/')) {
        fileName = imageUrl.replace('http://localhost:52521/images/', '');
      } else {
        fileName = path.basename(imageUrl);
      }
    }

    // 清理文件名（移除非法字符）
    fileName = sanitizeFileName(fileName);

    // 构建目标路径
    const targetPath = path.join(targetFolder, fileName);

    // 尝试从本地文件系统读取
    let imageBuffer: Buffer | null = null;
    
    // 首先尝试从 imageUploadDir 读取
    if (imageUrl.startsWith('http://localhost:52521/images/')) {
      const localFileName = imageUrl.replace('http://localhost:52521/images/', '');
      const localPath = path.join(imageUploadDir, localFileName);
      
      if (fs.existsSync(localPath)) {
        imageBuffer = fs.readFileSync(localPath);
        logger.debug(`从本地文件系统读取图片: ${localPath}`);
      }
    }

    // 如果本地文件不存在，尝试通过 HTTP 下载
    if (!imageBuffer) {
      try {
        imageBuffer = await downloadImage(imageUrl);
        logger.debug(`通过 HTTP 下载图片: ${imageUrl}`);
      } catch (error) {
        logger.error(`下载图片失败: ${imageUrl}`, error);
        throw new Error(`无法获取图片: ${imageUrl}`);
      }
    }

    // 保存文件
    fs.writeFileSync(targetPath, imageBuffer);
    logger.info(`图片已保存到: ${targetPath}`);

    // 返回绝对路径
    const absolutePath = path.resolve(targetPath);

    return {
      originalUrl: imageUrl,
      savedPath: targetPath,
      relativePath: absolutePath, // 使用绝对路径
    };
  } catch (error) {
    logger.error(`保存图片失败: ${imageUrl}`, error);
    throw error;
  }
}

/**
 * 批量保存图片到文件夹
 */
export async function saveImagesToFolder(
  imageUrls: string[],
  targetFolder: string
): Promise<ImageExportResult[]> {
  const results: ImageExportResult[] = [];
  
  for (const url of imageUrls) {
    try {
      const result = await saveImageToFolder(url, targetFolder);
      results.push(result);
    } catch (error) {
      logger.error(`保存图片失败: ${url}`, error);
      // 继续处理其他图片
    }
  }
  
  return results;
}

/**
 * 通过 HTTP 下载图片
 */
function downloadImage(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    http.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      const chunks: Buffer[] = [];
      response.on('data', (chunk) => {
        chunks.push(chunk);
      });
      response.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
      response.on('error', (error) => {
        reject(error);
      });
    }).on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * 清理文件名，移除非法字符
 */
function sanitizeFileName(fileName: string): string {
  // 移除 Windows 不允许的字符
  return fileName
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .trim();
}

/**
 * 更新 Markdown 中的图片链接
 * @param markdown - 原始 Markdown
 * @param imageMappings - 图片 URL 到绝对路径的映射
 * @returns 更新后的 Markdown
 */
export function updateMarkdownImageLinks(
  markdown: string,
  imageMappings: Map<string, string>
): string {
  let updated = markdown;
  const regex = /!\[.*?\]\((.*?)\)/g;
  
  updated = updated.replace(regex, (match, imageUrl) => {
    const absolutePath = imageMappings.get(imageUrl);
    if (absolutePath) {
      // 使用绝对路径，转换为 file:// 协议格式
      // Windows: file:///C:/path/to/file
      // Unix: file:///path/to/file
      const normalizedPath = path.resolve(absolutePath).replace(/\\/g, '/');
      // 确保路径以 / 开头（Windows 的 C: 会被转换为 /C:）
      const fileUrl = normalizedPath.startsWith('/') 
        ? `file://${normalizedPath}` 
        : `file:///${normalizedPath}`;
      return match.replace(imageUrl, fileUrl);
    }
    return match;
  });
  
  return updated;
}

/**
 * 更新 HTML 中的图片链接
 * @param html - 原始 HTML
 * @param imageMappings - 图片 URL 到绝对路径的映射
 * @returns 更新后的 HTML
 */
export function updateHtmlImageLinks(
  html: string,
  imageMappings: Map<string, string>
): string {
  let updated = html;
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  
  updated = updated.replace(imgRegex, (match, src) => {
    const absolutePath = imageMappings.get(src);
    if (absolutePath) {
      // 使用绝对路径，转换为 file:// 协议格式
      // Windows: file:///C:/path/to/file
      // Unix: file:///path/to/file
      const normalizedPath = path.resolve(absolutePath).replace(/\\/g, '/');
      // 确保路径以 / 开头（Windows 的 C: 会被转换为 /C:）
      const fileUrl = normalizedPath.startsWith('/') 
        ? `file://${normalizedPath}` 
        : `file:///${normalizedPath}`;
      return match.replace(src, fileUrl);
    }
    return match;
  });
  
  return updated;
}

/**
 * 更新 LaTeX 中的图片链接
 * @param latex - 原始 LaTeX
 * @param imageMappings - 图片 URL 到绝对路径的映射
 * @returns 更新后的 LaTeX
 */
export function updateLatexImageLinks(
  latex: string,
  imageMappings: Map<string, string>
): string {
  let updated = latex;
  
  // LaTeX 中的图片通常使用 \includegraphics{path}
  const graphicsRegex = /\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/g;
  
  updated = updated.replace(graphicsRegex, (match, imagePath) => {
    // 检查是否是 HTTP URL
    if (imagePath.startsWith('http://localhost:52521/images/')) {
      const absolutePath = imageMappings.get(imagePath);
      if (absolutePath) {
        // LaTeX 路径使用正斜杠，移除扩展名（如果存在）
        const latexPath = absolutePath.replace(/\\/g, '/').replace(/\.[^.]+$/, '');
        return match.replace(imagePath, latexPath);
      }
    }
    return match;
  });
  
  return updated;
}

