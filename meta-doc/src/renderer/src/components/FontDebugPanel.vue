<script setup>
import { ref, onMounted } from 'vue'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { 
  getAppliedFontVariables, 
  getConfiguredFonts, 
  verifyFontApplication,
  refreshFontSettings,
  diagnoseFonts
} from '@renderer/utils/font-verification.js'

const fontVars = ref({})
const configured = ref({})
const verification = ref(null)
const loading = ref(false)

async function loadFontStatus() {
  loading.value = true
  try {
    fontVars.value = getAppliedFontVariables()
    configured.value = await getConfiguredFonts()
    verification.value = await verifyFontApplication()
  } catch (error) {
    console.error('加载字体状态失败:', error)
  } finally {
    loading.value = false
  }
}

async function handleRefresh() {
  await refreshFontSettings()
  await loadFontStatus()
}

function handleDiagnose() {
  diagnoseFonts()
}

onMounted(() => {
  loadFontStatus()
})
</script>

<template>
  <Card class="font-debug-panel">
    <CardHeader>
      <CardTitle class="flex items-center justify-between">
        字体状态
        <div class="flex gap-2">
          <Button size="sm" variant="outline" @click="handleDiagnose" :disabled="loading">
            控制台诊断
          </Button>
          <Button size="sm" @click="handleRefresh" :disabled="loading">
            {{ loading ? '刷新中...' : '刷新' }}
          </Button>
        </div>
      </CardTitle>
    </CardHeader>
    <CardContent class="space-y-4">
      <div v-if="verification" class="status-summary">
        <Badge :variant="verification.success ? 'success' : 'destructive'">
          {{ verification.success ? '所有字体正常' : '字体配置异常' }}
        </Badge>
      </div>

      <div class="font-sections space-y-4">
        <div class="font-section">
          <h4 class="font-medium mb-2">UI字体</h4>
          <div class="text-sm space-y-1">
            <div class="flex justify-between">
              <span class="text-muted-foreground">配置:</span>
              <span>{{ configured.ui }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">应用:</span>
              <span class="font-mono text-xs truncate max-w-[200px]">{{ fontVars.uiFont }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">状态:</span>
              <Badge v-if="verification" size="sm" :variant="verification.checks?.uiFont ? 'success' : 'destructive'">
                {{ verification.checks?.uiFont ? '正常' : '异常' }}
              </Badge>
            </div>
          </div>
        </div>

        <div class="font-section">
          <h4 class="font-medium mb-2">编辑器字体</h4>
          <div class="text-sm space-y-1">
            <div class="flex justify-between">
              <span class="text-muted-foreground">中文配置:</span>
              <span>{{ configured.editorChinese }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">西文配置:</span>
              <span>{{ configured.editorWestern }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">应用:</span>
              <span class="font-mono text-xs truncate max-w-[200px]" :title="fontVars.editorFont">
                {{ fontVars.editorFont }}
              </span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">状态:</span>
              <div v-if="verification" class="flex gap-1">
                <Badge size="sm" :variant="verification.checks?.editorChinese ? 'success' : 'destructive'">
                  中文{{ verification.checks?.editorChinese ? '✓' : '✗' }}
                </Badge>
                <Badge size="sm" :variant="verification.checks?.editorWestern ? 'success' : 'destructive'">
                  西文{{ verification.checks?.editorWestern ? '✓' : '✗' }}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        <div class="font-section">
          <h4 class="font-medium mb-2">预览字体</h4>
          <div class="text-sm space-y-1">
            <div class="flex justify-between">
              <span class="text-muted-foreground">中文配置:</span>
              <span>{{ configured.previewChinese }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">西文配置:</span>
              <span>{{ configured.previewWestern }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">应用:</span>
              <span class="font-mono text-xs truncate max-w-[200px]" :title="fontVars.previewFont">
                {{ fontVars.previewFont }}
              </span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">状态:</span>
              <div v-if="verification" class="flex gap-1">
                <Badge size="sm" :variant="verification.checks?.previewChinese ? 'success' : 'destructive'">
                  中文{{ verification.checks?.previewChinese ? '✓' : '✗' }}
                </Badge>
                <Badge size="sm" :variant="verification.checks?.previewWestern ? 'success' : 'destructive'">
                  西文{{ verification.checks?.previewWestern ? '✓' : '✗' }}
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="verification?.loaded" class="font-loading-status pt-4 border-t">
        <h4 class="font-medium mb-2">字体加载状态</h4>
        <div class="grid grid-cols-2 gap-2 text-sm">
          <div v-for="(loaded, name) in verification.loaded.details" :key="name" 
               class="flex items-center justify-between p-2 bg-muted rounded">
            <span class="capitalize">{{ name }}</span>
            <Badge size="sm" :variant="loaded ? 'success' : 'warning'">
              {{ loaded ? '已加载' : '未加载' }}
            </Badge>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
</template>

<style scoped>
.font-debug-panel {
  margin-top: 1rem;
}

.font-section {
  padding: 0.75rem;
  background-color: hsl(var(--muted) / 0.5);
  border-radius: var(--radius);
}

.font-mono {
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
}

.truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
