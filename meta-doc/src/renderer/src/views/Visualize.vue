<template>
    <div class="visualize-container">
        <!-- 左侧：文章大纲和字数统计 -->

        <div class="left-section">
            <div class="outline-section aero-div">
                <h3>文章大纲</h3>
                <div id="outline-graph" style="max-height:300px;overflow: auto;"></div>
            </div>

            <div class="word-count-section aero-div">
                <h3>字数统计</h3>
                <div class="word-count-placeholder">
                    <div id="word-count-diagram" style="width: 100%; height: 300%;overflow: auto;"></div>
                </div>
            </div>
        </div>

        <!-- 中间：词云图 -->
        <div class="wordcloud-section aero-div" style="padding: 0;overflow: auto;">
            <h1 class="big-title interactive-text" @click="generateWordCloud">词云图</h1>
            <div id="wordcloud-3d" class="wordcloud-canvas">
            </div>
        </div>

        <!-- 右侧：段落分布和词频统计 -->
        <div class="right-section">
            <div class="pie-analysis aero-div">
                <h3>段落分布</h3>
                <div id="pie" class="chart-placeholder"  style="max-height:300px; width: 100%; height: 90%;overflow: auto;">
                    
                </div>
            </div>

            <div class="word-frequency-section aero-div">
                <h3>词频统计</h3>
                <div class="word-frequency">
                    <div id="word-frequency-diagram" style="width: 100%; height: 300%;overflow: auto;"></div>
                </div>
            </div>
        </div>
    </div>
    <!-- <div id="vditor" style="visibility: hidden; height: 0; width: 0;">

       </div> -->
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { current_article, current_article_meta_data, current_outline_tree } from '../utils/common-data';

import cloud from 'd3-cloud';
import * as d3 from 'd3';
import { generatePieFromData, generateWordCountBarChart, generateWordFrequencyTrendChart, md2html, md2htmlRaw, outlineToMindMap } from '../utils/md-utils';
onMounted(async () => {
    //await initVditor();
    await refreshAll();
    eventBus.on('refresh',refreshAll);
});

import Vditor from 'vditor';
import { List } from 'tdesign-vue-next';
import * as echarts from 'echarts';
import eventBus from '../utils/event-bus';
const ipcRenderer = window.electron.ipcRenderer
const words = ref([]);
const wordCount = ref({});
// const initVditor = async () => {
//     Vditor = await ipcRenderer.invoke('get-vditor');
// };
const refreshAll=async()=>{
    await processWords();
    await generateWordCloud();
    await generateOutlineGraph();
    await generateWordFrequencyDiagram();
    await generateWordCountDiagram();
    await generatePie();
};
const generatePie=async()=>{
    const node=document.getElementById('pie');
    let data=[];
    //统计每一段字数
    let outline=current_outline_tree.value;
    if(outline.path==='dummy')
        outline=outline.children[0];
    const dfs=(node)=>{
        let cnt=node.title.length+node.text.length;
        for(let i=0;i<node.children.length;i++){
            cnt+=dfs(node.children[i]);
        }
        return cnt;
    };
    const find=(node)=>{
        data.push({value:node.text.length+node.title.length,label:node.title});
        data[data.length-1].value+=dfs(node);
    };
    for(let i=0;i<outline.children.length;i++){
        find(outline.children[i]);
    }
    //console.log(data);
    const config=generatePieFromData(data,current_article_meta_data.value.title);
    let chart=echarts.init(node);
    chart.setOption(config);

};
const generateWordCountDiagram=async()=>{
    const node=document.getElementById('word-count-diagram');
    const config=generateWordCountBarChart(current_article.value);
    let chart=echarts.init(node);
    chart.setOption(config);
}
const generateWordFrequencyDiagram=async()=>{
    const node=document.getElementById('word-frequency-diagram');
    const top5words=wordCount.value.slice(0,5).map((item)=>item.text);
    const config=generateWordFrequencyTrendChart(current_article.value,top5words);
    let chart=echarts.init(node);
    chart.setOption(config);

}

const generateOutlineGraph = async () => {
    const node=document.getElementById('outline-graph');
    let tree=current_outline_tree.value;
    console.log(tree);
    if(tree.path==='dummy')tree=tree.children[0];
    //console.log(tree);
    const md=outlineToMindMap(tree);
    //console.log(Vditor)
    //console.log(md);
    const html=await md2htmlRaw(md);
    node.innerHTML=html;
    const lis=node.getElementsByTagName('li');
    for(let i=0;i<lis.length;i++){
        //如果有子节点，跳过
        if(lis[i].getElementsByTagName('ul').length>0)continue;
        lis[i].style.cursor='pointer';
        //添加一个鼠标悬停事件
        lis[i].addEventListener('mouseover',()=>{
            //放大
            lis[i].style.scale=1.05;
            
        });
        lis[i].addEventListener('mouseout',()=>{
           lis[i].style.scale=1;

        });
    }
    //Vditor.mindmapRender(node,'http://localhost:3000/vditor');

};
const processWords = async () => {
    words.value = await ipcRenderer.invoke('cut-words', { text: current_article.value });
    words.value.forEach((word) => {
        if (wordCount.value[word]) {
            wordCount.value[word] += 1;
        } else {
            wordCount.value[word] = 1;
        }
    });
    //console.log(wordCount);
    //去掉一些标点符号
    const symbols = '~!@#$%^&*()_+`-={}|[]\\:";\'<>?,./。、，；：‘’“”【】《》？！￥…（）—0123456789';
    Object.keys(wordCount.value).forEach((key) => {
        if (symbols.includes(key)) {
            delete wordCount.value[key];
        }
        if (wordCount.value[key] < 2) {
            delete wordCount.value[key];
        }
        if (key.length < 2 || key.length > 10) {
            delete wordCount.value[key];
        }

    });
    wordCount.value = Object.keys(wordCount.value).map((key) => ({
        text: key,
        size: wordCount.value[key],
    }));

    //筛选出前20个词
    wordCount.value = wordCount.value.sort((a, b) => b.size - a.size).slice(0, Math.min(30, wordCount.value.length));
};
const generateWordCloud = async () => {

    d3.select('#wordcloud-3d')
        .selectAll('svg')
        // .transition() // 添加过渡动画
        // .duration(1000) // 设置动画持续时间（单位：毫秒）
        // .style('opacity', 0) // 逐渐将透明度设置为 0
        .remove(); // 动画完成后移除元素
    const max_freq=wordCount.value.reduce((prev,cur)=>prev.size>cur.size?prev:cur).size;
    console.log(max_freq);
    const layout = cloud()
        .size([600, 600]) // 词云图的宽高
        .words(
            wordCount.value.map(d => ({
                text: d.text,
                size: d.size,
            }))
        )
        .font('Impact')
        //.fontSize(d => d.size * 10 * (Math.random() > 0.5 ? 0.8 : 1.2)) 
        .fontSize(d => Math.min(d.size*120/max_freq +10,100 ))
        .rotate((d) => (
            (Math.random() > 0.5 || d.text === wordCount.value[0].text) ? 0 : 90 * (Math.random() > 0.5 ? 1 : -1)
        )) // 随机旋转
        .on('end', draw);

    layout.start();

    function draw(wordCount) {
        d3.select('#wordcloud-3d')
            .append('svg')
            .attr('width', layout.size()[0])
            .attr('height', layout.size()[1])
            .append('g')
            .attr(
                'transform',
                `translate(${layout.size()[0] / 2}, ${layout.size()[1] / 2})`
            )
            .selectAll('text')
            .data(wordCount)
            .enter()
            .append('text')
            .style('font-family', 'Impact')
            .style('font-size', d => `${d.size}px`)
            .style('fill', () => d3.schemeCategory10[Math.floor(Math.random() * 10)])
            .attr('class', 'wordcloud-text')
            .attr('text-anchor', 'middle')
            .style('padding', '10px')
            .attr('transform', d => `translate(${d.x}, ${d.y}) rotate(${d.rotate})`)
            .style('opacity', 0) // 初始透明度为 0
            .transition() // 为每个文字添加动画
            .duration(1000) // 动画持续时间
            .style('opacity', 1) // 最终透明度为 1
            .text(d => d.text);
    }
};

</script>

<style scoped>
.visualize-container {
  display: grid;
  grid-template-columns: 30% 40% 30%; /* 左中右三列，宽度分别为30%, 40%, 30% */
  gap: 4px;
  height: 85vh;
  max-height: 85vh;
  padding: 10px;

}

/* 左侧区域：文章大纲和字数统计 */
.left-section {
  display: flex;
  flex-direction: column;
  gap: 16px;

}

.outline-section,
.word-count-section {
  flex: 1;
  border: 1px dashed #ccc;
}

/* 中间区域：词云图 */
.wordcloud-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  border: 1px dashed #ccc;
}


/* 右侧区域：段落分布和词频统计 */
.right-section {
  display: flex;
  flex-direction: column;
  gap: 16px;

}

/* 段落分布部分 */
.pie-analysis,
.word-frequency-section {
  flex: 1; /* 让两部分平分右侧区域的高度 */
  border: 1px dashed #ccc;
}

/* 图表容器：宽度和高度自动填充父容器 */
.chart-placeholder {
  width: 100%;
  height: 100%;
}

h3 {
  margin-bottom: 16px;
  font-size: 18px;
  font-weight: bold;
}

.big-title {
  font-size: 36px;
  cursor: pointer;
  margin-bottom: 0;
  padding: 0;
}

.aero-div {
  border-radius: 8px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}
</style>