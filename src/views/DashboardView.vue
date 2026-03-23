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
  <section class="page dashboard">
    <div class="hero">
      <h1>Czesc, {{ authStore.user?.name }}</h1>
      <p>Twoj panel synchronizacji i podsumowanie danych treningowych.</p>
    </div>
    <div class="info-grid">
      <Card>
        <template #content>
          <div class="metric">
            <span>Status sieci</span>
            <Tag :value="syncStatus" :severity="isOnline ? 'success' : 'warn'" />
          </div>
        </template>
      </Card>
      <Card>
        <template #content>
          <div class="metric">
            <span>Oczekujace zmiany</span>
            <strong>{{ syncStore.pendingOperations }}</strong>
          </div>
        </template>
      </Card>
      <Card>
        <template #content>
          <div class="metric">
            <span>Ostatnia synchronizacja</span>
            <small>{{ syncStore.lastSyncAt ?? 'Brak' }}</small>
          </div>
        </template>
      </Card>
    </div>
    <div class="actions">
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

<style scoped>
.dashboard {
  max-width: 70rem;
}

.hero {
  margin-bottom: 1rem;
}

.hero h1 {
  margin: 0;
  font-size: clamp(1.4rem, 2vw, 2rem);
}

.hero p {
  margin: 0.45rem 0 0;
  color: #94a3b8;
}

.info-grid {
  display: grid;
  gap: 0.8rem;
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
}

.metric {
  display: grid;
  gap: 0.5rem;
}

.metric span {
  color: #94a3b8;
}

.metric strong {
  font-size: 1.5rem;
}

.metric small {
  font-size: 0.85rem;
}

.actions {
  margin-top: 1rem;
  display: flex;
  gap: 0.65rem;
  flex-wrap: wrap;
}
</style>
