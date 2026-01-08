

<script setup lang="ts">
import "../assets/response-container.css"
import {ref, computed,onMounted,onBeforeMount, nextTick, watch } from 'vue';
import {Avatar, Delete, Edit, Refresh, User, More, CopyDocument, DocumentAdd, FolderAdd} from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import {ElMessageBox} from "element-plus";
import {MdEditor,MdPreview, MdCatalog}from 'md-editor-v3';
import { themeState } from "../utils/themes";
import '../assets/md-editor-v3-style.css';
import ReferenceDisplay from './agent/ReferenceDisplay.vue';
import type { Reference } from '../types/agent-framework';
import type { AIDialogMessage } from '../../../types';
import { useI18n } from 'vue-i18n';
import eventBus from '../utils/event-bus';

interface MessageWithReferences extends AIDialogMessage {
  referenceIds?: string[];
}

interface Props {
  message: MessageWithReferences;
  index: number;
  sessionReferences?: Reference[];
}

interface MessageEditPayload {
  index: number;
  message: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  delete: [index: number];
  edit: [payload: MessageEditPayload];
  regenerate: [index: number];
}>();

const { t } = useI18n();

const role = computed(() => {
  return props.message.role;
});

const content = computed(() => {
  return props.message.content;
});

const roleClass = computed(() => {
  return props.message.role === 'user' ? 'user-role' : 'ai-role';
});

onBeforeMount(() => {
  //console.log(props.message)
});

const regenerateMsg = () => {
  emit("regenerate", props.index + 1);
};

const onMsgDelete = () => {
  ElMessageBox.confirm(
    t('messageBubble.deleteConfirmMessage'),
    t('messageBubble.deleteConfirmTitle'),
    {
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      type: 'warning',
    }
  )
    .then(() => {
      emit('delete', props.index);
    })
    .catch(() => {
      // 取消无操作
    });
};

const editDialogVisible = ref(false);
const onMsgEdit = () => {
  editingText.value = content.value;
  editDialogVisible.value = true;
};

const editingText = ref('');

const saveEdit = () => {
  editDialogVisible.value = false;
  emit('edit', { index: props.index, message: editingText.value });
};

// 复制内容到剪切板
const copyContent = async () => {
  try {
    await navigator.clipboard.writeText(content.value);
    ElMessage.success(t('common.copySuccess', '复制成功'));
  } catch (error) {
    console.error('复制失败:', error);
    ElMessage.error(t('common.copyFailed', '复制失败'));
  }
};

// 请求插入到文档（触发选择对话框）
const requestInsertToDocument = () => {
  eventBus.emit('ai-chat-request-insert-to-document', {
    content: content.value
  });
};

// 注意：getDocumentDisplayName 已不再使用，显示名称现在在 documentTabs computed 中预先计算

// 导出到新文档
const exportToNewDocument = () => {
  eventBus.emit('ai-chat-export-to-document', {
    content: content.value
  });
  ElMessage.success(t('aiChat.exportToDocumentSuccess', '已导出到新文档'));
};

// 处理下拉菜单命令
const handleActionCommand = (command: string, data?: any) => {
  switch (command) {
    case 'edit':
      onMsgEdit();
      break;
    case 'delete':
      onMsgDelete();
      break;
    case 'regenerate':
      regenerateMsg();
      break;
    case 'copy':
      copyContent();
      break;
    case 'insert-to-document':
      // 触发选择文档对话框
      requestInsertToDocument();
      break;
    case 'export-to-document':
      exportToNewDocument();
      break;
  }
};

// 子菜单hover状态
const showDocumentSubmenu = ref(false);

// hover状态管理
const showActions = ref(false);
const isHoveringMessage = ref(false);
const isHoveringActions = ref(false);
const isHoveringDropdown = ref(false);
const dropdownVisible = ref(false);
let hideTimer: ReturnType<typeof setTimeout> | null = null;

const HIDE_DELAY = 500;

const shouldShow = computed(() => {
  return isHoveringMessage.value || isHoveringActions.value || isHoveringDropdown.value || dropdownVisible.value;
});

const clearHideTimer = () => {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
};

const showActionsAndTimestamp = () => {
  clearHideTimer();
  showActions.value = true;
};

const hideActionsAndTimestamp = () => {
  clearHideTimer();
  hideTimer = setTimeout(() => {
    if (!shouldShow.value) {
      showActions.value = false;
    }
    hideTimer = null;
  }, HIDE_DELAY);
};

const handleMouseEnter = () => {
  isHoveringMessage.value = true;
  showActionsAndTimestamp();
};

const handleMouseLeave = () => {
  isHoveringMessage.value = false;
  hideActionsAndTimestamp();
};

const handleActionsMouseEnter = () => {
  isHoveringActions.value = true;
  showActionsAndTimestamp();
};

const handleActionsMouseLeave = () => {
  isHoveringActions.value = false;
  hideActionsAndTimestamp();
};

const handleDropdownVisibleChange = (visible: boolean) => {
  dropdownVisible.value = visible;
  if (visible) {
    showActionsAndTimestamp();
  } else {
    isHoveringDropdown.value = false;
    hideActionsAndTimestamp();
  }
};

const handleDropdownMouseEnter = () => {
  isHoveringDropdown.value = true;
  showActionsAndTimestamp();
};

const handleDropdownMouseLeave = () => {
  isHoveringDropdown.value = false;
  hideActionsAndTimestamp();
};

// 引用容器的ref和样式
const referencesContainerRef = ref<HTMLElement | null>(null);
const messageBubbleRef = ref<HTMLElement | null>(null);
const bubbleContentRef = ref<HTMLElement | null>(null);
const referencesStyle = ref<Record<string, string>>({});

// 计算引用容器的右边缘位置和宽度
const calculateReferencesPosition = () => {
  nextTick(() => {
    if (!referencesContainerRef.value || !messageBubbleRef.value) return;
    
    // 获取消息气泡元素
    const messageBubble = messageBubbleRef.value;
    const bubbleContent = bubbleContentRef.value || messageBubble.querySelector('.bubble-content') as HTMLElement;
    
    if (!bubbleContent) return;
    
    // 获取气泡内容的实际宽度（包括padding）
    const bubbleContentRect = bubbleContent.getBoundingClientRect();
    const bubbleContentWidth = bubbleContentRect.width;
    
    // 获取引用容器的位置
    const referencesRect = referencesContainerRef.value.getBoundingClientRect();
    
    // 计算右边缘位置：窗口右边缘 - 气泡内容右边缘
    // 需要减去气泡内容的padding-right
    const windowWidth = window.innerWidth;
    const bubbleContentRight = bubbleContentRect.right;
    const bubbleContentStyle = window.getComputedStyle(bubbleContent);
    const paddingRight = parseFloat(bubbleContentStyle.paddingRight) || 0;
    // 计算margin-right，稍微减少一点（减去5px）来补偿可能的计算误差
    const marginRight = windowWidth - bubbleContentRight - paddingRight - 30;
    
    // 设置宽度和margin-right，确保宽度与气泡内容一致
    referencesStyle.value = {
      width: `${bubbleContentWidth}px`,
      marginRight: `${Math.max(0, marginRight)}px`
    };
  });
};

// 监听窗口大小变化和内容变化
watch(() => [props.message, content.value], () => {
  calculateReferencesPosition();
}, { deep: true });

onMounted(() => {
  calculateReferencesPosition();
  window.addEventListener('resize', calculateReferencesPosition);
});

onBeforeMount(() => {
  window.removeEventListener('resize', calculateReferencesPosition);
  clearHideTimer();
});
</script>

<template>
  <div 
    ref="messageBubbleRef" 
    :class="['message-bubble', roleClass]"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <el-avatar class="avatar-with-mask" v-if="role !== 'user'" :src="themeState.currentTheme.AiLogo"></el-avatar>
    <!-- 用户消息的操作按钮（在左侧） -->
    <transition name="fade">
      <el-dropdown 
        v-if="role === 'user' && showActions"
        @command="handleActionCommand" 
        trigger="click" 
        @click.stop 
        @visible-change="handleDropdownVisibleChange"
        class="side-button"
        @mouseenter="handleActionsMouseEnter"
        @mouseleave="handleActionsMouseLeave"
      >
        <el-button
          circle
          size="small"
          :icon="More"
        />
        <template #dropdown>
          <el-dropdown-menu 
            @mouseenter="handleDropdownMouseEnter" 
            @mouseleave="handleDropdownMouseLeave"
          >
            <el-dropdown-item command="copy">
              <el-icon style="margin-right: 8px;"><CopyDocument /></el-icon>
              {{ t('common.copy', '复制') }}
            </el-dropdown-item>
            <el-dropdown-item command="insert-to-document">
              <el-icon style="margin-right: 8px;"><DocumentAdd /></el-icon>
              {{ t('aiChat.insertToDocument', '插入到文档') }}
            </el-dropdown-item>
            <el-dropdown-item command="export-to-document">
              <el-icon style="margin-right: 8px;"><FolderAdd /></el-icon>
              {{ t('aiChat.exportToDocument', '导出到新文档') }}
            </el-dropdown-item>
            <el-dropdown-item command="edit">
              <el-icon style="margin-right: 8px;"><Edit /></el-icon>
              {{ t('messageBubble.edit', '编辑') }}
            </el-dropdown-item>
            <el-dropdown-item command="regenerate">
              <el-icon style="margin-right: 8px;"><Refresh /></el-icon>
              {{ t('messageBubble.regenerate', '重新生成') }}
            </el-dropdown-item>
            <el-dropdown-item command="delete" divided>
              <el-icon style="margin-right: 8px;"><Delete /></el-icon>
              {{ t('common.delete', '删除') }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </transition>
    <div 
      ref="bubbleContentRef" 
      class="bubble-content response-container" 
      style="max-height: none;"
    >
      <MdPreview
        :modelValue="content"
        previewTheme="github"
        codeStyleReverse
        style="text-align: left;margin-top:20px; color: v-bind('themeState.currentTheme.textColor')"
        :class="themeState.currentTheme.mdeditorClass"
        :codeFold="false"
        :autoFoldThreshold="300"
      />
      <!-- <markdown-it :source="content" /> -->
    </div>
    <!-- AI消息的操作按钮（在右侧） -->
    <transition name="fade">
      <el-dropdown 
        v-if="role !== 'user' && showActions"
        @command="handleActionCommand" 
        trigger="click" 
        @click.stop 
        @visible-change="handleDropdownVisibleChange"
        class="side-button"
        @mouseenter="handleActionsMouseEnter"
        @mouseleave="handleActionsMouseLeave"
      >
        <el-button
          circle
          size="small"
          :icon="More"
        />
        <template #dropdown>
          <el-dropdown-menu 
            @mouseenter="handleDropdownMouseEnter" 
            @mouseleave="handleDropdownMouseLeave"
          >
            <el-dropdown-item command="copy">
              <el-icon style="margin-right: 8px;"><CopyDocument /></el-icon>
              {{ t('common.copy', '复制') }}
            </el-dropdown-item>
            <el-dropdown-item command="insert-to-document">
              <el-icon style="margin-right: 8px;"><DocumentAdd /></el-icon>
              {{ t('aiChat.insertToDocument', '插入到文档') }}
            </el-dropdown-item>
            <el-dropdown-item command="export-to-document">
              <el-icon style="margin-right: 8px;"><FolderAdd /></el-icon>
              {{ t('aiChat.exportToDocument', '导出到新文档') }}
            </el-dropdown-item>
            <el-dropdown-item command="edit">
              <el-icon style="margin-right: 8px;"><Edit /></el-icon>
              {{ t('messageBubble.edit', '编辑') }}
            </el-dropdown-item>
            <el-dropdown-item command="delete" divided>
              <el-icon style="margin-right: 8px;"><Delete /></el-icon>
              {{ t('common.delete', '删除') }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </transition>
    <el-avatar class="avatar-fallback" v-if="role === 'user'" :icon="User"></el-avatar>
  </div>
  <!-- 引用显示（只读模式，只显示用户消息的引用） -->
  <div 
    v-if="role === 'user' && props.message.referenceIds && props.message.referenceIds.length > 0 && props.sessionReferences && props.sessionReferences.length > 0"
    ref="referencesContainerRef"
    class="message-bubble__references"
    :style="referencesStyle"
  >
    <ReferenceDisplay
      :references="props.sessionReferences"
      :active-reference-ids="props.message.referenceIds || []"
      readonly
    />
  </div>
  <el-dialog
    v-model="editDialogVisible"
    :title="$t('messageBubble.editTitle')"
    width="80%"
  >
    <md-editor
      v-model="editingText"
      showCodeRowNumber
      previewTheme="github"
      codeStyleReverse
      style="text-align: left"
      :autoFoldThreshold="300"
      :theme="(themeState.currentTheme.vditorTheme as any)"
    />

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="editDialogVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" @click="saveEdit">{{ $t('common.save') }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.side-button {
  align-self: flex-end;      /* 将按钮对齐到容器的底部 */
  margin-top: auto;          /* 自动填充上方的空间，贴到底部 */
  z-index: 10;               /* 确保按钮在内容之上 */
  position: relative;        /* 建立定位上下文 */
  flex-shrink: 0;            /* 防止按钮被压缩 */
}

.message-bubble {
  display: flex;
  align-items: flex-start;
  position: relative;
  margin-left: 30px;
  margin-right: 30px;
}

.bubble-content {
  min-width: 10px;
  min-height: 10px;
  border-radius: 10px;
  transition: transform 0.3s ease, border-color 0.3s, box-shadow 0.3s;
  margin: 10px 10px;
  padding: 0 25px; /* 内边距，增加空间 */
  max-width: 61.8%;
  flex-grow: 1;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
}

.bubble-content:hover {
  border-color: rgba(48, 162, 255, 0.42); /* 改变边框颜色 */
  box-shadow: 0 0 8px rgba(83, 109, 254, 0.46); /* 加入阴影 */
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.user-role {
  justify-content: flex-end;
}

.ai-role {
  justify-content: flex-start;
}

.avatar-img {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
}

.avatar-with-mask {
  width: 40px;
  height: 40px;
  background-color: rgba(64, 158, 255, 0.15);
  border: 2px solid rgba(64, 158, 255, 0.3);
}

.avatar-fallback {
  width: 40px;
  height: 40px;
}

.message-bubble__references {
  margin-top: 8px;
  margin-left: auto;
  /* 宽度由 JavaScript 动态设置，与消息气泡宽度一致 */
}




</style>


