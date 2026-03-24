<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Card from 'primevue/card'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import Select from 'primevue/select'
import InputNumber from 'primevue/inputnumber'
import Message from 'primevue/message'
import AppLoadingState from '@/components/AppLoadingState.vue'
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
const savingPlanId = ref<number | null>(null)
const deleteError = ref('')
const configError = ref('')
const configuringPlanId = ref<number | null>(null)
const configFormByPlan = ref<Record<number, { exerciseId: number | null; targetSets: number; targetReps: number }>>({})
const planConfigs = ref<TrainingPlanConfig[]>([])
let tempId = -1

const loadPlans = async () => {
  loading.value = true
  try {
    plans.value = await gymService.listWorkoutPlans()
    exercises.value = await gymService.listExercises()
    const exerciseNameById = exercises.value.reduce<Record<number, string>>((acc, exercise) => {
      acc[exercise.id] = exercise.name
      return acc
    }, {})
    const dirtyPlanIds = new Set(trainingFlowService.listDirtyPlanConfigIds())
    planConfigs.value = trainingFlowService.replacePlanConfigs(
      plans.value.map((plan) => {
        const localDirtyConfig = dirtyPlanIds.has(plan.id) ? trainingFlowService.getPlanConfig(plan.id) : null
        if (localDirtyConfig) {
          return localDirtyConfig
        }
        const day = (plan.workout_days ?? []).slice().sort((a, b) => a.day_order - b.day_order)[0]
        const dayExercises = (day?.workout_day_exercises ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)
        return {
          plan_id: plan.id,
          updated_at: new Date().toISOString(),
          exercises: dayExercises.map((item) => ({
            id: String(item.id),
            exercise_id: item.exercise_id,
            exercise_name: exerciseNameById[item.exercise_id] ?? `Cwiczenie #${item.exercise_id}`,
            target_sets: item.target_sets ?? 3,
            target_reps: item.target_reps_max ?? item.target_reps_min ?? 10,
            workout_day_id: day?.id,
            workout_day_exercise_id: item.id,
          })),
        }
      }),
    )
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

const refreshPlanCacheFromServer = async (planId: number) => {
  const response = await apiClient.get(`/workout-plans/${planId}`)
  const plan = (response.data?.data ?? response.data) as WorkoutPlan
  await gymService.upsertWorkoutPlanCache(plan)
}

const createPlan = async () => {
  if (!planName.value.trim() || isCreating.value) return

  isCreating.value = true
  try {
    const name = planName.value.trim()
    const tempPlan: WorkoutPlan = { id: tempId--, name, description: 'Plan z PWA', is_active: true }
    plans.value = [tempPlan, ...plans.value]
    await gymService.upsertWorkoutPlanCache(tempPlan)

    if (navigator.onLine) {
      const response = await apiClient.post('/workout-plans', { name, description: 'Plan z PWA', is_active: true })
      const created = (response.data?.data ?? response.data) as WorkoutPlan
      plans.value = plans.value.map((plan) => (plan.id === tempPlan.id ? created : plan))
      await gymService.replaceCachedEntityId('workout_plans', tempPlan.id, created)
      trainingFlowService.migratePlanConfig(tempPlan.id, created.id)
    } else {
      await syncStore.enqueueOperation({
        resource: 'workout_plans',
        action: 'create',
        local_entity_id: tempPlan.id,
        data: { name, description: 'Offline draft', is_active: true },
      })
    }
    planConfigs.value = trainingFlowService.listPlanConfigs()
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
    await gymService.removeWorkoutPlanCache(id)
    if (id < 0) {
      await syncStore.discardLocalEntity('workout_plans', id)
      return
    }
    if (navigator.onLine && id > 0) {
      await apiClient.delete(`/workout-plans/${id}`)
    } else {
      await syncStore.enqueueOperation({ resource: 'workout_plans', action: 'delete', entity_id: id > 0 ? id : undefined })
    }
  } catch (error) {
    plans.value = prev
    const restored = prev.find((plan) => plan.id === id)
    if (restored) {
      await gymService.upsertWorkoutPlanCache(restored)
    }
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

const addExerciseToPlan = async (planId: number) => {
  ensurePlanForm(planId)
  const form = configFormByPlan.value[planId]
  if (!form || savingPlanId.value) return
  configError.value = ''
  const exerciseId = Number(form.exerciseId)
  const exercise = exercises.value.find((item) => item.id === exerciseId)
  const targetSets = Math.max(1, Number(form.targetSets || 0))
  const targetReps = Math.max(1, Number(form.targetReps || 0))
  if (!exercise || !targetSets || !targetReps) return

  if (!navigator.onLine || planId < 0) {
    trainingFlowService.addExerciseToPlan(planId, exercise, targetSets, targetReps)
    trainingFlowService.markPlanConfigDirty(planId)
    planConfigs.value = trainingFlowService.listPlanConfigs()
    form.exerciseId = null
    form.targetSets = 3
    form.targetReps = 10
    return
  }

  savingPlanId.value = planId
  try {
    const selectedPlan = plans.value.find((plan) => plan.id === planId)
    const planConfig = planConfigMap.value.get(planId)
    let workoutDayId =
      planConfig?.exercises.find((item) => item.workout_day_id)?.workout_day_id ??
      selectedPlan?.workout_days?.slice().sort((a, b) => a.day_order - b.day_order)[0]?.id
    if (!workoutDayId) {
      try {
        const dayResponse = await apiClient.post(`/workout-plans/${planId}/days`, {
          name: 'Dzien 1',
          day_order: 1,
        })
        workoutDayId = (dayResponse.data?.data ?? dayResponse.data)?.id
      } catch {
        // Plan may already have day_order=1 created in another tab/request.
        await loadPlans()
        workoutDayId = plans.value
          .find((plan) => plan.id === planId)
          ?.workout_days?.slice()
          .sort((a, b) => a.day_order - b.day_order)[0]?.id
      }
    }
    if (!workoutDayId) return

    const sortOrder = planConfig?.exercises.length ?? 0
    await apiClient.post(`/workout-days/${workoutDayId}/exercises`, {
      exercise_id: exercise.id,
      target_sets: targetSets,
      target_reps_min: targetReps,
      target_reps_max: targetReps,
      sort_order: sortOrder,
    })
    await refreshPlanCacheFromServer(planId)
    await loadPlans()
    form.exerciseId = null
    form.targetSets = 3
    form.targetReps = 10
  } catch {
    configError.value = 'Nie udalo sie dodac cwiczenia do planu. Sprobuj ponownie.'
  } finally {
    savingPlanId.value = null
  }
}

const removeExerciseFromPlan = async (planId: number, configId: string) => {
  if (savingPlanId.value) return

  if (!navigator.onLine || planId < 0) {
    trainingFlowService.removeExerciseFromPlan(planId, configId)
    trainingFlowService.markPlanConfigDirty(planId)
    planConfigs.value = trainingFlowService.listPlanConfigs()
    return
  }

  const item = planConfigMap.value.get(planId)?.exercises.find((entry) => entry.id === configId)
  if (!item?.workout_day_exercise_id) return
  savingPlanId.value = planId
  try {
    await apiClient.delete(`/workout-day-exercises/${item.workout_day_exercise_id}`)
    await refreshPlanCacheFromServer(planId)
    await loadPlans()
  } finally {
    savingPlanId.value = null
  }
}
</script>

<template>
  <section class="max-w-6xl px-1">
    <Card class="border border-slate-200 shadow-sm">
      <template #title>Plany treningowe</template>
      <template #subtitle>Utworz plan i dodaj do niego cwiczenia z seria/powtorzeniami</template>
      <template #content>
        <div class="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
            <InputText v-model="planName" type="text" placeholder="Nazwa planu" size="small" class="w-full sm:max-w-sm" />
            <Button
              :label="isCreating ? 'Dodaje...' : 'Dodaj plan'"
              icon="pi pi-plus"
              :loading="isCreating"
              :disabled="isCreating"
              @click="createPlan"
              severity="contrast"
              size="small"
              class="w-full sm:w-auto"
            />
          </div>
        </div>
        <div class="mt-4">
          <Message v-if="deleteError" severity="error" class="mb-3">{{ deleteError }}</Message>
          <Message v-if="configError" severity="error" class="mb-3">{{ configError }}</Message>
          <AppLoadingState v-if="loading" />
          <ul v-else class="space-y-2">
            <li v-for="plan in plans" :key="plan.id" class="rounded-lg border border-slate-200 bg-white p-3">
              <div class="grid gap-3">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p class="font-medium">{{ plan.name }}</p>
                    <p class="text-sm text-slate-500">{{ plan.description || 'Brak opisu' }}</p>
                  </div>
                  <div class="grid gap-2 sm:flex">
                    <Button
                      :label="configuringPlanId === plan.id ? 'Ukryj konfiguracje' : 'Konfiguruj plan'"
                      size="small"
                      severity="secondary"
                      class="w-full sm:w-auto"
                      @click="configuringPlanId = configuringPlanId === plan.id ? null : plan.id"
                    />
                    <Button
                      label="Usun"
                      size="small"
                      severity="danger"
                      :loading="deletingId === plan.id"
                      :disabled="deletingId !== null"
                      class="w-full sm:w-auto"
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
                      class="flex flex-col gap-2 rounded bg-slate-50 px-2 py-1.5 sm:flex-row sm:items-center sm:justify-between"
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

                <div
                  v-if="configuringPlanId === plan.id"
                  class="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_8.5rem_8.5rem_auto]"
                >
                  <Select
                    v-model="getPlanForm(plan.id).exerciseId"
                    :options="exercises"
                    option-label="name"
                    option-value="id"
                    placeholder="Wybierz cwiczenie"
                    filter
                    show-clear
                    class="w-full"
                    fluid
                    @focus="ensurePlanForm(plan.id)"
                  />
                  <InputNumber
                    v-model="getPlanForm(plan.id).targetSets"
                    placeholder="Serie"
                    :min="1"
                    class="w-full"
                    input-class="w-full"
                    @focus="ensurePlanForm(plan.id)"
                  />
                  <InputNumber
                    v-model="getPlanForm(plan.id).targetReps"
                    placeholder="Powtorz."
                    :min="1"
                    class="w-full"
                    input-class="w-full"
                    @focus="ensurePlanForm(plan.id)"
                  />
                  <Button
                    :label="savingPlanId === plan.id ? 'Zapisuje...' : 'Dodaj cwiczenie'"
                    size="small"
                      severity="contrast"
                      :loading="savingPlanId === plan.id"
                      :disabled="savingPlanId !== null"
                      class="w-full lg:w-auto"
                    @click="addExerciseToPlan(plan.id)"
                  />
                </div>
              </div>
            </li>
          </ul>
        </div>
      </template>
    </Card>
  </section>
</template>
