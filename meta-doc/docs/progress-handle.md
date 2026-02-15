# 全局进度与取消统一方案

## 目标

- 为长耗时链路提供统一的进度句柄（handle），支持里程碑分段与子任务进度自动换算。
- 通过同一 requestId 打通渲染层与主进程的取消：进度条的“取消”按钮可立即中断可控任务。
- 减少任务内部手算百分比与到处检查 abort 的样板代码。

## 核心模块

- 渲染进程：`src/renderer/src/utils/progress-handle.ts`

  - `createProgressHandle(options)` 返回 `ProgressHandle`，自动监听 `cancel-progress` 事件。
  - 提供 API：
    - `setSegment(targetPercent)` / `updateSegmentProgress(done, total)`：在区间内自动换算百分比。
    - `mark(percent, opts)`：直接设置当前进度。
    - `success()` / `fail()` / `cancel()`：统一收尾并隐藏进度。
  - 属性：`requestId`（可传入或自动生成）、`signal`（AbortSignal，供 axios/适配器使用）。
  - 支持 `onCancel` 回调，用于通知主进程终止。

- 主进程：`src/main/utils/progress-handle.ts`
  - `MainProgressHandle`：同样提供分段/子进度换算，使用 `send(progress)` 下发到渲染进程。
  - 可结合 `AbortController` 实现可控任务的中断。

## 进度条交互

- 进度事件统一包含 `requestId`；`GlobalProgressBar` 会显示“取消”按钮并发出 `cancel-progress`。
- 渲染层 handle 直接响应取消，主进程导出使用 `abortExportTask(requestId)` 终止并隐藏进度。

## 已改造的链路

- 引用上传/URL 导入：`reference-processor.ts`
  - 使用 `ProgressHandle` 贯穿解析、OCR、清洗；全程同一 requestId，可被进度条取消。
- 导出前预处理（渲染层）：`renderer/services/export-manager.ts`
  - 生成 `requestId` 并创建 handle，预渲染图表等阶段使用里程碑/子任务自动换算；requestId 透传给主进程。
- 导出主流程（主进程）：`main/export/export-manager.ts`
  - 支持 `requestId`，进度事件带 cancel 能力；暴露 `abortExportTask` 供 IPC 调用。
  - 取消 IPC：`cancel-export-task`（main-calls.ts）。

## 使用方式速览

```ts
// 渲染层
const handle = createProgressHandle({ requestId, message: 'processing...' })
handle.setSegment(50, { message: 'phase A' })
handle.updateSegmentProgress(done, total) // 自动映射到 0-50%
// ...
handle.success()

// 主进程
const handle = new MainProgressHandle({ requestId, send: (p) => sendProgress(win, p, requestId) })
handle.setSegment(90)
handle.updateSegmentProgress(done, total)
```

## 取消策略

- 可控任务：携带 AbortSignal（或显式状态）在合适检查点中断。
- 原子/不可中断任务：允许继续，但立即隐藏进度；后续补偿视需要加入。
