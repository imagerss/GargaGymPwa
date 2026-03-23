<script setup lang="ts">
import Card from 'primevue/card'
import Button from 'primevue/button'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
const router = useRouter()

const logoutAndRedirect = async () => {
  await authStore.logout()
  await router.replace({ name: 'login' })
}
</script>

<template>
  <section class="max-w-6xl">
    <Card class="border border-slate-200 shadow-sm">
      <template #title>Profil</template>
      <template #subtitle>Dane uzytkownika i sesja</template>
      <template #content>
        <div class="space-y-2">
          <p><strong>Imie:</strong> {{ authStore.user?.name }}</p>
          <p><strong>Email:</strong> {{ authStore.user?.email }}</p>
          <Button label="Wyloguj" icon="pi pi-sign-out" severity="secondary" @click="logoutAndRedirect" />
        </div>
      </template>
    </Card>
  </section>
</template>
