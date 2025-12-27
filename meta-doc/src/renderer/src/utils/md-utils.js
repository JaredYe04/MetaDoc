//这个文件需要实现一系列Markdown相关的功能函数

import Vditor from "vditor"
import eventBus, { isElectronEnv } from "./event-bus"
import { getImagePath, getSetting } from "./settings"
import { convertNumberToChinese, removeTitleIndex } from "./regex-utils";
import {localVditorCDN, vditorCDN } from "./vditor-cdn";
import { createRendererLogger } from "./logger.ts";
import { preRenderAllCharts } from './chart-pre-renderer.js';
import { themeState } from "./themes";

// 懒加载logger，避免初始化顺序问题
let loggerInstance = null;

function getLogger() {
  if (!loggerInstance) {
    loggerInstance = createRendererLogger('MDUtils');
  }
  return loggerInstance;
}
// 1. 从 Markdown 文本中提取所有标题，生成大纲树，同时记录 title_level

export function extractOutlineTreeFromMarkdown(md, bypassText = false) {
    const lines = md.split('\n');
    // 虚拟根节点，title_level 为 0，表示最低级别
    const root = {
        title: '',
        title_level: 0,
        path: 'dummy',
        text: '',
        children: []
    };
    // 栈初始化，起始只有根节点
    let stack = [root];
    // 跟踪是否在代码块中（三个反引号包裹的代码块）
    let inCodeBlock = false;
    // 遍历每一行
    for (let line of lines) {
        // 检查是否是代码块开始/结束标记（三个反引号）
        const codeBlockMatch = line.match(/^```/);
        if (codeBlockMatch) {
            // 切换代码块状态
            inCodeBlock = !inCodeBlock;
            // 非标题行，追加到当前节点的 text 中
            if (!bypassText) {
                stack[stack.length - 1].text += line + '\n';
            }
            continue;
        }
        
        // 如果在代码块中，跳过标题匹配
        if (inCodeBlock) {
            // 非标题行，追加到当前节点的 text 中
            if (!bypassText) {
                stack[stack.length - 1].text += line + '\n';
            }
            continue;
        }
        
        // 匹配标题行：匹配1个或多个 '#' 后跟空格，再匹配标题文本
        const match = line.match(/^(#+)\s+(.*)/);
        if (match) {
            const hashes = match[1];
            const title = match[2];
            const level = hashes.length;  // 标题等级

            const new_node = {
                title: title,
                title_level: level,
                path: '',
                text: '',
                children: []
            };
            // 如果当前栈顶节点的 title_level >= 当前标题等级，则不断弹出，直到找到父节点
            while (stack.length > 0 && stack[stack.length - 1].title_level >= level) {
                stack.pop();
            }
            // 此时栈顶的节点即为新节点的父节点
            stack[stack.length - 1].children.push(new_node);
            // 将新节点入栈
            stack.push(new_node);
        } else {
            // 非标题行，追加到当前节点的 text 中
            if (!bypassText) {
                stack[stack.length - 1].text += line + '\n';
            }
        }
    }
    // 根据大纲树生成路径（采用简单的广度优先遍历）
    for (let i = 0; i < root.children.length; i++) {
        root.children[i].path = `${i + 1}`;
    }
    let queue = [...root.children];
    while (queue.length > 0) {
        const node = queue.shift();
        for (let i = 0; i < node.children.length; i++) {
            node.children[i].path = node.path + '.' + (i + 1);
            queue.push(node.children[i]);
        }
    }

    return root;
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
    let md = '';
    // 深度优先遍历生成 Markdown
    function dfs(node) {
        // 如果是非虚拟根节点，则生成标题行
        
        //如果老文档，node.title_level不存在，则根据path里面出现的"."的个数来判断
        if(node.title_level==undefined||node.title_level==null){
            //如果是无.，则是1级标题，如果类似于"1.1"，则是2级标题
            node.title_level=node.path.split('.').length
        }

        if (node.title && node.title_level > 0) {
            md += '#'.repeat(node.title_level) + ' ' + node.title + '\n';
            md += node.text;
            // 保证末尾有换行符
            if (node.text === '' || node.text[node.text.length - 1] !== '\n') {
                md += '\n';
            }
        } else {
            // 如果是虚拟根节点，也可以输出其 text（如果有的话）
            if (node.text) {
                md += node.text + '\n';
            }
        }
        // 遍历子节点
        if (node.children && Array.isArray(node.children)){
            for (let child of node.children) {
                dfs(child);
            }
        }

    }
    
    dfs(outline_tree);
    return md;
}

/**
 * 从大纲树生成精简的 Markdown 大纲（仅包含标题结构，不包含文本内容）
 * 用于在prompts中传递，节省token开销
 */
function generateLightMarkdownFromOutlineTree(outline_tree) {
    let md = '';
    // 深度优先遍历生成 Markdown，只包含标题
    function dfs(node) {
        //如果老文档，node.title_level不存在，则根据path里面出现的"."的个数来判断
        if(node.title_level==undefined||node.title_level==null){
            //如果是无.，则是1级标题，如果类似于"1.1"，则是2级标题
            node.title_level=node.path.split('.').length
        }

        // 只输出标题，不输出文本内容
        if (node.title && node.title_level > 0) {
            md += '#'.repeat(node.title_level) + ' ' + node.title + '\n';
        }
        
        // 遍历子节点
        if (node.children && Array.isArray(node.children)){
            for (let child of node.children) {
                dfs(child);
            }
        }
    }
    
    dfs(outline_tree);
    return md.trim();
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
    const outlineTree = extractOutlineTreeFromMarkdown(md, true);
    // 转换为精简的Markdown大纲
    return generateLightMarkdownFromOutlineTree(outlineTree);
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
export function adjustTitleLevel(outline_tree,first_level){
    //深度搜索遍历大纲树，调整标题级别，如果是dummy则从children开始调整，等级为first_level，从子节点依次+1
    function dfs(node, level) {
        node.title_level = level
        for (let i = 0; i < node.children.length; i++) {
            dfs(node.children[i], level + 1)
        }
    }
    let node=JSON.parse(JSON.stringify(outline_tree))//深拷贝一份大纲树
    if(node.path=='dummy'){
        for (let i = 0; i < node.children.length; i++) {
            dfs(node.children[i], first_level)
        }
    }
    else{
        dfs(node, first_level)
    }
    return node
}
export function adjustTitleIndex(outline_tree, cover, level1TitleChinese){
    let node=JSON.parse(JSON.stringify(outline_tree))//深拷贝一份大纲树
    //深度搜索遍历大纲树，调整标题编号，如果是dummy则从children开始调整，编号为1 2 3 4...如果用户要求level1TitleChinese，则第一级标题用中文数字表示
    function dfs(node,index,parentIndex) {
        let title=node.title;
        if(cover)title=removeTitleIndex(title)//去除标题开头的数字和点号
        let index_string=''
        if(parentIndex==''){
            index_string=index;
        }
        else{
            index_string=parentIndex+"."+index;
        }
        if(level1TitleChinese && parentIndex==''){
            node.title=convertNumberToChinese(index)+" "+title//加上标题编号
        }
        else{
            node.title=index_string+" "+title//加上标题编号
        }
        
        for (let i = 0; i < node.children.length; i++) {
            dfs(node.children[i],i+1,index_string)
        }
    }
    if(node.path=='dummy'){
        for (let i = 0; i < node.children.length; i++) {
            dfs(node.children[i],i+1, '')
        }
    }
    else{
        dfs(node,1, '')
    }
    return node
}
export function generatePieFromData(data, title) {//饼图
    // 检查数据格式是否正确
    if (!Array.isArray(data)) {
        throw new Error("Input data must be an array.");
    }

    data.forEach(item => {
        if (typeof item.label !== 'string' || typeof item.value !== 'number') {
            throw new Error("Each data item must have a 'label' (string) and 'value' (number).");
        }
    });

    // ECharts 配置模板
    const maxLength = 5;
    const echartConfig = {
        tooltip: {
            trigger: 'item',
            formatter: '{a} <br/>{b}: {c} ({d}%)',
            /**靠右 显示 */
            position: 'top',
        },
        legend: {
            top: '0',
            left: 'center',
            orient: 'horizontal',
            formatter: (name) => {
                return name.length > maxLength ? `${name.slice(0, maxLength)}...` : name;
            },
            textStyle: {
                color: '#999999', // 可选：图例文字颜色
            },
        },
        series: [
            {
                name: title,
                type: 'pie',
                radius: '50%',
                data: data.map(item => ({ name: item.label, value: item.value })),
                emphasis: {
                    itemStyle: {
                        shadowBlur: 10,
                        shadowOffsetX: 0,
                        shadowColor: 'rgba(0, 0, 0, 0.5)',
                    },
                },
                label: {
                    formatter: (params) => {
                        const label = params.name;
                        return label.length > maxLength ? `${label.slice(0, maxLength)}...` : label;
                    },
                    color: '#999999', // 可选：标签文字颜色
                },
            },
        ],
    };

    //     // 转换为 Markdown 所需的 JSON 字符串
    //     const echartMarkdown = `
    // \`\`\`echarts
    // ${JSON.stringify(echartConfig, null, 2)}
    // \`\`\`
    //     `.trim();

    return echartConfig;
}


export function generateMarkdownHistogramWithStaticColors(data) {//频度直方图
    // 检查数据格式是否正确
    if (!Array.isArray(data)) {
        throw new Error("Input data must be an array.");
    }

    data.forEach(item => {
        if (typeof item.word !== 'string' || typeof item.size !== 'number') {
            throw new Error("Each data item must have a 'word' (string) and 'size' (number).");
        }
    });

    // 提取词语和频度
    const words = data.map(item => item.word);
    const sizes = data.map(item => item.size);

    // 生成颜色从深到浅的渐变效果（基于 HSL 色调）
    const baseColor = { h: 120, s: 60, l: 20 }; // 基准颜色（绿色系）
    const gradientColors = Array.from({ length: data.length }, (_, i) => {
        const lightness = baseColor.l + (50 / data.length) * i; // 随数据索引渐变亮度
        return `hsl(${baseColor.h}, ${baseColor.s}%, ${lightness}%)`;
    });

    // 将颜色与数据绑定
    const dataWithColors = data.map((item, index) => ({
        name: item.word,
        value: item.size,
        itemStyle: {
            color: gradientColors[index],
        },
    }));

    // ECharts 配置模板
    const echartConfig = {
        tooltip: {
            trigger: 'axis',
            axisPointer: {
                type: 'shadow',
            },
        },
        xAxis: {
            type: 'category',
            data: words,
            axisLabel: {
                rotate: 45, // 旋转以避免文字重叠
                interval: 0, // 显示所有标签
            },
        },
        yAxis: {
            type: 'value',
            name: '词频',
        },
        series: [
            {
                name: '词频',
                type: 'bar',
                data: dataWithColors.map(item => ({
                    value: item.value,
                    itemStyle: item.itemStyle,
                })),
            },
        ],
    };

    // 转换为 Markdown 所需的 JSON 字符串
    const echartMarkdown = `
\`\`\`echarts
${JSON.stringify(echartConfig, null, 2)}
\`\`\`
    `.trim();

    return echartMarkdown;
}
export function generateWordCountBarChart(text) {
    // 计算输入文本的字数
    const articleWordCount = text.length;

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
        { name: '小说序章', wordCount: 2500 },
    ];


    // 组合输入文本和标准文本数据
    // 计算与每个文体字数的差异，并排序
    const sortedComparisonData = comparisonData
        .map(item => ({
            ...item,
            difference: Math.abs(item.wordCount - articleWordCount), // 计算字数差异
        }))
        .sort((a, b) => a.difference - b.difference); // 按差异排序，从小到大

    // 选择字数最接近的 5 个文体
    const closestComparisonData = sortedComparisonData.slice(0, 5);

    // 组合输入文本和最接近的 5 个标准文本数据
    const data = [
        { name: '我的文章', wordCount: articleWordCount, isHighlighted: true }, // 输入文本高亮
        ...closestComparisonData.map(item => ({ ...item, isHighlighted: false })),
    ].sort((a, b) => a.wordCount - b.wordCount); // 按字数排序，从小到大

    // 配置条形图
    const echartConfig = {
        tooltip: {},
        xAxis: {
            type: 'category',
            data: data.map(item => item.name), // X 轴显示文本名称
            axisLabel: {
                interval: 0, // 显示所有标签
                formatter: (value, index) => {
                    return data[index].isHighlighted ? `{a|${value}}` : value; // 高亮显示输入文本
                },
                rich: {
                    a: {
                        color: '#4caf50', // 高亮颜色为绿色
                        fontweight: 'bold', // 加粗
                    },
                },

                align: 'center', // 标签居中对齐
            },
        },
        yAxis: {
            type: 'value',
        },
        series: [
            {
                data: data.map(item => item.wordCount),
                type: 'bar',
                itemStyle: {
                    // 条形图颜色设置：高亮的颜色与普通颜色
                    color: (params) => {
                        const isHighlighted = data[params.dataIndex].isHighlighted;
                        return isHighlighted ? '#4caf50' : '#42a5f5'; // 高亮条形图为绿色，普通为蓝色
                    },
                },
                label: {
                    show: true, // 显示标签
                    position: 'top', // 标签显示在条形图的顶部
                    // color: '#000', // 标签的字体颜色
                    fontWeight: 'bold', // 标签字体加粗
                    fontSize: 14, // 标签字体大小
                },
            },
        ],
    };

    return echartConfig;
}


export function outlineToMindMap(outline) {
    // 递归函数，将大纲树节点转换为MindMap格式
    function convertNode(node, indentLevel = 0) {
        // 基本的MindMap节点格式，动态缩进
        let result = `${'  '.repeat(indentLevel)}- ${node.title}`;

        // 如果节点有子节点，递归调用convertNode
        if (node.children && node.children.length > 0) {
            node.children.forEach(child => {
                // 为每个子节点递归调用，增加缩进级别
                result += `\n${convertNode(child, indentLevel + 1)}`;
            });
        }

        return result;
    }

    // 启动递归并返回完整的MindMap Markdown
    //     return `
    // \`\`\`mindmap
    // ${convertNode(outline)}
    // \`\`\`
    //     `.trim(); // 移除前后多余的换行
    return convertNode(outline);
}


export function generateWordFrequencyTrendChart(text, topWords) {
    const windowCount = 16;  // 定义窗口的数量，可以根据需要调整
    const windowSize = Math.ceil(text.length / windowCount);

    // 词频统计函数
    function countWordFrequencyInWindow(windowStart, windowEnd, word) {
        let cnt = 0;
        for (let i = windowStart; i < windowEnd - word.length + 1; i++) {
            if (text.substring(i, i + word.length) === word) {
                cnt++;
            }
        }
        return cnt;
    }

    // 生成 X 轴数据（文章进度的百分比）
    const xAxisData = Array.from({ length: windowCount }, (_, i) => {
        return (((i + 1) * windowSize) / text.length * text.length).toFixed(0) + '字';  // 计算进度百分比
    });

    // 生成每个词的 Y 轴数据
    const seriesData = topWords.map((word, index) => {
        const wordFrequencies = [];

        for (let i = 0; i < windowCount; i++) {
            const windowStart = i * windowSize;
            const windowEnd = Math.min((i + 1) * windowSize, text.length);

            // 统计滑动窗口内的词频
            const frequency = countWordFrequencyInWindow(windowStart, windowEnd, word);
            wordFrequencies.push(frequency);
        }

        return {
            name: word,
            type: 'line',
            smooth: true,
            itemStyle: {
                color: `hsl(${index * 60}, 70%, 50%)`, // 每个词的颜色不同
            },
            areaStyle: {
                normal: {},
            },
            z: index + 1,
            data: wordFrequencies,
        };
    });

    // ECharts 配置
    const echartConfig = {
        tooltip: {
            trigger: 'axis',
            axisPointer: {
                type: 'cross',
            },
        },
        legend: {
            data: topWords,
            textStyle: {
                color: '#999999', // 可选：图例文字颜色
            },
        },
        xAxis: [
            {
                type: 'category',
                boundaryGap: false,
                data: xAxisData,
                axisTick: { show: false },
                axisLine: { show: false },
            },
        ],
        yAxis: {
            type: 'value',
        },
        series: seriesData,
    };

    // 返回 ECharts 配置
    return echartConfig;
}



/**
 * 将 Markdown 中的图片转换为内联 data URL
 * - 对于位图（PNG、JPG等）：使用 base64 编码的 data URL
 * - 对于矢量图（SVG）：使用 base64 编码的 data URL（兼容性更好，确保正确嵌入）
 * @param {string} md - Markdown 文本
 * @returns {Promise<string>} 处理后的 Markdown 文本
 */
export async function embedImagesInline(md){
    //查找markdown里面所有的图片链接，读取图片，转换为内联 data URL，返回经过替换后的markdown

    const lines = md.split('\n')
    let new_md = ''
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const match = line.match(/!\[.*?\]\((.*?)\)/)
        if (match) {
            const image_path = match[1]
            let dataUrl = ''
            try {
                const response = await fetch(image_path)
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
                }
                
                // 检查是否为 SVG（通过 URL 或 Content-Type）
                const contentType = response.headers.get('content-type') || ''
                const isSvg = image_path.toLowerCase().endsWith('.svg') || 
                             contentType.includes('image/svg+xml') ||
                             contentType.includes('image/svg')
                
                if (isSvg) {
                    // SVG：读取文本内容，使用 base64 编码的 data URL（更可靠，兼容性更好）
                    const svgText = await response.text()
                    if (!svgText || svgText.trim().length === 0) {
                        throw new Error('SVG 内容为空')
                    }
                    // 将 SVG 文本转换为 base64（处理中文等特殊字符）
                    const base64Svg = btoa(unescape(encodeURIComponent(svgText)))
                    dataUrl = `data:image/svg+xml;base64,${base64Svg}`
                    getLogger().debug(`SVG 转换为 data URL 成功，长度: ${dataUrl.length}`)
                } else {
                    // 位图：使用 base64 编码的 data URL
                    const blob = await response.blob()
                    if (!blob || blob.size === 0) {
                        throw new Error('图片数据为空')
                    }
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
                    getLogger().debug(`位图转换为 data URL 成功，长度: ${dataUrl.length}`)
                }
                
                // 验证 data URL 格式
                if (!dataUrl.startsWith('data:')) {
                    throw new Error('生成的 data URL 格式不正确')
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

/**
 * @deprecated 使用 embedImagesInline 代替，函数名更准确
 * 保持向后兼容
 */
export async function image2base64(md){
    return embedImagesInline(md)
}
export async function image2local(md){
    //查找markdown里面所有的图片链接，读取图片，将路径替换为本地路径，返回经过替换后的markdown
    const local_path = await getImagePath()
    const lines = md.split('\n')
    let new_md = ''
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        //把'http://localhost:52521/images/'替换成local_path
        const match = line.match(/!\[.*?\]\((.*?)\)/)
        if (match) {
            const image_path = match[1]
            
            let image_name = '';
            
            if (image_path.startsWith('http://localhost:52521/images/')) {
                // HTTP URL，提取文件名
                const prefix_len = 'http://localhost:52521/images/'.length;
                image_name = image_path.slice(prefix_len);
            } else if (image_path.startsWith('data:image/')) {
                // Base64 图片，跳过（不需要转换为本地路径）
                new_md += line + '\n';
                continue;
            } else {
                // 其他格式，尝试提取文件名
                image_name = image_path.split(/[/\\]/).pop() || image_path;
            }
            
            // 使用 path.join 确保路径正确（跨平台兼容）
            
            const local_image_path = await getImagePath()
            const local_image_url = local_image_path +'/'+ image_name
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
export async function local2image(md, docPath = ''){
    //把local_path替换成'http://localhost:52521/images/'
    
    const local_path = await getImagePath()
    const lines = md.split('\n')
    let new_md = ''
    
    // 使用统一的路径解析服务（在函数外部导入，避免重复导入）
    // 注意：这里使用动态导入是因为 path-resolver 是 TypeScript 文件
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        //把local_path替换成'http://localhost:52521/images/'
        const match = line.match(/!\[.*?\]\((.*?)\)/)
        if (match) {
            let image_path = match[1]
            
            // 处理不同的路径格式：
            // 1. HTTP URL：http://localhost:52521/images/filename（已经是正确的，不需要转换）
            // 2. 相对路径（./xxx.jpg 或 ../xxx.jpg）：先转换为绝对路径
            // 3. local_path 下的本地路径：直接提取文件名并转换
            // 4. 其他本地路径：先通过 API 上传，然后转换为 HTTP URL
            
            let server_url = '';
            
            if (image_path.startsWith('http://localhost:52521/images/')) {
                // 已经是 HTTP URL，直接使用
                new_md += line + '\n';
                continue;
            } else if (image_path.startsWith('http://') || image_path.startsWith('https://')) {
                // 其他 HTTP/HTTPS URL，保持原样
                new_md += line + '\n';
                continue;
            } else if (image_path.startsWith('data:')) {
                // Base64 图片，保持原样
                new_md += line + '\n';
                continue;
            } else {
                // 所有路径都经过 path-resolver 处理（绝对路径会直接返回，相对路径会解析）
                let resolvedImagePath = image_path;
                
                if (docPath) {
                    // 使用统一的路径解析服务（同步函数，不需要 await）
                    const { resolvePathWithLinkBase } = await import('./path-resolver');
                    // 将 docPath 转换为 linkBase 格式（目录路径）
                    const { getLinkBase } = await import('../stores/workspace');
                    const linkBase = getLinkBase(docPath);
                    resolvedImagePath = resolvePathWithLinkBase(image_path, linkBase || docPath);
                    getLogger().debug(`路径解析结果: ${image_path} -> ${resolvedImagePath}`, { docPath, linkBase });
                }
                
                // 本地路径处理
                // 支持 Windows 路径（\）和 Unix 路径（/）
                const normalizedLocalPath = local_path.replace(/\\/g, '/');
                const normalizedImagePath = resolvedImagePath.replace(/\\/g, '/');
                
                // 判断是否在 local_path 下
                const isInLocalPath = normalizedImagePath.startsWith(normalizedLocalPath + '/') || 
                                     normalizedImagePath.startsWith(normalizedLocalPath);
                
                if (isInLocalPath) {
                    // 在 local_path 下，直接提取文件名并转换
                    let image_name = '';
                    if (normalizedImagePath.startsWith(normalizedLocalPath + '/')) {
                        image_name = normalizedImagePath.slice(normalizedLocalPath.length + 1);
                    } else if (normalizedImagePath === normalizedLocalPath) {
                        // 如果路径就是 local_path 本身（不太可能，但处理一下）
                        image_name = resolvedImagePath.split(/[/\\]/).pop();
                    } else {
                        image_name = normalizedImagePath.slice(normalizedLocalPath.length);
                    }
                    server_url = 'http://localhost:52521/images/' + image_name;
                } else {
                    // 不在 local_path 下，需要通过 API 上传
                    // 注意：这里使用解析后的绝对路径（如果之前是相对路径，已经转换了）
                    try {
                        getLogger().debug(`上传图片: ${resolvedImagePath}`, { originalPath: image_path, docPath });
                        const response = await fetch('http://localhost:52521/api/image/url-upload', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ url: resolvedImagePath }),
                        });
                        
                        if (!response.ok) {
                            throw new Error(`上传失败: ${response.status}`);
                        }
                        
                        const result = await response.json();
                        if (result.code === 0 && result.data && result.data.url) {
                            // 从返回的服务器路径中提取文件名
                            // result.data.url 格式类似: C:\Users\...\Pictures\meta-doc-imgs\1234567890.jpg
                            const serverPath = result.data.url;
                            const fileName = serverPath.split(/[/\\]/).pop();
                            server_url = 'http://localhost:52521/images/' + fileName;
                        } else {
                            throw new Error(result.error || '上传失败');
                        }
                    } catch (error) {
                        getLogger().error(`图片上传失败: ${resolvedImagePath}`, error);
                        eventBus.emit('show-error', `图片上传失败: ${resolvedImagePath} - ${error.message}`);
                        // 上传失败时，尝试直接使用原路径的文件名（作为回退方案）
                        const fileName = resolvedImagePath.split(/[/\\]/).pop() || resolvedImagePath;
                        server_url = 'http://localhost:52521/images/' + fileName;
                    }
                }
            }
            
            new_md += line.replace(match[1], server_url) + '\n'
        } else {
            new_md += line + '\n'
        }
    }
    //console.log(new_md);
    return new_md
}

/**
 * 统一的 Markdown 预览渲染函数
 * @param {HTMLElement} container - 渲染容器的 DOM 元素
 * @param {string} markdown - 要渲染的 Markdown 文本
 * @param {Object} options - 可选配置
 * @param {string} options.linkBase - 用于解析相对路径的基础路径
 * @param {boolean} options.renderCode - 是否渲染代码块（默认 true）
 * @param {boolean} options.renderMath - 是否渲染数学公式（默认 true）
 * @returns {Promise<void>}
 */
export async function renderMarkdownPreview(container, markdown, options = {}) {
    const { linkBase = '', renderCode = true, renderMath = true } = options;
    
    // 获取 CDN
    const cdn = isElectronEnv() ? localVditorCDN : vditorCDN;
    
    // 获取主题设置
    let contentTheme = await getSetting('contentTheme');
    if (contentTheme === 'auto' || !contentTheme) {
        contentTheme = themeState.currentTheme.vditorTheme;
    }
    const codeTheme = themeState.currentTheme.codeTheme;
    const lineNumber = await getSetting('lineNumber') ?? true;
    
    // 清空容器
    container.innerHTML = '';
    
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
        }
    };
    
    // 调用 Vditor.preview
    await Vditor.preview(container, markdown, previewOptions);
    
    // 可选：渲染代码块和数学公式
    if (renderCode && typeof Vditor.codeRender === 'function') {
        Vditor.codeRender(container);
    }
    
    if (renderMath && typeof Vditor.mathRender === 'function') {
        Vditor.mathRender(container, { cdn });
    }
}

export async function ConvertMarkdownToHtmlVditor(md) {
    let cdn = '';
    if(isElectronEnv()){
        cdn=localVditorCDN;
    }
    else{
        cdn=vditorCDN;
    }
    //logger.debug(`ConvertMarkdownToHtmlVditor: ${await Vditor.md2html(md,{cdn: cdn})}`);
    return await Vditor.md2html(md,{cdn: cdn})

}

/**
 * 将 Vditor.md2html 生成的 HTML 中 class="language-math" 的行内/块级公式渲染为 PNG 图片
 * - span.language-math 视为行内
 * - div.language-math 视为块级
 */
// 移至 chart-pre-renderer.js 中，避免 md-utils 过载
let ipcRenderer = null
if (window && window.electron) {
  ipcRenderer = window.electron.ipcRenderer

} else {
  webMainCalls();
  ipcRenderer = localIpcRenderer
  //todo 说明当前环境不是electron环境，需要另外适配
}

export async function ConvertMarkdownToHtmlManually(md) {
    const contentTheme = await getSetting('contentTheme')
    const codeTheme = await getSetting('codeTheme')
    const lineNumber = await getSetting('lineNumber')
    
    let cdn = '';
    if(isElectronEnv()){
        cdn=localVditorCDN;
    }
    else{
        cdn=vditorCDN;
    }
    
    // 第一步：从 Markdown 中提取所有图片 URL，并转换为 data URL 映射
    // 这样可以在渲染后替换，避免 Vditor 处理超长 data URL 时丢失
    const imageUrlMap = new Map(); // 原始 URL -> data URL 的映射
    const imageRegex = /!\[([^\]]*)\]\((.*?)\)/g;
    let match;
    const imagePromises = [];
    
    while ((match = imageRegex.exec(md)) !== null) {
        const altText = match[1];
        const imageUrl = match[2];
        
        // 跳过已经是 data URL 的图片
        if (imageUrl.startsWith('data:')) {
            continue;
        }
        
        // 异步获取图片的 data URL
        const promise = (async () => {
            try {
                const response = await fetch(imageUrl);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                const contentType = response.headers.get('content-type') || '';
                const isSvg = imageUrl.toLowerCase().endsWith('.svg') || 
                             contentType.includes('image/svg+xml') ||
                             contentType.includes('image/svg');
                
                let dataUrl = '';
                if (isSvg) {
                    const svgText = await response.text();
                    if (svgText && svgText.trim().length > 0) {
                        const base64Svg = btoa(unescape(encodeURIComponent(svgText)));
                        dataUrl = `data:image/svg+xml;base64,${base64Svg}`;
                    }
                } else {
                    const blob = await response.blob();
                    if (blob && blob.size > 0) {
                        const reader = new FileReader();
                        reader.readAsDataURL(blob);
                        dataUrl = await new Promise((resolve, reject) => {
                            reader.onload = () => {
                                if (reader.result && typeof reader.result === 'string') {
                                    resolve(reader.result);
                                } else {
                                    reject(new Error('读取图片数据失败'));
                                }
                            };
                            reader.onerror = () => reject(new Error('FileReader 错误'));
                        });
                    }
                }
                
                if (dataUrl) {
                    imageUrlMap.set(imageUrl, dataUrl);
                    // 也通过 alt 文本建立映射（作为备用）
                    if (altText) {
                        imageUrlMap.set(altText, dataUrl);
                    }
                    getLogger().debug(`图片 URL 映射创建: ${imageUrl.substring(0, 50)}... -> data URL (长度: ${dataUrl.length})`);
                }
            } catch (error) {
                getLogger().warn(`获取图片 data URL 失败: ${imageUrl}`, error);
            }
        })();
        
        imagePromises.push(promise);
    }
    
    // 等待所有图片转换完成
    await Promise.all(imagePromises);
    
    // 第二步：使用原始 Markdown（保持 HTTP URL）进行渲染
    // 创建一个临时的 DOM 容器来执行完整的渲染
    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'absolute';
    tempContainer.style.left = '-99999px';
    tempContainer.style.top = '-99999px';
    tempContainer.style.width = '800px';
    document.body.appendChild(tempContainer);
    
    try {
        // 使用 Vditor.preview 进行完整的渲染（包括代码高亮和数学公式）
        const previewOptions = {
            cdn: cdn,
            markdown: {
                theme: { current: contentTheme }
            },
            hljs: {
                style: codeTheme,
                lineNumber: lineNumber
            }
        };
        
        Vditor.preview(tempContainer, md, previewOptions);
        
        // 等待 preview 完成
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // 执行代码高亮渲染（确保代码块被正确高亮）
        if (typeof Vditor.codeRender === 'function') {
            Vditor.codeRender(tempContainer);
        }
        
        // 执行数学公式渲染（确保数学公式被正确渲染）
        if (typeof Vditor.mathRender === 'function') {
            Vditor.mathRender(tempContainer, {
                cdn: cdn
            });
        }
        
        // 等待渲染完成（数学公式和代码高亮可能需要一些时间）
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 获取渲染后的 HTML 内容
        let finalHtml = tempContainer.innerHTML;
        
        // 第三步：在渲染后的 HTML 中替换所有图片 URL 为 data URL
        finalHtml = finalHtml.replace(/<img([^>]*?)>/gi, (match, attributes) => {
            // 提取 src 属性
            const srcMatch = attributes.match(/src\s*=\s*"([^"]*)"/i);
            const altMatch = attributes.match(/alt\s*=\s*"([^"]*)"/i);
            
            let imageUrl = srcMatch ? srcMatch[1] : null;
            const altText = altMatch ? altMatch[1] : null;
            
            // 如果已经有 data URL，不需要替换
            if (imageUrl && imageUrl.startsWith('data:')) {
                return match;
            }
            
            // 尝试从映射中找到对应的 data URL
            let dataUrl = null;
            if (imageUrl && imageUrlMap.has(imageUrl)) {
                dataUrl = imageUrlMap.get(imageUrl);
            } else if (altText && imageUrlMap.has(altText)) {
                dataUrl = imageUrlMap.get(altText);
            }
            
            if (dataUrl) {
                // 替换 src 属性
                if (srcMatch) {
                    return match.replace(/src\s*=\s*"([^"]*)"/i, `src="${dataUrl}"`);
                } else {
                    // 如果没有 src 属性，添加一个
                    return match.replace(/(<img[^>]*?)(>)/i, `$1 src="${dataUrl}"$2`);
                }
            } else {
                // 如果找不到映射，记录警告但保持原样
                if (!imageUrl) {
                    getLogger().warn('发现没有 src 属性的 img 标签，且无法找到映射:', match.substring(0, 100));
                } else {
                    getLogger().warn(`无法找到图片 URL 的 data URL 映射: ${imageUrl.substring(0, 50)}...`);
                }
                return match;
            }
        });
        
        // 验证所有 img 标签都有 src 属性
        const imgTags = finalHtml.match(/<img[^>]*>/gi);
        if (imgTags) {
            imgTags.forEach(imgTag => {
                if (!/src\s*=/i.test(imgTag)) {
                    getLogger().warn('替换后仍缺少 src 属性的 img 标签:', imgTag.substring(0, 100));
                }
            });
        }
        
        // 第四步：获取并内嵌 Vditor CSS
        let vditorCss = '';
        try {
            const cssUrl = `${cdn}/dist/index.css`;
            const cssResponse = await fetch(cssUrl);
            if (cssResponse.ok) {
                vditorCss = await cssResponse.text();
                getLogger().debug(`Vditor CSS 获取成功，长度: ${vditorCss.length}`);
            } else {
                getLogger().warn(`无法获取 Vditor CSS: ${cssUrl}`);
            }
        } catch (error) {
            getLogger().warn('获取 Vditor CSS 失败:', error);
        }
        
        // 从 finalHtml 中移除 Vditor 注入的 CSS 链接（如果有）
        finalHtml = finalHtml.replace(/<link[^>]*rel\s*=\s*["']stylesheet["'][^>]*href\s*=\s*["'][^"']*vditor[^"']*["'][^>]*>/gi, '');
        
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
</html>`;
        
        return html;
    } finally {
        // 清理临时容器
        if (tempContainer.parentNode) {
            tempContainer.parentNode.removeChild(tempContainer);
        }
    }
}

export const ConvertHtmlForPdf = async (md) => {
    getLogger().info(`ConvertHtmlForPdf 开始，Markdown 长度: ${md.length}`);
    
    let cdn = '';
    if(isElectronEnv()){
        cdn=localVditorCDN;
    }
    else{
        cdn=vditorCDN;
    }
    getLogger().info(`使用 CDN: ${cdn}`);
    
    // 预渲染所有图表为图片（统一处理）
    // 统一使用 SVG 矢量图
    let processedMd = md;
    // try {
    //     processedMd = await preRenderAllCharts(md, cdn);
    //     if (processedMd !== md) {
    //         getLogger().info('图表代码块已预渲染为图片');
    //     }
    // } catch (error) {
    //     getLogger().warn('图表预渲染失败，使用原始 Markdown:', error);
    //     processedMd = md;
    // }
    
    // 使用 JSON.stringify 对处理后的 md 进行转义
    const safeMarkdown = JSON.stringify(processedMd);
    
    const contentTheme = await getSetting('contentTheme');
    const codeTheme = await getSetting('codeTheme');
    const lineNumber = await getSetting('lineNumber');
    getLogger().info(`主题设置: contentTheme=${contentTheme}, codeTheme=${codeTheme}, lineNumber=${lineNumber}`);

    const html=`<!DOCTYPE html>
<html lang="zh">
<head>
    <meta charset="UTF-8">
    <link rel="stylesheet" href="${cdn}/dist/index.css"/>
    <script src="${cdn}/dist/method.min.js"></script>
</head>
<body>
    <div id="preview" style="max-width: 100%; width: auto; padding: 0 20px; box-sizing: border-box;"></div>
    <script>
            // 等待页面加载后，渲染 markdown 内容
            window.onload = function() {
                // 使用转义后的 md 内容
                const previewElement = document.getElementById('preview');
                Vditor.preview(previewElement, ${safeMarkdown}, {
                    cdn: "${cdn}",
                    markdown: {
                        theme: "{ current: '${contentTheme}' }"
                    },
                    hljs: {
                        style: "${codeTheme}",
                        lineNumber: ${lineNumber}
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
    <style>
        /* 确保 html 和 body 没有滚动条 */
        html, body {
            margin: 0;
            padding: 0;
            overflow: hidden !important;
            overflow-x: hidden !important;
            overflow-y: hidden !important;
            width: 100%;
            height: auto;
        }
        
        body {
            font-family: "Noto Sans SC", "Microsoft YaHei", sans-serif;
            max-width: 100%;
            box-sizing: border-box;
        }
        
        /* 确保预览容器没有滚动条 */
        #preview {
            overflow: visible !important;
            overflow-x: visible !important;
            overflow-y: visible !important;
            max-width: 100%;
            width: auto;
            margin: 0 auto;
            padding: 0 20px;
            box-sizing: border-box;
        }
        
        /* 确保 Vditor 生成的预览容器没有滚动条 */
        #preview .vditor-preview,
        #preview .md-editor-preview {
            overflow: visible !important;
            overflow-x: visible !important;
            overflow-y: visible !important;
            max-width: 100%;
            box-sizing: border-box;
        }
        
        /* 导出 PDF 时，确保代码块完全展开，无滚动条 */
        .md-editor-code pre code,
        pre code,
        .hljs {
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
        .md-editor-code pre,
        pre {
            overflow: visible !important;
            max-height: none !important;
            max-width: 100% !important;
            height: auto !important;
            box-sizing: border-box;
        }
        .md-editor-code {
            overflow: visible !important;
            max-height: none !important;
            max-width: 100% !important;
            box-sizing: border-box;
        }
        
        /* 确保图片、表格等元素不会超出页面宽度 */
        img {
            max-width: 100% !important;
            height: auto !important;
            box-sizing: border-box;
        }
        
        table {
            max-width: 100% !important;
            table-layout: auto;
            box-sizing: border-box;
        }
        
        /* 确保所有块级元素都使用正确的盒模型 */
        p, div, h1, h2, h3, h4, h5, h6, ul, ol, li, blockquote {
            max-width: 100%;
            box-sizing: border-box;
            word-wrap: break-word;
            overflow-wrap: break-word;
        }
        
        /* 确保代码块内的长行可以换行（内联代码保持原样） */
        pre {
            word-wrap: break-word !important;
            overflow-wrap: break-word !important;
            white-space: pre-wrap !important;
        }
        
        /* 内联代码保持原样，不强制换行 */
        code:not(pre code) {
            white-space: normal !important;
        }
    </style>
</body>
</html>`;
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
    getLogger().info(`HTML 生成完成，长度: ${html.length}`);
    return html;
}

export function filterMetaDataFromMd(md){
    const pureMd = md.replace(/<!--meta-info:\s*[^-]+?\s*-->/, '').trim();
    return pureMd;
}