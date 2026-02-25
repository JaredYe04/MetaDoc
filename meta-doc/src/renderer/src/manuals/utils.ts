/**
 * 用户手册工具函数
 */

import type {
  ManualIndex,
  ManualArticle,
  UserProfile,
  LearningPath,
  ArticleProgress
} from './types'

let manualIndexCache: ManualIndex | null = null

/**
 * 加载文档索引
 */
export async function loadManualIndex(): Promise<ManualIndex> {
  if (manualIndexCache) {
    return manualIndexCache
  }

  try {
    // 动态导入index.json
    const indexModule = await import('./index.json')
    manualIndexCache = indexModule.default as ManualIndex
    return manualIndexCache
  } catch (error) {
    console.error('加载文档索引失败:', error)
    throw error
  }
}

/**
 * 获取所有文档
 */
export async function getAllArticles(): Promise<ManualArticle[]> {
  const index = await loadManualIndex()
  return index.categories.flatMap((category) => category.articles)
}

/**
 * 根据ID获取文档
 */
export async function getArticleById(articleId: string): Promise<ManualArticle | null> {
  const articles = await getAllArticles()
  return articles.find((article) => article.id === articleId) || null
}

/**
 * 检查文档是否适合用户画像
 */
function isArticleSuitableForProfile(article: ManualArticle, profile: UserProfile): boolean {
  // 检查目标受众
  if (article.targetAudience && article.targetAudience.length > 0) {
    const includesAll = article.targetAudience.includes('all')
    const includesScenario = profile.scenario && article.targetAudience.includes(profile.scenario)
    if (!includesAll && !includesScenario) {
      return false
    }
  }

  // 检查所需经验等级
  if (article.requiredExperience) {
    // 检查Markdown经验要求
    if (article.requiredExperience.markdown !== undefined) {
      const userLevel = profile.markdownLevel ?? 0
      if (userLevel < article.requiredExperience.markdown) {
        return false
      }
    }

    // 检查LaTeX经验要求
    if (article.requiredExperience.latex !== undefined) {
      const userLevel = profile.latexLevel ?? 0
      if (userLevel < article.requiredExperience.latex) {
        return false
      }
    }

    // 检查Agent经验要求
    if (article.requiredExperience.agent !== undefined) {
      const userLevel = profile.agentLevel ?? 0
      if (userLevel < article.requiredExperience.agent) {
        return false
      }
    }
  }

  // 检查推荐给有特定工具经验的用户
  if (article.recommendedFor) {
    let matchesRecommendation = false

    if (article.recommendedFor.wysiwygMarkdown && profile.usedWysiwygMarkdown) {
      matchesRecommendation = true
    }
    if (article.recommendedFor.latexEditor && profile.usedLatexEditor) {
      matchesRecommendation = true
    }
    if (article.recommendedFor.otherMarkdownEditor && profile.usedOtherMarkdownEditor) {
      matchesRecommendation = true
    }

    // 如果文档有推荐条件但用户不满足，可以跳过（但不强制排除）
    // 这里我们允许通过，让其他条件决定
  }

  return true
}

/**
 * 计算文档与用户画像的匹配分数
 */
function calculateArticleScore(article: ManualArticle, profile: UserProfile): number {
  let score = 0

  // 基础分数
  score += 10

  // 场景匹配加分
  if (article.targetAudience) {
    if (article.targetAudience.includes('all')) {
      score += 5
    } else if (profile.scenario && article.targetAudience.includes(profile.scenario)) {
      score += 10
    }
  }

  // 经验匹配加分
  if (article.requiredExperience) {
    if (article.requiredExperience.markdown !== undefined) {
      const userLevel = profile.markdownLevel ?? 0
      const requiredLevel = article.requiredExperience.markdown
      if (userLevel >= requiredLevel) {
        score += 5
        // 如果用户水平刚好匹配要求，额外加分
        if (userLevel === requiredLevel) {
          score += 3
        }
      }
    }

    if (article.requiredExperience.latex !== undefined) {
      const userLevel = profile.latexLevel ?? 0
      const requiredLevel = article.requiredExperience.latex
      if (userLevel >= requiredLevel) {
        score += 5
        if (userLevel === requiredLevel) {
          score += 3
        }
      }
    }

    if (article.requiredExperience.agent !== undefined) {
      const userLevel = profile.agentLevel ?? 0
      const requiredLevel = article.requiredExperience.agent
      if (userLevel >= requiredLevel) {
        score += 5
        if (userLevel === requiredLevel) {
          score += 3
        }
      }
    }
  }

  // 工具经验匹配加分
  if (article.recommendedFor) {
    if (article.recommendedFor.wysiwygMarkdown && profile.usedWysiwygMarkdown) {
      score += 5
    }
    if (article.recommendedFor.latexEditor && profile.usedLatexEditor) {
      score += 5
    }
    if (article.recommendedFor.otherMarkdownEditor && profile.usedOtherMarkdownEditor) {
      score += 5
    }
  }

  return score
}

/**
 * 根据用户画像生成学习路径
 */
export async function generateLearningPath(profile: UserProfile): Promise<string[]> {
  const index = await loadManualIndex()
  const allArticles = await getAllArticles()

  // 如果没有场景信息，返回默认路径
  if (!profile.scenario || profile.scenario === 'other') {
    return index.learningPaths.student?.articles || []
  }

  // 根据场景选择基础路径
  const basePath = index.learningPaths[profile.scenario]
  if (!basePath) {
    return index.learningPaths.student?.articles || []
  }

  // 从基础路径开始
  let path = [...basePath.articles]
  const articleMap = new Map(allArticles.map((a) => [a.id, a]))

  // 过滤不适合的文档
  path = path.filter((id) => {
    const article = articleMap.get(id)
    if (!article) return false
    return isArticleSuitableForProfile(article, profile)
  })

  // 根据熟练度调整路径
  // 如果Markdown熟练度 >= 2，跳过基础教程
  if (profile.markdownLevel !== undefined && profile.markdownLevel >= 2) {
    path = path.filter((id) => {
      const article = articleMap.get(id)
      if (!article) return true
      // 跳过基础Markdown教程
      if (
        id.startsWith('markdown.basics') ||
        (article.requiredExperience?.markdown === 0 && id.startsWith('markdown.'))
      ) {
        return false
      }
      return true
    })
  }

  // 如果LaTeX熟练度 >= 2，跳过基础教程
  if (profile.latexLevel !== undefined && profile.latexLevel >= 2) {
    path = path.filter((id) => {
      const article = articleMap.get(id)
      if (!article) return true
      // 跳过基础LaTeX教程
      if (
        id.startsWith('latex.basics') ||
        (article.requiredExperience?.latex === 0 && id.startsWith('latex.'))
      ) {
        return false
      }
      return true
    })
  }

  // 如果Agent了解程度 < 2，移除高级Agent文档
  if (profile.agentLevel !== undefined && profile.agentLevel < 2) {
    path = path.filter((id) => {
      const article = articleMap.get(id)
      if (!article) return true
      // 移除需要Agent经验的文档
      if (
        article.requiredExperience?.agent !== undefined &&
        article.requiredExperience.agent >= 2
      ) {
        return false
      }
      return true
    })
  }

  // 根据用户使用过的编辑器经验，添加相关文档
  const additionalArticles: string[] = []

  // 如果使用过WYSIWYG Markdown编辑器，推荐WYSIWYG模式相关文档
  if (profile.usedWysiwygMarkdown) {
    const wysiwygArticles = allArticles.filter(
      (a) => a.recommendedFor?.wysiwygMarkdown && !path.includes(a.id)
    )
    additionalArticles.push(...wysiwygArticles.map((a) => a.id))
  }

  // 如果使用过LaTeX编辑器，推荐LaTeX相关文档
  if (profile.usedLatexEditor && (profile.latexLevel ?? 0) > 0) {
    const latexArticles = allArticles.filter(
      (a) => a.recommendedFor?.latexEditor && !path.includes(a.id) && a.id.startsWith('latex.')
    )
    additionalArticles.push(...latexArticles.map((a) => a.id))
  }

  // 如果使用过其他Markdown编辑器，推荐相关功能文档
  if (profile.usedOtherMarkdownEditor) {
    const otherEditorArticles = allArticles.filter(
      (a) => a.recommendedFor?.otherMarkdownEditor && !path.includes(a.id)
    )
    additionalArticles.push(...otherEditorArticles.map((a) => a.id))
  }

  // 添加额外推荐的文档（按分数排序）
  const scoredArticles = additionalArticles
    .map((id) => {
      const article = articleMap.get(id)
      return {
        id,
        score: article ? calculateArticleScore(article, profile) : 0,
        article
      }
    })
    .filter((item) => item.article && isArticleSuitableForProfile(item.article, profile))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5) // 最多添加5个额外文档

  // 将额外文档插入到合适的位置
  for (const item of scoredArticles) {
    if (!path.includes(item.id)) {
      // 找到合适的位置插入（考虑前置依赖）
      const article = item.article!
      let insertIndex = path.length

      // 如果有前置依赖，插入到依赖之后
      if (article.prerequisites.length > 0) {
        for (const prereqId of article.prerequisites) {
          const prereqIndex = path.indexOf(prereqId)
          if (prereqIndex >= 0) {
            insertIndex = Math.max(insertIndex, prereqIndex + 1)
          }
        }
      }

      path.splice(insertIndex, 0, item.id)
    }
  }

  // 确保前置依赖关系正确
  const sortedPath: string[] = []
  const added = new Set<string>()

  // 添加没有前置依赖的文档
  for (const id of path) {
    const article = articleMap.get(id)
    if (!article) continue
    if (
      article.prerequisites.length === 0 ||
      article.prerequisites.every((prereq) => added.has(prereq) || !path.includes(prereq))
    ) {
      sortedPath.push(id)
      added.add(id)
    }
  }

  // 添加有前置依赖的文档
  let changed = true
  while (changed && sortedPath.length < path.length) {
    changed = false
    for (const id of path) {
      if (added.has(id)) continue
      const article = articleMap.get(id)
      if (!article) continue

      const allPrereqsMet = article.prerequisites.every(
        (prereq) => !path.includes(prereq) || added.has(prereq)
      )

      if (allPrereqsMet) {
        sortedPath.push(id)
        added.add(id)
        changed = true
      }
    }
  }

  // 添加剩余的文档
  for (const id of path) {
    if (!added.has(id)) {
      sortedPath.push(id)
    }
  }

  return sortedPath
}

/**
 * 构建有向图数据结构（用于可视化）
 */
export async function buildLearningGraph(articleIds: string[]): Promise<{
  nodes: Array<{ id: string; label: string; data: ManualArticle }>
  edges: Array<{ source: string; target: string; type: 'prerequisite' | 'related' }>
}> {
  const articles = await getAllArticles()
  const articleMap = new Map(articles.map((a) => [a.id, a]))

  const nodes = articleIds
    .map((id) => {
      const article = articleMap.get(id)
      if (!article) return null
      return {
        id,
        label: article.title.zh_CN || article.title.en_US || id,
        data: article
      }
    })
    .filter((n): n is NonNullable<typeof n> => n !== null)

  const edges: Array<{ source: string; target: string; type: 'prerequisite' | 'related' }> = []

  for (const articleId of articleIds) {
    const article = articleMap.get(articleId)
    if (!article) continue

    // 添加前置依赖边
    for (const prereqId of article.prerequisites) {
      if (articleIds.includes(prereqId)) {
        edges.push({
          source: prereqId,
          target: articleId,
          type: 'prerequisite'
        })
      }
    }

    // 添加相关文档边（仅添加在路径中的）
    for (const relatedId of article.relatedArticles) {
      if (
        articleIds.includes(relatedId) &&
        !edges.some((e) => e.source === relatedId && e.target === articleId)
      ) {
        edges.push({
          source: articleId,
          target: relatedId,
          type: 'related'
        })
      }
    }
  }

  return { nodes, edges }
}

/**
 * 计算学习进度
 */
export function calculateProgress(
  articleIds: string[],
  progressMap: Map<string, ArticleProgress>
): number {
  if (articleIds.length === 0) return 0

  const completed = articleIds.filter((id) => {
    const progress = progressMap.get(id)
    return progress?.read === true
  }).length

  return Math.round((completed / articleIds.length) * 100)
}

/**
 * 解析文档内容中的内部链接
 * 格式：[[articleId|显示文本]]
 */
export function parseInternalLinks(content: string): Array<{
  fullMatch: string
  articleId: string
  displayText: string
  startIndex: number
  endIndex: number
}> {
  const linkRegex = /\[\[([^|]+)\|([^\]]+)\]\]/g
  const links: Array<{
    fullMatch: string
    articleId: string
    displayText: string
    startIndex: number
    endIndex: number
  }> = []

  let match
  while ((match = linkRegex.exec(content)) !== null) {
    links.push({
      fullMatch: match[0],
      articleId: match[1].trim(),
      displayText: match[2].trim(),
      startIndex: match.index,
      endIndex: match.index + match[0].length
    })
  }

  return links
}

/**
 * 将内部链接转换为HTML链接
 */
export function convertInternalLinksToHTML(
  content: string,
  onClick: (articleId: string) => void
): string {
  const links = parseInternalLinks(content)
  let result = content
  let offset = 0

  // 从后往前替换，避免索引偏移问题
  for (const link of links.reverse()) {
    const before = result.substring(0, link.startIndex + offset)
    const after = result.substring(link.endIndex + offset)
    const htmlLink = `<a href="#" class="manual-internal-link" data-article-id="${link.articleId}" onclick="event.preventDefault(); window.__manualNavigate?.('${link.articleId}')">${link.displayText}</a>`
    result = before + htmlLink + after
    offset += htmlLink.length - link.fullMatch.length
  }

  return result
}
