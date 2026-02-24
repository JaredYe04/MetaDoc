/**
 * LaTeX 到 OMML 转换单元测试（Vitest）
 * 转换依赖主进程 latex-to-omml (messageBridge.invoke)，在 Node 环境下不可用。
 * 完整测试请在应用内「设置 → 调试 → 单元测试」中运行批量测试。
 */
import { describe, it } from 'vitest'

describe('LaTeX 到 OMML 转换 (需在应用内运行)', () => {
  it.skip('LaTeX 转 OMML 需主进程 IPC', () => {
    // 需 messageBridge.invoke('latex-to-omml', latex, displayMode)
  })
})
