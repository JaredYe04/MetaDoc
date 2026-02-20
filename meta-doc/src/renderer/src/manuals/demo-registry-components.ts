/**
 * 用户手册 Demo 组件注册（懒加载用）
 * 仅在被动态 import 时执行，避免在应用启动时拉取 LeftMenu 等组件导致循环依赖
 */

import LeftMenu from '../components/LeftMenu.vue'
import MainTabs from '../components/MainTabs.vue'
import ViewMenu from '../components/ViewMenu.vue'
import QuickStartPanel from '../components/home/QuickStartPanel.vue'
import QuickStartMarkdown from '../components/home/QuickStartMarkdown.vue'
import QuickStartLatex from '../components/home/QuickStartLatex.vue'
import ResizableDivider from '../components/base/ResizableDivider.vue'
import { registerDemoComponent } from './demo-registry'

registerDemoComponent('LeftMenu', LeftMenu)
registerDemoComponent('MainTabs', MainTabs)
registerDemoComponent('ViewMenu', ViewMenu)
registerDemoComponent('QuickStartPanel', QuickStartPanel)
registerDemoComponent('QuickStartMarkdown', QuickStartMarkdown)
registerDemoComponent('QuickStartLatex', QuickStartLatex)
registerDemoComponent('ResizableDivider', ResizableDivider)
