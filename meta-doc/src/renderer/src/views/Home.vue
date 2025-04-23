<template>
  <div id="particle-bg" class="homepage">

    <div class="center-content" v-if="!quickStartDialogVisible">
      <h1 class="main-letter" @mouseover="highlightM" @mouseleave="resetM" v-if="current_file_path === ''">MetaDoc</h1>
      <div class="buttons aero-div" v-if="current_file_path === ''">

        <el-tooltip content="开始你的文档" placement="top">
          <el-button type="primary" @click="quickStart" class="aero-btn">快速开始</el-button>
        </el-tooltip>
        <el-tooltip content="打开文件" placement="top">
          <el-button type="success" @click="openFile" class="aero-btn">打开文件</el-button>
        </el-tooltip>


      </div>
      <div v-if="current_file_path !== ''" style="height: 100vh;">

        <el-scrollbar class="md-metainfo" min-size="10" >
          <h1 class="md-title" :style="{ color: themeState.currentTheme.textColor }">{{ current_article_meta_data.title }}
          </h1>
          <div class="md-author" :style="{ color: themeState.currentTheme.textColor }">
            <h3>作者：{{ current_article_meta_data.author }}</h3>
          </div>
          <div class="md-description" :style="{ color: themeState.currentTheme.textColor }">
            <h3>摘要</h3>{{ current_article_meta_data.description }}
          </div>
        </el-scrollbar>

        <el-scrollbar  class="md-container" >
          <MdPreview :modelValue="current_article"
            previewTheme="github"
            codeStyleReverse
            style="text-align: left;margin-top:20px"
            :style="{
              textColor: themeState.currentTheme.textColor,
            }"
            :class="themeState.currentTheme.mdeditorClass"
            :theme="themeState.currentTheme.mdeditorTheme"
            :codeFold="false"
            :autoFoldThreshold="300"
        />
        
          
        </el-scrollbar>

      </div>
    </div>
    <div class="center-content" v-if="quickStartDialogVisible">
      <h2 class="main-letter" @mouseover="highlightM" @mouseleave="resetM" style="font-size: 50px;">快速开始你的文档</h2>


      <div class="aero-div quick-start-container" :style="{
        color: themeState.currentTheme.textColor,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '70vw',
        background: tab === '文档信息' ? themeState.currentTheme.quickStartBackground1 : themeState.currentTheme.quickStartBackground2,

        transition: 'background 0.5s ease'
      }">
        <!-- 顶部关闭按钮 -->
        <div style="width: 100%; display: flex; justify-content: flex-start; margin-bottom: 10px;">
          <el-tooltip content="关闭" placement="top">
            <el-button @click="quickStartDialogVisible = false" class="aero-btn" round type="danger" size="small">
            </el-button>
          </el-tooltip>

        </div>

        <!-- 主内容区 -->
        <div style="display: flex; flex: 1; border-top: 1px dashed #ccc; padding-top: 10px;">
          <!-- Markdown 编辑器 -->
          <div
            style="width: 70%; padding-right: 10px; max-height: 75%; min-height: 200px; overflow:hidden; flex-grow: 1;">
            <el-scrollbar>
              <MarkdownItEditor :source="generatedText" class="md-container" @mousedown.stop
                style="width: 100%; box-shadow: none; height: 80%; overflow: auto;" />
            </el-scrollbar>

          </div>

          <!-- 分割线 -->
          <div style="width: 1px;  margin: 0 10px; height: auto; align-self: stretch;"></div>

          <!-- 表单区域 -->
          <div style="width: 30%;height: 100%;">
            <!-- <el-switch v-model="tab" class="ml-2"
              style="--el-switch-on-color: #6A5ACD; --el-switch-off-color: #6495ED; align-self: center;width: 100%;"
              active-text="AI助手" inactive-text="文档信息" /> -->
            <div class="tab-switch">
              <el-segmented v-model="tab" :options="['AI助手', '文档信息']" />
            </div>
            <div
              style=" display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 10px;height: 47vh;"
              class="aero-div" v-if="tab === '文档信息'">
              <label
                style="width: 100%; text-align: center; align-self: center; font-weight: bold; margin-bottom: 10px;"
                :style="{ color: themeState.currentTheme.textColor }" class="interactive-text">文档信息</label>
              <div style="display: flex; align-items: center; margin-bottom: 16px">
                <label style="width: 60px; text-align: left; margin-right: 8px">标题</label>
                <el-input v-model="current_article_meta_data.title" style="flex: 1;width: 200px;"
                  placeholder="请输入文章标题" />
              </div>
              <div style="display: flex; align-items: center; margin-bottom: 16px">
                <label style="width: 60px; text-align: left; margin-right: 8px">作者</label>
                <el-input v-model="current_article_meta_data.author" style="flex: 1;width: 200px;"
                  placeholder="请输入作者" />
              </div>
              <div style="display: flex; align-items: center; margin-bottom: 16px">
                <label style="width: 60px; text-align: left; margin-right: 8px">摘要</label>
                <el-input v-model="current_article_meta_data.description" type="textarea" style="width: 200px;"
                  placeholder="请输入文章摘要" :autosize="{ minRows: 2, maxRows: 3 }" />

              </div>
              <div style="display: flex; align-items: center; margin-bottom: 16px">
                <el-tooltip content="准备就绪！" placement="top">
                  <el-button circle type="success" @click="allSet"><el-icon>
                      <Check />
                    </el-icon></el-button>
                </el-tooltip>

              </div>
              <!-- <div style="display: flex; align-items: flex-start; margin-bottom: 16px">
                <label style="width: 60px; text-align: left; margin-right: 8px; ">摘要</label>
                <div style="flex: 1">
                  <div style="display: flex; align-items: center; margin-bottom: 8px">
                    <el-switch v-model="autoDescription" class="ml-2"
                      style="--el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949" active-text="自动"
                      inactive-text="手动" />
                  </div>

                </div>
              </div> -->
            </div>
            <div class="aero-div"
              style=" display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 10px; height: 47vh;"
              v-if="tab === 'AI助手'">
              <label
                style="width: 100%; text-align: center; align-self: center; font-weight: bold; margin-bottom: 10px;"
                :style="{ color: themeState.currentTheme.textColor }" class="interactive-text">AI助手</label>
              <el-tooltip content="选择AI温度" placement="left">
                <el-slider v-model="temperature" :marks="marks" :min="0" :max="100"
                  style="margin-bottom: 20px; width: 80%; " :disabled="generated || generating" />
              </el-tooltip>


              <el-tooltip content="选择文章情感" placement="left">
                <el-segmented v-model="mood" style="margin-bottom: 25px; background: rgba(255, 255, 255, 0.3)"
                  :options="moodOptions" :disabled="generated || generating">
                  <template #default="{ item }">
                    <div class="flex flex-col items-center gap-2 p-2" style="height: 60px; margin-top: 20px;">
                      <el-icon :size="12">
                        <component :is="item.icon" />
                      </el-icon>
                      <div>{{ item.label }}</div>
                    </div>
                  </template>
                </el-segmented>
              </el-tooltip>
              <el-tooltip content="输入提示词" placement="left">
                <el-autocomplete v-model="userPrompt" :fetch-suggestions="querySearch" clearable
                  class="inline-input aero-input" style=" opacity: 0.8;" placeholder="在此处输入文章要求" @mousedown.stop
                  type="textarea" :autosize="{ minRows: 3, maxRows: 3 }" resize='none'
                  :disabled="generated || generating">

                </el-autocomplete>


              </el-tooltip>

              <VoiceInput @onSpeechRecognized="onSpeechRecognized" :disabled="generated || generating" />
              <div class="aero-div" style="
      height: 150px;
      width: 80%;
      margin: 10px auto;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      align-items: center;
      position: relative;
      background-color: rgba(255, 255, 255, 0.3);
      box-shadow: none;
    ">
                <!-- 顶部建议标签 -->
                <label class="interactive-text" style="
        text-align: center;
        font-weight: bold;
        position: absolute;
        top: 0;
        left: 50%;
        transform: translateX(-50%);
      " :style="{ color: themeState.currentTheme.textColor }">
                  建议
                </label>
                <div style="position: relative; height: 60px; width: 100%;" id="suggestion-buttons">
                  <div style="
        display: grid;
        grid-template-columns: repeat(2, 1fr); /* 每行2个按钮 */
        gap: 10px; /* 按钮之间的间距 */
        justify-items: center; /* 水平居中 */
        align-items: center; /* 垂直居中 */
        height: 100%;
      ">
                    <el-button v-for="(button, index) in buttons" :key="index" size="small"
                      @click="handleAcceptSuggestion(button.prompt)" class="aero-btn"
                      :disabled="generating || generated">
                      {{ button.label }}
                    </el-button>
                  </div>
                </div>

                <!-- 底部刷新按钮 -->
                <el-button size="small" type="primary" :disabled="generating || generated"
                  style="position: absolute; bottom: 3px; left: 50%; transform: translateX(-50%);opacity: 0.8;"
                  @click="refreshButtons" class="aero-btn">
                  <el-icon>
                    <Refresh />
                  </el-icon>
                  刷新
                </el-button>
              </div>
              <div @mousedown.stop>
                <el-tooltip content="生成文章" placement="top">
                  <el-button circle type="primary" @click="generate"
                    :disabled="generated || generating || userPrompt.length === 0"><el-icon>
                      <Promotion />
                    </el-icon></el-button>
                </el-tooltip>
                <el-tooltip content="重置" placement="top">
                  <el-button circle type="info" @click="reset" v-if="generated"><el-icon>
                      <RefreshLeft />
                    </el-icon></el-button>
                </el-tooltip>
                <el-tooltip content="接受" placement="top">
                  <el-button circle type="success" @click="accept" v-if="generated"><el-icon>
                      <Check />
                    </el-icon></el-button>
                </el-tooltip>

              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  </div>

</template>

<script setup>
import VoiceInput from '../components/VoiceInput.vue';
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { ElButton } from 'element-plus';
import * as THREE from 'three';
import "../assets/aero-div.css";
import "../assets/aero-btn.css";
import "../assets/aero-input.css";
import { current_article, current_article_meta_data, current_file_path, firstLoad, latest_view, sync } from '../utils/common-data';
import eventBus from '../utils/event-bus';
import MarkdownItEditor from 'vue3-markdown-it';
import {
  DataAnalysis,
  Drizzling,
  Lightning,
  MoonNight,
  Mug,
  Sugar,
  SuitcaseLine,
  Warning
} from "@element-plus/icons-vue";
import { generateArticlePrompt } from '../utils/prompts';
import { answerQuestionStream } from '../utils/llm-api';
import router from "../router/router";
import { suggestionPresets } from '../utils/prompts';
// 随机生成的按钮文本数组
const buttons = ref({});

const onSpeechRecognized = (text) => {
  userPrompt.value = text;
}
function generateRandomButtons() {
  const randomCount = 6;
  const randomButtons = [];
  const usedIndices = new Set();

  while (randomButtons.length < randomCount) {
    const randomIndex = Math.floor(Math.random() * suggestionPresets.length);
    if (!usedIndices.has(randomIndex)) {
      randomButtons.push({
        ...suggestionPresets[randomIndex]
      });
      usedIndices.add(randomIndex);
    }
  }
  return randomButtons;
}
const applyTheme = async () => {
  eventBus.emit('theme-changed')
}
onMounted(() => {
  refreshButtons();
  openRecentDoc();
  applyTheme();
});

eventBus.on('reset-quickstart', () => {
  reset();
});
const openRecentDoc = async () => {

  const enabled = (await getSetting('startupOption')) === 'lastFile'
  if (enabled) {
    const recentDocs = await getRecentDocs()

    if (recentDocs.length > 0
      && firstLoad.value

    ) {
      eventBus.emit('open-doc', recentDocs[0])
      firstLoad.value = false
    }
  }
}

// 刷新按钮内容
function refreshButtons() {
  buttons.value = generateRandomButtons();
}

// 按钮点击事件
function handleAcceptSuggestion(prompt) {
  userPrompt.value = prompt;
}

const mood = ref('平和');
const moodOptions = [
  {
    label: '高兴',
    value: '高兴',
    icon: Sugar
  },
  {
    label: '抒情',
    value: '抒情',
    icon: MoonNight
  },
  {
    label: '平和',
    value: '平和',
    icon: Mug
  },
  {
    label: '学术',
    value: '学术',
    icon: DataAnalysis
  },
  {
    label: '商业',
    value: '商业',
    icon: SuitcaseLine
  },
  {
    label: '悲伤',
    value: '悲伤',
    icon: Drizzling
  },
];


// 定义响应式变量
const mouseX = ref(0);
const mouseY = ref(0);

// 定义Three.js对象
let scene, camera, renderer, particles;
const temperature = ref(50);
const marks = ref({
  0: '严谨',
  100: '创意',
  50: {
    style: {
      color: '#1989FA',
    },
    label: '平衡',
  },
});
const accept = () => {
  //searchNode(props.path, current_outline_tree.value).text=generatedText.value;
  // latest_view.value='outline';
  // sync();
  //如果最后一位不是换行符，加上换行符
  if (generatedText.value[generatedText.value.length - 1] !== '\n') {
    generatedText.value += '\n';
  }

  current_article.value = generatedText.value;
  latest_view.value = 'article';
  sync();
  //emit('accept', generatedText.value);
  //跳转到文章编辑界面
  tab.value = '文档信息';

}
const allSet = () => {
  eventBus.emit('nav-to', '/article');
}
const tab = ref('AI助手');
const generate = async () => {
  generating.value = true;

  const prompt = generateArticlePrompt(mood.value, userPrompt.value);
  //console.log(prompt)
  await answerQuestionStream(prompt, generatedText, { temperature: temperature.value / 100.0 });
  generating.value = false;

  generated.value = true;
}
const querySearch = (queryString, cb) => {
  const createFilter = (queryString) => {
    return (preset) => {
      //模糊匹配，只要包含就行
      return preset.value.toLowerCase().includes(queryString.toLowerCase())
    }
  }
  //console.log(queryString)
  const results = queryString
    ? presets.filter(createFilter(queryString))
    : presets
  // call callback function to return suggestions
  cb(results)
}
const reset = () => {
  generated.value = false;
  generatedText.value = current_article.value ? current_article.value : defaultText;
}
const generating = ref(false);
const userPrompt = ref('');
const defaultText = '# 欢迎使用MetaDoc\n\n这是一个基于人工智能的文档编辑器，可以帮助您快速生成文档内容。';
const generatedText = ref(current_article.value ? current_article.value : defaultText);
const generated = ref(false);
const presets = [
  { "value": "我想生成一篇学术报告" },
  { "value": "我想生成一篇议论文" },
  { "value": "我想生成一篇菜谱" },
  { "value": "我想生成一篇旅游攻略" },
  { "value": "我想生成一篇关于人工智能的分析文章" },
  { "value": "我想生成一篇读书笔记" },
  { "value": "我想生成一篇商业计划书" },
  { "value": "我想生成一篇求职信" },
  { "value": "我想生成一篇科技新闻" },
  { "value": "我想生成一篇个人成长故事" },
  { "value": "我想生成一篇产品使用手册" },
  { "value": "我想生成一篇历史人物传记" },
  { "value": "我想生成一篇社会现象分析" },
  { "value": "我想生成一篇关于健康饮食的文章" },
  { "value": "我想生成一篇电影观后感" },
  { "value": "我想生成一篇课堂演讲稿" },
  { "value": "我想生成一篇创意短篇小说" },
  { "value": "我想生成一篇科技项目可行性报告" },
  { "value": "我想生成一篇电子产品评测文章" },
  { "value": "我想生成一篇工作总结" },
  { "value": "我想生成一篇科技博客文章" },
  { "value": "我想生成一篇经济学研究报告" },
  { "value": "我想生成一篇心理学分析文章" },
  { "value": "我想生成一篇关于宇宙探索的科普文章" },
  { "value": "我想生成一篇节日庆祝活动方案" },
  { "value": "我想生成一篇关于环保的倡议书" },
  { "value": "我想生成一篇团队建设活动策划书" },
  { "value": "我想生成一篇编程语言学习指南" },
  { "value": "我想生成一篇AI技术应用案例分析" },
  { "value": "我想生成一篇时事评论文章" },
  { "value": "我想生成一篇古诗词鉴赏" },
  { "value": "我想生成一篇教育教学方法的探讨" },
  { "value": "我想生成一篇运动健身计划" },
  { "value": "我想生成一篇关于气候变化的研究报告" },
  { "value": "我想生成一篇品牌营销策略" },
  { "value": "我想生成一篇科技趋势预测" },
  { "value": "我想生成一篇网络安全指南" },
  { "value": "我想生成一篇摄影技巧教程" },
  { "value": "我想生成一篇宠物护理指南" },
  { "value": "我想生成一篇关于职场沟通的建议" },
  { "value": "我想生成一篇书籍推荐列表" },
  { "value": "我想生成一篇文化差异的探讨文章" },
  { "value": "我想生成一篇关于区块链技术的入门教程" },
  { "value": "我想生成一篇关于开源项目的介绍文章" },
  { "value": "我想生成一篇社会公益活动方案" },
  { "value": "我想生成一篇城市交通优化建议" },
  { "value": "我想生成一篇关于未来职业发展的趋势分析" },
  { "value": "我想生成一篇关于人类行为的哲学探讨" },
  { "value": "我想生成一篇大数据技术白皮书" },
  { "value": "我想生成一篇旅游城市的历史文化介绍" },
  { "value": "我想生成一篇电影剧本大纲" },
  { "value": "我想生成一篇短篇科幻小说" },
  { "value": "我想生成一篇机器人设计的技术文档" },
  { "value": "我想生成一篇关于心理健康的科普文章" },
  { "value": "我想生成一篇投资理财建议" },
  { "value": "我想生成一篇对传统工艺的传承与创新分析" },
  { "value": "我想生成一篇关于网络舆论的深度分析" },
  { "value": "我想生成一篇音乐艺术的赏析文章" },
  { "value": "我想生成一篇关于未来科技发展的展望" },
  { "value": "我想生成一篇职业生涯规划书" },
  { "value": "我想生成一篇农业科技发展的调研报告" },
  { "value": "我想生成一篇创业计划书" },
  { "value": "我想生成一篇关于心理学实验的论文" },
  { "value": "我想生成一篇节能减排的行动计划" },
  { "value": "我想生成一篇高效学习方法的分享文章" },
  { "value": "我想生成一篇生活小妙招合集" },
  { "value": "我想生成一篇关于未来智能家居的畅想" },
  { "value": "我想生成一篇关于区块链在金融行业应用的案例研究" },
  { "value": "我想生成一篇关于元宇宙的科技文章" },
  { "value": "我想生成一篇健康与运动的科学建议" },
  { "value": "我想生成一篇关于人工智能伦理的讨论文章" },
  { "value": "我想生成一篇关于未来城市规划的设想" },
  { "value": "我想生成一篇关于人类历史的探讨文章" },
  { "value": "我想生成一篇关于未来教育的设想" },
  { "value": "我想生成一篇关于未来医疗技术的展望" },
  { "value": "我想生成一篇关于未来交通的设想" },
  { "value": "我想生成一篇关于未来食品科技的展望" },
  { "value": "我想生成一篇关于未来能源的展望" },
  { "value": "我想生成一篇关于未来环境保护的设想" },
  { "value": "我想生成一篇关于未来社会治理的设想" },
  { "value": "我想生成一篇关于未来国际关系的设想" },
  { "value": "我想生成一篇关于未来军事技术的展望" },
  { "value": "我想生成一篇关于未来航天科技的展望" },
  { "value": "我想生成一篇关于未来生物科技的展望" },
  { "value": "我想生成一篇关于未来人工智能的展望" },
  { "value": "我想生成一篇关于未来机器人技术的展望" },
  { "value": "我想生成一篇关于未来物联网技术的展望" },
  { "value": "我想生成一篇关于未来大数据技术的展望" },
  { "value": "我想生成一篇关于未来区块链技术的展望" },
  { "value": "我想生成一篇关于未来虚拟现实技术的展望" },

];
// const autoDescription = ref(true);
// 初始化Three.js场景

const initThreeJS = () => {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 2000);
  camera.position.z = 800;

  // 设置渲染器
  renderer = new THREE.WebGLRenderer({ alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.domElement.style.position = 'absolute';
  renderer.domElement.style.top = '0';
  renderer.domElement.style.left = '0';
  renderer.domElement.style.zIndex = '-1'; // 置于底层
  //渐变transition
  renderer.domElement.style.transition = 'filter 1.5s ease';
  document.getElementById('particle-bg').appendChild(renderer.domElement);



  const particleCount = 100;
  const particlesGeometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);

  for (let i = 0; i < particleCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 1500;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 1500;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 1500;

    colors[i * 3] = Math.random();
    colors[i * 3 + 1] = Math.random();
    colors[i * 3 + 2] = Math.random();
  }

  particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particlesGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 50 + Math.random() * 20,
    vertexColors: true,
    transparent: true,
    opacity: 0.7,
  });

  particles = new THREE.Points(particlesGeometry, material);
  scene.add(particles);
};

// 动画循环
const animate = () => {
  requestAnimationFrame(animate);

  // 让粒子微微旋转，制造动态效果
  particles.rotation.x += 0.0005;
  particles.rotation.y += 0.0005;

  // 根据鼠标位置调整粒子旋转
  particles.rotation.x += (mouseY.value / window.innerHeight) * 0.05;
  particles.rotation.y += (mouseX.value / window.innerWidth) * 0.05;

  //模糊度
  renderer.domElement.style.filter = `blur(${(quickStartDialogVisible.value == true || current_file_path.value !== '') ? 10 : 0}px)`;
  renderer.render(scene, camera);
};

// 鼠标移动事件
const onMouseMove = (event) => {
  mouseX.value = (event.clientX - window.innerWidth / 2) * 0.1;
  mouseY.value = (event.clientY - window.innerHeight / 2) * 0.1;
};

// 窗口大小调整事件
const onWindowResize = () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
};



const quickStartDialogVisible = ref(false);
// 快速开始按钮逻辑
const quickStart = () => {
  // 快速开始逻辑
  quickStartDialogVisible.value = true;
  refreshButtons();
};

// 打开文件按钮逻辑
const openFile = () => {
  eventBus.emit('open-doc');
};

// 高亮 "M" 的方法
const highlightM = () => {
  document.querySelector('.main-letter').style.color = 'rgb(50, 150, 250)';
};

// 重置 "M" 的方法
const resetM = () => {
  document.querySelector('.main-letter').style.color = 'rgb(65,105,225)';
};

import Vditor from 'vditor';
import { md2html } from '../utils/md-utils';
import { getRecentDocs, getSetting, setSetting } from '../utils/settings';
import { lightTheme, themeState } from '../utils/themes';
import { MdPreview } from 'md-editor-v3';
const ipcRenderer = window.electron.ipcRenderer
// 生命周期钩子
const preventNavigate = (event) => {
  document.addEventListener('click', (event) => {
  const target = event.target.closest('a');
  if (target && target.href && target.target !== '_blank') {
    event.preventDefault(); // 阻止默认跳转行为

    // 判断是否是 http(s) 链接
    const url = target.href;
    if (url.startsWith('http')) {
      eventBus.emit('open-link', url); // 发送事件，打开链接
    }
  }
});
};
onMounted(async () => {
  initThreeJS();
  animate(); // 开始动画循环
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('resize', onWindowResize); // 添加窗口大小变化事件
  preventNavigate(); // 添加链接点击事件


});
// const renderMarkdown = async () => {
//   let node = document.getElementsByClassName('md-preview')[0];
//   console.log(node);
//   generatedText.value = current_article.value ? current_article.value : defaultText;
//   let html=md2html(generatedText.value);
//   node.innerHTML = html;

//   const previewElement = node;
//     Vditor.setContentTheme('light', 'http://localhost:3000/vditor/dist/css/content-theme');
//     Vditor.codeRender(previewElement);
//     Vditor.highlightRender({"enable":true,"lineNumber":false,"defaultLang":"","style":"github"}, previewElement, 'http://localhost:3000/vditor');
//     Vditor.mathRender(previewElement, {
//         cdn: 'http://localhost:3000/vditor',
//         math: {"engine":"KaTeX","inlineDigit":false,"macros":{}},
//     });
//     Vditor.mermaidRender(previewElement, 'http://localhost:3000/vditor', 'classic');
//     Vditor.SMILESRender(previewElement, 'http://localhost:3000/vditor', 'classic');
//     Vditor.markmapRender(previewElement, 'http://localhost:3000/vditor');
//     Vditor.flowchartRender(previewElement, 'http://localhost:3000/vditor');
//     Vditor.graphvizRender(previewElement, 'http://localhost:3000/vditor');
//     Vditor.chartRender(previewElement, 'http://localhost:3000/vditor', 'classic');
//     Vditor.mindmapRender(previewElement, 'http://localhost:3000/vditor', 'classic');
//     Vditor.abcRender(previewElement, 'http://localhost:3000/vditor');
//     Vditor.mediaRender(previewElement);
//     Vditor.speechRender(previewElement);

// };
onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('resize', onWindowResize);
  if (renderer) renderer.dispose();
});
</script>

<style scoped>
.md-metainfo {
  width: 80vw;
  max-height: 25vh;
  height: fit-content;
  overflow: auto;
  margin-bottom: 20px;
}

.md-container {
  align-items: center;
  justify-content: center;
  align-self: center;
  
  max-height: 63vh;
  overflow: auto;
  width: 80vw;
  border: 1px #cccccc44 solid;
  border-radius: 10px;
}

.homepage {
  width: 100vw;
  height: 100vh;
  z-index: 1;
  overflow: hidden;
  position: relative;

}

.quick-start-container {
  width: 60vw;
  height: 60vh;
  max-height: 60vh;
  overflow: hidden;
  border: 1px solid #393939;
  /*竖排排列 */
  flex-direction: column;
  backdrop-filter: blur(20px) brightness(1.05);
  /*圆角边框 */
  border-radius: 10px;
}

.center-content {
  display: flex;
  flex-direction: column;
  /* 垂直排列 */
  align-items: center;
  /* 水平居中 */
  /* justify-content: center; 垂直居中 */
  height: 100vh;
  /* 占满整个视口高度 */
}

.main-letter {

  font-size: 70px;
  font-weight: bold;
  color: rgb(65, 105, 225);
  transition: color 0.3s ease;
  background-color: rgba(0, 0, 0, 0);
  cursor: pointer;
}

.buttons {
  margin-top: 20px;
  width: fit-content;
  margin: 50px;
  padding: 30px;
  align-items: center;
  justify-content: center;
  align-self: center;
}

.buttons .el-button {
  margin: 0 10px;
}

.tab-switch {
  --el-segmented-item-selected-color: var(--el-text-color-primary);
  --el-segmented-item-selected-bg-color: #2243fd;
  --el-border-radius-base: 16px;
  opacity: 0.8;
  margin-bottom: 10px;
}
</style>
