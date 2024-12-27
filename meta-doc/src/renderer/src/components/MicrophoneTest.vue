<template>
  <div class="microphone-test">
    <el-button :type="isRecording ? 'danger' : 'primary'" @click="toggleRecording" circle>
      <el-icon v-if="!isRecording"><Microphone /></el-icon>
      <el-icon v-if="isRecording"><Select /></el-icon>
    </el-button>
    <audio ref="audioPlayer" :src="audioUrl" controls v-if="audioUrl" class="audio-player" />
  </div>
</template>
  <script setup>
  import { ref } from 'vue'
  import { ElButton, ElIcon } from 'element-plus'
  import { Microphone, Select } from '@element-plus/icons-vue'
import { convertWebMToWav } from '../utils/audio-convert';

  const isRecording = ref(false)
  const audioPlayer = ref(null)
  let mediaRecorder = null
  let audioChunks = []
  const audioUrl = ref('')

  const toggleRecording = async () => {
    if (isRecording.value) {
      // 停止录制
      mediaRecorder.stop()
      isRecording.value = false
    } else {
      // 开始录制
      await startRecording()
      isRecording.value = true
    }
  }
  
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true ,video:false})
      console.log('Microphone access granted')
    // 创建一个新的 MediaRecorder 实例
    mediaRecorder = new MediaRecorder(stream,{
      mimeType: 'audio/webm',
      audioBitsPerSecond : 16000
    });
    
    let audioChunks = [];
    mediaRecorder.ondataavailable = (event) => {
      audioChunks.push(event.data);
    };
  
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type : 'audio/webm' })
        audioChunks = []
        const wavBlob = await convertWebMToWav(audioBlob)
        const audioObjectUrl = URL.createObjectURL(wavBlob)
        audioUrl.value = audioObjectUrl // 生成音频URL并绑定
      }
  
      mediaRecorder.start()
    } catch (err) {
      eventBus.emit('show-error', '无法访问麦克风，请检查权限设置')
      console.error('Error accessing microphone:', err)
    }
  }
  
  </script>
<style scoped>
.microphone-test {
  display: flex;
  align-items: center;
  gap: 10px; /* 控制按钮和音频播放器之间的间距 */
}
</style>