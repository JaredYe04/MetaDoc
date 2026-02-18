<template>
  <div ref="containerRef" class="dynamic-background-animation">
    <canvas ref="canvasRef" class="animation-canvas"></canvas>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { themeState } from '../../utils/themes'

const containerRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

let canvas: HTMLCanvasElement | null = null
let ctx: CanvasRenderingContext2D | null = null
let animationId: number | null = null
let time = 0

// 随机配置 - 每次组件挂载时生成新的随机配置
// 使用时间戳和随机数组合，确保每次打开都有不同的效果
let randomSeed = Date.now() + Math.random() * 1000
const seededRandom = () => {
  randomSeed = (randomSeed * 9301 + 49297) % 233280
  return randomSeed / 233280
}

const config = {
  // 随机选择动画模式 (0-4)
  mode: Math.floor(seededRandom() * 5),
  // 随机颜色方案 (0-2)
  colorScheme: Math.floor(seededRandom() * 3),
  // 随机粒子数量
  particleCount: Math.floor(seededRandom() * 30) + 20, // 20-50
  // 随机网格大小
  gridSize: Math.floor(seededRandom() * 60) + 60, // 60-120
  // 随机速度
  speed: seededRandom() * 0.5 + 0.3, // 0.3-0.8
  // 随机旋转速度
  rotationSpeed: seededRandom() * 0.02 + 0.005, // 0.005-0.025
  // 随机连接距离
  connectionDistance: Math.floor(seededRandom() * 100) + 100, // 100-200
  // 随机节点数量
  nodeCount: Math.floor(seededRandom() * 15) + 10, // 10-25
}

// 根据主题和随机配置获取颜色
const getColor = (opacity: number, index: number = 0): string => {
  const isDark = themeState.currentTheme.type === 'dark'
  
  // 根据随机颜色方案选择不同的颜色
  const colorSets = [
    // 蓝色系
    isDark 
      ? ['rgba(59, 130, 246, ', 'rgba(96, 165, 250, ', 'rgba(147, 197, 253, '] // blue-500, blue-400, blue-300
      : ['rgba(37, 99, 235, ', 'rgba(59, 130, 246, ', 'rgba(96, 165, 250, '], // blue-600, blue-500, blue-400
    // 紫色系
    isDark
      ? ['rgba(139, 92, 246, ', 'rgba(167, 139, 250, ', 'rgba(196, 181, 253, '] // violet-500, violet-400, violet-300
      : ['rgba(124, 58, 237, ', 'rgba(139, 92, 246, ', 'rgba(167, 139, 250, '], // violet-600, violet-500, violet-400
    // 青色系
    isDark
      ? ['rgba(20, 184, 166, ', 'rgba(45, 212, 191, ', 'rgba(94, 234, 212, '] // teal-500, teal-400, teal-300
      : ['rgba(13, 148, 136, ', 'rgba(20, 184, 166, ', 'rgba(45, 212, 191, '], // teal-600, teal-500, teal-400
  ]
  
  const colors = colorSets[config.colorScheme]
  return colors[index % colors.length] + opacity + ')'
}

// 粒子类
class Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  opacity: number
  pulsePhase: number
  colorIndex: number

  constructor() {
    this.reset()
  }

  reset() {
    this.x = Math.random() * (canvas?.width || window.innerWidth)
    this.y = Math.random() * (canvas?.height || window.innerHeight)
    this.vx = (Math.random() - 0.5) * config.speed
    this.vy = (Math.random() - 0.5) * config.speed
    this.size = Math.random() * 2 + 1
    this.opacity = Math.random() * 0.4 + 0.2
    this.pulsePhase = Math.random() * Math.PI * 2
    this.colorIndex = Math.floor(Math.random() * 3)
  }

  update() {
    this.x += this.vx
    this.y += this.vy
    
    // 边界反弹
    if (this.x < 0 || this.x > (canvas?.width || 0)) this.vx *= -1
    if (this.y < 0 || this.y > (canvas?.height || 0)) this.vy *= -1
    
    this.x = Math.max(0, Math.min(canvas?.width || 0, this.x))
    this.y = Math.max(0, Math.min(canvas?.height || 0, this.y))
    
    this.pulsePhase += 0.03
  }

  draw() {
    if (!ctx) return
    const pulse = (Math.sin(this.pulsePhase) + 1) * 0.5
    const opacity = this.opacity * (0.5 + pulse * 0.3)
    
    ctx.beginPath()
    ctx.arc(this.x, this.y, this.size + pulse * 0.5, 0, Math.PI * 2)
    ctx.fillStyle = getColor(opacity, this.colorIndex)
    ctx.fill()
  }
}

// 节点类（用于网络模式）
class Node {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  pulsePhase: number

  constructor() {
    this.reset()
  }

  reset() {
    this.x = Math.random() * (canvas?.width || window.innerWidth)
    this.y = Math.random() * (canvas?.height || window.innerHeight)
    this.vx = (Math.random() - 0.5) * config.speed * 0.5
    this.vy = (Math.random() - 0.5) * config.speed * 0.5
    this.size = Math.random() * 2 + 1
    this.pulsePhase = Math.random() * Math.PI * 2
  }

  update() {
    this.x += this.vx
    this.y += this.vy
    
    if (this.x < 0 || this.x > (canvas?.width || 0)) this.vx *= -1
    if (this.y < 0 || this.y > (canvas?.height || 0)) this.vy *= -1
    
    this.x = Math.max(0, Math.min(canvas?.width || 0, this.x))
    this.y = Math.max(0, Math.min(canvas?.height || 0, this.y))
    
    this.pulsePhase += 0.03
  }

  draw() {
    if (!ctx) return
    const pulse = (Math.sin(this.pulsePhase) + 1) * 0.5
    const opacity = (0.5 + pulse * 0.3) * 0.6
    
    ctx.beginPath()
    ctx.arc(this.x, this.y, this.size + pulse * 0.5, 0, Math.PI * 2)
    ctx.fillStyle = getColor(opacity)
    ctx.fill()
  }
}

// 网格线类
class GridLine {
  x: number
  y: number
  length: number
  angle: number
  speed: number
  opacity: number
  width: number

  constructor() {
    this.reset()
  }

  reset() {
    this.x = Math.random() * (canvas?.width || window.innerWidth)
    this.y = Math.random() * (canvas?.height || window.innerHeight)
    this.length = Math.random() * 100 + 50
    this.angle = Math.random() * Math.PI * 2
    this.speed = config.speed * 0.5
    this.opacity = Math.random() * 0.3 + 0.1
    this.width = Math.random() * 1 + 0.5
  }

  update() {
    this.x += Math.cos(this.angle) * this.speed
    this.y += Math.sin(this.angle) * this.speed
    
    if (this.x < -this.length || this.x > (canvas?.width || 0) + this.length) {
      this.x = Math.random() * (canvas?.width || 0)
    }
    if (this.y < -this.length || this.y > (canvas?.height || 0) + this.length) {
      this.y = Math.random() * (canvas?.height || 0)
    }
  }

  draw() {
    if (!ctx) return
    ctx.strokeStyle = getColor(this.opacity)
    ctx.lineWidth = this.width
    ctx.beginPath()
    ctx.moveTo(this.x, this.y)
    ctx.lineTo(
      this.x + Math.cos(this.angle) * this.length,
      this.y + Math.sin(this.angle) * this.length
    )
    ctx.stroke()
  }
}

// 存储动画元素
const particles: Particle[] = []
const nodes: Node[] = []
const gridLines: GridLine[] = []

// 初始化动画元素
const initElements = () => {
  particles.length = 0
  nodes.length = 0
  gridLines.length = 0

  if (config.mode === 0 || config.mode === 1) {
    // 粒子模式
    for (let i = 0; i < config.particleCount; i++) {
      particles.push(new Particle())
    }
  }

  if (config.mode === 2 || config.mode === 3) {
    // 网络模式
    for (let i = 0; i < config.nodeCount; i++) {
      nodes.push(new Node())
    }
  }

  if (config.mode === 1 || config.mode === 4) {
    // 网格线模式
    for (let i = 0; i < 30; i++) {
      gridLines.push(new GridLine())
    }
  }
}

// 绘制连接线（网络模式）
const drawConnections = () => {
  if (!ctx) return
  const maxDistance = config.connectionDistance
  
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[i].x - nodes[j].x
      const dy = nodes[i].y - nodes[j].y
      const distance = Math.sqrt(dx * dx + dy * dy)

      if (distance < maxDistance) {
        const opacity = (1 - distance / maxDistance) * 0.15
        ctx.strokeStyle = getColor(opacity)
        ctx.lineWidth = 0.8
        ctx.beginPath()
        ctx.moveTo(nodes[i].x, nodes[i].y)
        ctx.lineTo(nodes[j].x, nodes[j].y)
        ctx.stroke()
      }
    }
  }
}

// 绘制旋转网格（模式4）
const drawRotatingGrid = () => {
  if (!ctx) return
  const isDark = themeState.currentTheme.type === 'dark'
  const opacity = isDark ? 0.08 : 0.05
  
  ctx.save()
  ctx.translate((canvas?.width || 0) / 2, (canvas?.height || 0) / 2)
  ctx.rotate(time * config.rotationSpeed)
  
  ctx.strokeStyle = getColor(opacity)
  ctx.lineWidth = 1
  
  const gridSize = config.gridSize
  const cols = Math.ceil((canvas?.width || 0) / gridSize) + 2
  const rows = Math.ceil((canvas?.height || 0) / gridSize) + 2
  
  for (let i = -1; i <= cols; i++) {
    for (let j = -1; j <= rows; j++) {
      const x = i * gridSize - (canvas?.width || 0) / 2
      const y = j * gridSize - (canvas?.height || 0) / 2
      
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + gridSize, y)
      ctx.lineTo(x, y + gridSize)
      ctx.stroke()
    }
  }
  
  ctx.restore()
}

// 绘制波动网格（模式0）
const drawWaveGrid = () => {
  if (!ctx) return
  const isDark = themeState.currentTheme.type === 'dark'
  const opacity = isDark ? 0.06 : 0.04
  
  ctx.strokeStyle = getColor(opacity)
  ctx.lineWidth = 1
  
  const gridSize = config.gridSize
  const cols = Math.ceil((canvas?.width || 0) / gridSize) + 1
  const rows = Math.ceil((canvas?.height || 0) / gridSize) + 1
  
  for (let i = 0; i <= cols; i++) {
    ctx.beginPath()
    const x = i * gridSize
    let moved = false
    for (let j = 0; j <= rows; j++) {
      const y = j * gridSize + Math.sin(time + i * 0.5) * 10
      if (!moved) {
        ctx.moveTo(x, y)
        moved = true
      } else {
        ctx.lineTo(x, y)
      }
    }
    ctx.stroke()
  }
  
  for (let j = 0; j <= rows; j++) {
    ctx.beginPath()
    const y = j * gridSize
    let moved = false
    for (let i = 0; i <= cols; i++) {
      const x = i * gridSize + Math.cos(time + j * 0.5) * 10
      if (!moved) {
        ctx.moveTo(x, y)
        moved = true
      } else {
        ctx.lineTo(x, y)
      }
    }
    ctx.stroke()
  }
}

// 主动画循环
const animate = () => {
  if (!canvas || !ctx) return

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  
  time += 0.01

  // 根据模式绘制不同的效果
  switch (config.mode) {
    case 0: // 粒子 + 波动网格
      drawWaveGrid()
      particles.forEach(p => {
        p.update()
        p.draw()
      })
      // 绘制粒子之间的连接
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const distance = Math.sqrt(dx * dx + dy * dy)
          if (distance < config.connectionDistance * 0.7) {
            const opacity = (1 - distance / (config.connectionDistance * 0.7)) * 0.1
            ctx.strokeStyle = getColor(opacity)
            ctx.lineWidth = 0.5
            ctx.beginPath()
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.stroke()
          }
        }
      }
      break
      
    case 1: // 粒子 + 网格线
      particles.forEach(p => {
        p.update()
        p.draw()
      })
      gridLines.forEach(line => {
        line.update()
        line.draw()
      })
      break
      
    case 2: // 节点网络
      nodes.forEach(node => {
        node.update()
        node.draw()
      })
      drawConnections()
      break
      
    case 3: // 节点网络 + 粒子
      nodes.forEach(node => {
        node.update()
        node.draw()
      })
      drawConnections()
      particles.forEach(p => {
        p.update()
        p.draw()
      })
      break
      
    case 4: // 旋转网格 + 网格线
      drawRotatingGrid()
      gridLines.forEach(line => {
        line.update()
        line.draw()
      })
      break
  }

  animationId = requestAnimationFrame(animate)
}

// 调整画布大小
const resizeCanvas = () => {
  if (!containerRef.value || !canvasRef.value) return
  
  const rect = containerRef.value.getBoundingClientRect()
  if (canvas) {
    canvas.width = rect.width
    canvas.height = rect.height
  }
  
  // 重新初始化元素位置
  particles.forEach(p => p.reset())
  nodes.forEach(n => n.reset())
  gridLines.forEach(l => l.reset())
}

// 监听主题变化
watch(() => themeState.currentTheme.type, () => {
  // 主题变化时重新初始化元素以应用新颜色
  initElements()
})

onMounted(() => {
  if (!canvasRef.value) return
  
  canvas = canvasRef.value
  ctx = canvas.getContext('2d')
  
  if (!ctx) return
  
  resizeCanvas()
  initElements()
  animate()
  
  window.addEventListener('resize', resizeCanvas)
})

onBeforeUnmount(() => {
  if (animationId !== null) {
    cancelAnimationFrame(animationId)
  }
  window.removeEventListener('resize', resizeCanvas)
})
</script>

<style scoped>
.dynamic-background-animation {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  pointer-events: none;
  z-index: 1;
}

.animation-canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
