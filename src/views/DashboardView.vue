<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useSyncStore } from '@/stores/sync'

const authStore = useAuthStore()
const syncStore = useSyncStore()
const isOnline = ref(window.navigator.onLine)
const updateOnlineState = () => {
  isOnline.value = window.navigator.onLine
}

const syncStatus = computed(() => {
  if (!isOnline.value) return 'Offline'
  if (syncStore.isSyncing) return 'Synchronizacja...'
  return 'Online'
})

onMounted(async () => {
  window.addEventListener('online', updateOnlineState)
  window.addEventListener('offline', updateOnlineState)
  await syncStore.loadState()
})

onUnmounted(() => {
  window.removeEventListener('online', updateOnlineState)
  window.removeEventListener('offline', updateOnlineState)
})
</script>

<template>
  <section class="page">
    <h1>Dashboard</h1>
    <p>Witaj, {{ authStore.user?.name }}</p>
    <div class="info-grid">
      <article class="info-card">
        <h2>Status</h2>
        <p>{{ syncStatus }}</p>
      </article>
      <article class="info-card">
        <h2>Operacje w kolejce</h2>
        <p>{{ syncStore.pendingOperations }}</p>
      </article>
      <article class="info-card">
        <h2>Ostatnia synchronizacja</h2>
        <p>{{ syncStore.lastSyncAt ?? 'Brak' }}</p>
      </article>
    </div>
    <button @click="syncStore.syncNow" :disabled="syncStore.isSyncing || !isOnline">
      Synchronizuj teraz
    </button>
  </section>
</template>
