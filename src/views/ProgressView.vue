<script setup lang="ts">
import { onMounted, ref } from 'vue'
import Card from 'primevue/card'
import Tag from 'primevue/tag'
import { Camera, Ruler, Scale } from 'lucide-vue-next'
import { gymService } from '@/services/gymService'

const overview = ref<Record<string, unknown>>({})

onMounted(async () => {
  if (!navigator.onLine) return
  overview.value = await gymService.statsOverview()
})
</script>

<template>
  <section class="max-w-6xl">
    <Card class="border border-slate-200 shadow-sm">
      <template #title>Progress</template>
      <template #subtitle>Waga, pomiary i zdjecia progresu</template>
      <template #content>
        <div class="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(10rem,1fr))]">
          <article class="flex flex-col gap-2 rounded-xl border border-slate-200 p-3">
            <Scale :size="18" />
            <span>Waga</span>
            <Tag value="MVP" severity="secondary" />
          </article>
          <article class="flex flex-col gap-2 rounded-xl border border-slate-200 p-3">
            <Ruler :size="18" />
            <span>Pomiary</span>
            <Tag value="MVP" severity="secondary" />
          </article>
          <article class="flex flex-col gap-2 rounded-xl border border-slate-200 p-3">
            <Camera :size="18" />
            <span>Zdjecia</span>
            <Tag value="Nastepny etap" severity="contrast" />
          </article>
        </div>
        <div class="mt-4 rounded-xl border border-slate-200 p-3">
          <p class="mb-2 font-medium">Statystyki (overview)</p>
          <pre class="overflow-x-auto text-xs text-slate-600">{{ JSON.stringify(overview, null, 2) }}</pre>
        </div>
      </template>
    </Card>
  </section>
</template>
