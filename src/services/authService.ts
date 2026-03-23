import { env } from '@/config/env'
import { apiClient } from '@/services/apiClient'

interface AuthResponse {
  data: {
    token: string
    user: { id: number; name: string; email: string }
  }
}

export const authService = {
  async login(email: string, password: string): Promise<AuthResponse['data']> {
    const response = await apiClient.post<AuthResponse>('/auth/login', {
      email,
      password,
      device_name: env.deviceName,
    })
    return response.data.data
  },

  async me() {
    const response = await apiClient.get<{ data: { id: number; name: string; email: string } }>('/auth/me')
    return response.data.data
  },

  async logout() {
    await apiClient.post('/auth/logout')
  },
}
