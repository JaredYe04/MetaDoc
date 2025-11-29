/**
 * mxgraph 全局设置（防御性检查）
 * 
 * 注意：mxgraph 的主要初始化已在 index.html 中通过 mxgraph-init.js 完成。
 * 此文件作为防御性检查，确保在模块加载时所有必需的全局变量都已设置。
 * 如果 mxgraph-init.js 因某种原因未执行，这里的代码将作为后备方案。
 */

// 在全局作用域定义mxgraph所需的全局变量，避免mxgraph导入时出错
if (typeof window !== 'undefined') {
  // mxLoadResources - 资源加载函数（禁用）
  // @ts-ignore
  if (!window.mxLoadResources) {
    // @ts-ignore
    window.mxLoadResources = () => {
      // 空函数，禁用资源加载
      // mxgraph在Vite环境中不需要动态加载资源文件
    }
  }
  
  // mxForceIncludes - 强制包含标记（禁用）
  // @ts-ignore
  if (typeof window.mxForceIncludes === 'undefined') {
    // @ts-ignore
    window.mxForceIncludes = false
  }
  
  // mxBasePath - 资源基础路径（不需要）
  // @ts-ignore
  if (typeof window.mxBasePath === 'undefined') {
    // @ts-ignore
    window.mxBasePath = ''
  }
  
  // mxImageBasePath - 图片基础路径（不需要）
  // @ts-ignore
  if (typeof window.mxImageBasePath === 'undefined') {
    // @ts-ignore
    window.mxImageBasePath = ''
  }
  
  // mxLoadStylesheets - 是否加载样式表（禁用）
  // @ts-ignore
  if (typeof window.mxLoadStylesheets === 'undefined') {
    // @ts-ignore
    window.mxLoadStylesheets = false
  }
  
  // mxResourceExtension - 资源文件扩展名（不需要）
  // @ts-ignore
  if (typeof window.mxResourceExtension === 'undefined') {
    // @ts-ignore
    window.mxResourceExtension = ''
  }
  
  // mxLanguage - 语言设置（不需要）
  // @ts-ignore
  if (typeof window.mxLanguage === 'undefined') {
    // @ts-ignore
    window.mxLanguage = ''
  }
  
  // mxResourcePath - 资源路径（不需要）
  // @ts-ignore
  if (typeof window.mxResourcePath === 'undefined') {
    // @ts-ignore
    window.mxResourcePath = ''
  }
  
  // mxImageExtension - 图片扩展名（不需要）
  // @ts-ignore
  if (typeof window.mxImageExtension === 'undefined') {
    // @ts-ignore
    window.mxImageExtension = ''
  }
  
  // mxLog - 日志对象（可选，设置为 null）
  // @ts-ignore
  if (typeof window.mxLog === 'undefined') {
    // @ts-ignore
    window.mxLog = null
  }
}

export {}

