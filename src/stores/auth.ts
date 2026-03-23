import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { authService } from '@/services/authService'
import { secureStorage } from '@/services/secureStorage'
import { db } from '@/db/appDb'

interface AuthUser {
  id: number
  name: string
  email: string
}

const AUTH_USER_KEY = 'auth_user'
const CACHE_REFRESH_KEY = 'cache_last_refresh_at_ms'
const LAST_SYNC_KEY = 'last_sync_at'
const PLAN_CONFIGS_KEY = 'training_plan_configs_v1'
const SESSION_LOGS_KEY = 'training_session_logs_v1'

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

  const persistUser = async (value: AuthUser | null) => {
    if (!value) {
      await db.kv.delete(AUTH_USER_KEY)
      return
    }
    await db.kv.put({ key: AUTH_USER_KEY, value: JSON.stringify(value) })
  }

  const readPersistedUser = async (): Promise<AuthUser | null> => {
    const entry = await db.kv.get(AUTH_USER_KEY)
    if (!entry?.value) return null
    try {
      return JSON.parse(entry.value) as AuthUser
    } catch {
      return null
    }
  }

  const clearLocalUserData = async () => {
    await db.transaction('rw', db.entities, db.operations, db.kv, async () => {
      await db.entities.clear()
      await db.operations.clear()
      await db.kv.delete(CACHE_REFRESH_KEY)
      await db.kv.delete(LAST_SYNC_KEY)
    })
    window.localStorage.removeItem(PLAN_CONFIGS_KEY)
    window.localStorage.removeItem(SESSION_LOGS_KEY)
  }

  const clearDataIfUserChanged = async (nextUser: AuthUser) => {
    const previousUser = user.value ?? (await readPersistedUser())
    if (previousUser?.id && previousUser.id !== nextUser.id) {
      await clearLocalUserData()
    }
  }

  const login = async (email: string, password: string) => {
    loading.value = true
    try {
      const data = await authService.login(email, password)
      await clearDataIfUserChanged(data.user)
      tokenMemory.value = data.token
      await secureStorage.setToken(data.token)
      user.value = data.user
      await persistUser(data.user)
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
      await clearDataIfUserChanged(data.user)
      tokenMemory.value = data.token
      await secureStorage.setToken(data.token)
      user.value = data.user
      await persistUser(data.user)
    } finally {
      loading.value = false
    }
  }

  const restoreSession = async () => {
    const token = await getToken()
    if (!token) return
    const cachedUser = await readPersistedUser()
    if (cachedUser) {
      user.value = cachedUser
    }
    if (!navigator.onLine) return

    try {
      const freshUser = await authService.me()
      user.value = freshUser
      await persistUser(freshUser)
    } catch {
      // Keep local session when offline/temporary network issue.
      if (!cachedUser) {
        await logoutLocal()
      }
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
    await clearLocalUserData()
    tokenMemory.value = null
    user.value = null
    await secureStorage.clearToken()
    await persistUser(null)
  }

  return { user, loading, isAuthenticated, login, register, logout, getToken, restoreSession, logoutLocal }
})
