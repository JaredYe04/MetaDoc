<template>
  <div
    class="user-profile-view"
    :style="{
      backgroundColor: themeState.currentTheme.background,
      color: themeState.currentTheme.textColor
    }"
  >
    <ScrollArea class="profile-scroll">
      <div class="profile-container">
        <h2 class="profile-title">{{ t('profile.title', '用户资料') }}</h2>

        <!-- Profile Setup Section -->
        <Card class="profile-section">
          <CardHeader>
            <CardTitle>{{ t('profile.basicInfo', '基本信息') }}</CardTitle>
            <CardDescription>{{ t('profile.basicInfoDesc', '设置您的个人资料') }}</CardDescription>
          </CardHeader>
          <CardContent class="space-y-6">
            <!-- Avatar Selection -->
            <div class="form-field">
              <Label>{{ t('profile.avatar', '头像') }}</Label>
              <div class="avatar-selection">
                <div
                  v-for="avatar in presetAvatars"
                  :key="avatar.id"
                  class="avatar-option"
                  :class="{ selected: profile.avatar === avatar.id }"
                  @click="selectAvatar(avatar.id)"
                >
                  <Avatar :class="avatar.size">
                    <AvatarImage :src="avatar.src" :alt="avatar.label" />
                    <AvatarFallback>{{ avatar.fallback }}</AvatarFallback>
                  </Avatar>
                  <span class="avatar-label">{{ avatar.label }}</span>
                </div>
              </div>
            </div>

            <!-- Username -->
            <div class="form-field">
              <Label for="username">{{ t('profile.username', '用户名') }}</Label>
              <Input
                id="username"
                v-model="profile.username"
                :placeholder="t('profile.usernamePlaceholder', '输入您的用户名')"
                class="max-w-md"
              />
            </div>

            <!-- Role Selection -->
            <div class="form-field">
              <Label for="role">{{ t('profile.role', '角色') }}</Label>
              <Select v-model="profile.role">
                <SelectTrigger class="max-w-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="student">{{ t('profile.roles.student', '学生') }}</SelectItem>
                  <SelectItem value="researcher">
                    {{ t('profile.roles.researcher', '研究者') }}
                  </SelectItem>
                  <SelectItem value="writer">{{ t('profile.roles.writer', '作家') }}</SelectItem>
                  <SelectItem value="developer">
                    {{ t('profile.roles.developer', '开发者') }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <!-- Bio -->
            <div class="form-field">
              <Label for="bio">{{ t('profile.bio', '个人简介') }}</Label>
              <Textarea
                id="bio"
                v-model="profile.bio"
                :placeholder="t('profile.bioPlaceholder', '介绍一下自己...')"
                rows="4"
                class="max-w-md"
              />
            </div>
          </CardContent>
        </Card>

        <!-- Skills Section -->
        <Card class="profile-section">
          <CardHeader>
            <CardTitle>{{ t('profile.skills', '技能') }}</CardTitle>
            <CardDescription>{{ t('profile.skillsDesc', '选择您擅长的技能') }}</CardDescription>
          </CardHeader>
          <CardContent>
            <div class="skills-grid">
              <div v-for="skill in availableSkills" :key="skill.id" class="skill-item">
                <Checkbox
                  :id="skill.id"
                  :checked="profile.skills.includes(skill.id)"
                  @update:checked="toggleSkill(skill.id)"
                />
                <Label :for="skill.id" class="skill-label">{{ skill.label }}</Label>
              </div>
            </div>

            <!-- Selected Skills Tags -->
            <div v-if="profile.skills.length > 0" class="selected-skills">
              <Label class="skills-tags-label">
                {{ t('profile.selectedSkills', '已选技能') }}
              </Label>
              <div class="skills-tags">
                <Badge
                  v-for="skillId in profile.skills"
                  :key="skillId"
                  variant="secondary"
                  closable
                  @close="removeSkill(skillId)"
                >
                  {{ getSkillLabel(skillId) }}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Preferences Section -->
        <Card class="profile-section">
          <CardHeader>
            <CardTitle>{{ t('profile.preferences', '偏好设置') }}</CardTitle>
            <CardDescription>{{
              t('profile.preferencesDesc', '自定义您的使用体验')
            }}</CardDescription>
          </CardHeader>
          <CardContent class="space-y-6">
            <!-- Theme Preference -->
            <div class="form-field">
              <Label for="theme">{{ t('profile.theme', '主题') }}</Label>
              <Select v-model="profile.theme">
                <SelectTrigger class="max-w-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">{{ t('profile.themes.light', '浅色') }}</SelectItem>
                  <SelectItem value="dark">{{ t('profile.themes.dark', '深色') }}</SelectItem>
                  <SelectItem value="system">
                    {{ t('profile.themes.system', '跟随系统') }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <!-- Default Document Format -->
            <div class="form-field">
              <Label for="defaultFormat">{{ t('profile.defaultFormat', '默认文档格式') }}</Label>
              <Select v-model="profile.defaultFormat">
                <SelectTrigger class="max-w-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="markdown">Markdown</SelectItem>
                  <SelectItem value="latex">LaTeX</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <!-- Auto-save Toggle -->
            <div class="form-field flex items-center justify-between max-w-md">
              <div>
                <Label>{{ t('profile.autoSave', '自动保存') }}</Label>
                <p class="field-description">
                  {{ t('profile.autoSaveDesc', '编辑时自动保存文档') }}
                </p>
              </div>
              <Switch v-model:checked="profile.autoSave" />
            </div>
          </CardContent>
        </Card>

        <!-- Save Button -->
        <div class="save-section">
          <Button type="primary" size="large" @click="handleSave">
            {{ t('profile.save', '保存资料') }}
          </Button>
        </div>
      </div>
      <ScrollBar />
    </ScrollArea>
  </div>
</template>

<script setup lang="ts">
import { reactive, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { Textarea } from '@renderer/components/ui/textarea'
import { Label } from '@renderer/components/ui/label'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { Switch } from '@renderer/components/ui/switch'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Avatar, AvatarImage, AvatarFallback } from '@renderer/components/ui/avatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { ScrollArea, ScrollBar } from '@renderer/components/ui/scroll-area'
import { themeState } from '../utils/themes'
import { notifySuccess, notifyInfo } from '../utils/notify'

// Demo mode support
const props = defineProps<{
  mode?: string
}>()
const isDemo = computed(() => props.mode === 'demo')

const { t } = useI18n()

// Profile data
interface Profile {
  username: string
  avatar: string
  role: string
  bio: string
  skills: string[]
  theme: string
  defaultFormat: string
  autoSave: boolean
}

const profile = reactive<Profile>({
  username: '',
  avatar: 'avatar1',
  role: 'student',
  bio: '',
  skills: [],
  theme: 'system',
  defaultFormat: 'markdown',
  autoSave: true
})

// Preset avatars
const presetAvatars = [
  { id: 'avatar1', src: '/avatars/avatar1.png', fallback: 'U1', label: '默认', size: 'h-12 w-12' },
  { id: 'avatar2', src: '/avatars/avatar2.png', fallback: 'U2', label: '商务', size: 'h-12 w-12' },
  { id: 'avatar3', src: '/avatars/avatar3.png', fallback: 'U3', label: '创意', size: 'h-12 w-12' },
  { id: 'avatar4', src: '/avatars/avatar4.png', fallback: 'U4', label: '学术', size: 'h-12 w-12' }
]

// Available skills
const availableSkills = [
  { id: 'markdown', label: 'Markdown' },
  { id: 'latex', label: 'LaTeX' },
  { id: 'ai-chat', label: 'AI 对话' },
  { id: 'writing', label: '学术写作' },
  { id: 'data-analysis', label: '数据分析' },
  { id: 'charting', label: '图表制作' },
  { id: 'ocr', label: 'OCR 识别' },
  { id: 'proofreading', label: '文档校对' },
  { id: 'translation', label: '文档翻译' },
  { id: 'knowledge-base', label: '知识库管理' }
]

// Demo data
const demoProfile: Profile = {
  username: '演示用户',
  avatar: 'avatar1',
  role: 'researcher',
  bio: '专注于学术写作和AI辅助研究',
  skills: ['markdown', 'latex', 'ai-chat'],
  theme: 'system',
  defaultFormat: 'markdown',
  autoSave: true
}

// Methods
const selectAvatar = (avatarId: string) => {
  profile.avatar = avatarId
}

const toggleSkill = (skillId: string) => {
  const index = profile.skills.indexOf(skillId)
  if (index === -1) {
    profile.skills.push(skillId)
  } else {
    profile.skills.splice(index, 1)
  }
}

const removeSkill = (skillId: string) => {
  const index = profile.skills.indexOf(skillId)
  if (index !== -1) {
    profile.skills.splice(index, 1)
  }
}

const getSkillLabel = (skillId: string): string => {
  const skill = availableSkills.find((s) => s.id === skillId)
  return skill?.label || skillId
}

const handleSave = () => {
  if (isDemo.value) {
    notifyInfo(t('profile.demoSaveHint', '演示模式：资料保存操作仅用于展示'))
    return
  }

  // In real mode, save to storage
  notifySuccess(t('profile.saveSuccess', '资料保存成功'))
}

// Load demo data
const loadDemoData = () => {
  Object.assign(profile, demoProfile)
}

onMounted(() => {
  if (isDemo.value) {
    loadDemoData()
  }
})
</script>

<style scoped>
.user-profile-view {
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.profile-scroll {
  height: 100%;
  width: 100%;
}

.profile-container {
  max-width: 720px;
  margin: 0 auto;
  padding: 32px 24px 64px;
  box-sizing: border-box;
}

.profile-title {
  margin: 0 0 24px 0;
  font-size: 24px;
  font-weight: 600;
  color: v-bind('themeState.currentTheme.textColor');
}

.profile-section {
  margin-bottom: 24px;
  background-color: v-bind('themeState.currentTheme.background2nd');
  border-color: v-bind('themeState.currentTheme.borderColor');
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-description {
  margin: 0;
  font-size: 12px;
  color: v-bind('themeState.currentTheme.textColor2');
}

/* Avatar Selection */
.avatar-selection {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.avatar-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border-radius: 12px;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s ease;
}

.avatar-option:hover {
  background-color: v-bind('themeState.currentTheme.hoverColor');
}

.avatar-option.selected {
  border-color: hsl(var(--primary));
  background-color: hsl(var(--primary) / 0.1);
}

.avatar-label {
  font-size: 12px;
  color: v-bind('themeState.currentTheme.textColor2');
}

/* Skills Grid */
.skills-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}

.skill-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  background-color: v-bind('themeState.currentTheme.background');
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.skill-item:hover {
  background-color: v-bind('themeState.currentTheme.hoverColor');
}

.skill-label {
  margin: 0;
  font-size: 14px;
  cursor: pointer;
}

/* Selected Skills */
.selected-skills {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid v-bind('themeState.currentTheme.borderColor');
}

.skills-tags-label {
  display: block;
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 500;
}

.skills-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* Save Section */
.save-section {
  display: flex;
  justify-content: center;
  padding: 24px 0;
}
</style>
