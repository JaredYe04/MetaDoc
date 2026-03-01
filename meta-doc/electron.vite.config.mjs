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
        external: ['node-llama-cpp', /^@node-llama-cpp\/./, 'cspell-lib', 'dotenv']
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
        '@renderer': resolve('src/renderer/src'),
        // CSS 子路径必须单独映射，否则会被下面的别名误解析为 index.js/dist/...
        '@ssthouse/vue3-tree-chart/dist/vue3-tree-chart.css': resolve(
          'node_modules/@ssthouse/vue3-tree-chart/dist/vue3-tree-chart.css'
        ),
        // 使用 vue3-tree-chart 源码（不 patch node_modules，视口保留通过 Outline 内用普通变量锁避免点击重渲染实现）
        '@ssthouse/vue3-tree-chart': resolve(
          'node_modules/@ssthouse/vue3-tree-chart/src/vue-tree/index.js'
        )
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
      // 禁用缓存锁定，避免并发问题
      holdUntilCrawlEnd: false
    },
    build: {
      chunkSizeWarningLimit: 1000, // 增大警告阈值，因为monaco-editor等库本身就很大
      assetsInlineLimit: 0, // 不内联字体文件（TTF太大）
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
    }
  },
  server: {
    watch: {
      // 任何 AI 任务完成后会写 llm-statistics.json，忽略该文件避免触发整页重载/白屏
      ignored: (path) => path.includes('llm-statistics.json')
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
