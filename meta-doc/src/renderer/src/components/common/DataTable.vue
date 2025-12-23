<template>
  <el-scrollbar ref="scrollbarRef" class="data-table-scrollbar" :style="containerStyle">
    <div ref="containerRef" class="data-table-container">
      <hot-table
        ref="hotTableRef"
        :data="data"
        :read-only="readOnly"
        :row-headers="rowHeaders"
        :col-headers="colHeaders"
        :license-key="licenseKey"
        :auto-column-size="autoColumnSize"
        :manual-column-resize="manualColumnResize"
        :stretch-h="stretchH"
        :theme-name="themeName"
        :class="tableClass"
        @after-change="handleAfterChange"
        @after-create-col="handleAfterCreateCol"
        @after-create-row="handleAfterCreateRow"
        @after-remove-col="handleAfterRemoveCol"
        @after-remove-row="handleAfterRemoveRow"
      />
    </div>
  </el-scrollbar>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { ElScrollbar } from 'element-plus'
import { HotTable } from '@handsontable/vue3'
import { registerAllModules } from 'handsontable/registry'
import 'handsontable/styles/handsontable.min.css'
import 'handsontable/styles/ht-theme-horizon.min.css'
import { themeState } from '../../utils/themes'

// 注册 Handsontable 模块
registerAllModules()

export interface DataTableProps {
  /** 表格数据（二维数组） */
  data?: any[][]
  /** 是否只读，默认为 true */
  readOnly?: boolean
  /** 是否显示行标题 */
  rowHeaders?: boolean
  /** 是否显示列标题 */
  colHeaders?: boolean
  /** 是否自动调整列宽 */
  autoColumnSize?: boolean
  /** 是否允许手动调整列宽 */
  manualColumnResize?: boolean
  /** 水平拉伸模式：'all' | 'last' | 'none' */
  stretchH?: 'all' | 'last' | 'none'
  /** 自定义 CSS 类名 */
  tableClass?: string
  /** 容器样式 */
  containerStyle?: Record<string, any>
  /** Handsontable 许可证密钥 */
  licenseKey?: string
}

export interface DataTableEmits {
  /** 数据变化事件 */
  (e: 'change', data: any[][]): void
  /** 创建列事件 */
  (e: 'create-col', index: number, amount: number): void
  /** 创建行事件 */
  (e: 'create-row', index: number, amount: number): void
  /** 删除列事件 */
  (e: 'remove-col', index: number, amount: number): void
  /** 删除行事件 */
  (e: 'remove-row', index: number, amount: number): void
  /** 表格实例就绪事件 */
  (e: 'ready', instance: any): void
}

const props = withDefaults(defineProps<DataTableProps>(), {
  data: () => [],
  readOnly: true,
  rowHeaders: true,
  colHeaders: true,
  autoColumnSize: true,
  manualColumnResize: true,
  stretchH: 'none',
  tableClass: '',
  containerStyle: () => ({}),
  licenseKey: 'non-commercial-and-evaluation'
})

const emit = defineEmits<DataTableEmits>()

const scrollbarRef = ref<InstanceType<typeof ElScrollbar> | null>(null)
const containerRef = ref<HTMLElement | null>(null)
const hotTableRef = ref<InstanceType<typeof HotTable> | null>(null)

// 根据当前主题计算 Handsontable 主题名称
const themeName = computed(() => {
  return themeState.currentTheme.handsontableTheme || 
    (themeState.currentTheme.type === 'dark' ? 'ht-theme-horizon-dark' : 'ht-theme-horizon')
})

// 获取 Handsontable 实例
const getHotInstance = (): any => {
  return hotTableRef.value?.hotInstance || null
}

// 暴露方法给父组件
defineExpose({
  /** 获取 Handsontable 实例 */
  getInstance: getHotInstance,
  /** 更新数据 */
  updateData: (data: any[][]) => {
    const instance = getHotInstance()
    if (instance) {
      instance.loadData(data)
    }
  },
  /** 获取数据 */
  getData: (): any[][] => {
    const instance = getHotInstance()
    return instance ? instance.getData() : []
  },
  /** 渲染表格 */
  render: () => {
    const instance = getHotInstance()
    if (instance) {
      instance.render()
    }
  },
  /** 更新设置 */
  updateSettings: (settings: Record<string, any>) => {
    const instance = getHotInstance()
    if (instance) {
      instance.updateSettings(settings)
    }
  }
})

// 事件处理
const handleAfterChange = (changes: any[][] | null) => {
  if (changes && !props.readOnly) {
    const instance = getHotInstance()
    if (instance) {
      const data = instance.getData()
      emit('change', data)
    }
  }
}

const handleAfterCreateCol = (index: number, amount: number) => {
  emit('create-col', index, amount)
}

const handleAfterCreateRow = (index: number, amount: number) => {
  emit('create-row', index, amount)
}

const handleAfterRemoveCol = (index: number, amount: number) => {
  emit('remove-col', index, amount)
}

const handleAfterRemoveRow = (index: number, amount: number) => {
  emit('remove-row', index, amount)
}

// 监听数据变化
watch(
  () => props.data,
  (newData) => {
    nextTick(() => {
      const instance = getHotInstance()
      if (instance && newData) {
        instance.loadData(newData)
        if (props.autoColumnSize) {
          // 延迟执行自动列宽计算，确保表格已完全渲染
          setTimeout(() => {
            instance.render()
          }, 100)
        }
      }
    })
  },
  { deep: true }
)

// 监听主题变化，更新表格主题
watch(
  () => themeName.value,
  (newThemeName) => {
    nextTick(() => {
      const instance = getHotInstance()
      if (instance) {
        // 通过 updateSettings 更新主题
        instance.updateSettings({ themeName: newThemeName })
        instance.render()
      }
    })
  }
)

onMounted(() => {
  const instance = getHotInstance()
  if (instance) {
    emit('ready', instance)
  }
})
</script>

<style scoped>
.data-table-scrollbar {
  width: 100%;
  height: 100%;
}

.data-table-container {
  overflow: visible;
}

.data-table-container :deep(.handsontable) {
  font-size: 13px;
  overflow: visible;
}

.data-table-container :deep(.handsontable .ht_master) {
  overflow: visible;
}

.data-table-container :deep(.handsontable .ht_clone_top) {
  overflow: visible;
}

.data-table-container :deep(.handsontable .ht_clone_left) {
  overflow: visible;
}

.data-table-container :deep(.handsontable .ht_clone_corner) {
  overflow: visible;
}

.data-table-container :deep(.handsontable th) {
  font-weight: 500;
}

.data-table-container :deep(.handsontable td) {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>

