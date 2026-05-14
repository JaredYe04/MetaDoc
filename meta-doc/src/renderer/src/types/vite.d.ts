/**
 * Vite 类型声明
 * 支持 ?raw 导入
 */

declare module '*?raw' {
  const content: string
  export default content
}

interface ImportMetaEnv {
  readonly VITE_METADOC_STEAM?: string
}
