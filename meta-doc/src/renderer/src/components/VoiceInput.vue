<template>
  <Button
    :type="isRecording ? 'danger' : 'primary'"
    circle
    :size="props.size ? props.size : 'medium'"
    :disabled="props.disabled"
    @click="toggleRecording"
  >
    <el-icon v-if="!isRecording"><Microphone /></el-icon>
    <el-icon v-if="isRecording"><Select /></el-icon>
  </Button>
  <audio v-if="false" ref="audioPlayer" :src="audioUrl" controls class="audio-player" />
</template>

<script setup>
import { ref } from 'vue'
import { ElIcon } from 'element-plus'
import { Button } from '@renderer/components/ui/button'
import axios from 'axios'
import { convertWebMToWav } from '../utils/audio-convert'
import { useI18n } from 'vue-i18n'
const { t } = useI18n()

const audioUrl = ref('')
const isRecording = ref(false)
let mediaRecorder = null
let audioChunks = []

import { createRendererLogger } from '../utils/logger'
const logger = createRendererLogger('VoiceInput')
const props = defineProps({
  size: String,
  disabled: Boolean
})

// 定义 emit 事件
const emit = defineEmits(['onSpeechRecognized', 'onStateUpdated'])
const toggleRecording = async () => {
  if (isRecording.value) {
    // 停止录音
    stopRecording()
  } else {
    // 开始录音
    startRecording()
  }
}
const stopRecording = async () => {
  emit('onStateUpdated', 'idle')
  mediaRecorder.stop()
}
const startRecording = async () => {
  emit('onStateUpdated', 'recording')
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    //logger.log('Microphone access granted')
    var options = {
      mimeType: 'audio/webm',
      audioBitsPerSecond: 16000
    }
    // 创建一个新的 MediaRecorder 实例
    mediaRecorder = new MediaRecorder(stream, options)
    let audioChunks = []
    mediaRecorder.ondataavailable = (event) => {
      audioChunks.push(event.data)
    }
    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' })
      audioChunks = []
      const wavBlob = await convertWebMToWav(audioBlob)
      const reader = new FileReader()

      reader.onloadend = async () => {
        const base64Audio = reader.result.split(',')[1]

        const audioObjectUrl = URL.createObjectURL(wavBlob)
        audioUrl.value = audioObjectUrl // 生成音频URL并绑定
        sendAudioToBaidu(base64Audio, wavBlob.size)
      }
      reader.readAsDataURL(wavBlob)
    }
    mediaRecorder.start()
    isRecording.value = true
  } catch (err) {
    eventBus.emit('show-error', t('voiceInput.messages.microphoneDenied'))
    logger.error('Error accessing microphone:', err)
  }
}

const sendAudioToBaidu = async (base64Audio, originalSize) => {
  const token = await getBaiduToken() // 获取百度的 Access Token
  const cuid = 'yCkFM28ztnFqP2avgPIWFHcyOFjg1HIN' // 替换为你的设备唯一标识，通常是机器的 MAC 地址
  const requestBody = {
    format: 'wav', // 使用wav格式
    rate: 16000, // 设置采样率，通常为16000
    channel: 1, // 单声道
    token,
    cuid,
    len: originalSize, // 传递音频的原始字节长度
    speech: base64Audio // base64 编码后的音频数据
  }

  try {
    // 发送请求
    const response = await axios.post('http://vop.baidu.com/server_api', requestBody, {
      headers: {
        'Content-Type': 'application/json'
      }
    })

    const result = response.data

    if (result.err_no === 0) {
      const recognizedText = result.result[0] // 获取识别结果
      //logger.log(result)
      emit('onSpeechRecognized', recognizedText) // 通过事件发送识别结果给父组件
    } else {
      eventBus.emit(
        'show-error',
        t('voiceInput.messages.recognitionFailed', { error: result.err_msg })
      )
      logger.error('Recognition failed:', result.err_msg)
    }
  } catch (err) {
    eventBus.emit('show-error', t('voiceInput.messages.sendAudioError'))
    logger.error('Error sending audio to Baidu:', err)
  } finally {
    isRecording.value = false
  }
}

// 获取百度 API 的 Access Token
const getBaiduToken = async () => {
  const apiKey = 'qLZIZ6GKydtl2B7ZbgOgSxg2'
  const secretKey = 'dMYrf3WA7SojIMhwScNRj8wr7H0JeAzO'

  const tokenUrl = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`
  try {
    const response = await axios.post(tokenUrl)
    //logger.log('Baidu token:', response.data.access_token)
    return response.data.access_token
  } catch (err) {
    eventBus.emit('show-error', t('voiceInput.messages.tokenError'))
    logger.error('Error fetching Baidu token:', err)
    stopRecording()
  }
}
</script>

<style scoped></style>
