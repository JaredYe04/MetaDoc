# 导出适配器重构说明

## 已完成的工作

### 1. 适配器基础架构 ✅

- ✅ 创建了适配器类型定义 (`types.ts`)
- ✅ 创建了适配器基类 (`base-adapter.ts`)
- ✅ 创建了适配器注册表 (`types.ts` 中的 `ExportAdapterRegistry`)
- ✅ 实现了localStorage持久化 (`storage.ts`)

### 2. 导出适配器实现 ✅

已实现以下适配器：

- ✅ `MdToPdfAdapter` - Markdown -> PDF
- ✅ `MdToDocxAdapter` - Markdown -> DOCX
- ✅ `MdToHtmlAdapter` - Markdown -> HTML
- ✅ `MdToMdAdapter` - Markdown -> Markdown
- ✅ `MdToTexAdapter` - Markdown -> LaTeX
- ✅ `TexToPdfAdapter` - LaTeX -> PDF (编译方式)
- ✅ `TexToTexAdapter` - LaTeX -> LaTeX

### 3. 导出选项UI组件 ✅

- ✅ 创建了 `ExportOptionsDialog.vue` 组件
- ✅ 支持动态字段渲染
- ✅ 支持嵌套对象字段（如margins）
- ✅ 支持条件显示字段（showWhen）
- ✅ 自动从localStorage加载和保存选项

### 4. 适配器注册 ✅

- ✅ 在 `index.ts` 中注册所有适配器
- ✅ 提供了 `registerAllAdapters()` 函数

## 待完成的工作

### 1. 重构 renderer 导出管理器 ⏳

需要修改 `meta-doc/src/renderer/src/services/export-manager.ts`：

1. **初始化适配器注册表**

   ```typescript
   import { registerAllAdapters, exportAdapterRegistry } from './export-adapters'

   // 在模块加载时注册适配器
   registerAllAdapters()
   ```

2. **修改 `prepareExportPayload` 函数**
   - 使用适配器来准备导出数据
   - 根据源格式和目标格式获取适配器
   - 调用适配器的 `prepareExportData` 方法

3. **集成导出选项对话框**
   - 在导出前显示选项对话框
   - 使用适配器的 `getOptionFields` 生成UI
   - 将用户选择的选项传递给适配器

### 2. 重构 main 导出管理器 ⏳

需要修改 `meta-doc/src/main/export/export-manager.ts`：

1. **修改导出处理器**
   - 接收导出选项参数
   - 根据选项调整导出行为（如PDF边距、DOCX样式等）

2. **PDF导出选项应用**
   - 在 `convertHtmlToPdfBuffer` 中使用选项中的边距和纸张大小
   - 应用 `printBackground` 选项

3. **DOCX导出选项应用**
   - 在 `convertMarkdownToDocxBuffer` 中应用样式映射选项
   - 根据 `enableStyleMapping` 决定是否应用样式
   - 使用选项中的字体、字号、行距等

4. **LaTeX PDF导出选项应用**
   - 在LaTeX编译时应用颜色模式选项
   - 处理边距选项（需要在LaTeX文档中配置）

### 3. 集成到导出流程 ⏳

需要在导出入口点（可能是 `LeftMenu.vue` 或其他组件）中：

1. **显示导出选项对话框**

   ```vue
   <ExportOptionsDialog
     v-model="showExportOptions"
     :adapter="selectedAdapter"
     :source-format="sourceFormat"
     :target-format="targetFormat"
     @confirm="handleExportConfirm"
   />
   ```

2. **处理导出确认**
   - 获取用户选择的选项
   - 调用 `prepareExportPayload` 并传递选项
   - 继续原有的导出流程

### 4. 添加更多适配器（可选）📝

- TEX -> MD
- TEX -> HTML
- TEX -> DOCX
- JSON -> 各种格式

## 使用示例

### 在导出流程中使用适配器

```typescript
// 1. 获取适配器
const adapter = exportAdapterRegistry.get('md', 'pdf')
if (!adapter) {
  throw new Error('不支持的导出格式')
}

// 2. 获取默认选项并合并用户保存的选项
const defaultOptions = adapter.getDefaultOptions()
const savedOptions = loadExportOptions('md', 'pdf')
const options = mergeExportOptions(defaultOptions, savedOptions)

// 3. 准备导出数据
const preparedData = await adapter.prepareExportData({ md, json, tex }, options)

// 4. 执行导出（在main进程中）
await adapter.executeExport(preparedData, targetPath, options)
```

### 在Vue组件中使用导出选项对话框

```vue
<template>
  <ExportOptionsDialog
    v-model="showDialog"
    :adapter="adapter"
    :source-format="'md'"
    :target-format="'pdf'"
    @confirm="handleOptionsConfirm"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { exportAdapterRegistry } from '../services/export-adapters'
import ExportOptionsDialog from '../components/ExportOptionsDialog.vue'

const showDialog = ref(false)
const adapter = exportAdapterRegistry.get('md', 'pdf')

function handleOptionsConfirm(options: ExportOptions) {
  // 使用选项进行导出
  console.log('Export options:', options)
  // ... 继续导出流程
}
</script>
```

## 注意事项

1. **默认值保持兼容**
   - 所有适配器的默认值与现有代码中的硬编码值保持一致
   - 确保不传入选项时，行为与原来相同

2. **向后兼容**
   - 如果适配器不存在，应该回退到原有的导出逻辑
   - 选项验证失败时，应该使用默认值

3. **错误处理**
   - 适配器方法应该包含适当的错误处理
   - UI组件应该显示验证错误信息

4. **性能考虑**
   - localStorage操作应该异步进行，避免阻塞UI
   - 选项合并应该高效

## 文件结构

```
meta-doc/src/renderer/src/services/export-adapters/
├── types.ts              # 类型定义和注册表
├── base-adapter.ts       # 适配器基类
├── storage.ts            # localStorage持久化
├── index.ts              # 适配器注册入口
├── md-to-pdf-adapter.ts  # MD->PDF适配器
├── md-to-docx-adapter.ts # MD->DOCX适配器
├── md-to-html-adapter.ts # MD->HTML适配器
├── md-to-md-adapter.ts   # MD->MD适配器
├── md-to-tex-adapter.ts  # MD->LaTeX适配器
├── tex-to-pdf-adapter.ts # TEX->PDF适配器
└── tex-to-tex-adapter.ts # TEX->TEX适配器

meta-doc/src/renderer/src/components/
└── ExportOptionsDialog.vue  # 导出选项对话框组件
```

## 下一步

1. 在应用启动时调用 `registerAllAdapters()`
2. 修改导出入口点，集成 `ExportOptionsDialog`
3. 重构 `export-manager.ts` (renderer) 使用适配器
4. 重构 `export-manager.ts` (main) 应用导出选项
5. 测试各种导出格式和选项组合
