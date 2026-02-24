import { getSetting, setSetting } from './settings'
import type { UserProfile } from '../stores/userManual'

const USER_PROFILE_KEY = 'userProfile'

/**
 * 获取用户画像
 */
export async function getUserProfile(): Promise<UserProfile | null> {
  try {
    const profile = await getSetting(USER_PROFILE_KEY)
    return profile as UserProfile | null
  } catch (error) {
    console.error('获取用户画像失败:', error)
    return null
  }
}

/**
 * 保存用户画像
 */
export async function saveUserProfile(profile: UserProfile): Promise<void> {
  try {
    await setSetting(USER_PROFILE_KEY, {
      ...profile,
      completedAt: new Date().toISOString()
    })
  } catch (error) {
    console.error('保存用户画像失败:', error)
    throw error
  }
}

/**
 * 检查是否已完成用户画像问卷
 */
export async function hasCompletedProfile(): Promise<boolean> {
  try {
    const profile = await getUserProfile()
    return profile !== null && profile !== undefined && profile.completedAt !== undefined
  } catch (error) {
    console.error('检查用户画像失败:', error)
    return false
  }
}

/**
 * 根据用户画像推荐学习路径
 */
export function getRecommendedPath(profile: UserProfile | null): string[] {
  if (!profile) {
    return ['core.fileOperations']
  }

  const paths: string[] = []

  // 根据使用场景推荐
  switch (profile.scenario) {
    case 'student':
      paths.push('core.fileOperations', 'markdown.basic', 'ai.tools')
      break
    case 'researcher':
      paths.push('core.fileOperations', 'latex.basic', 'charts.mermaid', 'agent.introduction')
      break
    case 'it':
      paths.push(
        'core.fileOperations',
        'markdown.advanced',
        'charts.plantuml',
        'agent.capabilities'
      )
      break
    case 'office':
      paths.push('core.fileOperations', 'markdown.basic', 'ai.tools', 'core.export')
      break
    default:
      paths.push('core.fileOperations')
  }

  // 根据Markdown熟练度调整
  if (profile.markdownLevel === 0) {
    paths.unshift('markdown.basic')
  } else if (profile.markdownLevel === 3) {
    paths.push('markdown.advanced')
  }

  // 根据LaTeX熟练度调整
  if (profile.latexLevel !== undefined && profile.latexLevel > 0) {
    paths.push('latex.basic')
  }

  // 如果了解Agent，推荐Agent相关章节
  if (profile.knowsAgent) {
    paths.push('agent.introduction', 'agent.capabilities')
  }

  return paths
}
