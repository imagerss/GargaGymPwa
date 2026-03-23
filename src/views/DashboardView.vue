<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import Card from 'primevue/card'
import Tag from 'primevue/tag'
import Button from 'primevue/button'
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
  <section class="max-w-6xl">
    <div class="mb-4">
      <h1 class="m-0 text-[clamp(1.4rem,2vw,2rem)] font-semibold">Czesc, {{ authStore.user?.name }}</h1>
      <p class="mt-2 text-slate-500">Twoj panel synchronizacji i podsumowanie danych treningowych.</p>
    </div>
    <div class="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(14rem,1fr))]">
      <Card class="border border-slate-200 shadow-sm">
        <template #content>
          <div class="grid gap-2">
            <span class="text-slate-500">Status sieci</span>
            <Tag :value="syncStatus" :severity="isOnline ? 'success' : 'warn'" />
          </div>
        </template>
      </Card>
      <Card class="border border-slate-200 shadow-sm">
        <template #content>
          <div class="grid gap-2">
            <span class="text-slate-500">Oczekujace zmiany</span>
            <strong class="text-2xl">{{ syncStore.pendingOperations }}</strong>
          </div>
        </template>
      </Card>
      <Card class="border border-slate-200 shadow-sm">
        <template #content>
          <div class="grid gap-2">
            <span class="text-slate-500">Ostatnia synchronizacja</span>
            <small class="text-sm">{{ syncStore.lastSyncAt ?? 'Brak' }}</small>
          </div>
        </template>
      </Card>
    </div>
    <div class="mt-4 flex flex-wrap gap-2.5">
      <Button
        label="Synchronizuj teraz"
        icon="pi pi-sync"
        iconPos="right"
        @click="syncStore.syncNow"
        :loading="syncStore.isSyncing"
        :disabled="!isOnline"
        severity="success"
      />
      <Button label="Auto-sync co 45s" icon="pi pi-cloud-upload" variant="outlined" severity="secondary" disabled />
      <Button label="MVP dashboard" icon="pi pi-clock" variant="text" severity="secondary" disabled />
    </div>
  </section>
</template>
