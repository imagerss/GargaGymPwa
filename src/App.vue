<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import Toolbar from 'primevue/toolbar'
import Button from 'primevue/button'
import {
  Activity,
  ClipboardList,
  Dumbbell,
  LayoutDashboard,
  ListChecks,
  LogOut,
  ScanEye,
  UserCircle,
} from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useSyncStore } from '@/stores/sync'

const authStore = useAuthStore()
const syncStore = useSyncStore()
const router = useRouter()
const route = useRoute()
let periodicSyncTimer: number | null = null

const navItems = computed(() => [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { label: 'Plany', path: '/plans', icon: ClipboardList },
  { label: 'Sesje', path: '/sessions', icon: ListChecks },
  { label: 'Cwiczenia', path: '/exercises', icon: Dumbbell },
  { label: 'Pomiary', path: '/measurements', icon: Activity },
  { label: 'Zdjecia', path: '/photos', icon: ScanEye },
  { label: 'Profil', path: '/profile', icon: UserCircle },
])

const triggerSync = async () => {
  await syncStore.syncIfNeeded()
}

const handleVisibilityOrFocus = async () => {
  if (document.visibilityState === 'visible') {
    await syncStore.syncIfNeeded()
  }
}

const logoutAndRedirect = async () => {
  await authStore.logout()
  await router.replace({ name: 'login' })
}

onMounted(async () => {
  await syncStore.syncIfNeeded()
  periodicSyncTimer = window.setInterval(() => {
    void syncStore.syncIfNeeded()
  }, 60 * 1000)
  window.addEventListener('online', triggerSync)
  window.addEventListener('focus', handleVisibilityOrFocus)
  document.addEventListener('visibilitychange', handleVisibilityOrFocus)
})

onUnmounted(() => {
  if (periodicSyncTimer) {
    window.clearInterval(periodicSyncTimer)
    periodicSyncTimer = null
  }
  window.removeEventListener('online', triggerSync)
  window.removeEventListener('focus', handleVisibilityOrFocus)
  document.removeEventListener('visibilitychange', handleVisibilityOrFocus)
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
          <Button label="Wyloguj" size="small" severity="secondary" rounded @click="logoutAndRedirect">
            <template #icon>
              <LogOut :size="16" />
            </template>
          </Button>
        </div>
      </template>
    </Toolbar>
    <main class="mx-auto max-w-6xl pt-4">
      <RouterView />
    </main>
  </div>
</template>
