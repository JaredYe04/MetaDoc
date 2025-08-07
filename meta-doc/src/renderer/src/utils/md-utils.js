//这个文件需要实现一系列Markdown相关的功能函数

import Vditor from "vditor"
import { renderedHtml } from "./common-data"
import eventBus, { isElectronEnv } from "./event-bus"
import { getImagePath, getSetting } from "./settings"
import { el } from "element-plus/es/locales.mjs";
import { convertNumberToChinese, removeTitleIndex } from "./regex-utils";
import {localVditorCDN, vditorCDN } from "./vditor-cdn";
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

    // 遍历每一行
    for (let line of lines) {
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

export function extractOutlineTreeFromMarkdownLegacy(md, bypassText = false) {
    const lines = md.split('\n')
    //console.log(lines);
    const outline_tree = {
        title: '',//当前标题
        path: 'dummy', //当前标题的路径
        text: '',//当前内容，不包括子标题以及内容
        children: []
    }

    let current_node = outline_tree
    let stack = [outline_tree]
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        //console.log(line);
        const match = line.match(/^#+\s+(.*)/)
        //console.log(match);
        if (match) {
            const title = match[1]
            //console.log(title);
            const level = match[0].match(/#/g).length
            //console.log(level);
            const new_node = {
                title: title,
                path: '',
                text: '',
                children: []
            }
            //console.log(new_node);
            if (level > stack.length) {
                stack[stack.length - 1].children.push(new_node)
                stack.push(new_node)
            } else {
                stack[level - 1].children.push(new_node)
                stack[level] = new_node
            }
            current_node = new_node
        } else {
            if (!bypassText) {
                current_node.text += line + '\n'
            }
        }
    }
    //console.log(outline_tree);
    //根据大纲树生成路径
    let path = ''
    let path_stack = []
    let path_index = 1
    let root = outline_tree
    //root节点通常是dummy节点
    for (let i = 0; i < root.children.length; i++) {
        root.children[i].path = path + (i + 1)
        path_stack.push(root.children[i])
    }
    while (path_stack.length > 0) {
        let node = path_stack.pop()
        path = node.path + '.'
        for (let i = 0; i < node.children.length; i++) {
            node.children[i].path = path + (i + 1)
            path_stack.push(node.children[i])
        }
    }

    //console.log(outline_tree);
    return outline_tree//最外层节点是dummy节点
}

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

// 2. 从大纲树生成Markdown文本

export function generateMarkdownFromOutlineTreeLegacy(outline_tree) {
    //console.log(outline_tree);
    let md = ''
    function dfs(node, level) {
        md += '#'.repeat(level) + ' ' + node.title + '\n'
        // if(node.text.trim()==''){//如果node.text不是空，那么加一个换行符
        //     node.text+='\n'
        // }
        md += node.text;
        //如果node.text最后一个字符不是换行符，那么加一个换行符
        // if(!node.text || node.text.trim()==''){
        //     node.text='\r\n'
        // }
        if (node.text[node.text.length - 1] !== '\n') {
            md += '\n'
        }
        for (let i = 0; i < node.children.length; i++) {
            dfs(node.children[i], level + 1)
        }
    }
    if (outline_tree.path === 'dummy') {//如果是根节点
        if (outline_tree.text.trim() !== '') {//如果node.text不是空，那么加一个换行符
            md += outline_tree.text + '\n'//根节点的text
        }
        for (let i = 0; i < outline_tree.children.length; i++) {
            dfs(outline_tree.children[i], 1)
        }
    }
    //console.log(md);
    return md
}

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



export async function image2base64(md){
    //查找markdown里面所有的图片链接，读取图片，转换为base64，返回经过替换后的markdown

    const lines = md.split('\n')
    let new_md = ''
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const match = line.match(/!\[.*?\]\((.*?)\)/)
        if (match) {
            const image_path = match[1]
            let base64 = ''
            try {
                const response = await fetch(image_path)
                const blob = await response.blob()
                const reader = new FileReader()
                reader.readAsDataURL(blob)
                base64 = await new Promise((resolve, reject) => {
                    reader.onload = () => resolve(reader.result)
                    reader.onerror = reject
                })
            } catch (error) {
                eventBus.emit('show-error', '图片转换失败'+error)
                console.error(error)
            }
            new_md += line.replace(image_path, base64) + '\n'
        } else {
            new_md += line + '\n'
        }
    }
    return new_md
}
export async function image2local(md){
    //查找markdown里面所有的图片链接，读取图片，将路径替换为本地路径，返回经过替换后的markdown
    const local_path = await getImagePath()
    const lines = md.split('\n')
    let new_md = ''
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        //把'http://localhost:3000/images/'替换成local_path
        const match = line.match(/!\[.*?\]\((.*?)\)/)
        if (match) {
            const image_path = match[1]
            const prefix_len='http://localhost:3000/images/'.length
            const image_name=image_path.slice(prefix_len)
            new_md += line.replace(image_path, local_path +'\\'+image_name) + '\n'
        } else {
            new_md += line + '\n'
        }
    }
    return new_md
}
export async function local2image(md){
    //把local_path替换成'http://localhost:3000/images/'
    
    const local_path = await getImagePath()
    const lines = md.split('\n')
    let new_md = ''
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        //把local_path替换成'http://localhost:3000/images/'
        const match = line.match(/!\[.*?\]\((.*?)\)/)
        if (match) {
            const image_path = match[1]
            const prefix_len=local_path.length+1//加上一个斜杠
            const image_name=image_path.slice(prefix_len)
            new_md += line.replace(image_path, 'http://localhost:3000/images/' + image_name) + '\n'
        } else {
            new_md += line + '\n'
        }
    }
    //console.log(new_md);
    return new_md
}

export async function ConvertMarkdownToHtmlVditor(md) {
    let cdn = '';
    if(isElectronEnv()){
        cdn=localVditorCDN;
    }
    else{
        cdn=vditorCDN;
    }
    return await Vditor.md2html(md,{cdn: cdn})

}
export async function ConvertMarkdownToHtmlManually(md) {
    const contentTheme = await getSetting('contentTheme')
    const codeTheme = await getSetting('codeTheme')
    const lineNumber = await getSetting('lineNumber')
    const cdn = 'https://unpkg.com/vditor'//导出的时候就不需要本地服务器了
    const safeMarkdown = JSON.stringify(md);
    const html = `<html><link rel="stylesheet" href="${cdn}/dist/index.css"/>
        <script src="${cdn}/dist/method.min.js"></script>
        <body><div id="preview" style="width: 800px;"></div></body>
        <script>
            // 等待 iframe 完全加载后，渲染 markdown 内容
            window.onload = function() {
            //鼠标设置为等待状态
                // 使用转义后的 md 内容
                const previewElement = document.getElementById('preview');
                Vditor.preview(previewElement, ${safeMarkdown}, {
                    cdn: "${cdn}",
                    markdown: {
                        theme: "{ current: '${contentTheme}' }",
                    },
                    hljs: {
                        style: "${codeTheme}",
                        lineNumber: ${lineNumber}
                    }
                });
                Vditor.codeRender(previewElement);
                Vditor.mathRender(previewElement, {
                    cdn: '${cdn}',
                });
                Vditor.mermaidRender(previewElement, '${cdn}');
                Vditor.SMILESRender(previewElement, '${cdn}');
                Vditor.markmapRender(previewElement, '${cdn}');
                Vditor.flowchartRender(previewElement, '${cdn}');
                Vditor.graphvizRender(previewElement, '${cdn}');
                Vditor.chartRender(previewElement, '${cdn}');
                Vditor.mindmapRender(previewElement, '${cdn}');
                Vditor.abcRender(previewElement, '${cdn}');
            };
        </script></html>`;
return html
}

export const ConvertHtmlForPdf = async (md) => {
    // 创建一个 iframe 并设置内容
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe); // 将 iframe 添加到页面上
    // 使用 JSON.stringify 对 md 进行转义
    const safeMarkdown = JSON.stringify(md);
    let cdn = '';
    if(isElectronEnv()){
        cdn=localVditorCDN;
    }
    else{
        cdn=vditorCDN;
    }
    const contentTheme = await getSetting('contentTheme');
    const codeTheme = await getSetting('codeTheme');
    const lineNumber = await getSetting('lineNumber');
    const html=`
        <link rel="stylesheet" href="${cdn}/dist/index.css"/>
        <script src="${cdn}/dist/method.min.js"></script>
        <div id="preview" style="width: 800px;"></div>
        <script>
            // 等待 iframe 完全加载后，渲染 markdown 内容
            window.onload = function() {
            //鼠标设置为等待状态
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
                Vditor.codeRender(previewElement);
                Vditor.mathRender(previewElement, {
                    cdn: '${cdn}',
                });
                Vditor.mermaidRender(previewElement, '${cdn}');
                Vditor.SMILESRender(previewElement, '${cdn}');
                Vditor.markmapRender(previewElement, '${cdn}');
                Vditor.flowchartRender(previewElement, '${cdn}');
                Vditor.graphvizRender(previewElement, '${cdn}');
                Vditor.chartRender(previewElement, '${cdn}');
                Vditor.mindmapRender(previewElement, '${cdn}');
                Vditor.abcRender(previewElement, '${cdn}');
            };
        </script>
    `;
    return html;

    
}

