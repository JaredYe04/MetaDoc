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
  }
]

export const STEAM_ACHIEVEMENT_API_NAMES = STEAM_ACHIEVEMENTS.map((a) => a.apiName)
