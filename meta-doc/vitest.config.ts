import { resolve } from 'path'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'node',
    include: [
      'src/renderer/src/utils/**/*.test.ts',
      'src/renderer/src/core/**/*.test.ts',
      'src/converter/**/*.test.ts',
      'src/main/utils/**/*.test.ts',
      'src/main/steam/**/*.test.ts'
    ],
    globals: true
  },
  resolve: {
    alias: {
      '@': resolve('src/renderer/src'),
      '@common': resolve('src/common'),
      '@renderer': resolve('src/renderer/src'),
      'monaco-editor': resolve('src/renderer/src/utils/__mocks__/monaco-editor-stub.js')
    }
  }
})
