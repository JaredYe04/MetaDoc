/**
 * Steam 成就 API 名与展示用 i18n key（须与 Steamworks 成就槽位一致）。
 * 键为扁平形式：steamAch.{apiName}_NAME / steamAch.{apiName}_DESC（与 generate-steam-loc-vdf 读取一致）。
 */
export type SteamAchievementDef = {
  apiName: string
  displayNameKey: string
  descriptionKey: string
  /** 成就 #0：脚本用应用图标 */
  useAppIcon?: boolean
}

export const STEAM_ACHIEVEMENTS: SteamAchievementDef[] = [
  {
    apiName: 'ACH_META_WELCOME',
    displayNameKey: 'steamAch.ACH_META_WELCOME_NAME',
    descriptionKey: 'steamAch.ACH_META_WELCOME_DESC',
    useAppIcon: true
  },
  {
    apiName: 'ACH_ONBOARDING_DONE',
    displayNameKey: 'steamAch.ACH_ONBOARDING_DONE_NAME',
    descriptionKey: 'steamAch.ACH_ONBOARDING_DONE_DESC'
  },
  {
    apiName: 'ACH_LLM_TEST_OK',
    displayNameKey: 'steamAch.ACH_LLM_TEST_OK_NAME',
    descriptionKey: 'steamAch.ACH_LLM_TEST_OK_DESC'
  },
  {
    apiName: 'ACH_MANUAL_TRACK_DONE',
    displayNameKey: 'steamAch.ACH_MANUAL_TRACK_DONE_NAME',
    descriptionKey: 'steamAch.ACH_MANUAL_TRACK_DONE_DESC'
  },
  {
    apiName: 'ACH_FIRST_MD',
    displayNameKey: 'steamAch.ACH_FIRST_MD_NAME',
    descriptionKey: 'steamAch.ACH_FIRST_MD_DESC'
  },
  {
    apiName: 'ACH_FIRST_TEX',
    displayNameKey: 'steamAch.ACH_FIRST_TEX_NAME',
    descriptionKey: 'steamAch.ACH_FIRST_TEX_DESC'
  },
  {
    apiName: 'ACH_MD_EXPORT_PDF',
    displayNameKey: 'steamAch.ACH_MD_EXPORT_PDF_NAME',
    descriptionKey: 'steamAch.ACH_MD_EXPORT_PDF_DESC'
  },
  {
    apiName: 'ACH_DOCX_LATEX_EXPORT',
    displayNameKey: 'steamAch.ACH_DOCX_LATEX_EXPORT_NAME',
    descriptionKey: 'steamAch.ACH_DOCX_LATEX_EXPORT_DESC'
  },
  {
    apiName: 'ACH_TEX_COMPILE_PDF',
    displayNameKey: 'steamAch.ACH_TEX_COMPILE_PDF_NAME',
    descriptionKey: 'steamAch.ACH_TEX_COMPILE_PDF_DESC'
  },
  {
    apiName: 'ACH_FIRST_AIGC',
    displayNameKey: 'steamAch.ACH_FIRST_AIGC_NAME',
    descriptionKey: 'steamAch.ACH_FIRST_AIGC_DESC'
  },
  {
    apiName: 'ACH_FIRST_AGENT_CHAT',
    displayNameKey: 'steamAch.ACH_FIRST_AGENT_CHAT_NAME',
    descriptionKey: 'steamAch.ACH_FIRST_AGENT_CHAT_DESC'
  },
  {
    apiName: 'ACH_FIRST_AGENT_SKILL',
    displayNameKey: 'steamAch.ACH_FIRST_AGENT_SKILL_NAME',
    descriptionKey: 'steamAch.ACH_FIRST_AGENT_SKILL_DESC'
  },
  {
    apiName: 'ACH_FIRST_AGENT_RULE',
    displayNameKey: 'steamAch.ACH_FIRST_AGENT_RULE_NAME',
    descriptionKey: 'steamAch.ACH_FIRST_AGENT_RULE_DESC'
  },
  {
    apiName: 'ACH_WORKSHOP_PUBLISH_TEMPLATE',
    displayNameKey: 'steamAch.ACH_WORKSHOP_PUBLISH_TEMPLATE_NAME',
    descriptionKey: 'steamAch.ACH_WORKSHOP_PUBLISH_TEMPLATE_DESC'
  },
  {
    apiName: 'ACH_WORKSHOP_PUBLISH_SKILL',
    displayNameKey: 'steamAch.ACH_WORKSHOP_PUBLISH_SKILL_NAME',
    descriptionKey: 'steamAch.ACH_WORKSHOP_PUBLISH_SKILL_DESC'
  },
  {
    apiName: 'ACH_WORKSHOP_PUBLISH_RULES',
    displayNameKey: 'steamAch.ACH_WORKSHOP_PUBLISH_RULES_NAME',
    descriptionKey: 'steamAch.ACH_WORKSHOP_PUBLISH_RULES_DESC'
  },
  {
    apiName: 'ACH_WORKSHOP_PUBLISH_MCP',
    displayNameKey: 'steamAch.ACH_WORKSHOP_PUBLISH_MCP_NAME',
    descriptionKey: 'steamAch.ACH_WORKSHOP_PUBLISH_MCP_DESC'
  },
  {
    apiName: 'ACH_WORKSHOP_SUBSCRIBE_ITEM',
    displayNameKey: 'steamAch.ACH_WORKSHOP_SUBSCRIBE_ITEM_NAME',
    descriptionKey: 'steamAch.ACH_WORKSHOP_SUBSCRIBE_ITEM_DESC'
  },
  {
    apiName: 'ACH_CLOUD_DOC_SAVE',
    displayNameKey: 'steamAch.ACH_CLOUD_DOC_SAVE_NAME',
    descriptionKey: 'steamAch.ACH_CLOUD_DOC_SAVE_DESC'
  },
  {
    apiName: 'ACH_MANUAL_HOTKEY_F1',
    displayNameKey: 'steamAch.ACH_MANUAL_HOTKEY_F1_NAME',
    descriptionKey: 'steamAch.ACH_MANUAL_HOTKEY_F1_DESC'
  },
  {
    apiName: 'ACH_TABBAR_WHEEL',
    displayNameKey: 'steamAch.ACH_TABBAR_WHEEL_NAME',
    descriptionKey: 'steamAch.ACH_TABBAR_WHEEL_DESC'
  },
  {
    apiName: 'ACH_FOCUS_MODE_ONCE',
    displayNameKey: 'steamAch.ACH_FOCUS_MODE_ONCE_NAME',
    descriptionKey: 'steamAch.ACH_FOCUS_MODE_ONCE_DESC'
  },
  {
    apiName: 'ACH_FOCUS_H_1',
    displayNameKey: 'steamAch.ACH_FOCUS_H_1_NAME',
    descriptionKey: 'steamAch.ACH_FOCUS_H_1_DESC'
  },
  {
    apiName: 'ACH_FOCUS_H_10',
    displayNameKey: 'steamAch.ACH_FOCUS_H_10_NAME',
    descriptionKey: 'steamAch.ACH_FOCUS_H_10_DESC'
  },
  {
    apiName: 'ACH_FOCUS_H_100',
    displayNameKey: 'steamAch.ACH_FOCUS_H_100_NAME',
    descriptionKey: 'steamAch.ACH_FOCUS_H_100_DESC'
  },
  {
    apiName: 'ACH_FOCUS_H_500',
    displayNameKey: 'steamAch.ACH_FOCUS_H_500_NAME',
    descriptionKey: 'steamAch.ACH_FOCUS_H_500_DESC'
  },
  {
    apiName: 'ACH_FOCUS_H_1000',
    displayNameKey: 'steamAch.ACH_FOCUS_H_1000_NAME',
    descriptionKey: 'steamAch.ACH_FOCUS_H_1000_DESC'
  },
  {
    apiName: 'ACH_KB_UPLOAD_FIRST',
    displayNameKey: 'steamAch.ACH_KB_UPLOAD_FIRST_NAME',
    descriptionKey: 'steamAch.ACH_KB_UPLOAD_FIRST_DESC'
  },
  {
    apiName: 'ACH_KB_QUERY_HIT',
    displayNameKey: 'steamAch.ACH_KB_QUERY_HIT_NAME',
    descriptionKey: 'steamAch.ACH_KB_QUERY_HIT_DESC'
  },
  {
    apiName: 'ACH_OUTLINE_DRAG_REORDER',
    displayNameKey: 'steamAch.ACH_OUTLINE_DRAG_REORDER_NAME',
    descriptionKey: 'steamAch.ACH_OUTLINE_DRAG_REORDER_DESC'
  },
  {
    apiName: 'ACH_OUTLINE_FORMAT_TITLES',
    displayNameKey: 'steamAch.ACH_OUTLINE_FORMAT_TITLES_NAME',
    descriptionKey: 'steamAch.ACH_OUTLINE_FORMAT_TITLES_DESC'
  },
  {
    apiName: 'ACH_MATERIAL_BASKET_ADD',
    displayNameKey: 'steamAch.ACH_MATERIAL_BASKET_ADD_NAME',
    descriptionKey: 'steamAch.ACH_MATERIAL_BASKET_ADD_DESC'
  }
]

export const STEAM_ACHIEVEMENT_API_NAMES = STEAM_ACHIEVEMENTS.map((a) => a.apiName)
