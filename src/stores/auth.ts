import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { authService } from '@/services/authService'
import { secureStorage } from '@/services/secureStorage'
import { db } from '@/db/appDb'
import { useSyncStore } from '@/stores/sync'

interface AuthUser {
  id: number
  name: string
  email: string
}

const AUTH_USER_KEY = 'auth_user'
const LAST_AUTH_USER_ID_KEY = 'last_auth_user_id'
const CACHE_REFRESH_KEY = 'cache_last_refresh_at_ms'
const LAST_SYNC_KEY = 'last_sync_at'
const PLAN_CONFIGS_KEY = 'training_plan_configs_v1'
const SESSION_LOGS_KEY = 'training_session_logs_v1'
const DIRTY_PLAN_CONFIGS_KEY = 'training_plan_configs_dirty_v1'

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

  const setLastAuthUserId = async (userId: number) => {
    await db.kv.put({ key: LAST_AUTH_USER_ID_KEY, value: String(userId) })
  }

  const readLastAuthUserId = async (): Promise<number | null> => {
    const entry = await db.kv.get(LAST_AUTH_USER_ID_KEY)
    const parsed = Number(entry?.value ?? '')
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
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
    window.localStorage.removeItem(DIRTY_PLAN_CONFIGS_KEY)
  }

  const clearDataIfUserChanged = async (nextUser: AuthUser) => {
    const inMemoryOrPersisted = user.value?.id ?? (await readPersistedUser())?.id ?? null
    const previousUserId = inMemoryOrPersisted ?? (await readLastAuthUserId())
    if (previousUserId && previousUserId !== nextUser.id) {
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
      await setLastAuthUserId(data.user.id)
      if (navigator.onLine) {
        const syncStore = useSyncStore()
        await syncStore.syncNow()
      }
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
      await setLastAuthUserId(data.user.id)
      if (navigator.onLine) {
        const syncStore = useSyncStore()
        await syncStore.syncNow()
      }
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
      await setLastAuthUserId(freshUser.id)
      if (navigator.onLine) {
        const syncStore = useSyncStore()
        await syncStore.syncNow()
      }
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
