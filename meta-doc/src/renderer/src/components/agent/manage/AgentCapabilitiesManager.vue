<template>
  <div class="agent-capabilities-manager" :style="containerStyle">
    <!-- 从侧边栏分别打开时 initialPanel 有值：仅展示对应一块面板，不显示 Tab 切换（三合一已拆成三个入口） -->
    <Tabs :model-value="activeTab" class="w-full capabilities-tabs-root" @update:model-value="onTabsUpdate">
      <TabsList v-if="!singlePanelMode" class="grid w-full grid-cols-3 mb-4">
        <TabsTrigger value="rules">{{ t('agent.manage.capabilities.tabRules') }}</TabsTrigger>
        <TabsTrigger value="skills">{{ t('agent.manage.capabilities.tabSkills') }}</TabsTrigger>
        <TabsTrigger value="mcp">{{ t('agent.manage.capabilities.tabMcp') }}</TabsTrigger>
      </TabsList>

      <TabsContent value="rules" class="mt-0">
        <div class="flex justify-between items-center mb-3 gap-2 flex-wrap">
          <Button size="small" @click="loadRules">{{ t('agent.manage.capabilities.refresh') }}</Button>
          <div class="flex gap-2 flex-wrap">
            <Button type="primary" size="small" @click="openRuleDialog('create')">
              {{ t('agent.manage.capabilities.addRule') }}
            </Button>
            <Button variant="outline" size="small" @click="openAiAssistRuleStandalone">
              {{ t('agent.manage.capabilities.aiAssistCreate') }}
            </Button>
          </div>
        </div>
        <ScrollArea class="h-[min(55vh,480px)] border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead class="w-[100px]">{{ t('agent.manage.capabilities.colScope') }}</TableHead>
                <TableHead>{{ t('agent.manage.capabilities.colTitle') }}</TableHead>
                <TableHead class="w-[70px]">{{ t('agent.manage.capabilities.colPriority') }}</TableHead>
                <TableHead class="w-[80px]">{{ t('agent.manage.capabilities.colEnabled') }}</TableHead>
                <TableHead class="w-[100px]">{{ t('agent.manage.capabilities.colApproval') }}</TableHead>
                <TableHead class="w-[160px]">{{ t('agent.manage.actions') }}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="r in rules" :key="r.id">
                <TableCell>
                  <Badge :variant="r.scope === 'system' ? 'default' : 'secondary'">{{ r.scope }}</Badge>
                </TableCell>
                <TableCell class="max-w-[220px]">
                  <div class="font-medium truncate" :title="r.title">{{ r.title }}</div>
                  <div class="text-xs opacity-70 line-clamp-2" :title="r.content">{{ r.content }}</div>
                </TableCell>
                <TableCell>{{ r.priority }}</TableCell>
                <TableCell>
                  <Switch
                    v-if="r.scope !== 'system'"
                    :checked="r.enabled === 1"
                    :disabled="ruleBusyId === r.id"
                    @update:checked="(v: boolean) => setRuleEnabled(r, v)"
                  />
                  <span v-else class="text-xs opacity-60">—</span>
                </TableCell>
                <TableCell>
                  <span class="text-xs">{{ r.approval_status }}</span>
                </TableCell>
                <TableCell>
                  <div class="flex flex-wrap gap-1">
                    <Button
                      v-if="r.scope !== 'system' && r.approval_status === 'pending'"
                      size="small"
                      variant="outline"
                      @click="approveRule(r.id, 'approved')"
                    >
                      {{ t('agent.manage.capabilities.approve') }}
                    </Button>
                    <Button
                      v-if="r.scope !== 'system' && r.approval_status === 'pending'"
                      size="small"
                      variant="ghost"
                      @click="approveRule(r.id, 'rejected')"
                    >
                      {{ t('agent.manage.capabilities.reject') }}
                    </Button>
                    <Button
                      v-if="r.scope !== 'system'"
                      size="small"
                      variant="secondary"
                      @click="openRuleDialog('edit', r)"
                    >
                      {{ t('common.edit') }}
                    </Button>
                    <Button
                      v-if="r.scope !== 'system'"
                      size="small"
                      variant="ghost"
                      class="text-destructive"
                      @click="deleteRule(r)"
                    >
                      {{ t('agent.manage.delete') }}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="skills" class="mt-0">
        <p class="text-sm opacity-70 mb-2">{{ t('agent.manage.capabilities.skillsRefreshHint') }}</p>
        <div class="flex justify-between items-center mb-3 gap-2 flex-wrap">
          <Button size="small" :disabled="skillsSyncing" @click="refreshSkillsFull">
            {{ t('agent.manage.capabilities.refresh') }}
          </Button>
          <div class="flex gap-2 flex-wrap">
            <Button type="primary" size="small" :disabled="skillsSyncing" @click="openSkillDialog('create')">
              {{ t('agent.manage.capabilities.newSkill') }}
            </Button>
            <Button variant="outline" size="small" :disabled="skillsSyncing" @click="openAiAssistSkillStandalone">
              {{ t('agent.manage.capabilities.aiAssistCreate') }}
            </Button>
          </div>
        </div>
        <ScrollArea class="h-[min(55vh,480px)] border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead class="w-[50px]">ID</TableHead>
                <TableHead>{{ t('agent.manage.capabilities.colName') }}</TableHead>
                <TableHead>{{ t('agent.manage.capabilities.colFolder') }}</TableHead>
                <TableHead>{{ t('agent.manage.capabilities.colStatus') }}</TableHead>
                <TableHead class="w-[220px]">{{ t('agent.manage.actions') }}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="s in skills" :key="s.id">
                <TableCell>{{ s.id }}</TableCell>
                <TableCell class="max-w-[200px] truncate" :title="s.name">{{ s.name }}</TableCell>
                <TableCell class="max-w-[240px]">
                  <div class="text-xs truncate" :title="s.workspace_root">{{ s.skill_folder }}</div>
                </TableCell>
                <TableCell>
                  <Badge :variant="s.status === 'active' ? 'default' : 'secondary'">{{ s.status }}</Badge>
                </TableCell>
                <TableCell>
                  <div class="flex flex-wrap gap-1">
                    <Button size="small" variant="secondary" :disabled="skillBusyId === s.id" @click="openSkillDialog('edit', s)">
                      {{ t('common.edit') }}
                    </Button>
                    <Button
                      v-if="s.status === 'draft'"
                      size="small"
                      type="primary"
                      :disabled="skillBusyId === s.id"
                      @click="activateSkill(s.id)"
                    >
                      {{ t('agent.manage.capabilities.activate') }}
                    </Button>
                    <Button
                      size="small"
                      variant="ghost"
                      class="text-destructive"
                      :disabled="skillBusyId === s.id"
                      @click="confirmDeleteSkill(s)"
                    >
                      {{ t('agent.manage.delete') }}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="mcp" class="mt-0 space-y-4">
        <div>
          <h4 class="text-sm font-medium mb-2">{{ t('agent.manage.capabilities.mcpConnections') }}</h4>
          <p v-if="activeMcpDisplay" class="text-xs font-mono opacity-80 mb-2 break-all">
            {{ t('agent.manage.capabilities.mcpActiveUrl') }}: {{ activeMcpDisplay }}
          </p>
          <div class="flex flex-wrap gap-3 mb-3 items-end">
            <FormField :label="t('agent.manage.capabilities.mcpLabel')" name="mcpNewLabel" class="min-w-[140px]">
              <Input v-model="mcpNew.label" class="w-full" />
            </FormField>
            <FormField :label="t('agent.manage.capabilities.mcpBaseUrl')" name="mcpNewUrl" class="flex-1 min-w-[220px]">
              <Input
                v-model="mcpNew.baseUrl"
                class="w-full font-mono text-sm"
                placeholder="http://127.0.0.1:3000/mcp"
              />
            </FormField>
            <Button
              type="primary"
              size="small"
              :disabled="mcpBusy || !mcpNew.baseUrl.trim()"
              @click="submitAddMcpConnection"
            >
              {{ t('agent.manage.capabilities.mcpAddConnection') }}
            </Button>
          </div>
          <ScrollArea class="h-[min(24vh,220px)] border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead class="w-[72px]">{{ t('agent.manage.capabilities.colStatus') }}</TableHead>
                  <TableHead>{{ t('agent.manage.capabilities.mcpLabel') }}</TableHead>
                  <TableHead>{{ t('agent.manage.capabilities.mcpBaseUrl') }}</TableHead>
                  <TableHead class="w-[260px]">{{ t('agent.manage.actions') }}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="c in mcpConnections" :key="c.id">
                  <TableCell>
                    <Badge v-if="c.is_active === 1" variant="default">active</Badge>
                    <span v-else class="text-xs opacity-60">—</span>
                  </TableCell>
                  <TableCell class="max-w-[160px] truncate" :title="c.label">{{ c.label }}</TableCell>
                  <TableCell class="max-w-[280px] font-mono text-xs truncate" :title="c.base_url">
                    {{ c.base_url }}
                  </TableCell>
                  <TableCell>
                    <div class="flex flex-wrap gap-1">
                      <Button
                        v-if="c.is_active !== 1"
                        size="small"
                        variant="outline"
                        :disabled="mcpBusy"
                        @click="setMcpConnectionActive(c.id)"
                      >
                        {{ t('agent.manage.capabilities.mcpSetActive') }}
                      </Button>
                      <Button size="small" variant="secondary" :disabled="mcpBusy" @click="openMcpEditDialog(c)">
                        {{ t('common.edit') }}
                      </Button>
                      <Button
                        size="small"
                        variant="ghost"
                        class="text-destructive"
                        :disabled="mcpBusy"
                        @click="confirmDeleteMcpConnection(c)"
                      >
                        {{ t('agent.manage.capabilities.mcpDeleteConnection') }}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </ScrollArea>
        </div>

        <div>
          <div class="flex justify-between items-center mb-2 gap-2 flex-wrap">
            <p class="text-sm opacity-70 flex-1 min-w-[200px]">{{ t('agent.manage.capabilities.mcpHint') }}</p>
            <Button size="small" :disabled="mcpBusy" @click="loadMcpToolsOnly">
              {{ t('agent.manage.capabilities.mcpRefreshTools') }}
            </Button>
          </div>
          <ScrollArea class="h-[min(48vh,420px)] border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{{ t('agent.manage.capabilities.colServer') }}</TableHead>
                  <TableHead>{{ t('agent.manage.capabilities.colTool') }}</TableHead>
                  <TableHead>{{ t('agent.manage.capabilities.colPermission') }}</TableHead>
                  <TableHead>{{ t('agent.manage.capabilities.colDescription') }}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="m in mcpTools" :key="m.id">
                  <TableCell class="font-mono text-xs">{{ m.server_name || '—' }}</TableCell>
                  <TableCell class="font-mono text-xs">{{ m.tool_name }}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{{ m.permission_level }}</Badge>
                  </TableCell>
                  <TableCell class="max-w-[280px] text-sm line-clamp-2" :title="m.description || ''">
                    {{ m.description || '—' }}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </ScrollArea>
        </div>
      </TabsContent>
    </Tabs>

    <Dialog v-model:open="ruleDialogOpen">
      <DialogContent class="max-w-[640px] max-h-[90vh] flex flex-col" :style="dialogStyle">
        <DialogHeader>
          <DialogTitle>
            {{
              ruleDialogMode === 'create'
                ? t('agent.manage.capabilities.addRule')
                : t('agent.manage.capabilities.editRule')
            }}
          </DialogTitle>
        </DialogHeader>
        <div class="space-y-3 overflow-y-auto flex-1 min-h-0 pr-1">
          <FormField :label="t('agent.manage.capabilities.colTitle')" name="title">
            <Input v-model="ruleForm.title" class="w-full" />
          </FormField>
          <FormField :label="t('agent.manage.capabilities.ruleContent')" name="content">
            <Textarea v-model="ruleForm.content" :rows="8" class="w-full font-mono text-sm" />
          </FormField>
          <FormField
            :label="t('agent.manage.capabilities.colPriority')"
            name="priority"
            :description="t('agent.manage.capabilities.priorityHint')"
          >
            <Input v-model.number="ruleForm.priority" type="number" min="0" max="100" class="w-full max-w-[120px]" />
          </FormField>
        </div>
        <DialogFooter class="flex gap-2 justify-end">
          <Button variant="ghost" @click="ruleDialogOpen = false">{{ t('common.cancel') }}</Button>
          <Button type="primary" :disabled="!ruleForm.title.trim()" @click="submitRuleForm">
            {{ t('common.save') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="skillDialogOpen">
      <DialogContent class="max-w-[min(920px,96vw)] max-h-[92vh] flex flex-col" :style="dialogStyle">
        <DialogHeader>
          <DialogTitle>
            {{
              skillDialogMode === 'create'
                ? t('agent.manage.capabilities.newSkill')
                : t('agent.manage.capabilities.editSkill')
            }}
          </DialogTitle>
        </DialogHeader>
        <div class="flex flex-col gap-3 flex-1 min-h-0 overflow-hidden">
          <div v-if="skillDialogMode === 'create'" class="grid gap-3 sm:grid-cols-2">
            <FormField :label="t('agent.manage.capabilities.skillWorkspace')" name="ws">
              <select
                v-model="skillWorkspaceRoot"
                class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option v-for="w in workspaceRootOptions" :key="w" :value="w">{{ w }}</option>
              </select>
            </FormField>
            <FormField :label="t('agent.manage.capabilities.skillFolder')" name="folder">
              <Input
                v-model="skillFolderSlug"
                class="w-full font-mono text-sm"
                :placeholder="t('agent.manage.capabilities.skillFolderPlaceholder')"
              />
            </FormField>
          </div>
          <div v-else class="text-xs font-mono opacity-80 break-all">
            {{ skillEditDiskPath }}
          </div>
          <div class="grid gap-2 sm:grid-cols-2">
            <FormField :label="t('agent.manage.capabilities.colName')" name="sname">
              <Input v-model="skillMetaForm.name" class="w-full" />
            </FormField>
            <FormField :label="t('agent.manage.capabilities.skillEntry')" name="entry">
              <Input v-model="skillMetaForm.entry" class="w-full font-mono text-sm" />
            </FormField>
            <FormField class="sm:col-span-2" :label="t('agent.manage.capabilities.skillDescription')" name="sdesc">
              <Input v-model="skillMetaForm.description" class="w-full" />
            </FormField>
            <FormField class="sm:col-span-2" :label="t('agent.manage.capabilities.skillTags')" name="tags">
              <Input
                v-model="skillMetaForm.tagsCsv"
                class="w-full font-mono text-sm"
                :placeholder="t('agent.manage.capabilities.skillTagsHint')"
              />
            </FormField>
            <div class="sm:col-span-2 flex items-center gap-2">
              <Switch :checked="skillMetaForm.draft" @update:checked="(v: boolean) => (skillMetaForm.draft = v)" />
              <span class="text-sm">{{ t('agent.manage.capabilities.skillDraft') }}</span>
            </div>
          </div>
          <div class="flex flex-wrap gap-2 items-center">
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button size="small" variant="secondary">
                  {{ t('agent.manage.capabilities.syncMetaMenu') }}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem @select="applySkillMetadataToDocument">
                  {{ t('agent.manage.capabilities.syncMetaFromForm') }}
                </DropdownMenuItem>
                <DropdownMenuItem @select="syncSkillFormFromEditor">
                  {{ t('agent.manage.capabilities.syncMetaFromBody') }}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="small" variant="outline" :disabled="!skillSkillMdPath" @click="openSkillFolderInExplorer">
              {{ t('agent.manage.capabilities.openSkillFolder') }}
            </Button>
          </div>
          <div class="flex-1 min-h-[260px] flex flex-col min-w-0 border rounded-md overflow-hidden">
            <SkillMdMonacoField v-model="skillMdContent" min-height="260px" />
          </div>
        </div>
        <DialogFooter class="flex gap-2 justify-end">
          <Button variant="ghost" :disabled="skillSaving" @click="skillDialogOpen = false">{{
            t('common.cancel')
          }}</Button>
          <Button type="primary" :disabled="skillSaving || !canSaveSkill" @click="saveSkillDialog">
            {{ t('common.save') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="mcpEditOpen">
      <DialogContent class="max-w-[520px]" :style="dialogStyle">
        <DialogHeader>
          <DialogTitle>{{ t('agent.manage.capabilities.mcpEditConnection') }}</DialogTitle>
        </DialogHeader>
        <div class="space-y-3">
          <FormField :label="t('agent.manage.capabilities.mcpLabel')" name="mcpEditLabel">
            <Input v-model="mcpEdit.label" class="w-full" />
          </FormField>
          <FormField :label="t('agent.manage.capabilities.mcpBaseUrl')" name="mcpEditUrl">
            <Input v-model="mcpEdit.base_url" class="w-full font-mono text-sm" />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="ghost" @click="mcpEditOpen = false">{{ t('common.cancel') }}</Button>
          <Button type="primary" :disabled="mcpBusy || !mcpEdit.base_url.trim()" @click="submitMcpEdit">
            {{ t('agent.manage.capabilities.mcpSaveConnection') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from '@renderer/utils/toast'
import { messageBox } from '../../../utils/messageBox'
import { themeState } from '../../../utils/themes'
import messageBridge from '../../../bridge/message-bridge'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { Switch } from '@renderer/components/ui/switch'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import SkillMdMonacoField from './SkillMdMonacoField.vue'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@renderer/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { Textarea } from '@renderer/components/ui/textarea'
import { FormField } from '@renderer/components/ui/form'

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    /** 仅展示单一面板且不显示 Tab 切换（由侧边栏分别打开） */
    initialPanel?: 'rules' | 'skills' | 'mcp' | null
  }>(),
  { initialPanel: null }
)

const singlePanelMode = computed(
  () => props.initialPanel === 'rules' || props.initialPanel === 'skills' || props.initialPanel === 'mcp'
)

const activeTab = ref<'rules' | 'skills' | 'mcp'>('rules')

watch(
  () => props.initialPanel,
  (p) => {
    if (p === 'rules' || p === 'skills' || p === 'mcp') {
      activeTab.value = p
    }
  },
  { immediate: true }
)

function onTabsUpdate(v: string | number) {
  if (singlePanelMode.value) return
  const s = String(v)
  if (s === 'rules' || s === 'skills' || s === 'mcp') {
    activeTab.value = s
  }
}

const emit = defineEmits<{
  requestAgentDraft: [payload: { draft: string; sessionTitle: string; focusAgentTab: true }]
}>()

/** 英文提示，冒号后由用户或已填内容接续 */
const SKILL_AI_PROMPT_PREFIX = `You are helping the user add or update a MetaDoc workspace Agent skill. Skills live at \`<workspace>/.metadoc/skills/<folder>/SKILL.md\`.

Use the appropriate tools: prefer \`create_workspace_skill\` (skillFolder, skillMarkdown; optional workspaceRoot) for new skills; use workspace file tools to edit existing files, then call \`sync_workspace_skills\` if needed. Use YAML frontmatter (name, description, optional entry, tags) and set \`draft: true\` when the skill should stay inactive until approved in Agent → Rules / Skills / MCP.

Request: `

const RULE_AI_PROMPT_PREFIX = `You are helping the user add or refine a MetaDoc **dynamic Agent rule**. Rules are stored in the app SQLite database and injected into the system prompt when enabled and approved.

Use the tool **create_dynamic_rule** with \`title\`, \`content\`, and optional \`priority\` (0–100, default 90; higher = higher precedence). Use **update_dynamic_rule** with \`ruleId\` to change an existing dynamic rule. Do **not** create workspace files as a substitute for rules.

Request: `

const DEFAULT_NEW_SKILL_MD = `---
name: my-skill
description: One-line description of when to use this skill
entry: SKILL.md
tags: []
draft: true
---

# My skill

## When to use
- Describe scenarios.

## Instructions
- Step-by-step guidance for the agent.
`

interface RuleRow {
  id: number
  scope: string
  title: string
  content: string
  priority: number
  enabled: number
  approval_status: string
  source: string
}

interface SkillSummary {
  id: number
  workspace_root: string
  skill_folder: string
  name: string
  description: string | null
  entry: string | null
  tags_json: string | null
  status: string
}

interface McpRow {
  id: number
  tool_name: string
  server_name: string
  description: string | null
  input_schema_json: string | null
  permission_level: string
  enabled: number
}

interface McpConnectionRow {
  id: number
  label: string
  base_url: string
  is_active: number
  created_at: string
  updated_at: string
}

const rules = ref<RuleRow[]>([])
const skills = ref<SkillSummary[]>([])
const mcpTools = ref<McpRow[]>([])
const mcpConnections = ref<McpConnectionRow[]>([])
const activeMcpRow = ref<McpConnectionRow | null>(null)
const activeMcpDisplay = computed(() => activeMcpRow.value?.base_url ?? '')
const mcpNew = ref({ label: '', baseUrl: '' })
const mcpBusy = ref(false)
const mcpEditOpen = ref(false)
const mcpEdit = ref({ id: 0, label: '', base_url: '' })
const skillsSyncing = ref(false)
const ruleBusyId = ref<number | null>(null)
const skillBusyId = ref<number | null>(null)
const ruleDialogOpen = ref(false)
const ruleDialogMode = ref<'create' | 'edit'>('create')
const ruleEditId = ref<number | null>(null)
const ruleForm = reactive({ title: '', content: '', priority: 90 })

const skillDialogOpen = ref(false)
const skillDialogMode = ref<'create' | 'edit'>('create')
const skillEditId = ref<number | null>(null)
const skillWorkspaceRoot = ref('')
const skillFolderSlug = ref('')
const skillMdContent = ref('')
const skillEditDiskPath = ref('')
const skillSaving = ref(false)
const skillMetaForm = reactive({
  name: '',
  description: '',
  entry: 'SKILL.md',
  tagsCsv: '',
  draft: true
})

const workspaceRootOptions = computed(() => workspaceRoots())

const skillSkillMdPath = computed(() => {
  if (skillDialogMode.value === 'edit' && skillEditDiskPath.value) return skillEditDiskPath.value
  const root = skillWorkspaceRoot.value.trim()
  const folder = skillFolderSlug.value.trim()
  if (!root || !folder) return ''
  return joinUnderWorkspace(root, '.metadoc', 'skills', folder, 'SKILL.md')
})

const canSaveSkill = computed(() => {
  if (!skillMdContent.value.trim()) return false
  if (skillDialogMode.value === 'create') {
    return (
      !!skillWorkspaceRoot.value.trim() &&
      /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(skillFolderSlug.value.trim())
    )
  }
  return !!skillEditDiskPath.value
})

const containerStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor,
  padding: '12px 4px',
  minHeight: '420px'
}))

const dialogStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

function workspaceRoots(): string[] {
  try {
    const raw = localStorage.getItem('workspaceFolders')
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((p: unknown) => typeof p === 'string' && p.length > 0) : []
  } catch {
    return []
  }
}

function joinUnderWorkspace(root: string, ...segments: string[]): string {
  const win = /^[A-Za-z]:/.test(root)
  const sep = win ? '\\' : '/'
  const base = root.replace(/[/\\]+$/, '')
  return base + sep + segments.join(sep)
}

function extractSkillBody(md: string): string {
  const fmMatch = md.match(/^---\s*\n[\s\S]*?\n---\s*\n?/)
  return fmMatch ? md.slice(fmMatch[0].length) : md
}

function yq(s: string): string {
  return JSON.stringify(s)
}

function buildSkillMarkdownFrontmatter(f: {
  name: string
  description: string
  entry: string
  tagsCsv: string
  draft: boolean
}): string {
  const tags = f.tagsCsv
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
  const tagsLine = tags.length ? `[${tags.map((x) => yq(x)).join(', ')}]` : '[]'
  return `---
name: ${yq(f.name)}
description: ${yq(f.description)}
entry: ${yq(f.entry || 'SKILL.md')}
tags: ${tagsLine}
draft: ${f.draft}
---

`
}

function applyFormToSkillMd(md: string, f: typeof skillMetaForm): string {
  const body = extractSkillBody(md).replace(/^\n+/, '')
  return buildSkillMarkdownFrontmatter(f) + body
}

function parseSkillMetaFromMarkdown(md: string): void {
  const fmMatch = md.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/)
  skillMetaForm.name = ''
  skillMetaForm.description = ''
  skillMetaForm.entry = 'SKILL.md'
  skillMetaForm.tagsCsv = ''
  skillMetaForm.draft = false
  if (fmMatch) {
    for (const line of fmMatch[1].split('\n')) {
      const m = line.match(/^(\w+)\s*:\s*(.*)$/)
      if (!m) continue
      const key = m[1].toLowerCase()
      let val = m[2].trim()
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1)
      }
      if (key === 'name') skillMetaForm.name = val
      else if (key === 'description') skillMetaForm.description = val
      else if (key === 'entry') skillMetaForm.entry = val || 'SKILL.md'
      else if (key === 'tags') {
        skillMetaForm.tagsCsv = val
          .replace(/^\[/, '')
          .replace(/\]$/, '')
          .split(',')
          .map((s) => s.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean)
          .join(', ')
      } else if (key === 'draft' && (val === 'true' || val === '1')) skillMetaForm.draft = true
    }
  }
  const body = extractSkillBody(md)
  if (!skillMetaForm.name) {
    const h = body.match(/^#\s+(.+)/m)
    skillMetaForm.name = h ? h[1].trim() : 'skill'
  }
  if (!skillMetaForm.description) {
    skillMetaForm.description = body.slice(0, 200).replace(/\s+/g, ' ').trim()
  }
}

async function loadRules() {
  const res = await messageBridge.invoke('agent-capabilities-list-rules')
  if (res?.success && Array.isArray(res.rules)) {
    rules.value = res.rules
  } else {
    toast.error(res?.message || t('agent.manage.capabilities.loadFailed'))
  }
}

async function loadSkills() {
  const res = await messageBridge.invoke('agent-capabilities-list-skill-summaries')
  if (res?.success && Array.isArray(res.summaries)) {
    skills.value = res.summaries
  } else {
    toast.error(res?.message || t('agent.manage.capabilities.loadFailed'))
  }
}

async function loadMcpToolsOnly() {
  const res = await messageBridge.invoke('agent-capabilities-list-mcp-tools')
  if (res?.success && Array.isArray(res.tools)) {
    mcpTools.value = res.tools
  } else {
    toast.error(res?.message || t('agent.manage.capabilities.loadFailed'))
  }
}

async function loadMcpConnections() {
  const res = await messageBridge.invoke('agent-capabilities-list-mcp-connections')
  if (res?.success && Array.isArray(res.connections)) {
    mcpConnections.value = res.connections
    activeMcpRow.value = res.active ?? null
  } else {
    toast.error(res?.message || t('agent.manage.capabilities.loadFailed'))
  }
}

async function submitAddMcpConnection() {
  mcpBusy.value = true
  try {
    const res = await messageBridge.invoke('agent-capabilities-add-mcp-connection', {
      label: mcpNew.value.label.trim() || mcpNew.value.baseUrl.trim(),
      baseUrl: mcpNew.value.baseUrl.trim()
    })
    if (res?.success) {
      toast.success(t('agent.manage.capabilities.saveOk'))
      mcpNew.value = { label: '', baseUrl: '' }
      await loadMcpConnections()
    } else {
      toast.error(res?.message || t('agent.manage.capabilities.saveFailed'))
    }
  } finally {
    mcpBusy.value = false
  }
}

function openMcpEditDialog(c: McpConnectionRow) {
  mcpEdit.value = { id: c.id, label: c.label, base_url: c.base_url }
  mcpEditOpen.value = true
}

async function submitMcpEdit() {
  mcpBusy.value = true
  try {
    const res = await messageBridge.invoke('agent-capabilities-update-mcp-connection', {
      id: mcpEdit.value.id,
      label: mcpEdit.value.label.trim(),
      baseUrl: mcpEdit.value.base_url.trim()
    })
    if (res?.success) {
      toast.success(t('agent.manage.capabilities.saveOk'))
      mcpEditOpen.value = false
      await loadMcpConnections()
    } else {
      toast.error(res?.message || t('agent.manage.capabilities.saveFailed'))
    }
  } finally {
    mcpBusy.value = false
  }
}

async function setMcpConnectionActive(id: number) {
  mcpBusy.value = true
  try {
    const res = await messageBridge.invoke('agent-capabilities-set-active-mcp-connection', { id })
    if (res?.success) {
      toast.success(t('agent.manage.capabilities.saveOk'))
      activeMcpRow.value = res.active ?? null
      await loadMcpConnections()
    } else {
      toast.error(res?.message || t('agent.manage.capabilities.saveFailed'))
    }
  } finally {
    mcpBusy.value = false
  }
}

async function confirmDeleteMcpConnection(c: McpConnectionRow) {
  try {
    await messageBox.confirm(
      t('common.confirmDelete', { name: c.label || c.base_url }),
      t('common.confirm'),
      { type: 'warning' }
    )
  } catch {
    return
  }
  mcpBusy.value = true
  try {
    const res = await messageBridge.invoke('agent-capabilities-delete-mcp-connection', { id: c.id })
    if (res?.success) {
      toast.success(t('agent.manage.capabilities.saveOk'))
      await loadMcpConnections()
    } else {
      toast.error(res?.message || t('agent.manage.capabilities.saveFailed'))
    }
  } finally {
    mcpBusy.value = false
  }
}

async function setRuleEnabled(r: RuleRow, enabled: boolean) {
  ruleBusyId.value = r.id
  try {
    const res = await messageBridge.invoke('agent-capabilities-set-rule-enabled', {
      id: r.id,
      enabled
    })
    if (res?.success) {
      r.enabled = enabled ? 1 : 0
      toast.success(t('agent.manage.capabilities.saveOk'))
    } else {
      toast.error(res?.message || t('agent.manage.capabilities.saveFailed'))
    }
  } finally {
    ruleBusyId.value = null
  }
}

async function approveRule(id: number, status: 'approved' | 'rejected') {
  const res = await messageBridge.invoke('agent-capabilities-approve-rule', { id, status })
  if (res?.success) {
    toast.success(t('agent.manage.capabilities.saveOk'))
    await loadRules()
  } else {
    toast.error(res?.message || t('agent.manage.capabilities.saveFailed'))
  }
}

async function deleteRule(r: RuleRow) {
  try {
    await messageBox.confirm(
      t('agent.manage.capabilities.confirmDeleteRule', { title: r.title }),
      t('common.confirm'),
      { type: 'warning' }
    )
  } catch {
    return
  }
  const res = await messageBridge.invoke('agent-capabilities-delete-rule', { id: r.id })
  if (res?.success) {
    toast.success(t('agent.manage.capabilities.saveOk'))
    await loadRules()
  } else {
    toast.error(res?.message || t('agent.manage.capabilities.saveFailed'))
  }
}

function openRuleDialog(mode: 'create' | 'edit', r?: RuleRow) {
  ruleDialogMode.value = mode
  if (mode === 'create') {
    ruleEditId.value = null
    ruleForm.title = ''
    ruleForm.content = ''
    ruleForm.priority = 90
  } else if (r && r.scope !== 'system') {
    ruleEditId.value = r.id
    ruleForm.title = r.title
    ruleForm.content = r.content
    ruleForm.priority = r.priority
  } else {
    return
  }
  ruleDialogOpen.value = true
}

function clampRulePriority(p: unknown): number {
  const n = Number(p)
  if (Number.isNaN(n)) return 90
  return Math.min(100, Math.max(0, Math.round(n)))
}

function openAiAssistRuleStandalone() {
  emit('requestAgentDraft', {
    draft: RULE_AI_PROMPT_PREFIX,
    sessionTitle: t('agent.manage.capabilities.aiSessionTitleRule'),
    focusAgentTab: true
  })
}

function openAiAssistSkillStandalone() {
  emit('requestAgentDraft', {
    draft: SKILL_AI_PROMPT_PREFIX,
    sessionTitle: t('agent.manage.capabilities.aiSessionTitleSkill'),
    focusAgentTab: true
  })
}

async function submitRuleForm() {
  const title = ruleForm.title.trim()
  const content = ruleForm.content.trim()
  const priority = clampRulePriority(ruleForm.priority)
  if (ruleDialogMode.value === 'edit' && ruleEditId.value != null) {
    const res = await messageBridge.invoke('agent-capabilities-update-rule', {
      id: ruleEditId.value,
      title,
      content,
      priority
    })
    if (res?.success) {
      toast.success(t('agent.manage.capabilities.saveOk'))
      ruleDialogOpen.value = false
      await loadRules()
    } else {
      toast.error(res?.message || t('agent.manage.capabilities.saveFailed'))
    }
    return
  }
  const res = await messageBridge.invoke('agent-capabilities-insert-dynamic-rule', {
    title,
    content,
    priority,
    source: 'user'
  })
  if (res?.success) {
    toast.success(t('agent.manage.capabilities.saveOk'))
    ruleDialogOpen.value = false
    await loadRules()
  } else {
    toast.error(res?.message || t('agent.manage.capabilities.saveFailed'))
  }
}

function resetSkillDialogForm() {
  skillEditId.value = null
  skillEditDiskPath.value = ''
  skillFolderSlug.value = ''
  skillMdContent.value = ''
  skillMetaForm.name = ''
  skillMetaForm.description = ''
  skillMetaForm.entry = 'SKILL.md'
  skillMetaForm.tagsCsv = ''
  skillMetaForm.draft = true
  const roots = workspaceRoots()
  skillWorkspaceRoot.value = roots[0] ?? ''
}

async function openSkillDialog(mode: 'create' | 'edit', s?: SkillSummary) {
  skillDialogMode.value = mode
  resetSkillDialogForm()
  if (mode === 'create') {
    if (workspaceRoots().length === 0) {
      toast.warning(t('agent.manage.capabilities.noWorkspace'))
      return
    }
    skillMdContent.value = DEFAULT_NEW_SKILL_MD
    parseSkillMetaFromMarkdown(skillMdContent.value)
    skillDialogOpen.value = true
    return
  }
  if (!s) return
  skillBusyId.value = s.id
  try {
    const res = await messageBridge.invoke('agent-capabilities-get-skill', { id: s.id })
    const row = res?.skill as { full_path?: string } | null
    if (!res?.success || !row?.full_path) {
      toast.error(res?.message || t('agent.manage.capabilities.loadFailed'))
      return
    }
    skillEditId.value = s.id
    skillEditDiskPath.value = row.full_path
    const content = (await messageBridge.invoke('read-file-content', row.full_path)) as string | null
    if (content == null) {
      toast.error(t('agent.manage.capabilities.skillReadFailed'))
      return
    }
    skillMdContent.value = content
    parseSkillMetaFromMarkdown(content)
    skillWorkspaceRoot.value = s.workspace_root
    skillFolderSlug.value = s.skill_folder
    skillDialogOpen.value = true
  } finally {
    skillBusyId.value = null
  }
}

function applySkillMetadataToDocument() {
  skillMdContent.value = applyFormToSkillMd(skillMdContent.value, skillMetaForm)
}

function syncSkillFormFromEditor() {
  parseSkillMetaFromMarkdown(skillMdContent.value)
}

async function openSkillFolderInExplorer() {
  const p = skillSkillMdPath.value
  if (!p) return
  try {
    await messageBridge.invoke('show-item-in-folder', p)
  } catch {
    toast.error(t('agent.manage.capabilities.openFolderFailed'))
  }
}

async function saveSkillDialog() {
  if (!canSaveSkill.value) return
  const path =
    skillDialogMode.value === 'edit'
      ? skillEditDiskPath.value
      : skillSkillMdPath.value
  if (!path) {
    toast.error(t('agent.manage.capabilities.saveFailed'))
    return
  }
  skillSaving.value = true
  try {
    await messageBridge.invoke('write-file-content', {
      filePath: path,
      content: skillMdContent.value
    })
    const up = await messageBridge.invoke('agent-capabilities-upsert-skill-path', { path })
    if (!up?.success) {
      toast.error(up?.message || t('agent.manage.capabilities.saveFailed'))
      return
    }
    toast.success(t('agent.manage.capabilities.skillSavedReindexed'))
    skillDialogOpen.value = false
    await loadSkills()
  } catch (e) {
    toast.error(e instanceof Error ? e.message : t('agent.manage.capabilities.saveFailed'))
  } finally {
    skillSaving.value = false
  }
}

async function confirmDeleteSkill(s: SkillSummary) {
  try {
    await messageBox.confirm(
      t('agent.manage.capabilities.confirmDeleteSkill', { name: s.name }),
      t('common.confirm'),
      { type: 'warning' }
    )
  } catch {
    return
  }
  skillBusyId.value = s.id
  try {
    const res = await messageBridge.invoke('agent-capabilities-delete-skill', {
      id: s.id,
      deleteFile: true
    })
    if (res?.success) {
      toast.success(t('agent.manage.capabilities.saveOk'))
      await loadSkills()
    } else {
      toast.error(res?.message || t('agent.manage.capabilities.saveFailed'))
    }
  } finally {
    skillBusyId.value = null
  }
}

/** 扫描工作区 .metadoc/skills；无工作区时返回 false */
async function runWorkspaceSkillSync(): Promise<boolean> {
  const roots = workspaceRoots()
  if (roots.length === 0) {
    toast.warning(t('agent.manage.capabilities.noWorkspace'))
    return false
  }
  const res = await messageBridge.invoke('agent-capabilities-sync-skills', { workspaceRoots: roots })
  if (res?.success) {
    toast.success(
      t('agent.manage.capabilities.syncDone', { scanned: res.scanned ?? 0, upserted: res.upserted ?? 0 })
    )
    return true
  }
  toast.error(res?.message || t('agent.manage.capabilities.saveFailed'))
  return false
}

/** 先同步磁盘再读库（解决仅写文件后列表为空） */
async function refreshSkillsFull() {
  skillsSyncing.value = true
  try {
    await runWorkspaceSkillSync()
    await loadSkills()
  } finally {
    skillsSyncing.value = false
  }
}

async function activateSkill(id: number) {
  skillBusyId.value = id
  try {
    const res = await messageBridge.invoke('agent-capabilities-activate-skill', { id })
    if (res?.success) {
      toast.success(t('agent.manage.capabilities.saveOk'))
      await loadSkills()
    } else {
      toast.error(res?.message || t('agent.manage.capabilities.saveFailed'))
    }
  } finally {
    skillBusyId.value = null
  }
}

onMounted(() => {
  const p = props.initialPanel
  if (p === 'rules') {
    loadRules()
  } else if (p === 'skills') {
    loadSkills()
  } else if (p === 'mcp') {
    loadMcpConnections()
    loadMcpToolsOnly()
  } else {
    loadRules()
    loadSkills()
    loadMcpConnections()
    loadMcpToolsOnly()
  }
})
</script>

<style scoped>
.agent-capabilities-manager :deep(table) {
  width: 100%;
}
</style>
