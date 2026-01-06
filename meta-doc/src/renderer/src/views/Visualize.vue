<template>
  <div class="visualize-page">
  <WordCloudDetail
    v-if="showTitleMenu"
    :word="current_word"
    :frequency="current_frequency"
    :position="menuPosition"
    :document-content="rawDocumentContent"
    :adapter="currentAdapter || undefined"
    @close="handleTitleMenuClose"
    style="max-width: 300px;"
  />
  <el-scrollbar>
    <div class="visualize-container">
      <!-- 左侧：文章大纲和字数统计 -->
      <div class="left-section">
        <div class="outline-section aero-div">
          <h3>{{ $t('visualize.articleOutline') }}</h3>
          <el-scrollbar style="max-height:300px;overflow: auto;">
            <div
              id="outline-graph"
              :style="{
                color: themeState.currentTheme.textColor
              }"
            ></div>
          </el-scrollbar>
        </div>

        <div class="word-count-section aero-div">
          <h3>{{ $t('visualize.wordCount') }}</h3>
          <el-scrollbar>
            <div class="word-count-placeholder">
              <div
                id="word-count-diagram"
                style="width: 100%; height: 300%;overflow: auto;"
                :style="{
                  color: themeState.currentTheme.textColor
                }"
              ></div>
            </div>
          </el-scrollbar>
        </div>
      </div>

      <!-- 中间：词云图 -->
      <div class="wordcloud-section aero-div" style="padding: 0;overflow: auto;">
        <h1
          class="big-title interactive-text"
          @click="generateWordCloud"
          :style="{
            color: themeState.currentTheme.textColor
          }"
        >
          {{ $t('visualize.wordCloud') }}
        </h1>
        <div id="wordcloud-3d" class="wordcloud-canvas"></div>
      </div>

      <!-- 右侧：段落分布和词频统计 -->
      <div class="right-section">
        <div class="pie-analysis aero-div" style="height: 400px;">
          <h3>{{ $t('visualize.paragraphDistribution') }}</h3>
          <el-scrollbar style="overflow: auto;">
            <div id="pie" class="chart-placeholder" style="width: 100%; height: 400px;"></div>
          </el-scrollbar>
        </div>

        <div class="word-frequency-section aero-div">
          <h3>{{ $t('visualize.wordFrequency') }}</h3>
          <div class="word-frequency">
            <div id="word-frequency-diagram" style="width: 100%; height: 300%;overflow: auto;"></div>
          </div>
        </div>
      </div>
    </div>
  </el-scrollbar>
</div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

// @ts-ignore - d3-cloud没有类型定义
import cloud from 'd3-cloud';
// @ts-ignore - d3类型定义可能不完整
import * as d3 from 'd3';
import { generatePieFromData, generateWordCountBarChart, generateWordFrequencyTrendChart, ConvertMarkdownToHtmlVditor, outlineToMindMap } from '../utils/md-utils';
import { createVisualizeAdapter, type VisualizeAdapter } from '../utils/visualize-adapters';
// @ts-ignore - lodash.debounce没有类型定义
import debounce from 'lodash.debounce';
import type { DocumentOutlineNode } from '../../../types';
onMounted(async () => {
    //await initVditor();
    //await refreshAll();
    await refreshAll();
});


import * as echarts from 'echarts';
import eventBus from '../utils/event-bus';
import { themeState } from '../utils/themes';
import WordCloudDetail from '../components/WordCloudDetail.vue';
import { getSetting } from '../utils/settings';
import localIpcRenderer from '../utils/web-adapter/local-ipc-renderer';
import { webMainCalls } from '../utils/web-adapter/web-main-calls';
import { useWorkspace } from '../stores/workspace';
import { ElMessageBox } from 'element-plus';
import { useI18n } from 'vue-i18n';

let ipcRenderer: any = null;
if (window && (window as any).electron) {
  ipcRenderer = (window as any).electron.ipcRenderer;
} else {
  webMainCalls();
  ipcRenderer = localIpcRenderer;
  //todo 说明当前环境不是electron环境，需要另外适配
}



interface WordCountItem {
  text: string;
  size: number;
}

const words = ref<string[]>([]);
const wordCount = ref<WordCountItem[]>([]);
const showTitleMenu = ref(false);
// 关闭标题菜单
const handleTitleMenuClose = () => {
    showTitleMenu.value = false;
};
const menuPosition = ref({ top: 0, left: 0 });
const current_word = ref('');
const current_frequency = ref(0);
const { t } = useI18n();
const workspace = useWorkspace();
const {
  tabs,
  activeTabId,
  activeDocument,
  activateTab,
  removeTab,
} = workspace;

// 获取当前文档的适配器
const currentAdapter = computed<VisualizeAdapter | null>(() => {
  const doc = activeDocument.value;
  if (!doc) return null;
  const format = doc.format === 'tex' ? 'latex' : 'markdown';
  return createVisualizeAdapter(format);
});

// 获取原始文档内容
const rawDocumentContent = computed(() => {
  const doc = activeDocument.value;
  if (!doc) return '';
  if (doc.format === 'tex') {
    return doc.tex ?? '';
  }
  return doc.markdown ?? '';
});

const documentTitle = computed(() => {
  const doc = activeDocument.value;
  if (!doc) return '未命名文档';
  const metaTitle = doc.meta?.title?.trim();
  if (metaTitle) return metaTitle;
  const segments = (doc.path || '').split(/[/\\]+/).filter(Boolean);
  return segments[segments.length - 1] || '未命名文档';
});


// const initVditor = async () => {
//     Vditor = await ipcRenderer.invoke('get-vditor');
// };
const refreshAll = async () => {
  if (!activeDocument.value) {
    article_text.value = '';
    wordCount.value = [];
    words.value = [];
    return;
  }
  await processWords();
  await generateWordCloud();
  await generateOutlineGraph();
  await generateWordFrequencyDiagram();
  await generateWordCountDiagram();
  await generatePie();
};

eventBus.on('refresh', refreshAll);

const scheduleRefresh = debounce(() => {
  refreshAll();
}, 300);

watch(
  () => activeTabId.value,
  () => {
    scheduleRefresh();
  },
);

watch(
  activeDocument,
  (doc) => {
    if (!doc) {
      article_text.value = '';
      wordCount.value = [];
      words.value = [];
      scheduleRefresh.cancel();
      return;
    }
    scheduleRefresh();
  },
  { deep: true },
);

onBeforeUnmount(() => {
  scheduleRefresh.cancel();
  eventBus.off('refresh', refreshAll);
});
const generatePie = async () => {
  const node = document.getElementById('pie');
  if (!node) return;

  const adapter = currentAdapter.value;
  if (!adapter || !rawDocumentContent.value?.trim()) {
    return;
  }

  let outline = adapter.extractOutline(rawDocumentContent.value);
  if (!outline || !outline.children?.length) {
    return;
  }

  if (outline.children.length === 1) {
    outline = outline.children[0];
  }

  interface PieDataItem {
    value: number;
    label: string;
  }

  const data: PieDataItem[] = [];

  const dfs = (treeNode: DocumentOutlineNode): number => {
    let cnt = (treeNode.title?.length ?? 0) + (treeNode.text?.length ?? 0);
    for (let i = 0; i < (treeNode.children?.length ?? 0); i++) {
      cnt += dfs(treeNode.children[i]);
    }
    return cnt;
  };

  const collect = (treeNode: DocumentOutlineNode) => {
    const label = treeNode.title || '段落';
    const baseValue = (treeNode.text?.length ?? 0) + (treeNode.title?.length ?? 0);
    data.push({ value: baseValue + dfs(treeNode), label });
  };

  for (let i = 0; i < (outline.children?.length ?? 0); i++) {
    collect(outline.children[i]);
  }

  if (!data.length) return;

  const config = generatePieFromData(data, documentTitle.value);
  // 先销毁已存在的图表实例
  const existingChart = echarts.getInstanceByDom(node);
  if (existingChart) {
    existingChart.dispose();
  }
  const chart = echarts.init(node);
  chart.setOption(config);
};

const generateWordCountDiagram = async () => {
  const node = document.getElementById('word-count-diagram');
  if (!node) return;
  if (!article_text.value?.trim()) {
    return;
  }
  const config = generateWordCountBarChart(article_text.value);
  const chart = echarts.init(node);
  chart.setOption(config);
};

const generateWordFrequencyDiagram = async () => {
  const node = document.getElementById('word-frequency-diagram');
  if (!node) return;
  if (!wordCount.value.length || !article_text.value?.trim()) {
    return;
  }
  const top5words = wordCount.value.slice(0, 5).map((item) => item.text);
  if (!top5words.length) return;
  const config = generateWordFrequencyTrendChart(article_text.value, top5words);
  const chart = echarts.init(node);
  chart.setOption(config);
};

const generateOutlineGraph = async () => {
  const node = document.getElementById('outline-graph');
  if (!node) return;

  const doc = activeDocument.value;
  const adapter = currentAdapter.value;
  if (!doc || !adapter) {
    return;
  }

  let tree: DocumentOutlineNode | null = doc.outline || null;
  if (!tree || !tree.children?.length) {
    tree = adapter.extractOutline(rawDocumentContent.value);
  }
  if (!tree) {
    return;
  }

  const md = outlineToMindMap(tree);
  const html = await ConvertMarkdownToHtmlVditor(md);
  node.innerHTML = html;
  const lis = node.getElementsByTagName('li');
  for (let i = 0; i < lis.length; i++) {
    if (lis[i].getElementsByTagName('ul').length > 0) continue;
    lis[i].style.cursor = 'pointer';
    lis[i].addEventListener('mouseover', () => {
      (lis[i].style as any).scale = '1.05';
    });
    lis[i].addEventListener('mouseout', () => {
      (lis[i].style as any).scale = '1';
    });
  }
};
const article_text = ref('');
const processWords = async () => {
  const doc = activeDocument.value;
  const adapter = currentAdapter.value;
  if (!doc || !adapter) {
    article_text.value = '';
    wordCount.value = [];
    words.value = [];
    return;
  }

  const bypassCodeBlock = await getSetting('bypassCodeBlock');
  // 使用适配器提取纯文本
  const text = adapter.extractPlainText(rawDocumentContent.value, bypassCodeBlock);
  article_text.value = text;

  if (!text.trim()) {
    wordCount.value = [];
    words.value = [];
    return;
  }

  try {
    if (!ipcRenderer || typeof ipcRenderer.invoke !== 'function') {
      wordCount.value = [];
      words.value = [];
      return;
    }

    const rawWords: string[] = (await ipcRenderer.invoke('cut-words', { text })) || [];
    words.value = rawWords;

    const counts: Record<string, number> = Object.create(null);
    rawWords.forEach((word: string) => {
      if (!word) return;
      counts[word] = (counts[word] || 0) + 1;
    });

    const symbols = "~!@#$%^&*()_+`-={}|[]\\:\";'<>?,./。、，；：''\"\"【】《》？！￥…（）—0123456789";
    const entries = Object.entries(counts).filter(([key, value]: [string, number]) => {
      if (symbols.includes(key)) return false;
      if (value < 2) return false;
      if (key.length < 2 || key.length > 10) return false;
      return true;
    });

    const sorted: WordCountItem[] = entries
      .map(([key, size]: [string, number]) => ({ text: key, size }))
      .sort((a: WordCountItem, b: WordCountItem) => b.size - a.size);

    wordCount.value = sorted.slice(0, Math.min(30, sorted.length));
  } catch (error) {
    console.error('[Visualize] cut-words failed:', error);
    wordCount.value = [];
    words.value = [];
  }
};
const generateWordCloud = async () => {
  const container = d3.select('#wordcloud-3d');
  container.selectAll('svg').remove();

  if (!wordCount.value.length) {
    return;
  }

  const maxFreq = wordCount.value.reduce((max: number, cur: WordCountItem) => Math.max(max, cur.size), 0);
  if (maxFreq <= 0) {
    return;
  }

  const layout = cloud()
    .size([600, 600])
    .words(
      wordCount.value.map((d) => ({
        text: d.text,
        size: d.size,
      })),
    )
    .font('Impact')
    .fontSize((d: any) => Math.min((d.size * 120) / maxFreq + 10, 100))
    .rotate(
      (d: any) =>
        Math.random() > 0.5 || d.text === wordCount.value[0]?.text
          ? 0
          : 90 * (Math.random() > 0.5 ? 1 : -1),
    )
    .on('end', draw);

  layout.start();

  function draw(data: any[]) {
    const svg = container
      .append('svg')
      .attr('width', layout.size()[0])
      .attr('height', layout.size()[1])
      .append('g')
      .attr('transform', `translate(${layout.size()[0] / 2}, ${layout.size()[1] / 2})`);

    svg
      .selectAll('text')
      .data(data)
      .enter()
      .append('text')
      .style('font-family', 'Impact')
      .style('font-size', (d: any) => `${d.size}px`)
      .style('fill', () => d3.schemeCategory10[Math.floor(Math.random() * 10)] as string)
      .attr('class', 'wordcloud-text')
      .attr('text-anchor', 'middle')
      .style('padding', '10px')
      .attr('transform', (d: any) => `translate(${d.x}, ${d.y}) rotate(${d.rotate})`)
      .style('opacity', 0)
      .transition()
      .duration(1000)
      .style('opacity', 1)
      .text((d: any) => d.text);

    d3.selectAll('.wordcloud-text').on('click', (event: MouseEvent, d: any) => {
      current_word.value = d.text;
      current_frequency.value = d.size;
      showTitleMenu.value = false;
      menuPosition.value = {
        top: event.clientY,
        left: event.clientX,
      };
      showTitleMenu.value = true;
    });
  }
};

</script>

<style scoped>
.visualize-page {
    display: flex;
    flex-direction: column;
    height: 100%;
    /* 设置主题背景色 */
    background-color: v-bind('themeState.currentTheme.background');
}

.visualize-page :deep(.el-scrollbar) {
    flex: 1;
    display: flex;
    flex-direction: column;
}

.visualize-page :deep(.el-scrollbar__wrap) {
    flex: 1;
}

.visualize-container {
    display: grid;
    grid-template-columns: 30% 40% 30%;
    /* 左中右三列，宽度分别为30%, 40%, 30% */
    gap: 4px;
    height: 80vh;
    max-height: 80vh;
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
    flex: 1;
    /* 让两部分平分右侧区域的高度 */
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