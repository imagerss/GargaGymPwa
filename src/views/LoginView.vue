<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
const router = useRouter()
const form = reactive({ email: '', password: '' })
const error = ref('')

const submit = async () => {
  error.value = ''
  try {
    await authStore.login(form.email, form.password)
    await router.replace({ name: 'dashboard' })
  } catch {
    error.value = 'Nieprawidlowe dane logowania.'
  }
}
</script>

<template>
  <main class="container">
    <section class="card">
      <h1>GargaGym</h1>
      <p>Logowanie do aplikacji PWA</p>
      <form @submit.prevent="submit" class="form">
        <input v-model="form.email" type="email" placeholder="Email" autocomplete="email" required />
        <input
          v-model="form.password"
          type="password"
          placeholder="Haslo"
          autocomplete="current-password"
          required
        />
        <button :disabled="authStore.loading" type="submit">
          {{ authStore.loading ? 'Logowanie...' : 'Zaloguj' }}
        </button>
      </form>
      <p v-if="error" class="error">{{ error }}</p>
    </section>
  </main>
</template>
