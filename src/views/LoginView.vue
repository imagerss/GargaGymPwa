<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import Card from 'primevue/card'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Button from 'primevue/button'
import Message from 'primevue/message'
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
  <main class="login-wrap">
    <Card class="login-card">
      <template #title>Witaj ponownie</template>
      <template #subtitle>Zaloguj sie do GargaGym PWA</template>
      <template #content>
        <form @submit.prevent="submit" class="form">
          <label class="field">
            <span>Email</span>
            <InputText v-model="form.email" type="email" placeholder="jan@example.com" autocomplete="email" fluid />
          </label>
          <label class="field">
            <span>Haslo</span>
            <Password v-model="form.password" :feedback="false" toggle-mask placeholder="Twoje haslo" fluid />
          </label>
          <Button
            :label="authStore.loading ? 'Logowanie...' : 'Zaloguj'"
            icon="pi pi-sign-in"
            iconPos="right"
            :loading="authStore.loading"
            type="submit"
            severity="success"
            size="large"
            fluid
          />
        </form>
        <Message v-if="error" severity="error" class="login-error">{{ error }}</Message>
      </template>
    </Card>
  </main>
</template>

<style scoped>
.login-wrap {
  min-height: calc(100vh - 12rem);
  display: grid;
  place-items: center;
}

.login-card {
  width: min(30rem, 92vw);
  border-radius: 1rem;
}

.form {
  display: grid;
  gap: 1rem;
}

.field {
  display: grid;
  gap: 0.35rem;
}

.field span {
  color: #cbd5e1;
  font-size: 0.9rem;
}

.login-error {
  margin-top: 1rem;
}
</style>
