/**
 * 用户手册 Demo 组件注册表
 * 文档中描述到哪个界面控件，就嵌入哪个真实组件（mode="demo"），用户边看文档边看真实 UI
 *
 * 组件不在本文件静态导入，避免循环依赖（logger → … → LeftMenu → demo-registry → LeftMenu）。
 * 实际组件由 demo-registry-components.ts 在首次需要时懒加载并注册。
 */

import type { Component } from 'vue'

const registry: Record<string, Component> = {}

/**
 * 注册可在手册中嵌入的 Demo 组件
 */
export function registerDemoComponent(name: string, component: Component): void {
  registry[name] = component
}

/**
 * 根据名称获取 Demo 组件，未注册则返回 undefined
 */
export function getDemoComponent(name: string): Component | undefined {
  return registry[name]
}

/**
 * 判断内容是否包含 Demo 占位符（用于决定是否使用分段渲染）
 */
export function hasDemoPlaceholder(markdown: string): boolean {
  return /<[A-Z][a-zA-Z0-9]*(\s[^>]*)?\s*\/>/.test(markdown ?? '')
}
