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
import { themeState } from '../utils/themes';

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
  background: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor,
  boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)',
  zIndex: 1000,
  padding: '2px 0',
  backdropFilter: 'blur(40px)',
  borderRadius: '8px',
  minWidth: '150px'
}));

const menuItemStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  padding: "10px",
  height: "15px",
  cursor: 'pointer',
  "--menu-hover-color": themeState.currentTheme.background2nd,
  "--menu-disabled-color": themeState.currentTheme.background2nd,
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

.menu-item:hover {
  background-color: var(--menu-hover-color);
  opacity: 0.9;
}

.menu-item.disabled {
  background-color: var(--menu-disabled-color);
  cursor: not-allowed;
  pointer-events: none;
}
</style>
