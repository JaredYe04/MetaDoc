<template>
  <Teleport to="body">
    <Transition name="celebration-fade">
      <div v-if="visible" class="celebration-overlay" @click="handleSkip">
        <!-- Three.js Canvas -->
        <canvas ref="canvasRef" class="fireworks-canvas"></canvas>
        
        <!-- Completion Card -->
        <Transition name="card-slide">
          <div v-if="showCard" class="completion-card" @click.stop>
            <div class="card-content">
              <div class="brand">MetaDoc</div>
              <h1 class="title">{{ t('celebration.title') || "You're all set." }}</h1>
              <p class="subtitle">
                {{ t('celebration.subtitle') || "You've completed the full MetaDoc guide." }}
              </p>
              <ElButton 
                type="primary" 
                size="large" 
                class="action-btn"
                @click="handleContinue"
              >
                {{ t('celebration.continue') || 'Start Using MetaDoc →' }}
              </ElButton>
            </div>
            <div class="card-glow"></div>
          </div>
        </Transition>
        
        <!-- Skip Hint -->
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
import { ElButton } from 'element-plus'
import * as THREE from 'three'

const { t } = useI18n()

interface Props {
  visible: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  close: []
  continue: []
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const showCard = ref(false)
const showHint = ref(false)

// Three.js 相关变量
let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let animationId: number | null = null
let explosions: Explosion[] = []

// 烟花配置
const CONFIG = {
  gravity: 280,
  drag: 1.8,
  particleLifetime: 2.2,
  maxExplosions: 12,
  colors: [
    new THREE.Color('#f5e6a3'), // 香槟金
    new THREE.Color('#a8d4f0'), // 冷蓝
    new THREE.Color('#f0c4d4'), // 玫瑰
    new THREE.Color('#ffffff'), // 纯白
  ]
}

// 爆炸类
class Explosion {
  particles: THREE.Points
  birthTime: number
  
  constructor(position: THREE.Vector3, color: THREE.Color, particleCount: number = 120) {
    this.birthTime = performance.now() / 1000
    
    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(particleCount * 3)
    const velocities = new Float32Array(particleCount * 3)
    const colors = new Float32Array(particleCount * 3)
    const sizes = new Float32Array(particleCount)
    
    // Fibonacci sphere 分布
    const phi = Math.PI * (3 - Math.sqrt(5))
    
    for (let i = 0; i < particleCount; i++) {
      const y = 1 - (i / (particleCount - 1)) * 2
      const radius = Math.sqrt(1 - y * y)
      const theta = phi * i
      
      const x = Math.cos(theta) * radius
      const z = Math.sin(theta) * radius
      
      // 初始位置
      positions[i * 3] = position.x
      positions[i * 3 + 1] = position.y
      positions[i * 3 + 2] = position.z
      
      // 速度（带随机性）
      const speed = 150 + Math.random() * 230
      velocities[i * 3] = x * speed
      velocities[i * 3 + 1] = y * speed
      velocities[i * 3 + 2] = z * speed
      
      // 颜色（同色系变化）
      const hsl: THREE.HSL = { h: 0, s: 0, l: 0 }
      color.getHSL(hsl)
      hsl.h += (Math.random() - 0.5) * 0.1
      hsl.s = Math.max(0, Math.min(1, hsl.s + (Math.random() - 0.5) * 0.2))
      hsl.l = Math.max(0.3, Math.min(0.9, hsl.l + (Math.random() - 0.5) * 0.3))
      const particleColor = new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l)
      colors[i * 3] = particleColor.r
      colors[i * 3 + 1] = particleColor.g
      colors[i * 3 + 2] = particleColor.b
      
      // 大小
      sizes[i] = 1.5 + Math.random() * 2.5
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
    
    // Shader Material
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uBirthTime: { value: this.birthTime },
        uLifetime: { value: CONFIG.particleLifetime },
        uGravity: { value: CONFIG.gravity },
        uDrag: { value: CONFIG.drag },
        uPixelRatio: { value: window.devicePixelRatio }
      },
      vertexShader: `
        attribute vec3 velocity;
        attribute float size;
        uniform float uTime;
        uniform float uBirthTime;
        uniform float uGravity;
        uniform float uDrag;
        uniform float uPixelRatio;
        varying float vLife;
        varying vec3 vColor;
        
        void main() {
          float age = uTime - uBirthTime;
          vLife = age / 2.2;
          vColor = color;
          
          // 物理：重力 + 阻力
          float dragFactor = (1.0 - exp(-age * uDrag)) / uDrag;
          vec3 pos = position + velocity * dragFactor;
          pos.y -= uGravity * age * age * 0.5;
          
          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          
          // 粒子大小：前期大，后期消散
          float sizeScale = 1.0 - smoothstep(0.6, 1.0, vLife);
          gl_PointSize = size * sizeScale * uPixelRatio * (100.0 / -mvPosition.z);
        }
      `,
      fragmentShader: `
        varying float vLife;
        varying vec3 vColor;
        
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float dist = length(uv);
          
          // 核心亮点
          float core = exp(-dist * dist * 80.0);
          
          // 辉光晕
          float glow = exp(-dist * dist * 12.0) * 0.6;
          
          // 衍射星芒
          float star = max(
            exp(-abs(uv.x) * 30.0) * exp(-abs(uv.y) * 5.0),
            exp(-abs(uv.y) * 30.0) * exp(-abs(uv.x) * 5.0)
          ) * 0.4;
          
          float brightness = core + glow + star;
          
          // HDR效果：白核心 → 彩色边缘
          vec3 finalColor = mix(vec3(1.0), vColor, smoothstep(0.0, 0.3, dist));
          finalColor *= brightness;
          
          // Alpha消散
          float alpha = brightness * (1.0 - smoothstep(0.5, 1.0, vLife));
          if (alpha < 0.01) discard;
          
          gl_FragColor = vec4(finalColor, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
    
    this.particles = new THREE.Points(geometry, material)
  }
  
  update(time: number): boolean {
    const age = time - this.birthTime
    const material = this.particles.material as THREE.ShaderMaterial
    material.uniforms.uTime.value = time
    return age < CONFIG.particleLifetime
  }
  
  dispose() {
    this.particles.geometry.dispose()
    ;(this.particles.material as THREE.ShaderMaterial).dispose()
  }
}

// 初始化 Three.js
function initThree() {
  if (!canvasRef.value) {
    console.error('[CelebrationOverlay] Canvas ref is null')
    return
  }
  
  const canvas = canvasRef.value
  const overlay = canvas.parentElement
  
  if (!overlay) {
    console.error('[CelebrationOverlay] Overlay element not found')
    return
  }
  
  const rect = overlay.getBoundingClientRect()
  const width = rect.width
  const height = rect.height
  
  console.log('[CelebrationOverlay] Initializing Three.js:', { width, height, canvas: canvasRef.value })
  
  if (width === 0 || height === 0) {
    console.error('[CelebrationOverlay] Canvas size is 0, retrying in 100ms')
    setTimeout(initThree, 100)
    return
  }
  
  // Renderer
  try {
    renderer = new THREE.WebGLRenderer({ 
      canvas, 
      alpha: true,
      antialias: true 
    })
    
    if (!renderer) {
      console.error('[CelebrationOverlay] Failed to create WebGL renderer')
      return
    }
    
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    
    // Scene
    scene = new THREE.Scene()
    
    // Camera - 调整视野以覆盖整个屏幕
    camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 5000)
    camera.position.z = 1200
    
    console.log('[CelebrationOverlay] Three.js initialized successfully')
    
    // 开始动画
    startAnimation()
    
    // 编排烟花序列
    scheduleFireworks()
  } catch (error) {
    console.error('[CelebrationOverlay] Failed to initialize Three.js:', error)
  }
}

// 动画循环
function startAnimation() {
  const animate = () => {
    if (!renderer || !scene || !camera) return
    
    const time = performance.now() / 1000
    
    // 更新所有爆炸
    explosions = explosions.filter(explosion => {
      const alive = explosion.update(time)
      if (!alive) {
        scene!.remove(explosion.particles)
        explosion.dispose()
        return false
      }
      return true
    })
    
    renderer.render(scene, camera)
    
    if (explosions.length > 0 || !showCard.value) {
      animationId = requestAnimationFrame(animate)
    }
  }
  
  animate()
}

// 创建爆炸
function createExplosion(x: number, y: number, colorIndex: number, particleCount?: number) {
  if (!scene) {
    console.error('[CelebrationOverlay] Cannot create explosion: scene is null')
    return
  }
  
  const color = CONFIG.colors[colorIndex % CONFIG.colors.length]
  console.log('[CelebrationOverlay] Creating explosion at:', { x, y, color: color.getHexString(), particleCount })
  
  const explosion = new Explosion(
    new THREE.Vector3(x, y, 0),
    color,
    particleCount
  )
  
  scene.add(explosion.particles)
  explosions.push(explosion)
}

// 烟花编排
function scheduleFireworks() {
  const centerX = 0
  const centerY = 50
  
  // t=0.0s 第一朵，正中央，金色
  setTimeout(() => {
    createExplosion(centerX, centerY, 0, 200)
  }, 100)
  
  // t=0.3s 左上 + 右上
  setTimeout(() => {
    createExplosion(-150, 100, 2, 120)
    createExplosion(150, 100, 1, 120)
  }, 400)
  
  // t=0.7s 随机散落3朵
  setTimeout(() => {
    createExplosion(-200, -50, 1, 100)
    createExplosion(0, 150, 0, 100)
    createExplosion(200, -50, 2, 100)
  }, 800)
  
  // t=1.2s 最大一朵，纯白核心 + 外圈彩虹
  setTimeout(() => {
    createExplosion(centerX, centerY, 3, 250)
  }, 1300)
  
  // t=1.8s 收尾小碎花
  setTimeout(() => {
    for (let i = 0; i < 6; i++) {
      setTimeout(() => {
        const angle = (i / 6) * Math.PI * 2
        const radius = 200
        createExplosion(
          Math.cos(angle) * radius,
          Math.sin(angle) * radius + 50,
          i % CONFIG.colors.length,
          80
        )
      }, i * 80)
    }
  }, 1900)
  
  // t=2.5s 显示卡片
  setTimeout(() => {
    showCard.value = true
  }, 2500)
  
  // 显示跳过提示
  setTimeout(() => {
    showHint.value = true
  }, 1000)
}

// 处理跳过
function handleSkip() {
  if (showCard.value) return
  closeCelebration()
}

// 处理继续
function handleContinue() {
  emit('continue')
  closeCelebration()
}

// 关闭庆祝
function closeCelebration() {
  showCard.value = false
  showHint.value = false
  
  // 清理 Three.js
  if (animationId) {
    cancelAnimationFrame(animationId)
    animationId = null
  }
  
  explosions.forEach(explosion => {
    if (scene) scene.remove(explosion.particles)
    explosion.dispose()
  })
  explosions = []
  
  if (renderer) {
    renderer.dispose()
    renderer = null
  }
  
  emit('close')
}

// 窗口大小调整
function handleResize() {
  if (!renderer || !camera || !canvasRef.value) return
  
  const overlay = canvasRef.value.parentElement
  if (!overlay) return
  
  const rect = overlay.getBoundingClientRect()
  const width = rect.width
  const height = rect.height
  
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setSize(width, height)
}

// 监听 visible 变化
watch(() => props.visible, async (newVal) => {
  console.log('[CelebrationOverlay] visible changed:', newVal)
  if (newVal) {
    // 等待 DOM 更新
    await nextTick()
    // 再等待一帧确保布局完成
    await new Promise(resolve => requestAnimationFrame(resolve))
    console.log('[CelebrationOverlay] DOM ready, canvas:', canvasRef.value)
    initThree()
  } else {
    closeCelebration()
  }
})

onMounted(() => {
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
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
  background: radial-gradient(ellipse at center, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.6) 100%);
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
  background: linear-gradient(135deg, 
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
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.6; }
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

/* Transitions */
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