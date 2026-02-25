/**
 * 字体应用验证工具
 * 用于验证UI字体、编辑器字体、预览字体是否正确应用
 */

import { getSetting } from './settings.js'

/**
 * 获取当前应用的CSS字体变量
 */
export function getAppliedFontVariables() {
  const root = document.documentElement
  const styles = window.getComputedStyle(root)

  return {
    // UI字体
    uiFont: styles.getPropertyValue('--font-family-ui').trim(),
    // 编辑器字体
    editorFont: styles.getPropertyValue('--font-family-editor').trim(),
    // 预览字体
    previewFont: styles.getPropertyValue('--font-family-preview').trim(),
    // 基础字体
    baseFont: styles.getPropertyValue('--font-family-base').trim(),
    // 中文字体后备
    chineseFont: styles.getPropertyValue('--font-family-chinese').trim()
  }
}

/**
 * 验证字体是否已加载
 * @param {string} fontFamily - 字体族名称
 * @returns {Promise<boolean>}
 */
export async function isFontLoaded(fontFamily) {
  if (!document.fonts) {
    console.warn('document.fonts API not supported')
    return true // 无法检测时默认返回true
  }

  try {
    // 提取第一个字体名称（去掉fallback）
    const primaryFont = fontFamily.split(',')[0].trim().replace(/['"]/g, '')
    await document.fonts.load(`16px "${primaryFont}"`)
    return document.fonts.check(`16px "${primaryFont}"`)
  } catch (error) {
    console.error(`检查字体 ${fontFamily} 加载状态失败:`, error)
    return false
  }
}

/**
 * 验证所有配置的字体是否已加载
 */
export async function verifyAllFontsLoaded() {
  const fontVars = getAppliedFontVariables()
  const results = {}

  // 检查UI字体
  results.uiFont = await isFontLoaded(fontVars.uiFont)

  // 检查编辑器字体（分别检查中西文）
  const editorFonts = fontVars.editorFont.split(',')
  results.editorWestern = await isFontLoaded(editorFonts[0])
  results.editorChinese = await isFontLoaded(editorFonts[1] || editorFonts[0])

  // 检查预览字体
  const previewFonts = fontVars.previewFont.split(',')
  results.previewWestern = await isFontLoaded(previewFonts[0])
  results.previewChinese = await isFontLoaded(previewFonts[1] || previewFonts[0])

  return {
    success: Object.values(results).every((r) => r),
    details: results,
    variables: fontVars
  }
}

/**
 * 获取设置中配置的字体
 */
export async function getConfiguredFonts() {
  return {
    ui: await getSetting('fontUi'),
    editorChinese: await getSetting('fontEditorChinese'),
    editorWestern: await getSetting('fontEditorWestern'),
    previewChinese: await getSetting('fontPreviewChinese'),
    previewWestern: await getSetting('fontPreviewWestern')
  }
}

/**
 * 验证字体配置是否正确应用
 */
export async function verifyFontApplication() {
  const configured = await getConfiguredFonts()
  const applied = getAppliedFontVariables()
  const loaded = await verifyAllFontsLoaded()

  // 验证CSS变量是否包含配置的字体
  const checks = {
    uiFont: applied.uiFont.includes(configured.ui),
    editorChinese: applied.editorFont.includes(configured.editorChinese),
    editorWestern: applied.editorFont.includes(configured.editorWestern),
    previewChinese: applied.previewFont.includes(configured.previewChinese),
    previewWestern: applied.previewFont.includes(configured.previewWestern)
  }

  return {
    success: Object.values(checks).every((c) => c) && loaded.success,
    configured,
    applied,
    loaded,
    checks
  }
}

/**
 * 强制刷新字体设置（重新应用）
 */
export async function refreshFontSettings() {
  const { applyCurrentTheme } = await import('./themes.js')
  await applyCurrentTheme()
  return verifyFontApplication()
}

/**
 * 在控制台打印字体诊断信息
 */
export async function diagnoseFonts() {
  console.group('🔤 字体诊断信息')

  const configured = await getConfiguredFonts()
  console.log('配置字体:', configured)

  const applied = getAppliedFontVariables()
  console.log('应用字体(CSS变量):', applied)

  const loaded = await verifyAllFontsLoaded()
  console.log('字体加载状态:', loaded)

  const verification = await verifyFontApplication()
  console.log('验证结果:', verification)

  console.groupEnd()

  return verification
}

// 开发模式下自动导出到window方便调试
if (import.meta.env?.DEV || window.location?.hash?.includes('debug')) {
  window.fontDiagnostics = {
    getAppliedFontVariables,
    isFontLoaded,
    verifyAllFontsLoaded,
    getConfiguredFonts,
    verifyFontApplication,
    refreshFontSettings,
    diagnoseFonts
  }
}
