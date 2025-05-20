import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import legacy from '@vitejs/plugin-legacy'
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
    plugins: [vue(),
    legacy({
      targets: ['Chrome 56'], // Android 6 上的 WebView 大约是这个版本
      additionalLegacyPolyfills: ['regenerator-runtime/runtime'], // 如果你用到了 async/await
    })
    ],

    // build: {
    //   // target: 'chrome125',  // 兼容 Electron 的 Chromium 版本
    //   polyfillDynamicImport: false,  // 防止动态导入，确保旧版本兼容
    //   rollupOptions: {
    //     external: ['core-js'],  // 确保将 core-js 模块外部化
    //     plugins: [
    //       babel({
    //         presets: [
    //           ['@babel/preset-env', {
    //             targets: '> 0.25%, not dead', // 确保兼容绝大多数浏览器
    //             useBuiltIns: 'usage',
    //             corejs: 3,  // 使用 core-js 3 来填充 polyfill
    //           }]
    //         ],
    //         plugins: [
    //           '@babel/plugin-transform-optional-chaining',
    //           '@babel/plugin-transform-nullish-coalescing-operator',
    //           ['@babel/plugin-transform-private-methods', { loose: true }],
    //         ]
    //       })
    //     ]
    //   }
    // },
    // optimizeDeps: {
    //   esbuildOptions: {
    //     target: 'es2015'
    //   }
    // }
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
