<script setup lang="ts">
import { ref } from 'vue'

import { syncService } from '@/services/syncService'
import type { ResourceName } from '@/db/appDb'
import { useSyncStore } from '@/stores/sync'

const syncStore = useSyncStore()
const planName = ref('')

const createOfflinePlan = async () => {
  if (!planName.value.trim()) return
  await syncService.queueOperation({
    resource: 'workout_plans' as ResourceName,
    action: 'create',
    data: { name: planName.value, description: 'Offline draft', is_active: true },
  })
  planName.value = ''
  await syncStore.loadState()
}
</script>

<template>
  <section class="page">
    <h1>Plany treningowe</h1>
    <p>Ten ekran pokazuje MVP kolejki offline dla create/update/delete.</p>
    <div class="inline">
      <input v-model="planName" type="text" placeholder="Nazwa planu" />
      <button @click="createOfflinePlan">Dodaj offline</button>
    </div>
    <p>Operacje oczekujace: {{ syncStore.pendingOperations }}</p>
  </section>
</template>
