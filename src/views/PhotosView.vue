<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Card from 'primevue/card'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import FileUpload, { type FileUploadSelectEvent } from 'primevue/fileupload'
import DataView from 'primevue/dataview'
import Tag from 'primevue/tag'
import Image from 'primevue/image'
import Message from 'primevue/message'
import { isAxiosError } from 'axios'
import { env } from '@/config/env'
import { apiClient } from '@/services/apiClient'
import { gymService, type ProgressPhoto } from '@/services/gymService'
import { useSyncStore } from '@/stores/sync'
import { trainingFlowService } from '@/services/trainingFlowService'

const syncStore = useSyncStore()
const photos = ref<ProgressPhoto[]>([])
const loading = ref(false)
const isUploading = ref(false)
const deletingId = ref<number | null>(null)
const file = ref<File | null>(null)
const note = ref('')
const uploadError = ref('')
const sessionPhotos = ref<Array<{ id: string; note: string; taken_at: string; photo_path: string; session_label: string }>>([])

const loadPhotos = async () => {
  loading.value = true
  try {
    photos.value = await gymService.listProgressPhotos()
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
    // Keep local state while offline.
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
    photo_path: resolvePhotoUrl(photo.photo_path || ''),
    source: 'manual',
    source_label: 'Pomiar',
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

const onSelectFile = (event: FileUploadSelectEvent) => {
  file.value = event.files?.[0] ?? null
}

const uploadPhoto = async () => {
  if (!file.value || isUploading.value) return
  isUploading.value = true
  uploadError.value = ''
  try {
    const tempId = -Date.now()
    const tempPreviewUrl = URL.createObjectURL(file.value)
    photos.value = [{ id: tempId, note: note.value, taken_at: new Date().toISOString(), photo_path: tempPreviewUrl }, ...photos.value]

    if (navigator.onLine) {
      const formData = new FormData()
      formData.append('photo', file.value, file.value.name)
      formData.append('taken_at', new Date().toISOString())
      if (note.value.trim()) formData.append('note', note.value.trim())

      const response = await apiClient.post('/progress-photos', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const created = (response.data?.data ?? response.data) as ProgressPhoto
      photos.value = photos.value.map((photo) => (photo.id === tempId ? created : photo))
    } else {
      // File binary is not queued in current sync contract, so keep visible locally.
      // We still queue metadata note; user can retry upload when online.
      await syncStore.enqueueOperation({
        resource: 'progress_photos',
        action: 'create',
        data: { note: note.value.trim(), taken_at: new Date().toISOString() },
      })
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
</script>

<template>
  <section class="max-w-6xl">
    <Card class="border border-slate-200 shadow-sm">
      <template #title>Zdjecia progresu</template>
      <template #subtitle>Dodaj i usuwaj zdjecia sylwetki</template>
      <template #content>
        <div class="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
          <InputText v-model="note" placeholder="Notatka do zdjecia (opcjonalnie)" fluid />
          <FileUpload
            mode="basic"
            accept="image/*"
            :max-file-size="5000000"
            choose-label="Wybierz zdjecie"
            :auto="false"
            custom-upload
            @select="onSelectFile"
          />
          <Button
            :label="isUploading ? 'Wysylam...' : 'Dodaj zdjecie'"
            :loading="isUploading"
            :disabled="isUploading || !file"
            icon="pi pi-upload"
            severity="success"
            @click="uploadPhoto"
          />
        </div>
        <div class="mt-4">
          <Message v-if="uploadError" severity="error" class="mb-3">{{ uploadError }}</Message>
          <p v-if="loading" class="text-slate-500">Ladowanie...</p>
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
                  <div class="flex items-start justify-between gap-2">
                    <div>
                      <p class="font-medium">{{ photo.note }}</p>
                      <p class="text-sm text-slate-500">{{ formatDate(photo.taken_at) }}</p>
                      <p v-if="photo.session_label" class="text-sm text-slate-500">Sesja: {{ photo.session_label }}</p>
                    </div>
                    <Tag :value="photo.source_label" :severity="photo.source === 'session' ? 'warn' : 'info'" />
                  </div>
                  <div class="mt-2 flex items-center gap-2">
                    <Button
                      v-if="photo.source === 'manual'"
                      label="Usun"
                      size="small"
                      severity="danger"
                      :loading="deletingId === photo.raw_id"
                      :disabled="deletingId !== null"
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
