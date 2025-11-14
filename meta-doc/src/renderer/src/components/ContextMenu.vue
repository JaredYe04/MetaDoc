<template>
  <div ref="menuRef" :style="menuStyle" class="context-menu aero-div" @click="handleClick" style=" opacity: 0.95;"
    @mousedown.stop="onMouseDown">
    <div style="width: 100%; height: 15px; align-items: end; padding-bottom: 10px; padding-left: 10px;">
      <VoiceInput v-if="showVoiceInput" :size="'small'" @onSpeechRecognized="onSpeechRecognized"
        @onStateUpdated="onStateUpdated" />
    </div>
    <!-- 菜单项循环渲染 -->
    <div v-for="(item, index) in items" :key="index" class="menu-item"
      :class="{ disabled: isRecording && item.disabledWhileRecording }" :style="menuItemStyle"
      @mousedown="onMenuItemClick(item)">
      {{ $t(item.label) }}
    </div>
  </div>
</template>

<script setup>
import VoiceInput from './VoiceInput.vue';
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import "../assets/aero-div.css";
import { themeState, mixColors } from '../utils/themes';

const props = defineProps({
  x: Number,
  y: Number,
  items: { type: Array, default: () => [] }, // [{ label: 'AI分析', value: 'ai-assistant', disabledWhileRecording: true }]
  showVoiceInput: { type: Boolean, default: true },
});

const emit = defineEmits(['trigger', 'close', 'insert']);

const menuRef = ref(null);
const menuPosition = ref({ top: props.y, left: props.x });
const isDragging = ref(false);
const dragStart = ref({ x: 0, y: 0 });
const isRecording = ref(false);

// -------------------- 拖拽逻辑 --------------------
const onMouseDown = (event) => {
  isDragging.value = true;
  dragStart.value = {
    x: event.clientX - menuPosition.value.left,
    y: event.clientY - menuPosition.value.top
  };
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
};

const onMouseMove = (event) => {
  if (!isDragging.value) return;
  menuPosition.value = {
    top: event.clientY - dragStart.value.y,
    left: event.clientX - dragStart.value.x
  };
};

const onMouseUp = () => {
  isDragging.value = false;
  document.removeEventListener("mousemove", onMouseMove);
  document.removeEventListener("mouseup", onMouseUp);
};

// -------------------- 点击外部关闭 --------------------
function handleClickOutside(e) {
  
  if (menuRef.value && !menuRef.value.contains(e.target)) {
    if (!isRecording.value) emit("close");
  }
}
function handleRepeatRightClick(e){
  //console.log("trigger",e)
  if(e.button!="2")return;
  if (!isRecording.value) emit("close");
}
onMounted(() => {
  document.addEventListener("click", handleClickOutside);
  document.onmousedown=(event)=>handleRepeatRightClick(event);
});

onBeforeUnmount(() => {
  document.removeEventListener("click", handleClickOutside);
});

// -------------------- 语音输入 --------------------
const onStateUpdated = (state) => {
  isRecording.value = state === 'recording';
};

const onSpeechRecognized = (text) => {
  emit('insert', text);
};

// -------------------- 样式 --------------------
const menuStyle = computed(() => ({
  top: `${menuPosition.value.top}px`,
  left: `${menuPosition.value.left}px`,
  background: themeState.currentTheme.background2nd,
  color: themeState.currentTheme.textColor,
  border: `1px solid ${mixColors(themeState.currentTheme.background2nd, themeState.currentTheme.textColor, 0.65)}`,
  boxShadow: '0 16px 32px rgba(15, 23, 42, 0.18)',
  zIndex: 1000,
  padding: '2px 0',
  borderRadius: '8px',
  minWidth: '160px',
  backdropFilter: 'blur(6px)'
}));

const menuItemStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  padding: "10px",
  height: "34px",
  cursor: 'pointer',
  fontSize: "13px",
  display: "flex",
  alignItems: "center",
  "--menu-hover-color": mixColors(themeState.currentTheme.background2nd, themeState.currentTheme.textColor, themeState.currentTheme.type === 'dark' ? 0.4 : 0.14),
  "--menu-disabled-color": mixColors(themeState.currentTheme.background2nd, themeState.currentTheme.textColor, 0.08),
}));

// -------------------- 点击菜单项 --------------------
const onMenuItemClick = (item) => {
  if (isRecording.value && item.disabledWhileRecording) return;
  emit('trigger', item.value);
};
</script>

<style scoped>
.context-menu {
  display: block;
  border-radius: 8px;
  min-width: 150px;
}

.menu-item {
  transition: background-color 0.15s ease, opacity 0.15s ease;
}

.menu-item:hover {
  background-color: var(--menu-hover-color);
  opacity: 0.95;
  transition: background-color 0.15s ease, opacity 0.15s ease;
}

.menu-item.disabled {
  background-color: var(--menu-disabled-color);
  cursor: not-allowed;
  pointer-events: none;
}
</style>
