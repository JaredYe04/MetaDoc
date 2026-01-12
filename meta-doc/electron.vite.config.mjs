import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'


export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        // 将 node-llama-cpp 标记为 external，因为它只在 devDependencies 中
        // 将 cspell-lib 标记为 external，因为它是纯 ESM 模块，需要在运行时动态导入
        external: [
          'node-llama-cpp',
          /^@node-llama-cpp\/./,
          'cspell-lib'
        ]
      },
      chunkSizeWarningLimit: 1000 // 增大警告阈值，因为monaco-editor等库本身就很大
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
    build: {
      chunkSizeWarningLimit: 1000 // 增大警告阈值，因为monaco-editor等库本身就很大
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
