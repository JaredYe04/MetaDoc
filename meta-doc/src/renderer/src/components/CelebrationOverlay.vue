<template>
  <Teleport to="body">
    <Transition name="celebration-fade">
      <div v-if="visible" class="celebration-overlay" @click="handleSkip">
        <canvas ref="canvasRef" class="fireworks-canvas"></canvas>

        <Transition name="card-slide">
          <div v-if="showCard" class="completion-card" @click.stop>
            <div class="card-content">
              <div class="brand">MetaDoc</div>
              <h1 class="title">{{ t('celebration.title') || "You're all set." }}</h1>
              <p class="subtitle">
                {{ t('celebration.subtitle') || "You've completed the full MetaDoc guide." }}
              </p>
              <Button type="primary" size="large" class="action-btn" @click="handleContinue">{{
                t('celebration.continue') || 'Start Using MetaDoc →'
              }}</Button>
            </div>
            <div class="card-glow"></div>
          </div>
        </Transition>

        <Transition name="hint-fade">
          <div v-if="showHint" class="skip-hint">
            {{ t('celebration.skip') || 'Click anywhere to skip' }}
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@renderer/components/ui/button'

const { t } = useI18n()

interface Props {
  visible: boolean
}
const props = defineProps<Props>()
const emit = defineEmits<{ close: []; continue: [] }>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const showCard = ref(false)
const showHint = ref(false)

let ctx: CanvasRenderingContext2D | null = null
let animationId: number | null = null
let particles: Particle[] = []
let fireworks: Firework[] = []

const CONFIG = {
  gravity: 0.15,
  friction: 0.98,
  colors: [
    { r: 245, g: 230, b: 163 },
    { r: 168, g: 212, b: 240 },
    { r: 240, g: 196, b: 212 },
    { r: 255, g: 255, b: 255 }
  ]
}

class Particle {
  x: number
  y: number
  vx: number
  vy: number
  alpha: number
  color: { r: number; g: number; b: number }
  size: number
  decay: number
  constructor(
    x: number,
    y: number,
    vx: number,
    vy: number,
    color: { r: number; g: number; b: number }
  ) {
    this.x = x
    this.y = y
    this.vx = vx
    this.vy = vy
    this.alpha = 1
    this.color = color
    this.size = Math.random() * 2 + 1
    this.decay = Math.random() * 0.015 + 0.01
  }
  update(): boolean {
    this.vx *= CONFIG.friction
    this.vy *= CONFIG.friction
    this.vy += CONFIG.gravity
    this.x += this.vx
    this.y += this.vy
    this.alpha -= this.decay
    return this.alpha > 0
  }
  draw(ctx: CanvasRenderingContext2D) {
    ctx.save()
    ctx.globalAlpha = this.alpha
    const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size * 3)
    gradient.addColorStop(0, `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, 1)`)
    gradient.addColorStop(0.5, `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, 0.5)`)
    gradient.addColorStop(1, `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, 0)`)
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(this.x, this.y, this.size * 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = `rgba(255, 255, 255, ${this.alpha})`
    ctx.beginPath()
    ctx.arc(this.x, this.y, this.size * 0.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

class Firework {
  x: number
  y: number
  targetY: number
  speed: number
  color: { r: number; g: number; b: number }
  exploded: boolean
  trail: { x: number; y: number }[]
  constructor(x: number, targetY: number, color: { r: number; g: number; b: number }) {
    this.x = x
    this.y = window.innerHeight
    this.targetY = targetY
    this.speed = 8
    this.color = color
    this.exploded = false
    this.trail = []
  }
  update(): boolean {
    if (this.exploded) return false
    this.trail.push({ x: this.x, y: this.y })
    if (this.trail.length > 10) this.trail.shift()
    this.y -= this.speed
    if (this.y <= this.targetY) {
      this.explode()
      return false
    }
    return true
  }
  explode() {
    this.exploded = true
    for (let i = 0; i < 100; i++) {
      const angle = (Math.PI * 2 * i) / 100 + Math.random() * 0.5
      const speed = Math.random() * 6 + 2
      particles.push(
        new Particle(this.x, this.y, Math.cos(angle) * speed, Math.sin(angle) * speed, this.color)
      )
    }
  }
  draw(ctx: CanvasRenderingContext2D) {
    if (this.exploded) return
    ctx.save()
    ctx.strokeStyle = `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, 0.8)`
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(this.x, this.y)
    ctx.lineTo(this.x, this.y + 10)
    ctx.stroke()
    ctx.restore()
  }
}

let resizeObserver: ResizeObserver | null = null

function initCanvas() {
  if (!canvasRef.value) return
  const canvas = canvasRef.value
  const overlay = canvas.parentElement
  if (!overlay) return

  const rect = overlay.getBoundingClientRect()

  // 如果尺寸为0，延迟重试
  if (rect.width === 0 || rect.height === 0) {
    console.warn('[CelebrationOverlay] Overlay size is 0, retrying in 100ms...')
    setTimeout(initCanvas, 100)
    return
  }

  // 使用获取到的尺寸，或使用 window 作为 fallback
  canvas.width = rect.width || window.innerWidth
  canvas.height = rect.height || window.innerHeight

  console.log('[CelebrationOverlay] Canvas initialized:', {
    width: canvas.width,
    height: canvas.height
  })
  ctx = canvas.getContext('2d')
  if (!ctx) return
  startAnimation()
  scheduleFireworks()

  // 添加 ResizeObserver 监听 overlay 尺寸变化
  if (!resizeObserver) {
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (canvasRef.value && entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          canvasRef.value.width = entry.contentRect.width
          canvasRef.value.height = entry.contentRect.height
        }
      }
    })
    resizeObserver.observe(overlay)
  }
}

function startAnimation() {
  const animate = () => {
    if (!ctx || !canvasRef.value) return
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)'
    ctx.fillRect(0, 0, canvasRef.value.width, canvasRef.value.height)
    fireworks = fireworks.filter((f) => {
      f.draw(ctx!)
      return f.update()
    })
    particles = particles.filter((p) => {
      p.draw(ctx!)
      return p.update()
    })
    if (particles.length > 0 || fireworks.length > 0 || !showCard.value)
      animationId = requestAnimationFrame(animate)
  }
  animate()
}

function createFirework(x: number, targetY: number, colorIndex: number) {
  if (!ctx) return
  console.log('[CelebrationOverlay] Creating firework at:', { x, targetY })
  fireworks.push(new Firework(x, targetY, CONFIG.colors[colorIndex % CONFIG.colors.length]))
}

function scheduleFireworks() {
  const cx = window.innerWidth / 2,
    cy = window.innerHeight / 3
  setTimeout(() => createFirework(cx, cy, 0), 100)
  setTimeout(() => {
    createFirework(cx - 200, cy - 100, 2)
    createFirework(cx + 200, cy - 100, 1)
  }, 400)
  setTimeout(() => {
    createFirework(cx - 250, cy + 50, 1)
    createFirework(cx, cy - 150, 0)
    createFirework(cx + 250, cy + 50, 2)
  }, 800)
  setTimeout(() => createFirework(cx, cy, 3), 1300)
  setTimeout(() => {
    for (let i = 0; i < 6; i++)
      setTimeout(
        () =>
          createFirework(
            cx + Math.cos((i / 6) * Math.PI * 2) * 180,
            cy + Math.sin((i / 6) * Math.PI * 2) * 180,
            i % 4
          ),
        i * 100
      )
  }, 1900)
  setTimeout(() => (showCard.value = true), 2500)
  setTimeout(() => (showHint.value = true), 1000)
}

function handleSkip() {
  if (showCard.value) return
  closeCelebration()
}
function handleContinue() {
  emit('continue')
  closeCelebration()
}
function closeCelebration() {
  showCard.value = false
  showHint.value = false
  if (animationId) {
    cancelAnimationFrame(animationId)
    animationId = null
  }
  particles = []
  fireworks = []
  emit('close')
}
function handleResize() {
  if (!canvasRef.value) return
  const overlay = canvasRef.value.parentElement
  if (!overlay) return
  const rect = overlay.getBoundingClientRect()
  canvasRef.value.width = rect.width
  canvasRef.value.height = rect.height
}

watch(
  () => props.visible,
  async (newVal) => {
    console.log('[CelebrationOverlay] visible changed:', newVal)
    if (newVal) {
      await nextTick()
      await new Promise((r) => requestAnimationFrame(r))
      initCanvas()
    } else closeCelebration()
  }
)

onMounted(() => window.addEventListener('resize', handleResize))
onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  closeCelebration()
})
</script>

<style scoped>
.celebration-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 9999;
  background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0.4) 0%, rgba(0, 0, 0, 0.8) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.fireworks-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.completion-card {
  position: relative;
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 16px;
  padding: 48px 56px;
  text-align: center;
  max-width: 480px;
  z-index: 10;
  cursor: default;
}
.card-glow {
  position: absolute;
  top: -2px;
  left: -2px;
  right: -2px;
  bottom: -2px;
  background: linear-gradient(
    135deg,
    rgba(245, 230, 163, 0.3) 0%,
    rgba(168, 212, 240, 0.3) 50%,
    rgba(240, 196, 212, 0.3) 100%
  );
  border-radius: 18px;
  z-index: -1;
  opacity: 0.5;
  animation: glow-pulse 3s ease-in-out infinite;
}
@keyframes glow-pulse {
  0%,
  100% {
    opacity: 0.3;
  }
  50% {
    opacity: 0.6;
  }
}
.brand {
  font-size: 14px;
  letter-spacing: 4px;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 24px;
}
.title {
  font-size: 32px;
  font-weight: 300;
  color: #ffffff;
  margin: 0 0 16px 0;
  line-height: 1.3;
}
.subtitle {
  font-size: 16px;
  color: rgba(255, 255, 255, 0.7);
  margin: 0 0 32px 0;
  line-height: 1.6;
}
.action-btn {
  font-size: 16px;
  padding: 14px 32px;
  border-radius: 8px;
}
.skip-hint {
  position: absolute;
  bottom: 40px;
  right: 40px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.4);
  pointer-events: none;
}
.celebration-fade-enter-active,
.celebration-fade-leave-active {
  transition: opacity 0.5s ease;
}
.celebration-fade-enter-from,
.celebration-fade-leave-to {
  opacity: 0;
}
.card-slide-enter-active {
  transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}
.card-slide-enter-from {
  opacity: 0;
  transform: translateY(30px);
}
.hint-fade-enter-active {
  transition: opacity 0.5s ease 1s;
}
.hint-fade-enter-from {
  opacity: 0;
}
</style>
