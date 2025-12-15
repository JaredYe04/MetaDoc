/**
 * 链接拦截脚本
 * 用于在渲染进程中拦截 <a> 标签和 Vditor IR 模式链接的点击事件
 * 处理页面内锚点跳转和外部链接
 */

// 使用捕获阶段，确保在 Vditor 处理之前拦截
document.addEventListener('click', (e) => {
  let href = null;
  let anchorId = null;
  
  // 1️⃣ 处理普通 <a> 标签
  const a = e.target.closest('a');
  if (a) {
    href = a.getAttribute('href');
  }
  
  // 2️⃣ 处理 Vditor IR 模式的链接（data-type="a" 的 span）
  if (!href) {
    const linkNode = e.target.closest('span[data-type="a"]');
    if (linkNode) {
      // 从 Vditor IR 结构中提取链接地址
      // 查找包含链接地址的 span（通常是 vditor-ir__marker--link 类）
      const linkMarker = linkNode.querySelector('.vditor-ir__marker--link');
      if (linkMarker) {
        href = linkMarker.textContent.trim();
      }
    }
  }
  
  if (!href) return;
  
  // 提取锚点部分（处理 #ref-xxx 格式）
  // 1️⃣ 页面内锚点（以 # 开头）
  if (href.startsWith('#')) {
    anchorId = href;
  }
  // 2️⃣ 完整 URL 中包含锚点（如 http://localhost:5174/#ref-1）
  else if (href.includes('#')) {
    // 提取 hash 部分
    const hashIndex = href.indexOf('#');
    const hash = href.substring(hashIndex);
    
    // 检查是否是当前页面的锚点
    // 如果是 localhost 或同源，视为页面内锚点
    if (hash) {
      try {
        let url;
        if (href.startsWith('http://') || href.startsWith('https://')) {
          url = new URL(href);
        } else {
          url = new URL(href, window.location.href);
        }
        
        const isSameOrigin = url.origin === window.location.origin;
        const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '';
        const isCurrentPage = isSameOrigin || isLocalhost;
        
        if (isCurrentPage) {
          anchorId = hash;
        }
      } catch (err) {
        // URL 解析失败，如果包含 #ref- 格式，也视为页面内锚点
        if (hash.includes('#ref-')) {
          anchorId = hash;
        }
      }
    }
  }
  
  // 如果是页面内锚点，进行滚动
  if (anchorId) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    
    const target = document.querySelector(anchorId);
    
    if (target) {
      target.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    } else {
      // 如果找不到目标元素，尝试使用 ID 选择器（不带 #）
      const idWithoutHash = anchorId.replace('#', '');
      const targetById = document.getElementById(idWithoutHash);
      if (targetById) {
        targetById.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    }
    return;
  }
  
  // 3️⃣ 外部链接（http / https，且不是页面内锚点）
  if (/^https?:\/\//.test(href)) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    
    // 使用 Electron 的 shell.openExternal 打开外部链接
    if (window.api?.openExternal) {
      window.api.openExternal(href);
    } else if (window.electron?.shell?.openExternal) {
      // 如果 api 不存在，尝试使用 electronAPI
      window.electron.shell.openExternal(href);
    } else if (window.require) {
      // 如果 electron 对象不存在，尝试使用 require
      try {
        const { shell } = window.require('electron');
        shell.openExternal(href);
      } catch (err) {
        console.warn('无法打开外部链接:', err);
      }
    }
  }
}, true); // 使用捕获阶段，确保在 Vditor 处理之前拦截

