import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import zh_CN from '../locales/zh_cn.json'
import en_US from '../locales/en_us.json'

export interface ManualSection {
  id: string
  title: string
  path: string[]
  children?: ManualSection[]
}

export interface UserProfile {
  scenario?: 'student' | 'researcher' | 'it' | 'office' | 'other'
  markdownLevel?: 0 | 1 | 2 | 3
  latexLevel?: 0 | 1 | 2 | 3
  knowsAgent?: boolean
  completedAt?: string
}

// 当前选中的章节
const currentSection = ref<string>('')

// 用户画像
const userProfile = ref<UserProfile | null>(null)

// 构建导航树结构
function buildNavigationTree(t: (key: string) => string): ManualSection[] {
  return [
    {
      id: 'core',
      title: t('userManual.navigation.core'),
      path: ['core'],
      children: [
        {
          id: 'core.fileOperations',
          title: t('userManual.core.fileOperations.title'),
          path: ['core', 'fileOperations']
        },
        {
          id: 'core.editor',
          title: t('userManual.core.editor.title'),
          path: ['core', 'editor']
        },
        {
          id: 'core.multiTab',
          title: t('userManual.core.multiTab.title'),
          path: ['core', 'multiTab']
        },
        {
          id: 'core.multiWindow',
          title: t('userManual.core.multiWindow.title'),
          path: ['core', 'multiWindow']
        },
        {
          id: 'core.export',
          title: t('userManual.core.export.title'),
          path: ['core', 'export']
        }
      ]
    },
    {
      id: 'markdown',
      title: t('userManual.navigation.markdown'),
      path: ['markdown'],
      children: [
        {
          id: 'markdown.basic',
          title: t('userManual.markdown.basic.title'),
          path: ['markdown', 'basic']
        },
        {
          id: 'markdown.advanced',
          title: t('userManual.markdown.advanced.title'),
          path: ['markdown', 'advanced']
        }
      ]
    },
    {
      id: 'latex',
      title: t('userManual.navigation.latex'),
      path: ['latex'],
      children: [
        {
          id: 'latex.basic',
          title: t('userManual.latex.basic.title'),
          path: ['latex', 'basic']
        },
        {
          id: 'latex.advanced',
          title: t('userManual.latex.advanced.title'),
          path: ['latex', 'advanced']
        }
      ]
    },
    {
      id: 'charts',
      title: t('userManual.navigation.charts'),
      path: ['charts'],
      children: [
        {
          id: 'charts.introduction',
          title: t('userManual.charts.introduction.title'),
          path: ['charts', 'introduction']
        },
        {
          id: 'charts.mermaid',
          title: t('userManual.charts.mermaid.title'),
          path: ['charts', 'mermaid']
        },
        {
          id: 'charts.plantuml',
          title: t('userManual.charts.plantuml.title'),
          path: ['charts', 'plantuml']
        },
        {
          id: 'charts.echarts',
          title: t('userManual.charts.echarts.title'),
          path: ['charts', 'echarts']
        }
      ]
    },
    {
      id: 'ai',
      title: t('userManual.navigation.ai'),
      path: ['ai'],
      children: [
        {
          id: 'ai.llmConfig',
          title: t('userManual.ai.llmConfig.title'),
          path: ['ai', 'llmConfig']
        },
        {
          id: 'ai.tools',
          title: t('userManual.ai.tools.title'),
          path: ['ai', 'tools']
        },
        {
          id: 'ai.chat',
          title: t('userManual.ai.chat.title'),
          path: ['ai', 'chat']
        }
      ]
    },
    {
      id: 'agent',
      title: t('userManual.navigation.agent'),
      path: ['agent'],
      children: [
        {
          id: 'agent.introduction',
          title: t('userManual.agent.introduction.title'),
          path: ['agent', 'introduction']
        },
        {
          id: 'agent.capabilities',
          title: t('userManual.agent.capabilities.title'),
          path: ['agent', 'capabilities']
        },
        {
          id: 'agent.risks',
          title: t('userManual.agent.risks.title'),
          path: ['agent', 'risks']
        }
      ]
    },
    {
      id: 'design',
      title: t('userManual.navigation.design'),
      path: ['design'],
      children: [
        {
          id: 'design.philosophy',
          title: t('userManual.design.philosophy.title'),
          path: ['design', 'philosophy']
        }
      ]
    }
  ]
}

export function useUserManual() {
  const { t, locale } = useI18n()
  
  // 导航树必须在 setup 函数内部创建
  const navigationTree = computed<ManualSection[]>(() => {
    return buildNavigationTree(t)
  })
  
  // 获取当前章节的Markdown内容
  const getCurrentSectionContent = computed(() => {
    if (!currentSection.value) {
      return ''
    }
    
    const path = currentSection.value.split('.')
    const key = `userManual.${path.join('.')}.content`
    
    try {
      // 直接导入JSON文件获取原始内容，避免vue-i18n解析代码块中的大括号
      let currentLocale = locale.value || 'zh_CN'
      
      // 标准化locale格式
      if (typeof currentLocale === 'string') {
        currentLocale = currentLocale.replace('-', '_')
      }
      
      // 选择对应的JSON文件
      let localeData: any = null
      if (currentLocale === 'zh_CN' || currentLocale === 'zh_cn') {
        localeData = zh_CN
      } else if (currentLocale === 'en_US' || currentLocale === 'en_us') {
        localeData = en_US
      } else {
        // fallback to zh_CN
        localeData = zh_CN
      }
      
      // 递归获取嵌套的key值
      const keys = key.split('.')
      let value: any = localeData
      
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i]
        if (value && typeof value === 'object' && k in value) {
          value = value[k]
        } else {
          console.warn(`未找到key: ${keys.slice(0, i + 1).join('.')}`, '当前值类型:', typeof value, '可用keys:', value && typeof value === 'object' ? Object.keys(value).slice(0, 5) : 'N/A')
          return ''
        }
      }
      
      if (typeof value === 'string' && value.trim()) {
        console.log(`✅ 成功获取内容: ${key}, 长度: ${value.length}`)
        return value
      } else {
        console.warn(`key ${key} 的值不是有效字符串:`, typeof value, value ? '值为空或非字符串' : '值为null/undefined')
        return ''
      }
    } catch (error) {
      console.error('获取用户手册内容失败:', error, 'key:', key)
      return ''
    }
  })
  
  return {
    currentSection,
    userProfile,
    navigationTree,
    getCurrentSectionContent,
    setCurrentSection: (sectionId: string) => {
      currentSection.value = sectionId
    },
    setUserProfile: (profile: UserProfile) => {
      userProfile.value = profile
    }
  }
}
