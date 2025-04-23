export const graphEngineConfig=[
    {
      "name": "ECharts",
      "graph-supported": [
        "折线图", "条形图", "散点图", "K线图", "饼图", "雷达图",
        "和弦图", "力导向布局图", "地图", "仪表盘图", "漏斗图", "事件河流图"
      ],
      "tip": "ECharts 适合制作数据驱动、交互性强的可视化图表，尤其适用于统计图和地理图。",
      "special-prompt": "配置项需遵循 ECharts 的 JSON 格式，可通过官网提供的 Option Builder 获取模板。代码框的语言直接写成echarts即可，而不是javascript，代码框内仅包含json格式的配置项，不需要其他内容。"
    },
    {
      "name": "Mermaid",
      "graph-supported": [
        "流程图", "UML序列图", "甘特图", "UML类图", "思维导图", "饼图"
      ],
      "tip": "Mermaid 适合快速绘制流程图、序列图和项目计划图，适用于文档嵌入和 Markdown 中使用。",
      "special-prompt": "Mermaid 中建议使用 [\"...\"] 包裹字符串避免转义错误，尤其在类图中避免使用带空格或特殊字符的标识符。"
    },
    {
      "name": "PlantUML",
      "graph-supported": [
        "UML类图", "UML序列图", "UML活动图", "UML状态图", "UML用例图", "UML组件图"
      ],
      "tip": "PlantUML 专注于 UML 建模，适合详细建模各种软件结构与行为图。",
      "special-prompt": "PlantUML 使用类 Pascal 风格语法，不支持中文标识符，需注意布局控制如 skinparam 等。"
    },
    {
      "name": "Flowchart",
      "graph-supported": ["流程图"],
      "tip": "Flowchart 模块用于绘制基本的流程图，适合简洁表达。",
      "special-prompt": "节点名称不支持空格，建议使用下划线代替空格。"
    },
    {
      "name": "Mindmap",
      "graph-supported": ["脑图"],
      "tip": "Mindmap 用于发散式结构表达，可用于记录头脑风暴、知识整理等。",
      "special-prompt": "mindmap语法非常简单，一级节点前缀为2个空格与-，即'  -'，二级为4个空格与-，即'    -'，后面接上内容，依次类推。"
    },
    {
      "name": "Graphviz",
      "graph-supported": ["流程图"],
      "tip": "Graphviz 适合复杂结构图的可视化表达，支持精细的布局控制。",
      "special-prompt": "使用 dot 语言书写，节点与边关系严格使用 -> 或 -- 表示，注意语法标点。"
    }
  ]
  