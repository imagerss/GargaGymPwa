<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import Toolbar from 'primevue/toolbar'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import { Activity, ClipboardList, Dumbbell, LayoutDashboard, LogOut, Wifi, WifiOff } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useSyncStore } from '@/stores/sync'
import { env } from '@/config/env'

const authStore = useAuthStore()
const syncStore = useSyncStore()
const router = useRouter()
const route = useRoute()

let intervalId: number | null = null
const isOnline = ref(window.navigator.onLine)
const navItems = computed(() => [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { label: 'Plany', path: '/plans', icon: ClipboardList },
  { label: 'Progres', path: '/progress', icon: Activity },
])

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
    <Toolbar v-if="authStore.isAuthenticated" class="topbar">
      <template #start>
        <div class="brand">
          <Dumbbell :size="18" />
          <span>GargaGym</span>
        </div>
      </template>
      <template #center>
        <div class="nav-actions">
          <Button
            v-for="item in navItems"
            :key="item.path"
            :label="item.label"
            size="small"
            :severity="route.path === item.path ? 'success' : 'secondary'"
            :variant="route.path === item.path ? undefined : 'text'"
            rounded
            @click="router.push(item.path)"
          >
            <template #icon>
              <component :is="item.icon" :size="16" />
            </template>
          </Button>
        </div>
      </template>
      <template #end>
        <div class="topbar-right">
          <Tag :severity="isOnline ? 'success' : 'warn'" rounded>
            <template #default>
              <span class="status-chip">
                <Wifi v-if="isOnline" :size="14" />
                <WifiOff v-else :size="14" />
                {{ isOnline ? 'Online' : 'Offline' }}
              </span>
            </template>
          </Tag>
          <Button label="Wyloguj" size="small" severity="secondary" rounded @click="authStore.logout">
            <template #icon>
              <LogOut :size="16" />
            </template>
          </Button>
        </div>
      </template>
    </Toolbar>
    <p v-if="authStore.isAuthenticated && !isOnline" class="offline-banner">
      Brak internetu. Zmiany zostana zsynchronizowane po polaczeniu.
    </p>
    <main class="content">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  padding: 1rem;
  color: #1e293b;
}

.topbar {
  border-radius: 1rem;
  border: 1px solid #dbe3ef;
  background: #ffffff;
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 700;
}

.nav-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: nowrap;
  overflow-x: auto;
  padding-bottom: 0.1rem;
}

.nav-actions :deep(.p-button) {
  flex: 0 0 auto;
}

.nav-actions :deep(.p-button-label) {
  white-space: nowrap;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.offline-banner {
  margin: 0.7rem 0 0;
  padding: 0.65rem 0.9rem;
  border-radius: 0.75rem;
  background: #fffbeb;
  border: 1px solid #fde68a;
  color: #92400e;
}

.status-chip {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.content {
  padding: 1rem 0 0;
  max-width: 72rem;
  margin: 0 auto;
}
</style>
