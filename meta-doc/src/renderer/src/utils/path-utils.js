/**
 * 浏览器兼容的路径工具函数
 * 用于替代 Node.js 的 path 模块，在渲染进程中使用
 */

/**
 * 获取路径的文件名部分（basename）
 * @param {string} filePath - 文件路径
 * @returns {string} 文件名
 */
export function basename(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return ''
  }
  
  // 统一处理路径分隔符
  const normalized = filePath.replace(/\\/g, '/')
  const parts = normalized.split('/').filter(Boolean)
  
  if (parts.length === 0) {
    return filePath
  }
  
  return parts[parts.length - 1]
}

/**
 * 获取路径的目录部分（dirname）
 * @param {string} filePath - 文件路径
 * @returns {string} 目录路径
 */
export function dirname(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return ''
  }
  
  // 统一处理路径分隔符
  const normalized = filePath.replace(/\\/g, '/')
  const parts = normalized.split('/').filter(Boolean)
  
  if (parts.length <= 1) {
    return ''
  }
  
  return parts.slice(0, -1).join('/')
}

/**
 * 拼接路径（join）
 * @param {...string} parts - 路径部分
 * @returns {string} 拼接后的路径
 */
export function join(...parts) {
  if (parts.length === 0) {
    return ''
  }
  
  // 规范化所有部分
  const normalized = parts
    .filter(p => p && typeof p === 'string')
    .map(p => p.replace(/\\/g, '/'))
    .join('/')
    .replace(/\/+/g, '/') // 合并多个斜杠
  
  return normalized
}

/**
 * 判断路径是否为绝对路径
 * @param {string} filePath - 文件路径
 * @returns {boolean} 是否为绝对路径
 */
export function isAbsolute(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return false
  }
  
  // Windows 绝对路径：C:\ 或 D:\ 等
  if (/^[A-Za-z]:[\\/]/.test(filePath)) {
    return true
  }
  
  // Unix 绝对路径：以 / 开头
  if (filePath.startsWith('/')) {
    return true
  }
  
  return false
}

/**
 * 规范化路径（normalize）
 * @param {string} filePath - 文件路径
 * @returns {string} 规范化后的路径
 */
export function normalize(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return ''
  }
  
  // 统一使用 / 作为分隔符
  let normalized = filePath.replace(/\\/g, '/')
  
  // 处理 .. 和 .
  const parts = normalized.split('/')
  const result = []
  
  for (const part of parts) {
    if (part === '..') {
      if (result.length > 0 && result[result.length - 1] !== '..') {
        result.pop()
      } else {
        result.push(part)
      }
    } else if (part !== '.' && part !== '') {
      result.push(part)
    }
  }
  
  return result.join('/')
}

