// import './assets/main.css'

import { createApp } from 'vue'
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
const app = createApp(App);

for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
    app.component(key, component)
  }
import LlmDialog from "./components/LlmDialog.vue";
//import AiLogo from './assets/ai-logo.svg'
app.component("LlmDialog", LlmDialog); // 全局注册
//app.component("AiLogo", AiLogo); // 全局注册


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
app.use(ElementPlus)
app.component('VueTree', VueTree)
app.use(router)
app.mount('#app')
