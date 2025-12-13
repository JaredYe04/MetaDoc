# Agent Tool 队列测试示例

这是一个用于测试工具队列是否正常工作的示例文本。它包含了多个不同类型的工具调用，按照标准的 `<tool_call></tool_call>` 格式。

## 测试场景说明

这个示例会按顺序调用以下工具：
1. `timestamp` - 获取当前时间戳（用于记录开始时间）
2. `data-calculation` - 执行数学计算
3. `chart-generation` - 生成图表
4. `timestamp` - 再次获取时间戳（用于计算执行时间）

## 工具调用示例

以下是标准的工具调用格式：

<tool_call>
{"name": "timestamp", "arguments": {"format": "all"}}
</tool_call>

<tool_call>
{"name": "data-calculation", "arguments": {"expression": "Math.pow(2, 10) + Math.sqrt(144)", "precision": 2}}
</tool_call>

<tool_call>
{"name": "chart-generation", "arguments": {"prompt": "生成一个展示数字2到10次方关系的折线图，横轴是次方数，纵轴是结果值", "chartType": "mermaid", "format": "svg"}}
</tool_call>

<tool_call>
{"name": "timestamp", "arguments": {"format": "all"}}
</tool_call>

## 预期行为

1. 工具调用应该被解析为4个独立的任务
2. 任务应该按照顺序加入队列
3. 任务应该串行执行（一个接一个）
4. 每个工具的执行结果应该被正确记录
5. 第二次调用 timestamp 应该能够计算出与第一次的时间差

## 额外测试用例：混合类型的工具调用

如果需要测试更多工具类型的组合，可以使用以下示例：

<tool_call>
{"name": "timestamp", "arguments": {"format": "iso"}}
</tool_call>

<tool_call>
{"name": "data-calculation", "arguments": {"expression": "(15 * 23) / 3 - 42", "variables": {}, "precision": 4}}
</tool_call>

<tool_call>
{"name": "chart-generation", "arguments": {"prompt": "创建一个简单的流程图，包含开始、处理、决策和结束节点", "chartType": "mermaid"}}
</tool_call>

<tool_call>
{"name": "data-calculation", "arguments": {"expression": "Math.sin(Math.PI / 2) * 100", "precision": 6}}
</tool_call>

<tool_call>
{"name": "timestamp", "arguments": {"format": "all"}}
</tool_call>

## 注意事项

- 所有工具调用必须使用 `<tool_call></tool_call>` 标记包裹
- JSON 格式必须正确（注意引号和逗号）
- 工具ID必须与已注册的工具ID完全匹配
- 参数必须符合每个工具定义的 inputSchema

