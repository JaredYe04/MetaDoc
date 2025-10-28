<template>
  <div class="aero-div" :style="menuStyles" @mousedown.stop="onMouseDown">
    <div class="profile-header">
      <span :style="{ color: themeState.currentTheme.textColor }">{{ t('userProfile.title') }}</span>
      <el-tooltip :content="t('userProfile.closeMenu')" placement="top">
        <el-button circle size="small" @click="closeDialog" class="aero-btn" type="danger">
          <el-icon><Close /></el-icon>
        </el-button>
      </el-tooltip>
    </div>

    <el-tabs v-model="activeName" class="tabs" v-if="!loggedIn" @mousedown.stop>
      <el-tab-pane :label="t('userProfile.loginTab')" name="Login">
        <el-form :model="loginForm" label-width="80px" ref="loginFormRef" :rules="loginRules">
          <el-form-item :label="t('userProfile.account')" prop="username">
            <el-input v-model="loginForm.username" :placeholder="t('userProfile.accountPlaceholder')"></el-input>
          </el-form-item>
          <el-form-item :label="t('userProfile.password')" prop="password">
            <el-input
              v-model="loginForm.password"
              :show-password="true"
              :placeholder="t('userProfile.passwordPlaceholder')"
              suffix-icon="el-icon-view"
              @click-suffix="togglePasswordVisibility"
            ></el-input>
          </el-form-item>
          <div slot="footer" class="dialog-footer">
            <el-button type="primary" @click="submitLogin">{{ t('userProfile.loginBtn') }}</el-button>
          </div>
        </el-form>
      </el-tab-pane>

      <el-tab-pane :label="t('userProfile.registerTab')" name="Register">
        <el-form :model="registerForm" label-width="80px" ref="registerFormRef" :rules="registerRules">
          <el-form-item :label="t('userProfile.username')" prop="username">
            <el-input v-model="registerForm.username" :placeholder="t('userProfile.usernamePlaceholder')"></el-input>
          </el-form-item>
          <el-form-item :label="t('userProfile.phone')" prop="phone">
            <el-input v-model="registerForm.phone" :placeholder="t('userProfile.phonePlaceholder')"></el-input>
          </el-form-item>
          <el-form-item :label="t('userProfile.email')" prop="email">
            <el-input v-model="registerForm.email" :placeholder="t('userProfile.emailPlaceholder')"></el-input>
          </el-form-item>
          <el-form-item :label="t('userProfile.password')" prop="password">
            <el-input v-model="registerForm.password" type="password" :show-password="true" :placeholder="t('userProfile.passwordPlaceholder')"></el-input>
          </el-form-item>
          <div slot="footer" class="dialog-footer">
            <el-button type="primary" @click="submitRegister">{{ t('userProfile.registerBtn') }}</el-button>
          </div>
        </el-form>
      </el-tab-pane>
    </el-tabs>

    <div v-else>
      <div style="display: flex; align-items: center;">
        <el-tooltip :content="t('userProfile.changeAvatar')" placement="top" effect="dark">
          <el-avatar
            v-if="avatar"
            :src="avatar"
            :size="128"
            style="width: 128px; height: 128px; padding: 0; cursor: pointer; object-fit: cover;"
            @click="changeAvatar"
          >
            {{ avatar ? '' : user.username }}
          </el-avatar>
        </el-tooltip>

        <div style="margin-left: 40px;">
          <div style="height: 200px;">
            <el-form v-if="editing" :model="user" label-width="80px" ref="userFormRef" :rules="registerRules" style="height: 180px;">
              <h3>{{ t('userProfile.editProfileTitle') }}</h3>
              <el-form-item :label="t('userProfile.username')" prop="username">
                <el-input v-model="user.username" :placeholder="t('userProfile.usernamePlaceholder')"></el-input>
              </el-form-item>
              <el-form-item :label="t('userProfile.phone')" prop="phone">
                <el-input v-model="user.phone" :placeholder="t('userProfile.phonePlaceholder')"></el-input>
              </el-form-item>
              <el-form-item :label="t('userProfile.email')" prop="email">
                <el-input v-model="user.email" :placeholder="t('userProfile.emailPlaceholder')"></el-input>
              </el-form-item>
            </el-form>

            <el-form v-if="editingPwd" :model="editPwdForm" label-width="80px" ref="pwdFormRef" :rules="editPwdRules" style="height: 180px;">
              <h3>{{ t('userProfile.changePasswordTitle') }}</h3>
              <el-form-item :label="t('userProfile.oldPassword')" prop="oldPwd">
                <el-input v-model="editPwdForm.oldPwd" :placeholder="t('userProfile.oldPasswordPlaceholder')" type="password" :show-password="true"></el-input>
              </el-form-item>
              <el-form-item :label="t('userProfile.newPassword')" prop="newPwd">
                <el-input v-model="editPwdForm.newPwd" :placeholder="t('userProfile.newPasswordPlaceholder')" type="password" :show-password="true"></el-input>
              </el-form-item>
            </el-form>

            <div v-if="!editing && !editingPwd" style="height: 180px;">
              <el-tooltip :content="t('userProfile.username')" placement="left">
                <h3>{{ user.username }}</h3>
              </el-tooltip>
              <el-tooltip :content="t('userProfile.email')" placement="left">
                <p>{{ user.email }}</p>
              </el-tooltip>
              <el-tooltip :content="t('userProfile.phone')" placement="left">
                <p>{{ user.phone }}</p>
              </el-tooltip>
              <el-tooltip :content="t('userProfile.createdAt')" placement="left">
                <p>{{ new Date(user.createdAt).toLocaleDateString(locale, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) }}</p>
              </el-tooltip>
              <el-tooltip :content="t('userProfile.tokenBalance')" placement="left">
                <p>Token: {{ user.tokens }} $</p>
              </el-tooltip>
            </div>
          </div>

          <div>
            <el-tooltip v-if="!editing && !editingPwd" :content="t('userProfile.logout')" placement="bottom">
              <el-button @click="logout" type="danger" circle>
                <el-icon><SwitchButton /></el-icon>
              </el-button>
            </el-tooltip>

            <el-tooltip v-if="editing || editingPwd" :content="t('userProfile.cancel')" placement="bottom">
              <el-button type="primary" circle @click="cancelEdit">
                <el-icon><RefreshLeft /></el-icon>
              </el-button>
            </el-tooltip>

            <el-tooltip v-if="!editingPwd" :content="editing ? t('userProfile.saveEdit') : t('userProfile.editProfile')" placement="bottom">
              <el-button :type="editing ? 'success' : 'primary'" :icon="editing ? Check : Edit" circle @click="toggleEdit" />
            </el-tooltip>

            <el-tooltip v-if="!editing" :content="editingPwd ? t('userProfile.savePwd') : t('userProfile.changePwd')" placement="bottom">
              <el-button :type="editingPwd ? 'success' : 'primary'" :icon="editingPwd ? Check : Lock" circle @click="toggleEditPwd" />
            </el-tooltip>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ElButton, ElCard, ElTooltip, ElAvatar, ElDialog, ElForm, ElFormItem, ElInput, ElCheckbox } from 'element-plus'
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
      }
      else if (editPwdForm.value.newPwd === editPwdForm.value.oldPwd) {
        eventBus.emit('show-error', t('userProfile.messages.samePassword'))
        return
      }
      else {
        const result = await changePassword(user.value.id, editPwdForm.value.oldPwd, editPwdForm.value.newPwd)
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
      }
      else {
        const result = await updateUserInfo(user.value)
        if (result == 0) {
          editing.value = false
          eventBus.emit('show-success', t('userProfile.messages.modifySuccess'))
          user_backup = null
        }
      }
    }
    )

  }
  else {
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
    },
  ],
  password: [
    { required: true, message: t('userProfile.rules.passwordRequired'), trigger: 'blur' },
    {
      pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/,
      message: t('userProfile.rules.passwordPattern'),
      trigger: 'blur'
    },
  ],
}

const registerRules = {
  username: [
    { required: true, message: t('userProfile.rules.usernameRequired'), trigger: 'blur' },
    {
      pattern: /^[a-zA-Z0-9_-]{6,}$/,
      message: t('userProfile.rules.usernamePattern'),
      trigger: 'blur'
    },
  ],
  phone: [
    { required: true, message: t('userProfile.rules.phoneRequired'), trigger: 'blur' },
    {
      pattern: /^[1][3-9][0-9]{9}$/,
      message: t('userProfile.rules.phonePattern'),
      trigger: 'blur'
    },
  ],
  email: [
    { required: true, message: t('userProfile.rules.emailRequired'), trigger: 'blur' },
    {
      pattern: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
      message: t('userProfile.rules.emailPattern'),
      trigger: 'blur'
    },
  ],
  password: [
    { required: true, message: t('userProfile.rules.passwordRequired'), trigger: 'blur' },
    {
      pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/,
      message: t('userProfile.rules.passwordPattern'),
      trigger: 'blur'
    },
  ],
}

const editPwdRules = {
  oldPassword: [
    { required: true, message: t('userProfile.rules.passwordRequired'), trigger: 'blur' },
    {
      pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/,
      message: t('userProfile.rules.passwordPattern'),
      trigger: 'blur'
    },
  ],
  newPassword: [
    { required: true, message: t('userProfile.rules.newPasswordRequired'), trigger: 'blur' },
    {
      pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/,
      message: t('userProfile.rules.passwordPattern'),
      trigger: 'blur'
    },
  ],
}


const props = defineProps({
  position: {
    type: Object,
    required: true,
  },

})
// 用户登录信息
import { avatar, loggedIn } from '../utils/common-data.ts'
import { user } from '../utils/common-data.ts'
import { changeAvatar, changePassword, login, updateUserInfo, verifyToken } from '../utils/web-utils.ts'
import { el } from 'element-plus/es/locales.mjs'
import { Check, Edit, Lock, RefreshLeft, SwitchButton } from '@element-plus/icons-vue'
const menuStyles = computed(() => ({
  position: 'absolute',
  top: `${menuPosition.value.top}px`,
  left: `${menuPosition.value.left}px`,
  border: '1px solid #ccc',
  padding: '10px',
  boxShadow: '0px 2px 10px rgba(0, 0, 0, 0.2)',
  minWidth: '500px',
  maxWidth: '800px',
  zIndex: 1000, // 保证层级
  color: themeState.currentTheme.textColor2,
  backdropFilter: 'blur(5px)',
  background: themeState.currentTheme.background,
}));
const menuPosition = ref({ top: props.position.top, left: props.position.left });

// 登录状态
const emit = defineEmits(['close'])
function closeDialog() {
  emit("close", false);
}

// 登录表单数据
const loginForm = ref({
  username: '',
  password: '',

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

    login(loginForm.value);

  })


}
const isDragging = ref(false);
const dragStart = ref({ x: 0, y: 0 });
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
// 注册逻辑
async function submitRegister() {
  await registerFormRef.value.validate((valid) => {
    if (!valid) {
      eventBus.emit('show-error', t('userProfile.messages.registerIncomplete'))
      return
    }
    // 发送注册请求到后端
    axios.post(SERVER_URL + '/user/register', registerForm.value)
      .then(async response => {
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
      .catch(error => {
        eventBus.emit('show-error', t('userProfile.messages.registerFailed', { error: error.message }))
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