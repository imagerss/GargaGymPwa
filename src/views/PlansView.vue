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
  <section class="max-w-6xl">
    <Card class="border border-slate-200 shadow-sm">
      <template #title>Plany treningowe</template>
      <template #subtitle>Dodaj plan do kolejki offline (MVP)</template>
      <template #content>
        <div class="flex gap-2.5">
          <InputText v-model="planName" type="text" placeholder="Nazwa planu" fluid />
          <Button label="Dodaj offline" icon="pi pi-plus" @click="createOfflinePlan" severity="success" />
        </div>
        <Message severity="info" class="mt-3">
          Operacje oczekujace: <strong>{{ syncStore.pendingOperations }}</strong>
        </Message>
      </template>
    </Card>
    <div class="mt-3 text-slate-500">
      <p>W kolejnych krokach dodamy liste planow i edycje/delete online+offline.</p>
    </div>
  </section>
</template>
