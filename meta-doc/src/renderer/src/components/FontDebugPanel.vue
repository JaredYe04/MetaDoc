<script setup>
import { ref, onMounted } from 'vue'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { 
  getAppliedFontVariables, 
  getConfiguredFonts, 
  verifyFontApplication,
  refreshFontSettings
} from '@renderer/utils/font-verification.js'
import { RefreshCw } from 'lucide-vue-next'

const fontVars = ref({})
const configured = ref({})
const verification = ref(null)
const loading = ref(false)
const expanded = ref(false)

async function loadFontStatus() {
  loading.value = true
  try {
    fontVars.value = getAppliedFontVariables()
    configured.value = await getConfiguredFonts()
    verification.value = await verifyFontApplication()
  } finally {
    loading.value = false
  }
}

async function handleRefresh() {
  await refreshFontSettings()
  await loadFontStatus()
}

onMounted(() => {
  loadFontStatus()
})
</script>

<template>
  <div class="font-debug-panel border rounded-lg p-3 bg-muted/30">
    <div class="flex items-center justify-between cursor-pointer" @click="expanded = !expanded">
      <div class="flex items-center gap-2">
        <span class="text-sm font-medium">字体预览</span>
        <Badge v-if="verification" size="sm" :variant="verification.success ? 'default' : 'destructive'">
          {{ verification.success ? '正常' : '异常' }}
        </Badge>
      </div>
      <div class="flex items-center gap-2">
        <Button size="icon" variant="ghost" class="h-6 w-6" @click.stop="handleRefresh" :disabled="loading">
          <RefreshCw class="h-3 w-3" :class="{ 'animate-spin': loading }" />
        </Button>
        <span class="text-xs text-muted-foreground">{{ expanded ? '收起' : '展开' }}</span>
      </div>
    </div>

    <div v-show="expanded" class="mt-3 space-y-3">
      <div class="grid grid-cols-1 gap-2">
        <div class="font-preview-item p-2 bg-background rounded border">
          <div class="flex justify-between items-center mb-1">
            <span class="text-xs text-muted-foreground">UI字体</span>
            <Badge v-if="verification" size="sm" :variant="verification.checks?.uiFont ? 'default' : 'destructive'">
              {{ configured.ui }}
            </Badge>
          </div>
          <div class="text-lg" :style="{ fontFamily: fontVars.uiFont }">
            AaBbCc 你好世界
          </div>
        </div>

        <div class="font-preview-item p-2 bg-background rounded border">
          <div class="flex justify-between items-center mb-1">
            <span class="text-xs text-muted-foreground">编辑器字体</span>
            <div v-if="verification" class="flex gap-1">
              <Badge size="sm" :variant="verification.checks?.editorChinese ? 'default' : 'destructive'">
                {{ configured.editorChinese }}
              </Badge>
              <Badge size="sm" :variant="verification.checks?.editorWestern ? 'default' : 'destructive'">
                {{ configured.editorWestern }}
              </Badge>
            </div>
          </div>
          <div class="text-lg font-mono" :style="{ fontFamily: fontVars.editorFont }">
            function hello() { return "你好世界"; }
          </div>
        </div>

        <div class="font-preview-item p-2 bg-background rounded border">
          <div class="flex justify-between items-center mb-1">
            <span class="text-xs text-muted-foreground">预览字体</span>
            <div v-if="verification" class="flex gap-1">
              <Badge size="sm" :variant="verification.checks?.previewChinese ? 'default' : 'destructive'">
                {{ configured.previewChinese }}
              </Badge>
              <Badge size="sm" :variant="verification.checks?.previewWestern ? 'default' : 'destructive'">
                {{ configured.previewWestern }}</Badge>
            </div>
          </div>
          <div class="text-base" :style="{ fontFamily: fontVars.previewFont }">
            This is a **Markdown** preview 这是预览文本
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.font-debug-panel {
  margin-top: 1rem;
}

.font-preview-item {
  transition: all 0.2s ease;
}

.font-preview-item:hover {
  border-color: hsl(var(--border) / 0.8);
}

.font-mono {
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
}
</style>
