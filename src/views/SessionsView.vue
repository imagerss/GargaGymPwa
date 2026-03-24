<script setup lang="ts">
import { onMounted, ref } from 'vue'
import Card from 'primevue/card'
import Button from 'primevue/button'
import Select from 'primevue/select'
import InputNumber from 'primevue/inputnumber'
import Accordion from 'primevue/accordion'
import AccordionPanel from 'primevue/accordionpanel'
import AccordionHeader from 'primevue/accordionheader'
import AccordionContent from 'primevue/accordioncontent'
import Tag from 'primevue/tag'
import AppLoadingState from '@/components/AppLoadingState.vue'
import { apiClient } from '@/services/apiClient'
import { env } from '@/config/env'
import { gymService, type WorkoutPlan, type WorkoutSession } from '@/services/gymService'
import { useSyncStore } from '@/stores/sync'
import { trainingFlowService, type SessionLog } from '@/services/trainingFlowService'

const syncStore = useSyncStore()
const plans = ref<WorkoutPlan[]>([])
const sessions = ref<SessionLog[]>([])
const loading = ref(false)
const isCreating = ref(false)
const finishingSessionId = ref<string | null>(null)
const startForm = ref<{ planId: number | null }>({ planId: null })
const finishForm = ref<Record<string, { weight: number | null; waist: number | null; file: File | null }>>({})
const infoMessage = ref('')
const expandedSessionId = ref<string | null>(null)
let tempSessionId = -1

const loadSessions = async () => {
  loading.value = true
  try {
    plans.value = await gymService.listWorkoutPlans()
    const remoteSessions = await gymService.listWorkoutSessions()
    const planNameById = plans.value.reduce<Record<number, string>>((acc, plan) => {
      acc[plan.id] = plan.name
      return acc
    }, {})
    sessions.value = trainingFlowService.reconcileSessionLogsWithServer(
      remoteSessions as WorkoutSession[],
      planNameById,
    )
    for (const session of sessions.value) {
      ensureFinishForm(session.id)
    }
  } catch {
    // Keep local list while offline.
  } finally {
    loading.value = false
  }
}

const ensureFinishForm = (sessionId: string) => {
  if (!finishForm.value[sessionId]) {
    finishForm.value[sessionId] = { weight: null, waist: null, file: null }
  }
}

const getFinishForm = (sessionId: string) => {
  ensureFinishForm(sessionId)
  return finishForm.value[sessionId]!
}

const startSession = async () => {
  if (isCreating.value || !startForm.value.planId) return
  isCreating.value = true
  try {
    const planId = Number(startForm.value.planId)
    const plan = plans.value.find((entry) => entry.id === planId)
    if (!plan) {
      infoMessage.value = 'Nie znaleziono planu.'
      return
    }

    let remoteSessionId: number | null = null
    if (navigator.onLine) {
      try {
        const response = await apiClient.post('/workout-sessions', {
          workout_plan_id: plan.id,
          started_at: new Date().toISOString(),
          status: 'active',
        })
        const createdRemote = (response.data?.data ?? response.data) as Partial<WorkoutSession>
        remoteSessionId = createdRemote?.id ?? null
        if (createdRemote?.id && createdRemote.started_at && createdRemote.status) {
          await gymService.upsertWorkoutSessionCache({
            id: createdRemote.id,
            started_at: createdRemote.started_at,
            status: createdRemote.status,
            workout_plan_id: createdRemote.workout_plan_id ?? plan.id,
          })
        } else if (remoteSessionId) {
          await gymService.upsertWorkoutSessionCache({
            id: remoteSessionId,
            started_at: new Date().toISOString(),
            status: 'active',
            workout_plan_id: plan.id,
          })
        }
      } catch {
        remoteSessionId = tempSessionId--
        await gymService.upsertWorkoutSessionCache({
          id: remoteSessionId,
          started_at: new Date().toISOString(),
          status: 'active',
          workout_plan_id: plan.id,
        })
      }
    } else {
      remoteSessionId = tempSessionId--
      await gymService.upsertWorkoutSessionCache({
        id: remoteSessionId,
        started_at: new Date().toISOString(),
        status: 'active',
        workout_plan_id: plan.id,
      })
    }

    const created = trainingFlowService.createSessionFromPlan(plan, remoteSessionId)
    if (!created) {
      infoMessage.value = 'Ten plan nie ma jeszcze przypisanych cwiczen.'
      return
    }
    infoMessage.value = `Rozpoczeto sesje planu: ${plan.name}`
    startForm.value.planId = null
    await loadSessions()
    ensureFinishForm(created.id)
  } finally {
    isCreating.value = false
  }
}

onMounted(loadSessions)

const updateSetValue = (
  sessionId: string,
  exerciseId: number,
  setNumber: number,
  field: 'reps_done' | 'weight_kg',
  value: number | null,
) => {
  trainingFlowService.updateSessionSet(sessionId, exerciseId, setNumber, {
    [field]: value,
  })
  sessions.value = trainingFlowService.listSessionLogs()
}

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('Nie udalo sie odczytac pliku'))
    reader.readAsDataURL(file)
  })

const openFinishPhotoPicker = (sessionId: string) => {
  const input = document.getElementById(`finish-photo-${sessionId}`) as HTMLInputElement | null
  input?.click()
}

const onSelectFinishPhoto = (sessionId: string, event: Event) => {
  ensureFinishForm(sessionId)
  const target = event.target as HTMLInputElement | null
  getFinishForm(sessionId).file = target?.files?.[0] ?? null
}

const clearFinishPhoto = (sessionId: string) => {
  ensureFinishForm(sessionId)
  getFinishForm(sessionId).file = null
}

const completeSession = async (session: SessionLog) => {
  if (finishingSessionId.value) return
  ensureFinishForm(session.id)
  const form = finishForm.value[session.id]
  if (!form) return
  finishingSessionId.value = session.id
  try {
    let photoDataUrl: string | undefined
    let persistedPhotoPath: string | undefined
    if (form.file) {
      photoDataUrl = await readFileAsDataUrl(form.file)
    }
    const weight = form.weight
    const waist = form.waist

    trainingFlowService.completeSession(session.id, {
      finish_photo_data_url: photoDataUrl,
      finish_weight_kg: weight,
      finish_waist_cm: waist,
    })

    if (navigator.onLine && form.file) {
      try {
        const photoFormData = new FormData()
        photoFormData.append('photo', form.file)
        photoFormData.append('taken_at', new Date().toISOString())
        photoFormData.append('note', `Sesja ${session.plan_name}`)
        const photoResponse = await apiClient.post('/progress-photos', photoFormData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        persistedPhotoPath = (photoResponse.data?.data ?? photoResponse.data)?.photo_path
      } catch {
        // Keep local snapshot when upload fails.
      }
    }

    const snapshot = {
      exercises: session.exercises,
      finish_weight_kg: weight,
      finish_waist_cm: waist,
      finish_photo_data_url: persistedPhotoPath ?? photoDataUrl,
    }
    const serializedSnapshot = `PWA_SNAPSHOT:${btoa(unescape(encodeURIComponent(JSON.stringify(snapshot))))}`

    if (navigator.onLine && session.remote_session_id && session.remote_session_id > 0) {
      try {
        const endedAt = new Date().toISOString()
        await apiClient.patch(`/workout-sessions/${session.remote_session_id}`, {
          status: 'completed',
          ended_at: endedAt,
          notes: serializedSnapshot,
        })
        await gymService.upsertWorkoutSessionCache({
          id: session.remote_session_id,
          started_at: session.started_at,
          status: 'completed',
          workout_plan_id: session.plan_id || null,
          ended_at: endedAt,
          notes: serializedSnapshot,
        })
      } catch {
        // Ignore API mismatch on optional endpoint.
      }
    } else if (session.remote_session_id && session.remote_session_id > 0) {
      await syncStore.enqueueOperation({
        resource: 'workout_sessions',
        action: 'update',
        entity_id: session.remote_session_id,
        data: { status: 'completed', ended_at: new Date().toISOString(), notes: serializedSnapshot },
      })
    } else {
      // Offline-only session: create directly as completed with full snapshot.
      if (session.remote_session_id && session.remote_session_id < 0) {
        await syncStore.discardLocalEntity('workout_sessions', session.remote_session_id, session.id)
      }
      await syncStore.enqueueOperation({
        resource: 'workout_sessions',
        action: 'create',
        local_entity_id: session.remote_session_id && session.remote_session_id < 0 ? session.remote_session_id : undefined,
        local_ref: session.id,
        data: {
          workout_plan_id: session.plan_id || null,
          started_at: session.started_at,
          ended_at: new Date().toISOString(),
          status: 'completed',
          notes: serializedSnapshot,
        },
      })
    }

    if (session.remote_session_id && session.remote_session_id < 0) {
      await gymService.upsertWorkoutSessionCache({
        id: session.remote_session_id,
        started_at: session.started_at,
        status: 'completed',
        workout_plan_id: session.plan_id || null,
        ended_at: new Date().toISOString(),
        notes: serializedSnapshot,
      })
    }

    // Session completion is the source for post-workout measurements.
    // Do not create an additional body_measurements record here to avoid duplicates.

    finishForm.value[session.id] = { weight: null, waist: null, file: null }
    await loadSessions()
    infoMessage.value = 'Sesja zakonczona i zapisana.'
  } finally {
    finishingSessionId.value = null
  }
}

const formatDate = (value?: string) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('pl-PL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

const resolvePhotoUrl = (value?: string) => {
  if (!value) return ''
  if (/^https?:\/\//i.test(value) || value.startsWith('data:')) return value
  const backendOrigin = new URL(env.apiBaseUrl).origin
  if (value.startsWith('/')) return `${backendOrigin}${value}`
  return `${backendOrigin}/${value}`
}
</script>

<template>
  <section class="max-w-6xl px-1">
    <Card class="border border-slate-200 shadow-sm">
      <template #title>Sesje treningowe</template>
      <template #subtitle>Wybierz plan, zapisuj serie i zakoncz sesje ze zdjeciem + pomiarem</template>
      <template #content>
        <div class="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div class="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
            <Select
              v-model="startForm.planId"
              :options="plans"
              option-label="name"
              option-value="id"
              placeholder="Wybierz plan treningowy"
              filter
              show-clear
              size="small"
              fluid
            />
            <Button
              :label="isCreating ? 'Rozpoczynam...' : 'Rozpocznij sesje'"
              :loading="isCreating"
              :disabled="isCreating"
              icon="pi pi-play"
              severity="contrast"
              size="small"
              class="w-full lg:w-auto"
              @click="startSession"
            />
          </div>
        </div>
        <p v-if="infoMessage" class="mt-3 text-sm text-slate-600">{{ infoMessage }}</p>
        <div class="mt-4">
          <AppLoadingState v-if="loading" />
          <div v-else-if="sessions.length === 0" class="rounded-lg border border-slate-200 bg-white p-4 text-slate-500">
            Brak sesji.
          </div>
          <Accordion v-else v-model:value="expandedSessionId">
            <AccordionPanel v-for="session in sessions" :key="session.id" :value="session.id">
              <AccordionHeader>
                <div class="flex w-full flex-col gap-3 pr-2 sm:flex-row sm:items-center sm:justify-between">
                  <div class="min-w-0">
                    <p class="truncate font-medium">{{ session.plan_name }}</p>
                    <p class="text-sm text-slate-500">Start: {{ formatDate(session.started_at) }}</p>
                  </div>
                  <Tag :value="session.status === 'active' ? 'W trakcie' : 'Zakonczona'" :severity="session.status === 'active' ? 'warn' : 'secondary'" />
                </div>
              </AccordionHeader>
              <AccordionContent>
                <div class="grid gap-3">
                  <p v-if="session.finished_at" class="text-sm text-slate-500">Koniec: {{ formatDate(session.finished_at) }}</p>

                  <div
                    v-for="exercise in session.exercises"
                    :key="`${session.id}-${exercise.exercise_id}`"
                    class="rounded-lg border border-slate-100 bg-slate-50 p-2"
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
                          :disabled="session.status !== 'active'"
                          @update:model-value="
                            updateSetValue(session.id, exercise.exercise_id, setItem.set_number, 'weight_kg', ($event as number | null) ?? null)
                          "
                        />
                        <InputNumber
                          :model-value="setItem.reps_done"
                          placeholder="powtorzenia"
                          :disabled="session.status !== 'active'"
                          @update:model-value="
                            updateSetValue(session.id, exercise.exercise_id, setItem.set_number, 'reps_done', ($event as number | null) ?? null)
                          "
                        />
                      </div>
                    </div>
                  </div>

                  <p v-if="session.exercises.length === 0" class="text-sm text-slate-500">
                    Szczegoly cwiczen nie sa jeszcze dostepne dla tej sesji.
                  </p>

                  <div v-if="session.status === 'active'" class="rounded-lg border border-dashed border-slate-300 p-3">
                    <p class="mb-2 text-sm font-medium">Zakonczenie sesji</p>
                    <div class="grid gap-2 sm:grid-cols-2">
                      <InputNumber v-model="getFinishForm(session.id).weight" placeholder="Waga (kg)" size="small" fluid />
                      <InputNumber v-model="getFinishForm(session.id).waist" placeholder="Talia (cm)" size="small" fluid />
                      <div class="app-upload-field w-full">
                        <input
                          :id="`finish-photo-${session.id}`"
                          type="file"
                          accept="image/*"
                          class="hidden"
                          @change="onSelectFinishPhoto(session.id, $event)"
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
                            @click="openFinishPhotoPicker(session.id)"
                          />
                          <Button
                            v-if="getFinishForm(session.id).file"
                            type="button"
                            label="Usun"
                            severity="danger"
                            variant="text"
                            size="small"
                            class="shrink-0"
                            @click="clearFinishPhoto(session.id)"
                          />
                          <span class="app-upload-name">
                            {{ getFinishForm(session.id).file?.name || 'Nie wybrano pliku' }}
                          </span>
                        </div>
                      </div>
                      <Button
                        label="Zakoncz sesje"
                        severity="contrast"
                        :loading="finishingSessionId === session.id"
                        :disabled="finishingSessionId !== null"
                        size="small"
                        class="w-full"
                        @click="completeSession(session)"
                      />
                    </div>
                  </div>

                  <div
                    v-if="session.status === 'completed' && session.finish_photo_data_url"
                    class="rounded-lg border border-slate-200 p-2"
                  >
                    <img
                      :src="resolvePhotoUrl(session.finish_photo_data_url)"
                      alt="Zdjecie z konca sesji"
                      class="max-h-56 w-full rounded object-cover sm:w-auto"
                    />
                  </div>
                  <div
                    v-if="session.status === 'completed' && (session.finish_weight_kg !== null || session.finish_waist_cm !== null)"
                    class="rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm text-slate-600"
                  >
                    Pomiar po sesji: Waga {{ session.finish_weight_kg ?? '-' }} kg | Talia {{ session.finish_waist_cm ?? '-' }} cm
                  </div>
                </div>
              </AccordionContent>
            </AccordionPanel>
          </Accordion>
        </div>
      </template>
    </Card>
  </section>
</template>

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
