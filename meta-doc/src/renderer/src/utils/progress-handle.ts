import eventBus from './event-bus'
import { createRendererLogger } from './logger'

export interface ProgressPayload {
  visible?: boolean
  message?: string
  subMessage?: string
  percentage?: number
  status?: 'success' | 'exception' | 'warning' | ''
  showPercentage?: boolean
  canCancel?: boolean
  params?: Record<string, any>
  requestId?: string
}

export interface ProgressSegmentOptions {
  message?: string
  subMessage?: string
  params?: Record<string, any>
  status?: 'success' | 'exception' | 'warning' | ''
  showPercentage?: boolean
}

export interface ProgressHandleOptions {
  /** 初始展示的文案 */
  message?: string
  /** 初始百分比，默认0 */
  initialPercentage?: number
  /** 取消回调，可用于通知主进程停止任务 */
  onCancel?: (requestId: string) => void
  /** 自定义requestId，默认自动生成 */
  requestId?: string
  /** 是否默认允许取消，默认 true */
  canCancel?: boolean
}

function generateRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 统一的进度句柄（渲染进程）
 * - 负责推送 global-progress 事件
 * - 内置取消监听，暴露 AbortSignal
 * - 提供分段里程碑 + 子任务进度换算
 */
export class ProgressHandle {
  readonly requestId: string
  readonly signal: AbortSignal
  private controller: AbortController
  private canCancel: boolean
  private segmentStart = 0
  private segmentTarget = 0
  private current = 0
  private disposed = false
  private onCancel?: (requestId: string) => void
  private logger = createRendererLogger('ProgressHandle')
  private cancelListener = (evt: unknown) => {
    const payload = evt as { requestId?: string }
    if (payload?.requestId && payload.requestId === this.requestId) {
      this.logger.debug(`[ProgressHandle] receive cancel for ${this.requestId}`)
      this.cancel()
    }
  }

  constructor(options: ProgressHandleOptions = {}) {
    this.controller = new AbortController()
    this.signal = this.controller.signal
    this.requestId = options.requestId ?? generateRequestId()
    this.canCancel = options.canCancel !== false
    this.onCancel = options.onCancel

    // 监听全局取消按钮
    eventBus.on('cancel-progress', this.cancelListener)

    // 初始展示
    if (options.message || options.initialPercentage !== undefined) {
      this.emit({
        message: options.message,
        percentage: options.initialPercentage ?? 0
      })
    }
  }

  /** 设置一个里程碑的目标百分比，后续的 updateSegmentProgress 会在该区间内计算 */
  setSegment(targetPercent: number, opts: ProgressSegmentOptions = {}): void {
    this.segmentStart = this.current
    this.segmentTarget = targetPercent
    this.emit({
      ...opts,
      percentage: this.segmentStart
    })
  }

  /** 更新当前里程碑的子任务进度（done/total 会被换算到区间） */
  updateSegmentProgress(done: number, total: number, opts: ProgressSegmentOptions = {}): void {
    if (total <= 0) {
      this.emit(opts)
      return
    }
    const ratio = Math.min(1, Math.max(0, done / total))
    const percent = this.segmentStart + (this.segmentTarget - this.segmentStart) * ratio
    this.emit({
      ...opts,
      percentage: percent
    })
  }

  /** 直接标记当前进度百分比 */
  mark(percent: number, opts: ProgressSegmentOptions = {}): void {
    this.emit({
      ...opts,
      percentage: percent
    })
  }

  success(opts: ProgressSegmentOptions = {}): void {
    this.emit({
      ...opts,
      percentage: 100,
      status: 'success'
    })
    this.disposeLater()
  }

  fail(message?: string): void {
    this.emit({
      message,
      status: 'exception',
      percentage: 0
    })
    this.disposeLater()
  }

  cancel(): void {
    if (this.controller.signal.aborted) return
    this.controller.abort()
    try {
      this.onCancel?.(this.requestId)
    } catch (err) {
      this.logger.warn('onCancel failed', err)
    }
    this.emit({ visible: false })
    this.dispose()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    eventBus.off('cancel-progress', this.cancelListener)
  }

  private disposeLater(): void {
    setTimeout(() => {
      this.emit({ visible: false })
      this.dispose()
    }, 800)
  }

  private emit(payload: ProgressSegmentOptions & ProgressPayload): void {
    if (this.disposed) return
    if (this.signal.aborted) {
      this.emitHide()
      return
    }
    // 确保百分比是数字类型，并在 0-100 范围内
    let nextPercent: number
    if (payload.percentage !== undefined) {
      nextPercent = Math.max(0, Math.min(100, Number(payload.percentage)))
    } else {
      nextPercent = this.current
    }
    this.current = nextPercent
    // 正确处理 visible 属性：如果明确设置为 false，则保持 false；否则默认为 true
    const isVisible = payload.visible !== undefined ? payload.visible : true
    const progressPayload: ProgressPayload = {
      visible: isVisible,
      message: payload.message,
      subMessage: payload.subMessage,
      percentage: Math.round(nextPercent * 100) / 100, // 保留两位小数，避免浮点误差
      status: payload.status,
      params: payload.params,
      showPercentage: payload.showPercentage,
      canCancel: this.canCancel,
      requestId: this.requestId
    }
    this.logger.debug(
      `[ProgressHandle] 更新进度: ${progressPayload.percentage}%, message: ${progressPayload.message}`
    )
    eventBus.emit('global-progress', progressPayload)
  }

  private emitHide(): void {
    eventBus.emit('global-progress', { visible: false })
  }
}

export function createProgressHandle(options?: ProgressHandleOptions): ProgressHandle {
  return new ProgressHandle(options)
}
