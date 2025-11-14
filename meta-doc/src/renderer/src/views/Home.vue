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
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
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
import { convertLatexToMarkdown } from '../utils/latex-utils'

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
const particleMarkdown = computed(() => previewMarkdown.value)

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
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 2000)
  camera.position.z = 800

  renderer = new THREE.WebGLRenderer({ alpha: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.domElement.style.position = 'absolute'
  renderer.domElement.style.top = '0'
  renderer.domElement.style.left = '0'
  renderer.domElement.style.zIndex = '-1'
  renderer.domElement.style.transition = 'filter 1.5s ease'
  document.getElementById('particle-bg')?.appendChild(renderer.domElement)
  createParticles()
}

const disposeParticles = () => {
  if (scene && particles) {
    scene.remove(particles)
  }
  particles = null
}

const createParticles = async () => {
  disposeParticles()
  scene = new THREE.Scene()

  const areaSize = 1500
  const particleCount = 100
  let wordList: string[] = []

  try {
    const words = await ipcRenderer?.invoke?.('cut-words', { text: particleMarkdown.value })
    wordList = Array.isArray(words) ? Array.from(new Set(words)) : []
  } catch (error) {
    logger.warn('粒子生成分词失败', error)
  }

  const symbols = '~!@#$%^&*()_+`-={}|[]\\:";\'<>?,./。、，；：‘’“”【】《》？！￥…（）—0123456789'
  wordList = wordList.filter((word) => !symbols.includes(word) && word.length > 1)

  if (wordList.length < 20) {
    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(particleCount * 3)
    const colors = new Float32Array(particleCount * 3)

    for (let i = 0; i < particleCount; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * areaSize
      positions[i * 3 + 1] = (Math.random() - 0.5) * areaSize
      positions[i * 3 + 2] = (Math.random() - 0.5) * areaSize

      colors[i * 3] = Math.random()
      colors[i * 3 + 1] = Math.random()
      colors[i * 3 + 2] = Math.random()
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const material = new THREE.PointsMaterial({
      size: 50 + Math.random() * 20,
      vertexColors: true,
      transparent: true,
      opacity: 0.7
    })

    particles = new THREE.Points(geometry, material)
  } else {
    const group = new THREE.Group()
    const sampled = wordList.sort(() => 0.5 - Math.random()).slice(0, Math.min(wordList.length, particleCount))
    sampled.forEach((word) => {
      const canvas = document.createElement('canvas')
      const size = 512
      canvas.width = canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.clearRect(0, 0, size, size)
      ctx.font = 'bold 60px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = `rgba(${Math.floor(Math.random() * 255)},${Math.floor(Math.random() * 255)},${Math.floor(
        Math.random() * 255
      )},0.9)`
      ctx.fillText(word, size / 2, size / 2)
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)'
      ctx.lineWidth = 2

      const texture = new THREE.CanvasTexture(canvas)
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true })
      const sprite = new THREE.Sprite(material)

      sprite.position.set(
        (Math.random() - 0.5) * areaSize,
        (Math.random() - 0.5) * areaSize,
        (Math.random() - 0.5) * areaSize
      )

      const scale = 120 + Math.random() * 160
      sprite.scale.set(scale, scale, 1)

      group.add(sprite)
    })
    particles = group
  }

  if (scene && particles) {
    scene.add(particles)
  }
}

const startAnimation = () => {
  if (isAnimating) return
  isAnimating = true
  animate()
}

const stopAnimation = () => {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
  isAnimating = false
  renderer?.clear()
}

const animate = () => {
  if (!isAnimating || !renderer || !camera || !scene) return

  animationFrameId = requestAnimationFrame(animate)

  if (!particleEffectEnabled.value) {
    renderer.clear()
    isAnimating = false
    animationFrameId = null
    return
  }

  if (!particles) {
    return
  }

  particles.rotation.x += 0.0005 + (mouseY.value / window.innerHeight) * 0.05
  particles.rotation.y += 0.0005 + (mouseX.value / window.innerWidth) * 0.05

  renderer.render(scene, camera)
}

const onMouseMove = (event: MouseEvent) => {
  mouseX.value = (event.clientX - window.innerWidth / 2) * 0.1
  mouseY.value = (event.clientY - window.innerHeight / 2) * 0.1
}

const onWindowResize = () => {
  if (!camera || !renderer) return
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
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
const particleEffect = async () => {
  initThreeJS()
  eventBus.on('toggle-particle-effect', async () => {
    const enabled = await getSetting('particleEffect')
    if (enabled) {
      particleEffectEnabled.value = true
      try {
        await createParticles()
      } catch (error) {
        logger.warn('粒子生成失败', error)
      }
      startAnimation()
    } else {
      particleEffectEnabled.value = false
      stopAnimation()
    }
  })

  watch(
    () => particleMarkdown.value,
    (newValue, oldValue) => {
      if (newValue !== oldValue) {
        createParticles().catch((err) => logger.warn('粒子重建失败', err))
      }
    }
  )

  eventBus.emit('toggle-particle-effect', {})
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
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('resize', onWindowResize)
  disposeParticles()
  scene = null
  camera = null
  if (renderer) renderer.dispose()
  renderer = null
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
.homepage {
  position: relative;
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
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
