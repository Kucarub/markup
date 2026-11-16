import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { clearToken, getToken, http, setToken } from '@/api/request'

const NAME_KEY = 'admin_name'

interface LoginResult {
  token: string
  name: string
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref(getToken())
  const name = ref(localStorage.getItem(NAME_KEY) ?? '')

  const isLoggedIn = computed(() => Boolean(token.value))

  async function login(payload: { username: string; password: string }) {
    const data = await http.post<LoginResult>('/admin/auth/login', payload)
    token.value = data.token
    name.value = data.name
    setToken(data.token)
    localStorage.setItem(NAME_KEY, data.name)
  }

  function logout() {
    token.value = ''
    name.value = ''
    clearToken()
    localStorage.removeItem(NAME_KEY)
  }

  return { token, name, isLoggedIn, login, logout }
})
