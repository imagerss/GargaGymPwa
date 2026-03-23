import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue') },
    { path: '/', name: 'dashboard', component: () => import('@/views/DashboardView.vue'), meta: { auth: true } },
    { path: '/plans', name: 'plans', component: () => import('@/views/PlansView.vue'), meta: { auth: true } },
    { path: '/sessions', name: 'sessions', component: () => import('@/views/SessionsView.vue'), meta: { auth: true } },
    { path: '/exercises', name: 'exercises', component: () => import('@/views/ExercisesView.vue'), meta: { auth: true } },
    {
      path: '/measurements',
      name: 'measurements',
      component: () => import('@/views/MeasurementsView.vue'),
      meta: { auth: true },
    },
    { path: '/photos', name: 'photos', component: () => import('@/views/PhotosView.vue'), meta: { auth: true } },
    { path: '/profile', name: 'profile', component: () => import('@/views/ProfileView.vue'), meta: { auth: true } },
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
