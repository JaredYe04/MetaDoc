import * as THREE from 'three'
import { ref, watch, nextTick, type ComputedRef } from 'vue'
import type { RendererLogger } from './logger'
import type { extractPlainTextFromLatex } from '../latex-utils'
import messageBridge from '../bridge/message-bridge'

export type IpcRendererLike = {
  invoke?: (channel: string, ...args: any[]) => Promise<any>
  send?: (channel: string, data?: any) => void
  on?: (channel: string, func: (...args: any[]) => void) => void
}

// 现代配色方案 - 使用渐变色和柔和的色调
const colorPalettes = [
  // 蓝紫渐变
  [
    { r: 99 / 255, g: 102 / 255, b: 241 / 255 }, // 靛蓝
    { r: 139 / 255, g: 92 / 255, b: 246 / 255 }, // 紫色
    { r: 168 / 255, g: 85 / 255, b: 247 / 255 }, // 粉紫
    { r: 59 / 255, g: 130 / 255, b: 246 / 255 } // 蓝色
  ],
  // 青绿渐变
  [
    { r: 34 / 255, g: 197 / 255, b: 94 / 255 }, // 绿色
    { r: 59 / 255, g: 130 / 255, b: 246 / 255 }, // 蓝色
    { r: 14 / 255, g: 165 / 255, b: 233 / 255 }, // 青色
    { r: 6 / 255, g: 182 / 255, b: 212 / 255 } // 浅青
  ],
  // 暖色渐变
  [
    { r: 249 / 255, g: 115 / 255, b: 22 / 255 }, // 橙色
    { r: 239 / 255, g: 68 / 255, b: 68 / 255 }, // 红色
    { r: 236 / 255, g: 72 / 255, b: 153 / 255 }, // 粉红
    { r: 251 / 255, g: 146 / 255, b: 60 / 255 } // 浅橙
  ],
  // 冷色渐变
  [
    { r: 59 / 255, g: 130 / 255, b: 246 / 255 }, // 蓝色
    { r: 14 / 255, g: 165 / 255, b: 233 / 255 }, // 青色
    { r: 99 / 255, g: 102 / 255, b: 241 / 255 }, // 靛蓝
    { r: 6 / 255, g: 182 / 255, b: 212 / 255 } // 浅青
  ]
]

// 合并所有配色方案，让粒子从所有配色中选择颜色
const getAllColors = () => {
  return colorPalettes.flat()
}

// 从所有配色方案中获取颜色（带渐变）
const getColorFromAllPalettes = (index: number, total: number) => {
  const allColors = getAllColors()
  const colorIndex = Math.floor((index / total) * allColors.length)
  const color1 = allColors[colorIndex % allColors.length]
  const color2 = allColors[(colorIndex + 1) % allColors.length]
  const t = (index / total) * allColors.length - colorIndex

  return {
    r: color1.r + (color2.r - color1.r) * t,
    g: color1.g + (color2.g - color1.g) * t,
    b: color1.b + (color2.b - color1.b) * t
  }
}

// 计算 markdown 的简单哈希（用于判断内容是否真正变化）
const getMarkdownHash = (text: string): number => {
  return text.length + (text.substring(0, 100) || '').replace(/\s/g, '').length
}

export interface ParticleEffectOptions {
  logger: RendererLogger
  eventBus: any
  getSetting: (key: string) => Promise<any>
  ipcRenderer: IpcRendererLike | null
  particleMarkdown: ComputedRef<string>
  extractPlainTextFromLatex: typeof extractPlainTextFromLatex
  containerId?: string
}

export class ParticleEffect {
  private logger: RendererLogger
  private eventBus: any
  private getSetting: (key: string) => Promise<any>
  private ipcRenderer: IpcRendererLike | null
  private particleMarkdown: ComputedRef<string>
  private extractPlainTextFromLatex: typeof extractPlainTextFromLatex
  private containerId: string

  // Three.js 对象
  private scene: THREE.Scene | null = null
  private camera: THREE.PerspectiveCamera | null = null
  private renderer: THREE.WebGLRenderer | null = null
  private particles: THREE.Object3D | null = null
  private animationFrameId: number | null = null
  private isAnimating = false

  // 鼠标位置
  private mouseX = ref(0)
  private mouseY = ref(0)

  // 缓存容器尺寸
  private cachedContainerWidth = 0
  private cachedContainerHeight = 0

  // 状态管理
  private particleEffectEnabled = ref(false)
  private isCreatingParticles = false
  private eventHandlerRegistered = false
  private eventHandlerRef: (() => Promise<void>) | null = null
  private watchUnwatch: (() => void) | null = null
  private lastMarkdownHash = 0
  private lastParticleCreationTime = 0
  private particleEffectInitialized = false

  constructor(options: ParticleEffectOptions) {
    this.logger = options.logger
    this.eventBus = options.eventBus
    this.getSetting = options.getSetting
    this.ipcRenderer = options.ipcRenderer
    this.particleMarkdown = options.particleMarkdown
    this.extractPlainTextFromLatex = options.extractPlainTextFromLatex
    this.containerId = options.containerId || 'particle-bg'
  }

  // 初始化 Three.js
  private initThreeJS() {
    this.logger.debug('[Particle] initThreeJS: 开始初始化 Three.js')

    // 如果已经初始化，先清理
    if (this.renderer) {
      this.logger.debug('[Particle] initThreeJS: 检测到已有 renderer，先清理')
      if (this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement)
      }
      this.renderer.dispose()
    }

    this.scene = new THREE.Scene()
    this.logger.debug('[Particle] initThreeJS: Scene 创建', { scene: this.scene })

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 2000)
    this.camera.position.z = 800
    this.logger.debug('[Particle] initThreeJS: Camera 创建', {
      aspect: this.camera.aspect,
      position: { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z }
    })

    const container = document.getElementById(this.containerId)
    if (!container) {
      this.logger.error('[Particle] initThreeJS: 找不到 particle-bg 容器')
      return
    }

    // 获取容器的实际尺寸
    const containerRect = container.getBoundingClientRect()
    const containerWidth = containerRect.width || window.innerWidth
    const containerHeight = containerRect.height || window.innerHeight

    // 优化渲染器设置：禁用不必要的特性以提高性能
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true
    })
    this.renderer.setSize(containerWidth, containerHeight)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    // 设置 canvas 样式
    this.renderer.domElement.style.position = 'absolute'
    this.renderer.domElement.style.top = '0'
    this.renderer.domElement.style.left = '0'
    this.renderer.domElement.style.width = '100%'
    this.renderer.domElement.style.height = '100%'
    this.renderer.domElement.style.zIndex = '0'
    this.renderer.domElement.style.pointerEvents = 'none'
    this.renderer.domElement.style.filter = 'none'
    // 初始状态隐藏 canvas，只有在启用粒子效果时才显示
    this.renderer.domElement.style.display = 'none'

    container.appendChild(this.renderer.domElement)

    // 缓存容器尺寸
    this.cachedContainerWidth = containerWidth
    this.cachedContainerHeight = containerHeight

    this.logger.debug('[Particle] initThreeJS: Three.js 初始化完成', {
      scene: !!this.scene,
      camera: !!this.camera,
      renderer: !!this.renderer,
      canvas: !!this.renderer.domElement
    })
  }

  // 清理粒子
  private disposeParticles() {
    this.logger.debug('[Particle] disposeParticles: 开始清理粒子')

    if (!this.scene) {
      this.logger.debug('[Particle] disposeParticles: Scene 不存在，跳过清理')
      this.particles = null
      return
    }

    const sceneChildren = (this.scene as any).children ? [...(this.scene as any).children] : []
    let removedCount = 0

    sceneChildren.forEach((child: THREE.Object3D) => {
      if (child instanceof THREE.Points || child instanceof THREE.Group) {
        if (this.scene) {
          this.scene.remove(child)
          removedCount++
        }

        if (child instanceof THREE.Points) {
          const points = child as any
          if (points.geometry) points.geometry.dispose()
          if (points.material) {
            if (Array.isArray(points.material)) {
              points.material.forEach((mat: THREE.Material) => mat.dispose())
            } else {
              points.material.dispose()
            }
          }
        } else if (child instanceof THREE.Group) {
          const group = child as any
          if (group.children && Array.isArray(group.children)) {
            group.children.forEach((sprite: THREE.Object3D) => {
              if (sprite instanceof THREE.Sprite && sprite.material) {
                const material = sprite.material as THREE.SpriteMaterial
                if (material.map) material.map.dispose()
                material.dispose()
              }
            })
          }
        }
      }
    })

    if (removedCount > 0) {
      this.logger.debug('[Particle] disposeParticles: 清理完成', {
        removedCount,
        remainingChildren: (this.scene as any).children?.length || 0
      })
    }

    this.particles = null
  }

  // 创建粒子
  private async createParticles() {
    this.logger.debug('[Particle] createParticles: 开始创建粒子')

    if (!this.scene) {
      this.logger.error('[Particle] createParticles: Scene 不存在，无法创建粒子')
      return
    }

    this.disposeParticles()

    const areaSize = 1500
    // 减少基础粒子数量，让画面更清爽
    const baseParticleCount = 40
    const scaleFactor = Math.min(
      (this.cachedContainerWidth * this.cachedContainerHeight) / (1920 * 1080),
      1.2
    )
    const particleCount = Math.floor(baseParticleCount * scaleFactor)
    let wordList: string[] = []

    // 获取文档格式和对应的文本
    const docText = this.particleMarkdown.value || ''
    let textForSegmentation = docText

    // 判断是否为 LaTeX 格式（通过检查是否包含 LaTeX 命令）
    const isLaTeX =
      docText.includes('\\section') ||
      docText.includes('\\begin{') ||
      docText.includes('\\documentclass') ||
      docText.includes('\\subsection')

    if (isLaTeX) {
      textForSegmentation = this.extractPlainTextFromLatex(docText)
      this.logger.debug('[Particle] createParticles: LaTeX 文本提取完成', {
        originalLength: docText.length,
        extractedLength: textForSegmentation.length
      })
    }

    this.logger.debug('[Particle] createParticles: 开始分词', {
      isLaTeX,
      textLength: textForSegmentation?.length || 0,
      textPreview: textForSegmentation?.substring(0, 100) || ''
    })

    try {
      const words = await messageBridge.invoke('cut-words', { text: textForSegmentation })
      wordList = Array.isArray(words) ? Array.from(new Set(words)) : []
      this.logger.debug('[Particle] createParticles: 分词完成', {
        wordCount: wordList.length,
        isLaTeX
      })
    } catch (error) {
      this.logger.warn('[Particle] createParticles: 粒子生成分词失败', error)
    }

    const symbols = '~!@#$%^&*()_+`-={}|[]\\:";\'<>?,./。、，；：""【】《》？！￥…（）—0123456789'
    wordList = wordList.filter((word) => !symbols.includes(word) && word.length > 1)
    this.logger.debug('[Particle] createParticles: 过滤后的词语数量', {
      wordCount: wordList.length
    })

    if (wordList.length < 20) {
      this.logger.debug('[Particle] createParticles: 使用点粒子效果', { particleCount })
      const geometry = new THREE.BufferGeometry()
      const positions = new Float32Array(particleCount * 3)
      const colors = new Float32Array(particleCount * 3)

      for (let i = 0; i < particleCount; i += 1) {
        positions[i * 3] = (Math.random() - 0.5) * areaSize
        positions[i * 3 + 1] = (Math.random() - 0.5) * areaSize
        positions[i * 3 + 2] = (Math.random() - 0.5) * areaSize

        const color = getColorFromAllPalettes(i, particleCount)
        colors[i * 3] = color.r
        colors[i * 3 + 1] = color.g
        colors[i * 3 + 2] = color.b
      }

      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

      const material = new THREE.PointsMaterial({
        size: 30 + Math.random() * 10,
        vertexColors: true,
        transparent: true,
        opacity: 0.6,
        sizeAttenuation: true,
        fog: false,
        blending: THREE.AdditiveBlending
      })

      this.particles = new THREE.Points(geometry, material)
      this.logger.debug('[Particle] createParticles: 点粒子创建完成')
    } else {
      this.logger.debug('[Particle] createParticles: 使用文字粒子效果', {
        wordCount: wordList.length,
        particleCount
      })
      const group = new THREE.Group()
      const sampled = wordList
        .sort(() => 0.5 - Math.random())
        .slice(0, Math.min(wordList.length, particleCount))

      const textureSize = 256

      sampled.forEach((word, index) => {
        const color = getColorFromAllPalettes(index, sampled.length)
        const r = Math.floor(color.r * 255)
        const g = Math.floor(color.g * 255)
        const b = Math.floor(color.b * 255)

        const fontSize = textureSize * 0.3
        const fontFamily = 'sans-serif'
        const font = `bold ${fontSize}px ${fontFamily}`

        const measureCanvas = document.createElement('canvas')
        const measureCtx = measureCanvas.getContext('2d')
        if (!measureCtx) {
          this.logger.warn('[Particle] createParticles: 无法获取测量 canvas context', {
            word,
            index
          })
          return
        }
        measureCtx.font = font

        const maxTextWidth = textureSize * 2
        const minTextWidth = textureSize * 0.5

        let displayText = word
        let textWidth = measureCtx.measureText(displayText).width

        if (textWidth > maxTextWidth) {
          const ellipsis = '...'
          const ellipsisWidth = measureCtx.measureText(ellipsis).width
          const maxCharWidth = maxTextWidth - ellipsisWidth

          let left = 0
          let right = word.length
          let bestLength = 0

          while (left <= right) {
            const mid = Math.floor((left + right) / 2)
            const testText = word.substring(0, mid)
            const testWidth = measureCtx.measureText(testText).width

            if (testWidth <= maxCharWidth) {
              bestLength = mid
              left = mid + 1
            } else {
              right = mid - 1
            }
          }

          displayText = word.substring(0, bestLength) + ellipsis
          textWidth = measureCtx.measureText(displayText).width
        }

        const canvasWidth = Math.max(
          textureSize,
          Math.min(maxTextWidth, Math.max(minTextWidth, textWidth + 20))
        )
        const canvasHeight = textureSize

        const canvas = document.createElement('canvas')
        canvas.width = canvasWidth
        canvas.height = canvasHeight
        const ctx = canvas.getContext('2d', {
          willReadFrequently: false,
          alpha: true
        })
        if (!ctx) {
          this.logger.warn('[Particle] createParticles: 无法获取 canvas context', { word, index })
          return
        }

        ctx.clearRect(0, 0, canvasWidth, canvasHeight)

        ctx.font = font
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = `rgba(${r},${g},${b},0.9)`
        ctx.fillText(displayText, canvasWidth / 2, canvasHeight / 2)

        const texture = new THREE.CanvasTexture(canvas)
        ;(texture as any).minFilter = 1006 // THREE.LinearFilter
        ;(texture as any).magFilter = 1006 // THREE.LinearFilter
        ;(texture as any).generateMipmaps = false
        ;(texture as any).needsUpdate = true

        const material = new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          fog: false
        })
        const sprite = new THREE.Sprite(material)

        sprite.position.set(
          (Math.random() - 0.5) * areaSize,
          (Math.random() - 0.5) * areaSize,
          (Math.random() - 0.5) * areaSize
        )

        // 减小文字粒子的大小，让画面更清爽
        const baseScale = 80 + Math.random() * 60
        const widthRatio = canvasWidth / textureSize
        const scale = baseScale * widthRatio
        sprite.scale.set(scale, baseScale, 1)

        // 添加轻微的透明度变化，增强层次感
        material.opacity = 0.6 + Math.random() * 0.2

        group.add(sprite)
      })
      this.particles = group
      this.logger.debug('[Particle] createParticles: 文字粒子创建完成', {
        spriteCount: (group as any).children?.length || 0
      })
    }

    if (this.scene && this.particles) {
      this.scene.add(this.particles)
      this.logger.debug('[Particle] createParticles: 粒子已添加到 scene', {
        particlesType: this.particles.constructor.name,
        sceneChildrenCount: (this.scene as any).children?.length || 0
      })
    }
  }

  // 开始动画
  private startAnimation() {
    if (this.isAnimating) {
      this.logger.debug('[Particle] startAnimation: 动画已在运行，跳过')
      return
    }

    if (!this.renderer || !this.camera || !this.scene) {
      this.logger.error('[Particle] startAnimation: 缺少必要的 Three.js 对象')
      return
    }

    this.logger.debug('[Particle] startAnimation: 开始动画循环')
    this.isAnimating = true
    this.animate()
  }

  // 停止动画
  private stopAnimation() {
    this.logger.debug('[Particle] stopAnimation: 停止动画循环')
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }
    this.isAnimating = false
    this.renderer?.clear()
    // 隐藏 canvas，避免显示黑色背景
    if (this.renderer?.domElement) {
      this.renderer.domElement.style.display = 'none'
    }
  }

  // 动画循环
  private animate = () => {
    if (!this.isAnimating || !this.renderer || !this.camera || !this.scene) {
      return
    }

    this.animationFrameId = requestAnimationFrame(this.animate)

    if (!this.particleEffectEnabled.value) {
      this.renderer.clear()
      this.isAnimating = false
      this.animationFrameId = null
      return
    }

    if (!this.particles) {
      return
    }

    const containerWidth = this.cachedContainerWidth || window.innerWidth
    const containerHeight = this.cachedContainerHeight || window.innerHeight

    // 更慢的旋转速度，让画面更稳定
    const baseRotationSpeed = 0.0001
    const mouseRotationFactor = 0.06

    this.particles.rotation.x +=
      baseRotationSpeed + (this.mouseY.value / containerHeight) * mouseRotationFactor
    this.particles.rotation.y +=
      baseRotationSpeed + (this.mouseX.value / containerWidth) * mouseRotationFactor

    try {
      this.renderer.render(this.scene, this.camera)
    } catch (error) {
      this.logger.error('[Particle] animate: 渲染失败', error)
      this.isAnimating = false
      this.animationFrameId = null
    }
  }

  // 处理鼠标移动
  handleMouseMove(event: MouseEvent) {
    this.mouseX.value = (event.clientX - window.innerWidth / 2) * 0.1
    this.mouseY.value = (event.clientY - window.innerHeight / 2) * 0.1
  }

  // 处理窗口大小变化
  handleWindowResize() {
    if (!this.camera || !this.renderer) {
      return
    }

    const container = document.getElementById(this.containerId)
    if (!container) {
      return
    }

    const containerRect = container.getBoundingClientRect()
    const containerWidth = containerRect.width || window.innerWidth
    const containerHeight = containerRect.height || window.innerHeight

    this.cachedContainerWidth = containerWidth
    this.cachedContainerHeight = containerHeight

    this.camera.aspect = containerWidth / containerHeight
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(containerWidth, containerHeight)
  }

  // 初始化粒子效果
  async init() {
    this.logger.debug('[Particle] particleEffect: 开始初始化粒子效果系统', {
      particleEffectInitialized: this.particleEffectInitialized,
      eventHandlerRegistered: this.eventHandlerRegistered,
      hasScene: !!this.scene,
      hasParticles: !!this.particles
    })

    if (this.particleEffectInitialized && this.scene && this.camera && this.renderer) {
      this.logger.debug('[Particle] particleEffect: 已初始化且 Three.js 对象存在，跳过')
      if (!this.particles && !this.particleEffectEnabled.value && !this.isCreatingParticles) {
        this.logger.debug('[Particle] particleEffect: 已初始化但粒子不存在，触发检查')
        nextTick(() => {
          if (!this.particles && !this.particleEffectEnabled.value && !this.isCreatingParticles) {
            this.eventBus.emit('toggle-particle-effect', {})
          }
        })
      }
      return
    }

    this.particleEffectInitialized = true

    if (!this.scene || !this.camera || !this.renderer) {
      this.initThreeJS()
    }

    if (this.eventHandlerRef) {
      this.eventBus.off('toggle-particle-effect', this.eventHandlerRef)
      this.eventHandlerRef = null
      this.eventHandlerRegistered = false
    }

    if (!this.eventHandlerRegistered) {
      this.eventHandlerRegistered = true

      const eventHandler = async () => {
        const now = Date.now()

        if (this.isCreatingParticles) {
          return
        }

        if (
          this.particles &&
          this.scene &&
          (this.scene as any).children?.includes(this.particles as any)
        ) {
          return
        }

        if (this.lastParticleCreationTime > 0 && now - this.lastParticleCreationTime < 500) {
          return
        }

        this.isCreatingParticles = true
        this.lastParticleCreationTime = now

        try {
          const enabled = await this.getSetting('particleEffect')

          if (enabled) {
            this.particleEffectEnabled.value = true

            if (!this.scene || !this.camera || !this.renderer) {
              this.initThreeJS()
            }

            this.disposeParticles()
            await this.createParticles()

            this.lastMarkdownHash = getMarkdownHash(this.particleMarkdown.value || '')

            if (this.renderer && !this.renderer.domElement.parentNode) {
              const container = document.getElementById(this.containerId)
              if (container) {
                container.appendChild(this.renderer.domElement)
              }
            }

            // 显示 canvas
            if (this.renderer?.domElement) {
              this.renderer.domElement.style.display = 'block'
            }

            this.startAnimation()
          } else {
            this.particleEffectEnabled.value = false
            this.stopAnimation()
            this.disposeParticles()
            // 确保 canvas 被隐藏
            if (this.renderer?.domElement) {
              this.renderer.domElement.style.display = 'none'
            }
          }
        } catch (error) {
          this.logger.error('[Particle] toggle-particle-effect: 处理失败', error)
        } finally {
          this.isCreatingParticles = false
        }
      }

      this.eventHandlerRef = eventHandler
      this.eventBus.on('toggle-particle-effect', eventHandler)
    }

    if (!this.watchUnwatch) {
      this.watchUnwatch = watch(
        () => this.particleMarkdown.value,
        (newValue, oldValue) => {
          if (!this.particleEffectEnabled.value) {
            return
          }

          if (this.isCreatingParticles) {
            return
          }

          const newHash = getMarkdownHash(newValue || '')
          if (newHash === this.lastMarkdownHash) {
            return
          }

          const oldLength = oldValue?.length || 0
          const newLength = newValue?.length || 0
          const lengthDiff = Math.abs(newLength - oldLength)

          if (oldLength > 0 && lengthDiff < oldLength * 0.1 && lengthDiff < 100) {
            return
          }

          if (!this.isCreatingParticles) {
            this.isCreatingParticles = true
            this.disposeParticles()

            this.createParticles()
              .then(() => {
                this.lastMarkdownHash = newHash
              })
              .catch((err) => this.logger.error('[Particle] watch: 粒子重建失败', err))
              .finally(() => {
                this.isCreatingParticles = false
              })
          }
        }
      )
    }

    if (
      this.eventHandlerRegistered &&
      !this.isCreatingParticles &&
      !this.particleEffectEnabled.value &&
      !this.particles
    ) {
      nextTick(() => {
        if (
          !this.isCreatingParticles &&
          !this.particleEffectEnabled.value &&
          !this.particles &&
          this.eventHandlerRegistered
        ) {
          this.eventBus.emit('toggle-particle-effect', {})
        }
      })
    }
  }

  // 清理资源
  dispose() {
    this.logger.debug('[Particle] dispose: 开始清理')

    if (this.watchUnwatch) {
      this.watchUnwatch()
      this.watchUnwatch = null
    }

    if (this.eventHandlerRef && this.eventHandlerRegistered) {
      this.eventBus.off('toggle-particle-effect', this.eventHandlerRef)
      this.eventHandlerRef = null
    }

    this.stopAnimation()
    this.disposeParticles()

    if (this.renderer) {
      if (this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement)
      }
      this.renderer.dispose()
    }

    this.isCreatingParticles = false
    this.eventHandlerRegistered = false
    this.lastMarkdownHash = 0
    this.lastParticleCreationTime = 0
    this.particleEffectInitialized = false

    this.scene = null
    this.camera = null
    this.renderer = null
  }
}
