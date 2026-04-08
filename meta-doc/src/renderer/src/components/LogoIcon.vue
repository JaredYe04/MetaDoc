<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 256 256"
    xmlns="http://www.w3.org/2000/svg"
    class="logo-icon"
  >
    <!-- 背景：平滑圆角矩形（squircle 风格） -->
    <path
      d="
        M64 16
        H192
        C220 16 240 36 240 64
        V192
        C240 220 220 240 192 240
        H64
        C36 240 16 220 16 192
        V64
        C16 36 36 16 64 16
        Z
      "
      :fill="bgColor"
    />

    <!-- 编码符号 </> -->
    <g
      transform="translate(128, 128) scale(1.15) translate(-128, -128)"
      fill="none"
      :stroke="symbolColor"
      :stroke-width="resolvedSymbolStrokeWidth"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <!-- < -->
      <path d="M98 114 L74 128 L98 142" />

      <!-- / -->
      <path d="M138 96 L118 160" />

      <!-- > -->
      <path d="M158 114 L182 128 L158 142" />
    </g>
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  /** 背景颜色 */
  bgColor?: string
  /** 符号（编码图标）颜色 */
  symbolColor?: string
  /** 尺寸（宽度和高度） */
  size?: number | string
}

const props = withDefaults(defineProps<Props>(), {
  bgColor: '#ffffff',
  symbolColor: '#000000',
  size: 256
})

/**
 * 设计稿按 256 CSS 像素对应 stroke-width=11.2；缩到小尺寸时笔画会细到亚像素几乎不可见。
 * 保证小图标在屏幕上至少约 1.5px 粗的笔画。
 */
const resolvedSymbolStrokeWidth = computed(() => {
  const raw = props.size
  const w = typeof raw === 'string' ? parseFloat(raw) : raw
  const px = Number.isFinite(w) && w > 0 ? w : 256
  const design = 11.2
  const minScreenPx = 1.55
  const fromMin = (minScreenPx * 256) / px
  return Math.max(design, fromMin)
})
</script>

<style scoped>
.logo-icon {
  display: block;
}
</style>
