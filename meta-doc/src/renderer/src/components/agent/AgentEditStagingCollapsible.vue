<template>
  <Collapsible v-if="sessionId" v-model:open="stagingPanelOpen" class="agent-compact-staging">
    <CollapsibleTrigger as-child>
      <button
        type="button"
        class="agent-compact-staging-trigger"
        :class="{ 'has-items': stagingEdits.length > 0 }"
      >
        <span class="agent-compact-staging-trigger-label">
          {{ t('agent.staging.title', '编辑暂存') }}
          <template v-if="stagingEdits.length"> ({{ stagingEdits.length }})</template>
        </span>
        <ChevronUp v-if="!stagingPanelOpen" class="agent-compact-staging-chevron" />
        <ChevronDown v-else class="agent-compact-staging-chevron" />
      </button>
    </CollapsibleTrigger>
    <CollapsibleContent>
      <div class="agent-compact-staging-content">
        <template v-if="stagingEdits.length === 0">
          <div class="agent-compact-staging-empty">
            {{ t('agent.staging.empty', '暂无待审编辑') }}
          </div>
        </template>
        <template v-else>
          <div class="agent-compact-staging-actions">
            <Button
              size="sm"
              class="agent-staging-btn agent-staging-btn-accept"
              :disabled="!hasPendingEdits"
              @click="stagingAcceptAll"
            >
              {{ t('agent.staging.acceptAll', '全部接受') }}
            </Button>
            <Button
              size="sm"
              class="agent-staging-btn agent-staging-btn-reject"
              :disabled="!hasPendingEdits"
              @click="stagingRejectAll"
            >
              {{ t('agent.staging.rejectAll', '全部拒绝') }}
            </Button>
            <Button size="sm" class="agent-staging-btn agent-staging-btn-review" @click="openReviewWindow">
              {{ t('agent.staging.openReview', '独立审阅') }}
            </Button>
          </div>
          <div class="agent-compact-staging-list">
            <div
              v-for="edit in stagingEdits"
              :key="edit.id"
              class="agent-compact-staging-item"
              :class="[edit.status, { pending: edit.status === 'pending' }]"
              role="button"
              tabindex="0"
              @click="onStagingItemActivate(edit)"
              @keydown.enter.prevent="onStagingItemActivate(edit)"
              @keydown.space.prevent="onStagingItemActivate(edit)"
            >
              <span class="agent-compact-staging-item-path" :title="edit.filePath">{{
                edit.filePath.replace(/^.*[/\\]/, '') || edit.filePath
              }}</span>
              <span class="agent-compact-staging-item-diff">
                <span class="add">+{{ edit.addedLines }}</span>
                <span class="del">-{{ edit.removedLines }}</span>
              </span>
              <Button
                v-if="edit.status === 'pending'"
                size="sm"
                variant="ghost"
                class="agent-compact-staging-inline-btn agent-compact-staging-review-btn"
                @click.stop="openEditReview(edit)"
              >
                {{ t('agent.staging.reviewItem', '审阅') }}
              </Button>
              <span v-if="edit.status === 'pending'" class="agent-compact-staging-item-btns">
                <Button
                  size="sm"
                  variant="ghost"
                  class="agent-compact-staging-inline-btn"
                  @click.stop="stagingAccept(edit)"
                >
                  {{ t('agent.staging.accept', '接受') }}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  class="agent-compact-staging-inline-btn text-destructive"
                  @click.stop="stagingReject(edit)"
                >
                  {{ t('agent.staging.reject', '拒绝') }}
                </Button>
              </span>
              <span v-else class="agent-compact-staging-item-status">
                {{
                  edit.status === 'accepted'
                    ? t('agent.staging.accepted', '已接受')
                    : t('agent.staging.rejected', '已拒绝')
                }}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                class="agent-compact-staging-item-close"
                :title="t('agent.staging.dismiss', '关闭并拒绝')"
                @click.stop="stagingDismiss(edit)"
              >
                <X class="h-3 w-3" />
              </Button>
            </div>
          </div>
        </template>
      </div>
    </CollapsibleContent>
  </Collapsible>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronDown, ChevronUp, X } from 'lucide-vue-next'
import { Button } from '@renderer/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@renderer/components/ui/collapsible'
import { useWorkspace } from '../../stores/workspace'
import { useAgentEditStagingStore, type StagingEditRecord } from '../../stores/agent-edit-staging-store'
import { notifyError } from '../../utils/notify'
import eventBus from '../../utils/event-bus'

const props = defineProps<{
  sessionId: string | null
}>()

const { t } = useI18n()
const workspace = useWorkspace()
const stagingStore = useAgentEditStagingStore()

const stagingPanelOpen = ref(false)

const stagingEdits = computed(() =>
  props.sessionId ? stagingStore.getEditsForSession(props.sessionId) : []
)

const hasPendingEdits = computed(() => stagingEdits.value.some((e) => e.status === 'pending'))

watch(
  () => stagingEdits.value.filter((e) => e.status === 'pending').length,
  (pendingCount, prevPendingCount) => {
    if (pendingCount > 0 && (prevPendingCount ?? 0) === 0) {
      stagingPanelOpen.value = true
    }
  }
)

function onStagingItemActivate(edit: StagingEditRecord) {
  if (edit.filePath) {
    eventBus.emit('workspace-open-document', { path: edit.filePath })
  }
}

function openEditReview(edit: StagingEditRecord) {
  stagingStore.setReviewFocusEditId(edit.id)
  workspace.openToolTab('agentReview')
}

function stagingAccept(edit: StagingEditRecord) {
  stagingStore.acceptEdit(edit.id)
}

async function stagingReject(edit: StagingEditRecord) {
  try {
    await stagingStore.rejectEdit(edit)
  } catch (e) {
    notifyError(e instanceof Error ? e.message : String(e))
  }
}

async function stagingDismiss(edit: StagingEditRecord) {
  try {
    await stagingStore.removeEdit(edit)
  } catch (e) {
    notifyError(e instanceof Error ? e.message : String(e))
  }
}

function stagingAcceptAll() {
  if (props.sessionId) stagingStore.acceptAll(props.sessionId)
}

async function stagingRejectAll() {
  if (!props.sessionId) return
  try {
    await stagingStore.rejectAll(props.sessionId)
  } catch (e) {
    notifyError(e instanceof Error ? e.message : String(e))
  }
}

function openReviewWindow() {
  workspace.openToolTab('agentReview')
}
</script>

<style scoped>
.agent-compact-staging {
  flex-shrink: 0;
  border-top: 1px solid rgba(128, 128, 128, 0.2);
}

.agent-compact-staging-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px 8px;
  min-height: 22px;
  box-sizing: border-box;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
}

.agent-compact-staging-trigger:hover,
.agent-compact-staging-trigger.has-items {
  color: var(--el-text-color-primary);
}

.agent-compact-staging-chevron {
  width: 12px;
  height: 12px;
}

.agent-compact-staging-content {
  max-height: 180px;
  overflow-y: auto;
  padding: 2px 8px 6px;
  font-size: 11px;
}

.agent-compact-staging-empty {
  padding: 4px 0;
  color: var(--el-text-color-secondary);
}

.agent-compact-staging-actions {
  display: flex;
  gap: 4px;
  margin-bottom: 4px;
}

.agent-staging-btn {
  height: 22px;
  min-height: 22px;
  padding: 0 8px;
  font-size: 11px;
  line-height: 20px;
  color: #fff !important;
}
.agent-staging-btn-accept {
  background: var(--el-color-success) !important;
}
.agent-staging-btn-accept:hover {
  opacity: 0.9;
  color: #fff !important;
}
.agent-staging-btn-reject {
  background: var(--el-color-danger) !important;
}
.agent-staging-btn-reject:hover {
  opacity: 0.9;
  color: #fff !important;
}
.agent-staging-btn-review {
  background: var(--el-fill-color) !important;
  color: var(--el-text-color-primary) !important;
}
.agent-staging-btn-review:hover {
  background: var(--el-fill-color-dark) !important;
  color: var(--el-text-color-primary) !important;
}

.agent-compact-staging-item-close {
  flex-shrink: 0;
  margin-left: auto;
  width: 22px !important;
  height: 22px !important;
  min-height: 22px !important;
  opacity: 0.55;
}
.agent-compact-staging-item-close:hover {
  opacity: 1;
}

.agent-compact-staging-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.agent-compact-staging-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px 2px 6px;
  min-height: 22px;
  box-sizing: border-box;
  border-radius: 3px;
  background: rgba(128, 128, 128, 0.06);
  outline: none;
  cursor: pointer;
}

.agent-compact-staging-item:hover {
  background: rgba(128, 128, 128, 0.1);
}

.agent-compact-staging-item.pending:hover {
  background: rgba(128, 128, 128, 0.14);
}

.agent-compact-staging-item:focus-visible {
  box-shadow: 0 0 0 2px var(--el-color-primary-light-5);
}

.agent-compact-staging-item-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  line-height: 18px;
}

.agent-compact-staging-item-diff {
  display: flex;
  gap: 3px;
  flex-shrink: 0;
  font-size: 10px;
  line-height: 18px;
}

.agent-compact-staging-item-diff .add {
  color: var(--el-color-success);
}

.agent-compact-staging-item-diff .del {
  color: var(--el-color-danger);
}

.agent-compact-staging-review-btn {
  flex-shrink: 0;
}

.agent-compact-staging-item-btns {
  display: flex;
  gap: 0;
  flex-shrink: 0;
}

.agent-compact-staging-inline-btn {
  height: 20px !important;
  min-height: 20px !important;
  padding: 0 6px !important;
  font-size: 10px !important;
}

.agent-compact-staging-item-status {
  font-size: 10px;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
  line-height: 18px;
}
</style>
