<template>
  <div class="shortcuts-settings">
    <header class="shortcuts-header">
      <h3 class="section-title">{{ t('setting.shortcuts.title') }}</h3>
      <p class="section-desc">{{ t('setting.shortcuts.description') }}</p>
    </header>

    <div class="shortcuts-content">
      <!-- 方案选择与操作 -->
      <Card class="shortcuts-card">
        <CardHeader class="scheme-header">
          <CardTitle class="text-sm font-medium">{{ t('setting.shortcuts.scheme') }}</CardTitle>
          <div class="scheme-toolbar">
            <Select v-model="selectedSchemeId" @update:model-value="onSchemeSelect">
              <SelectTrigger class="scheme-select-trigger">
                <SelectValue :placeholder="t('setting.shortcuts.selectScheme')" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="scheme in allSchemes"
                  :key="scheme.id"
                  :value="scheme.id"
                >
                  {{ scheme.name }}
                </SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" @click="handleNewScheme">
              <Plus class="h-4 w-4 mr-1" />
              {{ t('setting.shortcuts.newScheme') }}
            </Button>
            <Button size="sm" variant="outline" @click="handleImportScheme">
              <ClipboardCopy class="h-4 w-4 mr-1" />
              {{ t('setting.shortcuts.importScheme') }}
            </Button>
            <Button
              size="sm"
              variant="outline"
              @click="handleExportScheme"
            >
              <Download class="h-4 w-4 mr-1" />
              {{ t('setting.shortcuts.exportScheme') }}
            </Button>
            <Button
              v-if="showResetBuiltinButton"
              size="sm"
              variant="outline"
              type="button"
              @click="handleResetBuiltinScheme"
            >
              <RotateCcw class="h-4 w-4 mr-1" />
              {{ t('setting.shortcuts.resetSchemeToDefault') }}
            </Button>
            <Button
              v-if="currentScheme && !currentScheme.isBuiltin"
              size="sm"
              variant="outline"
              type="button"
              class="delete-scheme-btn"
              @click="handleDeleteScheme"
            >
              <Trash2 class="h-4 w-4 mr-1" />
              {{ t('setting.shortcuts.deleteScheme') }}
            </Button>
          </div>
        </CardHeader>
      </Card>

      <!-- 方案名称：默认方案只读，自定义可编辑；取消/保存放在本 panel 内 -->
      <Card v-if="currentScheme" class="shortcuts-card scheme-name-card">
        <CardHeader>
          <CardTitle class="text-sm font-medium">{{ t('setting.shortcuts.schemeName') }}</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="scheme-name-row">
            <Input
              v-model="editingSchemeName"
              class="scheme-name-input"
              :placeholder="t('setting.shortcuts.schemeNamePlaceholder')"
              :readonly="currentScheme.isBuiltin"
            />
            <div class="shortcuts-actions">
              <Button
                variant="outline"
                :disabled="!hasUnsavedChanges"
                @click="cancelSchemeChange"
              >
                {{ t('common.cancel') }}
              </Button>
              <Button
                :disabled="!hasUnsavedChanges"
                @click="saveSchemeChange"
              >
                {{ t('common.save') }}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- 按键设置 panel -->
      <Card class="shortcuts-card bindings-card">
        <CardHeader>
          <CardTitle class="text-sm font-medium">{{ t('setting.shortcuts.keyBindings') }}</CardTitle>
        </CardHeader>
        <CardContent class="bindings-card-content p-6 pt-0">
          <div v-if="currentScheme" class="bindings-list">
            <div
              v-for="actionId in actionIds"
              :key="actionId"
              class="binding-row"
              :class="{ 'has-conflict': getConflictWith(actionId).length > 0 }"
            >
              <span class="binding-label">
                {{ t('setting.shortcuts.actions.' + actionId) }}
                <Tooltip v-if="getConflictWith(actionId).length > 0">
                  <TooltipTrigger as-child>
                    <span class="conflict-icon" aria-hidden="true">
                      <AlertTriangle class="h-4 w-4" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {{ t('setting.shortcuts.conflictWith', { names: getConflictWith(actionId).join('、') }) }}
                  </TooltipContent>
                </Tooltip>
              </span>
              <div class="binding-controls">
                <ShortcutBindingInput
                  :model-value="getBinding(actionId)"
                  :default-keys="getDefaultKeys(actionId)"
                  @update:model-value="(v) => setBinding(actionId, v)"
                  @reset="resetBinding(actionId)"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- 新建方案对话框 -->
    <Dialog v-model:open="newSchemeDialogVisible">
      <DialogContent class="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{{ t('setting.shortcuts.newScheme') }}</DialogTitle>
        </DialogHeader>
        <FormField :label="t('setting.shortcuts.schemeName')" name="newSchemeName">
          <Input v-model="newSchemeName" :placeholder="t('setting.shortcuts.schemeNamePlaceholder')" />
        </FormField>
        <DialogFooter>
          <Button variant="outline" @click="newSchemeDialogVisible = false">
            {{ t('common.cancel') }}
          </Button>
          <Button @click="confirmNewScheme" :disabled="!newSchemeName.trim()">
            {{ t('common.confirm') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 导入方案：使用隐藏 file input -->
    <input
      ref="importFileInputRef"
      type="file"
      accept=".json,application/json"
      class="hidden"
      @change="onImportFileChange"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, ClipboardCopy, Download, AlertTriangle, Trash2, RotateCcw } from 'lucide-vue-next'
import {
  getAllKeySchemes,
  getActiveKeySchemeId,
  setActiveKeySchemeId,
  addKeyScheme,
  updateKeyScheme,
  deleteKeyScheme,
  clearBuiltinSchemeOverrides,
  exportKeyScheme,
  importKeyScheme,
  clearKeySchemeCache
} from '@renderer/utils/keyboard/keyboard-scheme-manager'
import { getDefaultSchemes, getDefaultSchemeIdForPlatform, detectPlatform } from '@renderer/utils/keyboard/keyboard-scheme-defaults'
import { SHORTCUT_ACTION_IDS } from '@renderer/utils/keyboard/keyboard-scheme-types'
import eventBus from '@renderer/utils/event-bus'
import { refreshShortcutBindings } from '@renderer/composables/useGlobalShortcuts'
import { notifySuccess, notifyError } from '@renderer/utils/notification/notify'
import { messageBox } from '@renderer/utils/notification/messageBox'
import { Card, CardHeader, CardTitle, CardContent } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { FormField } from '@renderer/components/ui/form'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from '@renderer/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@renderer/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import ShortcutBindingInput from '@renderer/components/input/ShortcutBindingInput.vue'
import messageBridge from '@renderer/bridge/message-bridge'
import { normalizeBindingValue, bindingsEqual } from '@renderer/utils/keyboard/keyboard-scheme-types'

const { t } = useI18n()

const actionIds = SHORTCUT_ACTION_IDS

const allSchemes = ref<Awaited<ReturnType<typeof getAllKeySchemes>>>([])
const activeSchemeId = ref('')
const selectedSchemeId = ref('')
const draftBindings = ref<Record<string, string[]> | null>(null)
const editingSchemeName = ref('')
const newSchemeDialogVisible = ref(false)
const newSchemeName = ref('')
const importFileInputRef = ref<HTMLInputElement | null>(null)

/** 按键列表 el-scrollbar 最大高度：随窗口变化，避免一屏全显示 */
const bindingsScrollMaxHeight = ref(360)
function updateBindingsScrollMaxHeight() {
  bindingsScrollMaxHeight.value = Math.max(240, window.innerHeight - 280)
}

const savedBindingsForSelected = computed(() => {
  const scheme = allSchemes.value.find((s) => s.id === selectedSchemeId.value)
  return scheme?.bindings ?? {}
})

const hasUnsavedChanges = computed(() => {
  if (!selectedSchemeId.value) return false
  const selectionChanged = selectedSchemeId.value !== activeSchemeId.value
  const bindingsChanged =
    draftBindings.value != null && !bindingsEqual(draftBindings.value, savedBindingsForSelected.value)
  const scheme = currentScheme.value
  const nameChanged =
    scheme && !scheme.isBuiltin && (editingSchemeName.value?.trim() ?? '') !== (scheme.name ?? '')
  return selectionChanged || bindingsChanged || nameChanged
})

const currentScheme = computed(() => {
  const id = selectedSchemeId.value
  return allSchemes.value.find((s) => s.id === id)
})

const defaultBindingsForCompare = computed(() => {
  const platform = detectPlatform()
  const schemes = getDefaultSchemes()
  const defaultId =
    platform === 'mac' ? 'default_mac' : platform === 'linux' ? 'default_linux' : 'default_win'
  const scheme = schemes.find((s) => s.id === defaultId)
  const b = scheme?.bindings ?? {}
  const out: Record<string, string[]> = {}
  for (const id of actionIds) {
    out[id] = normalizeBindingValue(b[id as keyof typeof b])
  }
  return out
})

/** 当前选中的内置方案在代码中的默认绑定（用于判断是否被修改过） */
const codeDefaultForSelectedBuiltin = computed(() => {
  if (!currentScheme.value?.isBuiltin) return undefined
  const scheme = getDefaultSchemes().find((s) => s.id === selectedSchemeId.value)
  return scheme?.bindings
})

/** 当前默认方案是否已被修改（有覆盖或与代码默认不同）→ 仅此时显示一键重置 */
const showResetBuiltinButton = computed(() => {
  if (!currentScheme.value?.isBuiltin) return false
  const saved = savedBindingsForSelected.value
  const codeDefault = codeDefaultForSelectedBuiltin.value
  if (!codeDefault) return false
  return !bindingsEqual(saved, codeDefault)
})

const effectiveBindingsForDisplay = computed(() => {
  if (draftBindings.value != null) return draftBindings.value
  const scheme = currentScheme.value
  return scheme?.bindings ?? {}
})

/** 当前方案下：每个快捷键对应哪些 actionId（用于冲突检测） */
const shortcutToActions = computed(() => {
  const b = effectiveBindingsForDisplay.value
  const map: Record<string, string[]> = {}
  for (const actionId of actionIds) {
    const keys = normalizeBindingValue(b[actionId as keyof typeof b])
    for (const k of keys) {
      if (!map[k]) map[k] = []
      if (!map[k].includes(actionId)) map[k].push(actionId)
    }
  }
  return map
})

/** 与当前 action 冲突的其他 action 的显示名列表 */
function getConflictWith(actionId: string): string[] {
  const keys = getBinding(actionId)
  const others = new Set<string>()
  for (const k of keys) {
    const list = shortcutToActions.value[k]
    if (list && list.length > 1) {
      for (const id of list) {
        if (id !== actionId) others.add(t('setting.shortcuts.actions.' + id))
      }
    }
  }
  return Array.from(others)
}

function getBinding(actionId: string): string[] {
  const b = effectiveBindingsForDisplay.value
  return normalizeBindingValue(b[actionId as keyof typeof b])
}

function getDefaultKeys(actionId: string): string[] {
  return defaultBindingsForCompare.value[actionId] ?? []
}

function setBinding(actionId: string, value: string[]) {
  const cur = draftBindings.value ?? savedBindingsForSelected.value
  const next = { ...cur, [actionId]: value }
  draftBindings.value = next
}

function resetBinding(actionId: string) {
  const defaultVal = defaultBindingsForCompare.value[actionId] ?? []
  setBinding(actionId, defaultVal)
}

function onSchemeSelect() {
  const scheme = currentScheme.value
  if (scheme) {
    editingSchemeName.value = scheme.name
    draftBindings.value = scheme.bindings ? { ...scheme.bindings } : {}
  } else {
    draftBindings.value = null
  }
}

/* 方案名称不再 blur 实时保存，统一走底部保存/取消 */

function cancelSchemeChange() {
  selectedSchemeId.value = activeSchemeId.value
  const scheme = allSchemes.value.find((s) => s.id === activeSchemeId.value)
  editingSchemeName.value = scheme?.name ?? ''
  draftBindings.value = scheme?.bindings ? { ...scheme.bindings } : null
}

async function saveSchemeChange() {
  const id = selectedSchemeId.value
  const scheme = currentScheme.value
  const bindings = draftBindings.value
  if (!id) return
  if (bindings != null) {
    await updateKeyScheme(id, { bindings })
  }
  if (scheme && !scheme.isBuiltin && editingSchemeName.value?.trim()) {
    await updateKeyScheme(id, { name: editingSchemeName.value.trim() })
  }
  await setActiveKeySchemeId(id)
  activeSchemeId.value = id
  clearKeySchemeCache()
  await loadSchemes()
  await refreshShortcutBindings()
  eventBus.emit('shortcut-scheme-updated')
  notifySuccess(t('setting.shortcuts.schemeApplied'))
}

async function handleResetBuiltinScheme() {
  const scheme = currentScheme.value
  if (!scheme?.isBuiltin) return
  try {
    await messageBox.confirm(
      t('setting.shortcuts.confirmResetBuiltinScheme'),
      t('setting.shortcuts.resetSchemeToDefault'),
      {
        type: 'warning',
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel')
      }
    )
    await clearBuiltinSchemeOverrides(scheme.id)
    clearKeySchemeCache()
    await loadSchemes()
    await refreshShortcutBindings()
    eventBus.emit('shortcut-scheme-updated')
    notifySuccess(t('setting.shortcuts.schemeResetToDefault'))
  } catch (e) {
    if (e !== 'cancel') notifyError(e instanceof Error ? e.message : String(e))
  }
}

async function loadSchemes() {
  allSchemes.value = await getAllKeySchemes()
  activeSchemeId.value = await getActiveKeySchemeId()
  if (!selectedSchemeId.value || !allSchemes.value.some((s) => s.id === selectedSchemeId.value)) {
    selectedSchemeId.value = activeSchemeId.value
  }
  const scheme = currentScheme.value
  if (scheme) {
    editingSchemeName.value = scheme.name
    draftBindings.value = scheme.bindings ? { ...scheme.bindings } : {}
  } else {
    draftBindings.value = null
  }
}

function handleNewScheme() {
  newSchemeName.value = ''
  newSchemeDialogVisible.value = true
}

async function confirmNewScheme() {
  const name = newSchemeName.value?.trim()
  if (!name) return
  const scheme = await addKeyScheme(name)
  newSchemeDialogVisible.value = false
  await loadSchemes()
  selectedSchemeId.value = scheme.id
  notifySuccess(t('setting.shortcuts.schemeCreated'))
}

function handleExportScheme() {
  const scheme = currentScheme.value
  if (!scheme) return
  const json = exportKeyScheme(scheme)
  const defaultName = `${scheme.name}-${Date.now()}.json`
  messageBridge.invoke('save-file-dialog', {
    defaultName,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  }).then((result: any) => {
    if (result?.canceled || !result?.filePath) return
    messageBridge.invoke('write-file-content', { filePath: result.filePath, content: json }).then(() => {
      notifySuccess(t('setting.shortcuts.exportSuccess'))
    })
  })
}

async function handleDeleteScheme() {
  const scheme = currentScheme.value
  if (!scheme || scheme.isBuiltin) return
  try {
    await messageBox.confirm(
      t('setting.shortcuts.confirmDeleteScheme'),
      t('setting.shortcuts.deleteScheme'),
      {
        type: 'warning',
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel')
      }
    )
    const ok = await deleteKeyScheme(scheme.id)
    if (ok) {
      clearKeySchemeCache()
      await loadSchemes()
      activeSchemeId.value = await getActiveKeySchemeId()
      selectedSchemeId.value = activeSchemeId.value
      await refreshShortcutBindings()
      eventBus.emit('shortcut-scheme-updated')
      notifySuccess(t('setting.shortcuts.schemeDeleted'))
    }
  } catch (e) {
    if (e !== 'cancel') notifyError(e instanceof Error ? e.message : String(e))
  }
}

function handleImportScheme() {
  importFileInputRef.value?.click()
}

async function onImportFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  input.value = ''
  try {
    const text = await file.text()
    const { scheme, errors } = await importKeyScheme(text)
    if (errors?.length) {
      notifyError(errors[0])
      return
    }
    if (scheme) {
      await loadSchemes()
      selectedSchemeId.value = scheme.id
      notifySuccess(t('setting.shortcuts.importSuccess'))
    }
  } catch (err) {
    notifyError(err instanceof Error ? err.message : String(err))
  }
}

watch(currentScheme, (scheme) => {
  if (scheme) editingSchemeName.value = scheme.name
}, { immediate: true })

onMounted(() => {
  loadSchemes()
})
</script>

<style scoped>
.shortcuts-settings {
  width: 100%;
  max-width: 960px;
  margin: 0 auto;
  padding: 0 12px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.shortcuts-header {
  flex-shrink: 0;
}

.section-title {
  margin: 0 0 8px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.section-desc {
  margin: 0 0 16px 0;
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.shortcuts-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
}

.shortcuts-card {
  flex-shrink: 0;
}

.bindings-card-content {
  padding-top: 0;
}

.bindings-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.binding-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.binding-row:last-child {
  border-bottom: none;
}

.binding-label {
  flex-shrink: 0;
  min-width: 120px;
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.conflict-icon {
  color: hsl(var(--destructive));
  flex-shrink: 0;
}

.binding-row.has-conflict .binding-label {
  color: hsl(var(--destructive) / 0.9);
}

.binding-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.reset-btn {
  flex-shrink: 0;
}

.scheme-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.scheme-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.scheme-select-trigger {
  min-width: 0;
  flex: 1 1 auto;
  max-width: 280px;
}

/* 删除方案：默认与其它 outline 一致，避免深色模式下红字+深底撞色；仅 hover 时用 destructive */
.delete-scheme-btn {
  color: hsl(var(--muted-foreground));
}
.delete-scheme-btn:hover {
  background: hsl(var(--destructive) / 0.12);
  color: hsl(var(--destructive));
  border-color: hsl(var(--destructive) / 0.4);
}

.scheme-name-row {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: nowrap;
}

.scheme-name-input {
  flex: 1;
  min-width: 0;
}

.shortcuts-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
</style>
