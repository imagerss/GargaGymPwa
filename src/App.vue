<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import Drawer from 'primevue/drawer'
import {
  Activity,
  ClipboardList,
  Dumbbell,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  ScanEye,
  UserCircle,
} from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useSyncStore } from '@/stores/sync'

const authStore = useAuthStore()
const syncStore = useSyncStore()
const router = useRouter()
const route = useRoute()
const mobileNavVisible = ref(false)
const isMobileNav = ref(false)
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

const stopPeriodicSync = () => {
  if (!periodicSyncTimer) return
  window.clearInterval(periodicSyncTimer)
  periodicSyncTimer = null
}

const startPeriodicSync = () => {
  if (periodicSyncTimer || !authStore.isAuthenticated) return
  periodicSyncTimer = window.setInterval(() => {
    if (authStore.isAuthenticated) {
      void syncStore.syncIfNeeded()
    }
  }, 60 * 1000)
}

const triggerSync = async () => {
  if (!authStore.isAuthenticated) return
  await syncStore.syncIfNeeded()
}

const goToPath = async (path: string) => {
  mobileNavVisible.value = false
  if (route.path === path) return
  await router.push(path)
}

const handleVisibilityOrFocus = async () => {
  if (!authStore.isAuthenticated) return
  if (document.visibilityState === 'visible') {
    await syncStore.syncIfNeeded()
  }
}

const logoutAndRedirect = async () => {
  await authStore.logout()
  await router.replace({ name: 'login' })
}

const syncViewportState = () => {
  isMobileNav.value = window.innerWidth < 1024
  if (!isMobileNav.value) {
    mobileNavVisible.value = false
  }
}

onMounted(async () => {
  syncViewportState()
  if (authStore.isAuthenticated) {
    await syncStore.syncIfNeeded()
    startPeriodicSync()
  }
  window.addEventListener('resize', syncViewportState)
  window.addEventListener('online', triggerSync)
  window.addEventListener('focus', handleVisibilityOrFocus)
  document.addEventListener('visibilitychange', handleVisibilityOrFocus)
})

watch(
  () => authStore.isAuthenticated,
  async (isAuthenticated) => {
    if (isAuthenticated) {
      startPeriodicSync()
      await syncStore.syncIfNeeded()
    } else {
      stopPeriodicSync()
    }
  },
)

watch(
  () => route.fullPath,
  () => {
    mobileNavVisible.value = false
  },
)

onUnmounted(() => {
  stopPeriodicSync()
  window.removeEventListener('resize', syncViewportState)
  window.removeEventListener('online', triggerSync)
  window.removeEventListener('focus', handleVisibilityOrFocus)
  document.removeEventListener('visibilitychange', handleVisibilityOrFocus)
})
</script>

<template>
  <div class="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.92),_rgba(241,245,249,0.95)_42%,_rgba(226,232,240,1))] px-3 py-3 text-slate-800 sm:px-4 sm:py-4">
    <header
      v-if="authStore.isAuthenticated"
      class="sticky top-3 z-40 mx-auto mb-4 max-w-6xl rounded-[1.75rem] border border-white/70 bg-white/90 p-3 shadow-[0_20px_45px_-30px_rgba(15,23,42,0.45)] backdrop-blur"
    >
      <div class="flex items-center justify-between gap-3">
        <div class="flex min-w-0 items-center gap-3">
          <img
            src="/gargagym-logo.png"
            alt=""
            class="h-11 w-11 rounded-2xl object-cover shadow-sm"
          />
          <div class="min-w-0">
            <p class="truncate text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Śledź swoj progres</p>
            <p class="truncate text-lg font-semibold text-slate-950">GargaGym</p>
          </div>
        </div>

        <div class="hidden items-center gap-2 lg:flex">
          <Button
            v-for="item in navItems"
            :key="item.path"
            :label="item.label"
            size="small"
            rounded
            :severity="route.path === item.path ? 'contrast' : 'secondary'"
            :variant="route.path === item.path ? undefined : 'text'"
            @click="goToPath(item.path)"
          >
            <template #icon>
              <component :is="item.icon" :size="16" />
            </template>
          </Button>
          <Button label="Wyloguj" size="small" rounded severity="danger" variant="outlined" @click="logoutAndRedirect">
            <template #icon>
              <LogOut :size="16" />
            </template>
          </Button>
        </div>

        <Button
          v-if="isMobileNav"
          rounded
          severity="contrast"
          variant="outlined"
          aria-label="Otworz menu"
          @click="mobileNavVisible = true"
        >
          <template #icon>
            <Menu :size="18" />
          </template>
        </Button>
      </div>
    </header>

    <Drawer
      v-if="authStore.isAuthenticated && isMobileNav"
      v-model:visible="mobileNavVisible"
      position="right"
      header="Menu"
      class="w-[min(22rem,90vw)]"
      :block-scroll="true"
    >
      <div class="flex h-full flex-col gap-3">
        <Button
          v-for="item in navItems"
          :key="item.path"
          :label="item.label"
          fluid
          rounded
          :severity="route.path === item.path ? 'contrast' : 'secondary'"
          :variant="route.path === item.path ? undefined : 'outlined'"
          class="justify-start"
          @click="goToPath(item.path)"
        >
          <template #icon>
            <component :is="item.icon" :size="16" />
          </template>
        </Button>

        <div class="mt-auto border-t border-slate-200 pt-3">
          <Button label="Wyloguj" fluid rounded severity="danger" variant="outlined" @click="logoutAndRedirect">
            <template #icon>
              <LogOut :size="16" />
            </template>
          </Button>
        </div>
      </div>
    </Drawer>

    <main class="mx-auto max-w-6xl">
      <RouterView />
    </main>
  </div>
</template>
