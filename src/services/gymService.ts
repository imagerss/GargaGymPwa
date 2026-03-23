import { apiClient } from '@/services/apiClient'
import { db, type ResourceName } from '@/db/appDb'
import { syncService } from '@/services/syncService'

export interface WorkoutPlan {
  id: number
  name: string
  description?: string | null
  is_active?: boolean
}

export interface Exercise {
  id: number
  name: string
  muscle_group?: string | null
}

export interface WorkoutSession {
  id: number
  started_at: string
  status: string
  workout_plan_id?: number | null
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

const readCachedResource = async <T>(resource: ResourceName): Promise<T[]> => {
  const rows = (await db.entities.toArray()).filter((entry) => entry.resource === resource)
  const uniqueByEntityId = new Map<number, (typeof rows)[number]>()

  for (const row of rows) {
    const previous = uniqueByEntityId.get(row.entity_id)
    if (!previous) {
      uniqueByEntityId.set(row.entity_id, row)
      continue
    }

    const prevTs = Date.parse(previous.updated_at)
    const rowTs = Date.parse(row.updated_at)
    if (Number.isNaN(prevTs) || rowTs >= prevTs) {
      uniqueByEntityId.set(row.entity_id, row)
    }
  }

  const uniqueRows = Array.from(uniqueByEntityId.values())
  const duplicateRowIds = rows
    .filter((row) => uniqueByEntityId.get(row.entity_id)?.id !== row.id)
    .map((row) => row.id)
    .filter(Boolean) as number[]

  if (duplicateRowIds.length > 0) {
    void db.entities.bulkDelete(duplicateRowIds)
  }

  return uniqueRows
    .map((entry) => entry.payload as T)
    .sort((a, b) => Number((b as { id?: number }).id ?? 0) - Number((a as { id?: number }).id ?? 0))
}

const writeCachedResource = async <T extends { id: number }>(resource: ResourceName, records: T[]) => {
  const nowIso = new Date().toISOString()
  const current = await db.entities.toArray()
  const staleRows = current.filter((entry) => entry.resource === resource).map((entry) => entry.id).filter(Boolean) as number[]

  await db.transaction('rw', db.entities, async () => {
    if (staleRows.length > 0) {
      await db.entities.bulkDelete(staleRows)
    }
    if (records.length > 0) {
      await db.entities.bulkPut(
        records.map((record) => ({
          resource,
          entity_id: record.id,
          payload: record as Record<string, unknown>,
          updated_at: nowIso,
        })),
      )
    }
  })
}

const upsertCachedResourceEntity = async <T extends { id: number }>(resource: ResourceName, record: T) => {
  const existing = await db.entities.where('[resource+entity_id]').equals([resource, record.id]).first()
  await db.entities.put({
    id: existing?.id,
    resource,
    entity_id: record.id,
    payload: record as Record<string, unknown>,
    updated_at: new Date().toISOString(),
  })
}

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
  const cached = await readCachedResource<T>(resource)
  if (cached.length > 0) {
    const refreshed = await maybeRefreshCacheFromSync()
    if (refreshed) {
      return readCachedResource<T>(resource)
    }
    return cached
  }

  if (!navigator.onLine) return []

  const response = await apiClient.get(endpoint)
  const records = extractList<T>(response.data)
  await writeCachedResource(resource, records)
  return records
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
  async listBodyMeasurements(): Promise<BodyMeasurement[]> {
    return listWithCache<BodyMeasurement>('body_measurements', '/body-measurements')
  },
  async listGoals(): Promise<Goal[]> {
    return listWithCache<Goal>('goals', '/goals')
  },
  async listProgressPhotos(): Promise<ProgressPhoto[]> {
    return listWithCache<ProgressPhoto>('progress_photos', '/progress-photos')
  },
  async statsOverview(): Promise<Record<string, unknown>> {
    const response = await apiClient.get('/stats/overview')
    return extract<Record<string, unknown>>(response.data) ?? {}
  },
}
