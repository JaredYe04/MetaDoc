/**
 * 图片/SVG 预览 - 拖动、缩放、适应等操作
 * 从 ImagePreviewDialog 解耦，供多处复用
 */

import { ref, computed, watch, nextTick, type Ref } from 'vue'

export interface UseImagePreviewOptions {
  /** 图片 URL，变化时重置并重新计算适应 */
  imageUrl: Ref<string | undefined>
  /** 容器元素 ref，用于计算适应比例 */
  containerRef: Ref<HTMLElement | null>
  /** 图片元素选择器或 ref，用于获取尺寸 */
  getImageElement?: () => HTMLImageElement | null
  /** 容器内边距（用于计算可用空间） */
  containerPadding?: number
}

export function useImagePreview(options: UseImagePreviewOptions) {
  const {
    imageUrl,
    containerRef,
    getImageElement = () =>
      document.querySelector('.image-preview-viewer-img') as HTMLImageElement | null,
    containerPadding = 24
  } = options

  const imageScale = ref(1)
  const imagePosition = ref({ x: 0, y: 0 })
  const isDragging = ref(false)
  const dragStart = ref({ x: 0, y: 0 })

  const imageScalePercent = computed({
    get: () => Math.round(imageScale.value * 100),
    set: (val: number) => {
      imageScale.value = Math.max(0.1, Math.min(5, val / 100))
    }
  })

  const previewImageStyle = computed(() => ({
    transform: `translate(${imagePosition.value.x}px, ${imagePosition.value.y}px) scale(${imageScale.value})`,
    transformOrigin: 'center center',
    cursor: isDragging.value ? 'grabbing' : 'grab'
  }))

  const calculateFitScale = (img: HTMLImageElement): number => {
    const container = containerRef.value
    if (!container) return 1

    const imgWidth = img.naturalWidth || img.width || 1
    const imgHeight = img.naturalHeight || img.height || 1
    if (imgWidth <= 0 || imgHeight <= 0) return 1

    const containerWidth = container.clientWidth - containerPadding * 2
    const containerHeight = container.clientHeight - containerPadding * 2
    if (containerWidth <= 0 || containerHeight <= 0) return 1

    const scaleX = containerWidth / imgWidth
    const scaleY = containerHeight / imgHeight
    const fitScale = Math.min(scaleX, scaleY)
    return fitScale > 0 && isFinite(fitScale) ? fitScale : 1
  }

  const calculateAndSetFitScale = () => {
    nextTick(() => {
      const img = getImageElement()
      if (!img) return

      const setFitScale = () => {
        setTimeout(() => {
          if (img.naturalWidth > 0 && img.naturalHeight > 0) {
            const fitScale = calculateFitScale(img)
            if (fitScale > 0 && isFinite(fitScale)) {
              imageScale.value = fitScale
              imagePosition.value = { x: 0, y: 0 }
            }
          } else {
            setTimeout(() => {
              if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                const fitScale = calculateFitScale(img)
                if (fitScale > 0 && isFinite(fitScale)) {
                  imageScale.value = fitScale
                  imagePosition.value = { x: 0, y: 0 }
                }
              }
            }, 100)
          }
        }, 50)
      }

      if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
        setFitScale()
      } else {
        const onLoad = () => {
          setFitScale()
          img.removeEventListener('load', onLoad)
          img.removeEventListener('error', onError)
        }
        const onError = () => {
          imageScale.value = 1
          img.removeEventListener('load', onLoad)
          img.removeEventListener('error', onError)
        }
        img.addEventListener('load', onLoad)
        img.addEventListener('error', onError)
        if (img.complete) setTimeout(() => setFitScale(), 50)
      }
    })
  }

  watch(imageUrl, (url) => {
    if (url) {
      imagePosition.value = { x: 0, y: 0 }
      calculateAndSetFitScale()
    }
  })

  const zoomIn = () => {
    if (imageScale.value < 5) {
      imageScale.value = Math.min(imageScale.value + 0.1, 5)
    }
  }

  const zoomOut = () => {
    if (imageScale.value > 0.1) {
      imageScale.value = Math.max(imageScale.value - 0.1, 0.1)
    }
  }

  const resetZoom = () => {
    const img = getImageElement()
    if (img && img.complete) {
      imageScale.value = calculateFitScale(img)
    } else {
      imageScale.value = 1
    }
    imagePosition.value = { x: 0, y: 0 }
  }

  const handleScaleChange = (val: number | null) => {
    if (val !== null) {
      imageScale.value = Math.max(0.1, Math.min(5, val / 100))
    }
  }

  const handleContainerMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return
    isDragging.value = true
    const container = e.currentTarget as HTMLElement
    const rect = container.getBoundingClientRect()
    const containerCenterX = rect.width / 2
    const containerCenterY = rect.height / 2
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    const offsetX = mouseX - containerCenterX
    const offsetY = mouseY - containerCenterY
    dragStart.value = {
      x: offsetX - imagePosition.value.x,
      y: offsetY - imagePosition.value.y
    }
    e.preventDefault()
    e.stopPropagation()
  }

  const handleContainerMouseMove = (e: MouseEvent) => {
    if (!isDragging.value) return
    const container = e.currentTarget as HTMLElement
    const rect = container.getBoundingClientRect()
    const containerCenterX = rect.width / 2
    const containerCenterY = rect.height / 2
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    const offsetX = mouseX - containerCenterX
    const offsetY = mouseY - containerCenterY
    imagePosition.value = {
      x: offsetX - dragStart.value.x,
      y: offsetY - dragStart.value.y
    }
    e.preventDefault()
    e.stopPropagation()
  }

  const handleContainerMouseUp = (e?: MouseEvent) => {
    isDragging.value = false
    e?.preventDefault()
    e?.stopPropagation()
  }

  const handleWheelZoom = (e: WheelEvent) => {
    // 默认使用 Ctrl/Cmd + 滚轮进行缩放，避免影响普通滚动
    const isZoomModifier = e.ctrlKey || e.metaKey
    if (!isZoomModifier) return

    e.preventDefault()
    e.stopPropagation()
    const container = e.currentTarget as HTMLElement
    const rect = container.getBoundingClientRect()
    const img = getImageElement()
    if (!img) return

    const containerCenterX = rect.width / 2
    const containerCenterY = rect.height / 2
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    const offsetX = mouseX - containerCenterX
    const offsetY = mouseY - containerCenterY
    const imageX = (offsetX - imagePosition.value.x) / imageScale.value
    const imageY = (offsetY - imagePosition.value.y) / imageScale.value
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    const newScale = Math.max(0.1, Math.min(5, imageScale.value + delta))
    const newImageX = imageX * newScale
    const newImageY = imageY * newScale
    imagePosition.value = {
      x: offsetX - newImageX,
      y: offsetY - newImageY
    }
    imageScale.value = newScale
  }

  return {
    imageScale,
    imagePosition,
    isDragging,
    imageScalePercent,
    previewImageStyle,
    zoomIn,
    zoomOut,
    resetZoom,
    handleScaleChange,
    handleContainerMouseDown,
    handleContainerMouseMove,
    handleContainerMouseUp,
    handleWheelZoom,
    calculateAndSetFitScale
  }
}
