/**
 * 用户手册文档系统类型定义
 */

export interface ManualArticle {
  /** 文档唯一标识符 */
  id: string
  /** 文档标题（多语言） */
  title: {
    [locale: string]: string
  }
  /** 标签 */
  tags: string[]
  /** 难度等级：1-简单，2-中等，3-困难 */
  difficulty: 1 | 2 | 3
  /** 预计学习时间（分钟） */
  estimatedTime: number
  /** 前置文档ID列表 */
  prerequisites: string[]
  /** 相关文档ID列表 */
  relatedArticles: string[]
  /** 文档文件路径（相对于语言文件夹） */
  file: string
  /** 目标受众（可选）：student | researcher | it | office | all */
  targetAudience?: ('student' | 'researcher' | 'it' | 'office' | 'all')[]
  /** 所需经验等级（可选）：markdown | latex | agent | none */
  requiredExperience?: {
    markdown?: 0 | 1 | 2 | 3
    latex?: 0 | 1 | 2 | 3
    agent?: 0 | 1 | 2 | 3 | 4
  }
  /** 推荐给有特定工具经验的用户（可选） */
  recommendedFor?: {
    wysiwygMarkdown?: boolean
    latexEditor?: boolean
    otherMarkdownEditor?: boolean
  }
  /** 为 true 时纳入所有场景的学习路径（不因画像过滤而省略） */
  universalInLearningPath?: boolean
}

export interface ManualCategory {
  /** 类别ID */
  id: string
  /** 类别标题（多语言） */
  title: {
    [locale: string]: string
  }
  /** 图标 */
  icon: string
  /** 该类别下的文档列表 */
  articles: ManualArticle[]
}

export interface LearningPath {
  /** 路径名称（多语言） */
  name: {
    [locale: string]: string
  }
  /** 路径描述（多语言） */
  description: {
    [locale: string]: string
  }
  /** 文档ID列表（按学习顺序） */
  articles: string[]
}

export interface ManualIndex {
  /** Schema版本 */
  $schema?: string
  /** 索引版本 */
  version: string
  /** 最后更新时间 */
  lastUpdated: string
  /** 文档类别列表 */
  categories: ManualCategory[]
  /** 学习路径配置 */
  learningPaths: {
    [pathId: string]: LearningPath
  }
}

export interface UserProfile {
  /** 用户场景 */
  scenario?: 'student' | 'researcher' | 'it' | 'office' | 'other'
  /** Markdown熟练度：0-无，1-基础，2-中级，3-高级 */
  markdownLevel?: 0 | 1 | 2 | 3
  /** LaTeX熟练度：0-无，1-基础，2-中级，3-高级 */
  latexLevel?: 0 | 1 | 2 | 3
  /** Agent了解程度：0-完全不了解，1-听说过但不了解，2-了解基本概念，3-使用过，4-熟练使用 */
  agentLevel?: 0 | 1 | 2 | 3 | 4
  /** 是否使用过WYSIWYG Markdown编辑器（如Typora、Mark Text等） */
  usedWysiwygMarkdown?: boolean
  /** 是否使用过LaTeX编辑器（如Overleaf、TeXStudio、TeXworks等） */
  usedLatexEditor?: boolean
  /** 是否使用过其他Markdown编辑器（如VS Code、Obsidian等） */
  usedOtherMarkdownEditor?: boolean
  /** 主要使用场景（可多选） */
  useCases?: string[]
  /** 完成时间 */
  completedAt?: string
}

export interface ArticleProgress {
  /** 文档ID */
  articleId: string
  /** 是否已阅读 */
  read: boolean
  /** 阅读时间（秒） */
  readTime: number
  /** 最后访问时间 */
  lastAccessed: number
  /** 完成度（0-100） */
  completion: number
}

export interface SearchResult {
  /** 结果类型：'article' | 'fragment' */
  type: 'article' | 'fragment'
  /** 文档ID */
  articleId: string
  /** 文档标题 */
  title: string
  /** 匹配的文本片段 */
  fragment?: string
  /** 匹配位置（行号） */
  lineNumber?: number
  /** 相关性分数 */
  score: number
}

export interface BreadcrumbItem {
  /** 文档ID */
  articleId: string
  /** 文档标题 */
  title: string
}
