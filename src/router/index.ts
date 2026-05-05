import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import DashboardView from '@/views/DashboardView.vue'
import ExercisesView from '@/views/ExercisesView.vue'
import LoginView from '@/views/LoginView.vue'
import MeasurementsView from '@/views/MeasurementsView.vue'
import PhotosView from '@/views/PhotosView.vue'
import PlansView from '@/views/PlansView.vue'
import ProfileView from '@/views/ProfileView.vue'
import SessionsView from '@/views/SessionsView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/login', name: 'login', component: LoginView },
    { path: '/', name: 'dashboard', component: DashboardView, meta: { auth: true } },
    { path: '/plans', name: 'plans', component: PlansView, meta: { auth: true } },
    { path: '/sessions', name: 'sessions', component: SessionsView, meta: { auth: true } },
    { path: '/exercises', name: 'exercises', component: ExercisesView, meta: { auth: true } },
    {
      path: '/measurements',
      name: 'measurements',
      component: MeasurementsView,
      meta: { auth: true },
    },
    { path: '/photos', name: 'photos', component: PhotosView, meta: { auth: true } },
    { path: '/profile', name: 'profile', component: ProfileView, meta: { auth: true } },
  ],
})

router.beforeEach(async (to) => {
  const authStore = useAuthStore()
  if (!authStore.isAuthenticated) {
    await authStore.restoreSession()
  }

  if (to.meta.auth && !authStore.isAuthenticated) return { name: 'login' }
  if (to.name === 'login' && authStore.isAuthenticated) return { name: 'dashboard' }
  return true
})

export default router
