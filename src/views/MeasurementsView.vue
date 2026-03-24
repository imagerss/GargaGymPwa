<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Card from 'primevue/card'
import Button from 'primevue/button'
import DatePicker from 'primevue/datepicker'
import InputNumber from 'primevue/inputnumber'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import { apiClient } from '@/services/apiClient'
import { gymService, type BodyMeasurement } from '@/services/gymService'
import { useSyncStore } from '@/stores/sync'
import { trainingFlowService } from '@/services/trainingFlowService'

const syncStore = useSyncStore()
const measurements = ref<BodyMeasurement[]>([])
const sessionMeasurements = ref<
  Array<{ id: string; measured_at: string; weight: number | null; waist_cm: number | null; session_label: string }>
>([])
const loading = ref(false)
const isCreating = ref(false)
const deletingId = ref<number | null>(null)
const form = ref<{ measured_at: Date | null; weight: number | null; waist_cm: number | null }>({
  measured_at: new Date(),
  weight: null,
  waist_cm: null,
})
let tempId = -1

const loadMeasurements = async () => {
  loading.value = true
  try {
    measurements.value = await gymService.listBodyMeasurements()
    sessionMeasurements.value = trainingFlowService
      .listSessionLogs()
      .filter((session) => session.status === 'completed' && (session.finish_weight_kg !== null || session.finish_waist_cm !== null))
      .map((session) => ({
        id: session.id,
        measured_at: session.finished_at ?? session.started_at,
        weight: session.finish_weight_kg ?? null,
        waist_cm: session.finish_waist_cm ?? null,
        session_label: session.plan_name,
      }))
  } catch {
    // Keep local list while offline.
  } finally {
    loading.value = false
  }
}

const allMeasurements = computed(() => {
  const toMs = (value: string) => {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? 0 : parsed
  }

  const serverRows = measurements.value.map((item) => ({
    id: `srv-${item.id}`,
    measured_at: item.measured_at,
    weight: item.weight ?? null,
    waist_cm: item.waist_cm ?? null,
    source: 'manual',
    source_label: 'Pomiar',
    session_label: '',
    raw_id: item.id,
  }))

  const sessionRows = sessionMeasurements.value.map((item) => ({
    id: `session-${item.id}`,
    measured_at: item.measured_at,
    weight: item.weight,
    waist_cm: item.waist_cm,
    source: 'session',
    source_label: 'Z sesji',
    session_label: item.session_label,
    raw_id: item.id,
  }))

  // Completing a session can create two entries: session snapshot + body_measurement API record.
  // Hide the duplicate server row when values and timestamp match close enough.
  const dedupedServerRows = serverRows.filter((serverRow) => {
    return !sessionRows.some((sessionRow) => {
      const sameWeight = (sessionRow.weight ?? null) === (serverRow.weight ?? null)
      const sameWaist = (sessionRow.waist_cm ?? null) === (serverRow.waist_cm ?? null)
      const closeTime = Math.abs(toMs(sessionRow.measured_at) - toMs(serverRow.measured_at)) <= 2 * 60 * 1000
      return sameWeight && sameWaist && closeTime
    })
  })

  return [...sessionRows, ...dedupedServerRows].sort((a, b) => b.measured_at.localeCompare(a.measured_at))
})

const formatDate = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

const addMeasurement = async () => {
  if (isCreating.value || !form.value.measured_at) return
  isCreating.value = true
  try {
    const payload = {
      measured_at: new Date(form.value.measured_at).toISOString(),
      weight: form.value.weight,
      waist_cm: form.value.waist_cm,
    }
    const tempMeasurement: BodyMeasurement = {
      id: tempId--,
      measured_at: payload.measured_at,
      weight: payload.weight,
      waist_cm: payload.waist_cm,
    }
    measurements.value = [tempMeasurement, ...measurements.value]
    await gymService.upsertBodyMeasurementCache(tempMeasurement)

    if (navigator.onLine) {
      const response = await apiClient.post('/body-measurements', payload)
      const created = (response.data?.data ?? response.data) as BodyMeasurement
      measurements.value = measurements.value.map((measurement) =>
        measurement.id === tempMeasurement.id ? created : measurement,
      )
      await gymService.replaceCachedEntityId('body_measurements', tempMeasurement.id, created)
    } else {
      await syncStore.enqueueOperation({
        resource: 'body_measurements',
        action: 'create',
        local_entity_id: tempMeasurement.id,
        data: payload,
      })
    }
    form.value.weight = null
    form.value.waist_cm = null
  } finally {
    isCreating.value = false
  }
}

onMounted(loadMeasurements)

const deleteMeasurement = async (id: number) => {
  if (deletingId.value) return
  deletingId.value = id
  const prev = measurements.value
  measurements.value = measurements.value.filter((measurement) => measurement.id !== id)
  try {
    await gymService.removeBodyMeasurementCache(id)
    if (id < 0) {
      await syncStore.discardLocalEntity('body_measurements', id)
      return
    }
    if (navigator.onLine && id > 0) {
      await apiClient.delete(`/body-measurements/${id}`)
    } else {
      await syncStore.enqueueOperation({
        resource: 'body_measurements',
        action: 'delete',
        entity_id: id > 0 ? id : undefined,
      })
    }
  } catch {
    measurements.value = prev
    const restored = prev.find((measurement) => measurement.id === id)
    if (restored) {
      await gymService.upsertBodyMeasurementCache(restored)
    }
  } finally {
    deletingId.value = null
  }
}
</script>

<template>
  <section class="max-w-6xl px-1">
    <Card class="border border-slate-200 shadow-sm">
      <template #title>Pomiary ciala</template>
      <template #subtitle>Zapis wagi i pomiarow</template>
      <template #content>
        <div class="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
            <DatePicker v-model="form.measured_at" show-time hour-format="24" size="small" fluid />
            <InputNumber v-model="form.weight" placeholder="Waga (kg)" size="small" fluid />
            <InputNumber v-model="form.waist_cm" placeholder="Talia (cm)" size="small" fluid />
            <Button
              :label="isCreating ? 'Zapisuje...' : 'Dodaj pomiar'"
              :loading="isCreating"
              :disabled="isCreating"
              icon="pi pi-plus"
              severity="contrast"
              size="small"
              class="w-full lg:w-auto"
              @click="addMeasurement"
            />
          </div>
        </div>
        <div class="mt-4">
          <p v-if="loading" class="text-slate-500">Ladowanie...</p>
          <div v-else class="overflow-x-auto">
            <DataTable :value="allMeasurements" data-key="id" striped-rows size="small" class="min-w-176">
            <Column field="measured_at" header="Data">
              <template #body="{ data }">
                {{ formatDate(data.measured_at) }}
              </template>
            </Column>
            <Column field="weight" header="Waga (kg)">
              <template #body="{ data }">
                {{ data.weight ?? '-' }}
              </template>
            </Column>
            <Column field="waist_cm" header="Talia (cm)">
              <template #body="{ data }">
                {{ data.waist_cm ?? '-' }}
              </template>
            </Column>
            <Column field="source" header="Zrodlo">
              <template #body="{ data }">
                <Tag :value="data.source_label" :severity="data.source === 'session' ? 'contrast' : 'secondary'" />
              </template>
            </Column>
            <Column field="session_label" header="Sesja">
              <template #body="{ data }">
                {{ data.session_label || '-' }}
              </template>
            </Column>
            <Column header="Akcje">
              <template #body="{ data }">
                <Button
                  v-if="data.source === 'manual'"
                  label="Usun"
                  size="small"
                  severity="danger"
                  :loading="deletingId === data.raw_id"
                  :disabled="deletingId !== null"
                  @click="deleteMeasurement(data.raw_id)"
                />
              </template>
            </Column>
            </DataTable>
          </div>
        </div>
      </template>
    </Card>
  </section>
</template>
