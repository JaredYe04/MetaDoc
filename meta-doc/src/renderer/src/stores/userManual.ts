import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type {
  ManualIndex,
  ManualArticle,
  ManualCategory,
  UserProfile,
  ArticleProgress,
  BreadcrumbItem,
  SearchResult
} from '../manuals/types'
import {
  loadManualIndex,
  getAllArticles,
  getArticleById,
  generateLearningPath,
  buildLearningGraph,
  calculateProgress,
  parseInternalLinks,
  convertInternalLinksToHTML
} from '../manuals/utils'
import { getUserProfile } from '../utils/user-profile'

// 导出类型供外部使用
export type { UserProfile, ManualArticle, ManualCategory }

// 当前选中的文档ID
const currentArticleId = ref<string>('')

// 用户画像
const userProfile = ref<UserProfile | null>(null)

// 文档索引
const manualIndex = ref<ManualIndex | null>(null)

// 学习路径（文档ID列表）
const learningPath = ref<string[]>([])

// 文档进度映射
const articleProgress = ref<Map<string, ArticleProgress>>(new Map())

// 面包屑导航历史
const breadcrumbHistory = ref<BreadcrumbItem[]>([])

// 导航来源标志：'navigation' | 'link' | 'search' | 'breadcrumb'
const navigationSource = ref<'navigation' | 'link' | 'search' | 'breadcrumb'>('navigation')

// 搜索查询
const searchQuery = ref('')

// 搜索结果
const searchResults = ref<SearchResult[]>([])

/**
 * 初始化文档索引
 */
async function initManualIndex() {
  if (!manualIndex.value) {
    manualIndex.value = await loadManualIndex()
  }
  return manualIndex.value
}

/**
 * 构建导航树结构（基于索引）
 */
function buildNavigationTree(
  index: ManualIndex,
  locale: string
): Array<{
  id: string
  title: string
  icon?: string
  children?: Array<{ id: string; title: string }>
}> {
  return index.categories.map((category) => ({
    id: category.id,
    title: category.title[locale] || category.title.en_US || category.id,
    icon: category.icon,
    children: category.articles.map((article) => ({
      id: article.id,
      title: article.title[locale] || article.title.en_US || article.id
    }))
  }))
}

// 预加载所有文档（使用 import.meta.glob）
const manualModules = import.meta.glob<string>('../manuals/**/*.md', {
  eager: true,
  query: '?raw',
  import: 'default'
})

/**
 * 加载文档内容
 */
async function loadArticleContent(articleId: string, locale: string): Promise<string> {
  console.log('[userManual store] loadArticleContent called:', { articleId, locale })
  const article = await getArticleById(articleId)
  if (!article) {
    console.warn('[userManual store] Article not found:', articleId)
    return ''
  }

  console.log('[userManual store] Article found:', { file: article.file, title: article.title })

  try {
    // 标准化locale格式
    const normalizedLocale = locale.replace('-', '_').toLowerCase()
    const localeMap: Record<string, string> = {
      zh_cn: 'zh_CN',
      en_us: 'en_US',
      ja_jp: 'ja_JP',
      ko_kr: 'ko_KR',
      fr_fr: 'fr_FR',
      de_de: 'de_DE'
    }
    const targetLocale = localeMap[normalizedLocale] || 'zh_CN'

    // 构建文件路径
    const filePath = `../manuals/${targetLocale}/${article.file}`
    console.log('[userManual store] Looking for file:', filePath)
    console.log(
      '[userManual store] Available manual modules:',
      Object.keys(manualModules).slice(0, 10)
    )

    // 从预加载的模块中获取
    const moduleKey = Object.keys(manualModules).find((key) =>
      key.includes(`manuals/${targetLocale}/${article.file}`)
    )

    if (moduleKey && manualModules[moduleKey]) {
      console.log('[userManual store] Found module:', moduleKey)
      const content = manualModules[moduleKey]
      return typeof content === 'string' ? content : (content && (content as { default?: string }).default) ?? ''
    }

    console.warn(`[userManual store] 未找到文档: ${filePath}`, {
      moduleKey,
      hasModule: !!manualModules[moduleKey as string]
    })
    return ''
  } catch (error) {
    console.error(`[userManual store] 加载文档失败: ${articleId}`, error)
    return ''
  }
}

/**
 * 更新文档进度
 */
function updateArticleProgress(articleId: string, progress: Partial<ArticleProgress>) {
  const current = articleProgress.value.get(articleId) || {
    articleId,
    read: false,
    readTime: 0,
    lastAccessed: Date.now(),
    completion: 0
  }

  articleProgress.value.set(articleId, {
    ...current,
    ...progress,
    lastAccessed: Date.now()
  })

  // 保存到本地存储
  saveProgressToStorage()
}

/**
 * 标记文档为已读
 */
function markArticleAsRead(articleId: string) {
  updateArticleProgress(articleId, {
    read: true,
    completion: 100
  })
}

/**
 * 清空当前推荐路径的学习进度（将路径内所有文档标记为未读）
 */
function clearLearningProgress() {
  for (const articleId of learningPath.value) {
    updateArticleProgress(articleId, {
      read: false,
      completion: 0
    })
  }
  // 触发响应式更新，使图表、列表等依赖 articleProgress 的组件刷新
  articleProgress.value = new Map(articleProgress.value)
}

/**
 * 从本地存储加载进度
 */
function loadProgressFromStorage() {
  try {
    const stored = localStorage.getItem('manual_progress')
    if (stored) {
      const data = JSON.parse(stored)
      articleProgress.value = new Map(Object.entries(data))
    }
  } catch (error) {
    console.error('加载进度失败:', error)
  }
}

/**
 * 加载用户画像
 */
async function loadUserProfile() {
  try {
    const profile = await getUserProfile()
    if (profile) {
      userProfile.value = profile
      // 生成学习路径
      const path = await generateLearningPath(profile)
      learningPath.value = path
    }
  } catch (error) {
    console.error('加载用户画像失败:', error)
  }
}

/**
 * 保存进度到本地存储
 */
function saveProgressToStorage() {
  try {
    const data = Object.fromEntries(articleProgress.value)
    localStorage.setItem('manual_progress', JSON.stringify(data))
  } catch (error) {
    console.error('保存进度失败:', error)
  }
}

/**
 * 搜索文档
 */
async function performSearch(query: string): Promise<SearchResult[]> {
  if (!query.trim()) {
    searchResults.value = []
    return []
  }

  const articles = await getAllArticles()
  const resultsMap = new Map<string, SearchResult>() // 使用 Map 去重
  const lowerQuery = query.toLowerCase()

  for (const article of articles) {
    const title = article.title.zh_CN || article.title.en_US || ''
    let bestScore = 0

    // 搜索标题
    if (title.toLowerCase().includes(lowerQuery)) {
      const score = title.toLowerCase().indexOf(lowerQuery) === 0 ? 100 : 80
      bestScore = Math.max(bestScore, score)
    }

    // 搜索标签
    if (article.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))) {
      bestScore = Math.max(bestScore, 60)
    }

    // 如果找到匹配，添加或更新结果（保留最高分）
    if (bestScore > 0) {
      const existing = resultsMap.get(article.id)
      if (!existing || existing.score < bestScore) {
        resultsMap.set(article.id, {
          type: 'article',
          articleId: article.id,
          title,
          score: bestScore
        })
      }
    }

    // TODO: 搜索文档内容片段（需要加载文档内容）
  }

  // 转换为数组并按相关性排序
  const results = Array.from(resultsMap.values())
  results.sort((a, b) => b.score - a.score)
  searchResults.value = results
  return results
}

export function useUserManual() {
  const { locale } = useI18n()

  // 初始化
  initManualIndex()
  loadProgressFromStorage()

  // 加载用户画像
  loadUserProfile()

  // 导航树
  const navigationTree = computed(() => {
    if (!manualIndex.value) return []
    const currentLocale = locale.value || 'zh_CN'
    return buildNavigationTree(manualIndex.value, currentLocale)
  })

  // 当前文档
  const currentArticle = computed(async () => {
    if (!currentArticleId.value) return null
    return await getArticleById(currentArticleId.value)
  })

  // 当前文档内容
  const currentArticleContent = ref('')

  // 加载当前文档内容
  watch(
    [currentArticleId, locale],
    async ([newArticleId, newLocale], [oldArticleId, oldLocale]) => {
      console.log('[userManual store] Watch triggered', {
        articleIdChanged: newArticleId !== oldArticleId,
        newArticleId: newArticleId,
        oldArticleId: oldArticleId,
        localeChanged: newLocale !== oldLocale,
        newLocale: newLocale
      })
      // 如果articleId为空，不加载内容（显示概览页面）
      if (!currentArticleId.value) {
        console.log('[userManual store] No articleId, clearing content')
        currentArticleContent.value = ''
        return
      }

      if (currentArticleId.value) {
        // 先保存当前的导航来源，因为后面会重置
        const source = navigationSource.value

        console.log('[userManual store] Loading article content:', currentArticleId.value)
        const content = await loadArticleContent(currentArticleId.value, locale.value || 'zh_CN')
        console.log('[userManual store] Article content loaded, length:', content?.length)
        currentArticleContent.value = content

        const article = await getArticleById(currentArticleId.value)
        if (article) {
          const currentLocale = locale.value || 'zh_CN'
          const title = article.title[currentLocale] || article.title.en_US || article.id

          // 根据导航来源决定是否更新面包屑
          if (source === 'link') {
            // 从文档内链接跳转：添加到面包屑
            // 移除重复项
            breadcrumbHistory.value = breadcrumbHistory.value.filter(
              (item) => item.articleId !== currentArticleId.value
            )

            // 添加到历史
            breadcrumbHistory.value.push({
              articleId: currentArticleId.value,
              title
            })

            // 限制历史长度
            if (breadcrumbHistory.value.length > 10) {
              breadcrumbHistory.value = breadcrumbHistory.value.slice(-10)
            }
          } else if (source === 'navigation' || source === 'search') {
            // 从导航或搜索切换：重置面包屑
            breadcrumbHistory.value = [
              {
                articleId: currentArticleId.value,
                title
              }
            ]
          } else if (source === 'breadcrumb') {
            // 从面包屑点击：截取到当前位置
            const currentIndex = breadcrumbHistory.value.findIndex(
              (item) => item.articleId === currentArticleId.value
            )
            if (currentIndex >= 0) {
              breadcrumbHistory.value = breadcrumbHistory.value.slice(0, currentIndex + 1)
            } else {
              breadcrumbHistory.value = [
                {
                  articleId: currentArticleId.value,
                  title
                }
              ]
            }
          } else {
            // 默认情况：重置面包屑
            breadcrumbHistory.value = [
              {
                articleId: currentArticleId.value,
                title
              }
            ]
          }

          // 重置导航来源为默认值（在下次切换时使用）
          navigationSource.value = 'navigation'
        }

        // 更新访问时间
        updateArticleProgress(currentArticleId.value, {
          lastAccessed: Date.now()
        })
      }
    },
    { immediate: true }
  )

  // 学习进度
  const learningProgress = computed(() => {
    if (learningPath.value.length === 0) return 0
    return calculateProgress(learningPath.value, articleProgress.value)
  })

  // 学习图数据
  const learningGraph = computed(async () => {
    if (learningPath.value.length === 0) return { nodes: [], edges: [] }
    return await buildLearningGraph(learningPath.value)
  })

  return {
    // 状态
    currentArticleId,
    userProfile,
    manualIndex,
    learningPath,
    articleProgress,
    breadcrumbHistory,
    searchQuery,
    searchResults,
    currentArticleContent,

    // 计算属性
    navigationTree,
    currentArticle,
    learningProgress,
    learningGraph,

    // 方法
    setCurrentArticle: async (
      articleId: string,
      source: 'navigation' | 'link' | 'search' | 'breadcrumb' = 'navigation'
    ) => {
      navigationSource.value = source
      // 如果articleId为空字符串，表示返回概览页面
      currentArticleId.value = articleId || ''
    },
    setUserProfile: async (profile: UserProfile) => {
      userProfile.value = profile
      // 生成学习路径
      const path = await generateLearningPath(profile)
      learningPath.value = path
    },
    markArticleAsRead,
    updateArticleProgress,
    clearLearningProgress,
    performSearch,
    getArticleById,
    getAllArticles,
    parseInternalLinks,
    convertInternalLinksToHTML
  }
}
