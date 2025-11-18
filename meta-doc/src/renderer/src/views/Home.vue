<template>
  <div id="particle-bg" class="homepage">
    <WorkspaceTabs
      closable
      @update:activeId="handleTabChange"
      @close="handleCloseTab"
    />

    <div v-if="quickStartStage === 'inactive'" class="center-content">
      <h1
        class="main-letter"
        v-if="showWelcome"
        @mouseover="highlightM"
        @mouseleave="resetM"
      >
        {{ $t('home.metaDoc') }}
      </h1>

      <div class="buttons aero-div" v-if="showWelcome">
        <el-tooltip :content="$t('home.tooltip.quickStart')" placement="top">
          <el-button type="primary" @click="openQuickStart" class="aero-btn">
            {{ $t('home.button.quickStart') }}
          </el-button>
        </el-tooltip>
        <el-tooltip :content="$t('home.tooltip.openFile')" placement="top">
          <el-button type="success" @click="openFile" class="aero-btn">
            {{ $t('home.button.openFile') }}
          </el-button>
        </el-tooltip>
      </div>

      <div v-else class="document-preview">
        <el-scrollbar class="md-metainfo" min-size="10">
          <h1 class="md-title" :style="{ color: themeState.currentTheme.textColor }">
            {{ metaTitle }}
          </h1>
          <div class="md-author" :style="{ color: themeState.currentTheme.textColor }">
            <h3>{{ $t('home.authorLabel') }}：{{ metaAuthor }}</h3>
          </div>
          <div class="md-description" :style="{ color: themeState.currentTheme.textColor }">
            <h3>{{ $t('home.abstractLabel') }}</h3>
            {{ metaDescription }}
          </div>
        </el-scrollbar>

        <el-scrollbar class="md-container">
          <MdPreview
            class="md-preview-fixed"
            :modelValue="previewMarkdown"
            previewTheme="github"
            :theme="previewTheme"
            :codeFold="false"
            :autoFoldThreshold="300"
            :class="themeState.currentTheme.mdeditorClass"
          />
        </el-scrollbar>
      </div>
    </div>

    <div v-else-if="quickStartStage === 'format'" class="center-content quick-start-format-wrapper">
      <div class="aero-div quick-start-format" :style="formatContainerStyle">
        <h2 class="main-letter">{{ $t('home.quickStartFormatTitle') }}</h2>
        <div class="quick-start-format__options">
          <div
            class="quick-start-format__option"
            :style="formatOptionStyle"
            @click="selectQuickStartFormat('md')"
          >
            <h3>Markdown</h3>
            <p>{{ $t('home.quickStartFormatDescriptionMarkdown') }}</p>
          </div>
          <div
            class="quick-start-format__option"
            :style="formatOptionStyle"
            @click="selectQuickStartFormat('tex')"
          >
            <h3>LaTeX</h3>
            <p>{{ $t('home.quickStartFormatDescriptionLatex') }}</p>
          </div>
        </div>
        <div class="quick-start-format__actions">
          <el-button class="aero-btn" @click="closeQuickStart">
            {{ $t('home.tooltip.close') }}
          </el-button>
        </div>
      </div>
    </div>

    <QuickStartMarkdown
      v-else-if="quickStartStage === 'markdown'"
      @close="handleQuickStartClose"
    />
    <QuickStartLatex
      v-else
      @close="handleQuickStartClose"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import * as THREE from 'three'
import { MdPreview, type Themes } from 'md-editor-v3'
import WorkspaceTabs from '../components/workspace/WorkspaceTabs.vue'
import QuickStartMarkdown from '../components/home/QuickStartMarkdown.vue'
import QuickStartLatex from '../components/home/QuickStartLatex.vue'
import '../assets/aero-div.css'
import '../assets/aero-btn.css'
import '../assets/aero-input.css'
import eventBus, { getWindowType } from '../utils/event-bus'
import { createRendererLogger } from '../utils/logger'
import { getSetting } from '../utils/settings'
import localIpcRenderer from '../utils/web-adapter/local-ipc-renderer'
import { webMainCalls } from '../utils/web-adapter/web-main-calls'
import { themeState } from '../utils/themes'
import { useWorkspace } from '../stores/workspace'
import { useActiveDocument } from '../composables/useActiveDocument'
import { convertLatexToMarkdown, extractPlainTextFromLatex } from '../utils/latex-utils'

const { t } = useI18n()

type IpcRendererLike = {
  invoke?: (channel: string, ...args: any[]) => Promise<any>
  send?: (channel: string, data?: any) => void
  on?: (channel: string, func: (...args: any[]) => void) => void
}

const maybeWindow =
  typeof window !== 'undefined'
    ? (window as Window & { electron?: { ipcRenderer?: IpcRendererLike } })
    : undefined

const workspace = useWorkspace()
const {
  tabs,
  activeTabId,
  initializeDocumentFromTemplate,
  activateTab,
  ensureDocument,
  removeTab
} = workspace
const { activeDocument } = useActiveDocument()

const quickStartStage = ref<'inactive' | 'format' | 'markdown' | 'latex'>('inactive')

const currentFilePath = computed(() => activeDocument.value?.path ?? '')
const metaTitle = computed(() => activeDocument.value?.meta?.title ?? '')
const metaAuthor = computed(() => activeDocument.value?.meta?.author ?? '')
const metaDescription = computed(() => activeDocument.value?.meta?.description ?? '')

const previewMarkdown = computed(() => {
  const doc = activeDocument.value
  if (!doc) return ''
  if (doc.format === 'tex') {
    return convertLatexToMarkdown(doc.tex ?? '')
  }
  return doc.markdown ?? ''
})

const previewTheme = computed<Themes>(() => themeState.currentTheme.mdeditorTheme as Themes)

// 粒子效果使用的文本：根据文档格式选择对应的文本源
// cut_words 分词函数可以直接处理任何文本格式（包括 LaTeX），不需要转换
const particleMarkdown = computed(() => {
  const doc = activeDocument.value
  if (!doc) return ''
  
  // 根据文档格式选择文本源
  if (doc.format === 'tex') {
    // LaTeX 格式：直接使用 LaTeX 文本进行分词
    return doc.tex ?? ''
  }
  
  // Markdown 格式：直接使用 Markdown 文本
  return doc.markdown ?? ''
})

const showWelcome = computed(() => quickStartStage.value === 'inactive' && currentFilePath.value === '')

const formatContainerStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  background: themeState.currentTheme.quickStartBackground1
}))

const formatOptionStyle = computed(() => ({
  background: themeState.currentTheme.quickStartBackground2
}))

const openQuickStart = () => {
  eventBus.emit('reset-quickstart')
  quickStartStage.value = 'format'
}

const closeQuickStart = () => {
  quickStartStage.value = 'inactive'
  eventBus.emit('reset-quickstart')
}

const handleQuickStartClose = () => {
  closeQuickStart()
}

const selectQuickStartFormat = (format: 'md' | 'tex') => {
  const tabId = activeTabId.value
  if (!tabId) return
  try {
    initializeDocumentFromTemplate(tabId, format)
  } catch (error) {
    logger.warn('初始化文档模板失败', error)
  }
  eventBus.emit('reset-quickstart')
  quickStartStage.value = format === 'md' ? 'markdown' : 'latex'
}

const highlightM = () => {
  const el = document.querySelector('.main-letter') as HTMLElement | null
  if (el) el.style.color = 'rgb(50, 150, 250)'
}

const resetM = () => {
  const el = document.querySelector('.main-letter') as HTMLElement | null
  if (el) el.style.color = 'rgb(65,105,225)'
}

const openFile = () => {
  eventBus.emit('open-doc')
}

// 粒子效果逻辑
const mouseX = ref(0)
const mouseY = ref(0)
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let renderer: THREE.WebGLRenderer | null = null
let particles: THREE.Object3D | null = null
let animationFrameId: number | null = null
let isAnimating = false

// 缓存容器尺寸，避免每帧查询 DOM
let cachedContainerWidth = 0
let cachedContainerHeight = 0

// 现代配色方案 - 使用渐变色和柔和的色调
const colorPalettes = [
  // 蓝紫渐变
  [
    { r: 99 / 255, g: 102 / 255, b: 241 / 255 }, // 靛蓝
    { r: 139 / 255, g: 92 / 255, b: 246 / 255 }, // 紫色
    { r: 168 / 255, g: 85 / 255, b: 247 / 255 }, // 粉紫
    { r: 59 / 255, g: 130 / 255, b: 246 / 255 }, // 蓝色
  ],
  // 青绿渐变
  [
    { r: 34 / 255, g: 197 / 255, b: 94 / 255 },  // 绿色
    { r: 59 / 255, g: 130 / 255, b: 246 / 255 }, // 蓝色
    { r: 14 / 255, g: 165 / 255, b: 233 / 255 }, // 青色
    { r: 6 / 255, g: 182 / 255, b: 212 / 255 },  // 浅青
  ],
  // 暖色渐变
  [
    { r: 249 / 255, g: 115 / 255, b: 22 / 255 }, // 橙色
    { r: 239 / 255, g: 68 / 255, b: 68 / 255 },  // 红色
    { r: 236 / 255, g: 72 / 255, b: 153 / 255 }, // 粉红
    { r: 251 / 255, g: 146 / 255, b: 60 / 255 }, // 浅橙
  ],
  // 冷色渐变
  [
    { r: 59 / 255, g: 130 / 255, b: 246 / 255 }, // 蓝色
    { r: 14 / 255, g: 165 / 255, b: 233 / 255 }, // 青色
    { r: 99 / 255, g: 102 / 255, b: 241 / 255 }, // 靛蓝
    { r: 6 / 255, g: 182 / 255, b: 212 / 255 },  // 浅青
  ],
]

// 合并所有配色方案，让粒子从所有配色中选择颜色
const getAllColors = () => {
  return colorPalettes.flat() // 将所有配色方案合并成一个数组
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
    b: color1.b + (color2.b - color1.b) * t,
  }
}

const logger = createRendererLogger('Home', {
  windowTypeProvider: () => getWindowType()
})

let ipcRenderer: IpcRendererLike | null = null
if (maybeWindow?.electron?.ipcRenderer) {
  ipcRenderer = maybeWindow.electron.ipcRenderer
} else {
  webMainCalls()
  ipcRenderer = localIpcRenderer as IpcRendererLike
}

const initThreeJS = () => {
  logger.debug('[Particle] initThreeJS: 开始初始化 Three.js')
  
  // 如果已经初始化，先清理
  if (renderer) {
    logger.debug('[Particle] initThreeJS: 检测到已有 renderer，先清理')
    if (renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement)
    }
    renderer.dispose()
  }
  
  scene = new THREE.Scene()
  logger.debug('[Particle] initThreeJS: Scene 创建', { scene })
  
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 2000)
  camera.position.z = 800
  logger.debug('[Particle] initThreeJS: Camera 创建', { 
    aspect: camera.aspect, 
    position: { x: camera.position.x, y: camera.position.y, z: camera.position.z }
  })

  const container = document.getElementById('particle-bg')
  if (!container) {
    logger.error('[Particle] initThreeJS: 找不到 particle-bg 容器')
    return
  }
  
  // 获取容器的实际尺寸
  const containerRect = container.getBoundingClientRect()
  const containerWidth = containerRect.width || window.innerWidth
  const containerHeight = containerRect.height || window.innerHeight
  
  // 优化渲染器设置：禁用不必要的特性以提高性能
  renderer = new THREE.WebGLRenderer({ 
    alpha: true,
    antialias: false, // 禁用抗锯齿以提高性能
    powerPreference: 'high-performance', // 优先使用高性能GPU
    stencil: false, // 禁用模板缓冲区
    depth: true, // 保留深度缓冲区（用于3D渲染）
  })
  renderer.setSize(containerWidth, containerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)) // 限制像素比以提高性能
  
  // 设置 canvas 样式，使其只在容器内显示（使用 absolute 而不是 fixed）
  renderer.domElement.style.position = 'absolute'
  renderer.domElement.style.top = '0'
  renderer.domElement.style.left = '0'
  renderer.domElement.style.width = '100%'
  renderer.domElement.style.height = '100%'
  renderer.domElement.style.zIndex = '0'
  renderer.domElement.style.pointerEvents = 'none' // 不拦截鼠标事件
  // 移除任何模糊效果
  renderer.domElement.style.filter = 'none'
  
  container.appendChild(renderer.domElement)
  
  // 缓存容器尺寸
  cachedContainerWidth = containerWidth
  cachedContainerHeight = containerHeight
  
  logger.debug('[Particle] initThreeJS: Canvas 已添加到 DOM', { 
    container: container.id,
    containerWidth,
    containerHeight,
    canvas: renderer.domElement,
    zIndex: renderer.domElement.style.zIndex,
    position: renderer.domElement.style.position
  })
  
  logger.debug('[Particle] initThreeJS: Three.js 初始化完成', {
    scene: !!scene,
    camera: !!camera,
    renderer: !!renderer,
    canvas: !!renderer.domElement
  })
}

const disposeParticles = () => {
  logger.debug('[Particle] disposeParticles: 开始清理粒子')
  
  if (!scene) {
    logger.debug('[Particle] disposeParticles: Scene 不存在，跳过清理')
    particles = null
    return
  }
  
  // 重要：清理 scene 中所有可能是粒子的对象（Points 和 Group）
  // 这样即使有多个粒子组被创建，也能全部清理
  const sceneChildren = (scene as any).children ? [...(scene as any).children] : []
  let removedCount = 0
  
  sceneChildren.forEach((child: THREE.Object3D) => {
    if (child instanceof THREE.Points || child instanceof THREE.Group) {
      logger.debug('[Particle] disposeParticles: 发现粒子对象，开始清理', {
        type: child.constructor.name,
        isPoints: child instanceof THREE.Points,
        isGroup: child instanceof THREE.Group
      })
      
      if (scene) {
        scene.remove(child)
        removedCount++
      }
      
      // 清理几何体和材质
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
    logger.debug('[Particle] disposeParticles: 清理完成', { 
      removedCount,
      remainingChildren: (scene as any).children?.length || 0
    })
  }
  
  particles = null
  logger.debug('[Particle] disposeParticles: 粒子清理完成')
}

const createParticles = async () => {
  logger.debug('[Particle] createParticles: 开始创建粒子')
  
  if (!scene) {
    logger.error('[Particle] createParticles: Scene 不存在，无法创建粒子')
    return
  }
  
  disposeParticles()
  
  // 注意：不要重新创建 scene，使用已存在的 scene（与 Home_legacy.vue 保持一致）
  const areaSize = 1500
  // 优化：根据容器大小动态调整粒子数量
  const baseParticleCount = 60 // 减少基础粒子数量
  const scaleFactor = Math.min(cachedContainerWidth * cachedContainerHeight / (1920 * 1080), 1.5)
  const particleCount = Math.floor(baseParticleCount * scaleFactor)
  let wordList: string[] = []

  // 获取文档格式和对应的文本
  // 对于 LaTeX 格式，提取纯文本（移除命令、代码等）；对于 Markdown，直接使用原始文本
  const doc = activeDocument.value
  const docFormat = doc?.format || 'md'
  let textForSegmentation = ''
  
  if (docFormat === 'tex') {
    // LaTeX 格式：提取纯文本内容（移除命令、代码块等）
    textForSegmentation = extractPlainTextFromLatex(doc?.tex ?? '')
    logger.debug('[Particle] createParticles: LaTeX 文本提取完成', {
      originalLength: (doc?.tex ?? '').length,
      extractedLength: textForSegmentation.length
    })
  } else {
    // Markdown 格式：直接使用原始文本
    textForSegmentation = doc?.markdown ?? ''
  }
  
  logger.debug('[Particle] createParticles: 开始分词', { 
    docFormat,
    textLength: textForSegmentation?.length || 0,
    textPreview: textForSegmentation?.substring(0, 100) || ''
  })

  try {
    // 使用处理后的文本进行分词
    const words = await ipcRenderer?.invoke?.('cut-words', { text: textForSegmentation })
    wordList = Array.isArray(words) ? Array.from(new Set(words)) : []
    logger.debug('[Particle] createParticles: 分词完成', { 
      wordCount: wordList.length,
      docFormat 
    })
  } catch (error) {
    logger.warn('[Particle] createParticles: 粒子生成分词失败', error)
  }

  const symbols = '~!@#$%^&*()_+`-={}|[]\\:";\'<>?,./。、，；：""【】《》？！￥…（）—0123456789'
  wordList = wordList.filter((word) => !symbols.includes(word) && word.length > 1)
  logger.debug('[Particle] createParticles: 过滤后的词语数量', { wordCount: wordList.length })

  if (wordList.length < 20) {
    logger.debug('[Particle] createParticles: 使用点粒子效果', { particleCount })
    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(particleCount * 3)
    const colors = new Float32Array(particleCount * 3)

    for (let i = 0; i < particleCount; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * areaSize
      positions[i * 3 + 1] = (Math.random() - 0.5) * areaSize
      positions[i * 3 + 2] = (Math.random() - 0.5) * areaSize

      // 使用所有配色方案合并后的颜色
      const color = getColorFromAllPalettes(i, particleCount)
      colors[i * 3] = color.r
      colors[i * 3 + 1] = color.g
      colors[i * 3 + 2] = color.b
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    // 优化材质设置：禁用不必要的特性
    const material = new THREE.PointsMaterial({
      size: 40 + Math.random() * 15, // 稍微减小尺寸
      vertexColors: true,
      transparent: true,
      opacity: 0.8, // 稍微提高不透明度
      sizeAttenuation: true, // 保持大小衰减
      fog: false, // 禁用雾效以提高性能
    })

    particles = new THREE.Points(geometry, material)
    logger.debug('[Particle] createParticles: 点粒子创建完成')
  } else {
    logger.debug('[Particle] createParticles: 使用文字粒子效果', { 
      wordCount: wordList.length,
      particleCount 
    })
    const group = new THREE.Group()
    const sampled = wordList.sort(() => 0.5 - Math.random()).slice(0, Math.min(wordList.length, particleCount))
    
    logger.debug('[Particle] createParticles: 开始创建 sprite', { sampledCount: sampled.length })
    
    // 优化：减小纹理尺寸以提高性能（从512降到256）
    const textureSize = 256
    
    sampled.forEach((word, index) => {
      // 使用所有配色方案合并后的颜色
      const color = getColorFromAllPalettes(index, sampled.length)
      const r = Math.floor(color.r * 255)
      const g = Math.floor(color.g * 255)
      const b = Math.floor(color.b * 255)
      
      // 字体大小设置
      const fontSize = textureSize * 0.3
      const fontFamily = 'sans-serif'
      const font = `bold ${fontSize}px ${fontFamily}`
      
      // 创建临时 canvas 用于测量文字宽度
      const measureCanvas = document.createElement('canvas')
      const measureCtx = measureCanvas.getContext('2d')
      if (!measureCtx) {
        logger.warn('[Particle] createParticles: 无法获取测量 canvas context', { word, index })
        return
      }
      measureCtx.font = font
      
      // 设置最大宽度（像素），超过此宽度则截断并添加省略号
      const maxTextWidth = textureSize * 2 // 最大宽度为 textureSize 的 2 倍
      const minTextWidth = textureSize * 0.5 // 最小宽度为 textureSize 的 0.5 倍
      
      // 测量原始文字宽度
      let displayText = word
      let textWidth = measureCtx.measureText(displayText).width
      
      // 如果文字过长，截断并添加省略号
      if (textWidth > maxTextWidth) {
        const ellipsis = '...'
        const ellipsisWidth = measureCtx.measureText(ellipsis).width
        const maxCharWidth = maxTextWidth - ellipsisWidth
        
        // 二分查找最大可显示字符数
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
      
      // 计算 canvas 宽度（至少为 textureSize，最多为 maxTextWidth）
      const canvasWidth = Math.max(textureSize, Math.min(maxTextWidth, Math.max(minTextWidth, textWidth + 20))) // 添加 20px 的边距
      const canvasHeight = textureSize
      
      // 创建实际的 canvas
      const canvas = document.createElement('canvas')
      canvas.width = canvasWidth
      canvas.height = canvasHeight
      const ctx = canvas.getContext('2d', { 
        willReadFrequently: false, // 优化：不会频繁读取，让浏览器优化
        alpha: true 
      })
      if (!ctx) {
        logger.warn('[Particle] createParticles: 无法获取 canvas context', { word, index })
        return
      }

      ctx.clearRect(0, 0, canvasWidth, canvasHeight)
      
      ctx.font = font
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = `rgba(${r},${g},${b},0.9)`
      ctx.fillText(displayText, canvasWidth / 2, canvasHeight / 2)

      // 优化纹理设置
      const texture = new THREE.CanvasTexture(canvas)
      // 使用线性过滤以提高性能，禁用 mipmap
      // LinearFilter 的值为 1006
      ;(texture as any).minFilter = 1006 // THREE.LinearFilter
      ;(texture as any).magFilter = 1006 // THREE.LinearFilter
      ;(texture as any).generateMipmaps = false
      ;(texture as any).needsUpdate = true
      
      const material = new THREE.SpriteMaterial({ 
        map: texture, 
        transparent: true,
        fog: false, // 禁用雾效以提高性能
      })
      const sprite = new THREE.Sprite(material)

      sprite.position.set(
        (Math.random() - 0.5) * areaSize,
        (Math.random() - 0.5) * areaSize,
        (Math.random() - 0.5) * areaSize
      )

      // 根据 canvas 宽度调整缩放，使文字显示比例一致
      // 基础缩放为 100-220，然后根据宽度比例调整
      const baseScale = 100 + Math.random() * 120
      const widthRatio = canvasWidth / textureSize // 相对于基础宽度的比例
      const scale = baseScale * widthRatio // 按宽度比例调整
      sprite.scale.set(scale, baseScale, 1) // 高度保持基础缩放，宽度按比例调整

      group.add(sprite)
    })
    particles = group
    logger.debug('[Particle] createParticles: 文字粒子创建完成', { 
      spriteCount: (group as any).children?.length || 0
    })
  }

  if (scene && particles) {
    scene.add(particles)
    logger.debug('[Particle] createParticles: 粒子已添加到 scene', { 
      particlesType: particles.constructor.name,
      sceneChildrenCount: (scene as any).children?.length || 0
    })
  } else {
    logger.error('[Particle] createParticles: 无法添加粒子到 scene', { 
      hasScene: !!scene, 
      hasParticles: !!particles 
    })
  }
}

const startAnimation = () => {
  if (isAnimating) {
    logger.debug('[Particle] startAnimation: 动画已在运行，跳过')
    return
  }
  
  if (!renderer || !camera || !scene) {
    logger.error('[Particle] startAnimation: 缺少必要的 Three.js 对象', {
      hasRenderer: !!renderer,
      hasCamera: !!camera,
      hasScene: !!scene
    })
    return
  }
  
  logger.debug('[Particle] startAnimation: 开始动画循环')
  isAnimating = true
  animate()
}

const stopAnimation = () => {
  logger.debug('[Particle] stopAnimation: 停止动画循环')
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
  isAnimating = false
  renderer?.clear()
}

let animateFrameCount = 0
const animate = () => {
  if (!isAnimating || !renderer || !camera || !scene) {
    logger.debug('[Particle] animate: 动画条件不满足，退出', {
      isAnimating,
      hasRenderer: !!renderer,
      hasCamera: !!camera,
      hasScene: !!scene
    })
    return
  }

  animationFrameId = requestAnimationFrame(animate)
  animateFrameCount++

  // 每60帧记录一次日志（约1秒）
  // if (animateFrameCount % 60 === 0) {
  //   logger.debug('[Particle] animate: 动画运行中', {
  //     frame: animateFrameCount,
  //     enabled: particleEffectEnabled.value,
  //     hasParticles: !!particles,
  //     sceneChildrenCount: (scene as any).children?.length || 0
  //   })
  // }

  if (!particleEffectEnabled.value) {
    renderer.clear()
    isAnimating = false
    animationFrameId = null
    logger.debug('[Particle] animate: 粒子效果已禁用，停止动画')
    return
  }

  if (!particles) {
    if (animateFrameCount % 60 === 0) {
      logger.warn('[Particle] animate: Particles 不存在')
    }
    return
  }

  // 使用缓存的容器尺寸，避免每帧都查询 DOM（性能优化）
  const containerWidth = cachedContainerWidth || window.innerWidth
  const containerHeight = cachedContainerHeight || window.innerHeight
  
  // 优化：使用增量旋转，避免每帧都重新计算
  const baseRotationSpeed = 0.0005
  const mouseRotationFactor = 0.08 // 提高鼠标跟随速度
  
  // 分别更新旋转（优化后的算法）
  particles.rotation.x += baseRotationSpeed + (mouseY.value / containerHeight) * mouseRotationFactor
  particles.rotation.y += baseRotationSpeed + (mouseX.value / containerWidth) * mouseRotationFactor

  try {
    renderer.render(scene, camera)
  } catch (error) {
    logger.error('[Particle] animate: 渲染失败', error)
    isAnimating = false
    animationFrameId = null
  }
}

const onMouseMove = (event: MouseEvent) => {
  mouseX.value = (event.clientX - window.innerWidth / 2) * 0.1
  mouseY.value = (event.clientY - window.innerHeight / 2) * 0.1
}

const onWindowResize = () => {
  if (!camera || !renderer) {
    logger.debug('[Particle] onWindowResize: Camera 或 Renderer 不存在')
    return
  }
  
  // 获取容器的实际尺寸，而不是窗口尺寸
  const container = document.getElementById('particle-bg')
  if (!container) {
    logger.debug('[Particle] onWindowResize: 找不到 particle-bg 容器')
    return
  }
  
  const containerRect = container.getBoundingClientRect()
  const containerWidth = containerRect.width || window.innerWidth
  const containerHeight = containerRect.height || window.innerHeight
  
  // 更新缓存
  cachedContainerWidth = containerWidth
  cachedContainerHeight = containerHeight
  
  logger.debug('[Particle] onWindowResize: 容器大小改变', {
    containerWidth,
    containerHeight,
    windowWidth: window.innerWidth,
    windowHeight: window.innerHeight
  })
  
  camera.aspect = containerWidth / containerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(containerWidth, containerHeight)
}

const preventNavigate = () => {
  document.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement | null)?.closest('a') as HTMLAnchorElement | null
    if (target && target.href && target.target !== '_blank') {
      event.preventDefault()
      const url = target.href
      if (url.startsWith('http')) {
        eventBus.emit('open-link', url)
      }
    }
  })
}

const particleEffectEnabled = ref(false)
let isCreatingParticles = false // 标记是否正在创建粒子，防止重复创建
let eventHandlerRegistered = false // 标记事件处理器是否已注册
let eventHandlerRef: (() => Promise<void>) | null = null // 保存事件处理器的引用，用于移除
let watchUnwatch: (() => void) | null = null // 保存 watch 的取消函数
let lastMarkdownHash = 0 // 记录上次 markdown 的哈希值，避免重复重建
let lastParticleCreationTime = 0 // 记录上次创建粒子的时间，用于防抖
let particleEffectInitialized = false // 标记 particleEffect 是否已初始化，防止重复调用

// 计算 markdown 的简单哈希（用于判断内容是否真正变化）
const getMarkdownHash = (text: string): number => {
  return text.length + (text.substring(0, 100) || '').replace(/\s/g, '').length
}

const particleEffect = async () => {
  logger.debug('[Particle] particleEffect: 开始初始化粒子效果系统', {
    particleEffectInitialized,
    eventHandlerRegistered,
    hasScene: !!scene,
    hasParticles: !!particles
  })
  
  // 防止重复初始化（但如果 Three.js 对象丢失，需要重新初始化）
  if (particleEffectInitialized && scene && camera && renderer) {
    logger.debug('[Particle] particleEffect: 已初始化且 Three.js 对象存在，跳过')
    // 即使已初始化，也要触发一次检查（如果粒子不存在）
    if (!particles && !particleEffectEnabled.value && !isCreatingParticles) {
      logger.debug('[Particle] particleEffect: 已初始化但粒子不存在，触发检查')
      nextTick(() => {
        if (!particles && !particleEffectEnabled.value && !isCreatingParticles) {
          eventBus.emit('toggle-particle-effect', {})
        }
      })
    }
    return
  }
  
  particleEffectInitialized = true
  logger.debug('[Particle] particleEffect: 标记为已初始化')
  
  // 先初始化 Three.js（如果不存在或丢失）
  if (!scene || !camera || !renderer) {
    logger.debug('[Particle] particleEffect: Three.js 未初始化或已丢失，开始初始化')
    initThreeJS()
  } else {
    logger.debug('[Particle] particleEffect: Three.js 已初始化，跳过')
  }
  
  // 确保事件处理器只注册一次
  // 先移除可能存在的旧处理器（防止重复注册）
  if (eventHandlerRef) {
    logger.debug('[Particle] particleEffect: 移除旧的事件处理器')
    eventBus.off('toggle-particle-effect', eventHandlerRef)
    eventHandlerRef = null
    eventHandlerRegistered = false
  }
  
  if (!eventHandlerRegistered) {
    eventHandlerRegistered = true
    logger.debug('[Particle] particleEffect: 注册 toggle-particle-effect 事件处理器')
    
    // 定义事件处理器
    const eventHandler = async () => {
      const now = Date.now()
      logger.debug('[Particle] toggle-particle-effect: 收到事件', { 
        isCreatingParticles,
        hasParticles: !!particles,
        sceneChildrenCount: scene ? (scene as any).children?.length || 0 : 0,
        timeSinceLastCreation: now - lastParticleCreationTime,
        timestamp: now
      })
      
      // 首先检查：如果正在创建粒子，立即跳过（最优先检查，避免竞态条件）
      if (isCreatingParticles) {
        logger.debug('[Particle] toggle-particle-effect: 正在创建粒子，跳过')
        return
      }
      
      // 其次检查：如果已经创建了粒子且存在于 scene 中，跳过
      if (particles && scene && (scene as any).children?.includes(particles as any)) {
        logger.debug('[Particle] toggle-particle-effect: 粒子已存在，跳过创建', {
          particlesType: particles.constructor.name,
          sceneChildrenCount: (scene as any).children?.length || 0
        })
        return
      }
      
      // 防抖：如果距离上次创建时间少于 500ms，跳过（合理的防抖时间）
      // 只在 lastParticleCreationTime > 0 时检查（首次创建时 lastParticleCreationTime 为 0）
      if (lastParticleCreationTime > 0 && now - lastParticleCreationTime < 500) {
        logger.debug('[Particle] toggle-particle-effect: 防抖保护，跳过（距离上次创建太近）', {
          timeSinceLastCreation: now - lastParticleCreationTime
        })
        return
      }
      
      // 立即设置标记和时间戳，防止并发执行（在检查之后立即设置）
      // 必须在所有异步操作之前设置，防止并发
      isCreatingParticles = true
      lastParticleCreationTime = now
      
      try {
        const enabled = await getSetting('particleEffect')
        logger.debug('[Particle] toggle-particle-effect: 设置状态', { enabled })
        
        if (enabled) {
          particleEffectEnabled.value = true
          
          // 确保 Three.js 已初始化
          if (!scene || !camera || !renderer) {
            logger.warn('[Particle] toggle-particle-effect: Three.js 未初始化，重新初始化')
            initThreeJS()
          }
          
          // 先清理所有现有粒子，确保 scene 干净
          disposeParticles()
          
          logger.debug('[Particle] toggle-particle-effect: 开始创建粒子')
          await createParticles()
          
          // 更新 markdown 哈希
          lastMarkdownHash = getMarkdownHash(particleMarkdown.value || '')
          
          logger.debug('[Particle] toggle-particle-effect: 粒子创建完成', {
            hasParticles: !!particles,
            sceneChildrenCount: scene ? (scene as any).children?.length || 0 : 0
          })
          
          // 检查 canvas 是否在 DOM 中
          if (renderer && !renderer.domElement.parentNode) {
            logger.warn('[Particle] toggle-particle-effect: Canvas 不在 DOM 中，重新添加')
            const container = document.getElementById('particle-bg')
            if (container) {
              container.appendChild(renderer.domElement)
            }
          }
          
          startAnimation()
        } else {
          particleEffectEnabled.value = false
          stopAnimation()
          disposeParticles()
          logger.debug('[Particle] toggle-particle-effect: 粒子效果已禁用')
        }
      } catch (error) {
        logger.error('[Particle] toggle-particle-effect: 处理失败', error)
      } finally {
        // 确保在 finally 中重置标记，即使出错也要重置
        isCreatingParticles = false
      }
    }
    
    // 保存事件处理器引用（用于后续移除）
    eventHandlerRef = eventHandler
    
    // 注册事件处理器
    eventBus.on('toggle-particle-effect', eventHandler)
    logger.debug('[Particle] particleEffect: 事件处理器已注册')
  } else {
    logger.debug('[Particle] particleEffect: 事件处理器已注册，跳过')
  }

  // 监听 markdown 变化，重建粒子（改进逻辑：只在内容真正变化且在当前 Home 视图时重建）
  if (!watchUnwatch) {
    watchUnwatch = watch(
      () => particleMarkdown.value,
      (newValue, oldValue) => {
        // 如果粒子效果未启用，不重建
        if (!particleEffectEnabled.value) {
          return
        }
        
        // 如果正在创建粒子，跳过
        if (isCreatingParticles) {
          return
        }
        
        // 如果内容没有真正变化（使用哈希判断），跳过
        const newHash = getMarkdownHash(newValue || '')
        if (newHash === lastMarkdownHash) {
          logger.debug('[Particle] watch particleMarkdown: 内容未真正变化（哈希相同），跳过重建')
          return
        }
        
        // 只有在内容长度有明显变化时才重建（避免切换 Tab 时重建）
        const oldLength = oldValue?.length || 0
        const newLength = newValue?.length || 0
        const lengthDiff = Math.abs(newLength - oldLength)
        
        // 如果只是轻微变化（小于 10%），可能是切换 Tab，不重建
        if (oldLength > 0 && lengthDiff < oldLength * 0.1 && lengthDiff < 100) {
          logger.debug('[Particle] watch particleMarkdown: 内容变化太小，可能是切换 Tab，跳过重建', {
            oldLength,
            newLength,
            lengthDiff
          })
          return
        }
        
        logger.debug('[Particle] watch particleMarkdown: 内容变化，重建粒子', {
          oldLength,
          newLength,
          lengthDiff,
          oldHash: lastMarkdownHash,
          newHash
        })
        
        // 防止重复创建
        if (!isCreatingParticles) {
          isCreatingParticles = true
          // 先清理所有现有粒子
          disposeParticles()
          
          createParticles()
            .then(() => {
              // 更新 markdown 哈希
              lastMarkdownHash = newHash
            })
            .catch((err) => logger.error('[Particle] watch: 粒子重建失败', err))
            .finally(() => {
              isCreatingParticles = false
            })
        }
      }
    )
  }

  // 触发初始状态检查（只在未创建粒子且事件处理器已注册时触发）
  // 注意：此时 scene 可能已经初始化（在 particleEffect 中），所以不检查 scene
  if (eventHandlerRegistered && !isCreatingParticles && !particleEffectEnabled.value && !particles) {
    logger.debug('[Particle] particleEffect: 准备触发初始状态检查')
    // 使用 nextTick 确保事件处理器已经注册完成
    nextTick(() => {
      // 再次检查，确保在 nextTick 期间没有其他操作修改状态
      if (!isCreatingParticles && !particleEffectEnabled.value && !particles && eventHandlerRegistered) {
        logger.debug('[Particle] particleEffect: 执行触发初始状态检查')
        eventBus.emit('toggle-particle-effect', {})
      } else {
        logger.debug('[Particle] particleEffect: 初始状态检查已取消（状态已变化）', {
          isCreatingParticles,
          particleEffectEnabled: particleEffectEnabled.value,
          hasParticles: !!particles,
          eventHandlerRegistered
        })
      }
    })
  } else {
    logger.debug('[Particle] particleEffect: 跳过触发初始状态检查', {
      isCreatingParticles,
      particleEffectEnabled: particleEffectEnabled.value,
      hasParticles: !!particles,
      eventHandlerRegistered
    })
  }
}

const scheduleParticleEffect = () => {
  const runner = () => {
    particleEffect().catch((err) => logger.warn('粒子效果初始化失败', err))
  }
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(() => runner())
  } else {
    setTimeout(runner, 0)
  }
}

onMounted(() => {
  scheduleParticleEffect()
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('resize', onWindowResize)
  preventNavigate()
})

onBeforeUnmount(() => {
  logger.debug('[Particle] onBeforeUnmount: 开始清理')
  
  // 取消 watch
  if (watchUnwatch) {
    watchUnwatch()
    watchUnwatch = null
  }
  
  // 移除事件处理器（防止重复注册导致多次触发）
  if (eventHandlerRef && eventHandlerRegistered) {
    logger.debug('[Particle] onBeforeUnmount: 移除事件处理器')
    eventBus.off('toggle-particle-effect', eventHandlerRef)
    eventHandlerRef = null
  }
  
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('resize', onWindowResize)
  stopAnimation()
  disposeParticles()
  
  if (renderer) {
    if (renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement)
      logger.debug('[Particle] onBeforeUnmount: Canvas 已从 DOM 移除')
    }
    renderer.dispose()
    logger.debug('[Particle] onBeforeUnmount: Renderer 已销毁')
  }
  
  // 重置标记
  isCreatingParticles = false
  eventHandlerRegistered = false
  lastMarkdownHash = 0
  lastParticleCreationTime = 0
  particleEffectInitialized = false
  
  scene = null
  camera = null
  renderer = null
  logger.debug('[Particle] onBeforeUnmount: 清理完成')
})

const handleTabChange = (id: string) => {
  activateTab(id)
}

const handleCloseTab = (id: string) => {
  if (tabs.length <= 1) return
  removeTab(id)
}
</script>

<style scoped>
#particle-bg {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  /* 确保容器内的内容在 canvas 之上 */
  z-index: 0;
}

.homepage {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 确保 WorkspaceTabs 在 canvas 之上 */
.homepage :deep(.workspace-tabs-wrapper) {
  position: relative;
  z-index: 1;
}

/* 确保 QuickStartMarkdown 和 QuickStartLatex 在 canvas 之上 */
.homepage :deep(.quick-start-markdown),
.homepage :deep(.quick-start-latex) {
  position: relative;
  z-index: 1;
}

/* 确保 Three.js canvas 只在 #particle-bg 容器内显示，在最底层 */
#particle-bg canvas {
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
  width: 100% !important;
  height: 100% !important;
  z-index: 0 !important;
  pointer-events: none !important;
}

.center-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  width: 100%;
  height: 100%;
  padding: 32px 24px;
  box-sizing: border-box;
  /* 确保内容在 canvas 之上 */
  position: relative;
  z-index: 1;
}

.main-letter {
  font-size: 80px;
  font-weight: 700;
  color: rgb(65, 105, 225);
  margin: 0;
  transition: color 0.3s ease;
}

.main-letter:hover {
  color: rgb(50, 150, 250);
}

.buttons {
  display: flex;
  gap: 16px;
  padding: 20px 32px;
  border-radius: 16px;
}

.document-preview {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 80vw;
  /* 确保内容在 canvas 之上 */
  position: relative;
  z-index: 1;
}

.md-metainfo {
  width: 100%;
  max-height: 25vh;
  overflow: auto;
  border-radius: 12px;
}

.md-title {
  margin: 0 0 12px;
}

.md-author,
.md-description {
  margin-bottom: 12px;
}

.md-container {
  max-height: 63vh;
  height: 63vh;
  overflow: auto;
  width: 100%;
  border: 1px #cccccc44 solid;
  border-radius: 10px;
}

.md-preview-fixed {
  max-width: 100%;
  word-wrap: break-word;
  overflow-wrap: break-word;
  white-space: pre-wrap;
  box-sizing: border-box;
}

.quick-start-format-wrapper {
  height: 100%;
  width: 100%;
  justify-content: center;
  /* 确保内容在 canvas 之上 */
  position: relative;
  z-index: 1;
}

.quick-start-format {
  width: 60vw;
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  border-radius: 16px;
  backdrop-filter: blur(20px) brightness(1.05);
}

.quick-start-format__options {
  width: 100%;
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  justify-content: center;
}

.quick-start-format__option {
  flex: 1 1 240px;
  padding: 20px;
  border-radius: 16px;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
}

.quick-start-format__option:hover {
  transform: translateY(-4px);
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.2);
}

.quick-start-format__actions {
  display: flex;
  justify-content: flex-end;
}

.homepage :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
}
</style>
