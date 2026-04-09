/**
 * 统一任务管理器
 * 负责注册、管理和结束所有使用进度条的任务
 * 确保所有任务都有明确的结束逻辑（成功/失败/取消）
 */

import { createProgressHandle, type ProgressHandle } from './progress-handle'
import { createRendererLogger } from './logger'
import eventBus from '../event-bus'

// 懒加载logger，避免初始化顺序问题
let loggerInstance: ReturnType<typeof createRendererLogger> | null = null

function getLogger() {
  if (!loggerInstance) {
    loggerInstance = createRendererLogger('TaskManager')
  }
  return loggerInstance
}

export interface TaskOptions {
  /** 任务名称，用于日志 */
  name?: string
  /** 初始消息 */
  message?: string
  /** 取消回调 */
  onCancel?: (requestId: string) => void | Promise<void>
  /** 自定义requestId */
  requestId?: string
  /** 是否允许取消 */
  canCancel?: boolean
}

export interface TaskResult<T> {
  handle: ProgressHandle
  promise: Promise<T>
  cancel: () => void
}

/**
 * 任务管理器
 * 统一管理所有使用进度条的任务
 */
class TaskManager {
  private tasks = new Map<
    string,
    {
      handle: ProgressHandle
      name?: string
      promise: Promise<any>
      resolve: (value: any) => void
      reject: (error: any) => void
    }
  >()

  /**
   * 注册一个新任务
   * 返回 handle 和 promise，任务必须通过 handle.success/fail/cancel 明确结束
   */
  register<T>(
    taskFn: (handle: ProgressHandle) => Promise<T>,
    options: TaskOptions = {}
  ): TaskResult<T> {
    const handle = createProgressHandle({
      requestId: options.requestId,
      message: options.message,
      initialPercentage: 0,
      canCancel: options.canCancel,
      onCancel: async (requestId) => {
        // 调用用户提供的取消回调
        if (options.onCancel) {
          try {
            await options.onCancel(requestId)
          } catch (err) {
            getLogger().warn(`[TaskManager] onCancel failed for ${requestId}`, err)
          }
        }
        // 取消任务
        this.cancelTask(requestId)
      }
    })

    let resolve!: (value: T) => void
    let reject!: (error: any) => void
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })

    // 包装任务函数，确保有明确的结束逻辑
    const wrappedTask = async (): Promise<T> => {
      try {
        // 检查是否已取消
        if (handle.signal.aborted) {
          throw new Error('操作已取消')
        }

        const result = await taskFn(handle)

        // 如果任务成功但没有调用 handle.success，自动调用
        if (!handle.signal.aborted) {
          handle.success()
        }

        return result
      } catch (error) {
        // 如果是取消错误，不显示错误消息
        if (
          error instanceof Error &&
          (error.message === '操作已取消' || error.name === 'AbortError')
        ) {
          handle.cancel()
          throw error
        }

        // 其他错误，标记为失败
        if (!handle.signal.aborted) {
          handle.fail(error instanceof Error ? error.message : String(error))
        }
        throw error
      } finally {
        // 清理任务注册
        this.tasks.delete(handle.requestId)
      }
    }

    // 启动任务
    const taskPromise = wrappedTask()
    taskPromise.then(resolve).catch(reject)

    // 注册任务
    this.tasks.set(handle.requestId, {
      handle,
      name: options.name,
      promise: taskPromise,
      resolve,
      reject
    })

    getLogger().debug(
      `[TaskManager] 注册任务: ${options.name || 'unnamed'}, requestId: ${handle.requestId}`
    )

    return {
      handle,
      promise: taskPromise,
      cancel: () => this.cancelTask(handle.requestId)
    }
  }

  /**
   * 取消指定任务
   */
  cancelTask(requestId: string): void {
    const task = this.tasks.get(requestId)
    if (!task) {
      getLogger().warn(`[TaskManager] 任务不存在: ${requestId}`)
      return
    }

    getLogger().debug(`[TaskManager] 取消任务: ${task.name || 'unnamed'}, requestId: ${requestId}`)

    // 取消 handle
    task.handle.cancel()

    // 拒绝 promise
    task.reject(new Error('操作已取消'))

    // 清理注册
    this.tasks.delete(requestId)
  }

  /**
   * 取消所有任务
   */
  cancelAll(): void {
    const requestIds = Array.from(this.tasks.keys())
    getLogger().debug(`[TaskManager] 取消所有任务，共 ${requestIds.length} 个`)
    requestIds.forEach((id) => this.cancelTask(id))
  }

  /**
   * 获取任务数量
   */
  getTaskCount(): number {
    return this.tasks.size
  }

  /**
   * 检查任务是否存在
   */
  hasTask(requestId: string): boolean {
    return this.tasks.has(requestId)
  }
}

// 单例
const taskManager = new TaskManager()

/**
 * 注册一个新任务
 * 使用方式：
 * ```ts
 * const { handle, promise } = registerTask(async (handle) => {
 *   handle.mark(10, { message: '开始处理' })
 *   // ... 执行任务
 *   return result
 * }, { name: '处理文件' })
 *
 * const result = await promise
 * ```
 */
export function registerTask<T>(
  taskFn: (handle: ProgressHandle) => Promise<T>,
  options: TaskOptions = {}
): TaskResult<T> {
  return taskManager.register(taskFn, options)
}

/**
 * 取消指定任务
 */
export function cancelTask(requestId: string): void {
  taskManager.cancelTask(requestId)
}

/**
 * 取消所有任务
 */
export function cancelAllTasks(): void {
  taskManager.cancelAll()
}

/**
 * 获取任务管理器实例（用于高级操作）
 */
export function getTaskManager(): TaskManager {
  return taskManager
}
