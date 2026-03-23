const readRequired = (key: string, fallback = ''): string => {
  const value = import.meta.env[key]
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

export const env = {
  apiBaseUrl: readRequired('VITE_API_BASE_URL', 'http://localhost:8000/api'),
  deviceName: readRequired('VITE_DEVICE_NAME', 'pwa-web'),
  syncIntervalMs: Number(import.meta.env.VITE_SYNC_INTERVAL_MS ?? 45000),
}
