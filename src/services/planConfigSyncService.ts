import { apiClient } from '@/services/apiClient'
import type { WorkoutPlan } from '@/services/gymService'
import { gymService } from '@/services/gymService'
import { trainingFlowService } from '@/services/trainingFlowService'

const syncPlanConfig = async (planId: number): Promise<void> => {
  const localConfig = trainingFlowService.getPlanConfig(planId)
  if (!localConfig) {
    trainingFlowService.clearPlanConfigDirty(planId)
    return
  }

  const response = await apiClient.get(`/workout-plans/${planId}`)
  const plan = (response.data?.data ?? response.data) as WorkoutPlan

  let workoutDay = (plan.workout_days ?? []).slice().sort((a, b) => a.day_order - b.day_order)[0]
  if (!workoutDay && localConfig.exercises.length > 0) {
    const dayResponse = await apiClient.post(`/workout-plans/${planId}/days`, {
      name: 'Dzien 1',
      day_order: 1,
    })
    workoutDay = {
      id: (dayResponse.data?.data ?? dayResponse.data)?.id,
      name: 'Dzien 1',
      day_order: 1,
      workout_day_exercises: [],
    }
  }

  const serverExercises = (workoutDay?.workout_day_exercises ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)
  const matchedServerIds = new Set<number>()

  for (const localExercise of localConfig.exercises) {
    if (localExercise.workout_day_exercise_id) {
      matchedServerIds.add(localExercise.workout_day_exercise_id)
      continue
    }

    const existing = serverExercises.find(
      (serverExercise) =>
        !matchedServerIds.has(serverExercise.id) &&
        serverExercise.exercise_id === localExercise.exercise_id &&
        (serverExercise.target_sets ?? 3) === localExercise.target_sets &&
        (serverExercise.target_reps_max ?? serverExercise.target_reps_min ?? 10) === localExercise.target_reps,
    )

    if (existing) {
      matchedServerIds.add(existing.id)
      continue
    }

    if (!workoutDay?.id) continue
    await apiClient.post(`/workout-days/${workoutDay.id}/exercises`, {
      exercise_id: localExercise.exercise_id,
      target_sets: localExercise.target_sets,
      target_reps_min: localExercise.target_reps,
      target_reps_max: localExercise.target_reps,
      sort_order: serverExercises.length + matchedServerIds.size,
    })
  }

  for (const serverExercise of serverExercises) {
    if (!matchedServerIds.has(serverExercise.id)) {
      await apiClient.delete(`/workout-day-exercises/${serverExercise.id}`)
    }
  }

  const refreshedResponse = await apiClient.get(`/workout-plans/${planId}`)
  await gymService.upsertWorkoutPlanCache((refreshedResponse.data?.data ?? refreshedResponse.data) as WorkoutPlan)
  trainingFlowService.clearPlanConfigDirty(planId)
}

export const planConfigSyncService = {
  async syncDirtyPlanConfigs() {
    const dirtyPlanIds = trainingFlowService.listDirtyPlanConfigIds().filter((planId) => planId > 0)
    for (const planId of dirtyPlanIds) {
      await syncPlanConfig(planId)
    }
  },
}
