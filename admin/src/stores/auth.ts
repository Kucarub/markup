import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { clearToken, getToken, http, setToken } from '@/api/request'

const NAME_KEY = 'admin_name'

interface LoginResult {
  accessToken: string
  refreshToken: string
  expiresIn: string
  admin: { id: number; username: string; role: string }
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref(getToken())
  const name = ref(localStorage.getItem(NAME_KEY) ?? '')

  const isLoggedIn = computed(() => Boolean(token.value))

  async function login(payload: { username: string; password: string }) {
    const data = await http.post<LoginResult>('/api/admin/auth/login', payload)
    token.value = data.accessToken
    name.value = data.admin.username
    setToken(data.accessToken)
    localStorage.setItem(NAME_KEY, data.admin.username)
  }

  function logout() {
    token.value = ''
    name.value = ''
    clearToken()
    localStorage.removeItem(NAME_KEY)
  }

  return { token, name, isLoggedIn, login, logout }
})
