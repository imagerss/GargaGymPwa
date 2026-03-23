<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import Card from 'primevue/card'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Button from 'primevue/button'
import Message from 'primevue/message'
import SelectButton from 'primevue/selectbutton'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
const router = useRouter()
const mode = ref<'login' | 'register'>('login')
const modeOptions = [
  { label: 'Logowanie', value: 'login' },
  { label: 'Utworz konto', value: 'register' },
]
const form = reactive({
  name: '',
  email: '',
  password: '',
  password_confirmation: '',
})
const error = ref('')
const isRegister = computed(() => mode.value === 'register')
const parseLaravelErrors = (errors: unknown): string => {
  if (!errors || typeof errors !== 'object') return ''
  const entries = Object.values(errors as Record<string, unknown>)
  const first = entries.find((value) => Array.isArray(value) && value.length > 0) as string[] | undefined
  return first?.[0] ?? ''
}

const submit = async () => {
  error.value = ''
  try {
    if (isRegister.value) {
      if (!form.name.trim()) {
        error.value = 'Imie i nazwisko jest wymagane.'
        return
      }
      if (form.password !== form.password_confirmation) {
        error.value = 'Hasla musza byc takie same.'
        return
      }

      await authStore.register({
        name: form.name.trim(),
        email: form.email,
        password: form.password,
        password_confirmation: form.password_confirmation,
      })
    } else {
      await authStore.login(form.email, form.password)
    }

    await router.replace({ name: 'dashboard' })
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const apiMessage = parseLaravelErrors(err.response?.data?.errors) || err.response?.data?.message
      if (apiMessage) {
        error.value = apiMessage
        return
      }
    }

    error.value = isRegister.value ? 'Nie udalo sie utworzyc konta. Sprawdz dane.' : 'Nieprawidlowe dane logowania.'
  }
}
</script>

<template>
  <main class="grid min-h-[calc(100vh-12rem)] place-items-center">
    <Card class="w-[min(30rem,92vw)] rounded-2xl border border-slate-200 shadow-sm">
      <template #title>{{ isRegister ? 'Utworz konto' : 'Witaj ponownie' }}</template>
      <template #subtitle>
        {{ isRegister ? 'Zarejestruj nowe konto w GargaGym PWA' : 'Zaloguj sie do GargaGym PWA' }}
      </template>
      <template #content>
        <form @submit.prevent="submit" class="grid gap-4">
          <SelectButton v-model="mode" :options="modeOptions" option-label="label" option-value="value" fluid />
          <label v-if="isRegister" class="grid gap-1.5">
            <span class="text-sm text-slate-600">Imie i nazwisko</span>
            <InputText v-model="form.name" type="text" placeholder="Jan Kowalski" autocomplete="name" required fluid />
          </label>
          <label class="grid gap-1.5">
            <span class="text-sm text-slate-600">Email</span>
            <InputText
              v-model="form.email"
              type="email"
              placeholder="jan@example.com"
              autocomplete="email"
              required
              fluid
            />
          </label>
          <label class="grid gap-1.5">
            <span class="text-sm text-slate-600">Haslo</span>
            <Password v-model="form.password" :feedback="false" toggle-mask placeholder="Twoje haslo" required fluid />
          </label>
          <label v-if="isRegister" class="grid gap-1.5">
            <span class="text-sm text-slate-600">Powtorz haslo</span>
            <Password
              v-model="form.password_confirmation"
              :feedback="false"
              toggle-mask
              placeholder="Powtorz haslo"
              fluid
            />
          </label>
          <Button
            :label="
              authStore.loading
                ? isRegister
                  ? 'Tworzenie konta...'
                  : 'Logowanie...'
                : isRegister
                  ? 'Utworz konto'
                  : 'Zaloguj'
            "
            :icon="isRegister ? 'pi pi-user-plus' : 'pi pi-sign-in'"
            iconPos="right"
            :loading="authStore.loading"
            type="submit"
            severity="success"
            size="large"
            fluid
          />
        </form>
        <Message v-if="error" severity="error" class="mt-4">{{ error }}</Message>
      </template>
    </Card>
  </main>
</template>
