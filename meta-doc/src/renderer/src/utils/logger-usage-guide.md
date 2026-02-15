# Logger 使用指南

## ⚠️ 重要：避免初始化顺序问题

在使用 `createRendererLogger()` 或 `createMainLogger()` 时，需要注意避免在模块顶层或类构造函数中直接创建 logger 实例。这可能导致循环依赖或初始化顺序问题，出现 **"Cannot access before initialization"** 错误。

## ✅ 推荐做法

### 1. 类中使用懒加载方式（最推荐）

```typescript
import { createRendererLogger } from '../logger'

class MyClass {
  private logger: ReturnType<typeof createRendererLogger> | null = null

  private getLogger() {
    if (!this.logger) {
      this.logger = createRendererLogger('MyClass')
    }
    return this.logger
  }

  someMethod() {
    this.getLogger().info('消息')
  }
}
```

### 2. 函数文件中使用懒加载方式（推荐）

```typescript
import { createRendererLogger } from '../logger'

let loggerInstance: ReturnType<typeof createRendererLogger> | null = null

function getLogger() {
  if (!loggerInstance) {
    loggerInstance = createRendererLogger('MyModule')
  }
  return loggerInstance
}

export function myFunction() {
  getLogger().info('消息')
}
```

### 3. 在函数/方法内部调用（可以，但性能略差）

```typescript
import { createRendererLogger } from '../logger'

export function myFunction() {
  const logger = createRendererLogger('MyModule')
  logger.info('消息')
}
```

## ❌ 不推荐的做法

### 1. 在模块顶层直接创建（可能出错）

```typescript
// ❌ 可能导致初始化顺序问题
const logger = createRendererLogger('MyModule')

export function myFunction() {
  logger.info('消息') // 可能出错！
}
```

### 2. 在类构造函数中直接创建（可能出错）

```typescript
// ❌ 可能导致初始化顺序问题
class MyClass {
  private logger = createRendererLogger('MyClass') // 可能出错！

  constructor() {
    this.logger.info('消息') // 可能出错！
  }
}
```

### 3. 在构造函数中立即使用（可能出错）

```typescript
// ❌ 可能导致初始化顺序问题
class MyClass {
  private logger: ReturnType<typeof createRendererLogger>

  constructor() {
    this.logger = createRendererLogger('MyClass') // 可能出错！
    this.logger.info('消息') // 可能出错！
  }
}
```

## 为什么会出错？

当模块加载时，如果存在循环依赖或复杂的初始化顺序，在模块顶层或构造函数中直接创建 logger 可能会导致：

1. 循环依赖问题
2. 模块初始化顺序问题
3. "Cannot access before initialization" 错误

懒加载方式可以避免这些问题，因为 logger 只在第一次使用时才创建，此时所有依赖已经初始化完成。

## 最佳实践总结

1. ✅ **优先使用懒加载方式**：无论是类还是函数文件，都推荐使用懒加载
2. ✅ **在函数/方法内部创建**：如果确定没有初始化顺序问题，可以在函数内部创建
3. ❌ **避免模块顶层创建**：除非你非常确定没有循环依赖
4. ❌ **避免构造函数中创建**：构造函数中创建容易出问题

## 相关文件

- 渲染进程 Logger: `src/renderer/src/utils/logger.ts`
- 主进程 Logger: `src/main/logger.ts`
