// import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import router from "./router/router.js";
// 引入组件库的少量全局样式变量
import 'tdesign-vue-next/es/style/index.css';
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import VueTree from "@ssthouse/vue3-tree-chart";
import "@ssthouse/vue3-tree-chart/dist/vue3-tree-chart.css";
import './assets/interactive-text.css'
import './assets/wordcloud-text.css'
import './assets/editor-search.css'
import { lightTheme,darkTheme } from './utils/themes.js';
import { reactive } from 'vue';
import { initServiceStatusWatcher } from './utils/service-status';
import { i18n } from './i18n.js';

import 'element-plus/theme-chalk/dark/css-vars.css'


const app = createApp(App);
const pinia = createPinia();

initServiceStatusWatcher();

for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
    app.component(key, component)
  }

const themeState = reactive({
    currentTheme: darkTheme,  // 默认是浅色模式
  });
  
app.provide('themeState', themeState);  // 全局提供 themeState 主题状态
  



import MetaFieldAssistant from "./components/MetaFieldAssistant.vue";
app.component("MetaFieldAssistant", MetaFieldAssistant);
import KeywordInput from "./components/KeywordInput.vue";
app.component("KeywordInput", KeywordInput);
import MetaInfoPanel from "./components/MetaInfoPanel.vue";
app.component("MetaInfoPanel", MetaInfoPanel);

import TitleMenu from './components/TitleMenu.vue';
app.component("TitleMenu", TitleMenu); // 全局注册
import ContextMenu from './components/ContextMenu.vue';
app.component("ContextMenu", ContextMenu); // 全局注册
import MicrophoneTest from './components/MicrophoneTest.vue';
app.component("MicrophoneTest", MicrophoneTest); // 全局注册
import VoiceInput from './components/VoiceInput.vue';
app.component("VoiceInput", VoiceInput); // 全局注册

import MarkdownItEditor from 'vue3-markdown-it';
app.component('MarkdownItEditor', MarkdownItEditor)
import SearchReplaceMenu from './components/SearchReplaceMenu.vue';
app.component('SearchReplaceMenu', SearchReplaceMenu)
import MessageBubble from './components/MessageBubble.vue'
app.component('MessageBubble',MessageBubble)

app.use(ElementPlus)
app.component('VueTree', VueTree)
app.use(pinia)
app.use(router)

app.use(i18n).mount('#app')
