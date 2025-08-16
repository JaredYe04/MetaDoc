

<script setup>

import "../assets/response-container.css"
import {ref, computed,onMounted,onBeforeMount } from 'vue';
import {Avatar, Delete, Edit, Refresh, User} from "@element-plus/icons-vue";
import {ElMessageBox} from "element-plus";
import {MdEditor,MdPreview, MdCatalog}from 'md-editor-v3';
import { themeState } from "../utils/themes";
import '../assets/md-editor-v3-style.css';
const props=defineProps({
      message:{
      type: Object,
      required: true
    },
    index:Number
})

const role=computed(()=>{
      return props.message.role;
});
const content=computed(()=>{
      return props.message.content;
});
const roleClass=computed(()=>{
      return props.message.role === 'user' ? 'user-role' : 'ai-role';
});
onBeforeMount(() => {
  //console.log(props.message)
})
const emit=defineEmits(["delete","edit","regenerate"]);

const regenerateMsg=()=>{
    emit("regenerate",props.index+1);
}
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

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
      emit('delete', props.index)
    })
    .catch(() => {
      // 取消无操作
    })
}
const editDialogVisible=ref(false);
const onMsgEdit=()=> {
  editingText.value=content.value;
  editDialogVisible.value = true;
}
const editingText=ref('');

const saveEdit=()=>{
  editDialogVisible.value = false;
  emit('edit', {index:props.index,message:editingText});
}
</script>

<template>
  <div :class="['message-bubble', roleClass]">
    <el-avatar class="avatar" v-if="role !== 'user'" :icon="Avatar"></el-avatar>
    <el-button type="primary" :icon="Edit" circle class="side-button" id="editSelfResponse" v-if="role === 'user'" @click="onMsgEdit" />
    <el-button type="info" :icon="Refresh" circle class="side-button" id="regenerateMsg" v-if="role === 'user'" @click="regenerateMsg" />
    <el-button type="danger" :icon="Delete" circle class="side-button" id="deleteSelfResponse" v-if="role === 'user'" @click="onMsgDelete" />
    <div class="bubble-content response-container" style="max-height: none;">
      <MdPreview
        :modelValue="content"
        previewTheme="github"
        codeStyleReverse
        style="text-align: left;margin-top:20px"
        :style="{ textColor: themeState.currentTheme.textColor }"
        :class="themeState.currentTheme.mdeditorClass"
        :codeFold="false"
        :autoFoldThreshold="300"
      />
      <!-- <markdown-it :source="content" /> -->
    </div>
    <el-button type="primary" :icon="Edit" circle class="side-button" id="editAiResponse" v-if="role !== 'user'" @click="onMsgEdit" />
    <el-button type="danger" :icon="Delete" circle class="side-button" id="deleteAiResponse" v-if="role !== 'user'" @click="onMsgDelete" />
    <el-avatar class="avatar" v-if="role === 'user'" :icon="User"></el-avatar>

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
      :theme="themeState.currentTheme.vditorTheme"
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

.side-button{
    align-self: flex-end;      /* 将按钮对齐到容器的底部 */
  margin-top: auto;          /* 自动填充上方的空间，贴到底部 */
}
.message-bubble {
  display: flex;
  align-items: flex-start;
  position: relative;
  margin-left: 30px;
  margin-right: 30px;
}
.bubble-content:hover{
    border-color: rgba(48, 162, 255, 0.42); /* 改变边框颜色 */
    box-shadow: 0 0 8px rgba(83, 109, 254, 0.46); /* 加入阴影 */
}
.bubble-content {

  min-width: 10px;
  min-height: 10px;
  border-radius: 10px;
  transition: transform 0.3s ease,border-color 0.3s, box-shadow 0.3s;
  margin: 10px 10px;
  padding: 0 25px; /* 内边距，增加空间 */
  max-width: 61.8%;
  flex-grow: 1;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
}

.user-role {
  justify-content: flex-end;
}

.ai-role {
  justify-content: flex-start;
}

.avatar {
  display: flex;
  justify-content: center;
  align-items: center;
  color: #181818;
  background-color: #6cc0f5; /* Customize the avatar background color */
}

</style>


