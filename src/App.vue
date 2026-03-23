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
  <div class="min-h-screen p-4 text-slate-800">
    <Toolbar v-if="authStore.isAuthenticated" class="rounded-2xl border border-slate-200 bg-white">
      <template #start>
        <div class="flex items-center gap-2 font-semibold">
          <Dumbbell :size="18" />
          <span>GargaGym</span>
        </div>
      </template>
      <template #center>
        <div class="flex flex-nowrap gap-2 overflow-x-auto pb-0.5">
          <Button
            v-for="item in navItems"
            :key="item.path"
            :label="item.label"
            size="small"
            :severity="route.path === item.path ? 'success' : 'secondary'"
            :variant="route.path === item.path ? undefined : 'text'"
            rounded
            @click="router.push(item.path)"
            class="shrink-0"
          >
            <template #icon>
              <component :is="item.icon" :size="16" />
            </template>
          </Button>
        </div>
      </template>
      <template #end>
        <div class="flex items-center gap-2.5">
          <Tag :severity="isOnline ? 'success' : 'warn'" rounded>
            <template #default>
              <span class="flex items-center gap-1.5">
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
    <p
      v-if="authStore.isAuthenticated && !isOnline"
      class="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-amber-800"
    >
      Brak internetu. Zmiany zostana zsynchronizowane po polaczeniu.
    </p>
    <main class="mx-auto max-w-6xl pt-4">
      <RouterView />
    </main>
  </div>
</template>
