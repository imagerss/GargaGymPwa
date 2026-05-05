import { apiClient } from '@/services/apiClient'
import { db, type ResourceName } from '@/db/appDb'
import {
  readCachedResource,
  removeCachedResourceEntity,
  replaceCachedResourceEntityId,
  upsertCachedResourceEntity,
  writeCachedResource,
} from '@/services/offlineEntityService'
import { syncService } from '@/services/syncService'

export interface WorkoutPlan {
  id: number
  name: string
  description?: string | null
  is_active?: boolean
  workout_days?: Array<{
    id: number
    name: string
    day_order: number
    workout_day_exercises?: Array<{
      id: number
      exercise_id: number
      target_sets?: number | null
      target_reps_min?: number | null
      target_reps_max?: number | null
      sort_order: number
    }>
  }>
}

export interface Exercise {
  id: number
  name: string
  muscle_group?: string | null
}

export interface WorkoutSession {
  id: number
  started_at: string
  ended_at?: string | null
  status: string
  workout_plan_id?: number | null
  notes?: string | null
  workout_session_exercises?: WorkoutSessionExercise[]
}

export interface WorkoutSessionExercise {
  id: number
  workout_session_id?: number
  exercise_id: number
  order_index?: number
  notes?: string | null
  exercise?: Exercise
  workout_sets?: WorkoutSet[]
}

export interface WorkoutSet {
  id: number
  workout_session_exercise_id: number
  set_number?: number | null
  reps: number
  weight: number | string
  rir?: number | null
  is_warmup?: boolean
  completed_at?: string | null
}

export interface BodyMeasurement {
  id: number
  measured_at: string
  weight?: number | null
  waist_cm?: number | null
}

export interface Goal {
  id: number
  title: string
  type: string
  target_value: number | string
  current_value?: number | string | null
  unit?: string
  status?: string
}

export interface ProgressPhoto {
  id: number
  photo_path?: string
  taken_at?: string
  note?: string | null
}

type ApiEnvelope<T> = { data?: T | { data?: T }; user?: T }

const extract = <T>(payload: ApiEnvelope<T>): T => {
  if (payload.user) return payload.user
  if (payload.data && typeof payload.data === 'object' && 'data' in payload.data) {
    return (payload.data as { data: T }).data
  }
  return payload.data as T
}

const extractList = <T>(payload: ApiEnvelope<T[]>): T[] => {
  const data = extract(payload)
  return Array.isArray(data) ? data : []
}

const CACHE_REFRESH_INTERVAL_MS = 60 * 1000
const CACHE_REFRESH_KEY = 'cache_last_refresh_at_ms'
let refreshPromise: Promise<boolean> | null = null

const maybeRefreshCacheFromSync = async (): Promise<boolean> => {
  if (!navigator.onLine) return false
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
  try {
    const refreshEntry = await db.kv.get(CACHE_REFRESH_KEY)
    const lastRefreshMs = Number(refreshEntry?.value ?? 0)
    if (Date.now() - lastRefreshMs < CACHE_REFRESH_INTERVAL_MS) return false

    const lastSyncAt = (await db.kv.get('last_sync_at'))?.value
    const serverTime = await syncService.pullChanges(lastSyncAt)
    if (serverTime) {
      await db.kv.put({ key: 'last_sync_at', value: serverTime })
    }
    await db.kv.put({ key: CACHE_REFRESH_KEY, value: String(Date.now()) })
    return true
  } catch {
    // Cache refresh is best-effort and should not break views.
    return false
  } finally {
    refreshPromise = null
  }
  })()
  return refreshPromise
}

const listWithCache = async <T extends { id: number }>(resource: ResourceName, endpoint: string): Promise<T[]> => {
  if (navigator.onLine) {
    try {
      const response = await apiClient.get(endpoint)
      const records = extractList<T>(response.data)
      await writeCachedResource(resource, records)
      return records
    } catch {
      // Fall back to cache when the server cannot be reached.
    }
  }

  const cached = await readCachedResource<T>(resource)
  if (cached.length > 0) {
    return cached
  }

  return []
}

export const gymService = {
  async listWorkoutPlans(): Promise<WorkoutPlan[]> {
    return listWithCache<WorkoutPlan>('workout_plans', '/workout-plans')
  },
  async listExercises(): Promise<Exercise[]> {
    return listWithCache<Exercise>('exercises', '/exercises')
  },
  async listWorkoutSessions(): Promise<WorkoutSession[]> {
    return listWithCache<WorkoutSession>('workout_sessions', '/workout-sessions')
  },
  async upsertWorkoutSessionCache(session: WorkoutSession): Promise<void> {
    await upsertCachedResourceEntity<WorkoutSession>('workout_sessions', session)
  },
  async upsertWorkoutPlanCache(plan: WorkoutPlan): Promise<void> {
    await upsertCachedResourceEntity<WorkoutPlan>('workout_plans', plan)
  },
  async removeWorkoutPlanCache(planId: number): Promise<void> {
    await removeCachedResourceEntity('workout_plans', planId)
  },
  async upsertExerciseCache(exercise: Exercise): Promise<void> {
    await upsertCachedResourceEntity<Exercise>('exercises', exercise)
  },
  async removeExerciseCache(exerciseId: number): Promise<void> {
    await removeCachedResourceEntity('exercises', exerciseId)
  },
  async listBodyMeasurements(): Promise<BodyMeasurement[]> {
    return listWithCache<BodyMeasurement>('body_measurements', '/body-measurements')
  },
  async upsertBodyMeasurementCache(measurement: BodyMeasurement): Promise<void> {
    await upsertCachedResourceEntity<BodyMeasurement>('body_measurements', measurement)
  },
  async removeBodyMeasurementCache(measurementId: number): Promise<void> {
    await removeCachedResourceEntity('body_measurements', measurementId)
  },
  async listGoals(): Promise<Goal[]> {
    return listWithCache<Goal>('goals', '/goals')
  },
  async upsertGoalCache(goal: Goal): Promise<void> {
    await upsertCachedResourceEntity<Goal>('goals', goal)
  },
  async removeGoalCache(goalId: number): Promise<void> {
    await removeCachedResourceEntity('goals', goalId)
  },
  async listProgressPhotos(): Promise<ProgressPhoto[]> {
    return listWithCache<ProgressPhoto>('progress_photos', '/progress-photos')
  },
  async replaceCachedEntityId(resource: ResourceName, previousEntityId: number, nextEntity: { id: number }) {
    await replaceCachedResourceEntityId(resource, previousEntityId, nextEntity)
  },
  async statsOverview(): Promise<Record<string, unknown>> {
    const response = await apiClient.get('/stats/overview')
    return extract<Record<string, unknown>>(response.data) ?? {}
  },
}
