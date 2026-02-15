/**
 * 测试框架使用示例
 * 展示如何注册测试函数到测试框架中
 */

import { testFramework, type TestFunction } from './test-framework'

// ============ 示例：注册简单的测试函数 ============

// 示例 1: 简单的字符串处理函数
const testStringReverse: TestFunction = {
  id: 'example.string-reverse',
  name: '字符串反转',
  description: '测试字符串反转功能',
  module: '示例模块',
  fn: (text: string) => {
    return text.split('').reverse().join('')
  },
  params: [
    {
      name: 'text',
      type: 'string',
      defaultValue: 'Hello World',
      description: '要反转的字符串'
    }
  ]
}

// 示例 2: 带多个参数的函数
const testMathAdd: TestFunction = {
  id: 'example.math-add',
  name: '数学加法',
  description: '测试两个数字相加',
  module: '示例模块',
  fn: (a: number, b: number) => {
    return a + b
  },
  params: [
    {
      name: 'a',
      type: 'number',
      defaultValue: 10,
      description: '第一个数字'
    },
    {
      name: 'b',
      type: 'number',
      defaultValue: 20,
      description: '第二个数字'
    }
  ]
}

// 示例 3: 带对象参数的函数
const testObjectProcess: TestFunction = {
  id: 'example.object-process',
  name: '对象处理',
  description: '处理对象数据',
  module: '示例模块',
  fn: (data: { name: string; age: number }) => {
    return {
      ...data,
      processed: true,
      timestamp: Date.now()
    }
  },
  params: [
    {
      name: 'data',
      type: 'object',
      defaultValue: { name: 'Test', age: 25 },
      description: '要处理的对象数据（JSON 格式）'
    }
  ]
}

// 示例 4: 带数组参数的函数
const testArraySum: TestFunction = {
  id: 'example.array-sum',
  name: '数组求和',
  description: '计算数组中所有数字的和',
  module: '示例模块',
  fn: (numbers: number[]) => {
    return numbers.reduce((sum, num) => sum + num, 0)
  },
  params: [
    {
      name: 'numbers',
      type: 'array',
      defaultValue: [1, 2, 3, 4, 5],
      description: '数字数组（JSON 格式）'
    }
  ]
}

// 示例 5: 异步函数
const testAsyncFetch: TestFunction = {
  id: 'example.async-fetch',
  name: '异步获取数据',
  description: '模拟异步数据获取',
  module: '示例模块',
  fn: async (url: string) => {
    // 模拟异步操作
    await new Promise((resolve) => setTimeout(resolve, 1000))
    return {
      url,
      data: { message: 'Fetched successfully' },
      timestamp: Date.now()
    }
  },
  params: [
    {
      name: 'url',
      type: 'string',
      defaultValue: 'https://api.example.com/data',
      description: '要获取的 URL'
    }
  ]
}

// ============ 注册所有测试函数 ============

/**
 * 注册示例测试函数
 * 在实际使用中，各个模块可以在自己的初始化代码中调用类似的函数来注册测试
 */
export function registerExampleTests() {
  testFramework.register(testStringReverse)
  testFramework.register(testMathAdd)
  testFramework.register(testObjectProcess)
  testFramework.register(testArraySum)
  testFramework.register(testAsyncFetch)
}

// ============ 使用说明 ============

/**
 * 在其他模块中使用测试框架的步骤：
 *
 * 1. 导入测试框架：
 *    import { testFramework, type TestFunction } from '@/utils/test-framework';
 *
 * 2. 定义测试函数：
 *    const myTest: TestFunction = {
 *      id: 'my-module.my-test',
 *      name: '我的测试',
 *      description: '测试描述',
 *      module: '我的模块',
 *      fn: (param1: string, param2: number) => {
 *        // 测试逻辑
 *        return result;
 *      },
 *      params: [
 *        { name: 'param1', type: 'string', defaultValue: 'default' },
 *        { name: 'param2', type: 'number', defaultValue: 0 }
 *      ]
 *    };
 *
 * 3. 注册测试函数：
 *    testFramework.register(myTest);
 *
 * 4. 在模块初始化时调用注册函数（可选）：
 *    // 在模块的初始化代码中
 *    if (isDevEnvironment()) {
 *      registerMyModuleTests();
 *    }
 */
