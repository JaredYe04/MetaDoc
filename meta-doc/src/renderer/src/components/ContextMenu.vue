<template>
  <div :style="menuStyle" class="context-menu aero-div" @click="handleClick" style="  background: #E6E6FABB;opacity: 0.95;"
  
  @mousedown.stop="onMouseDown">
    <div style="width: 100%; height: fit-content; align-items: end; padding-bottom: 10px; padding-left: 10px;">
      <el-button 
        circle 
        size="small" 
        type="danger" 
        @click="$emit('close')" 
        class="aero-btn" 
        style="float: inline-start;" 
        @mousedown.stop
        :disabled="isRecording"
      >
      </el-button>
      <VoiceInput :size="'small'" @onSpeechRecognized="onSpeechRecognized" @onStateUpdated="onStateUpdated" />
    </div>
    
    <!-- 菜单项，依据 recording 或 idle 状态禁用点击 -->
    <div 
      class="menu-item" 
      @mousedown="onMenuItemClick('ai-assistant')" 
      :class="{ disabled: isRecording }"
      :style="{ cursor: isRecording ? 'not-allowed' : 'pointer', color: isRecording ? '#ccc' : 'black' }"
    >
      询问AI
    </div>
    <!-- <div 
      class="menu-item" 
      @mousedown="onMenuItemClick('cut')" 
      :class="{ disabled: isRecording }"
      :style="{ cursor: isRecording ? 'not-allowed' : 'pointer', color: isRecording ? '#ccc' : 'black' }"
    >
      剪切
    </div> -->
    <div 
      class="menu-item" 
      @mousedown="onMenuItemClick('copy')" 
      :class="{ disabled: isRecording }"
      :style="{ cursor: isRecording? 'not-allowed' : 'pointer', color: isRecording? '#ccc' : 'black' }"
    >
      复制
    </div>
    <div 
      class="menu-item" 
      @mousedown="onMenuItemClick('paste')" 
      :class="{ disabled: isRecording }"
      :style="{ cursor: isRecording ? 'not-allowed' : 'pointer', color: isRecording ? '#ccc' : 'black' }"
    >
      粘贴
    </div>
  </div>
</template>

<script setup>
import VoiceInput from './VoiceInput.vue';
import { computed, onMounted, ref, watch } from 'vue';
import "../assets/aero-div.css";
const onMouseDown = (event) => {
  isDragging.value = true;
  dragStart.value = {
    x: event.clientX - menuPosition.value.left,
    y: event.clientY - menuPosition.value.top,
  };
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
};

const onMouseMove = (event) => {
  if (!isDragging.value) return;
  menuPosition.value = {
    top: event.clientY - dragStart.value.y,
    left: event.clientX - dragStart.value.x,
  };
};

const onMouseUp = () => {
  isDragging.value = false;
  document.removeEventListener("mousemove", onMouseMove);
  document.removeEventListener("mouseup", onMouseUp);
};
// 定义状态变量
const isRecording = ref(false);
const empty_selection = ref(true);
// 监听状态更新
const onStateUpdated = (state) => {
  if (state === 'recording') {
    isRecording.value = true;
  } else {
    isRecording.value = false;
  }
};

// 接收父组件传递的显示状态和坐标
const props = defineProps({
  x: Number,
  y: Number,
});

const menuPosition = ref({ top: props.y, left: props.x });
const isDragging = ref(false);
const dragStart = ref({ x: 0, y: 0 });
onMounted(() => {
  menuPosition.value.top = props.y;
  menuPosition.value.left = props.x;
});
// 计算菜单样式
const menuStyle = computed(() => ({
  position: 'absolute',
  top: `${menuPosition.value.top}px`,
  left: `${menuPosition.value.left}px`,
  background: '#fff',
  boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)',
  borderRadius: '4px',
  zIndex: 1000,
  padding: '5px 0',
}));
const menuStyles = computed(() => ({
  position: 'absolute',
  top: `${menuPosition.value.top}px`,
  left: `${menuPosition.value.left}px`,
  border: '1px solid #ccc',
  padding: '10px',
  boxShadow: '0px 2px 10px rgba(0, 0, 0, 0.2)',
  maxWidth: '600px',
  zIndex: 1000, // 保证层级
  color: 'black',
  backdropFilter: 'blur(40px)'
}));

// const menuPosition = ref({ top: props.position.top, left: props.position.left });
// const isDragging = ref(false);
// const dragStart = ref({ x: 0, y: 0 });
// const onMouseDown = (event) => {
//   isDragging.value = true;
//   dragStart.value = {
//     x: event.clientX - menuPosition.value.left,
//     y: event.clientY - menuPosition.value.top,
//   };
//   document.addEventListener("mousemove", onMouseMove);
//   document.addEventListener("mouseup", onMouseUp);
// };

// const onMouseMove = (event) => {
//   if (!isDragging.value) return;
//   menuPosition.value = {
//     top: event.clientY - dragStart.value.y,
//     left: event.clientX - dragStart.value.x,
//   };
// };

// const onMouseUp = () => {
//   isDragging.value = false;
//   document.removeEventListener("mousemove", onMouseMove);
//   document.removeEventListener("mouseup", onMouseUp);
// };

const emit = defineEmits(["trigger", "close","insert"]);

// 处理点击菜单项
const onMenuItemClick = (item) => {
  if(isRecording.value) return;
  //console.log(`点击了 ${item}`);
  emit('trigger', item);
};
const onSpeechRecognized = (text) => {
  emit('insert', text);
}


</script>


<style scoped>
.context-menu {
  display: block;
  border-radius: 8px;
  min-width: 150px;
}

.menu-item {
  padding: 10px;
  cursor: pointer;
}

.menu-item:hover {
  background-color: #f0f0f0;
  opacity: 0.9;
}

.menu-item.disabled {
  background-color: #f5f5f5;
}

.aero-div:hover {
  transform: scale(1);
  /* 微缩放 */
}
</style>