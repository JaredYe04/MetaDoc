/**
 * 解析工具输出展示组件（与 AgentToolResultCard 共用，供紧凑模式直接渲染）
 */
import { defineAsyncComponent } from 'vue'

const componentCache = new Map<string, any>()

const componentMap: Record<string, () => Promise<any>> = {
  OutlineTreeDisplay: () => import('./components/OutlineTreeDisplay.vue')
}

/**
 * 按 renderer 名称解析组件，同一名称始终返回同一引用（带缓存）
 */
export function resolveToolOutputComponent(renderer: string | any): any {
  if (!renderer) return null

  if (typeof renderer === 'string') {
    let comp = componentCache.get(renderer)
    if (comp) return comp

    const componentLoader = componentMap[renderer]
    if (componentLoader) {
      comp = defineAsyncComponent(componentLoader)
    } else {
      try {
        comp = defineAsyncComponent(() => import(`./components/${renderer}.vue`))
      } catch {
        console.warn(`无法加载组件: ${renderer}`)
        return null
      }
    }
    componentCache.set(renderer, comp)
    return comp
  }

  if (
    typeof renderer === 'object' &&
    ('setup' in renderer || 'render' in renderer || 'name' in renderer)
  ) {
    return renderer
  }

  return null
}
