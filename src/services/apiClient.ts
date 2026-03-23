import axios from 'axios'

import { env } from '@/config/env'
import { useAuthStore } from '@/stores/auth'

export const apiClient = axios.create({
  baseURL: env.apiBaseUrl,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
})

apiClient.interceptors.request.use(async (config) => {
  const authStore = useAuthStore()
  const token = await authStore.getToken()

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error?.response?.status === 401) {
      const authStore = useAuthStore()
      await authStore.logoutLocal()
    }

    return Promise.reject(error)
  },
)
