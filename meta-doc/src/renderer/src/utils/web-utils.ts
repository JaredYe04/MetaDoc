import axios from "axios"
import { SERVER_URL } from "./consts"
import { avatar, loggedIn, user } from "./common-data"
import eventBus from "./event-bus"
import { getMimeType } from "./image-utils"
import { el } from "element-plus/es/locales.mjs"
import Token from "markdown-it/lib/token.mjs"

export const getMetaDocLlmModels = async () => {
  return await axios.get(SERVER_URL + '/llm/models').then(response=>response.data.data).catch(error => {
    eventBus.emit('show-error', '获取模型列表失败：' + error.message)
    return null
  }
  )
}
export const changePassword = async (uid,oldPassword,newPassword) => {
  try {

    const response = await axios.post(SERVER_URL+'/user/change-password',{},{
      params:{
        uid: uid,
        oldPassword: oldPassword,
        newPassword: newPassword
      }
    });

    if (response.data.messageType=== 'SUCCESS') {
      // 密码更新成功，触发显示成功消息
      eventBus.emit('show-success', '密码更新成功');
      return 0;
    } else {
      // 密码更新失败，触发显示错误消息
      eventBus.emit('show-error', response.data.message || '密码更新失败');
      return -1;
    }
  } catch (error) {
    // 捕获错误并显示错误信息
    eventBus.emit('show-error', '请求失败，请稍后重试');
    console.error('Error:', error);
    return -1;
  }
};

export const login = (loginData: { rememberMe: any }) => {
  axios.post(SERVER_URL + '/user/login', loginData)
    .then(async response => {
      //console.log(response)
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
    .catch(error => {
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
    const file = (event.target as HTMLInputElement).files?.[0]
    if (file) {
      formData.append('file', file)
      formData.append('userId', user.value.id)

      //上传头像到服务器
      axios.post(SERVER_URL + '/image/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': localStorage.getItem('loginToken')
        }
      })
        .then(async (response) => {
          //console.log(response)
          if (response.data.messageType == 'SUCCESS') {
            eventBus.emit('show-success', '头像上传成功')
            user.value.avatarId = response.data.data
            updateUserInfo()
            avatar.value = await fetchImage(user.value.avatarId)
            //console.log('avatar:', avatar.value)
            // 更新用户信息
          } else {
            //console.log(response)
            eventBus.emit('show-error', response.data.message)
          }
        })
        .catch(error => {
          eventBus.emit('show-error', '头像上传失败：' + error.message)
        })

    }
  }
  fileInput.click()
}

export const fetchImage = async (imageId: number) => {
  const response = await axios.get(SERVER_URL + '/image/' + imageId).catch(error => {
    eventBus.emit('show-error', '获取图片失败：' + error.message)
    return null
  })
  if (response) {
    //console.log('response:', response)
    const b64String = response.data.data.b64String
    //console.log('bytes:', bytes)
    const imageUrl = `data:image/jpeg;base64,${b64String}`;
    //console.log('imageUrl:', imageUrl)
    return imageUrl;

  } else {
    eventBus.emit('show-error', '获取图片失败：' + response)
    return null
  }



}

export async function getMetaDocLlmConfig(loginToken,model) {

  // @GetMapping("/config")
  // public ResponseBody getLlmConfig(@RequestParam String modelName, @RequestParam String loginToken) 
  return await axios.get(SERVER_URL + '/llm/config', {
    params: {
      modelName: model,
      loginToken: loginToken
    }
  }).then((response) => {
    //console.log('getMetaDocLlmConfig:', response)
    if (response.data.messageType === 'SUCCESS') {
      return response.data.data
    } else {
      eventBus.emit('show-error', response.data.message)
      return null
    }
  }
  ).catch((error) => {
    eventBus.emit('show-error', '获取模型配置失败：' + error.message)
    console.error('获取模型配置请求失败:', error)
    return null
  }
  )
}

export async function verifyToken(token) {
  await axios.post(SERVER_URL + '/user/verify-token', null, {
    params: {
      token: token
    },
  }).then(async (response) => {
    if (response.data.messageType === 'SUCCESS') {
      user.value = response.data.data
      avatar.value = await fetchImage(user.value.avatarId)
      //console.log('user:', user.value)
      loggedIn.value = true
      eventBus.emit('user-info-updated')
    }
  }).catch((error) => {
    console.error('Token验证请求失败:', error)
    //sessionStorage.removeItem('loginToken')
    localStorage.removeItem('loginToken')
    loggedIn.value = false
    user.value = null

  })
  return loggedIn.value
}
export async function updateUserInfo() {
  //console.log('token:', token)
  const response = await axios.post(SERVER_URL + '/user/update', user.value, {
    headers: {
      'Content-Type': 'application/json'
    },
  }).catch((error) => {
    eventBus.emit('show-error', '更新用户信息失败：' + error.message)
    console.error('更新用户信息请求失败:', error)
    return -1;
  })
  //console.log('updateUserInfo:', response)
  if (response.data.messageType === 'SUCCESS') {
    return 0;
    //user.value=response.data.data
    //eventBus.emit('show-success', '用户信息更新成功')
  }
  else {
    eventBus.emit('show-error', response.data.message)
    return -1;
  }

}