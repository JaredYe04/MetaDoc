//这个文件需要实现一系列Markdown相关的功能函数

import Vditor from 'vditor'
import eventBus, { isElectronEnv } from './event-bus'
import { getImagePath, getSetting } from './settings'
import { convertNumberToChinese, removeTitleIndex } from './regex-utils'
import { getLocalVditorCDN, vditorCDN } from './vditor-cdn'
import { getRuntimeServerBaseUrlSync } from '../config/runtime-server'
import { createRendererLogger } from './logger.ts'
import { preRenderAllCharts } from './chart-pre-renderer.js'
import {
  themeState,
  resolveVditorContentThemeSettingValue,
  resolveVditorCodeThemeSettingValue
} from './themes'
import messageBridge from '../bridge/message-bridge'

// 懒加载logger，避免初始化顺序问题
let loggerInstance = null

function getLogger() {
  if (!loggerInstance) {
    loggerInstance = createRendererLogger('MDUtils')
  }
  return loggerInstance
}
// 1. 从 Markdown 文本中提取所有标题，生成大纲树，同时记录 title_level

export function extractOutlineTreeFromMarkdown(md, bypassText = false) {
  const lines = md.split('\n')
  // 虚拟根节点，title_level 为 0，表示最低级别
  const root = {
    title: '',
    title_level: 0,
    path: 'dummy',
    text: '',
    children: []
  }
  // 栈初始化，起始只有根节点
  let stack = [root]
  // 跟踪是否在代码块中（三个反引号包裹的代码块）
  let inCodeBlock = false
  // 遍历每一行
  for (let line of lines) {
    // 检查是否是代码块开始/结束标记（三个反引号）
    const codeBlockMatch = line.match(/^```/)
    if (codeBlockMatch) {
      // 切换代码块状态
      inCodeBlock = !inCodeBlock
      // 非标题行，追加到当前节点的 text 中
      if (!bypassText) {
        stack[stack.length - 1].text += line + '\n'
      }
      continue
    }

    // 如果在代码块中，跳过标题匹配
    if (inCodeBlock) {
      // 非标题行，追加到当前节点的 text 中
      if (!bypassText) {
        stack[stack.length - 1].text += line + '\n'
      }
      continue
    }

    // 匹配标题行：匹配1个或多个 '#' 后跟空格，再匹配标题文本
    const match = line.match(/^(#+)\s+(.*)/)
    if (match) {
      const hashes = match[1]
      const title = match[2]
      const level = hashes.length // 标题等级

      const new_node = {
        title: title,
        title_level: level,
        path: '',
        text: '',
        children: []
      }
      // 如果当前栈顶节点的 title_level >= 当前标题等级，则不断弹出，直到找到父节点
      while (stack.length > 0 && stack[stack.length - 1].title_level >= level) {
        stack.pop()
      }
      // 此时栈顶的节点即为新节点的父节点
      stack[stack.length - 1].children.push(new_node)
      // 将新节点入栈
      stack.push(new_node)
    } else {
      // 非标题行，追加到当前节点的 text 中
      if (!bypassText) {
        stack[stack.length - 1].text += line + '\n'
      }
    }
  }
  // 根据大纲树生成路径（采用简单的广度优先遍历）
  for (let i = 0; i < root.children.length; i++) {
    root.children[i].path = `${i + 1}`
  }
  let queue = [...root.children]
  while (queue.length > 0) {
    const node = queue.shift()
    for (let i = 0; i < node.children.length; i++) {
      node.children[i].path = node.path + '.' + (i + 1)
      queue.push(node.children[i])
    }
  }

  return root
}

// 1. 从Markdown文本中提取所有标题，生成大纲树

// export function extractOutlineTreeFromMarkdownLegacy(md, bypassText = false) {
//     const lines = md.split('\n')
//     //console.log(lines);
//     const outline_tree = {
//         title: '',//当前标题
//         path: 'dummy', //当前标题的路径
//         text: '',//当前内容，不包括子标题以及内容
//         children: []
//     }

//     let current_node = outline_tree
//     let stack = [outline_tree]
//     for (let i = 0; i < lines.length; i++) {
//         const line = lines[i]
//         //console.log(line);
//         const match = line.match(/^#+\s+(.*)/)
//         //console.log(match);
//         if (match) {
//             const title = match[1]
//             //console.log(title);
//             const level = match[0].match(/#/g).length
//             //console.log(level);
//             const new_node = {
//                 title: title,
//                 path: '',
//                 text: '',
//                 children: []
//             }
//             //console.log(new_node);
//             if (level > stack.length) {
//                 stack[stack.length - 1].children.push(new_node)
//                 stack.push(new_node)
//             } else {
//                 stack[level - 1].children.push(new_node)
//                 stack[level] = new_node
//             }
//             current_node = new_node
//         } else {
//             if (!bypassText) {
//                 current_node.text += line + '\n'
//             }
//         }
//     }
//     //console.log(outline_tree);
//     //根据大纲树生成路径
//     let path = ''
//     let path_stack = []
//     let path_index = 1
//     let root = outline_tree
//     //root节点通常是dummy节点
//     for (let i = 0; i < root.children.length; i++) {
//         root.children[i].path = path + (i + 1)
//         path_stack.push(root.children[i])
//     }
//     while (path_stack.length > 0) {
//         let node = path_stack.pop()
//         path = node.path + '.'
//         for (let i = 0; i < node.children.length; i++) {
//             node.children[i].path = path + (i + 1)
//             path_stack.push(node.children[i])
//         }
//     }

//     //console.log(outline_tree);
//     return outline_tree//最外层节点是dummy节点
// }

// 2. 从大纲树生成 Markdown 文本

export function generateMarkdownFromOutlineTree(outline_tree) {
  let md = ''
  // 深度优先遍历生成 Markdown
  function dfs(node) {
    // 如果是非虚拟根节点，则生成标题行

    //如果老文档，node.title_level不存在，则根据path里面出现的"."的个数来判断
    if (node.title_level == undefined || node.title_level == null) {
      //如果是无.，则是1级标题，如果类似于"1.1"，则是2级标题
      node.title_level = node.path.split('.').length
    }

    if (node.title && node.title_level > 0) {
      md += '#'.repeat(node.title_level) + ' ' + node.title + '\n'
      md += node.text
      // 保证末尾有换行符
      if (node.text === '' || node.text[node.text.length - 1] !== '\n') {
        md += '\n'
      }
    } else {
      // 如果是虚拟根节点，也可以输出其 text（如果有的话）
      if (node.text) {
        md += node.text + '\n'
      }
    }
    // 遍历子节点
    if (node.children && Array.isArray(node.children)) {
      for (let child of node.children) {
        dfs(child)
      }
    }
  }

  dfs(outline_tree)
  return md
}

/**
 * 从大纲树生成精简的 Markdown 大纲（仅包含标题结构，不包含文本内容）
 * 用于在prompts中传递，节省token开销
 */
function generateLightMarkdownFromOutlineTree(outline_tree) {
  let md = ''
  // 深度优先遍历生成 Markdown，只包含标题
  function dfs(node) {
    //如果老文档，node.title_level不存在，则根据path里面出现的"."的个数来判断
    if (node.title_level == undefined || node.title_level == null) {
      //如果是无.，则是1级标题，如果类似于"1.1"，则是2级标题
      node.title_level = node.path.split('.').length
    }

    // 只输出标题，不输出文本内容
    if (node.title && node.title_level > 0) {
      md += '#'.repeat(node.title_level) + ' ' + node.title + '\n'
    }

    // 遍历子节点
    if (node.children && Array.isArray(node.children)) {
      for (let child of node.children) {
        dfs(child)
      }
    }
  }

  dfs(outline_tree)
  return md.trim()
}

/**
 * 从 Markdown 文本中提取精简的大纲（返回Markdown格式，而非JSON）
 * 用于在prompts中传递，节省token开销
 * @param md Markdown文本
 * @param bypassText 是否跳过文本内容（对于精简版，始终为true）
 * @returns 精简的Markdown大纲字符串
 */
export function extractOutlineTreeFromMarkdownLight(md, bypassText = true) {
  // 先使用完整方法获取大纲树（bypassText=true，因为我们只需要结构）
  const outlineTree = extractOutlineTreeFromMarkdown(md, true)
  // 转换为精简的Markdown大纲
  return generateLightMarkdownFromOutlineTree(outlineTree)
}

// // 2. 从大纲树生成Markdown文本

// export function generateMarkdownFromOutlineTreeLegacy(outline_tree) {
//     //console.log(outline_tree);
//     let md = ''
//     function dfs(node, level) {
//         md += '#'.repeat(level) + ' ' + node.title + '\n'
//         md += node.text;

//         if (node.text[node.text.length - 1] !== '\n') {
//             md += '\n'
//         }
//         for (let i = 0; i < node.children.length; i++) {
//             dfs(node.children[i], level + 1)
//         }
//     }
//     if (outline_tree.path === 'dummy') {//如果是根节点
//         if (outline_tree.text.trim() !== '') {//如果node.text不是空，那么加一个换行符
//             md += outline_tree.text + '\n'//根节点的text
//         }
//         for (let i = 0; i < outline_tree.children.length; i++) {
//             dfs(outline_tree.children[i], 1)
//         }
//     }
//     //console.log(md);
//     return md
// }

export function removeTextFromOutline(outline_tree) {
  let new_outline_tree = JSON.parse(JSON.stringify(outline_tree))
  function dfs(node) {
    node.text = ''
    for (let i = 0; i < node.children.length; i++) {
      dfs(node.children[i])
    }
  }
  dfs(new_outline_tree)
  return new_outline_tree
}
export function adjustTitleLevel(outline_tree, first_level) {
  //深度搜索遍历大纲树，调整标题级别，如果是dummy则从children开始调整，等级为first_level，从子节点依次+1
  function dfs(node, level) {
    node.title_level = level
    for (let i = 0; i < node.children.length; i++) {
      dfs(node.children[i], level + 1)
    }
  }
  let node = JSON.parse(JSON.stringify(outline_tree)) //深拷贝一份大纲树
  if (node.path == 'dummy') {
    for (let i = 0; i < node.children.length; i++) {
      dfs(node.children[i], first_level)
    }
  } else {
    dfs(node, first_level)
  }
  return node
}
export function adjustTitleIndex(outline_tree, cover, level1TitleChinese) {
  let node = JSON.parse(JSON.stringify(outline_tree)) //深拷贝一份大纲树
  //深度搜索遍历大纲树，调整标题编号，如果是dummy则从children开始调整，编号为1 2 3 4...如果用户要求level1TitleChinese，则第一级标题用中文数字表示
  function dfs(node, index, parentIndex) {
    let title = node.title
    if (cover) title = removeTitleIndex(title) //去除标题开头的数字和点号
    let index_string = ''
    if (parentIndex == '') {
      index_string = index
    } else {
      index_string = parentIndex + '.' + index
    }
    if (level1TitleChinese && parentIndex == '') {
      node.title = convertNumberToChinese(index) + ' ' + title //加上标题编号
    } else {
      node.title = index_string + ' ' + title //加上标题编号
    }

    for (let i = 0; i < node.children.length; i++) {
      dfs(node.children[i], i + 1, index_string)
    }
  }
  if (node.path == 'dummy') {
    for (let i = 0; i < node.children.length; i++) {
      dfs(node.children[i], i + 1, '')
    }
  } else {
    dfs(node, 1, '')
  }
  return node
}
export function generatePieFromData(data, title) {
  //饼图
  // 检查数据格式是否正确
  if (!Array.isArray(data)) {
    throw new Error('Input data must be an array.')
  }

  data.forEach((item) => {
    if (typeof item.label !== 'string' || typeof item.value !== 'number') {
      throw new Error("Each data item must have a 'label' (string) and 'value' (number).")
    }
  })

  // ECharts 配置模板
  const maxLength = 5
  const echartConfig = {
    tooltip: {
      trigger: 'item',
      formatter: '{a} <br/>{b}: {c} ({d}%)',
      /**靠右 显示 */
      position: 'top'
    },
    legend: {
      top: '0',
      left: 'center',
      orient: 'horizontal',
      formatter: (name) => {
        return name.length > maxLength ? `${name.slice(0, maxLength)}...` : name
      },
      textStyle: {
        color: '#999999' // 可选：图例文字颜色
      }
    },
    series: [
      {
        name: title,
        type: 'pie',
        radius: '50%',
        data: data.map((item) => ({ name: item.label, value: item.value })),
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        },
        label: {
          formatter: (params) => {
            const label = params.name
            return label.length > maxLength ? `${label.slice(0, maxLength)}...` : label
          },
          color: '#999999' // 可选：标签文字颜色
        }
      }
    ]
  }

  //     // 转换为 Markdown 所需的 JSON 字符串
  //     const echartMarkdown = `
  // \`\`\`echarts
  // ${JSON.stringify(echartConfig, null, 2)}
  // \`\`\`
  //     `.trim();

  return echartConfig
}

export function generateMarkdownHistogramWithStaticColors(data) {
  //频度直方图
  // 检查数据格式是否正确
  if (!Array.isArray(data)) {
    throw new Error('Input data must be an array.')
  }

  data.forEach((item) => {
    if (typeof item.word !== 'string' || typeof item.size !== 'number') {
      throw new Error("Each data item must have a 'word' (string) and 'size' (number).")
    }
  })

  // 提取词语和频度
  const words = data.map((item) => item.word)
  const sizes = data.map((item) => item.size)

  // 生成颜色从深到浅的渐变效果（基于 HSL 色调）
  const baseColor = { h: 120, s: 60, l: 20 } // 基准颜色（绿色系）
  const gradientColors = Array.from({ length: data.length }, (_, i) => {
    const lightness = baseColor.l + (50 / data.length) * i // 随数据索引渐变亮度
    return `hsl(${baseColor.h}, ${baseColor.s}%, ${lightness}%)`
  })

  // 将颜色与数据绑定
  const dataWithColors = data.map((item, index) => ({
    name: item.word,
    value: item.size,
    itemStyle: {
      color: gradientColors[index]
    }
  }))

  // ECharts 配置模板
  const echartConfig = {
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow'
      }
    },
    xAxis: {
      type: 'category',
      data: words,
      axisLabel: {
        rotate: 45, // 旋转以避免文字重叠
        interval: 0 // 显示所有标签
      }
    },
    yAxis: {
      type: 'value',
      name: '词频'
    },
    series: [
      {
        name: '词频',
        type: 'bar',
        data: dataWithColors.map((item) => ({
          value: item.value,
          itemStyle: item.itemStyle
        }))
      }
    ]
  }

  // 转换为 Markdown 所需的 JSON 字符串
  const echartMarkdown = `
\`\`\`echarts
${JSON.stringify(echartConfig, null, 2)}
\`\`\`
    `.trim()

  return echartMarkdown
}
export function generateWordCountBarChart(text) {
  // 计算输入文本的字数
  const articleWordCount = text.length

  // 标准文本与字数对比数据
  const comparisonData = [
    { name: '学术报告', wordCount: 10000 },
    { name: '长篇小说章节', wordCount: 8000 },
    { name: '研究论文', wordCount: 5000 },
    { name: '小说中篇', wordCount: 15000 },
    { name: '短篇小说', wordCount: 3000 },
    { name: '新闻报道', wordCount: 1000 },
    { name: '新闻社论', wordCount: 1100 },
    { name: '短篇文章', wordCount: 1300 },
    { name: '诗歌', wordCount: 300 },
    { name: '技术博客', wordCount: 2000 },
    { name: '商业计划书', wordCount: 7000 },
    { name: '市场分析报告', wordCount: 4000 },
    { name: '用户手册', wordCount: 8000 },
    { name: '产品说明书', wordCount: 3000 },
    { name: '会议纪要', wordCount: 1200 },
    { name: '求职信', wordCount: 500 },
    { name: '电子邮件', wordCount: 200 },
    { name: '朋友圈', wordCount: 100 },
    { name: '短信', wordCount: 50 },
    { name: '五言绝句', wordCount: 20 },
    { name: '七言律诗', wordCount: 56 },
    { name: '广告文案', wordCount: 300 },
    { name: '网页文章', wordCount: 1500 },
    { name: '小说序章', wordCount: 2500 }
  ]

  // 组合输入文本和标准文本数据
  // 计算与每个文体字数的差异，并排序
  const sortedComparisonData = comparisonData
    .map((item) => ({
      ...item,
      difference: Math.abs(item.wordCount - articleWordCount) // 计算字数差异
    }))
    .sort((a, b) => a.difference - b.difference) // 按差异排序，从小到大

  // 选择字数最接近的 5 个文体
  const closestComparisonData = sortedComparisonData.slice(0, 5)

  // 组合输入文本和最接近的 5 个标准文本数据
  const data = [
    { name: '我的文章', wordCount: articleWordCount, isHighlighted: true }, // 输入文本高亮
    ...closestComparisonData.map((item) => ({ ...item, isHighlighted: false }))
  ].sort((a, b) => a.wordCount - b.wordCount) // 按字数排序，从小到大

  // 配置条形图
  const echartConfig = {
    tooltip: {},
    xAxis: {
      type: 'category',
      data: data.map((item) => item.name), // X 轴显示文本名称
      axisLabel: {
        interval: 0, // 显示所有标签
        formatter: (value, index) => {
          return data[index].isHighlighted ? `{a|${value}}` : value // 高亮显示输入文本
        },
        rich: {
          a: {
            color: '#4caf50', // 高亮颜色为绿色
            fontweight: 'bold' // 加粗
          }
        },

        align: 'center' // 标签居中对齐
      }
    },
    yAxis: {
      type: 'value'
    },
    series: [
      {
        data: data.map((item) => item.wordCount),
        type: 'bar',
        itemStyle: {
          // 条形图颜色设置：高亮的颜色与普通颜色
          color: (params) => {
            const isHighlighted = data[params.dataIndex].isHighlighted
            return isHighlighted ? '#4caf50' : '#42a5f5' // 高亮条形图为绿色，普通为蓝色
          }
        },
        label: {
          show: true, // 显示标签
          position: 'top', // 标签显示在条形图的顶部
          // color: '#000', // 标签的字体颜色
          fontWeight: 'bold', // 标签字体加粗
          fontSize: 14 // 标签字体大小
        }
      }
    ]
  }

  return echartConfig
}

export function outlineToMindMap(outline) {
  // 递归函数，将大纲树节点转换为MindMap格式
  function convertNode(node, indentLevel = 0) {
    // 基本的MindMap节点格式，动态缩进
    let result = `${'  '.repeat(indentLevel)}- ${node.title}`

    // 如果节点有子节点，递归调用convertNode
    if (node.children && node.children.length > 0) {
      node.children.forEach((child) => {
        // 为每个子节点递归调用，增加缩进级别
        result += `\n${convertNode(child, indentLevel + 1)}`
      })
    }

    return result
  }

  // 启动递归并返回完整的MindMap Markdown
  //     return `
  // \`\`\`mindmap
  // ${convertNode(outline)}
  // \`\`\`
  //     `.trim(); // 移除前后多余的换行
  return convertNode(outline)
}

export function generateWordFrequencyTrendChart(text, topWords) {
  const windowCount = 16 // 定义窗口的数量，可以根据需要调整
  const windowSize = Math.ceil(text.length / windowCount)

  // 词频统计函数
  function countWordFrequencyInWindow(windowStart, windowEnd, word) {
    let cnt = 0
    for (let i = windowStart; i < windowEnd - word.length + 1; i++) {
      if (text.substring(i, i + word.length) === word) {
        cnt++
      }
    }
    return cnt
  }

  // 生成 X 轴数据（文章进度的百分比）
  const xAxisData = Array.from({ length: windowCount }, (_, i) => {
    return ((((i + 1) * windowSize) / text.length) * text.length).toFixed(0) + '字' // 计算进度百分比
  })

  // 生成每个词的 Y 轴数据
  const seriesData = topWords.map((word, index) => {
    const wordFrequencies = []

    for (let i = 0; i < windowCount; i++) {
      const windowStart = i * windowSize
      const windowEnd = Math.min((i + 1) * windowSize, text.length)

      // 统计滑动窗口内的词频
      const frequency = countWordFrequencyInWindow(windowStart, windowEnd, word)
      wordFrequencies.push(frequency)
    }

    return {
      name: word,
      type: 'line',
      smooth: true,
      itemStyle: {
        color: `hsl(${index * 60}, 70%, 50%)` // 每个词的颜色不同
      },
      areaStyle: {
        normal: {}
      },
      z: index + 1,
      data: wordFrequencies
    }
  })

  // ECharts 配置
  const echartConfig = {
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross'
      }
    },
    legend: {
      data: topWords,
      textStyle: {
        color: '#999999' // 可选：图例文字颜色
      }
    },
    xAxis: [
      {
        type: 'category',
        boundaryGap: false,
        data: xAxisData,
        axisTick: { show: false },
        axisLine: { show: false }
      }
    ],
    yAxis: {
      type: 'value'
    },
    series: seriesData
  }

  // 返回 ECharts 配置
  return echartConfig
}

/**
 * 将 Markdown 中的图片转换为内联 data URL
 * - 对于位图（PNG、JPG等）：使用 base64 编码的 data URL
 * - 对于矢量图（SVG）：根据 convertSvgToBitmap 参数决定是否转换为位图
 * @param {string} md - Markdown 文本
 * @param {boolean} convertSvgToBitmap - 是否将 SVG 转换为位图（默认 true，用于 DOCX 导出）
 * @param {string} [docPath] - 可选，文档路径，用于解析相对路径图片（如 ./images/xxx.png）
 * @returns {Promise<string>} 处理后的 Markdown 文本
 */
export async function embedImagesInline(md, convertSvgToBitmap = true, docPath = '') {
  //查找markdown里面所有的图片链接，读取图片，转换为内联 data URL，返回经过替换后的markdown
  // 注意：SVG 图片默认转换为位图（PNG）后再转 base64，因为 html-to-docx 不支持 SVG
  // 但对于 HTML 导出，可以保持 SVG 格式（convertSvgToBitmap=false）

  const lines = md.split('\n')
  let new_md = ''
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const match = line.match(/!\[.*?\]\((.*?)\)/)
    if (match) {
      let image_path = match[1]

      // 检查 image_path 是否为空
      if (!image_path || image_path.trim() === '') {
        getLogger().warn('发现空的图片路径，跳过处理')
        new_md += line + '\n'
        continue
      }

      let dataUrl = ''
      // 相对路径：在 fetch 前尝试用 docPath 解析为绝对路径并走 read-file-for-upload
      if (
        docPath &&
        !image_path.startsWith('file://') &&
        !image_path.startsWith('http://') &&
        !image_path.startsWith('https://') &&
        !image_path.startsWith('data:')
      ) {
        try {
          const { resolvePathWithLinkBase } = await import('./path-resolver')
          const { getLinkBase } = await import('../stores/workspace')
          const linkBase = getLinkBase(docPath)
          const resolved = resolvePathWithLinkBase(image_path, linkBase || docPath)
          if (resolved && messageBridge.getIpc()) {
            const fileData = await messageBridge.invoke('read-file-for-upload', resolved)
            if (fileData && fileData.data) {
              const ext = (resolved.split(/[/\\]/).pop() || '').toLowerCase()
              const isSvg = ext === '.svg' || fileData.mimeType?.includes('svg')
              const mimeType = fileData.mimeType || 'image/png'
              if (isSvg && convertSvgToBitmap) {
                try {
                  const svgText = atob(fileData.data)
                  const { convertSvgToPng } = await import('./chart-pre-renderer')
                  const pngDataUrl = await convertSvgToPng(svgText, 2.0)
                  const base64Match = pngDataUrl.match(/^data:image\/png;base64,(.+)$/)
                  dataUrl = base64Match ? pngDataUrl : `data:${mimeType};base64,${fileData.data}`
                } catch (_) {
                  dataUrl = `data:${mimeType};base64,${fileData.data}`
                }
              } else if (isSvg) {
                dataUrl = `data:image/svg+xml;base64,${fileData.data}`
              } else {
                dataUrl = `data:${mimeType};base64,${fileData.data}`
              }
              if (dataUrl) {
                new_md += line.replace(image_path, dataUrl) + '\n'
                continue
              }
            }
          }
        } catch (e) {
          getLogger().debug('相对路径解析/读取失败，继续用 fetch:', image_path, e)
        }
      }
      try {
        // 处理 file:// 协议的 URL
        if (image_path.startsWith('file://')) {
          // 将 file:// URL 转换为本地文件路径
          let localPath = image_path.replace(/^file:\/\//, '')
          // Windows 路径处理：file:///C:/path -> C:/path
          if (localPath.startsWith('/') && /^[A-Za-z]:/.test(localPath.substring(1))) {
            localPath = localPath.substring(1)
          }
          // 解码 URL 编码的路径部分
          try {
            localPath = decodeURIComponent(localPath)
          } catch (e) {
            // 如果解码失败，使用原始路径
            getLogger().warn('URL 解码失败，使用原始路径', e)
          }

          if (!messageBridge.getIpc()) {
            throw new Error('IPC 渲染器不可用，无法读取本地文件')
          }

          const fileData = await messageBridge.invoke('read-file-for-upload', localPath)

          if (!fileData || !fileData.data) {
            throw new Error('文件数据为空')
          }

          // 检测文件类型（支持无后缀名图片）
          // 先尝试从 mimeType 判断，如果没有则通过文件内容判断
          let detectedMimeType = fileData.mimeType || 'application/octet-stream'
          let isSvg = false

          // 检查是否为 SVG（通过扩展名或 mimeType）
          if (
            localPath.toLowerCase().endsWith('.svg') ||
            detectedMimeType.includes('image/svg+xml') ||
            detectedMimeType.includes('image/svg')
          ) {
            isSvg = true
          } else {
            // 如果没有扩展名或 mimeType 不确定，尝试通过文件内容判断
            // 解码 base64 并检查文件头
            try {
              const fileBytes = atob(fileData.data)
              const header = fileBytes.substring(0, 100) // 检查前100个字符

              // 检查是否为 SVG（SVG 通常以 <svg 开头）
              if (
                header.trim().startsWith('<svg') ||
                (header.includes('<?xml') && header.includes('<svg'))
              ) {
                isSvg = true
                detectedMimeType = 'image/svg+xml'
              } else {
                // 使用 getMimeType 函数检测图片类型（需要先转换为字节数组）
                const { getMimeType } = await import('./image-utils')
                const bytes = new Uint8Array(fileBytes.length)
                for (let j = 0; j < fileBytes.length; j++) {
                  bytes[j] = fileBytes.charCodeAt(j)
                }
                const detectedType = getMimeType(bytes)
                if (detectedType !== 'application/octet-stream') {
                  detectedMimeType = detectedType
                }
              }
            } catch (e) {
              getLogger().warn('检测文件类型失败，使用默认类型', e)
            }
          }

          if (isSvg) {
            // SVG：根据 convertSvgToBitmap 参数决定是否转换为位图
            if (convertSvgToBitmap) {
              // DOCX 导出需要转换为位图（PNG），因为 html-to-docx 不支持 SVG
              getLogger().debug('检测到 SVG 图片，转换为位图')

              try {
                // 读取 SVG 文本内容
                const svgText = atob(fileData.data)
                if (!svgText || svgText.trim().length === 0) {
                  throw new Error('SVG 内容为空')
                }

                // 使用 convertSvgToPng 将 SVG 转换为 PNG
                const { convertSvgToPng } = await import('./chart-pre-renderer')
                const pngDataUrl = await convertSvgToPng(svgText, 2.0)

                // 提取 base64 部分
                const base64Match = pngDataUrl.match(/^data:image\/png;base64,(.+)$/)
                if (base64Match) {
                  dataUrl = pngDataUrl
                  getLogger().debug(`SVG 转换为 PNG data URL 成功，长度: ${dataUrl.length}`)
                } else {
                  throw new Error('PNG 转换结果格式不正确')
                }
              } catch (svgError) {
                getLogger().warn('SVG 转 PNG 失败，尝试使用原始 SVG', svgError)
                // 如果转换失败，尝试使用原始 SVG（虽然可能不被 html-to-docx 支持）
                const svgText = atob(fileData.data)
                const base64Svg = btoa(unescape(encodeURIComponent(svgText)))
                dataUrl = `data:image/svg+xml;base64,${base64Svg}`
              }
            } else {
              // HTML 导出保持 SVG 格式
              getLogger().debug('检测到 SVG 图片，保持 SVG 格式')
              const svgText = atob(fileData.data)
              const base64Svg = btoa(unescape(encodeURIComponent(svgText)))
              dataUrl = `data:image/svg+xml;base64,${base64Svg}`
            }
          } else {
            // 位图：直接使用 base64 data URL
            // 使用检测到的 mimeType，如果没有则使用 fileData.mimeType
            const mimeType =
              detectedMimeType !== 'application/octet-stream'
                ? detectedMimeType
                : fileData.mimeType || 'image/png'
            dataUrl = `data:${mimeType};base64,${fileData.data}`
            getLogger().debug(
              `位图转换为 data URL 成功，长度: ${dataUrl.length}, 类型: ${mimeType}`
            )
          }
        } else {
          // 网络图：优先用主进程下载（无 CORS），再写回 Markdown 由 Vditor 生成 HTML，与本地图一致
          if (
            messageBridge.getIpc() &&
            (image_path.startsWith('http://') || image_path.startsWith('https://'))
          ) {
            try {
              const mainDataUrl = await messageBridge.invoke(
                'download-image-to-data-url',
                image_path
              )
              if (mainDataUrl && mainDataUrl.startsWith('data:')) {
                const newLine = line.replace(image_path, mainDataUrl)
                new_md += newLine + '\n'
                continue
              }
            } catch (ipcErr) {
              getLogger().debug('主进程下载网络图失败，尝试 fetch:', image_path, ipcErr)
            }
          }
          // 非 file:// 协议，使用原有的 fetch 方式
          const response = await fetch(image_path)

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          }

          // 检查是否为 SVG（通过 URL 或 Content-Type）
          const contentType = response.headers.get('content-type') || ''
          let isSvg =
            image_path.toLowerCase().endsWith('.svg') ||
            contentType.includes('image/svg+xml') ||
            contentType.includes('image/svg')

          if (isSvg) {
            // SVG：根据 convertSvgToBitmap 参数决定是否转换为位图
            // 先读取 SVG 文本内容并保存，避免 response body 被重复读取
            const svgText = await response.text()
            if (!svgText || svgText.trim().length === 0) {
              throw new Error('SVG 内容为空')
            }

            if (convertSvgToBitmap) {
              // DOCX 导出需要转换为位图（PNG），因为 html-to-docx 不支持 SVG
              getLogger().debug('检测到 SVG 图片，转换为位图')

              try {
                // 使用 convertSvgToPng 将 SVG 转换为 PNG
                // 注意：convertSvgToPng 返回的是 Blob，需要转换为 data URL
                const { convertSvgToPng } = await import('./chart-pre-renderer')
                const pngBlob = await convertSvgToPng(svgText, 2.0)

                // 将 Blob 转换为 data URL
                const reader = new FileReader()
                dataUrl = await new Promise((resolve, reject) => {
                  reader.onload = () => {
                    if (reader.result && typeof reader.result === 'string') {
                      resolve(reader.result)
                    } else {
                      reject(new Error('读取 PNG 数据失败'))
                    }
                  }
                  reader.onerror = () => reject(new Error('FileReader 错误'))
                  reader.readAsDataURL(pngBlob)
                })

                getLogger().debug(`SVG 转换为 PNG data URL 成功，长度: ${dataUrl.length}`)
              } catch (svgError) {
                getLogger().warn('SVG 转 PNG 失败，尝试使用主进程转换或原始 SVG', svgError)

                try {
                  if (messageBridge.getIpc()) {
                    try {
                      const result = await messageBridge.invoke(
                        'convert-svg-string-to-png',
                        svgText,
                        2.0
                      )

                      if (result.success && result.url) {
                        // 读取生成的 PNG 文件并转换为 base64
                        const pngResponse = await fetch(result.url)
                        if (pngResponse.ok) {
                          const pngBlob = await pngResponse.blob()
                          const reader = new FileReader()
                          dataUrl = await new Promise((resolve, reject) => {
                            reader.onload = () => {
                              if (reader.result && typeof reader.result === 'string') {
                                resolve(reader.result)
                              } else {
                                reject(new Error('读取 PNG 数据失败'))
                              }
                            }
                            reader.onerror = () => reject(new Error('FileReader 错误'))
                            reader.readAsDataURL(pngBlob)
                          })
                          getLogger().debug(`主进程 SVG 转 PNG 成功，长度: ${dataUrl.length}`)
                        } else {
                          throw new Error(`读取 PNG 文件失败: ${pngResponse.status}`)
                        }
                      } else {
                        throw new Error(result.error || '主进程 SVG 转换失败')
                      }
                    } catch (ipcError) {
                      getLogger().warn('主进程 SVG 转换失败，使用原始 SVG', ipcError)
                      const base64Svg = btoa(unescape(encodeURIComponent(svgText)))
                      dataUrl = `data:image/svg+xml;base64,${base64Svg}`
                    }
                  } else {
                    // 如果没有 IPC，使用原始 SVG
                    const base64Svg = btoa(unescape(encodeURIComponent(svgText)))
                    dataUrl = `data:image/svg+xml;base64,${base64Svg}`
                  }
                } catch (fallbackError) {
                  // 如果所有转换都失败，使用原始 SVG（虽然可能不被 html-to-docx 支持）
                  getLogger().warn('所有 SVG 转换方法都失败，使用原始 SVG', fallbackError)
                  const base64Svg = btoa(unescape(encodeURIComponent(svgText)))
                  dataUrl = `data:image/svg+xml;base64,${base64Svg}`
                }
              }
            } else {
              // HTML 导出保持 SVG 格式
              getLogger().debug('检测到 SVG 图片，保持 SVG 格式')
              const base64Svg = btoa(unescape(encodeURIComponent(svgText)))
              dataUrl = `data:image/svg+xml;base64,${base64Svg}`
            }
          } else {
            // 位图：使用 base64 编码的 data URL
            // 添加重试机制，因为文件可能还没完全写入
            let blob = await response.blob()
            let retryCount = 0
            const maxRetries = 3
            const retryDelay = 200 // 200ms

            // 如果 blob 为空，尝试重试
            while ((!blob || blob.size === 0) && retryCount < maxRetries) {
              retryCount++
              if (retryCount <= maxRetries) {
                getLogger().warn(`图片数据为空，重试 ${retryCount}/${maxRetries}: ${image_path}`)
                // 等待一段时间让文件完全写入
                await new Promise((resolve) => setTimeout(resolve, retryDelay * retryCount))
                // 重新 fetch
                try {
                  const retryResponse = await fetch(image_path)
                  if (retryResponse.ok) {
                    blob = await retryResponse.blob()
                  }
                } catch (retryError) {
                  getLogger().warn(`重试 fetch 失败: ${image_path}`, retryError)
                }
              }
            }

            if (!blob || blob.size === 0) {
              throw new Error(`图片数据为空（已重试 ${retryCount} 次）: ${image_path}`)
            }

            // 检测图片类型（支持无后缀名图片）
            let detectedMimeType = contentType || blob.type || 'image/png'

            // 如果 Content-Type 不确定，尝试通过文件内容判断
            if (!contentType || contentType === 'application/octet-stream' || !blob.type) {
              try {
                const arrayBuffer = await blob.arrayBuffer()
                const bytes = new Uint8Array(arrayBuffer)
                const { getMimeType } = await import('./image-utils')
                const detectedType = getMimeType(bytes)
                if (detectedType !== 'application/octet-stream') {
                  detectedMimeType = detectedType
                }
              } catch (e) {
                getLogger().warn('检测文件类型失败，使用默认类型', e)
              }
            }

            const reader = new FileReader()
            reader.readAsDataURL(blob)
            dataUrl = await new Promise((resolve, reject) => {
              reader.onload = () => {
                if (reader.result && typeof reader.result === 'string') {
                  // 如果检测到的类型与 blob 类型不同，替换 mime type
                  if (detectedMimeType !== blob.type && detectedMimeType !== 'image/png') {
                    const base64Match = reader.result.match(/^data:[^;]+;base64,(.+)$/)
                    if (base64Match) {
                      resolve(`data:${detectedMimeType};base64,${base64Match[1]}`)
                    } else {
                      resolve(reader.result)
                    }
                  } else {
                    resolve(reader.result)
                  }
                } else {
                  reject(new Error('读取图片数据失败'))
                }
              }
              reader.onerror = () => reject(new Error('FileReader 错误'))
            })
            getLogger().debug(
              `位图转换为 data URL 成功，长度: ${dataUrl.length}, 原始大小: ${blob.size} bytes, 类型: ${detectedMimeType}`
            )
          }

          // 验证 data URL 格式
          if (!dataUrl || !dataUrl.startsWith('data:')) {
            throw new Error('生成的 data URL 格式不正确')
          }
        }
      } catch (error) {
        getLogger().error(`图片转换失败: ${image_path}`, error)
        eventBus.emit('show-error', `图片转换失败: ${image_path} - ${error.message}`)
        // 转换失败时保持原路径
        dataUrl = image_path
      }
      // 替换图片路径为 data URL
      const newLine = line.replace(image_path, dataUrl)
      new_md += newLine + '\n'
    } else {
      new_md += line + '\n'
    }
  }
  return new_md
}

export async function image2local(md) {
  //查找markdown里面所有的图片链接，读取图片，将路径替换为本地路径，返回经过替换后的markdown
  const local_path = await getImagePath()
  const lines = md.split('\n')
  let new_md = ''
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // 把运行时服务器 /images/ URL 替换成 local_path
    const imagesPrefix = getRuntimeServerBaseUrlSync() + '/images/'
    const match = line.match(/!\[.*?\]\((.*?)\)/)
    if (match) {
      const image_path = match[1]

      let image_name = ''

      if (image_path.startsWith(imagesPrefix)) {
        // HTTP URL，提取文件名
        image_name = image_path.slice(imagesPrefix.length)
      } else if (image_path.startsWith('data:image/')) {
        // Base64 图片，跳过（不需要转换为本地路径）
        new_md += line + '\n'
        continue
      } else {
        // 其他格式，尝试提取文件名
        image_name = image_path.split(/[/\\]/).pop() || image_path
      }

      // 使用 path.join 确保路径正确（跨平台兼容）

      const local_image_path = await getImagePath()
      const local_image_url = local_image_path + '/' + image_name
      new_md += line.replace(image_path, local_image_url) + '\n'
    } else {
      new_md += line + '\n'
    }
  }
  return new_md
}
/**
 * 将本地图片路径转换为 HTTP URL
 * @param md Markdown 文本
 * @param docPath 可选，文档路径，用于解析相对路径
 * @returns 转换后的 Markdown 文本
 */
export async function local2httpProtocol(md, docPath = '') {
  // 把 local_path 替换成运行时服务器 /images/ URL
  const serverImagesPrefix = getRuntimeServerBaseUrlSync() + '/images/'
  const local_path = await getImagePath()
  const lines = md.split('\n')
  let new_md = ''

  // 使用统一的路径解析服务（在函数外部导入，避免重复导入）
  // 注意：这里使用动态导入是因为 path-resolver 是 TypeScript 文件

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // 把 local_path 替换成运行时服务器 /images/ URL
    // 改进正则表达式，确保正确处理嵌套链接和 URL
    // 匹配格式: ![alt](url) 或 ![alt text](url)
    // 使用更精确的匹配，避免匹配到嵌套链接中的内容
    const match = line.match(/!\[([^\]]*)\]\(([^)]+)\)/)
    if (match) {
      let image_path = match[2].trim() // 提取 URL 并去除首尾空格

      // 处理不同的路径格式：
      // 1. HTTP URL：运行时服务器 /images/filename（已经是正确的，不需要转换）
      // 2. 相对路径（./xxx.jpg 或 ../xxx.jpg）：先转换为绝对路径
      // 3. local_path 下的本地路径：直接提取文件名并转换
      // 4. 其他本地路径：先通过 API 上传，然后转换为 HTTP URL

      let server_url = ''

      if (image_path.startsWith(serverImagesPrefix)) {
        // 已经是 HTTP URL，直接使用
        new_md += line + '\n'
        continue
      } else if (image_path.startsWith('http://') || image_path.startsWith('https://')) {
        // 其他 HTTP/HTTPS URL，保持原样
        new_md += line + '\n'
        continue
      } else if (image_path.startsWith('data:')) {
        // Base64 图片，保持原样
        new_md += line + '\n'
        continue
      } else {
        // 所有路径都经过 path-resolver 处理（绝对路径会直接返回，相对路径会解析）
        let resolvedImagePath = image_path

        if (docPath) {
          // 使用统一的路径解析服务（同步函数，不需要 await）
          const { resolvePathWithLinkBase } = await import('./path-resolver')
          // 将 docPath 转换为 linkBase 格式（目录路径）
          const { getLinkBase } = await import('../stores/workspace')
          const linkBase = getLinkBase(docPath)
          resolvedImagePath = resolvePathWithLinkBase(image_path, linkBase || docPath)
          //getLogger().debug(`路径解析结果: ${image_path} -> ${resolvedImagePath}`, { docPath, linkBase });
        }

        // 本地路径处理
        // 支持 Windows 路径（\）和 Unix 路径（/）
        const normalizedLocalPath = local_path.replace(/\\/g, '/')
        const normalizedImagePath = resolvedImagePath.replace(/\\/g, '/')

        // 判断是否在 local_path 下
        const isInLocalPath =
          normalizedImagePath.startsWith(normalizedLocalPath + '/') ||
          normalizedImagePath.startsWith(normalizedLocalPath)

        if (isInLocalPath) {
          // 在 local_path 下，直接提取文件名并转换
          let image_name = ''
          if (normalizedImagePath.startsWith(normalizedLocalPath + '/')) {
            image_name = normalizedImagePath.slice(normalizedLocalPath.length + 1)
          } else if (normalizedImagePath === normalizedLocalPath) {
            // 如果路径就是 local_path 本身（不太可能，但处理一下）
            image_name = resolvedImagePath.split(/[/\\]/).pop()
          } else {
            image_name = normalizedImagePath.slice(normalizedLocalPath.length)
          }
          server_url = serverImagesPrefix + image_name
        } else {
          // 不在 local_path 下，需要通过 API 上传
          // 注意：这里使用解析后的绝对路径（如果之前是相对路径，已经转换了）
          try {
            getLogger().debug(`上传图片: ${resolvedImagePath}`, {
              originalPath: image_path,
              docPath
            })
            const response = await fetch(getRuntimeServerBaseUrlSync() + '/api/image/url-upload', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ url: resolvedImagePath })
            })

            if (!response.ok) {
              // 如果是 404 错误，说明文件不存在，保持原路径
              if (response.status === 404) {
                getLogger().warn(`图片文件不存在，保持原路径: ${resolvedImagePath}`, {
                  originalPath: image_path
                })
                // 保持原路径，不进行转换
                new_md += line + '\n'
                continue
              }
              throw new Error(`上传失败: ${response.status}`)
            }

            const result = await response.json()
            if (result.code === 0 && result.data && result.data.url) {
              // 从返回的服务器路径中提取文件名
              // result.data.url 格式类似: C:\Users\...\Pictures\meta-doc-imgs\1234567890.jpg
              const serverPath = result.data.url
              const fileName = serverPath.split(/[/\\]/).pop()
              server_url = getRuntimeServerBaseUrlSync() + '/images/' + fileName
            } else {
              throw new Error(result.error || '上传失败')
            }
          } catch (error) {
            // 如果是 404 错误（文件不存在），保持原路径
            if (error.message && error.message.includes('404')) {
              getLogger().warn(`图片文件不存在，保持原路径: ${resolvedImagePath}`, {
                originalPath: image_path,
                error: error.message
              })
              // 保持原路径，不进行转换
              new_md += line + '\n'
              continue
            }
            getLogger().error(`图片上传失败: ${resolvedImagePath}`, error)
            eventBus.emit('show-error', `图片上传失败: ${resolvedImagePath} - ${error.message}`)
            // 上传失败时，保持原路径（不再尝试使用文件名作为回退方案，因为文件可能不存在）
            new_md += line + '\n'
            continue
          }
        }
      }

      // 修复：应该替换 match[2]（图片路径），而不是 match[1]（alt 文本）
      new_md += line.replace(match[2], server_url) + '\n'
    } else {
      new_md += line + '\n'
    }
  }
  //console.log(new_md);
  return new_md
}

/**
 * 将本地图片路径转换为 file:// 协议 URL
 * @param md Markdown 文本
 * @param docPath 可选，文档路径，用于解析相对路径
 * @returns 转换后的 Markdown 文本
 */
export async function local2fileProtocol(md, docPath = '') {
  const lines = md.split('\n')
  let new_md = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // 匹配格式: ![alt](url) 或 ![alt text](url)
    const match = line.match(/!\[([^\]]*)\]\(([^)]+)\)/)
    if (match) {
      let image_path = match[2].trim() // 提取 URL 并去除首尾空格

      // 如果已经是 HTTP/HTTPS URL、data URL 或 file:// 协议，保持原样
      if (
        image_path.startsWith('http://') ||
        image_path.startsWith('https://') ||
        image_path.startsWith('data:') ||
        image_path.startsWith('file://')
      ) {
        new_md += line + '\n'
        continue
      }

      // 处理相对路径
      let resolvedImagePath = image_path
      if (docPath) {
        try {
          // 使用统一的路径解析服务
          const { resolvePathWithLinkBase } = await import('./path-resolver')
          const { getLinkBase } = await import('../stores/workspace')
          const linkBase = getLinkBase(docPath)
          resolvedImagePath = resolvePathWithLinkBase(image_path, linkBase || docPath)
        } catch (error) {
          getLogger().warn('路径解析失败，使用原始路径', error)
        }
      }

      // 转换为 file:// 协议
      // Windows 路径处理：C:\path\to\file -> file:///C:/path/to/file
      // Unix 路径处理：/path/to/file -> file:///path/to/file
      let fileUrl = resolvedImagePath

      // 统一使用正斜杠
      fileUrl = fileUrl.replace(/\\/g, '/')

      // 如果是 Windows 路径（如 C:/path），转换为 file:///C:/path
      if (/^[A-Za-z]:/.test(fileUrl)) {
        // Windows 路径：C:/path -> file:///C:/path
        // 注意：file:// 协议在 Windows 上需要三个斜杠：file:///C:/path
        fileUrl = 'file:///' + fileUrl
      } else if (fileUrl.startsWith('/')) {
        // Unix 绝对路径：/path -> file:///path
        fileUrl = 'file://' + fileUrl
      } else {
        // 相对路径：保持原样（或者可以基于 docPath 转换为绝对路径）
        // 这里我们保持原样，因为相对路径在浏览器中可能无法正确解析
        new_md += line + '\n'
        continue
      }

      // 对路径进行编码
      // Windows 路径格式：file:///C:/Users/...
      // 需要将路径的每一部分编码，但保持驱动器号和斜杠
      let encodedFileUrl = fileUrl

      if (/^file:\/\/\/[A-Za-z]:/.test(fileUrl)) {
        // Windows 路径：file:///C:/Users/...
        // 提取协议、驱动器号和路径部分
        const match = fileUrl.match(/^(file:\/\/\/)([A-Za-z]:)(\/.*)$/)
        if (match) {
          const [, protocol, drive, path] = match
          // 对路径的每一部分进行编码，但保持斜杠
          const encodedPath = path
            .split('/')
            .map((part) => (part ? encodeURIComponent(part) : ''))
            .join('/')
          encodedFileUrl = protocol + drive + encodedPath
        }
      } else {
        // Unix 路径或其他情况
        // 对路径的每一部分进行编码
        const parts = fileUrl.split('/')
        const encodedParts = parts.map((part, index) => {
          if (index === 0) {
            // file:// 保持不变
            return part
          }
          if (index === 1 && part === '') {
            // 空部分（file:// 后的第一个空部分）保持不变
            return part
          }
          // 对其他部分进行编码
          return part ? encodeURIComponent(part) : ''
        })
        encodedFileUrl = encodedParts.join('/')
      }

      // 替换图片路径为 file:// URL
      new_md += line.replace(match[2], encodedFileUrl) + '\n'
    } else {
      new_md += line + '\n'
    }
  }
  return new_md
}

/**
 * 将本地图片路径和运行时服务器 images URL 转换为 file:// 协议 URL（用于HTML导出）
 * 但保留http(s)网络链接
 * @param md Markdown 文本
 * @param docPath 可选，文档路径，用于解析相对路径
 * @returns 转换后的 Markdown 文本
 */
export async function local2fileProtocolForHtml(md, docPath = '') {
  const { getImagePath } = await import('./settings')
  const local_path = await getImagePath()
  const lines = md.split('\n')
  let new_md = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // 匹配格式: ![alt](url) 或 ![alt text](url)
    const match = line.match(/!\[([^\]]*)\]\(([^)]+)\)/)
    if (match) {
      let image_path = match[2].trim() // 提取 URL 并去除首尾空格

      // 如果已经是 http(s) 网络链接、data URL 或 file:// 协议，保持原样
      if (
        (image_path.startsWith('http://') &&
          !image_path.startsWith(getRuntimeServerBaseUrlSync() + '/')) ||
        image_path.startsWith('https://') ||
        image_path.startsWith('data:') ||
        image_path.startsWith('file://')
      ) {
        new_md += line + '\n'
        continue
      }

      // 处理运行时服务器 images URL 或系统路径
      let resolvedImagePath = image_path

      const runtimeImagesPrefix = getRuntimeServerBaseUrlSync() + '/images/'
      if (image_path.startsWith(runtimeImagesPrefix)) {
        const imageName = image_path.replace(runtimeImagesPrefix, '')
        resolvedImagePath = local_path.replace(/\\/g, '/') + '/' + imageName
      } else {
        // 处理相对路径
        if (docPath) {
          try {
            // 使用统一的路径解析服务
            const { resolvePathWithLinkBase } = await import('./path-resolver')
            const { getLinkBase } = await import('../stores/workspace')
            const linkBase = getLinkBase(docPath)
            resolvedImagePath = resolvePathWithLinkBase(image_path, linkBase || docPath)
          } catch (error) {
            getLogger().warn('路径解析失败，使用原始路径', error)
          }
        }
      }

      // 转换为 file:// 协议
      // Windows 路径处理：C:\path\to\file -> file:///C:/path/to/file
      // Unix 路径处理：/path/to/file -> file:///path/to/file
      let fileUrl = resolvedImagePath

      // 统一使用正斜杠
      fileUrl = fileUrl.replace(/\\/g, '/')

      // 如果是 Windows 路径（如 C:/path），转换为 file:///C:/path
      if (/^[A-Za-z]:/.test(fileUrl)) {
        // Windows 路径：C:/path -> file:///C:/path
        // 注意：file:// 协议在 Windows 上需要三个斜杠：file:///C:/path
        fileUrl = 'file:///' + fileUrl
      } else if (fileUrl.startsWith('/')) {
        // Unix 绝对路径：/path -> file:///path
        fileUrl = 'file://' + fileUrl
      } else {
        // 相对路径：保持原样（或者可以基于 docPath 转换为绝对路径）
        // 这里我们保持原样，因为相对路径在浏览器中可能无法正确解析
        new_md += line + '\n'
        continue
      }

      // 对路径进行编码
      // Windows 路径格式：file:///C:/Users/...
      // 需要将路径的每一部分编码，但保持驱动器号和斜杠
      let encodedFileUrl = fileUrl

      if (/^file:\/\/\/[A-Za-z]:/.test(fileUrl)) {
        // Windows 路径：file:///C:/Users/...
        // 提取协议、驱动器号和路径部分
        const match = fileUrl.match(/^(file:\/\/\/)([A-Za-z]:)(\/.*)$/)
        if (match) {
          const [, protocol, drive, path] = match
          // 对路径的每一部分进行编码，但保持斜杠
          const encodedPath = path
            .split('/')
            .map((part) => (part ? encodeURIComponent(part) : ''))
            .join('/')
          encodedFileUrl = protocol + drive + encodedPath
        }
      } else {
        // Unix 路径或其他情况
        // 对路径的每一部分进行编码
        const parts = fileUrl.split('/')
        const encodedParts = parts.map((part, index) => {
          if (index === 0) {
            // file:// 保持不变
            return part
          }
          if (index === 1 && part === '') {
            // 空部分（file:// 后的第一个空部分）保持不变
            return part
          }
          // 对其他部分进行编码
          return part ? encodeURIComponent(part) : ''
        })
        encodedFileUrl = encodedParts.join('/')
      }

      // 替换图片路径为 file:// URL
      new_md += line.replace(match[2], encodedFileUrl) + '\n'
    } else {
      new_md += line + '\n'
    }
  }
  return new_md
}

/**
 * 下载网络图片并上传到本地服务（用于TEX导出的original模式）
 * @param md Markdown 文本
 * @param docPath 可选，文档路径，用于解析相对路径
 * @returns 转换后的 Markdown 文本
 */
export async function downloadAndUploadNetworkImages(md, docPath = '') {
  const lines = md.split('\n')
  let new_md = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // 匹配格式: ![alt](url) 或 ![alt text](url)
    const match = line.match(/!\[([^\]]*)\]\(([^)]+)\)/)
    if (match) {
      let image_path = match[2].trim() // 提取 URL 并去除首尾空格

      // 检查是否是网络图片（http(s)但不是运行时服务器）
      const isNetworkImage =
        (image_path.startsWith('http://') &&
          !image_path.startsWith(getRuntimeServerBaseUrlSync() + '/')) ||
        image_path.startsWith('https://')

      // 检查是否是 data: URL 或 blob: URL（图表渲染后的图片）
      const isDataUrl = image_path.startsWith('data:')
      const isBlobUrl = image_path.startsWith('blob:')

      if (isNetworkImage) {
        // 下载网络图片并上传到本地服务
        try {
          getLogger().debug(`下载并上传网络图片: ${image_path}`)
          const response = await fetch(getRuntimeServerBaseUrlSync() + '/api/image/url-upload', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url: image_path })
          })

          if (!response.ok) {
            getLogger().warn(`网络图片上传失败: ${image_path}`, { status: response.status })
            // 上传失败时保持原URL
            new_md += line + '\n'
            continue
          }

          const result = await response.json()
          if (result.code === 0 && result.data && result.data.url) {
            // 从返回的服务器路径中提取文件名
            const serverPath = result.data.url
            const fileName = serverPath.split(/[/\\]/).pop()
            const server_url = getRuntimeServerBaseUrlSync() + '/images/' + fileName
            // 替换为本地URL - 使用完整的匹配来确保正确替换
            const newLine = line.replace(match[0], `![${match[1]}](${server_url})`)
            new_md += newLine + '\n'
            getLogger().debug(`网络图片已上传: ${image_path} -> ${server_url}`)
          } else {
            throw new Error(result.error || '上传失败')
          }
        } catch (error) {
          getLogger().error(`网络图片处理失败: ${image_path}`, error)
          // 处理失败时保持原URL
          new_md += line + '\n'
        }
      } else if (isDataUrl || isBlobUrl) {
        // 处理 data: URL 或 blob: URL（图表渲染后的图片）
        try {
          getLogger().debug(`上传 ${isDataUrl ? 'data' : 'blob'} URL 图片到本地服务`)

          let blob
          if (isDataUrl) {
            // 将 data URL 转换为 Blob
            const response = await fetch(image_path)
            blob = await response.blob()
          } else {
            // 将 blob URL 转换为 Blob
            const response = await fetch(image_path)
            blob = await response.blob()
          }

          // 确定文件扩展名
          let ext = 'png'
          if (blob.type) {
            if (blob.type.includes('svg')) {
              ext = 'svg'
            } else if (blob.type.includes('jpeg') || blob.type.includes('jpg')) {
              ext = 'jpg'
            } else if (blob.type.includes('gif')) {
              ext = 'gif'
            } else if (blob.type.includes('webp')) {
              ext = 'webp'
            }
          }

          // 生成文件名（使用时间戳避免冲突）
          const fileName = `chart_${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${ext}`

          // 上传到本地服务器
          const formData = new FormData()
          const file = new File([blob], fileName, { type: blob.type || 'application/octet-stream' })
          formData.append('file[]', file, fileName)

          const uploadResponse = await fetch(
            getRuntimeServerBaseUrlSync() + '/api/image/upload?keepName=1',
            {
              method: 'POST',
              body: formData
            }
          )

          if (!uploadResponse.ok) {
            throw new Error(`上传失败: ${uploadResponse.status}`)
          }

          const uploadResult = await uploadResponse.json()
          if (uploadResult.code === 0 && uploadResult.data && uploadResult.data.succMap) {
            const uploadedFileName = Object.keys(uploadResult.data.succMap)[0] || fileName
            const server_url = getRuntimeServerBaseUrlSync() + '/images/' + uploadedFileName
            // 替换为本地URL
            const newLine = line.replace(match[0], `![${match[1]}](${server_url})`)
            new_md += newLine + '\n'
            getLogger().debug(
              `${isDataUrl ? 'data' : 'blob'} URL 图片已上传: ${image_path.substring(0, 50)}... -> ${server_url}`
            )
          } else {
            throw new Error(uploadResult.error || '上传失败')
          }
        } catch (error) {
          getLogger().error(
            `${isDataUrl ? 'data' : 'blob'} URL 图片处理失败: ${image_path.substring(0, 50)}...`,
            error
          )
          // 处理失败时保持原URL
          new_md += line + '\n'
        }
      } else {
        // 非网络图片，保持原样
        new_md += line + '\n'
      }
    } else {
      new_md += line + '\n'
    }
  }
  return new_md
}

/**
 * 将 HTML 中的运行时服务器 images URL 转换为 file:// 协议（用于HTML导出的original模式）
 * 但保留http(s)网络链接
 * @param html HTML 文本
 * @returns 转换后的 HTML 文本
 */
export async function local2fileProtocolForHtmlInHtml(html) {
  const { getImagePath } = await import('./settings')
  const local_path = await getImagePath()

  // 处理 HTML 中的图片链接
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi
  let processedHtml = html

  processedHtml = processedHtml.replace(imgRegex, (match, src) => {
    const runtimeImagesPrefix = getRuntimeServerBaseUrlSync() + '/images/'
    if (src.startsWith(runtimeImagesPrefix)) {
      const imageName = src.replace(runtimeImagesPrefix, '')
      const resolvedImagePath = local_path.replace(/\\/g, '/') + '/' + imageName

      // 转换为 file:// 协议
      let fileUrl = resolvedImagePath

      // 统一使用正斜杠
      fileUrl = fileUrl.replace(/\\/g, '/')

      // 如果是 Windows 路径（如 C:/path），转换为 file:///C:/path
      if (/^[A-Za-z]:/.test(fileUrl)) {
        fileUrl = 'file:///' + fileUrl
      } else if (fileUrl.startsWith('/')) {
        fileUrl = 'file://' + fileUrl
      } else {
        // 相对路径：保持原样
        return match
      }

      // 对路径进行编码
      let encodedFileUrl = fileUrl

      if (/^file:\/\/\/[A-Za-z]:/.test(fileUrl)) {
        const match = fileUrl.match(/^(file:\/\/\/)([A-Za-z]:)(\/.*)$/)
        if (match) {
          const [, protocol, drive, path] = match
          const encodedPath = path
            .split('/')
            .map((part) => (part ? encodeURIComponent(part) : ''))
            .join('/')
          encodedFileUrl = protocol + drive + encodedPath
        }
      } else {
        const parts = fileUrl.split('/')
        const encodedParts = parts.map((part, index) => {
          if (index === 0) {
            return part
          }
          if (index === 1 && part === '') {
            return part
          }
          return part ? encodeURIComponent(part) : ''
        })
        encodedFileUrl = encodedParts.join('/')
      }

      // 替换 src 属性
      return match.replace(src, encodedFileUrl)
    }
    // 如果是 http(s) 网络链接，保持原样
    if (
      (src.startsWith('http://') && !src.startsWith(getRuntimeServerBaseUrlSync() + '/')) ||
      src.startsWith('https://')
    ) {
      return match
    }
    // 其他情况（data URL、file:// 等）保持原样
    return match
  })

  return processedHtml
}

/**
 * 统一的 Markdown 预览渲染函数
 * @param {HTMLElement} container - 渲染容器的 DOM 元素
 * @param {string} markdown - 要渲染的 Markdown 文本
 * @param {Object} options - 可选配置
 * @param {string} options.linkBase - 用于解析相对路径的基础路径
 * @param {boolean} options.renderCode - 是否渲染代码块（默认 true）
 * @param {boolean} options.renderMath - 是否渲染数学公式（默认 true）
 * @param {boolean} options.applyMermaidTheme - 是否应用 Mermaid 主题适配（默认 false，仅在用户手册中使用）
 * @returns {Promise<void>}
 */
export async function renderMarkdownPreview(container, markdown, options = {}) {
  const { linkBase = '', renderCode = true, renderMath = true, applyMermaidTheme = false } = options

  // 获取 CDN
  const cdn = isElectronEnv() ? getLocalVditorCDN() : vditorCDN

  // 获取主题设置（内容区 theme 须为 dark/light/ant-design/wechat，不可使用工具栏的 classic）
  const contentTheme = resolveVditorContentThemeSettingValue(await getSetting('contentTheme'))
  const codeTheme = resolveVditorCodeThemeSettingValue(await getSetting('codeTheme'))
  const lineNumber = (await getSetting('lineNumber')) ?? true
  const mathInlineDigit = (await getSetting('mathInlineDigit')) ?? true

  // 清空容器
  container.innerHTML = ''

  // 构建预览选项
  const previewOptions = {
    cdn,
    mode: themeState.currentTheme.type === 'dark' ? 'dark' : 'light',
    theme: {
      current: contentTheme
    },
    markdown: {
      linkBase: linkBase
    },
    hljs: {
      style: codeTheme,
      lineNumber: lineNumber
    },
    math: {
      inlineDigit: mathInlineDigit
    }
  }

  // 调用 Vditor.preview
  await Vditor.preview(container, markdown, previewOptions)

  // 可选：渲染代码块和数学公式
  if (renderCode && typeof Vditor.codeRender === 'function') {
    Vditor.codeRender(container)
  }

  if (renderMath && typeof Vditor.mathRender === 'function') {
    Vditor.mathRender(container, { cdn })
  }

  // 仅在用户手册中统一适配 Mermaid 图表主题：根据当前主题统一节点背景色和字体颜色
  // 延迟执行以确保 Mermaid 完全渲染完成
  if (applyMermaidTheme) {
    // 立即执行一次
    applyMermaidThemeToContainer(container)
    // 延迟执行以确保覆盖所有动态渲染的元素
    setTimeout(() => {
      applyMermaidThemeToContainer(container)
    }, 100)
    setTimeout(() => {
      applyMermaidThemeToContainer(container)
    }, 500)
  }
}

/**
 * 统一适配 Mermaid 图表主题，确保节点背景色和字体颜色随主题变化
 * 仅在用户手册中使用
 * @param {HTMLElement} container - 包含 Mermaid 图表的容器
 */
function applyMermaidThemeToContainer(container) {
  if (!container) return

  const isDark = themeState.currentTheme.type === 'dark'

  // 定义主题配色：亮色/暗色模式下的节点背景色、边框色、字体颜色
  const lightTheme = {
    nodeFill: '#f3f4f6', // 浅灰背景（与手册中硬编码的一致）
    nodeStroke: '#374151', // 深灰边框
    textFill: '#333333', // 深色文字
    edgeStroke: '#333333', // 深色连线
    clusterFill: '#ffffde', // 浅黄集群背景
    clusterStroke: '#aaaa33' // 深黄集群边框
  }

  const darkTheme = {
    nodeFill: '#2d2d30', // 深灰背景
    nodeStroke: '#3e3e42', // 稍浅的深灰边框
    textFill: '#cccccc', // 浅色文字
    edgeStroke: '#cccccc', // 浅色连线
    clusterFill: '#3d3d2d', // 深黄集群背景
    clusterStroke: '#888833' // 浅黄集群边框
  }

  const theme = isDark ? darkTheme : lightTheme

  // 查找所有 Mermaid SVG 元素
  const mermaidSvgs = container.querySelectorAll('.language-mermaid svg, [class*="mermaid"] svg')

  mermaidSvgs.forEach((svg) => {
    if (!(svg instanceof SVGElement)) return

    // 1. 强制统一节点背景色和边框色（所有可能的节点形状）
    // 包括：rect.label-container, .node 下的所有形状，以及所有可能的节点容器
    const nodeShapes = svg.querySelectorAll(
      'rect.label-container, circle.label-container, ellipse.label-container, polygon.label-container, path.label-container, ' +
        '.node rect, .node circle, .node ellipse, .node polygon, .node path, ' +
        'g.node rect, g.node circle, g.node ellipse, g.node polygon, g.node path, ' +
        'rect[class*="label"], circle[class*="label"], ellipse[class*="label"], polygon[class*="label"], path[class*="label"]'
    )
    nodeShapes.forEach((shape) => {
      const element = /** @type {SVGElement} */ (shape)
      // 强制设置 fill 和 stroke，覆盖所有现有样式
      element.setAttribute('fill', theme.nodeFill)
      element.setAttribute('stroke', theme.nodeStroke)
      // 同时更新 style 属性以确保优先级
      const currentStyle = element.getAttribute('style') || ''
      const newStyle = currentStyle
        .replace(/fill:\s*[^;]+/gi, `fill: ${theme.nodeFill}`)
        .replace(/stroke:\s*[^;]+/gi, `stroke: ${theme.nodeStroke}`)
      if (!newStyle.includes('fill:')) {
        element.setAttribute(
          'style',
          (newStyle + ` fill: ${theme.nodeFill}; stroke: ${theme.nodeStroke};`).trim()
        )
      } else {
        element.setAttribute('style', newStyle)
      }
    })

    // 2. 强制统一文字颜色（所有 text 元素）
    const textElements = svg.querySelectorAll(
      'text, .label text, .nodeLabel text, .edgeLabel text, foreignObject text, tspan'
    )
    textElements.forEach((textEl) => {
      const element = /** @type {SVGElement} */ (textEl)
      // 强制设置文字颜色
      element.setAttribute('fill', theme.textFill)
      // 更新 style 属性
      const currentStyle = element.getAttribute('style') || ''
      const newStyle = currentStyle.replace(/fill:\s*[^;]+/gi, `fill: ${theme.textFill}`)
      if (!newStyle.includes('fill:')) {
        element.setAttribute('style', (newStyle + ` fill: ${theme.textFill};`).trim())
      } else {
        element.setAttribute('style', newStyle)
      }
    })

    // 3. 统一连线颜色（edgePath, flowchart-link）
    const edgePaths = svg.querySelectorAll(
      '.edgePath .path, .flowchart-link, .edgePath path, .edgePath line, line[class*="link"]'
    )
    edgePaths.forEach((edge) => {
      const element = /** @type {SVGElement} */ (edge)
      element.setAttribute('stroke', theme.edgeStroke)
      const currentStyle = element.getAttribute('style') || ''
      const newStyle = currentStyle.replace(/stroke:\s*[^;]+/gi, `stroke: ${theme.edgeStroke}`)
      if (!newStyle.includes('stroke:')) {
        element.setAttribute('style', (newStyle + ` stroke: ${theme.edgeStroke};`).trim())
      } else {
        element.setAttribute('style', newStyle)
      }
    })

    // 4. 统一集群背景色（cluster rect）
    const clusterRects = svg.querySelectorAll('.cluster rect, g.cluster rect')
    clusterRects.forEach((rect) => {
      const element = /** @type {SVGElement} */ (rect)
      element.setAttribute('fill', theme.clusterFill)
      element.setAttribute('stroke', theme.clusterStroke)
      const currentStyle = element.getAttribute('style') || ''
      const newStyle = currentStyle
        .replace(/fill:\s*[^;]+/gi, `fill: ${theme.clusterFill}`)
        .replace(/stroke:\s*[^;]+/gi, `stroke: ${theme.clusterStroke}`)
      if (!newStyle.includes('fill:')) {
        element.setAttribute(
          'style',
          (newStyle + ` fill: ${theme.clusterFill}; stroke: ${theme.clusterStroke};`).trim()
        )
      } else {
        element.setAttribute('style', newStyle)
      }
    })

    // 5. 添加全局样式覆盖（最高优先级，确保覆盖所有情况）
    let existingStyle = svg.querySelector('style[data-mermaid-theme]')
    if (!existingStyle) {
      existingStyle = document.createElementNS('http://www.w3.org/2000/svg', 'style')
      existingStyle.setAttribute('data-mermaid-theme', 'true')
      svg.insertBefore(existingStyle, svg.firstChild)
    }
    existingStyle.textContent = `
      rect.label-container, circle.label-container, ellipse.label-container, polygon.label-container, path.label-container,
      .node rect, .node circle, .node ellipse, .node polygon, .node path,
      g.node rect, g.node circle, g.node ellipse, g.node polygon, g.node path {
        fill: ${theme.nodeFill} !important;
        stroke: ${theme.nodeStroke} !important;
      }
      text, .label text, .nodeLabel text, .edgeLabel text, foreignObject text, tspan {
        fill: ${theme.textFill} !important;
      }
      .edgePath .path, .flowchart-link, .edgePath path, .edgePath line {
        stroke: ${theme.edgeStroke} !important;
      }
      .cluster rect, g.cluster rect {
        fill: ${theme.clusterFill} !important;
        stroke: ${theme.clusterStroke} !important;
      }
    `
  })
}

export async function ConvertMarkdownToHtmlVditor(md) {
  let cdn = ''
  if (isElectronEnv()) {
    cdn = getLocalVditorCDN()
  } else {
    cdn = vditorCDN
  }
  //logger.debug(`ConvertMarkdownToHtmlVditor: ${await Vditor.md2html(md,{cdn: cdn})}`);
  return await Vditor.md2html(md, { cdn: cdn })
}

/** 与 Vditor.highlightRender 一致：不参与 hljs 的围栏语言（公式/图表等） */
const DOCX_HLJS_SKIP_LANGS = new Set([
  'math',
  'mermaid',
  'flowchart',
  'echarts',
  'mindmap',
  'plantuml',
  'markmap',
  'abc',
  'graphviz',
  'smiles'
])

/**
 * 在 md2html 结果上为围栏代码块注入 highlight.js 高亮（不调用 mathRender / preview，避免公式双份）。
 * 供 DOCX 导出；主进程再将 hljs class 转为内联 color 以适配 html-to-docx。
 * @param {string} html - Vditor.md2html 输出片段
 * @returns {Promise<string>}
 */
export async function enhanceMd2htmlWithHljsForDocx(html) {
  if (!html || typeof html !== 'string') return html
  const wrap = document.createElement('div')
  wrap.innerHTML = html
  const blocks = wrap.querySelectorAll('pre > code')
  if (blocks.length === 0) return html

  let hljs
  try {
    const mod = await import('highlight.js')
    hljs = mod.default
  } catch (e) {
    getLogger().warn('DOCX 代码高亮：highlight.js 加载失败，将使用无高亮 HTML', e)
    return html
  }

  blocks.forEach((block) => {
    if (!(block instanceof HTMLElement)) return
    if (block.classList.contains('language-math')) return
    const langClass = [...block.classList].find((c) => c.startsWith('language-'))
    if (!langClass) return
    const lang = langClass.slice('language-'.length)
    if (!lang || DOCX_HLJS_SKIP_LANGS.has(lang)) return

    let language = lang
    if (!hljs.getLanguage(language)) {
      language = 'plaintext'
    }

    let codeText = block.textContent ?? ''
    if (codeText.endsWith('\n')) {
      codeText = codeText.slice(0, -1)
    }

    try {
      const { value } = hljs.highlight(codeText, { language, ignoreIllegals: true })
      block.innerHTML = value
      block.classList.add('hljs')
    } catch (err) {
      getLogger().warn(`DOCX 代码高亮失败 (${lang})，保留纯文本`, err)
    }
  })

  return wrap.innerHTML
}

/**
 * 将 Vditor.md2html 生成的 HTML 中 class="language-math" 的行内/块级公式渲染为 PNG 图片
 * - span.language-math 视为行内
 * - div.language-math 视为块级
 */
/**
 * @param md - Markdown 文本
 * @param convertImagesToBase64 - 是否将图片转为 base64
 * @param docPath - 可选，当前文档路径，用于解析相对图片路径（如 images/xxx.png）
 * @param {{ fragmentOnly?: boolean }} [options] - fragmentOnly: 仅返回正文 HTML 片段（供 DOCX 等），不包装完整文档与内嵌 CSS
 */
export async function ConvertMarkdownToHtmlManually(
  md,
  convertImagesToBase64 = true,
  docPath = '',
  options = {}
) {
  const contentTheme = resolveVditorContentThemeSettingValue(await getSetting('contentTheme'))
  const codeTheme = resolveVditorCodeThemeSettingValue(await getSetting('codeTheme'))
  const lineNumber = await getSetting('lineNumber')

  let cdn = ''
  if (isElectronEnv()) {
    cdn = getLocalVditorCDN()
  } else {
    cdn = vditorCDN
  }

  // 第一步：从 Markdown 中提取所有图片 URL，根据 convertImagesToBase64 参数决定是否转换为 data URL
  // 如果 convertImagesToBase64 为 false，则保持原始 URL
  const imageUrlMap = new Map() // 原始 URL -> data URL 的映射（仅在 convertImagesToBase64 为 true 时使用）
  const imageRegex = /!\[([^\]]*)\]\((.*?)\)/g
  let match
  const imagePromises = []

  if (convertImagesToBase64) {
    // 只有在需要转换为 base64 时才处理
    while ((match = imageRegex.exec(md)) !== null) {
      const altText = match[1]
      const imageUrl = match[2]

      // 跳过已经是 data URL 的图片，但需要建立映射以便后续替换HTML中的图片
      if (imageUrl.startsWith('data:')) {
        // 如果已经是 data URL，直接建立映射（用于后续HTML替换）
        imageUrlMap.set(imageUrl, imageUrl)
        if (altText) {
          imageUrlMap.set(altText, imageUrl)
        }
        continue
      }

      // 异步获取图片的 data URL
      const promise = (async () => {
        try {
          let response
          let contentType = ''
          let isSvg = false
          let actualImageUrl = imageUrl

          // 处理本地路径和file:// URL
          if (
            !imageUrl.startsWith('http://') &&
            !imageUrl.startsWith('https://') &&
            !imageUrl.startsWith('data:') &&
            !imageUrl.startsWith('file://')
          ) {
            // 本地路径：先转换为HTTP URL（传入 docPath 以便解析相对路径如 images/xxx.png）
            try {
              const { local2httpProtocol } = await import('./md-utils')
              const converted = await local2httpProtocol(
                `![${altText}](${imageUrl})`,
                docPath || ''
              )
              const match = converted.match(/!\[.*?\]\((.*?)\)/)
              if (match && match[1] && match[1].startsWith(getRuntimeServerBaseUrlSync() + '/')) {
                actualImageUrl = match[1]
              } else {
                // 转换失败，尝试使用file://协议
                actualImageUrl = imageUrl.startsWith('/')
                  ? `file://${imageUrl}`
                  : `file:///${imageUrl}`
              }
            } catch (e) {
              // 转换失败，尝试使用file://协议
              actualImageUrl = imageUrl.startsWith('/')
                ? `file://${imageUrl}`
                : `file:///${imageUrl}`
            }
          } else if (imageUrl.startsWith('file://')) {
            // file:// URL：转换为本地路径，然后通过IPC读取
            actualImageUrl = imageUrl
          }

          // 如果是file:// URL或本地路径，通过IPC读取
          if (
            actualImageUrl.startsWith('file://') ||
            (!actualImageUrl.startsWith('http://') && !actualImageUrl.startsWith('https://'))
          ) {
            let localPath = actualImageUrl
            if (localPath.startsWith('file://')) {
              localPath = localPath.replace(/^file:\/\//, '')
              // Windows 路径处理：file:///C:/path -> C:/path
              if (localPath.startsWith('/') && /^\/[A-Za-z]:/.test(localPath)) {
                localPath = localPath.substring(1)
              }
              // 解码 URL 编码
              try {
                localPath = decodeURIComponent(localPath)
              } catch (e) {
                // 解码失败，使用原始路径
              }
            }
            // 相对路径（如 images/purple.png）必须结合文档路径解析为绝对路径，否则主进程读取会报「文件不存在」
            if (
              docPath &&
              localPath &&
              !/^[A-Za-z]:[\\/]/.test(localPath) &&
              !localPath.startsWith('/')
            ) {
              const { resolvePathWithLinkBase } = await import('./path-resolver')
              const { getLinkBase } = await import('../stores/workspace')
              const linkBase = getLinkBase(docPath)
              if (linkBase) {
                localPath = resolvePathWithLinkBase(localPath, linkBase)
              }
            }

            if (messageBridge.getIpc()) {
              const fileData = await messageBridge.invoke('read-file-for-upload', localPath)
              if (fileData && fileData.data) {
                contentType = fileData.mimeType || ''
                isSvg =
                  localPath.toLowerCase().endsWith('.svg') ||
                  contentType.includes('image/svg+xml') ||
                  contentType.includes('image/svg')

                let dataUrl = ''
                if (isSvg) {
                  // SVG：转换为base64
                  const svgText = atob(fileData.data)
                  if (svgText && svgText.trim().length > 0) {
                    const base64Svg = btoa(unescape(encodeURIComponent(svgText)))
                    dataUrl = `data:image/svg+xml;base64,${base64Svg}`
                  }
                } else {
                  // 位图：直接使用base64
                  const mimeType = contentType || 'image/png'
                  dataUrl = `data:${mimeType};base64,${fileData.data}`
                }

                if (dataUrl) {
                  imageUrlMap.set(imageUrl, dataUrl)
                  if (altText) {
                    imageUrlMap.set(altText, dataUrl)
                  }
                  getLogger().debug(`本地图片转换为 data URL 成功: ${imageUrl.substring(0, 50)}...`)
                }
                return
              }
            }
            // 如果IPC读取失败，尝试使用HTTP URL
            if (actualImageUrl.startsWith(getRuntimeServerBaseUrlSync() + '/')) {
              response = await fetch(actualImageUrl)
            } else {
              throw new Error('无法读取本地文件')
            }
          } else {
            // HTTP/HTTPS URL：直接fetch
            response = await fetch(actualImageUrl)
          }

          if (response) {
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`)
            }

            contentType = response.headers.get('content-type') || ''
            isSvg =
              actualImageUrl.toLowerCase().endsWith('.svg') ||
              contentType.includes('image/svg+xml') ||
              contentType.includes('image/svg')

            let dataUrl = ''
            if (isSvg) {
              const svgText = await response.text()
              if (svgText && svgText.trim().length > 0) {
                const base64Svg = btoa(unescape(encodeURIComponent(svgText)))
                dataUrl = `data:image/svg+xml;base64,${base64Svg}`
              }
            } else {
              const blob = await response.blob()
              if (blob && blob.size > 0) {
                const reader = new FileReader()
                reader.readAsDataURL(blob)
                dataUrl = await new Promise((resolve, reject) => {
                  reader.onload = () => {
                    if (reader.result && typeof reader.result === 'string') {
                      resolve(reader.result)
                    } else {
                      reject(new Error('读取图片数据失败'))
                    }
                  }
                  reader.onerror = () => reject(new Error('FileReader 错误'))
                })
              }
            }

            if (dataUrl) {
              imageUrlMap.set(imageUrl, dataUrl)
              // 也通过 alt 文本建立映射（作为备用）
              if (altText) {
                imageUrlMap.set(altText, dataUrl)
              }
              getLogger().debug(
                `图片 URL 映射创建: ${imageUrl.substring(0, 50)}... -> data URL (长度: ${dataUrl.length})`
              )
            }
          }
        } catch (error) {
          getLogger().warn(`获取图片 data URL 失败: ${imageUrl}`, error)
          // 如果转换失败，尝试通过 alt 文本建立映射（作为最后的回退）
          // 这样即使转换失败，HTML 中也能通过 alt 文本找到映射
          if (altText) {
            // 尝试从原始路径推断可能的 HTTP URL
            // 如果图片路径看起来像是本地路径，尝试转换为 HTTP URL
            if (
              !imageUrl.startsWith('http://') &&
              !imageUrl.startsWith('https://') &&
              !imageUrl.startsWith('data:')
            ) {
              try {
                const { local2httpProtocol } = await import('./md-utils')
                const converted = await local2httpProtocol(
                  `![${altText}](${imageUrl})`,
                  docPath || ''
                )
                const match = converted.match(/!\[.*?\]\((.*?)\)/)
                if (match && match[1] && match[1].startsWith(getRuntimeServerBaseUrlSync() + '/')) {
                  // 如果转换成功，尝试 fetch 这个 HTTP URL
                  try {
                    const httpResponse = await fetch(match[1])
                    if (httpResponse.ok) {
                      const contentType = httpResponse.headers.get('content-type') || ''
                      const isSvg =
                        imageUrl.toLowerCase().endsWith('.svg') ||
                        contentType.includes('image/svg+xml') ||
                        contentType.includes('image/svg')

                      let dataUrl = ''
                      if (isSvg) {
                        const svgText = await httpResponse.text()
                        if (svgText && svgText.trim().length > 0) {
                          const base64Svg = btoa(unescape(encodeURIComponent(svgText)))
                          dataUrl = `data:image/svg+xml;base64,${base64Svg}`
                        }
                      } else {
                        const blob = await httpResponse.blob()
                        if (blob && blob.size > 0) {
                          const reader = new FileReader()
                          reader.readAsDataURL(blob)
                          dataUrl = await new Promise((resolve, reject) => {
                            reader.onload = () => {
                              if (reader.result && typeof reader.result === 'string') {
                                resolve(reader.result)
                              } else {
                                reject(new Error('读取图片数据失败'))
                              }
                            }
                            reader.onerror = () => reject(new Error('FileReader 错误'))
                          })
                        }
                      }

                      if (dataUrl) {
                        imageUrlMap.set(imageUrl, dataUrl)
                        imageUrlMap.set(altText, dataUrl)
                        getLogger().debug(
                          `通过回退方法成功转换图片: ${imageUrl.substring(0, 50)}...`
                        )
                      }
                    }
                  } catch (fetchError) {
                    getLogger().warn(`回退方法也失败: ${imageUrl}`, fetchError)
                  }
                }
              } catch (convertError) {
                getLogger().warn(`无法转换本地路径: ${imageUrl}`, convertError)
              }
            }
          }
        }
      })()

      imagePromises.push(promise)
    }

    // 等待所有图片转换完成
    await Promise.all(imagePromises)
  }

  // 第二步：使用 Markdown 进行渲染
  // 注意：如果 convertImagesToBase64 为 true，md 可能已经包含 data URL（如果 processMarkdownImages 已经转换）
  // 创建一个临时的 DOM 容器来执行完整的渲染
  const tempContainer = document.createElement('div')
  tempContainer.style.position = 'absolute'
  tempContainer.style.left = '-99999px'
  tempContainer.style.top = '-99999px'
  tempContainer.style.width = '800px'
  document.body.appendChild(tempContainer)

  try {
    // 检查是否还有残留的 PlantUML 代码块（预渲染失败的情况）
    // 如果预渲染成功，PlantUML 代码块应该已经被替换为图片链接
    const plantumlCodeBlockRegex = /```plantuml\s*\n([\s\S]*?)\n?```/gi
    let processedMd = md
    const hasPlantUMLBlocks = plantumlCodeBlockRegex.test(processedMd)
    if (hasPlantUMLBlocks) {
      getLogger().warn(
        '检测到残留的 PlantUML 代码块，可能预渲染失败。尝试移除代码块标记，保留代码内容作为文本。'
      )
      // 移除 PlantUML 代码块标记，保留代码内容（作为普通文本）
      processedMd = processedMd.replace(plantumlCodeBlockRegex, (match, code) => {
        return `\`\`\`\n${code}\n\`\`\``
      })
    }

    // 使用 Vditor.preview 进行完整的渲染（包括代码高亮和数学公式）
    // 如果 md 中已经包含 data URL，Vditor 应该能正确处理
    const mathInlineDigit = (await getSetting('mathInlineDigit')) ?? true
    const previewOptions = {
      cdn: cdn,
      markdown: {
        theme: { current: contentTheme }
      },
      hljs: {
        style: codeTheme,
        lineNumber: lineNumber
      },
      math: {
        inlineDigit: mathInlineDigit
      }
    }

    Vditor.preview(tempContainer, processedMd, previewOptions)

    // 等待 preview 完成
    await new Promise((resolve) => setTimeout(resolve, 100))

    // 执行代码高亮渲染（确保代码块被正确高亮）
    if (typeof Vditor.codeRender === 'function') {
      Vditor.codeRender(tempContainer)
    }

    // 执行数学公式渲染（确保数学公式被正确渲染）
    if (typeof Vditor.mathRender === 'function') {
      Vditor.mathRender(tempContainer, {
        cdn: cdn
      })
    }

    // 等待渲染完成（数学公式和代码高亮可能需要一些时间）
    await new Promise((resolve) => setTimeout(resolve, 500))

    // 获取渲染后的 HTML 内容
    let finalHtml = tempContainer.innerHTML

    // 第三步：处理图片 URL
    // 无论是否转换为 base64，都要确保 img 标签有 src 属性
    finalHtml = finalHtml.replace(/<img([^>]*?)>/gi, (match, attributes) => {
      // 提取 src 属性
      const srcMatch = attributes.match(/src\s*=\s*"([^"]*)"/i)
      const altMatch = attributes.match(/alt\s*=\s*"([^"]*)"/i)

      let imageUrl = srcMatch ? srcMatch[1] : null
      const altText = altMatch ? altMatch[1] : null

      if (convertImagesToBase64) {
        // 转换为 base64 模式
        // 如果已经有 data URL，不需要替换
        if (imageUrl && imageUrl.startsWith('data:')) {
          return match
        }

        // 尝试从映射中找到对应的 data URL
        let dataUrl = null
        if (imageUrl && imageUrlMap.has(imageUrl)) {
          dataUrl = imageUrlMap.get(imageUrl)
        } else if (altText && imageUrlMap.has(altText)) {
          dataUrl = imageUrlMap.get(altText)
        }

        if (dataUrl) {
          // 替换 src 属性
          if (srcMatch) {
            return match.replace(/src\s*=\s*"([^"]*)"/i, `src="${dataUrl}"`)
          } else {
            // 如果没有 src 属性，添加一个
            return match.replace(/(<img[^>]*?)(>)/i, `$1 src="${dataUrl}"$2`)
          }
        } else {
          // 如果找不到映射，尝试从原始 Markdown 中查找
          // 这可能是因为 embedImagesInline 已经转换了图片，但映射没有建立
          if (!imageUrl) {
            getLogger().warn(
              '发现没有 src 属性的 img 标签，且无法找到映射:',
              match.substring(0, 100)
            )
            // 如果没有 src 也没有映射，尝试从 alt 文本中恢复
            // 检查原始 Markdown 中是否有对应的图片
            if (altText) {
              const escapedAlt = altText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
              const altRegex = new RegExp(`!\\[${escapedAlt}\\]\\((.*?)\\)`, 'i')
              const altMatch = md.match(altRegex)
              if (altMatch && altMatch[1]) {
                const originalUrl = altMatch[1]
                // 如果原始 URL 是 data URL，直接使用
                if (originalUrl.startsWith('data:')) {
                  return match.replace(/(<img[^>]*?)(>)/i, `$1 src="${originalUrl}"$2`)
                }
                // 如果映射中有原始 URL，使用映射
                if (imageUrlMap.has(originalUrl)) {
                  const dataUrl = imageUrlMap.get(originalUrl)
                  return match.replace(/(<img[^>]*?)(>)/i, `$1 src="${dataUrl}"$2`)
                }
              }
            }
            // 如果还是找不到，保持原样，让后续的 processHtmlImages 处理
          } else {
            getLogger().warn(`无法找到图片 URL 的 data URL 映射: ${imageUrl.substring(0, 50)}...`)
            // 如果 imageUrl 是 data URL，直接使用
            if (imageUrl.startsWith('data:')) {
              return match
            }
          }
          return match
        }
      } else {
        // 不转换为 base64，但确保有 src 属性
        if (!imageUrl) {
          // 如果没有 src 属性，尝试从 alt 文本或映射中恢复
          // 如果还是找不到，记录警告但保持原样
          getLogger().warn('发现没有 src 属性的 img 标签:', match.substring(0, 100))
          return match
        }
        // 如果有 src 属性，保持原样
        return match
      }
    })

    // 验证所有 img 标签都有 src 属性
    const imgTags = finalHtml.match(/<img[^>]*>/gi)
    if (imgTags) {
      imgTags.forEach((imgTag) => {
        if (!/src\s*=/i.test(imgTag)) {
          getLogger().warn('替换后仍缺少 src 属性的 img 标签:', imgTag.substring(0, 100))
        }
      })
    }

    if (options.fragmentOnly) {
      return finalHtml
    }

    // 第四步：获取并内嵌 Vditor CSS
    let vditorCss = ''
    try {
      const cssUrl = `${cdn}/dist/index.css`
      const cssResponse = await fetch(cssUrl)
      if (cssResponse.ok) {
        vditorCss = await cssResponse.text()
        getLogger().debug(`Vditor CSS 获取成功，长度: ${vditorCss.length}`)
      } else {
        getLogger().warn(`无法获取 Vditor CSS: ${cssUrl}`)
      }
    } catch (error) {
      getLogger().warn('获取 Vditor CSS 失败:', error)
    }

    // 从 finalHtml 中移除 Vditor 注入的 CSS 链接（如果有）
    finalHtml = finalHtml.replace(
      /<link[^>]*rel\s*=\s*["']stylesheet["'][^>]*href\s*=\s*["'][^"']*vditor[^"']*["'][^>]*>/gi,
      ''
    )

    // 包装成完整的 HTML 文档，内嵌所有 CSS
    const html = `<!DOCTYPE html>
<html lang="zh">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Document</title>
    <style>
        /* Vditor 样式 */
        ${vditorCss}
        
        /* 自定义样式 */
        body {
            font-family: "Noto Sans SC", "Microsoft YaHei", sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            line-height: 1.6;
        }
        /* 确保代码块样式正确 */
        pre code {
            display: block;
            overflow-x: auto;
        }
        code {
            background-color: #f5f5f5;
            padding: 2px 4px;
            border-radius: 3px;
        }
    </style>
</head>
<body>
    ${finalHtml}
</body>
</html>`

    return html
  } finally {
    // 清理临时容器
    if (tempContainer.parentNode) {
      tempContainer.parentNode.removeChild(tempContainer)
    }
  }
}

/** 判断 hljs 主题名是否偏暗色（用于 PDF 强制浅色/深色时切换为可读组合） */
function isLikelyDarkHljsTheme(name) {
  if (!name || typeof name !== 'string') return false
  const n = String(name).toLowerCase()
  if (
    n.includes('gradient-light') ||
    n.includes('solarized-light') ||
    n.includes('one-light') ||
    n.includes('atom-one-light') ||
    n.includes('paraiso-light') ||
    (n.includes('github') && !n.includes('dark'))
  ) {
    return false
  }
  if (n.includes('light') && !n.includes('highlight')) return false
  return (
    n.includes('dark') ||
    n.includes('onedark') ||
    n.includes('night') ||
    n === 'nord' ||
    n === 'monokai' ||
    n === 'dracula' ||
    n.includes('obsidian') ||
    n.includes('tokyo-night') ||
    n.includes('stackoverflow-dark')
  )
}

function coerceHljsForPdfLight(resolved) {
  return isLikelyDarkHljsTheme(resolved) ? 'github' : resolved
}

function coerceHljsForPdfDark(resolved) {
  return isLikelyDarkHljsTheme(resolved) ? resolved : 'github-dark'
}

/** 仅允许安全颜色串写入 PDF 内联样式，防止主题异常值破坏 CSS */
function sanitizeCssColorForPdf(value) {
  if (!value || typeof value !== 'string') return '#ffffff'
  const v = value.trim()
  if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) return v
  if (/^(rgb|hsla?)\(\s*[\d\s.,%]+\)$/i.test(v) && v.length < 160) return v
  return '#ffffff'
}

/**
 * @param {string} md
 * @param {{ pdfThemeMode?: 'light'|'dark'|'follow', margins?: { top:number, bottom:number, left:number, right:number } }} [pdfOptions]
 */
export const ConvertHtmlForPdf = async (md, pdfOptions = {}) => {
  getLogger().info(`ConvertHtmlForPdf 开始，Markdown 长度: ${md.length}`)

  let cdn = ''
  if (isElectronEnv()) {
    cdn = getLocalVditorCDN()
  } else {
    cdn = vditorCDN
  }
  getLogger().info(`使用 CDN: ${cdn}`)

  // 预渲染所有图表为图片（统一处理）
  // 统一使用 SVG 矢量图
  // 注意：图表预渲染应该在 prepareMarkdownForExport 中完成
  // 这里只做最后的检查和清理，确保没有残留的 PlantUML 代码块
  let processedMd = md

  // 检查是否还有残留的 PlantUML 代码块（预渲染失败的情况）
  const plantumlCodeBlockRegex = /```plantuml\s*\n([\s\S]*?)\n?```/gi
  const hasPlantUMLBlocks = plantumlCodeBlockRegex.test(processedMd)
  if (hasPlantUMLBlocks) {
    getLogger().warn(
      '检测到残留的 PlantUML 代码块，可能预渲染失败。尝试移除代码块标记，保留代码内容作为文本。'
    )
    // 移除 PlantUML 代码块标记，保留代码内容（作为普通文本）
    processedMd = processedMd.replace(plantumlCodeBlockRegex, (match, code) => {
      return `\`\`\`\n${code}\n\`\`\``
    })
  }

  // 验证预渲染结果：检查是否还有 PlantUML 代码块
  const plantumlBlockCount = (processedMd.match(/```plantuml\s*\n/gi) || []).length
  const plantumlImageCount = (
    processedMd.match(
      new RegExp(
        '!\\\\[.*?\\\\]\\\\(' +
          getRuntimeServerBaseUrlSync().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
          '/images/.*?_plantuml\\\\.(svg|png)\\\\)',
        'gi'
      )
    ) || []
  ).length
  getLogger().info(
    `PlantUML 代码块数量: ${plantumlBlockCount}, PlantUML 图片数量: ${plantumlImageCount}`
  )

  if (plantumlBlockCount > 0) {
    getLogger().warn(`检测到 ${plantumlBlockCount} 个未预渲染的 PlantUML 代码块，可能预渲染失败`)
  }

  // 用 Base64 传入内联脚本：Markdown 中的 </script>（如 Vue SFC）会提前结束 HTML 的 <script>，导致 Vditor 只收到半截源码、代码挤一行且无高亮
  const pdfMarkdownBase64 = btoa(unescape(encodeURIComponent(processedMd)))
  const safeMdB64 = JSON.stringify(pdfMarkdownBase64)

  const pdfThemeMode = pdfOptions.pdfThemeMode ?? 'light'
  const contentSetting = await getSetting('contentTheme')
  const codeSetting = await getSetting('codeTheme')
  const resolvedCode = resolveVditorCodeThemeSettingValue(codeSetting)

  let effectiveVditorMode = 'light'
  let effectiveContentTheme = 'light'
  let effectiveCodeTheme = resolvedCode

  if (pdfThemeMode === 'light') {
    effectiveVditorMode = 'light'
    effectiveContentTheme = 'light'
    effectiveCodeTheme = coerceHljsForPdfLight(resolvedCode)
  } else if (pdfThemeMode === 'dark') {
    effectiveVditorMode = 'dark'
    effectiveContentTheme = 'dark'
    effectiveCodeTheme = coerceHljsForPdfDark(resolvedCode)
  } else {
    effectiveVditorMode = themeState.currentTheme.type === 'dark' ? 'dark' : 'light'
    effectiveContentTheme = resolveVditorContentThemeSettingValue(contentSetting)
    effectiveCodeTheme = resolvedCode
  }

  const margins = pdfOptions.margins || { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 }
  const mTop = margins.top
  const mRight = margins.right
  const mBottom = margins.bottom
  const mLeft = margins.left

  /** 整页底色：与 Electron 物理边距解耦，由 @page + body 铺满（含分页边缘与四角） */
  let pageBgColor = '#ffffff'
  if (pdfThemeMode === 'light') {
    pageBgColor = '#ffffff'
  } else if (pdfThemeMode === 'dark') {
    pageBgColor = '#2f363d'
  } else {
    const ts = themeState.currentTheme
    pageBgColor = sanitizeCssColorForPdf(
      ts.editorTextareaBackgroundColor || ts.background || '#ffffff'
    )
  }

  const lineNumber = await getSetting('lineNumber')
  const mathInlineDigit = (await getSetting('mathInlineDigit')) ?? true
  getLogger().info(
    `PDF 外观: pdfThemeMode=${pdfThemeMode}, vditorMode=${effectiveVditorMode}, contentTheme=${effectiveContentTheme}, codeTheme=${effectiveCodeTheme}, lineNumber=${lineNumber}, mathInlineDigit=${mathInlineDigit}`
  )

  const safeCdn = JSON.stringify(cdn)
  const safeContentTheme = JSON.stringify(effectiveContentTheme)
  const safeThemePath = JSON.stringify(`${cdn}/dist/css/content-theme`)
  const safeCodeTheme = JSON.stringify(effectiveCodeTheme)
  const safeVditorMode = JSON.stringify(effectiveVditorMode)

  /** 写入 link href 的安全片段，防止异常设置值破坏路径 */
  const safeThemeId = /^[a-zA-Z0-9._-]+$/.test(effectiveContentTheme) ? effectiveContentTheme : 'light'
  const safeHljsId = /^[a-zA-Z0-9._-]+$/.test(effectiveCodeTheme) ? effectiveCodeTheme : 'github'

  const html = `<!DOCTYPE html>
<html lang="zh" style="margin:0;padding:0;min-height:100%;background-color:${pageBgColor} !important;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact;">
<head>
    <meta charset="UTF-8">
    <meta name="color-scheme" content="${effectiveVditorMode === 'dark' ? 'dark' : 'light'}">
    <link rel="stylesheet" href="${cdn}/dist/index.css"/>
    <!-- 与 Vditor.preview 内 setContentTheme / highlightRender 使用相同 id，提前阻塞加载，避免 printToPDF 时仍只有 index.css 浅色 -->
    <link id="vditorContentTheme" rel="stylesheet" type="text/css" href="${cdn}/dist/css/content-theme/${safeThemeId}.css"/>
    <link id="vditorHljsStyle" rel="stylesheet" type="text/css" href="${cdn}/dist/js/highlight.js/styles/${safeHljsId}.min.css"/>
    <script src="${cdn}/dist/method.min.js"></script>
    <style>
        /*
         * 样式顺序：index → 内容主题 / hljs（上方 link）→ 本块最后，可覆盖 Vditor 默认但保留深色主题色。
         * @page 须 margin:0 + 主进程零物理边距，避免白边。
         * 页边距：左右 = tbody 单元格 padding；上下 = thead/tfoot 占位（每页重复）。
         */
        @page {
            size: auto;
            margin: 0;
        }
        html {
            margin: 0;
            padding: 0;
            width: 100%;
            min-height: 100%;
            background-color: ${pageBgColor} !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
        }
        body {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            width: 100%;
            min-height: 100%;
            overflow: hidden !important;
            overflow-x: hidden !important;
            overflow-y: hidden !important;
            font-family: "Noto Sans SC", "Microsoft YaHei", sans-serif;
            max-width: 100%;
            background-color: ${pageBgColor} !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
        }
        table.meta-doc-pdf-print-frame {
            width: 100%;
            max-width: 100%;
            border-collapse: collapse;
            border-spacing: 0;
            table-layout: fixed !important;
            background: transparent !important;
        }
        /* fixed 下列宽常由首行决定；thead 格几乎无水平内容，不设宽会导致列极窄、正文提前换行、右侧假「大边距」 */
        table.meta-doc-pdf-print-frame > colgroup col.meta-doc-pdf-print-col {
            width: 100%;
        }
        /* 仅版式表直接子格，勿用 .meta-doc-pdf-print-frame td（会匹配正文里 Markdown 表格单元格并 border:none!important 压掉主题） */
        table.meta-doc-pdf-print-frame > thead > tr > td,
        table.meta-doc-pdf-print-frame > tbody > tr > td,
        table.meta-doc-pdf-print-frame > tfoot > tr > td {
            width: 100% !important;
            border: none !important;
            box-sizing: border-box;
        }
        thead.meta-doc-pdf-print-thead {
            display: table-header-group;
        }
        tfoot.meta-doc-pdf-print-tfoot {
            display: table-footer-group;
        }
        .meta-doc-pdf-print-pad-top {
            padding: ${mTop}in 0 0 0 !important;
            margin: 0 !important;
            line-height: 0 !important;
            font-size: 0 !important;
            vertical-align: top;
            background: transparent !important;
        }
        .meta-doc-pdf-print-pad-bottom {
            padding: 0 0 ${mBottom}in 0 !important;
            margin: 0 !important;
            line-height: 0 !important;
            font-size: 0 !important;
            vertical-align: top;
            background: transparent !important;
        }
        .meta-doc-pdf-print-body {
            padding: 0 ${mRight}in 0 ${mLeft}in !important;
            margin: 0 !important;
            vertical-align: top;
            background: transparent !important;
        }
        @media print {
            html, body {
                background-color: ${pageBgColor} !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                color-adjust: exact !important;
            }
            body {
                overflow: visible !important;
            }
            #preview,
            #preview .vditor-reset,
            #preview table,
            #preview tr,
            #preview td,
            #preview th {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
        }

        #preview {
            overflow: visible !important;
            overflow-x: visible !important;
            overflow-y: visible !important;
            max-width: 100%;
            width: 100% !important;
            margin: 0 !important;
            padding: 0;
            box-sizing: border-box;
            background: transparent !important;
        }

        #preview.vditor-reset--anchor {
            padding-left: 0 !important;
        }
        #preview.vditor-reset h1 {
            padding-left: 0 !important;
            padding-inline-start: 0 !important;
            text-indent: 0 !important;
        }

        #preview .vditor-preview,
        #preview .md-editor-preview {
            overflow: visible !important;
            overflow-x: visible !important;
            overflow-y: visible !important;
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box;
        }

        #preview .md-editor-code pre code,
        #preview pre code,
        #preview .hljs {
            overflow: visible !important;
            overflow-x: visible !important;
            overflow-y: visible !important;
            max-height: none !important;
            max-width: 100% !important;
            height: auto !important;
            word-wrap: break-word !important;
            overflow-wrap: break-word !important;
            white-space: pre-wrap !important;
            box-sizing: border-box;
        }
        #preview .md-editor-code pre,
        #preview pre {
            overflow: visible !important;
            max-height: none !important;
            max-width: 100% !important;
            height: auto !important;
            box-sizing: border-box;
        }
        #preview .md-editor-code {
            overflow: visible !important;
            max-height: none !important;
            max-width: 100% !important;
            box-sizing: border-box;
        }

        #preview img {
            max-width: 100% !important;
            height: auto !important;
            box-sizing: border-box;
        }

        /* 仅正文内表格：勿用全局 table，否则会覆盖版式外表格的 table-layout:fixed */
        #preview table {
            max-width: 100% !important;
            table-layout: auto;
            box-sizing: border-box;
        }

        #preview p,
        #preview div,
        #preview h1,
        #preview h2,
        #preview h3,
        #preview h4,
        #preview h5,
        #preview h6,
        #preview ul,
        #preview ol,
        #preview li,
        #preview blockquote {
            max-width: 100%;
            box-sizing: border-box;
            word-wrap: break-word;
            overflow-wrap: break-word;
        }

        #preview pre {
            word-wrap: break-word !important;
            overflow-wrap: break-word !important;
            white-space: pre-wrap !important;
        }

        #preview code:not(pre code) {
            white-space: normal !important;
        }
    </style>
</head>
<body style="margin:0;padding:0;box-sizing:border-box;min-height:100%;background-color:${pageBgColor} !important;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact;">
    <!--
      上下边距：thead/tfoot 每页重复；左右为 tbody 单元格 padding。
      body 全幅铺色，与 printToPDF 零物理边距配合，避免深色/主题下白边。
    -->
    <table class="meta-doc-pdf-print-frame" role="presentation">
        <colgroup><col class="meta-doc-pdf-print-col" /></colgroup>
        <thead class="meta-doc-pdf-print-thead">
            <tr>
                <td class="meta-doc-pdf-print-pad-top">&#8203;</td>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td class="meta-doc-pdf-print-body">
                    <div id="preview" style="max-width: 100%; width: 100%; padding: 0; box-sizing: border-box;"></div>
                </td>
            </tr>
        </tbody>
        <tfoot class="meta-doc-pdf-print-tfoot">
            <tr>
                <td class="meta-doc-pdf-print-pad-bottom">&#8203;</td>
            </tr>
        </tfoot>
    </table>
    <script>
            // 等待页面加载后，渲染 markdown 内容
            window.onload = function() {
                const previewElement = document.getElementById('preview');
                var __pdfMd = decodeURIComponent(escape(atob(${safeMdB64})));
                Vditor.preview(previewElement, __pdfMd, {
                    cdn: ${safeCdn},
                    mode: ${safeVditorMode},
                    theme: {
                        current: ${safeContentTheme},
                        path: ${safeThemePath}
                    },
                    anchor: 0,
                    hljs: {
                        style: ${safeCodeTheme},
                        lineNumber: ${lineNumber}
                    },
                    math: {
                        inlineDigit: ${mathInlineDigit}
                    }
                });
                // 图表已经预渲染为图片，不需要再次渲染
                
                // 导出 PDF 时，移除所有滚动条，让内容完全展开
                // 等待渲染完成后执行
                setTimeout(() => {
                    // 移除 html 和 body 的滚动条
                    document.documentElement.style.overflow = 'visible';
                    document.documentElement.style.overflowX = 'visible';
                    document.documentElement.style.overflowY = 'visible';
                    document.body.style.overflow = 'visible';
                    document.body.style.overflowX = 'visible';
                    document.body.style.overflowY = 'visible';
                    
                    // 移除预览容器的滚动条
                    previewElement.style.overflow = 'visible';
                    previewElement.style.overflowX = 'visible';
                    previewElement.style.overflowY = 'visible';
                    
                    // 移除 Vditor 预览容器的滚动条
                    const vditorPreview = previewElement.querySelector('.vditor-preview, .md-editor-preview');
                    if (vditorPreview) {
                        vditorPreview.style.overflow = 'visible';
                        vditorPreview.style.overflowX = 'visible';
                        vditorPreview.style.overflowY = 'visible';
                    }
                    
                    // 移除代码块的滚动限制，让代码完全展开
                    const codeBlocks = previewElement.querySelectorAll('.md-editor-code pre code, pre code, .hljs');
                    codeBlocks.forEach(block => {
                        // 移除 overflow 限制，让代码完全展开
                        block.style.overflow = 'visible';
                        block.style.overflowX = 'visible';
                        block.style.overflowY = 'visible';
                        // 移除最大高度限制
                        block.style.maxHeight = 'none';
                        // 移除高度限制
                        const parentPre = block.closest('pre');
                        if (parentPre) {
                            parentPre.style.overflow = 'visible';
                            parentPre.style.maxHeight = 'none';
                            parentPre.style.height = 'auto';
                        }
                        // 处理父级容器
                        const parentCode = block.closest('.md-editor-code');
                        if (parentCode) {
                            parentCode.style.overflow = 'visible';
                            parentCode.style.maxHeight = 'none';
                        }
                    });
                    
                    // 移除所有可能的滚动容器
                    const allElements = previewElement.querySelectorAll('*');
                    allElements.forEach(el => {
                        const computedStyle = window.getComputedStyle(el);
                        if (computedStyle.overflow === 'auto' || computedStyle.overflow === 'scroll' ||
                            computedStyle.overflowX === 'auto' || computedStyle.overflowX === 'scroll' ||
                            computedStyle.overflowY === 'auto' || computedStyle.overflowY === 'scroll') {
                            el.style.overflow = 'visible';
                            el.style.overflowX = 'visible';
                            el.style.overflowY = 'visible';
                        }
                    });
                }, 1000);
            };
    </script>
</body>
</html>`
  //     <style>
  //     @font-face {
  //     font-family: "NotoSansSC";
  //     src: url("data:font/ttf;base64,${fontBase64}") format("truetype");
  //     font-weight: normal;
  //     font-style: normal;
  //     }

  //     body {
  //     font-family: "NotoSansSC", "SimSun", sans-serif;
  //     }
  // </style>
  getLogger().info(`HTML 生成完成，长度: ${html.length}`)
  return html
}

export function filterMetaDataFromMd(md) {
  // 只移除 meta-info 注释，不改变文件内容的原始格式（包括末尾换行符）
  // 使用全局替换，移除所有 meta-info 注释
  const pureMd = md.replace(/<!--meta-info:\s*[^-]+?\s*-->/g, '')
  return pureMd
}

/**
 * 将 LaTeX 标准格式的公式分隔符转换为 Vditor 兼容格式
 * - 将 \(...\) 转换为 $...$（行内公式）
 * - 将 \[...\] 转换为 $$...$$（块级公式）
 *
 * 注意：此函数会排除代码块中的内容，避免误转换
 *
 * @param {string} markdown - Markdown 文本
 * @returns {string} 转换后的 Markdown 文本
 */
export function convertLatexDelimiters(markdown) {
  if (!markdown || typeof markdown !== 'string') {
    return markdown
  }

  // 先标记代码块，避免转换代码块中的内容
  const codeBlockRegex = /```[\s\S]*?```|`[^`\n]+`/g
  const codeBlocks = []
  let codeBlockIndex = 0

  // 用占位符替换代码块
  const markdownWithoutCodeBlocks = markdown.replace(codeBlockRegex, (match) => {
    const placeholder = `__CODE_BLOCK_${codeBlockIndex}__`
    codeBlocks[codeBlockIndex] = match
    codeBlockIndex++
    return placeholder
  })

  let result = markdownWithoutCodeBlocks

  // 先转换块级公式 \[...\] 为 $$...$$
  // 使用非贪婪匹配，确保正确匹配成对的 \[ 和 \]
  result = result.replace(/\\\[([\s\S]*?)\\\]/g, (match, content) => {
    // 检查是否包含未匹配的 \[ 或 \]，如果有则跳过（可能是嵌套或格式错误）
    const openCount = (content.match(/\\\[/g) || []).length
    const closeCount = (content.match(/\\\]/g) || []).length
    if (openCount !== closeCount) {
      return match // 不转换，保持原样
    }
    return `$$${content}$$`
  })

  // 再转换行内公式 \(...\) 为 $...$
  // 注意：行内公式不能跨行，使用 [^\n]*? 确保不匹配换行符
  // 这样可以避免误匹配块级公式或跨行的内容
  result = result.replace(/\\\(([^\n]*?)\\\)/g, (match, content) => {
    // 检查是否包含未匹配的 \( 或 \)，如果有则跳过
    const openCount = (content.match(/\\\(/g) || []).length
    const closeCount = (content.match(/\\\)/g) || []).length
    if (openCount !== closeCount) {
      return match
    }
    return `$${content}$`
  })

  // 恢复代码块
  codeBlocks.forEach((codeBlock, index) => {
    result = result.replace(`__CODE_BLOCK_${index}__`, codeBlock)
  })

  return result
}
