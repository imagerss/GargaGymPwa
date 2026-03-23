import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { authService } from '@/services/authService'
import { secureStorage } from '@/services/secureStorage'

interface AuthUser {
  id: number
  name: string
  email: string
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null)
  const tokenMemory = ref<string | null>(null)
  const loading = ref(false)
  const isAuthenticated = computed(() => Boolean(user.value))

  const getToken = async (): Promise<string | null> => {
    if (tokenMemory.value) return tokenMemory.value
    tokenMemory.value = await secureStorage.getToken()
    return tokenMemory.value
  }

  const login = async (email: string, password: string) => {
    loading.value = true
    try {
      const data = await authService.login(email, password)
      tokenMemory.value = data.token
      await secureStorage.setToken(data.token)
      user.value = data.user ?? (await authService.me())
    } finally {
      loading.value = false
    }
  }

  const register = async (payload: {
    name: string
    email: string
    password: string
    password_confirmation: string
  }) => {
    loading.value = true
    try {
      const data = await authService.register(payload)
      tokenMemory.value = data.token
      await secureStorage.setToken(data.token)
      user.value = data.user ?? (await authService.me())
    } finally {
      loading.value = false
    }
  }

  const restoreSession = async () => {
    const token = await getToken()
    if (!token) return
    try {
      user.value = await authService.me()
    } catch {
      await logoutLocal()
    }
  }

  const logout = async () => {
    try {
      await authService.logout()
    } finally {
      await logoutLocal()
    }
  }

  const logoutLocal = async () => {
    tokenMemory.value = null
    user.value = null
    await secureStorage.clearToken()
  }

  return { user, loading, isAuthenticated, login, register, logout, getToken, restoreSession, logoutLocal }
})
