import { resolve } from 'path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
      '@': resolve('src/renderer/src')
    }
  },
  plugins: [vue()],
  assetsInclude: ['**/*.ttf', '**/*.woff', '**/*.woff2', '**/*.eot', '**/*.otf'],
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
    holdUntilCrawlEnd: false
  },
  build: {
    chunkSizeWarningLimit: 1000,
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name.split('.')
          const ext = info[info.length - 1]
          if (/\.(ttf|woff|woff2|eot|otf)$/i.test(assetInfo.name)) {
            return 'assets/fonts/[name][extname]'
          }
          return 'assets/[name]-[hash][extname]'
        }
      }
    }
  },
  server: {
    watch: {
      ignored: ['**/resources/llm-statistics.json', '**/llm-statistics.json']
    },
    proxy: {
      '/api': {
        target: 'https://server.simpletex.cn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
})
