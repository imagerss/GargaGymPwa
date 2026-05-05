<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Card from 'primevue/card'
import Button from 'primevue/button'
import Select from 'primevue/select'
import InputNumber from 'primevue/inputnumber'
import Message from 'primevue/message'
import Chart from 'primevue/chart'
import Image from 'primevue/image'
import { useSyncStore } from '@/stores/sync'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'
import AppLoadingState from '@/components/AppLoadingState.vue'
import Tag from 'primevue/tag'
import { apiClient } from '@/services/apiClient'
import { env } from '@/config/env'
import { gymService, type BodyMeasurement, type ProgressPhoto, type WorkoutPlan, type WorkoutSession } from '@/services/gymService'
import { trainingFlowService, type SessionLog, type TrainingPlanConfig } from '@/services/trainingFlowService'

const authStore = useAuthStore()
const syncStore = useSyncStore()
const router = useRouter()
const sessions = ref<WorkoutSession[]>([])
const plans = ref<WorkoutPlan[]>([])
const measurements = ref<BodyMeasurement[]>([])
const photos = ref<ProgressPhoto[]>([])
const startPlanId = ref<number | null>(null)
const isStarting = ref(false)
const isCompleting = ref(false)
const isDashboardLoading = ref(true)
const hasDashboardLoaded = ref(false)
const actionError = ref('')
const actionInfo = ref('')
const hoveredPointIndex = ref<number | null>(null)
const previewPointIndex = ref<number | null>(null)
const completeForm = ref<{ weight: number | null; waist: number | null; file: File | null }>({
  weight: null,
  waist: null,
  file: null,
})
const completePhotoInput = ref<HTMLInputElement | null>(null)
let tempSessionId = -1

const formatDate = (value?: string) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

const activeSession = computed(() => sessions.value.find((session) => session.status === 'active') ?? null)
const activeSessionPlanName = computed(() => {
  const current = activeSession.value
  if (!current?.workout_plan_id) {
    return activeSessionLog.value?.plan_name ?? 'Plan treningowy'
  }
  return plans.value.find((plan) => plan.id === current.workout_plan_id)?.name ?? activeSessionLog.value?.plan_name ?? `Plan #${current.workout_plan_id}`
})

const resolvePhotoUrl = (value?: string) => {
  if (!value) return ''
  if (/^https?:\/\//i.test(value) || value.startsWith('data:')) return value
  const backendOrigin = new URL(env.apiBaseUrl).origin
  if (value.startsWith('/')) return `${backendOrigin}${value}`
  return `${backendOrigin}/${value}`
}

const trendPoints = computed(() => {
  const all = measurements.value.map((item) => ({
    measuredAt: item.measured_at,
    weight: item.weight ?? null,
    waist: item.waist_cm ?? null,
  })).sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))

  const toMs = (value: string) => {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? 0 : parsed
  }
  const photoCandidates = [
    ...photos.value.map((photo) => ({ takenAt: photo.taken_at ?? '', path: resolvePhotoUrl(photo.photo_path) })),
  ]

  return all.slice(-12).map((point) => {
    const pointMs = toMs(point.measuredAt)
    const nearestPhoto = photoCandidates.reduce<{ path: string; diffMs: number } | null>((best, candidate) => {
      const diffMs = Math.abs(toMs(candidate.takenAt) - pointMs)
      if (!candidate.path) return best
      if (diffMs > 1000 * 60 * 60 * 24) return best
      if (!best || diffMs < best.diffMs) return { path: candidate.path, diffMs }
      return best
    }, null)

    return {
      ...point,
      photoPath: nearestPhoto?.path ?? '',
      label: formatDate(point.measuredAt),
    }
  })
})

const measurementChartData = computed(() => ({
  labels: trendPoints.value.map((point) => point.label),
  datasets: [
    {
      label: 'Waga (kg)',
      data: trendPoints.value.map((point) => point.weight),
      borderColor: '#16a34a',
      backgroundColor: '#16a34a',
      tension: 0.35,
      pointRadius: 4,
      spanGaps: true,
    },
    {
      label: 'Talia (cm)',
      data: trendPoints.value.map((point) => point.waist),
      borderColor: '#ea580c',
      backgroundColor: '#ea580c',
      tension: 0.35,
      pointRadius: 4,
      spanGaps: true,
    },
  ],
}))

const measurementChartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: { legend: { display: true } },
  onHover: (_event: unknown, elements: Array<{ index: number }>) => {
    const nextIndex = elements.at(0)?.index ?? null
    hoveredPointIndex.value = nextIndex
    previewPointIndex.value = nextIndex
  },
}))

const hoveredTrendPoint = computed(() => {
  if (previewPointIndex.value === null) return null
  return trendPoints.value[previewPointIndex.value] ?? null
})

const previewTrendPoint = computed(() => {
  if (hoveredTrendPoint.value) return hoveredTrendPoint.value
  return trendPoints.value.find((point) => point.photoPath) ?? trendPoints.value[0] ?? null
})

const activeSessionLog = computed<SessionLog | null>(() => {
  const current = activeSession.value
  if (!current) return null
  const logs = trainingFlowService.listSessionLogs()
  return logs.find((item) => item.remote_session_id === current.id && item.status === 'active') ?? null
})

const hydrateTrainingState = (
  loadedPlans: WorkoutPlan[],
  loadedSessions: WorkoutSession[],
  loadedExercises: Array<{ id: number; name: string }>,
) => {
  const exerciseNameById = loadedExercises.reduce<Record<number, string>>((acc, exercise) => {
    acc[exercise.id] = exercise.name
    return acc
  }, {})

  const dirtyPlanIds = new Set(trainingFlowService.listDirtyPlanConfigIds())
  const nextPlanConfigs: TrainingPlanConfig[] = loadedPlans.map((plan) => {
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
  })

  trainingFlowService.replacePlanConfigs(nextPlanConfigs)

  const planNameById = loadedPlans.reduce<Record<number, string>>((acc, plan) => {
    acc[plan.id] = plan.name
    return acc
  }, {})

  trainingFlowService.reconcileSessionLogsWithServer(loadedSessions, planNameById)
}

const loadDashboard = async () => {
  isDashboardLoading.value = true
  try {
    const [loadedSessions, loadedPlans, loadedMeasurements, loadedPhotos, loadedExercises] = await Promise.all([
      gymService.listWorkoutSessions(),
      gymService.listWorkoutPlans(),
      gymService.listBodyMeasurements(),
      gymService.listProgressPhotos(),
      gymService.listExercises(),
    ])

    hydrateTrainingState(loadedPlans, loadedSessions, loadedExercises)

    sessions.value = loadedSessions
    plans.value = loadedPlans
    measurements.value = loadedMeasurements
    photos.value = loadedPhotos
  } catch {
    // Keep dashboard available offline without throwing.
  } finally {
    hasDashboardLoaded.value = true
    isDashboardLoading.value = false
  }
}

const openCompletePhotoPicker = () => {
  completePhotoInput.value?.click()
}

const onSelectCompletePhoto = (event: Event) => {
  const target = event.target as HTMLInputElement | null
  completeForm.value.file = target?.files?.[0] ?? null
}

const clearCompletePhoto = () => {
  completeForm.value.file = null
}

const updateActiveSetValue = (
  exerciseId: number,
  setNumber: number,
  field: 'reps_done' | 'weight_kg',
  value: number | null,
) => {
  const currentLog = activeSessionLog.value
  if (!currentLog) return
  trainingFlowService.updateSessionSet(currentLog.id, exerciseId, setNumber, { [field]: value })
}

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('Nie udalo sie odczytac pliku'))
    reader.readAsDataURL(file)
  })

const collectCompletedSets = (session: SessionLog) =>
  session.exercises.flatMap((exercise) =>
    exercise.sets
      .filter((setItem) => exercise.workout_session_exercise_id && setItem.reps_done != null && setItem.weight_kg != null)
      .map((setItem) => ({
        workout_session_exercise_id: exercise.workout_session_exercise_id!,
        set_number: setItem.set_number,
        reps: setItem.reps_done!,
        weight: setItem.weight_kg!,
      })),
  )

const buildCompletionPayload = (
  session: SessionLog,
  endedAt: string,
  weight: number | null,
  waist: number | null,
  photoDataUrl?: string,
) => ({
  ended_at: endedAt,
  sets: collectCompletedSets(session),
  ...(weight != null
    ? {
        measurement: {
          measured_at: endedAt,
          weight,
          waist_cm: waist,
        },
      }
    : {}),
  ...(photoDataUrl
    ? {
        progress_photo: {
          photo_data_url: photoDataUrl,
          taken_at: endedAt,
          note: `Sesja ${session.plan_name}`,
        },
      }
    : {}),
})

const startSessionFromDashboard = async () => {
  if (!startPlanId.value || isStarting.value) return
  const plan = plans.value.find((entry) => entry.id === startPlanId.value)
  if (!plan) return

  actionError.value = ''
  actionInfo.value = ''
  isStarting.value = true
  try {
    if (navigator.onLine) {
      try {
        const response = await apiClient.post('/workout-sessions', {
          workout_plan_id: plan.id,
          started_at: new Date().toISOString(),
          status: 'active',
        })
        const created = (response.data?.data ?? response.data) as WorkoutSession
        await gymService.upsertWorkoutSessionCache(created)
        trainingFlowService.createSessionFromPlan(plan, created.id, created)
      } catch {
        const localSessionId = tempSessionId--
        await gymService.upsertWorkoutSessionCache({
          id: localSessionId,
          started_at: new Date().toISOString(),
          status: 'active',
          workout_plan_id: plan.id,
        })
        trainingFlowService.createSessionFromPlan(plan, localSessionId)
      }
    } else {
      const localSessionId = tempSessionId--
      await gymService.upsertWorkoutSessionCache({
        id: localSessionId,
        started_at: new Date().toISOString(),
        status: 'active',
        workout_plan_id: plan.id,
      })
      trainingFlowService.createSessionFromPlan(plan, localSessionId)
    }
    startPlanId.value = null
    actionInfo.value = `Rozpoczeto sesje: ${plan.name}`
    await loadDashboard()
  } catch {
    actionError.value = 'Nie udalo sie rozpoczac sesji.'
  } finally {
    isStarting.value = false
  }
}

const completeActiveSessionFromDashboard = async () => {
  const session = activeSession.value
  if (!session?.id || isCompleting.value) return

  actionError.value = ''
  actionInfo.value = ''
  isCompleting.value = true
  try {
    let localPhotoPath: string | undefined
    if (completeForm.value.file) {
      localPhotoPath = await readFileAsDataUrl(completeForm.value.file)
    }

    const localSession = trainingFlowService.listSessionLogs().find((item) => item.remote_session_id === session.id)
    if (localSession) {
      trainingFlowService.completeSession(localSession.id, {
        finish_photo_data_url: localPhotoPath,
        finish_weight_kg: completeForm.value.weight,
        finish_waist_cm: completeForm.value.waist,
      })
    }

    const endedAt = new Date().toISOString()
    const completionPayload = localSession
      ? buildCompletionPayload(localSession, endedAt, completeForm.value.weight, completeForm.value.waist, localPhotoPath)
      : null
    let completedOnline = false

    if (session.id > 0) {
      if (navigator.onLine && completionPayload) {
        try {
          const response = await apiClient.post(`/workout-sessions/${session.id}/complete`, completionPayload)
          const completedSession = response.data?.data?.session ?? response.data?.session
          if (completedSession) {
            await gymService.upsertWorkoutSessionCache(completedSession)
          }
          completedOnline = true
        } catch {
          completedOnline = false
        }
      }
      if (!completedOnline) {
        await syncStore.enqueueOperation({
          resource: 'workout_sessions',
          action: 'update',
          entity_id: session.id,
          data: {
            status: 'completed',
            ended_at: endedAt,
          },
        })
        await gymService.upsertWorkoutSessionCache({
          id: session.id,
          started_at: session.started_at,
          status: 'completed',
          workout_plan_id: session.workout_plan_id ?? null,
          ended_at: endedAt,
        })
      }
    } else {
      if (session.id < 0) {
        await syncStore.discardLocalEntity('workout_sessions', session.id, localSession?.id)
      }
      await syncStore.enqueueOperation({
        resource: 'workout_sessions',
        action: 'create',
        local_entity_id: session.id < 0 ? session.id : undefined,
        local_ref: localSession?.id,
        data: {
          workout_plan_id: session.workout_plan_id ?? null,
          started_at: session.started_at,
          ended_at: endedAt,
          status: 'completed',
          sets: localSession?.exercises ?? [],
          measurement:
            completeForm.value.weight != null
              ? { measured_at: endedAt, weight: completeForm.value.weight, waist_cm: completeForm.value.waist }
              : undefined,
          progress_photo: localPhotoPath ? { photo_data_url: localPhotoPath, taken_at: endedAt, note: `Sesja ${activeSessionPlanName.value}` } : undefined,
        },
      })
      await gymService.upsertWorkoutSessionCache({
        id: session.id,
        started_at: session.started_at,
        status: 'completed',
        workout_plan_id: session.workout_plan_id ?? null,
        ended_at: endedAt,
      })
    }

    if (!completedOnline && localSession) {
      for (const setItem of collectCompletedSets(localSession)) {
        if (session.id > 0) {
          await syncStore.enqueueOperation({
            resource: 'workout_sets',
            action: 'create',
            data: setItem,
          })
        }
      }
    }

    if (!completedOnline && completeForm.value.weight != null && session.id > 0) {
      await syncStore.enqueueOperation({
        resource: 'body_measurements',
        action: 'create',
        data: { measured_at: endedAt, weight: completeForm.value.weight, waist_cm: completeForm.value.waist },
      })
    }

    if (!completedOnline && localPhotoPath && session.id > 0) {
      await syncStore.enqueueOperation({
        resource: 'progress_photos',
        action: 'create',
        data: { photo_data_url: localPhotoPath, taken_at: endedAt, note: `Sesja ${activeSessionPlanName.value}` },
      })
    }

    completeForm.value = { weight: null, waist: null, file: null }
    actionInfo.value = 'Aktywna sesja zostala zakonczona.'
    await loadDashboard()
  } catch {
    actionError.value = 'Nie udalo sie zakonczyc aktywnej sesji.'
  } finally {
    isCompleting.value = false
  }
}

onMounted(loadDashboard)
</script>

<template>
  <section class="max-w-6xl px-1">
    <div class="mb-4 px-1">
      <h1 class="m-0 text-[clamp(1.4rem,2vw,2rem)] font-semibold">Czesc, {{ authStore.user?.name }}</h1>
      <p class="mt-2 text-slate-500">Twoj panel startowy treningu i progresu.</p>
    </div>
    <Message v-if="actionError" severity="error" class="mb-3">{{ actionError }}</Message>
    <Message v-if="actionInfo" severity="secondary" class="mb-3">{{ actionInfo }}</Message>
    <AppLoadingState v-if="isDashboardLoading && !hasDashboardLoaded" label="Ladowanie dashboardu" />
    <div v-else class="grid gap-3">
      <AppLoadingState v-if="isDashboardLoading" label="Odswiezanie danych" />
      <Card class="border border-slate-200 shadow-sm">
        <template #title>Trening</template>
        <template #content>
          <div class="grid gap-3">
            <Select
              v-model="startPlanId"
              :options="plans"
              option-label="name"
              option-value="id"
              placeholder="Wybierz plan i rozpocznij sesje"
              filter
              show-clear
              fluid
            />
            <Button
              :label="isStarting ? 'Rozpoczynam...' : 'Rozpocznij sesje teraz'"
              :loading="isStarting"
              :disabled="isStarting || !startPlanId"
              severity="contrast"
              @click="startSessionFromDashboard"
            />
            <Transition name="active-session">
              <div v-if="activeSession" class="rounded-lg border border-slate-200 bg-slate-50 p-2">
                <div class="mb-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span class="text-sm font-medium">{{ activeSessionPlanName }}</span>
                  <Tag value="Aktywna sesja" severity="warn" />
                </div>
                <span class="text-sm text-slate-500">Start: {{ formatDate(activeSession.started_at) }}</span>

                <div v-if="activeSessionLog" class="mt-2 grid gap-2">
                  <div
                    v-for="exercise in activeSessionLog.exercises"
                    :key="`${activeSessionLog.id}-${exercise.exercise_id}`"
                    class="rounded-lg border border-slate-200 bg-white p-2"
                  >
                    <p class="mb-2 text-sm font-medium">
                      {{ exercise.exercise_name }} - cel {{ exercise.target_sets }}x{{ exercise.target_reps }}
                    </p>
                    <div class="space-y-1.5">
                      <div
                        v-for="setItem in exercise.sets"
                        :key="setItem.set_number"
                        class="grid gap-2 sm:grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)] sm:items-center"
                      >
                        <span class="text-sm text-slate-500">Seria {{ setItem.set_number }}</span>
                        <InputNumber
                          :model-value="setItem.weight_kg"
                          placeholder="kg"
                          @update:model-value="
                            updateActiveSetValue(exercise.exercise_id, setItem.set_number, 'weight_kg', ($event as number | null) ?? null)
                          "
                        />
                        <InputNumber
                          :model-value="setItem.reps_done"
                          placeholder="powtorzenia"
                          @update:model-value="
                            updateActiveSetValue(exercise.exercise_id, setItem.set_number, 'reps_done', ($event as number | null) ?? null)
                          "
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div class="mt-2 grid gap-2 sm:grid-cols-2">
                  <InputNumber v-model="completeForm.weight" placeholder="Waga (kg)" size="small" fluid />
                  <InputNumber v-model="completeForm.waist" placeholder="Talia (cm)" size="small" fluid />
                  <div class="app-upload-field w-full">
                    <input
                      ref="completePhotoInput"
                      type="file"
                      accept="image/*"
                      class="hidden"
                      @change="onSelectCompletePhoto"
                    />
                    <div class="app-upload-inline">
                      <Button
                        type="button"
                        label="Zdjecie"
                        icon="pi pi-camera"
                        severity="secondary"
                        variant="outlined"
                        size="small"
                        class="w-full sm:w-auto"
                        @click="openCompletePhotoPicker"
                      />
                      <Button
                        v-if="completeForm.file"
                        type="button"
                        label="Usun"
                        severity="danger"
                        variant="text"
                        size="small"
                        class="shrink-0"
                        @click="clearCompletePhoto"
                      />
                      <span class="app-upload-name">
                        {{ completeForm.file?.name || 'Nie wybrano pliku' }}
                      </span>
                    </div>
                  </div>
                  <Button
                    :label="isCompleting ? 'Koncze...' : 'Zakoncz aktywna sesje'"
                    :loading="isCompleting"
                    :disabled="isCompleting"
                    severity="contrast"
                    size="small"
                    class="w-full"
                    @click="completeActiveSessionFromDashboard"
                  />
                </div>
              </div>
            </Transition>


          </div>
        </template>
      </Card>
      <Card class="border border-slate-200 shadow-sm">
  <template #title>Trend pomiarow</template>
  <template #content>
    <div
      v-if="trendPoints.length === 0"
      class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-slate-500"
    >
      Brak danych pomiarowych do wykresu.
    </div>

    <div v-else class="grid gap-4">
      <div class="">
        <Chart
          type="line"
          :data="measurementChartData"
          :options="measurementChartOptions"
        />
      </div>

      <div class="grid gap-4 rounded-2xl border border-slate-200 bg-linear-to-b from-slate-50 to-white p-4 shadow-sm">
        <div class="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
          <Image
            v-if="previewTrendPoint?.photoPath"
            :src="previewTrendPoint.photoPath"
            alt="Zdjecie powiazane z pomiarem"
            preview
            image-class="block h-[360px] w-full object-cover"
          />
          <div
            v-else
            class="flex h-[360px] items-center justify-center px-6 text-center text-sm text-slate-500"
          >
            Brak powiazanego zdjecia dla tego punktu.
          </div>
        </div>

        <div v-if="previewTrendPoint" class="flex flex-col gap-1 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <span>{{ previewTrendPoint.label }}</span>
          <span>Waga: {{ previewTrendPoint.weight ?? '-' }} kg | Talia: {{ previewTrendPoint.waist ?? '-' }} cm</span>
        </div>
      </div>
    </div>
  </template>
</Card>
    </div>
  </section>
</template>

<style scoped>
.active-session-enter-active,
.active-session-leave-active {
  transition:
    opacity 180ms ease,
    transform 220ms ease,
    max-height 220ms ease;
  overflow: hidden;
}

.active-session-enter-from,
.active-session-leave-to {
  opacity: 0;
  transform: translateY(-10px);
  max-height: 0;
}

.active-session-enter-to,
.active-session-leave-from {
  opacity: 1;
  transform: translateY(0);
  max-height: 1200px;
}
</style>

<style scoped>
.app-upload-inline {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
  flex-wrap: wrap;
}

.app-upload-name {
  min-width: 0;
  max-width: 12rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.8rem;
  color: #64748b;
}

.app-upload-field {
  border: 1px solid #cbd5e1;
  background: #ffffff;
  border-radius: 0.65rem;
  padding: 0.4rem 0.5rem;
}
</style>
