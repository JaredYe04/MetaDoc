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
import MenuItemsDemo from '../components/manual/MenuItemsDemo.vue'
import ViewMenuItemsDemo from '../components/manual/ViewMenuItemsDemo.vue'
import TitleMenu from '../components/TitleMenu.vue'
import SectionOptimizer from '../components/SectionOptimizer.vue'
import SearchReplaceMenu from '../components/SearchReplaceMenu.vue'
import PdfPreviewPanel from '../components/PdfPreviewPanel.vue'
import ConsoleTerminal from '../components/ConsoleTerminal.vue'
import MetaInfoPanel from '../components/MetaInfoPanel.vue'
import AIChatDemo from '../components/manual/AIChatDemo.vue'
import OcrWindowDemo from '../components/manual/OcrWindowDemo.vue'
import GraphWindowDemo from '../components/manual/GraphWindowDemo.vue'
import OutlineDemo from '../components/manual/OutlineDemo.vue'
import { registerDemoComponent } from './demo-registry'

registerDemoComponent('LeftMenu', LeftMenu)
registerDemoComponent('MainTabs', MainTabs)
registerDemoComponent('ViewMenu', ViewMenu)
registerDemoComponent('QuickStartPanel', QuickStartPanel)
registerDemoComponent('QuickStartMarkdown', QuickStartMarkdown)
registerDemoComponent('QuickStartLatex', QuickStartLatex)
registerDemoComponent('ResizableDivider', ResizableDivider)
registerDemoComponent('MenuItemsDemo', MenuItemsDemo)
registerDemoComponent('ViewMenuItemsDemo', ViewMenuItemsDemo)
registerDemoComponent('TitleMenu', TitleMenu)
registerDemoComponent('SectionOptimizer', SectionOptimizer)
registerDemoComponent('SearchReplaceMenu', SearchReplaceMenu)
registerDemoComponent('PdfPreviewPanel', PdfPreviewPanel)
registerDemoComponent('ConsoleTerminal', ConsoleTerminal)
registerDemoComponent('MetaInfoPanel', MetaInfoPanel)
registerDemoComponent('AIChatDemo', AIChatDemo)
registerDemoComponent('OcrWindowDemo', OcrWindowDemo)
registerDemoComponent('GraphWindowDemo', GraphWindowDemo)
registerDemoComponent('OutlineDemo', OutlineDemo)
