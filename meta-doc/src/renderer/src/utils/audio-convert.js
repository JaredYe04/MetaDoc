export const convertWebMToWav = async (webmBlob) => {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // 解码 WebM Blob 文件
    const arrayBuffer = await webmBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    // 如果原始采样率不是 16000 Hz，可以进行重新采样
    const targetSampleRate = 16000;
    let resampledBuffer = audioBuffer;
    
    if (audioBuffer.sampleRate !== targetSampleRate) {
      const offlineContext = new OfflineAudioContext(
        audioBuffer.numberOfChannels,
        audioBuffer.length,
        targetSampleRate
      );
      
      const source = offlineContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(offlineContext.destination);
      source.start();
      
      resampledBuffer = await offlineContext.startRendering();
    }
    
    // 将 AudioBuffer 转换为 WAV 格式
    const wavData = audioBufferToWav(resampledBuffer);
    return new Blob([wavData], { type: 'audio/wav' });
  };
  
  // WAV 转换函数（音频缓冲区转 WAV）
  const audioBufferToWav = (audioBuffer) => {
    const buffer = audioBuffer.getChannelData(0);  // 获取单声道音频数据
    const wav = new ArrayBuffer(44 + buffer.length * 2);  // WAV 文件的总大小
    const view = new DataView(wav);
    
    // 写入 WAV 文件头（44字节）
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + buffer.length, true);  // 文件大小
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);  // 格式块大小
    view.setUint16(20, 1, true);   // PCM 格式
    view.setUint16(22, 1, true);   // 单声道
    view.setUint32(24, 16000, true); // 采样率
    view.setUint32(28, 16000 * 2, true);  // 数据速率
    view.setUint16(32, 2, true);   // 块对齐
    view.setUint16(34, 16, true);  // 每个采样的位数
    writeString(view, 36, 'data');
    view.setUint32(40, buffer.length, true);  // 音频数据大小
    
    // 写入音频数据
    for (let i = 0; i < buffer.length; i++) {
      view.setInt16(44 + i * 2, buffer[i] * 0x7FFF, true); // PCM 数据
    }
    
    return wav;
  };
  
  // 辅助函数：写字符串到 DataView
  const writeString = (view, offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  