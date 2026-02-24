<template>
  <div ref="containerRef" class="data-table-container" :class="tableClass" :style="containerStyle">
    <ScrollArea class="h-full">
      <div class="data-table-grid-wrapper" :style="gridWrapperStyle">
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
          @selection-changed="handleSelectionChanged"
        />
      </div>
    </ScrollArea>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { AgGridVue } from 'ag-grid-vue3'
import {
  ModuleRegistry,
  AllCommunityModule,
  themeAlpine,
  colorSchemeDark,
  colorSchemeLight
} from 'ag-grid-community'
import { themeState } from '../../utils/themes'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import type {
  GridApi,
  GridReadyEvent,
  CellValueChangedEvent,
  ColDef,
  GridOptions
} from 'ag-grid-community'

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
  /** 行选择变化事件 */
  (e: 'selection-changed', count: number): void
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
  containerStyle: () => ({})
})

const emit = defineEmits<DataTableEmits>()

const containerRef = ref<HTMLElement | null>(null)
const gridRef = ref<any>(null)
const gridApi = ref<GridApi | null>(null)

// grid wrapper 的动态最小宽度（用于水平滚动）
const gridWrapperMinWidth = ref<number>(0)
const gridWrapperStyle = computed(() => {
  if (gridWrapperMinWidth.value > 0) {
    return { minWidth: `${gridWrapperMinWidth.value}px` }
  }
  return {}
})

// 根据当前主题计算 AG Grid 主题对象（使用新的 Theming API）
const agGridTheme = computed(() => {
  const isDark = themeState.currentTheme.type === 'dark'
  return isDark ? themeAlpine.withPart(colorSchemeDark) : themeAlpine.withPart(colorSchemeLight)
})

// 将二维数组数据转换为 AG Grid 的行数据格式
const rowData = computed(() => {
  if (!props.data || props.data.length === 0) {
    return []
  }

  const rows: Record<string, any>[] = []

  // 如果第一行是表头，跳过它（AG Grid 使用 columnDefs 定义列）
  const dataStartIndex = props.colHeaders ? 1 : 0

  for (let i = dataStartIndex; i < props.data.length; i++) {
    const row: Record<string, any> = {}
    const rowData = props.data[i]

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
    const headerName =
      props.colHeaders && props.data[0] ? String(props.data[0][i] || `列${i + 1}`) : `列${i + 1}`

    const colDef: ColDef = {
      field: colKey,
      headerName: headerName,
      editable: !props.readOnly,
      resizable: props.manualColumnResize,
      sortable: true,
      filter: true,
      flex: props.stretchH === 'all' ? 1 : undefined,
      minWidth: 100
    }

    // checkboxSelection 和 headerCheckboxSelection 由 gridOptions.rowSelection 统一管理

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
    // autoHeight：AG Grid 按内容自然高度渲染，不使用自身的滚动条
    // 所有滚动由外层 el-scrollbar 接管
    domLayout: 'autoHeight',
    // 禁用 AG Grid 自身的水平滚动条（由 el-scrollbar 处理）
    suppressHorizontalScroll: true,
    suppressMovableColumns: false,
    suppressColumnVirtualisation: false,
    theme: agGridTheme.value
  }

  // 行选择（AG Grid v33+ 对象 API）
  if (props.rowHeaders) {
    options.rowSelection = {
      mode: 'multiRow',
      checkboxes: true,
      headerCheckbox: true,
      selectAll: 'filtered',
      enableClickSelection: true
    } as any
  } else {
    options.rowSelection = undefined
  }

  return options
})

/**
 * 自适应列宽核心逻辑：
 * 1. 先按内容自动计算每列宽度（autoSizeColumns）
 * 2. 如果所有列总宽 < 容器宽度，则均分填满（sizeColumnsToFit）
 * 3. 如果所有列总宽 > 容器宽度，则设置 minWidth 让 el-scrollbar 出现水平滚动条
 */
const autoSizeAndFitColumns = () => {
  if (!gridApi.value || columnDefs.value.length === 0) return

  const api = gridApi.value

  // 第一步：先重置 minWidth，让 grid 回到容器宽度
  gridWrapperMinWidth.value = 0

  // 第二步：按内容自适应列宽
  const allColumnIds = columnDefs.value.map((col) => col.field || '').filter(Boolean) as string[]
  if (allColumnIds.length > 0) {
    api.autoSizeColumns(allColumnIds, false)
  }

  // 第三步：获取所有列的实际宽度总和
  const allColumns = api.getColumns?.() || []
  let totalColWidth = 0
  allColumns.forEach((col: any) => {
    totalColWidth += col.getActualWidth?.() || 0
  })

  // 第四步：获取容器可用宽度
  const containerWidth = containerRef.value?.clientWidth || 0

  if (containerWidth > 0 && totalColWidth < containerWidth) {
    // 列总宽不够，均分填满容器
    gridWrapperMinWidth.value = 0
    api.sizeColumnsToFit()
  } else if (totalColWidth > containerWidth) {
    // 列总宽超出容器，设置 grid wrapper 的最小宽度让 el-scrollbar 产生水平滚动条
    gridWrapperMinWidth.value = totalColWidth + 4
  } else {
    gridWrapperMinWidth.value = 0
  }
}

// Grid 就绪事件
const onGridReady = (params: GridReadyEvent) => {
  gridApi.value = params.api

  if (props.autoColumnSize) {
    nextTick(() => {
      autoSizeAndFitColumns()
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
        autoSizeAndFitColumns()
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

// 行选择变化事件
const handleSelectionChanged = () => {
  if (!gridApi.value) return
  const selectedRows = gridApi.value.getSelectedRows()
  emit('selection-changed', selectedRows ? selectedRows.length : 0)
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

  if (props.colHeaders) {
    const headerRow = columnDefs.value.map((col) => col.headerName || '')
    result.push(headerRow)
  }

  const allRowData: Record<string, any>[] = []
  gridApi.value.forEachNode((node: any) => {
    if (node.data) {
      allRowData.push(node.data)
    }
  })

  allRowData.forEach((rowData) => {
    const row: any[] = []
    columnDefs.value.forEach((col, index) => {
      const colKey = `col${index}`
      row.push(rowData[colKey] ?? '')
    })
    result.push(row)
  })

  return result
}

// 暴露方法给父组件
defineExpose({
  getInstance: () => {
    return getGridInstance()
  },
  updateData: (data: any[][]) => {
    if (!gridApi.value) return

    const newRowData = convertToRowData(data)
    gridApi.value.setGridOption('rowData', newRowData)

    if (props.autoColumnSize) {
      nextTick(() => {
        autoSizeAndFitColumns()
      })
    }
  },
  getData: (): any[][] => {
    return convertToArrayData()
  },
  getSelectedRowCount: (): number => {
    if (!gridApi.value) return 0
    const selectedRows = gridApi.value.getSelectedRows()
    return selectedRows ? selectedRows.length : 0
  },
  getSelectedRowsData: (): any[][] => {
    if (!gridApi.value || !columnDefs.value) return []

    const selectedNodes = gridApi.value.getSelectedNodes()
    if (!selectedNodes || selectedNodes.length === 0) return []

    const result: any[][] = []

    if (props.colHeaders) {
      const headerRow = columnDefs.value.map((col) => col.headerName || '')
      result.push(headerRow)
    }

    selectedNodes.forEach((node: any) => {
      if (node.data) {
        const row: any[] = []
        columnDefs.value.forEach((col, index) => {
          const colKey = `col${index}`
          row.push(node.data[colKey] ?? '')
        })
        result.push(row)
      }
    })

    return result
  },
  render: () => {
    if (gridApi.value) {
      autoSizeAndFitColumns()
    }
  },
  updateSettings: (settings: Record<string, any>) => {
    if (gridApi.value) {
      Object.keys(settings).forEach((key) => {
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

      if (props.autoColumnSize) {
        nextTick(() => {
          autoSizeAndFitColumns()
        })
      }
    }
  },
  { deep: true }
)

// 监听主题变化
watch(
  () => themeState.currentTheme.type,
  () => {
    nextTick(() => {
      if (gridApi.value) {
        gridApi.value.setGridOption('theme', agGridTheme.value)
        autoSizeAndFitColumns()
      }
    })
  }
)

onMounted(() => {
  // 组件挂载后的初始化逻辑
})
</script>

<style scoped>
/* 最外层容器：占满父元素，固定高度 */
.data-table-container {
  width: 100%;
  height: 100%;
  min-height: 200px;
  overflow: hidden;
}

/* grid wrapper：自然宽高，由 AG Grid autoHeight 决定高度 */
.data-table-grid-wrapper {
  min-height: 200px;
}

/* AG Grid autoHeight 模式下自动撑高 */
.data-table-grid-wrapper :deep(.ag-theme-alpine) {
  width: 100%;
  font-size: 13px;
}

.data-table-grid-wrapper :deep(.ag-header-cell) {
  font-weight: 500;
}

.data-table-grid-wrapper :deep(.ag-cell) {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.5;
  padding: 4px 8px;
}
</style>
