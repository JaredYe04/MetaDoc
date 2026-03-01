<template>
  <div class="dummy-view">
    <Empty :description="t('dummyView.emptyDescription')">
      <template #image>
        <div class="logo-container" :class="{ shake: isShaking }" @click="handleClick">
          <div class="logo-animation-wrapper">
            <LogoIcon
              :size="128"
              :bg-color="bgColor"
              :symbol-color="symbolColor"
              class="logo-image"
            />
          </div>
        </div>
      </template>
    </Empty>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Empty } from '@renderer/components/ui/empty'
import { FIXED_LOGO_COLORS } from '../utils/themes'
import LogoIcon from '../components/LogoIcon.vue'

const { t } = useI18n()

const isShaking = ref(false)

// Logo 固定配色，不随亮/暗主题变化
const bgColor = FIXED_LOGO_COLORS.bgColor
const symbolColor = FIXED_LOGO_COLORS.symbolColor

const handleClick = () => {
  isShaking.value = true
  setTimeout(() => {
    isShaking.value = false
  }, 1500) // 动画持续时间
}
</script>

<style scoped>
.dummy-view {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--background, #ffffff);
}

.logo-container {
  display: inline-block;
  transition: transform 0.3s ease;
  cursor: pointer;
}

.logo-container:hover {
  transform: scale(1.2);
}

/* 摇晃时也应用 scale(1.2) ，transition 会平滑过渡 */
.logo-container.shake {
  transform: scale(1.2);
}

.logo-container.shake:hover {
  transform: scale(1.2);
}

.logo-animation-wrapper {
  display: inline-block;
}

.logo-image {
  display: block;
  filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.15));
}

/* 摇晃动画 - 只包含位移和旋转，scale 由外层容器处理 */
@keyframes shake {
  0%,
  100% {
    transform: translateX(0) rotate(0deg);
  }
  10%,
  30%,
  50%,
  70%,
  90% {
    transform: translateX(-10px) rotate(-5deg);
  }
  20%,
  40%,
  60%,
  80% {
    transform: translateX(10px) rotate(5deg);
  }
}

/* 摇晃时内层容器应用动画 */
.logo-container.shake .logo-animation-wrapper {
  animation: shake 1.5s ease-in-out;
}
</style>
