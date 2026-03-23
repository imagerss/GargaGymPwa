import { env } from '@/config/env'
import { apiClient } from '@/services/apiClient'

interface AuthUser {
  id: number
  name: string
  email: string
}

interface AuthPayload {
  token: string
  user: AuthUser
}

const normalizeAuthPayload = (raw: unknown): AuthPayload => {
  const response = raw as {
    token?: string
    user?: AuthUser
    data?: { token?: string; user?: AuthUser }
  }

  const token = response.token ?? response.data?.token
  const user = response.user ?? response.data?.user

  if (!token || !user) {
    throw new Error('Niepoprawny format odpowiedzi auth.')
  }

  return { token, user }
}

const normalizeUser = (raw: unknown): AuthUser => {
  const response = raw as {
    user?: AuthUser
    data?: AuthUser | { user?: AuthUser }
  }

  const fromData = response.data && 'id' in (response.data as object) ? (response.data as AuthUser) : undefined
  const fromNestedData =
    response.data && 'user' in (response.data as object)
      ? (response.data as { user?: AuthUser }).user
      : undefined

  const user = response.user ?? fromData ?? fromNestedData
  if (!user) {
    throw new Error('Niepoprawny format odpowiedzi /auth/me.')
  }

  return user
}

export const authService = {
  async register(payload: {
    name: string
    email: string
    password: string
    password_confirmation: string
  }): Promise<AuthPayload> {
    const response = await apiClient.post('/auth/register', {
      ...payload,
      device_name: env.deviceName,
    })
    return normalizeAuthPayload(response.data)
  },

  async login(email: string, password: string): Promise<AuthPayload> {
    const response = await apiClient.post('/auth/login', {
      email,
      password,
      device_name: env.deviceName,
    })
    return normalizeAuthPayload(response.data)
  },

  async me() {
    const response = await apiClient.get('/auth/me')
    return normalizeUser(response.data)
  },

  async logout() {
    await apiClient.post('/auth/logout')
  },
}
