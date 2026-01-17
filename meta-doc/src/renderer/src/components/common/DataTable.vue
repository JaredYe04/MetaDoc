<template>
  <div ref="containerRef" class="data-table-container" :class="tableClass" :style="containerStyle">
    <ag-grid-vue
      ref="gridRef"
      :key="themeState.currentTheme.type"
      class="data-grid ag-theme-alpine"
      :rowData="rowData"
      :columnDefs="columnDefs"
      :gridOptions="gridOptions"
      :defaultColDef="defaultColDef"
      @grid-ready="onGridReady"
      @cell-value-changed="handleCellValueChanged"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { AgGridVue } from 'ag-grid-vue3'
import { ModuleRegistry, AllCommunityModule, themeAlpine, colorSchemeDark, colorSchemeLight } from 'ag-grid-community'
import { themeState } from '../../utils/themes'
import type { GridApi, GridReadyEvent, CellValueChangedEvent, ColDef, GridOptions } from 'ag-grid-community'

// 注册 AG Grid 社区模块（AG Grid v33+ 必需）
ModuleRegistry.registerModules([AllCommunityModule])

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
})

const emit = defineEmits<DataTableEmits>()

const containerRef = ref<HTMLElement | null>(null)
const gridRef = ref<any>(null)
const gridApi = ref<GridApi | null>(null)

// 根据当前主题计算 AG Grid 主题对象（使用新的 Theming API）
const agGridTheme = computed(() => {
  const isDark = themeState.currentTheme.type === 'dark'
  // 使用 themeAlpine 作为基础主题，根据亮暗色应用不同的颜色方案
  return isDark 
    ? themeAlpine.withPart(colorSchemeDark)
    : themeAlpine.withPart(colorSchemeLight)
})

// 将二维数组数据转换为 AG Grid 的行数据格式
const rowData = computed(() => {
  if (!props.data || props.data.length === 0) {
    return []
  }
  
  const rows: Record<string, any>[] = []
  const firstRow = props.data[0]
  
  // 如果第一行是表头，跳过它（AG Grid 使用 columnDefs 定义列）
  const dataStartIndex = props.colHeaders ? 1 : 0
  
  for (let i = dataStartIndex; i < props.data.length; i++) {
    const row: Record<string, any> = {}
    const rowData = props.data[i]
    
    // 为每一列创建字段
    for (let j = 0; j < rowData.length; j++) {
      const colKey = `col${j}`
      row[colKey] = rowData[j]
    }
    
    rows.push(row)
  }
  
  return rows
})

// 根据数据生成列定义
const columnDefs = computed<ColDef[]>(() => {
  if (!props.data || props.data.length === 0) {
    return []
  }
  
  const firstRow = props.data[0]
  const columns: ColDef[] = []
  
  for (let i = 0; i < firstRow.length; i++) {
    const colKey = `col${i}`
    const headerName = props.colHeaders && props.data[0] ? String(props.data[0][i] || `列${i + 1}`) : `列${i + 1}`
    
    const colDef: ColDef = {
      field: colKey,
      headerName: headerName,
      editable: !props.readOnly,
      resizable: props.manualColumnResize,
      sortable: true,
      filter: true,
      // 拉伸模式
      flex: props.stretchH === 'all' ? 1 : undefined,
      minWidth: 100
    }
    
    // 如果是第一列且启用行标题，添加 checkboxSelection
    if (i === 0 && props.rowHeaders) {
      colDef.checkboxSelection = true
      colDef.headerCheckboxSelection = false
    }
    
    columns.push(colDef)
  }
  
  // 如果是 'last' 模式，只有最后一列 flex
  if (props.stretchH === 'last' && columns.length > 0) {
    columns[columns.length - 1].flex = 1
    for (let i = 0; i < columns.length - 1; i++) {
      delete columns[i].flex
    }
  }
  
  return columns
})

// 默认列配置
const defaultColDef = computed<ColDef>(() => ({
  resizable: props.manualColumnResize,
  sortable: true,
  filter: true,
  editable: !props.readOnly
}))

// Grid 选项
const gridOptions = computed<GridOptions>(() => {
  const options: GridOptions = {
    animateRows: true,
    // 注意：enableRangeSelection 是 Enterprise 功能，社区版不支持
    // enableRangeSelection: true,
    suppressRowClickSelection: false,
    // 确保使用正常的 DOM 布局
    domLayout: 'normal',
    // 启用所有必要的功能
    suppressMovableColumns: false,
    suppressColumnVirtualisation: false,
    // 使用新的 Theming API，根据亮暗色动态切换主题
    theme: agGridTheme.value
  }
  
  // 如果启用行标题，设置行选择
  if (props.rowHeaders) {
    options.rowSelection = 'multiple'
  } else {
    options.rowSelection = undefined
  }
  
  return options
})

// Grid 就绪事件
const onGridReady = (params: GridReadyEvent) => {
  gridApi.value = params.api
  
  // 自动调整列宽
  if (props.autoColumnSize && columnDefs.value.length > 0) {
    nextTick(() => {
      const allColumnIds = columnDefs.value.map(col => col.field || '')
      params.api.autoSizeColumns(allColumnIds, false)
    })
  }
  
  // 发出 ready 事件（传递 gridApi 以兼容原有接口）
  const readyInstance = {
    api: gridApi.value,
    loadData: (data: any[][]) => {
      if (!gridApi.value) return
      const newRowData = convertToRowData(data)
      gridApi.value.setGridOption('rowData', newRowData)
    },
    getData: () => {
      return convertToArrayData()
    },
    render: () => {
      if (gridApi.value) {
        gridApi.value.sizeColumnsToFit()
      }
    }
  }
  emit('ready', readyInstance)
}

// 单元格值变化事件
const handleCellValueChanged = (event: CellValueChangedEvent) => {
  if (!props.readOnly) {
    const data = convertToArrayData()
    emit('change', data)
  }
}

// 获取 AG Grid 实例
const getGridInstance = () => {
  return {
    api: gridApi.value
  }
}

// 将二维数组转换为 AG Grid 行数据（内部方法）
const convertToRowData = (data: any[][]): Record<string, any>[] => {
  if (!data || data.length === 0) {
    return []
  }
  
  const rows: Record<string, any>[] = []
  const dataStartIndex = props.colHeaders ? 1 : 0
  
  for (let i = dataStartIndex; i < data.length; i++) {
    const row: Record<string, any> = {}
    const rowData = data[i]
    
    for (let j = 0; j < rowData.length; j++) {
      const colKey = `col${j}`
      row[colKey] = rowData[j]
    }
    
    rows.push(row)
  }
  
  return rows
}

// 将 AG Grid 行数据转换回二维数组
const convertToArrayData = (): any[][] => {
  if (!gridApi.value || !columnDefs.value) {
    return []
  }
  
  const result: any[][] = []
  
  // 如果有列标题，先添加表头行
  if (props.colHeaders) {
    const headerRow = columnDefs.value.map(col => col.headerName || '')
    result.push(headerRow)
  }
  
  // 获取所有行数据
  const allRowData: Record<string, any>[] = []
  gridApi.value.forEachNode((node: any) => {
    if (node.data) {
      allRowData.push(node.data)
    }
  })
  
  // 转换为二维数组
  allRowData.forEach(rowData => {
    const row: any[] = []
    columnDefs.value.forEach((col, index) => {
      const colKey = `col${index}`
      row.push(rowData[colKey] ?? '')
    })
    result.push(row)
  })
  
  return result
}

// 暴露方法给父组件（保持原有接口）
defineExpose({
  /** 获取表格实例（返回 gridApi） */
  getInstance: () => {
    return getGridInstance()
  },
  /** 更新数据 */
  updateData: (data: any[][]) => {
    if (!gridApi.value) return
    
    const newRowData = convertToRowData(data)
    gridApi.value.setGridOption('rowData', newRowData)
    
    // 更新列定义（如果列数变化）
    if (data.length > 0) {
      const newColumnCount = data[0].length
      const currentColumnCount = columnDefs.value.length
      
      if (newColumnCount !== currentColumnCount) {
        // 列数变化，需要更新 columnDefs（通过重新渲染组件实现）
        nextTick(() => {
          if (props.autoColumnSize) {
            gridApi.value?.autoSizeAllColumns()
          }
        })
      }
    }
    
    // 自动调整列宽
    if (props.autoColumnSize && columnDefs.value.length > 0) {
      nextTick(() => {
        const allColumnIds = columnDefs.value.map(col => col.field || '').filter(Boolean) as string[]
        if (allColumnIds.length > 0) {
          gridApi.value?.autoSizeColumns(allColumnIds, false)
        }
      })
    }
  },
  /** 获取数据 */
  getData: (): any[][] => {
    return convertToArrayData()
  },
  /** 渲染表格 */
  render: () => {
    if (gridApi.value) {
      // AG Grid v33+ 使用 sizeColumnsToFit 方法
      gridApi.value.sizeColumnsToFit()
    }
  },
  /** 更新设置（兼容接口） */
  updateSettings: (settings: Record<string, any>) => {
    if (gridApi.value) {
      // AG Grid v33+ 使用 setGridOption 更新单个或多个选项
      Object.keys(settings).forEach(key => {
        gridApi.value?.setGridOption(key as any, (settings as any)[key])
      })
    }
  }
})

// 监听数据变化
watch(
  () => props.data,
  (newData) => {
    if (gridApi.value && newData) {
      const newRowData = convertToRowData(newData)
      gridApi.value.setGridOption('rowData', newRowData)
      
      // 自动调整列宽
      if (props.autoColumnSize) {
        nextTick(() => {
          const allColumnIds = columnDefs.value.map(col => col.field || '').filter(Boolean) as string[]
          if (allColumnIds.length > 0) {
            gridApi.value?.autoSizeColumns(allColumnIds, false)
          }
        })
      }
    }
  },
  { deep: true }
)

// 监听主题变化，更新 gridOptions 中的主题
watch(
  () => themeState.currentTheme.type,
  () => {
    // 主题变化时，gridOptions 中的 theme 会自动更新（因为它是 computed）
    // 但需要确保 gridApi 重新应用新主题
    nextTick(() => {
      if (gridApi.value) {
        // 强制更新主题
        gridApi.value.setGridOption('theme', agGridTheme.value)
        gridApi.value.sizeColumnsToFit()
      }
    })
  }
)

onMounted(() => {
  // 组件挂载后的初始化逻辑
})
</script>

<style scoped>
.data-table-container {
  width: 100%;
  height: 100%;
  min-height: 200px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.data-table-container :deep(.ag-theme-alpine) {
  width: 100%;
  height: 100%;
  min-height: 200px;
  font-size: 13px;
  display: flex;
  flex-direction: column;
  flex: 1;
}

.data-table-container :deep(.ag-root-wrapper) {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.data-table-container :deep(.ag-body-viewport) {
  flex: 1;
}

.data-table-container :deep(.ag-header-cell) {
  font-weight: 500;
}

.data-table-container :deep(.ag-cell) {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.5;
  padding: 4px 8px;
}
</style>


