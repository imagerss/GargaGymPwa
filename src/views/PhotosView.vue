<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Card from 'primevue/card'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import DataView from 'primevue/dataview'
import Tag from 'primevue/tag'
import Image from 'primevue/image'
import Message from 'primevue/message'
import AppLoadingState from '@/components/AppLoadingState.vue'
import { isAxiosError } from 'axios'
import { env } from '@/config/env'
import { apiClient } from '@/services/apiClient'
import { gymService, type ProgressPhoto } from '@/services/gymService'
import { useSyncStore } from '@/stores/sync'
import { trainingFlowService } from '@/services/trainingFlowService'
import { db } from '@/db/appDb'

interface LocalPendingPhoto extends ProgressPhoto {
  pending?: boolean
  local_data_url?: string
}

const syncStore = useSyncStore()
const photos = ref<LocalPendingPhoto[]>([])
const loading = ref(false)
const isUploading = ref(false)
const deletingId = ref<number | null>(null)
const file = ref<File | null>(null)
const photoInput = ref<HTMLInputElement | null>(null)
const note = ref('')
const uploadError = ref('')
const sessionPhotos = ref<Array<{ id: string; note: string; taken_at: string; photo_path: string; session_label: string }>>([])

const PENDING_PHOTOS_KEY = 'pending_progress_photos'

const readAsDataUrl = (selectedFile: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Nie udalo sie odczytac pliku'))
    reader.readAsDataURL(selectedFile)
  })

const loadPendingPhotos = async (): Promise<LocalPendingPhoto[]> => {
  const entry = await db.kv.get(PENDING_PHOTOS_KEY)
  if (!entry?.value) return []
  try {
    return JSON.parse(entry.value) as LocalPendingPhoto[]
  } catch {
    return []
  }
}

const savePendingPhotos = async (pending: LocalPendingPhoto[]) => {
  if (pending.length === 0) {
    await db.kv.delete(PENDING_PHOTOS_KEY)
    return
  }
  await db.kv.put({ key: PENDING_PHOTOS_KEY, value: JSON.stringify(pending) })
}

const removePendingPhoto = async (id: number) => {
  const pending = await loadPendingPhotos()
  await savePendingPhotos(pending.filter((photo) => photo.id !== id))
}

const uploadPendingPhoto = async (photo: LocalPendingPhoto): Promise<ProgressPhoto | null> => {
  if (!photo.local_data_url) return null

  const blob = await (await fetch(photo.local_data_url)).blob()
  const ext = blob.type.split('/')[1] || 'jpg'
  const uploadFile = new File([blob], `photo-${Math.abs(photo.id)}.${ext}`, { type: blob.type || 'image/jpeg' })
  const formData = new FormData()
  formData.append('photo', uploadFile, uploadFile.name)
  formData.append('taken_at', photo.taken_at || new Date().toISOString())
  if (photo.note?.trim()) formData.append('note', photo.note.trim())

  const response = await apiClient.post('/progress-photos', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })

  return (response.data?.data ?? response.data) as ProgressPhoto
}

const flushPendingPhotos = async () => {
  if (!navigator.onLine) return

  const pending = await loadPendingPhotos()
  if (pending.length === 0) return

  for (const pendingPhoto of pending) {
    try {
      const created = await uploadPendingPhoto(pendingPhoto)
      if (!created) continue
      photos.value = photos.value.map((photo) => (photo.id === pendingPhoto.id ? created : photo))
      await removePendingPhoto(pendingPhoto.id)
    } catch {
      // keep for next retry
    }
  }
}

const loadPhotos = async () => {
  loading.value = true
  try {
    const remote = await gymService.listProgressPhotos()
    const pending = await loadPendingPhotos()
    photos.value = [...pending, ...remote]
    sessionPhotos.value = trainingFlowService
      .listSessionLogs()
      .filter((session) => session.status === 'completed' && session.finish_photo_data_url)
      .map((session) => ({
        id: session.id,
        note: `Sesja ${session.plan_name}`,
        taken_at: session.finished_at ?? session.started_at,
        photo_path: session.finish_photo_data_url!,
        session_label: session.plan_name,
      }))
  } catch {
    photos.value = await loadPendingPhotos()
  } finally {
    loading.value = false
  }
}

const mergedPhotos = computed(() => {
  const toMs = (value?: string) => {
    if (!value) return 0
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? 0 : parsed
  }

  const resolvePhotoUrl = (value?: string) => {
    if (!value) return ''
    if (/^https?:\/\//i.test(value) || value.startsWith('data:')) return value
    const backendOrigin = new URL(env.apiBaseUrl).origin
    if (value.startsWith('/')) {
      return `${backendOrigin}${value}`
    }
    return `${backendOrigin}/${value}`
  }

  const serverRows = photos.value.map((photo) => ({
    id: `srv-${photo.id}`,
    raw_id: photo.id,
    note: photo.note || 'Zdjecie progresu',
    taken_at: photo.taken_at || '',
    photo_path: photo.local_data_url || resolvePhotoUrl(photo.photo_path || ''),
    source: 'manual',
    source_label: photo.pending ? 'Oczekuje' : 'Pomiar',
    session_label: '',
  }))

  const sessionRows = sessionPhotos.value.map((photo) => ({
    id: `session-${photo.id}`,
    raw_id: photo.id,
    note: photo.note,
    taken_at: photo.taken_at,
    photo_path: resolvePhotoUrl(photo.photo_path),
    source: 'session',
    source_label: 'Z sesji',
    session_label: photo.session_label,
  }))

  const dedupedServerRows = serverRows.filter((serverRow) => {
    return !sessionRows.some((sessionRow) => {
      const closeTime = Math.abs(toMs(sessionRow.taken_at) - toMs(serverRow.taken_at)) <= 2 * 60 * 1000
      const sameSessionNote =
        Boolean(serverRow.note) &&
        (serverRow.note.toLowerCase() === sessionRow.note.toLowerCase() ||
          serverRow.note.toLowerCase().includes(sessionRow.session_label.toLowerCase()))
      return closeTime && sameSessionNote
    })
  })

  return [...sessionRows, ...dedupedServerRows].sort((a, b) => b.taken_at.localeCompare(a.taken_at))
})

const formatDate = (value?: string) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

const openPhotoPicker = () => {
  photoInput.value?.click()
}

const onSelectFile = (event: Event) => {
  const target = event.target as HTMLInputElement | null
  file.value = target?.files?.[0] ?? null
}

const clearSelectedFile = () => {
  file.value = null
}

const uploadPhoto = async () => {
  if (!file.value || isUploading.value) return
  isUploading.value = true
  uploadError.value = ''
  try {
    const tempId = -Date.now()
    const pendingPhoto: LocalPendingPhoto = {
      id: tempId,
      note: note.value,
      taken_at: new Date().toISOString(),
      photo_path: '',
      pending: true,
      local_data_url: await readAsDataUrl(file.value),
    }
    photos.value = [pendingPhoto, ...photos.value]
    const pending = await loadPendingPhotos()
    await savePendingPhotos([pendingPhoto, ...pending])

    if (navigator.onLine) {
      const created = await uploadPendingPhoto(pendingPhoto)
      if (!created) return
      photos.value = photos.value.map((photo) => (photo.id === tempId ? created : photo))
      await removePendingPhoto(tempId)
    } else {
      // Persisted locally; will be uploaded on next online sync attempt.
    }

    file.value = null
    note.value = ''
  } catch (error) {
    photos.value = photos.value.filter((photo) => photo.id >= 0)
    if (isAxiosError(error) && error.response?.status === 422) {
      const payload = error.response.data as { message?: string; errors?: Record<string, string[] | string> }
      const firstFieldError = payload?.errors
        ? Object.values(payload.errors)
            .flatMap((entry) => (Array.isArray(entry) ? entry : [entry]))
            .find(Boolean)
        : null
      uploadError.value = String(firstFieldError || payload?.message || 'Niepoprawne dane zdjecia (422).')
    } else {
      uploadError.value = 'Nie udalo sie dodac zdjecia. Sprobuj ponownie.'
    }
  } finally {
    isUploading.value = false
  }
}

const deletePhoto = async (id: number) => {
  if (deletingId.value) return
  deletingId.value = id
  const previous = photos.value
  photos.value = photos.value.filter((photo) => photo.id !== id)
  try {
    if (id < 0) {
      await removePendingPhoto(id)
      return
    }

    if (navigator.onLine && id > 0) {
      await apiClient.delete(`/progress-photos/${id}`)
    } else {
      await syncStore.enqueueOperation({
        resource: 'progress_photos',
        action: 'delete',
        entity_id: id > 0 ? id : undefined,
      })
    }
  } catch {
    photos.value = previous
  } finally {
    deletingId.value = null
  }
}

onMounted(loadPhotos)
onMounted(flushPendingPhotos)
</script>

<template>
  <section class="max-w-6xl px-1">
    <Card class="border border-slate-200 shadow-sm">
      <template #title>Zdjecia progresu</template>
      <template #subtitle>Dodaj i usuwaj zdjecia sylwetki</template>
      <template #content>
        <div class="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <InputText v-model="note" placeholder="Notatka do zdjecia (opcjonalnie)" size="small" fluid />
            <div class="app-upload-field w-full">
              <input
                ref="photoInput"
                type="file"
                accept="image/*"
                class="hidden"
                @change="onSelectFile"
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
                  @click="openPhotoPicker"
                />
                <Button
                  v-if="file"
                  type="button"
                  label="Usun"
                  severity="danger"
                  variant="text"
                  size="small"
                  class="shrink-0"
                  @click="clearSelectedFile"
                />
                <span class="app-upload-name">
                  {{ file?.name || 'Nie wybrano pliku' }}
                </span>
              </div>
            </div>
            <Button
              :label="isUploading ? 'Wysylam...' : 'Dodaj zdjecie'"
              :loading="isUploading"
              :disabled="isUploading || !file"
              icon="pi pi-upload"
              severity="contrast"
              size="small"
              class="w-full lg:w-auto"
              @click="uploadPhoto"
            />
          </div>
        </div>
        <div class="mt-4">
          <Message v-if="uploadError" severity="error" class="mb-3">{{ uploadError }}</Message>
          <AppLoadingState v-if="loading" />
          <div v-else-if="mergedPhotos.length === 0" class="rounded-lg border border-slate-200 bg-white p-4 text-slate-500">
            Brak zdjec.
          </div>
          <DataView v-else :value="mergedPhotos" layout="grid">
            <template #grid="{ items }">
              <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                <article v-for="photo in items" :key="photo.id" class="rounded-lg border border-slate-200 bg-white p-3">
                  <Image
                    v-if="photo.photo_path"
                    :src="photo.photo_path"
                    alt="Zdjecie progresu"
                    preview
                    image-class="mb-2 h-56 w-full rounded object-cover"
                  />
                  <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p class="font-medium">{{ photo.note }}</p>
                      <p class="text-sm text-slate-500">{{ formatDate(photo.taken_at) }}</p>
                      <p v-if="photo.session_label" class="text-sm text-slate-500">Sesja: {{ photo.session_label }}</p>
                    </div>
                    <Tag
                      :value="photo.source_label"
                      :severity="photo.source === 'session' ? 'secondary' : photo.source_label === 'Oczekuje' ? 'warn' : 'secondary'"
                    />
                  </div>
                  <div class="mt-2 flex items-center gap-2">
                    <Button
                      v-if="photo.source === 'manual'"
                      label="Usun"
                      size="small"
                      severity="danger"
                      :loading="deletingId === photo.raw_id"
                      :disabled="deletingId !== null"
                      class="w-full sm:w-auto"
                      @click="deletePhoto(photo.raw_id)"
                    />
                  </div>
                </article>
              </div>
            </template>
          </DataView>
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
  max-width: 14rem;
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
