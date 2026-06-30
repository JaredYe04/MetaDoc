import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

const __dirname = dirname(fileURLToPath(import.meta.url))
/** Steam / Greenworks：仅当 VITE_METADOC_STEAM=true 时编译进主进程并保留 greenworks external */
const steamOn = process.env.VITE_METADOC_STEAM === 'true'

const mainSteamAliases = {
  '@metadoc/steam-runtime': resolve(__dirname, 'src/main/steam/steam-runtime.stub.ts'),
  '@metadoc/register-steam-ipc': resolve(__dirname, 'src/main/steam/register-steam-ipc.stub.ts'),
  '@metadoc/steam-first-doc-achievements': resolve(
    __dirname,
    'src/main/steam/steam-first-doc-achievements.stub.ts'
  ),
  '@metadoc/steam-app-lifecycle-hooks': resolve(
    __dirname,
    'src/main/steam/steam-app-lifecycle-hooks.stub.ts'
  ),
  '@metadoc/user-templates-steam-push': resolve(
    __dirname,
    'src/main/steam/user-templates-steam-push.stub.ts'
  )
}

/** Rollup 的 id 在 Windows 上也可能含反斜杠，统一后再匹配 */
function nm(id) {
  return id.split('\\').join('/')
}

/**
 * 将超大依赖拆成独立 chunk，降低单次打包时 Rollup/V8 的峰值内存（对弱机器更友好）。
 * 仅匹配 node_modules，其余走默认分包策略。
 */
function metaDocRendererManualChunks(id) {
  const x = nm(id)
  if (!x.includes('/node_modules/')) return
  if (x.includes('/node_modules/monaco-editor/') || x.includes('/node_modules/monaco-')) {
    return 'chunk-monaco'
  }
  if (x.includes('/node_modules/mermaid/')) return 'chunk-mermaid'
  if (x.includes('/node_modules/echarts/') || x.includes('/node_modules/zrender/')) {
    return 'chunk-echarts'
  }
  if (x.includes('/node_modules/pdfjs-dist/')) return 'chunk-pdfjs'
  if (x.includes('/node_modules/three/')) return 'chunk-three'
  if (x.includes('/node_modules/ag-grid')) return 'chunk-ag-grid'
  if (x.includes('/node_modules/vditor/')) return 'chunk-vditor'
  if (x.includes('/node_modules/md-editor-v3/')) return 'chunk-md-editor'
  if (
    x.includes('/node_modules/tdesign-vue-next/') ||
    x.includes('/node_modules/tdesign-icons-vue-next/')
  ) {
    return 'chunk-tdesign'
  }
  if (x.includes('/node_modules/d3/') || x.includes('/node_modules/d3-')) return 'chunk-d3'
  if (x.includes('/node_modules/natural/')) return 'chunk-natural'
  if (x.includes('/src/renderer/src/ai-runtime/')) return 'chunk-ai-runtime'
  if (x.includes('/src/renderer/src/plugins/')) return 'chunk-plugins'
  if (x.includes('/src/renderer/src/utils/agent-framework/')) return 'chunk-agent-framework'
  if (x.includes('/src/renderer/src/utils/agent-tools/')) return 'chunk-agent-tools'
  if (x.includes('/src/renderer/src/utils/llm-adapters/')) return 'chunk-llm-adapters'
  if (x.includes('/node_modules/tesseract.js/')) return 'chunk-tesseract'
  if (x.includes('/node_modules/@codemirror/') || x.includes('/node_modules/codemirror/')) {
    return 'chunk-codemirror'
  }
}

export default defineConfig({
  main: {
    define: {
      __METADOC_STEAM__: JSON.stringify(steamOn)
    },
    resolve: {
      alias: mainSteamAliases
    },
    plugins: [externalizeDepsPlugin()],
    build: {
      // 关闭构建结束时的 gzip 体积统计，可显著降低内存与耗时
      reportCompressedSize: false,
      rollupOptions: {
        // 双入口：bootstrap 先做单实例检测再加载 index，减少第二实例无谓加载
        input: {
          bootstrap: resolve('src/main/bootstrap.ts'),
          index: resolve('src/main/index.ts'),
          'chart-render-worker': resolve('src/main/workers/chart-render-worker.ts')
        },
        // 将 node-llama-cpp 标记为 external，因为它只在 devDependencies 中
        // 将 cspell-lib 标记为 external，因为它是纯 ESM 模块，需要在运行时动态导入
        external: [
          'node-llama-cpp',
          /^@node-llama-cpp\/./,
          'cspell-lib',
          'dotenv',
          ...(steamOn ? ['greenworks'] : [])
        ]
      },
      chunkSizeWarningLimit: 1000 // 增大警告阈值，因为monaco-editor等库本身就很大
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      reportCompressedSize: false
    }
  },
  renderer: {
    base: './',
    publicDir: resolve('src/renderer/public'),
    resolve: {
      alias: {
        '@common': resolve('src/common'),
        '@renderer': resolve('src/renderer/src'),
        '@logos': resolve('../logos'),
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
      reportCompressedSize: false,
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          skeleton: resolve('src/renderer/skeleton.html')
        },
        output: {
          manualChunks: metaDocRendererManualChunks,
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
      // 忽略会频繁写入的文件，避免触发热更新导致窗口白屏
      ignored: (path) =>
        path.includes('llm-statistics.json') ||
        path.includes('crud-out.txt') ||
        path.includes('simple-out.txt')
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
