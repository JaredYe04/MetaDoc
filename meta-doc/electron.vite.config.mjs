import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import { babel } from '@rollup/plugin-babel';
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        // 将 node-llama-cpp 标记为 external，因为它只在 devDependencies 中
        external: [
          'node-llama-cpp',
          /^@node-llama-cpp\/./
        ]
      }
    }
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
    build: {
      chunkSizeWarningLimit: 1000, // 增大警告阈值，因为monaco-editor等库本身就很大
    }
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
