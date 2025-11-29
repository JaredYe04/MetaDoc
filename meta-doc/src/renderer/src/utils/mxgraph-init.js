/**
 * mxgraph 初始化脚本
 * 必须在所有 JavaScript 模块加载之前执行
 * 设置 mxgraph 所需的全局变量，避免 mxgraph 在导入时出现错误
 * 
 * 此文件应该在 main.js 的最开始被导入
 */

// 确保在浏览器环境中执行
if (typeof window !== 'undefined') {
  // mxLoadResources - 资源加载函数（禁用）
  if (!window.mxLoadResources) {
    window.mxLoadResources = function() {
      // 空函数，禁用资源加载
      // mxgraph 在 Vite 环境中不需要动态加载资源文件，所有资源都已打包
    };
  }
  
  // mxForceIncludes - 强制包含标记（禁用）
  if (typeof window.mxForceIncludes === 'undefined') {
    window.mxForceIncludes = false;
  }
  
  // mxBasePath - 资源基础路径（不需要）
  if (typeof window.mxBasePath === 'undefined') {
    window.mxBasePath = '';
  }
  
  // mxImageBasePath - 图片基础路径（不需要）
  if (typeof window.mxImageBasePath === 'undefined') {
    window.mxImageBasePath = '';
  }
  
  // mxLoadStylesheets - 是否加载样式表（禁用）
  if (typeof window.mxLoadStylesheets === 'undefined') {
    window.mxLoadStylesheets = false;
  }
  
  // mxResourceExtension - 资源文件扩展名（不需要）
  if (typeof window.mxResourceExtension === 'undefined') {
    window.mxResourceExtension = '';
  }
  
  // mxLanguage - 语言设置（不需要）
  if (typeof window.mxLanguage === 'undefined') {
    window.mxLanguage = '';
  }
  
  // mxResourcePath - 资源路径（不需要）
  if (typeof window.mxResourcePath === 'undefined') {
    window.mxResourcePath = '';
  }
  
  // mxImageExtension - 图片扩展名（不需要）
  if (typeof window.mxImageExtension === 'undefined') {
    window.mxImageExtension = '';
  }
  
  // mxLog - 日志对象（可选，设置为 null）
  if (typeof window.mxLog === 'undefined') {
    window.mxLog = null;
  }
}

