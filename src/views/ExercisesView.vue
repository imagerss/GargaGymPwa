<script setup lang="ts">
import { onMounted, ref } from 'vue'
import Card from 'primevue/card'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import { apiClient } from '@/services/apiClient'
import { gymService, type Exercise } from '@/services/gymService'
import { useSyncStore } from '@/stores/sync'

const syncStore = useSyncStore()
const exercises = ref<Exercise[]>([])
const loading = ref(false)
const isCreating = ref(false)
const deletingId = ref<number | null>(null)
const form = ref({ name: '', muscle_group: '' })
let tempId = -1

const loadExercises = async () => {
  loading.value = true
  try {
    exercises.value = await gymService.listExercises()
  } catch {
    // Keep local list while offline.
  } finally {
    loading.value = false
  }
}

const addExercise = async () => {
  if (!form.value.name.trim() || isCreating.value) return
  isCreating.value = true
  try {
    const tempExercise: Exercise = {
      id: tempId--,
      name: form.value.name,
      muscle_group: form.value.muscle_group || null,
    }
    exercises.value = [tempExercise, ...exercises.value]
    await gymService.upsertExerciseCache(tempExercise)

    if (navigator.onLine) {
      const response = await apiClient.post('/exercises', {
        name: form.value.name,
        muscle_group: form.value.muscle_group || null,
      })
      const created = (response.data?.data ?? response.data) as Exercise
      exercises.value = exercises.value.map((exercise) => (exercise.id === tempExercise.id ? created : exercise))
      await gymService.replaceCachedEntityId('exercises', tempExercise.id, created)
    } else {
      await syncStore.enqueueOperation({
        resource: 'exercises',
        action: 'create',
        local_entity_id: tempExercise.id,
        data: { name: form.value.name, muscle_group: form.value.muscle_group || null },
      })
    }
    form.value = { name: '', muscle_group: '' }
  } finally {
    isCreating.value = false
  }
}

onMounted(loadExercises)

const deleteExercise = async (id: number) => {
  if (deletingId.value) return
  deletingId.value = id
  const prev = exercises.value
  exercises.value = exercises.value.filter((exercise) => exercise.id !== id)
  try {
    await gymService.removeExerciseCache(id)
    if (id < 0) {
      await syncStore.discardLocalEntity('exercises', id)
      return
    }
    if (navigator.onLine && id > 0) {
      await apiClient.delete(`/exercises/${id}`)
    } else {
      await syncStore.enqueueOperation({ resource: 'exercises', action: 'delete', entity_id: id > 0 ? id : undefined })
    }
  } catch {
    exercises.value = prev
    const restored = prev.find((exercise) => exercise.id === id)
    if (restored) {
      await gymService.upsertExerciseCache(restored)
    }
  } finally {
    deletingId.value = null
  }
}
</script>

<template>
  <section class="max-w-6xl">
    <Card class="border border-slate-200 shadow-sm">
      <template #title>Cwiczenia</template>
      <template #subtitle>Dodaj i przegladaj cwiczenia</template>
      <template #content>
        <div class="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
          <InputText v-model="form.name" placeholder="Nazwa cwiczenia" fluid />
          <InputText v-model="form.muscle_group" placeholder="Partia miesniowa" fluid />
          <Button
            :label="isCreating ? 'Dodaje...' : 'Dodaj'"
            :loading="isCreating"
            :disabled="isCreating"
            icon="pi pi-plus"
            @click="addExercise"
            severity="success"
          />
        </div>
        <div class="mt-4">
          <p v-if="loading" class="text-slate-500">Ladowanie...</p>
          <ul v-else class="space-y-2">
            <li v-for="exercise in exercises" :key="exercise.id" class="rounded-lg border border-slate-200 bg-white p-3">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="font-medium">{{ exercise.name }}</p>
                  <p class="text-sm text-slate-500">{{ exercise.muscle_group || 'Brak partii' }}</p>
                </div>
                <Button
                  label="Usun"
                  size="small"
                  severity="danger"
                  :loading="deletingId === exercise.id"
                  :disabled="deletingId !== null"
                  @click="deleteExercise(exercise.id)"
                />
              </div>
            </li>
          </ul>
        </div>
      </template>
    </Card>
  </section>
</template>
