import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import { babel } from '@rollup/plugin-babel';

// 支持通过环境变量控制构建目标
const buildTarget = process.env.ELECTRON_VITE_BUILD_TARGET;

export default defineConfig({
  main: buildTarget && buildTarget !== 'main' ? false : {
    plugins: [externalizeDepsPlugin()],
    build: {
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: false, // 保留 console，便于调试
          drop_debugger: true
        }
      },
      rollupOptions: {
        // 将 node-llama-cpp 标记为 external，因为它只在 devDependencies 中
        external: [
          'node-llama-cpp',
          /^@node-llama-cpp\/./
        ],
        output: {
          // 优化 chunk 大小，减少内存使用
          manualChunks: undefined // 让 Rollup 自动处理 chunk 分割
        },
        // 限制并发以减少内存峰值
        maxParallelFileOps: 1
      },
      // 减少内存使用：限制并发
      chunkSizeWarningLimit: 1000
    }
  },
  preload: buildTarget && buildTarget !== 'preload' ? false : {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: buildTarget && buildTarget !== 'renderer' ? false : {
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
      //// 禁用缓存锁定，避免并发问题
      //holdUntilCrawlEnd: false
    },
    build: {
      chunkSizeWarningLimit: 1000, // 增大警告阈值，因为monaco-editor等库本身就很大
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: false,
          drop_debugger: true,
          passes: 1 // 减少压缩次数以节省内存
        },
        format: {
          comments: false
        }
      },
      rollupOptions: {
        // 确保 path 模块不会被外部化到浏览器环境
        external: [],
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('element-plus')) return 'element-plus'
              if (id.includes('vditor') || id.includes('markdown')) return 'editor'
              if (id.includes('katex') || id.includes('math')) return 'math'
              return 'vendor'
            }
          },
          // 优化输出以减少内存使用
          compact: true
        },
        // 限制并发以减少内存峰值
        maxParallelFileOps: 1
      }
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
