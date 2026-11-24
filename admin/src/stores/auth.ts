import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { clearToken, getToken, http, setToken } from '@/api/request'

const NAME_KEY = 'admin_name'
const ROLE_KEY = 'admin_role'

export type AdminRole = 'super' | 'admin' | 'auditor'

interface LoginResult {
  accessToken: string
  refreshToken: string
  expiresIn: string
  admin: { id: number; username: string; role: AdminRole }
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref(getToken())
  const name = ref(localStorage.getItem(NAME_KEY) ?? '')
  const role = ref<AdminRole>((localStorage.getItem(ROLE_KEY) as AdminRole) || 'admin')

  const isLoggedIn = computed(() => Boolean(token.value))
  /** super / admin 可执行写操作；auditor 仅可查看 */
  const canManage = computed(() => role.value === 'super' || role.value === 'admin')
  const roleLabel = computed(() =>
    role.value === 'super' ? '超级管理员' : role.value === 'admin' ? '运营管理员' : '审核员',
  )

  async function login(payload: { username: string; password: string }) {
    const data = await http.post<LoginResult>('/api/admin/auth/login', payload)
    token.value = data.accessToken
    name.value = data.admin.username
    role.value = data.admin.role
    setToken(data.accessToken)
    localStorage.setItem(NAME_KEY, data.admin.username)
    localStorage.setItem(ROLE_KEY, data.admin.role)
  }

  function logout() {
    token.value = ''
    name.value = ''
    clearToken()
    localStorage.removeItem(NAME_KEY)
    localStorage.removeItem(ROLE_KEY)
  }

  return { token, name, role, roleLabel, isLoggedIn, canManage, login, logout }
})
