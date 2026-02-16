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

export interface MainProgressHandleOptions {
  send: (payload: ProgressPayload) => void
  requestId?: string
  canCancel?: boolean
  initialMessage?: string
  initialPercentage?: number
}

function generateRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 统一的进度句柄（主进程）
 * - 负责调用 send(progress) 下发到渲染进程
 * - 暴露 AbortSignal 以便长任务可被终止
 * - 提供分段里程碑 + 子任务进度换算
 */
export class MainProgressHandle {
  readonly requestId: string
  readonly signal: AbortSignal
  private controller: AbortController
  private send: (payload: ProgressPayload) => void
  private canCancel: boolean
  private segmentStart = 0
  private segmentTarget = 0
  private current = 0

  constructor(options: MainProgressHandleOptions) {
    this.controller = new AbortController()
    this.signal = this.controller.signal
    this.send = options.send
    this.requestId = options.requestId ?? generateRequestId()
    this.canCancel = options.canCancel !== false

    if (options.initialMessage !== undefined || options.initialPercentage !== undefined) {
      this.emit({
        message: options.initialMessage,
        percentage: options.initialPercentage ?? 0
      })
    }
  }

  setSegment(targetPercent: number, opts: ProgressSegmentOptions = {}): void {
    this.segmentStart = this.current
    this.segmentTarget = targetPercent
    this.emit({
      ...opts,
      percentage: this.segmentStart
    })
  }

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
    this.hideLater()
  }

  fail(message?: string): void {
    this.emit({
      message,
      status: 'exception',
      percentage: 0
    })
    this.hideLater()
  }

  cancel(): void {
    if (this.controller.signal.aborted) return
    this.controller.abort()
    this.emit({ visible: false })
  }

  private hideLater(): void {
    setTimeout(() => {
      this.emit({ visible: false })
    }, 800)
  }

  private emit(payload: ProgressSegmentOptions & ProgressPayload): void {
    if (this.signal.aborted) {
      this.send({ visible: false })
      return
    }
    this.current = payload.percentage ?? this.current
    // 正确处理 visible 属性：如果明确设置为 false，则保持 false；否则默认为 true
    const isVisible = payload.visible !== undefined ? payload.visible : true
    this.send({
      visible: isVisible,
      message: payload.message,
      subMessage: payload.subMessage,
      percentage: this.current,
      status: payload.status,
      showPercentage: payload.showPercentage,
      canCancel: this.canCancel,
      params: payload.params,
      requestId: this.requestId
    })
  }
}

/**
 * 便捷方法：将 handle 注册到 map，供取消时查找
 */
export function registerHandle(
  map: Map<string, MainProgressHandle>,
  handle: MainProgressHandle
): void {
  map.set(handle.requestId, handle)
}
