/**
 * 单元测试框架工具
 * 用于在开发环境中注册和调用测试函数
 */

export interface TestFunction {
  /** 函数ID（唯一标识） */
  id: string;
  /** 函数名称（显示名称） */
  name: string;
  /** 函数描述 */
  description?: string;
  /** 模块名称 */
  module: string;
  /** 函数本身 */
  fn: (...args: any[]) => any | Promise<any>;
  /** 参数定义 */
  params?: TestParam[];
}

export interface TestParam {
  /** 参数名称 */
  name: string;
  /** 参数类型 */
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  /** 默认值 */
  defaultValue?: any;
  /** 参数描述 */
  description?: string;
}

class TestFramework {
  private tests: Map<string, TestFunction> = new Map();
  private testHistory: Array<{
    id: string;
    name: string;
    timestamp: number;
    params: any[];
    result?: any;
    error?: string;
  }> = [];

  /**
   * 注册测试函数
   */
  register(test: TestFunction): void {
    if (this.tests.has(test.id)) {
      console.warn(`测试函数 ${test.id} 已存在，将被覆盖`);
    }
    this.tests.set(test.id, test);
  }

  /**
   * 取消注册测试函数
   */
  unregister(id: string): void {
    this.tests.delete(id);
  }

  /**
   * 获取所有测试函数
   */
  getAllTests(): TestFunction[] {
    return Array.from(this.tests.values());
  }

  /**
   * 按模块获取测试函数
   */
  getTestsByModule(module: string): TestFunction[] {
    return Array.from(this.tests.values()).filter(t => t.module === module);
  }

  /**
   * 获取所有模块名称
   */
  getModules(): string[] {
    const modules = new Set<string>();
    this.tests.forEach(test => {
      modules.add(test.module);
    });
    return Array.from(modules).sort();
  }

  /**
   * 执行测试函数
   */
  async execute(id: string, params: any[] = []): Promise<any> {
    const test = this.tests.get(id);
    if (!test) {
      throw new Error(`测试函数 ${id} 不存在`);
    }

    const historyEntry = {
      id,
      name: test.name,
      timestamp: Date.now(),
      params: [...params]
    };

    try {
      const result = await test.fn(...params);
      historyEntry.result = result;
      this.testHistory.push(historyEntry);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      historyEntry.error = errorMessage;
      this.testHistory.push(historyEntry);
      throw error;
    }
  }

  /**
   * 获取测试历史
   */
  getHistory(): typeof this.testHistory {
    return [...this.testHistory].reverse(); // 最新的在前
  }

  /**
   * 清空测试历史
   */
  clearHistory(): void {
    this.testHistory = [];
  }

  /**
   * 根据参数定义解析参数值
   */
  parseParams(params: TestParam[], values: Record<string, any>): any[] {
    return params.map(param => {
      const value = values[param.name];
      if (value === undefined || value === null) {
        return param.defaultValue;
      }

      // 根据类型转换
      switch (param.type) {
        case 'number':
          return Number(value);
        case 'boolean':
          return Boolean(value);
        case 'object':
        case 'array':
          if (typeof value === 'string') {
            try {
              return JSON.parse(value);
            } catch {
              return param.defaultValue;
            }
          }
          return value;
        default:
          return value;
      }
    });
  }
}

// 导出单例
export const testFramework = new TestFramework();

