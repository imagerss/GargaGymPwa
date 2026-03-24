<script setup lang="ts">
import ProgressSpinner from 'primevue/progressspinner'

withDefaults(
  defineProps<{
    label?: string
  }>(),
  {
    label: 'Ladowanie',
  },
)
</script>

<template>
  <div class="flex min-h-32 flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white/80 p-6 text-center shadow-sm">
    <ProgressSpinner
      stroke-width="6"
      fill="transparent"
      animation-duration=".75s"
      class="h-10 w-10"
      :pt="{ spinner: { class: 'stroke-slate-900' } }"
    />
    <div class="space-y-1">
      <p class="text-sm font-medium text-slate-700">{{ label }}</p>
      <p class="text-xs uppercase tracking-[0.18em] text-slate-400">Prosze czekac</p>
    </div>
  </div>
</template>
