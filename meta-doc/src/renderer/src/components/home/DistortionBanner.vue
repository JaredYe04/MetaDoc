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
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { themeState } from '../../utils/themes'

const containerRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

const isDark = computed(() => themeState.currentTheme.type === 'dark')

const COLS_A = 12
const ROWS_A = 10
const COLS_B = 24
const ROWS_B = 16
const COLS_C = 16
const ROWS_C = 12
const PULL_NEAR_MOUSE = 0.0027
const PULL_FAR_FROM_MOUSE = 0.023
const PULL_FACTOR_RECOVER = 0.013
const DAMPING = 0.93
const IMPULSE_SCALE = 0.9
const JITTER_RANGE_INVERSE_DENSITY = 1
const JITTER_RANDOM_SPREAD_BY_DENSITY = 0.4
const MAX_DISPLACE = 120
const INFLUENCE_RADIUS = 30
const DISPLACE_SCALE_MIN = 0.6
const DISPLACE_SCALE_MAX = 1.4
const SPEED_SCALE_MIN = 0.8
const SPEED_SCALE_MAX = 1.4

interface Cell {
  x: number
  y: number
  w: number
  h: number
  cx: number
  cy: number
  dx: number
  dy: number
  vx: number
  vy: number
  targetDx: number
  targetDy: number
  displaceScale: number
  speedScale: number
  layerSpeedScale?: number
}

let canvas: HTMLCanvasElement | null
let ctx: CanvasRenderingContext2D | null
let textCanvas: HTMLCanvasElement | null
let textCtx: CanvasRenderingContext2D | null
let animationId = 0
let dpr = 1
let logicalW = 0
let logicalH = 0
let gridA: Cell[] = []
let gridB: Cell[] = []
let gridC: Cell[] = []
let mouse = { x: -10000, y: -10000, over: false }
let lastMouseX = -10000
let lastMouseY = -10000
let rafScheduled = false

function randomBetween(a: number, b: number) {
  return a + Math.random() * (b - a)
}

const REF_CELLS = COLS_A * ROWS_A

function buildOneGrid(
  w: number,
  h: number,
  cols: number,
  rows: number,
  layerSpeedScale = 1
): Cell[] {
  const cellW = w / cols
  const cellH = h / rows
  const out: Cell[] = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      out.push({
        x: col * cellW,
        y: row * cellH,
        w: cellW,
        h: cellH,
        cx: col * cellW + cellW / 2,
        cy: row * cellH + cellH / 2,
        dx: 0,
        dy: 0,
        vx: 0,
        vy: 0,
        targetDx: 0,
        targetDy: 0,
        displaceScale: randomBetween(DISPLACE_SCALE_MIN, DISPLACE_SCALE_MAX),
        speedScale: randomBetween(SPEED_SCALE_MIN, SPEED_SCALE_MAX),
        layerSpeedScale
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

function getThemeColors() {
  // 暗色主题：白字；浅色主题：黑字；背景保持透明
  return isDark.value
    ? { bg: 'transparent', text: 'rgba(255,255,255,0.96)' }
    : { bg: 'transparent', text: 'rgba(0,0,0,0.96)' }
}

function drawTextToOffscreen(w: number, h: number) {
  const pw = Math.round(w * dpr)
  const ph = Math.round(h * dpr)
  if (!textCanvas || textCanvas.width !== pw || textCanvas.height !== ph) {
    textCanvas = document.createElement('canvas')
    textCanvas.width = pw
    textCanvas.height = ph
    textCtx = textCanvas.getContext('2d')
  }
  if (!textCtx) return
  const colors = getThemeColors()
  textCtx.setTransform(1, 0, 0, 1, 0, 0)
  textCtx.clearRect(0, 0, pw, ph)
  textCtx.scale(dpr, dpr)
  const fontSize = Math.min(w / 5.5, h * 0.82)
  textCtx.fillStyle = colors.text
  textCtx.font = `bold ${fontSize}px "Arial Black", "Helvetica Neue", sans-serif`
  textCtx.textAlign = 'center'
  textCtx.textBaseline = 'middle'
  textCtx.fillText('METADOC', w / 2, h / 2)
  textCtx.setTransform(1, 0, 0, 1, 0, 0)
}

function updateTargetsForGrid(grid: Cell[]) {
  const mx = mouse.x
  const my = mouse.y
  const over = mouse.over
  for (let i = 0; i < grid.length; i++) {
    const g = grid[i]
    if (!over) {
      g.targetDx = 0
      g.targetDy = 0
      continue
    }
    const dx = g.cx - mx
    const dy = g.cy - my
    const dist = Math.sqrt(dx * dx + dy * dy) || 0.001
    const factor = Math.max(0, 1 - dist / INFLUENCE_RADIUS)
    const strength = factor * factor * MAX_DISPLACE * g.displaceScale
    const ndx = dx / dist
    const ndy = dy / dist
    g.targetDx = ndx * strength
    g.targetDy = ndy * strength
  }
}

function updateTargets() {
  updateTargetsForGrid(gridA)
  updateTargetsForGrid(gridB)
  updateTargetsForGrid(gridC)
}

function momentumStepForGrid(grid: Cell[]) {
  const over = mouse.over
  const mx = mouse.x
  const my = mouse.y
  const mouseVelX = mx - lastMouseX
  const mouseVelY = my - lastMouseY
  const mouseSpeed = Math.sqrt(mouseVelX * mouseVelX + mouseVelY * mouseVelY)

  for (let i = 0; i < grid.length; i++) {
    const g = grid[i]
    const spd = g.speedScale
    const toTargetX = g.targetDx - g.dx
    const toTargetY = g.targetDy - g.dy

    let pull: number
    if (over) {
      const distToMouse = Math.sqrt((g.cx - mx) ** 2 + (g.cy - my) ** 2) || 0.001
      const t = Math.min(1, distToMouse / INFLUENCE_RADIUS)
      pull = PULL_NEAR_MOUSE + (PULL_FAR_FROM_MOUSE - PULL_NEAR_MOUSE) * t
    } else {
      pull = PULL_FACTOR_RECOVER
    }
    const layerScale = g.layerSpeedScale ?? 1
    g.vx += toTargetX * pull * spd * layerScale
    g.vy += toTargetY * pull * spd * layerScale

    if (over && mouseSpeed > 0.5) {
      const dist = Math.sqrt((g.cx - mx) ** 2 + (g.cy - my) ** 2) || 0.001
      const weight = Math.max(0, 1 - dist / INFLUENCE_RADIUS)
      const baseImpulse = Math.min(mouseSpeed * IMPULSE_SCALE * weight * spd, 28)
      const jitterRangeScale = JITTER_RANGE_INVERSE_DENSITY / layerScale
      const randomSpread = layerScale * JITTER_RANDOM_SPREAD_BY_DENSITY
      const randomMultiplier = 1 + (Math.random() - 0.5) * 2 * randomSpread
      const impulse = baseImpulse * jitterRangeScale * randomMultiplier
      const nx = mouseVelX / mouseSpeed
      const ny = mouseVelY / mouseSpeed
      g.vx += nx * impulse
      g.vy += ny * impulse
    }

    g.dx += g.vx
    g.dy += g.vy
    g.vx *= DAMPING
    g.vy *= DAMPING
  }
}

function momentumStep() {
  const mx = mouse.x
  const my = mouse.y
  lastMouseX = mx
  lastMouseY = my
  momentumStepForGrid(gridA)
  momentumStepForGrid(gridB)
  momentumStepForGrid(gridC)
}

function draw() {
  if (!ctx || !textCanvas || !textCtx || !canvas) return

  const w = canvas.width / dpr
  const h = canvas.height / dpr
  logicalW = w
  logicalH = h

  // 只清理当前帧内容，不填充任何背景色，保持完全透明
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.scale(dpr, dpr)

  function drawLayer(grid: Cell[]) {
    for (let i = 0; i < grid.length; i++) {
      const g = grid[i]
      const destX = g.x + g.dx
      const destY = g.y + g.dy
      const sx = g.x * dpr
      const sy = g.y * dpr
      const sw = g.w * dpr
      const sh = g.h * dpr
      ctx.drawImage(textCanvas, sx, sy, sw, sh, destX, destY, g.w, g.h)
    }
  }

  drawLayer(gridA)
  drawLayer(gridB)
  drawLayer(gridC)

  updateTargets()
  momentumStep()
}

function tick() {
  rafScheduled = false
  draw()
  animationId = requestAnimationFrame(loop)
}

function loop() {
  if (rafScheduled) return
  rafScheduled = true
  animationId = requestAnimationFrame(tick)
}

function resize() {
  if (!containerRef.value || !canvasRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  const w = rect.width
  const h = rect.height
  if (w === 0 || h === 0) return
  // 尺寸未实际变化时跳过
  const roundedW = Math.round(w)
  const roundedH = Math.round(h)
  if (
    logicalW > 0 &&
    logicalH > 0 &&
    Math.round(logicalW) === roundedW &&
    Math.round(logicalH) === roundedH
  ) {
    return
  }
  logicalW = w
  logicalH = h
  dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas = canvasRef.value
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
  ctx = canvas.getContext('2d')
  if (!ctx) return
  buildGrid(w, h)
  drawTextToOffscreen(w, h)
  // 立即重绘，避免设置 width/height 清空画布后出现一帧空白
  draw()
}

function onMouseMove(e: MouseEvent) {
  if (!containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  if (!mouse.over) {
    lastMouseX = x
    lastMouseY = y
  }
  mouse.x = x
  mouse.y = y
  mouse.over = true
}

function onMouseLeave() {
  mouse.over = false
  lastMouseX = mouse.x
  lastMouseY = mouse.y
}

watch(isDark, () => {
  if (logicalW > 0 && logicalH > 0) drawTextToOffscreen(logicalW, logicalH)
})

const RESIZE_DEBOUNCE_MS = 160
let resizeObserver: ResizeObserver | null = null
let resizeDebounceTimer = 0
let resizeRafId = 0

function scheduleResize() {
  if (resizeDebounceTimer) clearTimeout(resizeDebounceTimer)
  resizeDebounceTimer = window.setTimeout(() => {
    resizeDebounceTimer = 0
    if (resizeRafId) return
    resizeRafId = requestAnimationFrame(() => {
      resizeRafId = 0
      resize()
    })
  }, RESIZE_DEBOUNCE_MS)
}

onMounted(() => {
  if (containerRef.value && canvasRef.value) {
    resize()
    loop()
    // 防抖：仅在停止 resize 一段时间后再执行，拖拽过程中不碰 canvas，避免闪烁
    resizeObserver = new ResizeObserver(scheduleResize)
    resizeObserver.observe(containerRef.value)
  }
})

onUnmounted(() => {
  if (animationId) cancelAnimationFrame(animationId)
  if (resizeDebounceTimer) clearTimeout(resizeDebounceTimer)
  if (resizeRafId) cancelAnimationFrame(resizeRafId)
  if (resizeObserver && containerRef.value) {
    resizeObserver.unobserve(containerRef.value)
    resizeObserver = null
  }
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
