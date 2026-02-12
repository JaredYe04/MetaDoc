<template>
  <div class="color-display" :style="containerStyle">
    <div v-if="displayData.stage === 'processing'" class="status-message" :style="statusMessageStyle">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>{{ $t('agent.display.color.processing') }}</span>
    </div>

    <div v-else-if="displayData.stage === 'completed' && displayData.result" class="completed-state" :style="completedStateStyle">
      <div class="color-header" :style="headerStyle">
        <h3 class="color-title" :style="titleStyle">{{ $t('agent.display.color.title') }}</h3>
        <el-tag type="info" size="small">{{ getOperationLabel(displayData.operation) }}</el-tag>
      </div>

      <div class="color-content" :style="contentStyle">
        <!-- 颜色混合操作 -->
        <div v-if="displayData.operation === 'mix'" class="color-mix-section">
          <div class="color-comparison" :style="colorComparisonStyle">
            <div class="color-item">
              <div class="color-swatch" :style="getColorSwatchStyle(displayData.input?.color1)">
                <span class="color-value" :style="colorValueStyle">{{ displayData.input?.color1 }}</span>
              </div>
              <div class="color-label" :style="colorLabelStyle">{{ $t('agent.display.color.color1') }}</div>
            </div>
            <div class="mix-operator" :style="operatorStyle">
              <el-icon><Plus /></el-icon>
              <span class="weight-info" :style="weightInfoStyle">{{ $t('agent.display.color.weight', { weight: (displayData.input?.weight || 0.5).toFixed(2) }) }}</span>
            </div>
            <div class="color-item">
              <div class="color-swatch" :style="getColorSwatchStyle(displayData.input?.color2)">
                <span class="color-value" :style="colorValueStyle">{{ displayData.input?.color2 }}</span>
              </div>
              <div class="color-label" :style="colorLabelStyle">{{ $t('agent.display.color.color2') }}</div>
            </div>
            <div class="mix-arrow" :style="operatorStyle">
              <el-icon><ArrowRight /></el-icon>
            </div>
            <div class="color-item result">
              <div class="color-swatch" :style="getColorSwatchStyle(displayData.result)">
                <span class="color-value" :style="colorValueStyle">{{ displayData.result }}</span>
              </div>
              <div class="color-label" :style="colorLabelStyle">{{ $t('agent.display.color.result') }}</div>
            </div>
          </div>
        </div>

        <!-- 亮度/对比度调整操作 -->
        <div v-else-if="displayData.operation === 'brightness' || displayData.operation === 'contrast'" class="color-adjust-section">
          <div class="color-comparison" :style="colorComparisonStyle">
            <div class="color-item">
              <div class="color-swatch" :style="getColorSwatchStyle(displayData.input?.color1)">
                <span class="color-value" :style="colorValueStyle">{{ displayData.input?.color1 }}</span>
              </div>
              <div class="color-label" :style="colorLabelStyle">{{ $t('agent.display.color.original') }}</div>
            </div>
            <div class="adjust-info" :style="operatorStyle">
              <el-icon><Edit /></el-icon>
              <span>{{ getAdjustLabel() }}</span>
            </div>
            <div class="color-item result">
              <div class="color-swatch" :style="getColorSwatchStyle(displayData.result)">
                <span class="color-value" :style="colorValueStyle">{{ displayData.result }}</span>
              </div>
              <div class="color-label" :style="colorLabelStyle">{{ $t('agent.display.color.result') }}</div>
            </div>
          </div>
        </div>

        <!-- 互补色操作 -->
        <div v-else-if="displayData.operation === 'complementary'" class="color-complementary-section">
          <div class="color-comparison" :style="colorComparisonStyle">
            <div class="color-item">
              <div class="color-swatch" :style="getColorSwatchStyle(displayData.input?.color1)">
                <span class="color-value" :style="colorValueStyle">{{ displayData.input?.color1 }}</span>
              </div>
              <div class="color-label" :style="colorLabelStyle">{{ $t('agent.display.color.original') }}</div>
            </div>
            <div class="complementary-arrow" :style="operatorStyle">
              <el-icon><RefreshRight /></el-icon>
            </div>
            <div class="color-item result">
              <div class="color-swatch" :style="getColorSwatchStyle(displayData.result)">
                <span class="color-value" :style="colorValueStyle">{{ displayData.result }}</span>
              </div>
              <div class="color-label" :style="colorLabelStyle">{{ $t('agent.display.color.complementary') }}</div>
            </div>
          </div>
        </div>

        <!-- 格式转换操作 -->
        <div v-else-if="displayData.operation === 'convert'" class="color-convert-section">
          <div class="color-comparison" :style="colorComparisonStyle">
            <div class="color-item">
              <div class="color-swatch" :style="getColorSwatchStyle(displayData.input?.color1)">
                <span class="color-value" :style="colorValueStyle">{{ displayData.input?.color1 }}</span>
              </div>
              <div class="color-label" :style="colorLabelStyle">{{ $t('agent.display.color.original') }}</div>
            </div>
            <div class="convert-info" :style="operatorStyle">
              <el-icon><Switch /></el-icon>
              <span>{{ $t('agent.display.color.convertTo', { format: displayData.input?.format?.toUpperCase() || 'HEX' }) }}</span>
            </div>
            <div class="color-item result">
              <div class="color-swatch" :style="getColorSwatchStyle(displayData.result)">
                <span class="color-value" :style="colorValueStyle">{{ displayData.result }}</span>
              </div>
              <div class="color-label" :style="colorLabelStyle">{{ $t('agent.display.color.result') }}</div>
            </div>
          </div>
        </div>

        <!-- 颜色分析操作 -->
        <div v-else-if="displayData.operation === 'analyze' && typeof displayData.result === 'object'" class="color-analyze-section">
          <div class="color-preview">
            <div class="color-swatch large" :style="getColorSwatchStyle(displayData.result.hex)">
              <span class="color-value" :style="colorValueStyle">{{ displayData.result.hex }}</span>
            </div>
          </div>
          <el-descriptions :column="2" border class="color-details">
            <el-descriptions-item :label="$t('agent.display.color.hex')">
              <code :style="codeStyle">{{ displayData.result.hex }}</code>
            </el-descriptions-item>
            <el-descriptions-item :label="$t('agent.display.color.rgb')">
              <code :style="codeStyle">rgb({{ displayData.result.rgb.r }}, {{ displayData.result.rgb.g }}, {{ displayData.result.rgb.b }})</code>
            </el-descriptions-item>
            <el-descriptions-item :label="$t('agent.display.color.hsl')">
              <code :style="codeStyle">hsl({{ displayData.result.hsl.h }}°, {{ displayData.result.hsl.s }}%, {{ displayData.result.hsl.l }}%)</code>
            </el-descriptions-item>
            <el-descriptions-item :label="$t('agent.display.color.alpha')">
              {{ displayData.result.alpha !== undefined ? displayData.result.alpha.toFixed(2) : '1.00' }}
            </el-descriptions-item>
            <el-descriptions-item :label="$t('agent.display.color.isDark')">
              <el-tag :type="displayData.result.isDark ? 'dark' : 'light'" size="small">
                {{ displayData.result.isDark ? $t('agent.display.color.yes') : $t('agent.display.color.no') }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item :label="$t('agent.display.color.isLight')">
              <el-tag :type="displayData.result.isLight ? 'light' : 'dark'" size="small">
                {{ displayData.result.isLight ? $t('agent.display.color.yes') : $t('agent.display.color.no') }}
              </el-tag>
            </el-descriptions-item>
          </el-descriptions>
        </div>

        <!-- 其他操作（通用显示） -->
        <div v-else class="color-generic-section">
          <div class="color-preview">
            <div class="color-swatch large" :style="getColorSwatchStyle(displayData.result)">
              <span class="color-value" :style="colorValueStyle">{{ displayData.result }}</span>
            </div>
          </div>
          <div class="result-info" :style="resultInfoStyle">
            <strong>{{ $t('agent.display.color.result') }}:</strong>
            <code :style="resultCodeStyle">{{ displayData.result }}</code>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="error-state">
      <el-alert
        :title="displayData.error || $t('agent.display.color.error')"
        type="error"
        :closable="false"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Loading, Plus, ArrowRight, Edit, RefreshRight, Switch } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import type { ToolDisplayComponentProps } from '../../../types/agent-tool'
import { useToolDisplayRealtime, parseToolData } from '../composables/useToolDisplayRealtime'
import { themeState } from '../../themes'
import tinycolor from 'tinycolor2'

const { t } = useI18n()
const props = defineProps<ToolDisplayComponentProps>()

const { realtimeData, realtimeStatus, realtimeProgress } = useToolDisplayRealtime(
  props.invocationId,
  props.data,
  props.status,
  props.progress
)

const displayData = computed(() => {
  const data = realtimeData.value !== null ? realtimeData.value : props.data
  const parsed = parseToolData(data) as any
  
  if (parsed && typeof parsed === 'object') {
    // 根据status确定stage，优先使用数据中的stage，如果没有则根据status推断
    const getStage = (): 'processing' | 'completed' | 'error' => {
      if (parsed.stage) {
        return parsed.stage
      }
      // 根据status推断stage
      if (props.status === 'succeeded') {
        return 'completed'
      }
      if (props.status === 'failed') {
        return 'error'
      }
      return 'processing'
    }
    
    return {
      ...parsed,
      stage: getStage()
    }
  }
  
  // 如果没有数据，根据status设置默认stage
  const defaultStage = props.status === 'succeeded' ? 'completed' : (props.status === 'failed' ? 'error' : 'processing')
  return {
    stage: defaultStage,
    result: undefined,
    operation: undefined,
    input: undefined,
    error: undefined
  }
})

const getOperationLabel = (operation: string) => {
  if (!operation) return ''
  const labels: Record<string, string> = {
    mix: t('agent.display.color.operation.mix'),
    brightness: t('agent.display.color.operation.brightness'),
    contrast: t('agent.display.color.operation.contrast'),
    complementary: t('agent.display.color.operation.complementary'),
    convert: t('agent.display.color.operation.convert'),
    analyze: t('agent.display.color.operation.analyze')
  }
  return labels[operation] || operation
}

const getAdjustLabel = () => {
  const operation = displayData.value.operation
  const amount = displayData.value.input?.amount || 0
  if (operation === 'brightness') {
    return t('agent.display.color.brightnessAdjust', { amount: (amount * 100).toFixed(0) })
  } else if (operation === 'contrast') {
    return t('agent.display.color.contrastAdjust', { amount: (amount * 100).toFixed(0) })
  }
  return ''
}

const getColorSwatchStyle = (color: string) => {
  if (!color) return {}
  const tc = tinycolor(color)
  if (!tc.isValid()) return {}
  
  const bgColor = tc.toHexString()
  const textColor = tc.isDark() ? '#ffffff' : '#000000'
  
  return {
    backgroundColor: bgColor,
    color: textColor,
    border: `1px solid ${tc.isDark() ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.2)'}`
  }
}

// 样式计算
const containerStyle = computed(() => ({
  padding: '16px',
  borderRadius: '0',
  backgroundColor: 'transparent',
  border: 'none'
}))

const statusMessageStyle = computed(() => ({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  color: themeState.currentTheme.textColor2 || themeState.currentTheme.textColor,
  fontSize: '14px',
  opacity: 0.8
}))

const completedStateStyle = computed(() => ({
  display: 'flex',
  flexDirection: 'column',
  gap: '16px'
}))

const headerStyle = computed(() => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '8px'
}))

const titleStyle = computed(() => ({
  margin: 0,
  fontSize: '18px',
  fontWeight: '600',
  color: themeState.currentTheme.textColor
}))

const contentStyle = computed(() => ({
  display: 'flex',
  flexDirection: 'column',
  gap: '16px'
}))

const resultInfoStyle = computed(() => ({
  padding: '12px',
  borderRadius: '6px',
  backgroundColor: themeState.currentTheme.background2nd,
  color: themeState.currentTheme.textColor,
  fontSize: '14px'
}))

const colorComparisonStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd
}))

const colorLabelStyle = computed(() => ({
  color: themeState.currentTheme.textColor2 || themeState.currentTheme.textColor
}))

const operatorStyle = computed(() => ({
  color: themeState.currentTheme.textColor2 || themeState.currentTheme.textColor
}))

const weightInfoStyle = computed(() => ({
  color: themeState.currentTheme.textColor2 || themeState.currentTheme.textColor,
  opacity: 0.7
}))

const colorValueStyle = computed(() => {
  const bgOpacity = themeState.currentTheme.type === 'dark' ? 0.3 : 0.2
  const bgColor = themeState.currentTheme.type === 'dark' 
    ? `rgba(0, 0, 0, ${bgOpacity})` 
    : `rgba(255, 255, 255, ${bgOpacity})`
  return {
    backgroundColor: bgColor
  }
})

const codeStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd,
  color: themeState.currentTheme.textColor
}))

const resultCodeStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))
</script>

<style scoped>
.color-display {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

.color-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.color-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.color-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.color-comparison {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  flex-wrap: wrap;
  padding: 20px;
  border-radius: 8px;
}

.color-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  min-width: 120px;
}

.color-item.result {
  font-weight: 600;
}

.color-swatch {
  width: 100px;
  height: 100px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 500;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  transition: transform 0.2s;
}

.color-swatch:hover {
  transform: scale(1.05);
}

.color-swatch.large {
  width: 150px;
  height: 150px;
  font-size: 14px;
}

.color-value {
  padding: 4px 8px;
  border-radius: 4px;
  backdrop-filter: blur(4px);
}

.color-label {
  font-size: 12px;
  text-align: center;
}

.mix-operator,
.adjust-info,
.complementary-arrow,
.convert-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}

.mix-arrow {
  display: flex;
  align-items: center;
  font-size: 20px;
}

.weight-info {
  font-size: 11px;
}

.color-preview {
  display: flex;
  justify-content: center;
  padding: 20px;
}

.color-analyze-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.color-details {
  margin-top: 16px;
}

.color-details code {
  font-family: 'Courier New', monospace;
  font-size: 13px;
  padding: 2px 6px;
  border-radius: 4px;
}

.result-info {
  padding: 12px;
  border-radius: 6px;
}

.result-info code {
  font-family: 'Courier New', monospace;
  font-size: 13px;
  padding: 2px 6px;
  border-radius: 4px;
  margin-left: 8px;
}

.error-state {
  padding: 16px;
}
</style>

