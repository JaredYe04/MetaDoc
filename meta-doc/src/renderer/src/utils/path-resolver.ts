/**
 * 路径解析服务
 * 提供统一的相对路径转绝对路径功能
 * 支持 linkBase + 相对路径的组合解析
 * 在渲染进程中直接解析，不依赖 IPC
 */

import { createRendererLogger } from './logger';

// 懒加载 logger
let loggerInstance: ReturnType<typeof createRendererLogger> | null = null;

function getLogger() {
  if (!loggerInstance) {
    loggerInstance = createRendererLogger('PathResolver');
  }
  return loggerInstance;
}

/**
 * 规范化路径分隔符（统一使用 /）
 * @param path 路径字符串
 * @returns 规范化后的路径
 */
function normalizeSeparator(path: string): string {
  return path.replace(/\\/g, '/');
}

/**
 * 检查路径是否是相对路径
 * 通过检查路径是否以绝对路径标识符开头来判断
 * @param path 路径字符串
 * @returns 是否是相对路径
 */
export function isRelativePath(path: string): boolean {
  if (!path) return false;
  
  // 如果是绝对路径，返回 false
  if (isAbsolutePath(path)) {
    return false;
  }
  
  // 其他情况都是相对路径
  return true;
}

/**
 * 检查路径是否是绝对路径
 * @param path 路径字符串
 * @returns 是否是绝对路径
 */
export function isAbsolutePath(path: string): boolean {
  if (!path) return false;
  
  // Windows 绝对路径：C:\ 或 D:\ 等（驱动器号 + 冒号 + 分隔符）
  if (/^[A-Za-z]:[\\/]/.test(path)) {
    return true;
  }
  
  // Unix 绝对路径：/ 开头（但不是 ./ 或 ../）
  if (path.startsWith('/') && !path.startsWith('./') && !path.startsWith('../')) {
    return true;
  }
  
  // file:// URL
  if (path.startsWith('file://')) {
    return true;
  }
  
  return false;
}

/**
 * 解析路径组件（处理 . 和 ..）
 * 类似 Node.js path.resolve() 的逻辑，但适用于浏览器环境
 * @param pathComponents 路径组件数组
 * @returns 解析后的路径组件数组
 */
function resolvePathComponents(pathComponents: string[]): string[] {
  const resolved: string[] = [];
  
  for (const component of pathComponents) {
    if (component === '' || component === '.') {
      // 空字符串或 . 表示当前目录，忽略
      continue;
    } else if (component === '..') {
      // .. 表示上一级目录，移除最后一个组件
      if (resolved.length > 0) {
        resolved.pop();
      }
    } else {
      // 普通路径组件，添加到结果中
      resolved.push(component);
    }
  }
  
  return resolved;
}

/**
 * 解析相对路径为绝对路径
 * 使用通用的路径解析算法，支持各种相对路径格式
 * 如果输入是绝对路径，直接返回原文
 * @param relativePath 相对路径（可以是 ./image.png、../images/photo.jpg、image.png 等）或绝对路径
 * @param basePath 基础路径（文档的完整路径，用于计算相对路径的基准）
 * @returns 解析后的绝对路径（如果输入是绝对路径，直接返回原文）
 */
export function resolveRelativePath(
  relativePath: string,
  basePath: string
): string {
  if (!basePath || !relativePath) {
    return relativePath;
  }

  const logger = getLogger();
  logger.debug(`开始解析路径: ${relativePath}`, { basePath });

  // 如果是绝对路径，直接返回原文
  if (isAbsolutePath(relativePath)) {
    logger.debug(`路径已是绝对路径，直接返回: ${relativePath}`);
    return relativePath;
  }

  // 移除 basePath 的 file:/// 前缀（如果存在）
  let normalizedBase = basePath.replace(/^file:\/\/\//, '');
  
  // 如果路径包含 URL 编码（%XX 格式），先解码
  try {
    // 检查是否包含 URL 编码字符
    if (normalizedBase.includes('%')) {
      normalizedBase = decodeURIComponent(normalizedBase);
    }
    if (relativePath.includes('%')) {
      relativePath = decodeURIComponent(relativePath);
    }
  } catch (e) {
    // 如果解码失败（可能是无效的编码），保持原样
    logger.debug('URL 解码失败，保持原路径', { basePath, relativePath, error: e });
  }
  
  // 规范化路径分隔符（统一使用 /）
  normalizedBase = normalizeSeparator(normalizedBase);
  const normalizedRelative = normalizeSeparator(relativePath);
  
  // 获取基础路径的目录部分（去掉文件名）
  const baseDir = normalizedBase.substring(0, normalizedBase.lastIndexOf('/') + 1);
  
  // 将基础目录和相对路径组合
  const combinedPath = baseDir + normalizedRelative;
  
  // 分割路径为组件
  const pathComponents = combinedPath.split('/').filter(component => component !== '');
  
  // 处理 Windows 驱动器号（如 C:）
  let driveLetter = '';
  if (pathComponents.length > 0 && /^[A-Za-z]:$/.test(pathComponents[0])) {
    driveLetter = pathComponents[0];
    pathComponents.shift();
  }
  
  // 解析路径组件（处理 . 和 ..）
  const resolvedComponents = resolvePathComponents(pathComponents);
  
  // 重新组合路径
  let resolvedPath: string;
  if (driveLetter) {
    // Windows 路径：C:/path/to/file
    resolvedPath = driveLetter + '/' + resolvedComponents.join('/');
  } else if (normalizedBase.startsWith('/')) {
    // Unix 绝对路径：/path/to/file
    resolvedPath = '/' + resolvedComponents.join('/');
  } else {
    // 相对路径组合后的结果
    resolvedPath = resolvedComponents.join('/');
  }
  
  // 如果原始路径是目录路径（以 / 结尾），保持这个特性
  if (normalizedRelative.endsWith('/') && !resolvedPath.endsWith('/')) {
    resolvedPath += '/';
  }
  
  // 转换回原始路径格式（如果原始路径使用反斜杠，则转换回来）
  if (relativePath.includes('\\') || basePath.includes('\\')) {
    resolvedPath = resolvedPath.replace(/\//g, '\\');
  }
  
  logger.debug(`路径解析完成: ${relativePath} -> ${resolvedPath}`, { basePath, baseDir });
  
  return resolvedPath;
}


/**
 * 使用 linkBase 解析相对路径
 * 这是最常用的方法，用于将 linkBase + 相对路径转换为绝对路径
 * 如果输入是绝对路径，直接返回原文
 * 
 * @param relativePath 相对路径（如 ./image.png、../images/photo.jpg、image.png 等）或绝对路径
 * @param linkBase linkBase（文档所在目录的路径，可以是 file:// URL 格式或普通路径）
 * @returns 解析后的绝对路径（如果输入是绝对路径，直接返回原文）
 * 
 * @example
 * ```typescript
 * // 如果文档路径是 D:\docs\article.md
 * // linkBase 应该是 D:\docs\ 或 file:///D:/docs/
 * const absolutePath = resolvePathWithLinkBase('./image.png', 'D:\\docs\\');
 * // 结果: D:\docs\image.png
 * 
 * const absolutePath2 = resolvePathWithLinkBase('../images/photo.jpg', 'D:\\docs\\');
 * // 结果: D:\images\photo.jpg
 * 
 * // 绝对路径直接返回
 * const absolutePath3 = resolvePathWithLinkBase('D:\\images\\photo.jpg', 'D:\\docs\\');
 * // 结果: D:\images\photo.jpg
 * ```
 */
export function resolvePathWithLinkBase(
  relativePath: string,
  linkBase: string
): string {
  if (!linkBase || !relativePath) {
    return relativePath;
  }

  // 如果已经是绝对路径，直接返回原文
  if (isAbsolutePath(relativePath)) {
    return relativePath;
  }

  const logger = getLogger();
  logger.debug(`使用 linkBase 解析路径: ${relativePath}`, { linkBase });

  // linkBase 可能是 file:// URL 格式，需要转换为普通路径
  let basePath = linkBase;
  
  // 如果 linkBase 是 file:// URL，需要添加一个虚拟文件名来构成完整的 basePath
  // 因为 resolveRelativePath 需要完整的文件路径来计算目录
  if (linkBase.startsWith('file:///')) {
    // 移除 file:/// 前缀
    let pathWithoutPrefix = linkBase.replace(/^file:\/\/\//, '');
    // 如果路径包含 URL 编码（%XX 格式），先解码
    try {
      if (pathWithoutPrefix.includes('%')) {
        pathWithoutPrefix = decodeURIComponent(pathWithoutPrefix);
      }
    } catch (e) {
      // 如果解码失败（可能是无效的编码），保持原样
      logger.debug('URL 解码失败，保持原路径', { linkBase, error: e });
    }
    // 添加虚拟文件名（用于计算目录）
    basePath = pathWithoutPrefix + 'document.md';
  } else if (!linkBase.endsWith('/') && !linkBase.endsWith('\\')) {
    // 如果 linkBase 不是以 / 或 \ 结尾，且不是 file:// URL，可能是文件路径
    // 直接使用作为 basePath
    basePath = linkBase;
  } else {
    // linkBase 是目录路径，添加虚拟文件名
    basePath = linkBase + 'document.md';
  }

  return resolveRelativePath(relativePath, basePath);
}

/**
 * 批量解析相对路径
 * @param relativePaths 相对路径数组
 * @param basePath 基础路径
 * @returns 解析后的绝对路径数组
 */
export function resolveRelativePaths(
  relativePaths: string[],
  basePath: string
): string[] {
  return relativePaths.map((path) => resolveRelativePath(path, basePath));
}

/**
 * 批量使用 linkBase 解析相对路径
 * @param relativePaths 相对路径数组
 * @param linkBase linkBase
 * @returns 解析后的绝对路径数组
 */
export function resolvePathsWithLinkBase(
  relativePaths: string[],
  linkBase: string
): string[] {
  return relativePaths.map((path) => resolvePathWithLinkBase(path, linkBase));
}

