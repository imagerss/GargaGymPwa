<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Card from 'primevue/card'
import Button from 'primevue/button'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'
import Tag from 'primevue/tag'
import { gymService, type WorkoutPlan, type WorkoutSession } from '@/services/gymService'

const authStore = useAuthStore()
const router = useRouter()
const sessions = ref<WorkoutSession[]>([])
const plans = ref<WorkoutPlan[]>([])

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

onMounted(async () => {
  try {
    const [loadedSessions, loadedPlans] = await Promise.all([gymService.listWorkoutSessions(), gymService.listWorkoutPlans()])
    sessions.value = loadedSessions
    plans.value = loadedPlans
  } catch {
    // Keep dashboard available offline without throwing.
  }
})
</script>

<template>
  <section class="max-w-6xl">
    <div class="mb-4">
      <h1 class="m-0 text-[clamp(1.4rem,2vw,2rem)] font-semibold">Czesc, {{ authStore.user?.name }}</h1>
      <p class="mt-2 text-slate-500">Twoj panel startowy treningu i progresu.</p>
    </div>
    <div class="grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-3">
      <Card class="border border-slate-200 shadow-sm">
        <template #title>Szybki start</template>
        <template #content>
          <div class="grid gap-2">
            <span class="text-slate-500">Przejdz do planow treningowych i dodaj nowy plan.</span>
            <Button label="Plany" size="small" @click="router.push('/plans')" />
          </div>
        </template>
      </Card>
      <Card class="border border-slate-200 shadow-sm">
        <template #title>Trening</template>
        <template #content>
          <div class="grid gap-2">
            <div v-if="activeSession" class="rounded-lg border border-slate-200 bg-slate-50 p-2">
              <div class="mb-1 flex items-center justify-between gap-2">
                <span class="text-sm font-medium">{{ activeSessionPlanName }}</span>
                <Tag value="Aktywna sesja" severity="warn" />
              </div>
              <span class="text-sm text-slate-500">Start: {{ formatDate(activeSession.started_at) }}</span>
            </div>
            <span v-else class="text-slate-500">Brak aktywnej sesji. Mozesz rozpoczac nowa.</span>
            <Button label="Sesje" size="small" @click="router.push('/sessions')" />
          </div>
        </template>
      </Card>
    </div>
  </section>
</template>
