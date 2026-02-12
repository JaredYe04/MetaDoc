<template>
  <div
    ref="containerRef"
    class="distortion-banner"
    @mousemove="onMouseMove"
    @mouseleave="onMouseLeave"
  >
    <canvas ref="canvasRef" class="distortion-canvas" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { themeState } from '../../utils/themes'

/* ===== 网格参数（网站原版，格子较大） ===== */
const COLS_A = 24, ROWS_A = 10
const COLS_B = 13, ROWS_B = 6
const COLS_C = 32, ROWS_C = 24
const REF_CELLS = COLS_A * ROWS_A

/* ===== 物理参数 ===== */
const MAX_DISPLACE = 60
const INFLUENCE_R = 70
const DSCALE_MIN = 0.7, DSCALE_MAX = 1.3
const DISPLACE_LERP = 12
const FLASH_SPEED_INIT = 12
const FLASH_DECEL = 0.5
const FLASH_RADIUS = INFLUENCE_R
const RECOVER_DURATION_MIN = 0.4, RECOVER_DURATION_MAX = 1
const RECOVER_SNAP_INTERVAL_MIN = 15, RECOVER_SNAP_INTERVAL_MAX = 120
const RECOVER_STEP_MIN = 0.15, RECOVER_STEP_MAX = 0.4

type RecoverState = 'idle' | 'displaced' | 'recovering'

interface Cell {
  x: number; y: number; w: number; h: number
  cx: number; cy: number
  displaceScale: number; layerSpeedScale: number
  dx: number; dy: number
  targetDx: number; targetDy: number
  displaced: boolean
  flashOffset: number
  flashSpeed: number
  flashCycles: number
  flashDirection: number
  flashTriggered: boolean
  recoverState: RecoverState
  recoverFromDx: number
  recoverFromDy: number
  recoverProgress: number
  recoverDuration: number
  recoverNextSnapTime: number
}

const containerRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

let canvas: HTMLCanvasElement | null = null
let ctx: CanvasRenderingContext2D | null = null
let textCanvas: HTMLCanvasElement | null = null
let textCtx: CanvasRenderingContext2D | null = null
let layerCanvasA: HTMLCanvasElement | null = null
let layerCtxA: CanvasRenderingContext2D | null = null
let layerCanvasB: HTMLCanvasElement | null = null
let layerCtxB: CanvasRenderingContext2D | null = null
let layerCanvasC: HTMLCanvasElement | null = null
let layerCtxC: CanvasRenderingContext2D | null = null

let animId = 0
let dpr = 1
let logW = 0, logH = 0
let gridA: Cell[] = [], gridB: Cell[] = [], gridC: Cell[] = []
let mouse = { x: -10000, y: -10000, over: false }
let rafScheduled = false
let lastTime = 0

function rand(a: number, b: number) { return a + Math.random() * (b - a) }

function buildOneGrid(w: number, h: number, cols: number, rows: number, layerSpeedScale: number): Cell[] {
  const cw = w / cols, ch = h / rows, out: Cell[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push({
        x: c * cw, y: r * ch, w: cw, h: ch,
        cx: c * cw + cw / 2, cy: r * ch + ch / 2,
        displaceScale: rand(DSCALE_MIN, DSCALE_MAX),
        layerSpeedScale,
        dx: 0, dy: 0, targetDx: 0, targetDy: 0,
        displaced: false,
        flashOffset: 0, flashSpeed: 0, flashCycles: 0, flashDirection: 1, flashTriggered: false,
        recoverState: 'idle',
        recoverFromDx: 0, recoverFromDy: 0, recoverProgress: 0,
        recoverDuration: 0, recoverNextSnapTime: 0
      })
    }
  }
  return out
}

function buildGrid(w: number, h: number) {
  gridA = buildOneGrid(w, h, COLS_A, ROWS_A, (COLS_A * ROWS_A) / REF_CELLS)
  gridB = buildOneGrid(w, h, COLS_B, ROWS_B, (COLS_B * ROWS_B) / REF_CELLS)
  gridC = buildOneGrid(w, h, COLS_C, ROWS_C, (COLS_C * ROWS_C) / REF_CELLS)
}

/* ===== 文字渲染（简单 fillText，无超采样） ===== */
function getTextColor() {
  return themeState.currentTheme.type === 'dark'
    ? 'rgba(255,255,255,0.90)'
    : 'rgba(0,0,0,0.85)'
}

let textReady = false

function drawTextToOffscreen(w: number, h: number) {
  const pw = Math.round(w * dpr), ph = Math.round(h * dpr)
  if (!textCanvas || textCanvas.width !== pw || textCanvas.height !== ph) {
    textCanvas = document.createElement('canvas')
    textCanvas.width = pw
    textCanvas.height = ph
    textCtx = textCanvas.getContext('2d')
  }
  if (!textCtx) return
  textCtx.setTransform(1, 0, 0, 1, 0, 0)
  textCtx.clearRect(0, 0, pw, ph)
  textCtx.scale(dpr, dpr)
  const fontSize = Math.min(w / 4.2, h * 0.68)
  textCtx.fillStyle = getTextColor()
  textCtx.font = `900 ${fontSize}px "Arial Black", "Impact", "Helvetica Neue", sans-serif`
  textCtx.textAlign = 'center'
  textCtx.textBaseline = 'middle'
  textCtx.fillText('METADOC', w / 2, h / 2)
  textCtx.setTransform(1, 0, 0, 1, 0, 0)
  textReady = true
}

function ensureLayerCanvas(lc: HTMLCanvasElement | null, lctx: CanvasRenderingContext2D | null, pw: number, ph: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  if (!lc || lc.width !== pw || lc.height !== ph) {
    lc = document.createElement('canvas')
    lc.width = pw
    lc.height = ph
    lctx = lc.getContext('2d')
  }
  return [lc, lctx!]
}

/* =====  cardinal 位移：正上/正下/正左/正右 ===== */
function updateDisplacement(grid: Cell[]) {
  const mx = mouse.x, my = mouse.y, over = mouse.over
  for (let i = 0; i < grid.length; i++) {
    const g = grid[i]
    const ddx = g.cx - mx, ddy = g.cy - my
    const dist = Math.sqrt(ddx * ddx + ddy * ddy) || 0.001
    const factor = Math.max(0, 1 - dist / INFLUENCE_R)
    const strength = factor * factor * MAX_DISPLACE * g.displaceScale

    if (!over) {
      g.targetDx = 0
      g.targetDy = 0
      if (g.displaced && g.recoverState === 'displaced') {
        g.recoverState = 'recovering'
        g.recoverFromDx = g.dx
        g.recoverFromDy = g.dy
        g.recoverProgress = 0
        g.recoverDuration = rand(RECOVER_DURATION_MIN, RECOVER_DURATION_MAX)
        g.recoverNextSnapTime = now() + rand(RECOVER_SNAP_INTERVAL_MIN, RECOVER_SNAP_INTERVAL_MAX)
      }
      if (dist > INFLUENCE_R) g.flashTriggered = false
      continue
    }

    if (dist < INFLUENCE_R) {
      g.displaced = true
      const absX = Math.abs(ddx), absY = Math.abs(ddy)
      if (absX > absY) {
        g.targetDx = (ddx > 0 ? 1 : -1) * strength
        g.targetDy = 0
      } else {
        g.targetDx = 0
        g.targetDy = (ddy > 0 ? 1 : -1) * strength
      }
      g.recoverState = 'displaced'

      if (dist < FLASH_RADIUS && (g.flashCycles <= 0 || g.flashSpeed < 0.5)) {
        if (!g.flashTriggered) {
          g.flashTriggered = true
          g.flashDirection = mx < g.cx ? 1 : -1
          g.flashSpeed = g.w * FLASH_SPEED_INIT
          g.flashCycles = 1 + Math.floor(Math.random() * 3)
        }
      }
    } else {
      g.displaced = false
      g.targetDx = 0
      g.targetDy = 0
      g.flashTriggered = false
      if (g.recoverState === 'displaced' && (g.dx !== 0 || g.dy !== 0)) {
        g.recoverState = 'recovering'
        g.recoverFromDx = g.dx
        g.recoverFromDy = g.dy
        g.recoverProgress = 0
        g.recoverDuration = rand(RECOVER_DURATION_MIN, RECOVER_DURATION_MAX)
        g.recoverNextSnapTime = now() + rand(RECOVER_SNAP_INTERVAL_MIN, RECOVER_SNAP_INTERVAL_MAX)
      }
    }
  }
}

/* ===== 位移插值（平滑过渡） ===== */
function updateDisplacementLerp(grid: Cell[], dt: number) {
  const k = 1 - Math.exp(-DISPLACE_LERP * dt)
  for (let i = 0; i < grid.length; i++) {
    const g = grid[i]
    if (g.recoverState !== 'recovering') {
      g.dx += (g.targetDx - g.dx) * k
      g.dy += (g.targetDy - g.dy) * k
    }
  }
}

/* ===== Flash 滚动效果 ===== */
function updateFlash(grid: Cell[], dt: number) {
  for (let i = 0; i < grid.length; i++) {
    const g = grid[i]
    if (g.flashCycles <= 0 && g.flashSpeed < 0.5) {
      g.flashOffset = 0
      g.flashTriggered = false
      continue
    }
    g.flashOffset += g.flashDirection * g.flashSpeed * dt
    const w = g.w
    while (Math.abs(g.flashOffset) >= w) {
      g.flashOffset -= g.flashDirection * w
      g.flashCycles--
      g.flashSpeed *= FLASH_DECEL
      if (g.flashCycles <= 0) break
    }
    if (g.flashCycles <= 0 && g.flashSpeed < 0.5) g.flashOffset = 0
  }
}

/* ===== Glitchy 回正 ===== */
function updateRecovery(grid: Cell[]) {
  const t = now()
  for (let i = 0; i < grid.length; i++) {
    const g = grid[i]
    if (g.recoverState !== 'recovering') continue
    if (t < g.recoverNextSnapTime) continue
    g.recoverProgress += rand(RECOVER_STEP_MIN, RECOVER_STEP_MAX)
    if (g.recoverProgress >= 1) {
      g.dx = 0
      g.dy = 0
      g.recoverProgress = 1
      g.recoverState = 'idle'
      g.displaced = false
      g.flashOffset = 0
      continue
    }
    const r = 1 - g.recoverProgress
    g.dx = g.recoverFromDx * r
    g.dy = g.recoverFromDy * r
    if (g.recoverProgress >= 0.98) {
      g.dx = 0
      g.dy = 0
      g.recoverProgress = 1
      g.recoverState = 'idle'
      g.displaced = false
      g.flashOffset = 0
      continue
    }
    g.recoverNextSnapTime = t + rand(RECOVER_SNAP_INTERVAL_MIN, RECOVER_SNAP_INTERVAL_MAX)
  }
}

function now() { return typeof performance !== 'undefined' ? performance.now() : Date.now() }

/* ===== 渲染（含 flash 偏移的 wrap） ===== */
function draw() {
  // 如果还没准备好，尝试重新初始化一次（防止首次挂载时容器尺寸为 0）
  if (!canvasRef.value || !containerRef.value) return
  if (!canvas || !ctx || !textCanvas || !textReady || !gridA.length) {
    resize()
    if (!canvas || !ctx || !textCanvas || !textReady || !gridA.length) {
      return
    }
  }
  const pw = canvas.width, ph = canvas.height
  const w = pw / dpr, h = ph / dpr
  logW = w
  logH = h

  const t = now()
  const dt = lastTime > 0 ? (t - lastTime) / 1000 : 0
  lastTime = t

  ;[layerCanvasA, layerCtxA] = ensureLayerCanvas(layerCanvasA, layerCtxA, pw, ph)
  ;[layerCanvasB, layerCtxB] = ensureLayerCanvas(layerCanvasB, layerCtxB, pw, ph)
  ;[layerCanvasC, layerCtxC] = ensureLayerCanvas(layerCanvasC, layerCtxC, pw, ph)

  function drawLayerToCanvas(grid: Cell[], lctx: CanvasRenderingContext2D, lc: HTMLCanvasElement) {
    lctx.setTransform(1, 0, 0, 1, 0, 0)
    lctx.clearRect(0, 0, lc.width, lc.height)
    lctx.imageSmoothingEnabled = true
    lctx.imageSmoothingQuality = 'high'
    lctx.scale(dpr, dpr)
    for (let i = 0; i < grid.length; i++) {
      const g = grid[i]
      let destX = g.x + g.dx, destY = g.y + g.dy
      destX = Math.round(destX * dpr) / dpr
      destY = Math.round(destY * dpr) / dpr
      const sx = Math.round(g.x * dpr), sy = Math.round(g.y * dpr)
      const sw = Math.round(g.w * dpr), sh = Math.round(g.h * dpr)
      const offset = ((g.flashOffset % g.w) + g.w) % g.w
      const offsetPx = Math.round(offset * dpr)
      if (offsetPx > 1 && offsetPx < sw - 1) {
        lctx.drawImage(textCanvas!, sx + offsetPx, sy, sw - offsetPx, sh, destX, destY, g.w - offset, g.h)
        lctx.drawImage(textCanvas!, sx, sy, offsetPx, sh, destX + g.w - offset, destY, offset, g.h)
      } else {
        lctx.drawImage(textCanvas!, sx, sy, sw, sh, destX, destY, g.w, g.h)
      }
    }
    lctx.setTransform(1, 0, 0, 1, 0, 0)
  }

  updateDisplacement(gridA)
  updateDisplacement(gridB)
  updateDisplacement(gridC)
  updateDisplacementLerp(gridA, dt)
  updateDisplacementLerp(gridB, dt)
  updateDisplacementLerp(gridC, dt)
  updateFlash(gridA, dt)
  updateFlash(gridB, dt)
  updateFlash(gridC, dt)
  updateRecovery(gridA)
  updateRecovery(gridB)
  updateRecovery(gridC)

  drawLayerToCanvas(gridA, layerCtxA!, layerCanvasA!)
  drawLayerToCanvas(gridB, layerCtxB!, layerCanvasB!)
  drawLayerToCanvas(gridC, layerCtxC!, layerCanvasC!)

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, pw, ph)
  ctx.drawImage(layerCanvasA!, 0, 0)
  ctx.drawImage(layerCanvasB!, 0, 0)
  ctx.drawImage(layerCanvasC!, 0, 0)
}

function tick() {
  rafScheduled = false
  lastTime = now()
  draw()
  animId = requestAnimationFrame(loop)
}
function loop() {
  if (rafScheduled) return
  rafScheduled = true
  animId = requestAnimationFrame(tick)
}

function resize() {
  if (!containerRef.value || !canvasRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  const w = rect.width, h = rect.height
  if (w === 0 || h === 0) return
  logW = w
  logH = h
  dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas = canvasRef.value
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
  ctx = canvas.getContext('2d')
  buildGrid(w, h)
  drawTextToOffscreen(w, h)
}

function onMouseMove(e: MouseEvent) {
  if (!containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  mouse.x = e.clientX - rect.left
  mouse.y = e.clientY - rect.top
  mouse.over = true
}

function onMouseLeave() {
  mouse.over = false
}

watch(() => themeState.currentTheme.type, () => {
  if (logW > 0 && logH > 0) drawTextToOffscreen(logW, logH)
})

onMounted(() => {
  resize()
  loop()
  window.addEventListener('resize', resize)
})

onUnmounted(() => {
  if (animId) cancelAnimationFrame(animId)
  window.removeEventListener('resize', resize)
})
</script>

<style scoped>
.distortion-banner {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  cursor: default;
  background: transparent;
  mask-image: radial-gradient(ellipse 92% 85% at 50% 50%, black 60%, transparent 100%);
  -webkit-mask-image: radial-gradient(ellipse 92% 85% at 50% 50%, black 60%, transparent 100%);
}

.distortion-canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
