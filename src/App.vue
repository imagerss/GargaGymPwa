<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useSyncStore } from '@/stores/sync'
import { env } from '@/config/env'

const authStore = useAuthStore()
const syncStore = useSyncStore()

let intervalId: number | null = null
const isOnline = ref(window.navigator.onLine)

const triggerSync = async () => {
  await syncStore.syncNow()
}

const updateOnlineState = () => {
  isOnline.value = window.navigator.onLine
}

onMounted(async () => {
  await syncStore.loadState()
  updateOnlineState()
  window.addEventListener('online', triggerSync)
  window.addEventListener('online', updateOnlineState)
  window.addEventListener('offline', updateOnlineState)
  intervalId = window.setInterval(triggerSync, env.syncIntervalMs)
})

onUnmounted(() => {
  window.removeEventListener('online', triggerSync)
  window.removeEventListener('online', updateOnlineState)
  window.removeEventListener('offline', updateOnlineState)
  if (intervalId) window.clearInterval(intervalId)
})
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <h1>GargaGym PWA</h1>
      <nav>
        <RouterLink to="/">Dashboard</RouterLink>
        <RouterLink to="/plans">Plany</RouterLink>
        <RouterLink to="/progress">Progres</RouterLink>
        <button v-if="authStore.isAuthenticated" @click="authStore.logout">Wyloguj</button>
      </nav>
    </header>
    <p v-if="!isOnline" class="offline-banner">Brak internetu. Zmiany zostana zsynchronizowane po polaczeniu.</p>
    <main>
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  background: #0f172a;
  color: #e2e8f0;
  font-family: Inter, system-ui, sans-serif;
}

.app-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #334155;
}

nav {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

nav a {
  color: #22c55e;
}

main {
  padding: 1.25rem;
}

.page {
  max-width: 860px;
}

.offline-banner {
  margin: 0;
  padding: 0.6rem 1rem;
  background: #7c2d12;
  color: #ffedd5;
}

.container {
  min-height: calc(100vh - 120px);
  display: grid;
  place-items: center;
}

.card {
  width: min(420px, 90vw);
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 0.75rem;
  padding: 1rem;
}

.form {
  display: grid;
  gap: 0.65rem;
}

.form input,
button {
  border-radius: 0.5rem;
  border: 1px solid #334155;
  padding: 0.65rem 0.8rem;
}

button {
  background: #22c55e;
  color: #052e16;
  font-weight: 700;
}

.error {
  color: #fca5a5;
}

.info-grid {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  margin-bottom: 0.9rem;
}

.info-card {
  border: 1px solid #334155;
  border-radius: 0.5rem;
  padding: 0.75rem;
  background: #1e293b;
}

.inline {
  display: flex;
  gap: 0.5rem;
}
</style>
