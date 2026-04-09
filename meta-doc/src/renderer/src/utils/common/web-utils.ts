import axios from 'axios'
import { SERVER_URL } from '../consts'
import { avatar, loggedIn, user, resetUserState } from '../stores/user'
import eventBus from '../event-bus'
import { getMimeType } from '../image-utils'
import Token from 'markdown-it/lib/token.mjs'
import { createRendererLogger } from '../common/logger.ts'
import { getImageUrlWithCache, cacheImageUrl } from '../image/image-cache'

export const getMetaDocLlmModels = async () => {
  return await axios
    .get(SERVER_URL + '/llm/models')
    .then((response) => response.data.data)
    .catch((error) => {
      eventBus.emit('show-error', '获取模型列表失败：' + error.message)
      return null
    })
}
export const changePassword = async (uid: string, oldPassword: string, newPassword: string) => {
  try {
    const response = await axios.post(
      SERVER_URL + '/user/change-password',
      {},
      {
        params: {
          uid: uid,
          oldPassword: oldPassword,
          newPassword: newPassword
        }
      }
    )

    if (response.data.messageType === 'SUCCESS') {
      // 密码更新成功，触发显示成功消息
      eventBus.emit('show-success', '密码更新成功')
      return 0
    } else {
      // 密码更新失败，触发显示错误消息
      eventBus.emit('show-error', response.data.message || '密码更新失败')
      return -1
    }
  } catch (error) {
    // 捕获错误并显示错误信息
    eventBus.emit('show-error', '请求失败，请稍后重试')
    //logger.error('Error:', error);
    return -1
  }
}

export const login = (loginData: { rememberMe: any }) => {
  axios
    .post(SERVER_URL + '/user/login', loginData)
    .then(async (response) => {
      const logger = createRendererLogger('WebUtils')
      //logger.debug(response)
      if (response.data.messageType == 'SUCCESS') {
        const token = response.data.data
        // 保存token到本次会话
        // sessionStorage.setItem('loginToken', token)
        // if (loginData.rememberMe) {
        //   localStorage.setItem('loginToken', token)//保存到本地
        // }
        localStorage.setItem('loginToken', token)
        eventBus.emit('show-success', '登录成功')
        await verifyToken(token)
      } else {
        eventBus.emit('show-error', response.data.message)
      }
    })
    .catch((error) => {
      eventBus.emit('show-error', '登录失败：' + error.message)
    })
}
export const changeAvatar = () => {
  if (!user.value.id) {
    eventBus.emit('show-error', '请先登录')
    return
  }
  //上传头像
  const formData = new FormData()
  const fileInput = document.createElement('input')
  fileInput.type = 'file'
  fileInput.accept = 'image/*'
  fileInput.onchange = (event) => {
    //const file = event.target.files?.[0];
    let file = null
    if (
      event.target instanceof HTMLInputElement &&
      event.target.files &&
      event.target.files.length > 0
    ) {
      file = event.target.files[0]
    }
    if (file) {
      formData.append('file', file)
      formData.append('userId', user.value.id)

      //上传头像到服务器
      axios
        .post(SERVER_URL + '/image/upload', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
            Authorization: localStorage.getItem('loginToken')
          }
        })
        .then(async (response) => {
          const logger = createRendererLogger('WebUtils')
          //logger.debug(response)
          if (response.data.messageType == 'SUCCESS') {
            eventBus.emit('show-success', '头像上传成功')
            // 新结构：response.data.data 包含 { id, hash, url }
            if (response.data.data && response.data.data.id) {
              user.value.avatarId = response.data.data.id
              updateUserInfo()
              // 直接使用返回的 url，并缓存
              const imageUrl = response.data.data.url ?? ''
              if (imageUrl) {
                avatar.value = (await getImageUrlWithCache(imageUrl)) || imageUrl
              } else {
                avatar.value = ''
              }
            } else {
              // 兼容旧格式：如果直接返回 id，则通过 fetchImage 获取
              user.value.avatarId = response.data.data
              updateUserInfo()
              avatar.value = (await fetchImage(user.value.avatarId)) ?? ''
            }
            //logger.debug('avatar:', avatar.value)
            // 更新用户信息
          } else {
            logger.debug(response)
            eventBus.emit('show-error', response.data.message)
          }
        })
        .catch((error) => {
          eventBus.emit('show-error', '头像上传失败：' + error.message)
        })
    }
  }
  fileInput.click()
}

export const fetchImage = async (imageId: number) => {
  try {
    const response = await axios.get(SERVER_URL + '/image/' + imageId)
    const logger = createRendererLogger('WebUtils')
    //logger.debug('fetchImage response:', response.data)

    if (response.data && response.data.data && response.data.data.url) {
      const imageUrl = response.data.data.url
      //logger.debug('Image URL retrieved successfully')

      // 使用缓存获取图片 URL
      const cachedUrl = await getImageUrlWithCache(imageUrl)
      return cachedUrl || imageUrl
    } else {
      logger.warn('Invalid image response format')
      return null
    }
  } catch (error: any) {
    const logger = createRendererLogger('WebUtils')
    logger.error('获取图片失败:', error)
    eventBus.emit('show-error', '获取图片失败：' + (error.message || '未知错误'))
    return null
  }
}

export async function getMetaDocLlmConfig(loginToken: string, model: string) {
  // @GetMapping("/config")
  // public ResponseBody getLlmConfig(@RequestParam String modelName, @RequestParam String loginToken)
  return await axios
    .get(SERVER_URL + '/llm/config', {
      params: {
        modelName: model,
        loginToken: loginToken
      }
    })
    .then((response) => {
      const logger = createRendererLogger('WebUtils')
      //logger.debug('getMetaDocLlmConfig:', response)
      if (response.data.messageType === 'SUCCESS') {
        return response.data.data
      } else {
        eventBus.emit('show-error', response.data.message)
        return null
      }
    })
    .catch((error) => {
      eventBus.emit('show-error', '获取模型配置失败：' + error.message)
      //logger.error('获取模型配置请求失败:', error)
      return null
    })
}

export async function verifyToken(token: string) {
  const logger = createRendererLogger('WebUtils')
  try {
    const response = await axios.post(SERVER_URL + '/user/verify-token', null, {
      params: {
        token: token
      }
    })

    //logger.debug('verifyToken response:', response.data)

    if (response.data.messageType === 'SUCCESS') {
      user.value = response.data.data ?? {}
      //logger.debug('User data set:', user.value)

      // 获取头像（已使用缓存）
      if (user.value?.avatarId) {
        //logger.debug('Fetching avatar with avatarId:', user.value.avatarId)
        avatar.value = (await fetchImage(user.value.avatarId)) ?? ''
        //logger.debug('Avatar fetched:', avatar.value ? 'success' : 'failed')
      } else {
        //logger.debug('No avatarId, setting avatar to empty string')
        avatar.value = ''
      }

      loggedIn.value = true
      //logger.debug('Logged in set to true, emitting user-info-updated')
      eventBus.emit('user-info-updated')

      return true
    } else {
      logger.warn('Token verification failed:', response.data.message)
      localStorage.removeItem('loginToken')
      resetUserState()
      return false
    }
  } catch (error) {
    logger.error('Token验证请求失败:', error)
    localStorage.removeItem('loginToken')
    resetUserState()
    return false
  }
}
export async function updateUserInfo() {
  const logger = createRendererLogger('WebUtils')
  const token = localStorage.getItem('loginToken')
  //logger.debug('token:', token)
  const response = await axios
    .post(SERVER_URL + '/user/update', user.value, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: token || ''
      }
    })
    .catch((error) => {
      eventBus.emit('show-error', '更新用户信息失败：' + error.message)
      //logger.error('更新用户信息请求失败:', error)
      return null
    })
  if (!response) {
    return -1
  }
  //logger.debug('updateUserInfo:', response)
  if (response.data.messageType === 'SUCCESS') {
    return 0
    //user.value=response.data.data
    //eventBus.emit('show-success', '用户信息更新成功')
  } else {
    eventBus.emit('show-error', response.data.message)
    return -1
  }
}
