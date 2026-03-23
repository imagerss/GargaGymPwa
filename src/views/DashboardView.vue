<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Card from 'primevue/card'
import Button from 'primevue/button'
import Select from 'primevue/select'
import InputNumber from 'primevue/inputnumber'
import FileUpload, { type FileUploadSelectEvent } from 'primevue/fileupload'
import Message from 'primevue/message'
import Chart from 'primevue/chart'
import Image from 'primevue/image'
import { useSyncStore } from '@/stores/sync'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'
import Tag from 'primevue/tag'
import { apiClient } from '@/services/apiClient'
import { env } from '@/config/env'
import { gymService, type BodyMeasurement, type ProgressPhoto, type WorkoutPlan, type WorkoutSession } from '@/services/gymService'
import { trainingFlowService, type SessionLog } from '@/services/trainingFlowService'

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
const actionError = ref('')
const actionInfo = ref('')
const hoveredPointIndex = ref<number | null>(null)
const previewPointIndex = ref<number | null>(null)
const completeForm = ref<{ weight: number | null; waist: number | null; file: File | null }>({
  weight: null,
  waist: null,
  file: null,
})
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
  if (!current?.workout_plan_id) return 'Plan treningowy'
  return plans.value.find((plan) => plan.id === current.workout_plan_id)?.name ?? `Plan #${current.workout_plan_id}`
})

const resolvePhotoUrl = (value?: string) => {
  if (!value) return ''
  if (/^https?:\/\//i.test(value) || value.startsWith('data:')) return value
  const backendOrigin = new URL(env.apiBaseUrl).origin
  if (value.startsWith('/')) return `${backendOrigin}${value}`
  return `${backendOrigin}/${value}`
}

const trendPoints = computed(() => {
  const manual = measurements.value.map((item) => ({
    measuredAt: item.measured_at,
    weight: item.weight ?? null,
    waist: item.waist_cm ?? null,
  }))
  const fromSessions = trainingFlowService
    .listSessionLogs()
    .filter((session) => session.status === 'completed' && (session.finish_weight_kg !== null || session.finish_waist_cm !== null))
    .map((session) => ({
      measuredAt: session.finished_at ?? session.started_at,
      weight: session.finish_weight_kg ?? null,
      waist: session.finish_waist_cm ?? null,
    }))

  const all = [...manual, ...fromSessions].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
  const toMs = (value: string) => {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? 0 : parsed
  }
  const photoCandidates = [
    ...photos.value.map((photo) => ({ takenAt: photo.taken_at ?? '', path: resolvePhotoUrl(photo.photo_path) })),
    ...trainingFlowService
      .listSessionLogs()
      .filter((session) => session.status === 'completed' && session.finish_photo_data_url)
      .map((session) => ({ takenAt: session.finished_at ?? session.started_at, path: resolvePhotoUrl(session.finish_photo_data_url) })),
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

const loadDashboard = async () => {
  try {
    const [loadedSessions, loadedPlans, loadedMeasurements, loadedPhotos] = await Promise.all([
      gymService.listWorkoutSessions(),
      gymService.listWorkoutPlans(),
      gymService.listBodyMeasurements(),
      gymService.listProgressPhotos(),
    ])
    sessions.value = loadedSessions
    plans.value = loadedPlans
    measurements.value = loadedMeasurements
    photos.value = loadedPhotos
  } catch {
    // Keep dashboard available offline without throwing.
  }
}

const onSelectCompletePhoto = (event: FileUploadSelectEvent) => {
  completeForm.value.file = event.files?.[0] ?? null
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
        trainingFlowService.createSessionFromPlan(plan, created.id)
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

    let persistedPhotoPath: string | undefined
    if (completeForm.value.file) {
      try {
        const photoFormData = new FormData()
        photoFormData.append('photo', completeForm.value.file)
        photoFormData.append('taken_at', new Date().toISOString())
        photoFormData.append('note', `Sesja ${activeSessionPlanName.value}`)
        const photoResponse = await apiClient.post('/progress-photos', photoFormData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        persistedPhotoPath = (photoResponse.data?.data ?? photoResponse.data)?.photo_path
      } catch {
        // Keep local fallback photo path.
      }
    }

    const localSession = trainingFlowService.listSessionLogs().find((item) => item.remote_session_id === session.id)
    if (localSession) {
      trainingFlowService.completeSession(localSession.id, {
        finish_photo_data_url: persistedPhotoPath ?? localPhotoPath,
        finish_weight_kg: completeForm.value.weight,
        finish_waist_cm: completeForm.value.waist,
      })
    }

    const snapshot = {
      exercises: localSession?.exercises ?? [],
      finish_weight_kg: completeForm.value.weight,
      finish_waist_cm: completeForm.value.waist,
      finish_photo_data_url: persistedPhotoPath ?? localPhotoPath,
    }
    const serializedSnapshot = `PWA_SNAPSHOT:${btoa(unescape(encodeURIComponent(JSON.stringify(snapshot))))}`
    const endedAt = new Date().toISOString()

    if (session.id > 0) {
      if (navigator.onLine) {
        await apiClient.patch(`/workout-sessions/${session.id}`, {
          status: 'completed',
          ended_at: endedAt,
          notes: serializedSnapshot,
        })
        await gymService.upsertWorkoutSessionCache({
          id: session.id,
          started_at: session.started_at,
          status: 'completed',
          workout_plan_id: session.workout_plan_id ?? null,
          ended_at: endedAt,
          notes: serializedSnapshot,
        })
      } else {
        await syncStore.enqueueOperation({
          resource: 'workout_sessions',
          action: 'update',
          entity_id: session.id,
          data: {
            status: 'completed',
            ended_at: endedAt,
            notes: serializedSnapshot,
          },
        })
        await gymService.upsertWorkoutSessionCache({
          id: session.id,
          started_at: session.started_at,
          status: 'completed',
          workout_plan_id: session.workout_plan_id ?? null,
          ended_at: endedAt,
          notes: serializedSnapshot,
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
          notes: serializedSnapshot,
        },
      })
      await gymService.upsertWorkoutSessionCache({
        id: session.id,
        started_at: session.started_at,
        status: 'completed',
        workout_plan_id: session.workout_plan_id ?? null,
        ended_at: endedAt,
        notes: serializedSnapshot,
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
  <section class="max-w-6xl">
    <div class="mb-4">
      <h1 class="m-0 text-[clamp(1.4rem,2vw,2rem)] font-semibold">Czesc, {{ authStore.user?.name }}</h1>
      <p class="mt-2 text-slate-500">Twoj panel startowy treningu i progresu.</p>
    </div>
    <Message v-if="actionError" severity="error" class="mb-3">{{ actionError }}</Message>
    <Message v-if="actionInfo" severity="success" class="mb-3">{{ actionInfo }}</Message>
    <div class="grid gap-3">
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
              severity="success"
              @click="startSessionFromDashboard"
            />
            <div v-if="activeSession" class="rounded-lg border border-slate-200 bg-slate-50 p-2">
              <div class="mb-1 flex items-center justify-between gap-2">
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
                      class="grid gap-2 md:grid-cols-[7rem_1fr_1fr]"
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

              <div class="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-[1fr_1fr_auto_auto] xl:items-center">
                <InputNumber v-model="completeForm.weight" placeholder="Waga (kg)" />
                <InputNumber v-model="completeForm.waist" placeholder="Talia (cm)" />
                <FileUpload
                  mode="basic"
                  accept="image/*"
                  :max-file-size="5000000"
                  choose-label="Zdjecie koncowe"
                  :auto="false"
                  custom-upload
                  @select="onSelectCompletePhoto"
                />
                <Button
                  :label="isCompleting ? 'Koncze...' : 'Zakoncz aktywna sesje'"
                  :loading="isCompleting"
                  :disabled="isCompleting"
                  severity="warn"
                  @click="completeActiveSessionFromDashboard"
                />
              </div>
            </div>
            <span v-else class="text-slate-500">Brak aktywnej sesji. Mozesz rozpoczac nowa.</span>
            <Button label="Sesje" size="small" @click="router.push('/sessions')" />
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
      <div>
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

        <div v-if="previewTrendPoint" class="flex items-center justify-between gap-3 text-sm text-slate-600">
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
