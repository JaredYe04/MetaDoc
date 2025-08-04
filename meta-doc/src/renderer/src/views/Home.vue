<template>
  <div id="particle-bg" class="homepage">

    <div class="center-content" v-if="!quickStartDialogVisible">
      <h1 class="main-letter" @mouseover="highlightM" @mouseleave="resetM" v-if="current_file_path === ''">{{
        $t('home.metaDoc') }}</h1>
      <div class="buttons aero-div" v-if="current_file_path === ''">

        <el-tooltip :content="$t('home.tooltip.quickStart')" placement="top">
          <el-button type="primary" @click="quickStart" class="aero-btn">{{ $t('home.button.quickStart') }}</el-button>
        </el-tooltip>
        <el-tooltip :content="$t('home.tooltip.openFile')" placement="top">
          <el-button type="success" @click="openFile" class="aero-btn">{{ $t('home.button.openFile') }}</el-button>
        </el-tooltip>

      </div>
      <div v-if="current_file_path !== ''" style="height: 100vh;">

        <el-scrollbar class="md-metainfo" min-size="10">
          <h1 class="md-title" :style="{ color: themeState.currentTheme.textColor }">{{ current_article_meta_data.title
          }}
          </h1>
          <div class="md-author" :style="{ color: themeState.currentTheme.textColor }">
            <h3>{{ $t('home.authorLabel') }}：{{ current_article_meta_data.author }}</h3>
          </div>
          <div class="md-description" :style="{ color: themeState.currentTheme.textColor }">
            <h3>{{ $t('home.abstractLabel') }}</h3>{{ current_article_meta_data.description }}
          </div>
        </el-scrollbar>

        <el-scrollbar class="md-container">
          <MdPreview :modelValue="current_article" previewTheme="github" codeStyleReverse
            style="text-align: left;margin-top:20px" :style="{
              textColor: themeState.currentTheme.textColor,
            }" :class="themeState.currentTheme.mdeditorClass" :theme="themeState.currentTheme.mdeditorTheme"
            :codeFold="false" :autoFoldThreshold="300" />
        </el-scrollbar>

      </div>
    </div>
    <div class="center-content" v-if="quickStartDialogVisible">
      <h2 class="main-letter" @mouseover="highlightM" @mouseleave="resetM" style="font-size: 50px;">{{
        $t('home.quickStartTitle') }}</h2>

      <div class="aero-div quick-start-container" :style="{
        color: themeState.currentTheme.textColor,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '70vw',
        background: tab === $t('home.tab.documentInfo') ? themeState.currentTheme.quickStartBackground1 : themeState.currentTheme.quickStartBackground2,
        transition: 'background 0.5s ease'
      }">
        <!-- 顶部关闭按钮 -->
        <div style="width: 100%; display: flex; justify-content: flex-start; margin-bottom: 10px;">
          <el-tooltip :content="$t('home.tooltip.close')" placement="top">
            <el-button @click="quickStartDialogVisible = false" class="aero-btn" round type="danger" size="small">
            </el-button>
          </el-tooltip>
        </div>

        <!-- 主内容区 -->
        <div style="display: flex; flex: 1; border-top: 1px dashed #ccc; padding-top: 10px;">
          <!-- Markdown 编辑器 -->
          <div style=" flex-grow: 1;">
            <el-scrollbar style="width: 100%; padding-right: 10px;" class="generated-md-container">
              <MarkdownItEditor :source="generatedText" @mousedown.stop style=" box-shadow: none;" />
            </el-scrollbar>
          </div>

          <!-- 分割线 -->
          <div style="width: 1px;  margin: 0 10px; height: auto; align-self: stretch;"></div>

          <!-- 表单区域 -->
          <div style="width: 30%;height: 100%;">
            <div class="tab-switch">
              <el-segmented v-model="tab" :options="[$t('home.tab.aiAssistant'), $t('home.tab.documentInfo')]" />
            </div>
            <div
              style=" display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 10px;height: 47vh;width: 18vw;"
              class="aero-div" v-if="tab === $t('home.tab.documentInfo')">
              <label
                style="width: 100%; text-align: center; align-self: center; font-weight: bold; margin-bottom: 10px;"
                :style="{ color: themeState.currentTheme.textColor }" class="interactive-text">{{
                  $t('home.documentInfoLabel') }}</label>
              <div style="display: flex; align-items: center; margin-bottom: 16px">
                <label style="width: 60px; text-align: left; margin-right: 8px">{{ $t('home.label.title') }}</label>
                <el-input v-model="current_article_meta_data.title" style="flex: 1;width: 200px;"
                  :placeholder="$t('home.placeholder.title')" />
              </div>
              <div style="display: flex; align-items: center; margin-bottom: 16px">
                <label style="width: 60px; text-align: left; margin-right: 8px">{{ $t('home.label.author') }}</label>
                <el-input v-model="current_article_meta_data.author" style="flex: 1;width: 200px;"
                  :placeholder="$t('home.placeholder.author')" />
              </div>
              <div style="display: flex; align-items: center; margin-bottom: 16px">
                <label style="width: 60px; text-align: left; margin-right: 8px">{{ $t('home.label.abstract') }}</label>
                <el-input v-model="current_article_meta_data.description" type="textarea" style="width: 200px;"
                  :placeholder="$t('home.placeholder.abstract')" :autosize="{ minRows: 2, maxRows: 3 }" />
              </div>
              <div style="display: flex; align-items: center; margin-bottom: 16px">
                <el-tooltip :content="$t('home.tooltip.ready')" placement="top">
                  <el-button circle type="success" @click="allSet"><el-icon>
                      <Check />
                    </el-icon></el-button>
                </el-tooltip>
              </div>
            </div>
            <div class="aero-div"
              style=" display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 10px; height: 47vh;width: 18vw;"
              v-if="tab === $t('home.tab.aiAssistant')">
              <label
                style="width: 100%; text-align: center; align-self: center; font-weight: bold; margin-bottom: 10px;"
                :style="{ color: themeState.currentTheme.textColor }" class="interactive-text">{{
                  $t('home.aiAssistantLabel') }}</label>
              <el-tooltip :content="$t('home.tooltip.selectTemperature')" placement="left">
                <el-slider v-model="temperature" :marks="marks" :min="0" :max="100"
                  style="margin-bottom: 20px; width: 80%; " :disabled="generated || generating" />
              </el-tooltip>

              <el-tooltip :content="$t('home.tooltip.selectMood')" placement="left">

                <el-select v-model="mood" :placeholder="$t('home.tooltip.selectMood')" multiple filterable allow-create
                  style=" margin-bottom: 5px; margin-top: 5px;" :disabled="generated || generating" size="small">
                  <el-option v-for="option in moodOptions" :key="option.value" :label="option.label"
                    :value="option.value">
                    <template #prefix>
                      <el-icon :size="12">
                        <component :is="option.icon" />
                      </el-icon>
                    </template>
                  </el-option>
                </el-select>


              </el-tooltip>
              <el-tooltip :content="$t('home.tooltip.inputPrompt')" placement="left">
                <el-autocomplete v-model="userPrompt" :fetch-suggestions="querySearch" clearable
                  class="inline-input aero-input" style=" opacity: 0.8;" :placeholder="$t('home.tooltip.inputPrompt')"
                  @mousedown.stop type="textarea" :autosize="{ minRows: 3, maxRows: 3 }" resize='none'
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
                  {{ $t('home.suggestionLabel') }}
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
                  {{ $t('home.button.refresh') }}
                </el-button>
              </div>
              <div @mousedown.stop>
                <el-tooltip :content="$t('home.tooltip.generateArticle')" placement="top">
                  <el-button circle type="primary" @click="generate"
                    :disabled="generated || generating || userPrompt.length === 0"><el-icon>
                      <Promotion />
                    </el-icon></el-button>
                </el-tooltip>
                <el-tooltip :content="$t('home.tooltip.reset')" placement="top">
                  <el-button circle type="info" @click="reset" v-if="generated"><el-icon>
                      <RefreshLeft />
                    </el-icon></el-button>
                </el-tooltip>
                <el-tooltip :content="$t('home.tooltip.accept')" placement="top">
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
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
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
import { generateArticlePrompt, presets } from '../utils/prompts';

import router from "../router/router";
import { suggestionPresets } from '../utils/prompts';
import { useI18n } from 'vue-i18n'
const { t } = useI18n()

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
  applyTheme();
});

eventBus.on('reset-quickstart', () => {
  reset();
});

// 刷新按钮内容
function refreshButtons() {
  buttons.value = generateRandomButtons();
}

// 按钮点击事件
function handleAcceptSuggestion(prompt) {
  userPrompt.value = prompt;
}

const mood = ref([t('home.mood.peaceful')]);
const moodOptions = [
  {
    label: t('home.mood.happy'),
    value: 'happy',
    icon: Sugar
  },
  {
    label: t('home.mood.lyrical'),
    value: 'lyrical',
    icon: MoonNight
  },
  {
    label: t('home.mood.peaceful'),
    value: 'peaceful',
    icon: Mug
  },
  {
    label: t('home.mood.academic'),
    value: 'academic',
    icon: DataAnalysis
  },
  {
    label: t('home.mood.business'),
    value: 'business',
    icon: SuitcaseLine
  },
  {
    label: t('home.mood.sad'),
    value: 'sad',
    icon: Drizzling
  },
  {
    label: t('home.mood.warning'),
    value: 'warning',
    icon: Warning
  },
  {
    label: t('home.mood.exciting'),
    value: 'exciting',
    icon: Lightning
  },
  {
    label: t('home.mood.angry'),
    value: 'angry',
    icon: Lightning
  },
  {
    label: t('home.mood.surprised'),
    value: 'surprised',
    icon: Lightning
  },
  {
    label: t('home.mood.fearful'),
    value: 'fearful',
    icon: Lightning
  },
  {
    label: t('home.mood.disgusted'),
    value: 'disgusted',
    icon: Lightning
  }
];

// 定义响应式变量
const mouseX = ref(0);
const mouseY = ref(0);

// 定义Three.js对象
let scene, camera, renderer, particles;
const temperature = ref(50);
const tab = ref(t('home.tab.aiAssistant'));
const marks = ref({
  0: t('home.temperatureMarks.rigorous'),
  100: t('home.temperatureMarks.creative'),
  50: {
    style: {
      color: '#1989FA'
    },
    label: t('home.temperatureMarks.balanced')
  }
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
  tab.value = t('home.tab.documentInfo');

}
const allSet = () => {
  eventBus.emit('nav-to', '/article');
}

const generate = async () => {
  generating.value = true;

  const prompt = generateArticlePrompt(mood.value, userPrompt.value);
  //console.log(prompt)
  const { handle, done } = createAiTask(userPrompt.value, prompt, generatedText, ai_types.answer, 'quick-start', { temperature: temperature.value / 100.0 });
  generating.value = true;
  generated.value = false;

  try {
    await done;
  } catch (err) {
    console.warn('任务失败或取消：', err);
  } finally {
    generated.value = true;
    generating.value = false;
  }

  // generating.value = false;

  // generated.value = true;
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
    : presets;
  // call callback function to return suggestions
  cb(results)
}
const reset = () => {
  generated.value = false;
  generatedText.value = current_article.value ? current_article.value : defaultText;
}
const generating = ref(false);
const userPrompt = ref('');
const defaultText = t('home.defaultText');
const generatedText = ref(current_article.value ? current_article.value : defaultText);
const generated = ref(false);

// const autoDescription = ref(true);
// 初始化Three.js场景

const initThreeJS = async () => {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 2000);
  camera.position.z = 800;

  // 渲染器
  renderer = new THREE.WebGLRenderer({ alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.domElement.style.position = 'absolute';
  renderer.domElement.style.top = '0';
  renderer.domElement.style.left = '0';
  renderer.domElement.style.zIndex = '-1';
  renderer.domElement.style.transition = 'filter 1.5s ease';
  document.getElementById('particle-bg')?.appendChild(renderer.domElement);
  createParticles();

};
const createParticles = async () => {
  scene = new THREE.Scene();
  const areaSize = 1500;
  let wordList = [];
  const words = await ipcRenderer.invoke('cut-words', { text: current_article.value });
  //使用集合去重
  wordList = Array.from(new Set(words));
  const symbols = '~!@#$%^&*()_+`-={}|[]\\:";\'<>?,./。、，；：‘’“”【】《》？！￥…（）—0123456789';
  wordList = wordList.filter(word => !symbols.includes(word) && word.length > 1); //过滤掉单个字符和标点符号
  // 如果词语数量 < 20，用原始粒子效果
  const particleCount = 100;
  if (wordList.length < 20) {
    const particlesGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * areaSize;
      positions[i * 3 + 1] = (Math.random() - 0.5) * areaSize;
      positions[i * 3 + 2] = (Math.random() - 0.5) * areaSize;

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
  } else {
    // 否则：使用词语 sprite 粒子
    particles = new THREE.Group();
    //随机选取particleCount个词语，如果词语数量小于particleCount，则取全部词语
    wordList = wordList.sort(() => 0.5 - Math.random()).slice(0, Math.min(wordList.length, particleCount));
    wordList.forEach((word) => {
      const canvas = document.createElement('canvas');
      const size = 512;
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');

      ctx.clearRect(0, 0, size, size);
      ctx.font = 'bold 60px sans-serif';//字体是 sans-serif，支持语言包含
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = `rgba(${Math.floor(Math.random() * 255)},${Math.floor(Math.random() * 255)},${Math.floor(Math.random() * 255)},0.9)`;
      ctx.fillText(word, size / 2, size / 2);
      //有描边效果
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.lineWidth = 2;

      const texture = new THREE.CanvasTexture(canvas);
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
      const sprite = new THREE.Sprite(material);

      sprite.position.set(
        (Math.random() - 0.5) * areaSize,
        (Math.random() - 0.5) * areaSize,
        (Math.random() - 0.5) * areaSize
      );

      const scale = 120 + Math.random() * 160;
      sprite.scale.set(scale, scale, 1);

      particles.add(sprite);
    });
  }
  scene.add(particles);
}
let animationFrameId = null;
let isAnimating = false;
const startAnimation = () => {
  if (isAnimating) return;
  isAnimating = true;
  animate();
};

const stopAnimation = () => {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  isAnimating = false;
  renderer.clear();
};
const animate = () => {
  if (!isAnimating) return; // 如果当前设置为不需要动画，直接退出

  // 动画帧请求
  animationFrameId = requestAnimationFrame(animate);

  if (!particleEffectEnabled.value || !particles) {
    // 清空画布但不继续动画循环
    renderer.clear();
    isAnimating = false;
    animationFrameId = null;
    return;
  }

  // 让粒子微微旋转
  particles.rotation.x += 0.0005;
  particles.rotation.y += 0.0005;

  // 根据鼠标位置调整旋转
  particles.rotation.x += (mouseY.value / window.innerHeight) * 0.05;
  particles.rotation.y += (mouseX.value / window.innerWidth) * 0.05;

  // // 模糊处理
  // renderer.domElement.style.filter = `blur(${(quickStartDialogVisible.value || current_file_path.value !== '') ? 3 : 0}px)`;

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
import localIpcRenderer from '../utils/web-adapter/local-ipc-renderer';
import { webMainCalls } from '../utils/web-adapter/web-main-calls';
import { ai_types, createAiTask } from '../utils/ai_tasks';

let ipcRenderer = null
if (window && window.electron) {
  ipcRenderer = window.electron.ipcRenderer
} else {
  webMainCalls();
  ipcRenderer = localIpcRenderer
  //todo 说明当前环境不是electron环境，需要另外适配
}



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
const particleEffectEnabled = ref(false);
const particleEffect = async () => {
  initThreeJS();
  eventBus.on('toggle-particle-effect', async () => {
    //console.log('toggle-particle-effect');
    const enabled = await getSetting('particleEffect');
    if (enabled) {
      particleEffectEnabled.value = true;
      startAnimation();
    } else {
      particleEffectEnabled.value = false;
      stopAnimation();
      // if (particles) {
      //   scene.remove(particles);
      //   particles.geometry.dispose();
      //   particles.material.dispose();
      //   particles = null;
      // }
    }

  });
  //监听current_article变化，如果变化了就重新创建粒子效果
  watch(current_article, async (newValue, oldValue) => {
    if (newValue !== oldValue) {
      createParticles();
    }
  });
  eventBus.emit('toggle-particle-effect', {});
}
onMounted(async () => {
  particleEffect();
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('resize', onWindowResize); // 添加窗口大小变化事件
  preventNavigate(); // 添加链接点击事件


});

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
  height: 63vh;
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
  height: 60vh;
  border: 1px solid #393939;
  /*竖排排列 */
  flex-direction: column;
  backdrop-filter: blur(20px) brightness(1.05);
  /*圆角边框 */
  border-radius: 10px;
}

.generated-md-container {
  max-height: 55vh;
  height: 55vh;
  overflow: auto;
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
