import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import { babel } from '@rollup/plugin-babel';
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    base: './',
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [vue()],
    optimizeDeps: {
      include: [
        'pinia',
        'element-plus',
        '@element-plus/icons-vue',
        '@ssthouse/vue3-tree-chart',
        'vue3-markdown-it',
        'vue',
        'vue-router',
        'vue-i18n'
      ],
      exclude: ['electron'],
      // 禁用缓存锁定，避免并发问题
      holdUntilCrawlEnd: false
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'https://server.simpletex.cn',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api/, '')
      }
    }
  }

})
