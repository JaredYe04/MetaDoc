<template>
  <div
    class="first-run-wizard"
    :style="{
      backgroundColor: themeState.currentTheme.background,
      color: themeState.currentTheme.textColor
    }"
  >
    <header class="frw-header">
      <div class="frw-step-label text-muted-foreground">
        {{ t('onboarding.stepProgress', { current: progressCurrent, total: progressTotal }) }}
      </div>
      <div class="frw-progress">
        <div
          class="frw-progress-bar"
          :style="{
            width: `${(progressCurrent / progressTotal) * 100}%`,
            backgroundColor: 'hsl(var(--primary))'
          }"
        />
      </div>
    </header>

    <main class="frw-main">
      <!-- 1 语言 -->
      <div v-if="currentStep === 0" class="frw-panel">
        <h2 class="frw-title">{{ t('onboarding.language.title') }}</h2>
        <p class="frw-desc">{{ t('onboarding.language.subtitle') }}</p>
        <div class="frw-lang-grid">
          <button
            v-for="opt in languageOptions"
            :key="opt.id"
            type="button"
            class="frw-lang-card"
            :class="{ 'frw-lang-card--selected': selectedLocale === opt.id }"
            @click="selectLanguage(opt.id)"
          >
            <span class="frw-lang-card-label">{{ t(opt.labelKey) }}</span>
            <span class="frw-lang-card-welcome">{{ t(opt.welcomeKey) }}</span>
          </button>
        </div>
      </div>

      <!-- 2 欢迎 -->
      <div v-else-if="currentStep === 1" class="frw-panel frw-welcome">
        <div class="frw-welcome-anim">
          <div
            class="frw-logo-container"
            :class="{ 'frw-logo-container--shake': welcomeLogoShaking }"
            @click="onWelcomeLogoClick"
          >
            <div class="frw-logo-animation-inner">
              <LogoIcon
                :size="96"
                class="frw-logo"
                :bg-color="fixedLogoBg"
                :symbol-color="fixedLogoSymbol"
              />
            </div>
          </div>
        </div>
        <h2 class="frw-title">{{ t('onboarding.welcome.title') }}</h2>
        <p class="frw-desc frw-welcome-text">{{ t('onboarding.welcome.body') }}</p>
      </div>

      <!-- 3 系统文件关联 -->
      <div v-else-if="currentStep === 2" class="frw-panel frw-file-assoc-panel">
        <h2 class="frw-title">{{ t('onboarding.fileAssociation.title') }}</h2>
        <FileAssociationSettingsBlock compact :show-title="false" />
      </div>

      <!-- 4 布局 -->
      <div v-else-if="currentStep === 3" class="frw-panel">
        <h2 class="frw-title">{{ t('onboarding.layout.title') }}</h2>
        <p class="frw-desc">{{ t('onboarding.layout.subtitle') }}</p>
        <div class="frw-two-col">
          <button
            type="button"
            class="frw-layout-card"
            :class="{ 'frw-layout-card--selected': !layoutFocus }"
            @click="setLayoutChoice(false)"
          >
            <div class="frw-layout-skeleton frw-layout-skeleton--workstation" aria-hidden="true">
              <div class="frw-sk-ws-side" />
              <div class="frw-sk-ws-main">
                <div class="frw-sk-ws-top" />
                <div class="frw-sk-ws-body">
                  <div class="frw-sk-ws-block" />
                  <div class="frw-sk-ws-block frw-sk-ws-block--narrow" />
                </div>
              </div>
            </div>
            <span class="frw-layout-card-title">
              {{ t('onboarding.layout.workstation.title')
              }}<span class="frw-layout-card-badge"
                >（{{ t('onboarding.layout.workstation.badge') }}）</span
              >
            </span>
            <span class="frw-layout-card-desc">{{ t('onboarding.layout.workstation.desc') }}</span>
          </button>
          <button
            type="button"
            class="frw-layout-card"
            :class="{ 'frw-layout-card--selected': layoutFocus }"
            @click="setLayoutChoice(true)"
          >
            <div class="frw-layout-skeleton frw-layout-skeleton--focus" aria-hidden="true">
              <div class="frw-sk-f-top" />
              <div class="frw-sk-f-body" />
            </div>
            <span class="frw-layout-card-title">
              {{ t('onboarding.layout.focus.title')
              }}<span class="frw-layout-card-badge"
                >（{{ t('onboarding.layout.focus.badge') }}）</span
              >
            </span>
            <span class="frw-layout-card-desc">{{ t('onboarding.layout.focus.desc') }}</span>
          </button>
        </div>
      </div>

      <!-- 5 主题 -->
      <div v-else-if="currentStep === 4" class="frw-panel frw-theme-panel">
        <h2 class="frw-title frw-panel-head">{{ t('onboarding.theme.title') }}</h2>
        <p class="frw-desc frw-panel-head">{{ t('onboarding.theme.subtitle') }}</p>
        <div class="frw-theme-embed">
          <SettingThemeSection embedded />
        </div>
      </div>

      <!-- 6 LLM -->
      <div v-else-if="currentStep === 5" class="frw-panel frw-llm-panel">
        <h2 class="frw-title frw-panel-head">{{ t('onboarding.llm.title') }}</h2>
        <p class="frw-desc frw-panel-head">{{ t('onboarding.llm.subtitle') }}</p>
        <div class="frw-llm-scroll">
          <OnboardingLlmPanel @saved="onLlmSaved" />
        </div>
      </div>

      <!-- 7 问卷 + 编辑器模式 -->
      <div v-else-if="currentStep === 6" class="frw-panel frw-final-panel">
        <template v-if="finalPhase === 'profile'">
          <h2 class="frw-title frw-panel-head">{{ t('onboarding.profile.title') }}</h2>
          <p class="frw-desc frw-panel-head">{{ t('onboarding.profile.subtitle') }}</p>
          <div class="frw-profile-body">
            <UserProfileWizardSteps
              ref="profileStepsRef"
              embedded
              :show-skip-button="false"
              :defer-persist="true"
              :submit-label="t('onboarding.profile.continueToEditor')"
              @submitted="onProfileSubmitted"
            />
          </div>
        </template>
        <template v-else>
          <h2 class="frw-title">{{ t('onboarding.editorMode.title') }}</h2>
          <p class="frw-desc">{{ t('onboarding.editorMode.subtitle') }}</p>
          <EditorModePicker
            v-model="vditorModeChoice"
            embedded
            :show-change-later-hint="true"
            :show-confirm="false"
          />
          <p class="text-sm text-muted-foreground mt-4">
            {{ t('onboarding.editorMode.settingsHint') }}
          </p>
        </template>
      </div>
    </main>

    <footer class="frw-footer">
      <Button v-if="currentStep > 0" variant="outline" @click="goBack">{{
        t('onboarding.back')
      }}</Button>
      <div class="frw-footer-spacer" />
      <Button v-if="currentStep === 5 && !skipLlmStep" variant="ghost" @click="skipLlm">{{
        t('onboarding.llm.skipLater')
      }}</Button>
      <Button v-if="showPrimaryFooter" :disabled="primaryFooterDisabled" @click="onPrimaryFooter">
        {{ primaryFooterLabel }}
      </Button>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@renderer/components/ui/button'
import LogoIcon from '@renderer/components/LogoIcon.vue'
import SettingThemeSection from '../../views/setting/SettingThemeSection.vue'
import OnboardingLlmPanel from './OnboardingLlmPanel.vue'
import UserProfileWizardSteps from '../manual/UserProfileWizardSteps.vue'
import EditorModePicker from '../editor/EditorModePicker.vue'
import FileAssociationSettingsBlock from '../settings/FileAssociationSettingsBlock.vue'
import { themeState, FIXED_LOGO_COLORS } from '../../utils/themes'
import { useWorkspace } from '../../stores/workspace'
import { setI18nLocale } from '../../i18n.js'
import eventBus from '../../utils/event-bus.js'
import { setFocusModePersisted } from '../../composables/useFocusMode'
import { setSetting, settings, getSetting } from '../../utils/settings.js'
import {
  steamOfficialCloudEligible,
  refreshSteamOfficialCloudEligible
} from '../../utils/steam-official-cloud-eligible'
import { saveUserProfile } from '../../utils/user-profile'
import { useUserManual } from '../../stores/userManual'
import type { UserProfile } from '../../stores/userManual'

const STEP_COUNT = 7

const emit = defineEmits<{
  completed: []
}>()

const { t } = useI18n()
const { setUserProfile, setCurrentArticle } = useUserManual()
const workspace = useWorkspace()

const SESSION_MANUAL_LEARNING_HINT = 'metadoc_show_manual_learning_hint'

const welcomeLogoShaking = ref(false)
const fixedLogoBg = FIXED_LOGO_COLORS.bgColor
const fixedLogoSymbol = FIXED_LOGO_COLORS.symbolColor

function onWelcomeLogoClick() {
  welcomeLogoShaking.value = true
  window.setTimeout(() => {
    welcomeLogoShaking.value = false
  }, 1500)
}

const currentStep = ref(0)

/** Steam 官方云用户无需 BYOK 向导步骤 */
const skipLlmStep = computed(
  () => steamOfficialCloudEligible.value && settings.steamDeveloperBypassByok !== true
)

const progressTotal = computed(() => (skipLlmStep.value ? 6 : 7))

const progressCurrent = computed(() => {
  if (!skipLlmStep.value) {
    return currentStep.value + 1
  }
  if (currentStep.value <= 4) {
    return currentStep.value + 1
  }
  if (currentStep.value === 6) {
    return 6
  }
  return currentStep.value + 1
})

const selectedLocale = ref<string>('zh_CN')
const layoutFocus = ref(false)
const finalPhase = ref<'profile' | 'editor'>('profile')
const pendingProfile = ref<UserProfile | null>(null)
const vditorModeChoice = ref<'wysiwyg' | 'ir' | 'sv'>('ir')
const profileStepsRef = ref<InstanceType<typeof UserProfileWizardSteps> | null>(null)
const llmOnboardingSaved = ref(false)

const languageOptions = [
  {
    id: 'zh_CN',
    labelKey: 'onboarding.language.labels.zh_CN',
    welcomeKey: 'onboarding.language.welcome.zh_CN'
  },
  {
    id: 'zh_TW',
    labelKey: 'onboarding.language.labels.zh_TW',
    welcomeKey: 'onboarding.language.welcome.zh_TW'
  },
  {
    id: 'en_US',
    labelKey: 'onboarding.language.labels.en_US',
    welcomeKey: 'onboarding.language.welcome.en_US'
  },
  {
    id: 'ja_JP',
    labelKey: 'onboarding.language.labels.ja_JP',
    welcomeKey: 'onboarding.language.welcome.ja_JP'
  },
  {
    id: 'ko_KR',
    labelKey: 'onboarding.language.labels.ko_KR',
    welcomeKey: 'onboarding.language.welcome.ko_KR'
  },
  {
    id: 'fr_FR',
    labelKey: 'onboarding.language.labels.fr_FR',
    welcomeKey: 'onboarding.language.welcome.fr_FR'
  },
  {
    id: 'de_DE',
    labelKey: 'onboarding.language.labels.de_DE',
    welcomeKey: 'onboarding.language.welcome.de_DE'
  },
  {
    id: 'es_ES',
    labelKey: 'onboarding.language.labels.es_ES',
    welcomeKey: 'onboarding.language.welcome.es_ES'
  },
  {
    id: 'pt_BR',
    labelKey: 'onboarding.language.labels.pt_BR',
    welcomeKey: 'onboarding.language.welcome.pt_BR'
  },
  {
    id: 'ru_RU',
    labelKey: 'onboarding.language.labels.ru_RU',
    welcomeKey: 'onboarding.language.welcome.ru_RU'
  }
]

const showPrimaryFooter = computed(() => {
  if (currentStep.value === 6 && finalPhase.value === 'profile') return false
  return true
})

const primaryFooterLabel = computed(() => {
  if (currentStep.value === 6 && finalPhase.value === 'editor') return t('onboarding.finish')
  return t('onboarding.next')
})

const primaryFooterDisabled = computed(
  () => currentStep.value === 5 && !llmOnboardingSaved.value && !skipLlmStep.value
)

function onPrimaryFooter() {
  if (currentStep.value === 6 && finalPhase.value === 'editor') {
    void completeWizard()
    return
  }
  void goNext()
}

async function selectLanguage(id: string) {
  selectedLocale.value = id
  await setI18nLocale(id)
  eventBus.emit('lang-changed', id)
}

function setLayoutChoice(focus: boolean) {
  layoutFocus.value = focus
  setFocusModePersisted(focus)
}

function onProfileSubmitted(profile: UserProfile) {
  pendingProfile.value = profile
  finalPhase.value = 'editor'
}

function onLlmSaved() {
  llmOnboardingSaved.value = true
}

function skipLlm() {
  currentStep.value = 6
  finalPhase.value = 'profile'
  onEnterProfileStep()
}

async function goNext() {
  if (currentStep.value === 0) {
    await selectLanguage(selectedLocale.value)
  }
  if (currentStep.value < STEP_COUNT - 1) {
    if (currentStep.value === 4 && skipLlmStep.value) {
      currentStep.value = 6
      finalPhase.value = 'profile'
      onEnterProfileStep()
    } else {
      currentStep.value += 1
      if (currentStep.value === 6) {
        finalPhase.value = 'profile'
        onEnterProfileStep()
      }
    }
  }
}

function goBack() {
  if (currentStep.value === 6 && finalPhase.value === 'editor') {
    finalPhase.value = 'profile'
    return
  }
  if (currentStep.value > 0) {
    if (
      currentStep.value === 6 &&
      skipLlmStep.value &&
      finalPhase.value === 'profile'
    ) {
      currentStep.value = 4
      return
    }
    currentStep.value -= 1
  }
}

function onEnterProfileStep() {
  profileStepsRef.value?.open()
}

async function completeWizard() {
  const profile = pendingProfile.value
  if (profile) {
    await saveUserProfile(profile)
    await setUserProfile(profile)
  }
  const mode = vditorModeChoice.value
  await setSetting('vditorMode', mode)
  await setSetting('editorModePromptShown', true)
  await setSetting('firstRunWizardCompleted', true)
  settings.vditorMode = mode
  settings.editorModePromptShown = true
  settings.firstRunWizardCompleted = true
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(SESSION_MANUAL_LEARNING_HINT, '1')
    }
    workspace.openSystemTab('/user-manual', t('leftMenu.userManual'))
    await nextTick()
    await setCurrentArticle('quick-start.guide', 'navigation')
  } catch (e) {
    console.warn('[FirstRunWizard] post-complete navigation failed', e)
  }
  void import('../../services/steam-client').then((m) =>
    m.tryUnlockSteamAchievementByApi('ACH_ONBOARDING_DONE')
  )
  emit('completed')
}

watch(currentStep, (s, prev) => {
  if (s === 6 && finalPhase.value === 'profile') {
    onEnterProfileStep()
  }
  if (s === 5 && prev === 4) {
    llmOnboardingSaved.value = false
  }
})

onMounted(() => {
  void refreshSteamOfficialCloudEligible()
  const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('lang') : null
  if (raw) {
    const normalized = raw.replace(/-/g, '_')
    const match = languageOptions.find((o) => o.id === normalized)
    if (match) selectedLocale.value = match.id
  }
  const m = settings.vditorMode
  if (m === 'wysiwyg' || m === 'ir' || m === 'sv') vditorModeChoice.value = m
  void getSetting('focusMode').then((fm) => {
    if (typeof fm === 'boolean') layoutFocus.value = fm
  })
})
</script>

<style scoped>
.first-run-wizard {
  position: fixed;
  inset: 0;
  z-index: 10050;
  display: flex;
  flex-direction: column;
  padding: 0;
}

.frw-header {
  padding: 16px 24px 12px;
  border-bottom: 1px solid hsl(var(--border));
}

.frw-step-label {
  font-size: 13px;
  margin-bottom: 8px;
}

.frw-progress {
  height: 4px;
  border-radius: 999px;
  background: hsl(var(--muted));
  overflow: hidden;
}

.frw-progress-bar {
  height: 100%;
  border-radius: 999px;
  transition: width 0.35s ease;
}

.frw-main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 24px;
}

.frw-panel {
  max-width: 920px;
  margin: 0 auto;
  width: 100%;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.frw-llm-panel.frw-panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.frw-panel-head {
  flex-shrink: 0;
}

.frw-llm-scroll {
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding-right: 2px;
}

.frw-profile-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
}

.frw-final-panel.frw-panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.frw-theme-panel.frw-panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.frw-theme-embed {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.frw-title {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0 0 8px;
}

.frw-desc {
  font-size: 0.9375rem;
  opacity: 0.85;
  margin: 0 0 24px;
  line-height: 1.55;
}

.frw-lang-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}

.frw-lang-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 16px;
  border-radius: 12px;
  border: 2px solid hsl(var(--border));
  background: hsl(var(--card));
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}

.frw-lang-card:hover {
  border-color: hsl(var(--primary) / 0.5);
}

.frw-lang-card--selected {
  border-color: hsl(var(--primary));
  box-shadow: 0 0 0 1px hsl(var(--primary));
}

.frw-lang-card-label {
  font-weight: 600;
  font-size: 15px;
}

.frw-lang-card-welcome {
  font-size: 13px;
  line-height: 1.45;
  opacity: 0.9;
}

.frw-welcome {
  text-align: center;
}

.frw-welcome-anim {
  display: flex;
  justify-content: center;
  margin-bottom: 24px;
  animation: frw-pop 0.9s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

.frw-logo-container {
  display: inline-block;
  cursor: pointer;
  transition: transform 0.3s ease;
}

.frw-logo-container:hover {
  transform: scale(1.08);
}

.frw-logo-container--shake,
.frw-logo-container--shake:hover {
  transform: scale(1.08);
}

.frw-logo-animation-inner {
  display: inline-block;
}

.frw-logo-container--shake .frw-logo-animation-inner {
  animation: frw-logo-shake 1.5s ease-in-out;
}

@keyframes frw-logo-shake {
  0%,
  100% {
    transform: translateX(0) rotate(0deg);
  }
  10%,
  30%,
  50%,
  70%,
  90% {
    transform: translateX(-10px) rotate(-5deg);
  }
  20%,
  40%,
  60%,
  80% {
    transform: translateX(10px) rotate(5deg);
  }
}

.frw-logo {
  display: block;
  filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.15));
}

.frw-welcome-text {
  max-width: 36rem;
  margin-left: auto;
  margin-right: auto;
}

@keyframes frw-pop {
  0% {
    opacity: 0;
    transform: scale(0.85) translateY(12px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.frw-two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

@media (max-width: 640px) {
  .frw-two-col {
    grid-template-columns: 1fr;
  }
}

.frw-layout-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  padding: 26px;
  border-radius: 12px;
  border: 2px solid hsl(var(--border));
  background: hsl(var(--card));
  cursor: pointer;
  text-align: left;
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}

.frw-layout-card:hover {
  border-color: hsl(var(--primary) / 0.45);
}

.frw-layout-card--selected {
  border-color: hsl(var(--primary));
  box-shadow: 0 0 0 1px hsl(var(--primary));
}

.frw-layout-card-title {
  font-weight: 600;
  font-size: 1.05rem;
}

.frw-layout-card-desc {
  font-size: 13px;
  line-height: 1.5;
  opacity: 0.88;
}

.frw-layout-card-badge {
  font-weight: 500;
  opacity: 0.92;
}

.frw-layout-skeleton {
  align-self: stretch;
  width: 100%;
  border-radius: 8px;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--muted) / 0.35);
  padding: 8px;
  margin-bottom: 4px;
}

.frw-layout-skeleton--workstation {
  display: flex;
  gap: 6px;
  height: 94px;
}

.frw-sk-ws-side {
  width: 18%;
  min-width: 20px;
  border-radius: 4px;
  background: hsl(var(--muted-foreground) / 0.12);
}

.frw-sk-ws-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.frw-sk-ws-top {
  height: 10px;
  border-radius: 3px;
  background: hsl(var(--muted-foreground) / 0.14);
}

.frw-sk-ws-body {
  flex: 1;
  display: flex;
  gap: 6px;
  min-height: 0;
}

.frw-sk-ws-block {
  flex: 1;
  border-radius: 4px;
  background: hsl(var(--muted-foreground) / 0.1);
}

.frw-sk-ws-block--narrow {
  flex: 0 0 32%;
}

.frw-layout-skeleton--focus {
  display: flex;
  flex-direction: column;
  gap: 6px;
  height: 94px;
}

.frw-sk-f-top {
  height: 10px;
  border-radius: 3px;
  background: hsl(var(--muted-foreground) / 0.14);
}

.frw-sk-f-body {
  flex: 1;
  border-radius: 4px;
  background: hsl(var(--muted-foreground) / 0.1);
}

.frw-theme-panel :deep(.theme-settings) {
  padding: 0;
}

.frw-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid hsl(var(--border));
}

.frw-footer-spacer {
  flex: 1;
}
</style>
