<template>
  <el-icon v-bind="$attrs">
    <component :is="iconComponent" v-if="iconComponent" />
  </el-icon>
</template>

<script setup>
import { ref, watch, getCurrentInstance } from 'vue'

const props = defineProps({
  /** Element Plus 图标名，如 Edit、InfoFilled、Loading */
  name: { type: String, required: true }
})

const iconComponent = ref(null)
const instance = getCurrentInstance()
const app = instance?.appContext?.app

function ensureIcon() {
  if (!app || !props.name) return
  const name = props.name
  if (app._context.components[name]) {
    iconComponent.value = app._context.components[name]
    return
  }
  import('@element-plus/icons-vue').then((icons) => {
    const Icons = icons.default || icons
    const Comp = Icons[name]
    if (Comp) {
      app.component(name, Comp)
      iconComponent.value = Comp
    }
  })
}

watch(() => props.name, ensureIcon, { immediate: true })
</script>
