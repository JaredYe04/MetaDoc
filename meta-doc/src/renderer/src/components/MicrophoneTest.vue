<template>
  <div class="microphone-test">
    <Button :type="isRecording ? 'danger' : 'primary'" @click="toggleRecording" circle>
      <el-icon v-if="!isRecording"><Microphone /></el-icon>
      <el-icon v-if="isRecording"><Select /></el-icon>
    </Button>
    <audio ref="audioPlayer" :src="audioUrl" controls v-if="audioUrl" class="audio-player" />
  </div>
</template>
<script setup>
import { ref } from 'vue'
import { ElIcon } from 'element-plus'
import { Button } from '@renderer/components/ui/button'
import { Microphone, Select } from '@element-plus/icons-vue'
import { convertWebMToWav } from '../utils/audio-convert'
import { createRendererLogger } from '../utils/logger'
const logger = createRendererLogger('MicrophoneTest')
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
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const startRecording = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    // console.log('Microphone access granted')
    mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm',
      audioBitsPerSecond: 16000
    })

    let audioChunks = []
    mediaRecorder.ondataavailable = (event) => {
      audioChunks.push(event.data)
    }

    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' })
      audioChunks = []
      const wavBlob = await convertWebMToWav(audioBlob)
      const audioObjectUrl = URL.createObjectURL(wavBlob)
      audioUrl.value = audioObjectUrl // 生成音频URL并绑定
    }

    mediaRecorder.start()
  } catch (err) {
    eventBus.emit('show-error', t('microphoneTest.cannotAccessMic'))
    logger.error('Error accessing microphone:', err)
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
