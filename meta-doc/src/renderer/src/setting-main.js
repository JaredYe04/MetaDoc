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
import Setting from './views/Setting.vue';
import MicrophoneTest from './components/MicrophoneTest.vue';

// 挂载 Vue 组件到 new-window.html 的指定位置
const app = createApp(Setting);
console.log('setting-main.js: app', app);
app.use(ElementPlus)
app.component('VueTree', VueTree)
app.component('MicrophoneTest', MicrophoneTest)
app.use(router)
app.mount("#setting-app");
