<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Card from 'primevue/card'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import Select from 'primevue/select'
import InputNumber from 'primevue/inputnumber'
import Message from 'primevue/message'
import { isAxiosError } from 'axios'
import { apiClient } from '@/services/apiClient'
import { gymService, type WorkoutPlan } from '@/services/gymService'
import { trainingFlowService, type TrainingPlanConfig } from '@/services/trainingFlowService'

import { useSyncStore } from '@/stores/sync'

const syncStore = useSyncStore()
const plans = ref<WorkoutPlan[]>([])
const exercises = ref<{ id: number; name: string }[]>([])
const planName = ref('')
const isCreating = ref(false)
const deletingId = ref<number | null>(null)
const loading = ref(false)
const deleteError = ref('')
const configuringPlanId = ref<number | null>(null)
const configFormByPlan = ref<Record<number, { exerciseId: number | null; targetSets: number; targetReps: number }>>({})
const planConfigs = ref<TrainingPlanConfig[]>([])
let tempId = -1

const loadPlans = async () => {
  loading.value = true
  try {
    plans.value = await gymService.listWorkoutPlans()
    exercises.value = await gymService.listExercises()
    planConfigs.value = trainingFlowService.prunePlanConfigs(plans.value.map((plan) => plan.id))
    for (const plan of plans.value) {
      ensurePlanForm(plan.id)
    }
  } catch {
    // Keep local list while offline.
  } finally {
    loading.value = false
  }
}

const planConfigMap = computed(() => {
  const map = new Map<number, TrainingPlanConfig>()
  for (const config of planConfigs.value) {
    map.set(config.plan_id, config)
  }
  return map
})

const ensurePlanForm = (planId: number) => {
  if (!configFormByPlan.value[planId]) {
    configFormByPlan.value[planId] = {
      exerciseId: null,
      targetSets: 3,
      targetReps: 10,
    }
  }
}

const getPlanForm = (planId: number) => {
  ensurePlanForm(planId)
  return configFormByPlan.value[planId]!
}

const createPlan = async () => {
  if (!planName.value.trim() || isCreating.value) return

  isCreating.value = true
  try {
    const name = planName.value.trim()
    const tempPlan: WorkoutPlan = { id: tempId--, name, description: 'Plan z PWA', is_active: true }
    plans.value = [tempPlan, ...plans.value]

    if (navigator.onLine) {
      const response = await apiClient.post('/workout-plans', { name, description: 'Plan z PWA', is_active: true })
      const created = (response.data?.data ?? response.data) as WorkoutPlan
      plans.value = plans.value.map((plan) => (plan.id === tempPlan.id ? created : plan))
    } else {
      await syncStore.enqueueOperation({
        resource: 'workout_plans',
        action: 'create',
        data: { name, description: 'Offline draft', is_active: true },
      })
    }
    planName.value = ''
  } finally {
    isCreating.value = false
  }
}

onMounted(loadPlans)

const deletePlan = async (id: number) => {
  if (deletingId.value) return
  deleteError.value = ''
  deletingId.value = id
  const prev = plans.value
  const previousConfig = trainingFlowService.getPlanConfig(id)
  plans.value = plans.value.filter((plan) => plan.id !== id)
  trainingFlowService.removePlanConfig(id)
  planConfigs.value = trainingFlowService.listPlanConfigs()
  try {
    if (navigator.onLine && id > 0) {
      await apiClient.delete(`/workout-plans/${id}`)
    } else {
      await syncStore.enqueueOperation({ resource: 'workout_plans', action: 'delete', entity_id: id > 0 ? id : undefined })
    }
  } catch (error) {
    plans.value = prev
    if (previousConfig) {
      for (const item of previousConfig.exercises) {
        trainingFlowService.addExerciseToPlan(id, { id: item.exercise_id, name: item.exercise_name }, item.target_sets, item.target_reps)
      }
    }
    planConfigs.value = trainingFlowService.listPlanConfigs()
    if (isAxiosError(error) && error.response?.status === 403) {
      deleteError.value = 'Brak uprawnien do usuniecia tego planu (403).'
    } else {
      deleteError.value = 'Nie udalo sie usunac planu. Sprobuj ponownie.'
    }
  } finally {
    deletingId.value = null
  }
}

const addExerciseToPlan = (planId: number) => {
  ensurePlanForm(planId)
  const form = configFormByPlan.value[planId]
  if (!form) return
  const exerciseId = Number(form.exerciseId)
  const exercise = exercises.value.find((item) => item.id === exerciseId)
  const targetSets = Math.max(1, Number(form.targetSets || 0))
  const targetReps = Math.max(1, Number(form.targetReps || 0))
  if (!exercise || !targetSets || !targetReps) return

  trainingFlowService.addExerciseToPlan(planId, exercise, targetSets, targetReps)
  planConfigs.value = trainingFlowService.listPlanConfigs()
  form.exerciseId = null
  form.targetSets = 3
  form.targetReps = 10
}

const removeExerciseFromPlan = (planId: number, configId: string) => {
  trainingFlowService.removeExerciseFromPlan(planId, configId)
  planConfigs.value = trainingFlowService.listPlanConfigs()
}
</script>

<template>
  <section class="max-w-6xl">
    <Card class="border border-slate-200 shadow-sm">
      <template #title>Plany treningowe</template>
      <template #subtitle>Utworz plan i dodaj do niego cwiczenia z seria/powtorzeniami</template>
      <template #content>
        <div class="flex gap-2.5">
          <InputText v-model="planName" type="text" placeholder="Nazwa planu" fluid />
          <Button
            :label="isCreating ? 'Dodaje...' : 'Dodaj plan'"
            icon="pi pi-plus"
            :loading="isCreating"
            :disabled="isCreating"
            @click="createPlan"
            severity="success"
          />
        </div>
        <div class="mt-4">
          <Message v-if="deleteError" severity="error" class="mb-3">{{ deleteError }}</Message>
          <p v-if="loading" class="text-slate-500">Ladowanie...</p>
          <ul v-else class="space-y-2">
            <li v-for="plan in plans" :key="plan.id" class="rounded-lg border border-slate-200 bg-white p-3">
              <div class="grid gap-3">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="font-medium">{{ plan.name }}</p>
                    <p class="text-sm text-slate-500">{{ plan.description || 'Brak opisu' }}</p>
                  </div>
                  <div class="flex gap-2">
                    <Button
                      :label="configuringPlanId === plan.id ? 'Ukryj konfiguracje' : 'Konfiguruj plan'"
                      size="small"
                      severity="secondary"
                      @click="configuringPlanId = configuringPlanId === plan.id ? null : plan.id"
                    />
                    <Button
                      label="Usun"
                      size="small"
                      severity="danger"
                      :loading="deletingId === plan.id"
                      :disabled="deletingId !== null"
                      @click="deletePlan(plan.id)"
                    />
                  </div>
                </div>

                <div class="rounded-lg border border-dashed border-slate-300 p-3">
                  <p class="mb-2 text-sm font-medium">
                    Cwiczenia w planie: {{ planConfigMap.get(plan.id)?.exercises.length ?? 0 }}
                  </p>
                  <ul class="space-y-1.5 text-sm">
                    <li
                      v-for="item in planConfigMap.get(plan.id)?.exercises ?? []"
                      :key="item.id"
                      class="flex items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1.5"
                    >
                      <span>{{ item.exercise_name }} - {{ item.target_sets }}x{{ item.target_reps }}</span>
                      <Button
                        label="Usun"
                        size="small"
                        severity="danger"
                        variant="text"
                        @click="removeExerciseFromPlan(plan.id, item.id)"
                      />
                    </li>
                  </ul>
                </div>

                <div v-if="configuringPlanId === plan.id" class="grid gap-2 md:grid-cols-[1fr_8rem_8rem_auto]">
                  <Select
                    v-model="getPlanForm(plan.id).exerciseId"
                    :options="exercises"
                    option-label="name"
                    option-value="id"
                    placeholder="Wybierz cwiczenie"
                    fluid
                    @focus="ensurePlanForm(plan.id)"
                  />
                  <InputNumber
                    v-model="getPlanForm(plan.id).targetSets"
                    placeholder="Serie"
                    :min="1"
                    @focus="ensurePlanForm(plan.id)"
                  />
                  <InputNumber
                    v-model="getPlanForm(plan.id).targetReps"
                    placeholder="Powtorz."
                    :min="1"
                    @focus="ensurePlanForm(plan.id)"
                  />
                  <Button label="Dodaj cwiczenie" size="small" severity="success" @click="addExerciseToPlan(plan.id)" />
                </div>
              </div>
            </li>
          </ul>
        </div>
      </template>
    </Card>
  </section>
</template>
