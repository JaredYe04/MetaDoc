<template>
  <div class="aero-div" :style="menuStyles" @mousedown.stop="onMouseDown">
    <div class="profile-header">
      <span :style="{ color: themeState.currentTheme.textColor }">{{
        t('userProfile.title')
      }}</span>
      <Tooltip>
        <TooltipTrigger as-child>
          <Button
            variant="destructive"
            size="sm"
            class="aero-btn rounded-full"
            @click="closeDialog"
          >
            <X class="w-4 h-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          {{ t('userProfile.closeMenu') }}
        </TooltipContent>
      </Tooltip>
    </div>

    <Tabs v-if="!loggedIn" v-model="activeName" class="tabs" @mousedown.stop>
      <TabsList class="grid w-full grid-cols-2">
        <TabsTrigger value="Login">{{ t('userProfile.loginTab') }}</TabsTrigger>
        <TabsTrigger value="Register">{{ t('userProfile.registerTab') }}</TabsTrigger>
      </TabsList>

      <TabsContent value="Login">
        <Form ref="loginFormRef" class="space-y-4">
          <FormField :label="t('userProfile.account')" name="username" :rules="loginRules.username">
            <Input
              v-model="loginForm.username"
              :placeholder="t('userProfile.accountPlaceholder')"
            />
          </FormField>
          <FormField
            :label="t('userProfile.password')"
            name="password"
            :rules="loginRules.password"
          >
            <Input
              v-model="loginForm.password"
              type="password"
              :placeholder="t('userProfile.passwordPlaceholder')"
            />
          </FormField>
          <div class="dialog-footer">
            <Button variant="default" @click="submitLogin">{{ t('userProfile.loginBtn') }}</Button>
          </div>
        </Form>
      </TabsContent>

      <TabsContent value="Register">
        <Form ref="registerFormRef" class="space-y-4">
          <FormField
            :label="t('userProfile.username')"
            name="username"
            :rules="registerRules.username"
          >
            <Input
              v-model="registerForm.username"
              :placeholder="t('userProfile.usernamePlaceholder')"
            />
          </FormField>
          <FormField :label="t('userProfile.phone')" name="phone" :rules="registerRules.phone">
            <Input v-model="registerForm.phone" :placeholder="t('userProfile.phonePlaceholder')" />
          </FormField>
          <FormField :label="t('userProfile.email')" name="email" :rules="registerRules.email">
            <Input v-model="registerForm.email" :placeholder="t('userProfile.emailPlaceholder')" />
          </FormField>
          <FormField
            :label="t('userProfile.password')"
            name="password"
            :rules="registerRules.password"
          >
            <Input
              v-model="registerForm.password"
              type="password"
              :placeholder="t('userProfile.passwordPlaceholder')"
            />
          </FormField>
          <div class="dialog-footer">
            <Button variant="default" @click="submitRegister">{{
              t('userProfile.registerBtn')
            }}</Button>
          </div>
        </Form>
      </TabsContent>
    </Tabs>

    <div v-else>
      <div style="display: flex; align-items: center">
        <Tooltip>
          <TooltipTrigger as-child>
            <el-avatar
              v-if="avatar && !avatarLoadError"
              :src="avatar"
              :size="128"
              style="width: 128px; height: 128px; padding: 0; cursor: pointer; object-fit: cover"
              @click="changeAvatar"
              @error="handleAvatarError"
            >
              {{ avatar ? '' : user.username }}
            </el-avatar>
            <div
              v-else
              style="
                width: 128px;
                height: 128px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                border-radius: 50%;
                background-color: rgba(0, 0, 0, 0.05);
              "
              @click="changeAvatar"
            >
              <User class="w-16 h-16" style="color: #909399" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="top">
            {{ t('userProfile.changeAvatar') }}
          </TooltipContent>
        </Tooltip>

        <div style="margin-left: 40px">
          <div style="height: 200px">
            <Form v-if="editing" ref="userFormRef" class="space-y-2" style="height: 180px">
              <h3>{{ t('userProfile.editProfileTitle') }}</h3>
              <FormField
                :label="t('userProfile.username')"
                name="username"
                :rules="registerRules.username"
              >
                <Input
                  v-model="user.username"
                  :placeholder="t('userProfile.usernamePlaceholder')"
                />
              </FormField>
              <FormField :label="t('userProfile.phone')" name="phone" :rules="registerRules.phone">
                <Input v-model="user.phone" :placeholder="t('userProfile.phonePlaceholder')" />
              </FormField>
              <FormField :label="t('userProfile.email')" name="email" :rules="registerRules.email">
                <Input v-model="user.email" :placeholder="t('userProfile.emailPlaceholder')" />
              </FormField>
            </Form>

            <Form v-if="editingPwd" ref="pwdFormRef" class="space-y-2" style="height: 180px">
              <h3>{{ t('userProfile.changePasswordTitle') }}</h3>
              <FormField
                :label="t('userProfile.oldPassword')"
                name="oldPwd"
                :rules="editPwdRules.oldPassword"
              >
                <Input
                  v-model="editPwdForm.oldPwd"
                  type="password"
                  :placeholder="t('userProfile.oldPasswordPlaceholder')"
                />
              </FormField>
              <FormField
                :label="t('userProfile.newPassword')"
                name="newPwd"
                :rules="editPwdRules.newPassword"
              >
                <Input
                  v-model="editPwdForm.newPwd"
                  type="password"
                  :placeholder="t('userProfile.newPasswordPlaceholder')"
                />
              </FormField>
            </Form>

            <div v-if="!editing && !editingPwd" style="height: 180px">
              <Tooltip>
                <TooltipTrigger as-child>
                  <h3>{{ user.username }}</h3>
                </TooltipTrigger>
                <TooltipContent side="left">
                  {{ t('userProfile.username') }}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger as-child>
                  <p>{{ user.email }}</p>
                </TooltipTrigger>
                <TooltipContent side="left">
                  {{ t('userProfile.email') }}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger as-child>
                  <p>{{ user.phone }}</p>
                </TooltipTrigger>
                <TooltipContent side="left">
                  {{ t('userProfile.phone') }}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger as-child>
                  <p>
                    {{
                      new Date(user.createdAt).toLocaleDateString(locale, {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      })
                    }}
                  </p>
                </TooltipTrigger>
                <TooltipContent side="left">
                  {{ t('userProfile.createdAt') }}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger as-child>
                  <p>Token: {{ user.tokens }} $</p>
                </TooltipTrigger>
                <TooltipContent side="left">
                  {{ t('userProfile.tokenBalance') }}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          <div>
            <Tooltip v-if="!editing && !editingPwd">
              <TooltipTrigger as-child>
                <Button variant="destructive" class="rounded-full w-9 h-9 p-0" @click="logout">
                  <Power class="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {{ t('userProfile.logout') }}
              </TooltipContent>
            </Tooltip>

            <Tooltip v-if="editing || editingPwd">
              <TooltipTrigger as-child>
                <Button variant="default" class="rounded-full w-9 h-9 p-0" @click="cancelEdit">
                  <Undo2 class="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {{ t('userProfile.cancel') }}
              </TooltipContent>
            </Tooltip>

            <Tooltip v-if="!editingPwd">
              <TooltipTrigger as-child>
                <Button
                  :variant="editing ? 'outline' : 'default'"
                  :class="[
                    'rounded-full w-9 h-9 p-0',
                    editing
                      ? 'border-green-500 text-green-600 hover:bg-green-50 hover:text-green-700'
                      : ''
                  ]"
                  @click="toggleEdit"
                >
                  <Check v-if="editing" class="w-4 h-4" />
                  <Pencil v-else class="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {{ editing ? t('userProfile.saveEdit') : t('userProfile.editProfile') }}
              </TooltipContent>
            </Tooltip>

            <Tooltip v-if="!editing">
              <TooltipTrigger as-child>
                <Button
                  :variant="editingPwd ? 'outline' : 'default'"
                  :class="[
                    'rounded-full w-9 h-9 p-0',
                    editingPwd
                      ? 'border-green-500 text-green-600 hover:bg-green-50 hover:text-green-700'
                      : ''
                  ]"
                  @click="toggleEditPwd"
                >
                  <Check v-if="editingPwd" class="w-4 h-4" />
                  <Lock v-else class="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {{ editingPwd ? t('userProfile.savePwd') : t('userProfile.changePwd') }}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { ElAvatar, ElDialog } from 'element-plus'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@renderer/components/ui/tabs'
import { Form, FormField } from '@renderer/components/ui/form'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { useLocalStorage } from '@vueuse/core'
import { themeState } from '../utils/themes'
import eventBus from '../utils/event-bus.js'
import axios from 'axios'
import { SERVER_URL } from '../utils/consts.js'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const editingPwd = ref(false)
const editPwdForm = ref({
  oldPwd: '',
  newPwd: ''
})
const pwdFormRef = ref(null)
const toggleEditPwd = async () => {
  user_backup = { ...user.value }
  if (editingPwd.value) {
    await pwdFormRef.value.validate(async (valid) => {
      if (!valid) {
        eventBus.emit('show-error', t('userProfile.messages.invalidPassword'))
        return
      } else if (editPwdForm.value.newPwd === editPwdForm.value.oldPwd) {
        eventBus.emit('show-error', t('userProfile.messages.samePassword'))
        return
      } else {
        const result = await changePassword(
          user.value.id,
          editPwdForm.value.oldPwd,
          editPwdForm.value.newPwd
        )
        if (result == 0) {
          editingPwd.value = false
          //eventBus.emit('show-success', '修改成功！')
        }
      }
    })
  } else {
    editPwdForm.value = {
      oldPwd: '',
      newPwd: ''
    }
    editingPwd.value = true
  }
}
const editing = ref(false)
let user_backup = null
async function toggleEdit() {
  if (editing.value) {
    await userFormRef.value.validate(async (valid) => {
      if (!valid) {
        eventBus.emit('show-error', t('userProfile.messages.invalidInfo'))
        return
      } else {
        const result = await updateUserInfo(user.value)
        if (result == 0) {
          editing.value = false
          eventBus.emit('show-success', t('userProfile.messages.modifySuccess'))
          user_backup = null
        }
      }
    })
  } else {
    user_backup = { ...user.value } // 备份用户信息
    editing.value = true
  }
}
const cancelEdit = () => {
  user.value = { ...user_backup } // 恢复用户信息
  editing.value = false
  editingPwd.value = false
  editPwdForm.value = {
    oldPwd: '',
    newPwd: ''
  }
}

const activeName = ref('Login')
const logout = () => {
  //sessionStorage.removeItem('loginToken')
  localStorage.removeItem('loginToken')
  loggedIn.value = false
  user.value = null
  avatar.value = null
  eventBus.emit('show-success', t('userProfile.messages.logoutSuccess'))
}
const loginRules = {
  username: [
    { required: true, message: t('userProfile.rules.usernameRequired'), trigger: 'blur' },
    {
      pattern: /^[a-zA-Z0-9_-]{6,}$/,
      message: t('userProfile.rules.usernamePattern'),
      trigger: 'blur'
    }
  ],
  password: [
    { required: true, message: t('userProfile.rules.passwordRequired'), trigger: 'blur' },
    {
      pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/,
      message: t('userProfile.rules.passwordPattern'),
      trigger: 'blur'
    }
  ]
}

const registerRules = {
  username: [
    { required: true, message: t('userProfile.rules.usernameRequired'), trigger: 'blur' },
    {
      pattern: /^[a-zA-Z0-9_-]{6,}$/,
      message: t('userProfile.rules.usernamePattern'),
      trigger: 'blur'
    }
  ],
  phone: [
    { required: true, message: t('userProfile.rules.phoneRequired'), trigger: 'blur' },
    {
      pattern: /^[1][3-9][0-9]{9}$/,
      message: t('userProfile.rules.phonePattern'),
      trigger: 'blur'
    }
  ],
  email: [
    { required: true, message: t('userProfile.rules.emailRequired'), trigger: 'blur' },
    {
      pattern: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
      message: t('userProfile.rules.emailPattern'),
      trigger: 'blur'
    }
  ],
  password: [
    { required: true, message: t('userProfile.rules.passwordRequired'), trigger: 'blur' },
    {
      pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/,
      message: t('userProfile.rules.passwordPattern'),
      trigger: 'blur'
    }
  ]
}

const editPwdRules = {
  oldPassword: [
    { required: true, message: t('userProfile.rules.passwordRequired'), trigger: 'blur' },
    {
      pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/,
      message: t('userProfile.rules.passwordPattern'),
      trigger: 'blur'
    }
  ],
  newPassword: [
    { required: true, message: t('userProfile.rules.newPasswordRequired'), trigger: 'blur' },
    {
      pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/,
      message: t('userProfile.rules.passwordPattern'),
      trigger: 'blur'
    }
  ]
}

const props = defineProps({
  position: {
    type: Object,
    required: true
  }
})
// 用户登录信息
import { avatar, loggedIn, user } from '../stores/user'
import {
  changeAvatar,
  changePassword,
  login,
  updateUserInfo,
  verifyToken
} from '../utils/web-utils.ts'
import { Check, Pencil, Lock, Undo2, Power, User, X } from 'lucide-vue-next'

// 头像加载错误处理
const avatarLoadError = ref(false)

// 监听 avatar 变化，重置错误状态
watch(avatar, () => {
  avatarLoadError.value = false
})

// 处理头像加载错误
const handleAvatarError = () => {
  avatarLoadError.value = true
}

const menuStyles = computed(() => ({
  position: 'absolute',
  top: `${menuPosition.value.top}px`,
  left: `${menuPosition.value.left}px`,

  padding: '10px',
  boxShadow: '0px 2px 10px rgba(0, 0, 0, 0.2)',
  minWidth: '500px',
  maxWidth: '800px',
  zIndex: 1000, // 保证层级
  color: themeState.currentTheme.textColor2,
  backdropFilter: 'blur(5px)',
  background: themeState.currentTheme.background
}))
const menuPosition = ref({ top: props.position.top, left: props.position.left })

// 登录状态
const emit = defineEmits(['close'])
function closeDialog() {
  emit('close', false)
}

// 监听用户信息更新事件，登录成功后自动关闭对话框
const handleUserInfoUpdated = async () => {
  // 等待响应式状态更新
  await nextTick()
  // 如果已经登录，则关闭对话框
  if (loggedIn.value) {
    closeDialog()
  }
}

onMounted(() => {
  eventBus.on('user-info-updated', handleUserInfoUpdated)
})

onBeforeUnmount(() => {
  eventBus.off('user-info-updated', handleUserInfoUpdated)
})

// 登录表单数据
const loginForm = ref({
  username: '',
  password: ''
})

// 注册表单数据
const registerForm = ref({
  username: '',
  phone: '',
  email: '',
  password: ''
})
const loginFormRef = ref(null)
const registerFormRef = ref(null)
const userFormRef = ref(null)
// 事件总线

// 登录逻辑
async function submitLogin() {
  // 验证表单
  loginFormRef.value.validate((valid) => {
    if (!valid) {
      eventBus.emit('show-error', t('userProfile.messages.loginIncomplete'))
      return
    }

    login(loginForm.value)
  })
}
const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0 })
const onMouseDown = (event) => {
  isDragging.value = true
  dragStart.value = {
    x: event.clientX - menuPosition.value.left,
    y: event.clientY - menuPosition.value.top
  }
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

const onMouseMove = (event) => {
  if (!isDragging.value) return
  menuPosition.value = {
    top: event.clientY - dragStart.value.y,
    left: event.clientX - dragStart.value.x
  }
}

const onMouseUp = () => {
  isDragging.value = false
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
}
// 注册逻辑
async function submitRegister() {
  await registerFormRef.value.validate((valid) => {
    if (!valid) {
      eventBus.emit('show-error', t('userProfile.messages.registerIncomplete'))
      return
    }
    // 发送注册请求到后端
    axios
      .post(SERVER_URL + '/user/register', registerForm.value)
      .then(async (response) => {
        //console.log(response)
        if (response.data.messageType == 'SUCCESS') {
          const token = response.data.data
          // 保存token到本次会话
          //sessionStorage.setItem('loginToken', token)
          localStorage.setItem('loginToken', token)
          eventBus.emit('show-success', t('userProfile.messages.registerSuccess'))
          await verifyToken(token)
        } else {
          eventBus.emit('show-error', response.data.message)
        }
      })
      .catch((error) => {
        eventBus.emit(
          'show-error',
          t('userProfile.messages.registerFailed', { error: error.message })
        )
      })
  })
}
</script>

<style scoped>
.tabs {
  margin: 10px;
  padding: 10px;
  background-color: transparent;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
}

.el-button {
  margin-left: 10px;
}

.profile-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: bold;
}
</style>
