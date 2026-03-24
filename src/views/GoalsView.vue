<script setup lang="ts">
import { onMounted, ref } from 'vue'
import Card from 'primevue/card'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import AppLoadingState from '@/components/AppLoadingState.vue'
import { apiClient } from '@/services/apiClient'
import { gymService, type Goal } from '@/services/gymService'
import { useSyncStore } from '@/stores/sync'

const syncStore = useSyncStore()
const goals = ref<Goal[]>([])
const loading = ref(false)
const isCreating = ref(false)
const deletingId = ref<number | null>(null)
const form = ref({
  type: 'waga',
  title: '',
  target_value: '',
  current_value: '',
  unit: 'kg',
  start_date: new Date().toISOString().slice(0, 10),
  status: 'active',
})
let tempId = -1

const loadGoals = async () => {
  loading.value = true
  try {
    goals.value = await gymService.listGoals()
  } catch {
    // Keep local list while offline.
  } finally {
    loading.value = false
  }
}

const addGoal = async () => {
  if (!form.value.title.trim() || isCreating.value) return
  isCreating.value = true
  try {
    const payload = {
      type: form.value.type,
      title: form.value.title,
      target_value: Number(form.value.target_value),
      current_value: form.value.current_value ? Number(form.value.current_value) : null,
      unit: form.value.unit,
      start_date: form.value.start_date,
      status: form.value.status,
    }
    const tempGoal: Goal = {
      id: tempId--,
      title: payload.title,
      type: payload.type,
      target_value: payload.target_value,
      current_value: payload.current_value,
      unit: payload.unit,
      status: payload.status,
    }
    goals.value = [tempGoal, ...goals.value]
    await gymService.upsertGoalCache(tempGoal)

    if (navigator.onLine) {
      const response = await apiClient.post('/goals', payload)
      const created = (response.data?.data ?? response.data) as Goal
      goals.value = goals.value.map((goal) => (goal.id === tempGoal.id ? created : goal))
      await gymService.replaceCachedEntityId('goals', tempGoal.id, created)
    } else {
      await syncStore.enqueueOperation({
        resource: 'goals',
        action: 'create',
        local_entity_id: tempGoal.id,
        data: payload,
      })
    }
    form.value.title = ''
    form.value.target_value = ''
  } finally {
    isCreating.value = false
  }
}

onMounted(loadGoals)

const deleteGoal = async (id: number) => {
  if (deletingId.value) return
  deletingId.value = id
  const prev = goals.value
  goals.value = goals.value.filter((goal) => goal.id !== id)
  try {
    await gymService.removeGoalCache(id)
    if (id < 0) {
      await syncStore.discardLocalEntity('goals', id)
      return
    }
    if (navigator.onLine && id > 0) {
      await apiClient.delete(`/goals/${id}`)
    } else {
      await syncStore.enqueueOperation({ resource: 'goals', action: 'delete', entity_id: id > 0 ? id : undefined })
    }
  } catch {
    goals.value = prev
    const restored = prev.find((goal) => goal.id === id)
    if (restored) {
      await gymService.upsertGoalCache(restored)
    }
  } finally {
    deletingId.value = null
  }
}
</script>

<template>
  <section class="max-w-6xl px-1">
    <Card class="border border-slate-200 shadow-sm">
      <template #title>Cele</template>
      <template #subtitle>Ustaw i monitoruj cele treningowe</template>
      <template #content>
        <div class="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div class="grid gap-2 sm:grid-cols-2">
            <InputText v-model="form.title" placeholder="Tytul celu" size="small" fluid />
            <InputText v-model="form.target_value" placeholder="Wartosc docelowa" size="small" fluid />
          </div>
          <div class="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
            <InputText v-model="form.type" placeholder="Typ" size="small" fluid />
            <InputText v-model="form.unit" placeholder="Jednostka" size="small" fluid />
            <InputText v-model="form.start_date" type="date" size="small" fluid />
            <Button
              :label="isCreating ? 'Dodaje...' : 'Dodaj cel'"
              :loading="isCreating"
              :disabled="isCreating"
              icon="pi pi-plus"
              severity="contrast"
              size="small"
              class="w-full lg:w-auto"
              @click="addGoal"
            />
          </div>
        </div>
        <div class="mt-4">
          <AppLoadingState v-if="loading" />
          <ul v-else class="space-y-2">
            <li v-for="goal in goals" :key="goal.id" class="rounded-lg border border-slate-200 bg-white p-3">
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p class="font-medium">{{ goal.title }}</p>
                  <p class="text-sm text-slate-500">{{ goal.type }} | {{ goal.target_value }} {{ goal.unit }}</p>
                </div>
                <Button
                  label="Usun"
                  size="small"
                  severity="danger"
                  :loading="deletingId === goal.id"
                  :disabled="deletingId !== null"
                  class="w-full sm:w-auto"
                  @click="deleteGoal(goal.id)"
                />
              </div>
            </li>
          </ul>
        </div>
      </template>
    </Card>
  </section>
</template>
