/**
 * greenworks 为可选原生模块，类型以 any 为主；按需可随官方 API 细化。
 */
declare module 'greenworks' {
  const greenworks: Record<string, unknown>
  export = greenworks
}
