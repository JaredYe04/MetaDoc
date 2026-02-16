import { ref } from 'vue'

export const loggedIn = ref(false)
export const user = ref<Record<string, any>>({})
export const avatar = ref('')

export const firstLoad = ref(true)

export function resetUserState(): void {
  loggedIn.value = false
  user.value = {}
  avatar.value = ''
}
