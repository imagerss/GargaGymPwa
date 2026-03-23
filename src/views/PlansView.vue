<script setup lang="ts">
import { ref } from 'vue'
import Card from 'primevue/card'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import Message from 'primevue/message'

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
    <Card>
      <template #title>Plany treningowe</template>
      <template #subtitle>Dodaj plan do kolejki offline (MVP)</template>
      <template #content>
        <div class="inline">
          <InputText v-model="planName" type="text" placeholder="Nazwa planu" fluid />
          <Button label="Dodaj offline" icon="pi pi-plus" @click="createOfflinePlan" severity="success" />
        </div>
        <Message severity="info" class="queue-info">
          Operacje oczekujace: <strong>{{ syncStore.pendingOperations }}</strong>
        </Message>
      </template>
    </Card>
    <div class="helper">
      <p>W kolejnych krokach dodamy liste planow i edycje/delete online+offline.</p>
    </div>
  </section>
</template>

<style scoped>
.inline {
  display: flex;
  gap: 0.6rem;
}

.queue-info {
  margin-top: 0.8rem;
}

.helper {
  margin-top: 0.75rem;
  color: #94a3b8;
}
</style>
