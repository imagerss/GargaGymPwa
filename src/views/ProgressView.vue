<script setup lang="ts">
import Card from 'primevue/card'
import Tag from 'primevue/tag'
import { Camera, Ruler, Scale } from 'lucide-vue-next'
</script>

<template>
  <section class="page">
    <Card>
      <template #title>Progress</template>
      <template #subtitle>Waga, pomiary i zdjecia progresu</template>
      <template #content>
        <div class="tiles">
          <article class="tile">
            <Scale :size="18" />
            <span>Waga</span>
            <Tag value="MVP" severity="secondary" />
          </article>
          <article class="tile">
            <Ruler :size="18" />
            <span>Pomiary</span>
            <Tag value="MVP" severity="secondary" />
          </article>
          <article class="tile">
            <Camera :size="18" />
            <span>Zdjecia</span>
            <Tag value="Nastepny etap" severity="contrast" />
          </article>
        </div>
      </template>
    </Card>
  </section>
</template>

<style scoped>
.tiles {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
}

.tile {
  padding: 0.75rem;
  border-radius: 0.75rem;
  border: 1px solid rgba(148, 163, 184, 0.26);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
</style>
