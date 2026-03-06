/**
 * 轻量入口：仅动态加载主应用，使首帧先展示 index.html 中的骨架屏，窗口尽早显示。
 */
import('./main.js').catch((err) => {
  console.error('Failed to load application', err)
})
