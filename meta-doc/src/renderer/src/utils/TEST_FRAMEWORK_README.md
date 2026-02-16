# 单元测试框架使用说明

## 概述

这是一个统一的调试和测试框架，允许开发者在开发环境中：

1. 发送 EventBus 事件进行测试
2. 发送广播事件进行测试
3. 注册和调用模块的测试函数

## 访问调试界面

在开发环境中，打开设置界面（Setting.vue），会看到一个"调试工具"菜单项。点击进入调试界面。

## 功能说明

### 1. EventBus 事件测试

- **事件名称**：输入要发送的 EventBus 事件名称
- **事件数据**：可选，输入 JSON 格式的数据
- 点击"发送事件"按钮即可触发事件

### 2. 广播事件测试

- **目标窗口**：选择广播目标（all/home/ai-chat）
- **事件名称**：输入要广播的事件名称
- **事件数据**：可选，输入 JSON 格式的数据
- 点击"发送广播"按钮即可发送广播

### 3. 单元测试

#### 注册测试函数

在各个模块中，可以注册测试函数：

```typescript
import { testFramework, type TestFunction } from '@/utils/test-framework'

const myTest: TestFunction = {
  id: 'my-module.my-test', // 唯一标识
  name: '我的测试', // 显示名称
  description: '测试描述', // 可选
  module: '我的模块', // 模块名称
  fn: async (param1: string, param2: number) => {
    // 测试逻辑
    return { result: param1 + param2 }
  },
  params: [
    {
      name: 'param1',
      type: 'string',
      defaultValue: 'default',
      description: '参数1说明'
    },
    {
      name: 'param2',
      type: 'number',
      defaultValue: 0,
      description: '参数2说明'
    }
  ]
}

// 注册测试函数
testFramework.register(myTest)
```

#### 参数类型

- `string`: 文本输入框
- `number`: 数字输入框
- `boolean`: 开关
- `object`: JSON 文本区域
- `array`: JSON 文本区域

#### 使用测试界面

1. 选择模块
2. 选择测试函数
3. 编辑参数（文本、数字、布尔值直接编辑，对象和数组使用 JSON 格式）
4. 点击"执行测试"
5. 查看测试结果和历史

## 示例

参考 `test-framework-example.ts` 文件查看完整的示例代码。

## 注意事项

1. 测试框架仅在开发环境中可用
2. 测试函数应该是纯函数或异步函数
3. 对象和数组参数需要使用有效的 JSON 格式
4. 测试历史会保存在内存中，刷新页面后会清空
