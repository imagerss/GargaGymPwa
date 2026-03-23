import { v4 as uuidv4 } from 'uuid'

import { db, type ResourceName, type SyncAction } from '@/db/appDb'
import { apiClient } from '@/services/apiClient'
import { replaceCachedResourceEntityId, upsertCachedResourceEntity } from '@/services/offlineEntityService'
import { trainingFlowService } from '@/services/trainingFlowService'

const resources: ResourceName[] = [
  'workout_plans',
  'workout_sessions',
  'exercises',
  'body_measurements',
  'progress_photos',
  'goals',
]

const upsertEntityCache = async (resource: ResourceName, entity: Record<string, unknown>) => {
  const entityId = Number(entity.id)
  if (!entityId) return

  const existing = await db.entities.where('[resource+entity_id]').equals([resource, entityId]).first()
  await db.entities.put({
    id: existing?.id,
    resource,
    entity_id: entityId,
    payload: entity,
    updated_at: new Date().toISOString(),
  })
}

export const syncService = {
  async queueOperation(payload: {
    resource: ResourceName
    action: SyncAction
    entity_id?: number
    local_entity_id?: number
    local_ref?: string
    data?: Record<string, unknown>
  }) {
    await db.operations.add({
      client_id: uuidv4(),
      ...payload,
      created_at: new Date().toISOString(),
      failed: false,
    })
  },

  async pendingCount(): Promise<number> {
    const operations = await db.operations.toArray()
    return operations.filter((operation) => !operation.failed).length
  },

  async discardLocalEntity(resource: ResourceName, localEntityId: number, localRef?: string) {
    const operations = await db.operations.toArray()
    const removableIds = operations
      .filter(
        (operation) =>
          operation.resource === resource &&
          ((operation.local_entity_id != null && operation.local_entity_id === localEntityId) ||
            (localRef && operation.local_ref === localRef)),
      )
      .map((operation) => operation.id)
      .filter(Boolean) as number[]

    if (removableIds.length > 0) {
      await db.operations.bulkDelete(removableIds)
    }
  },

  async pushQueue() {
    const operations = await db.operations.toArray()
    if (operations.length === 0) return null

    const response = await apiClient.post('/sync/push', {
      operations: operations.map((operation) => ({
        client_id: operation.client_id,
        resource: operation.resource,
        action: operation.action,
        id: operation.entity_id,
        data: operation.data,
      })),
    })

    const applied = Array.isArray(response.data?.data?.applied) ? response.data.data.applied : []
    const appliedClientIds = new Set<string>()

    for (const appliedOperation of applied) {
      const clientId = String(appliedOperation?.client_id ?? '')
      if (!clientId) continue
      appliedClientIds.add(clientId)

      const original = operations.find((operation) => operation.client_id === clientId)
      const createdEntityId = Number(appliedOperation?.result?.id ?? 0)
      if (!original || original.action !== 'create' || createdEntityId <= 0) continue

      if (original.local_entity_id != null && original.local_entity_id < 0) {
        const nextEntity = {
          ...(original.data ?? {}),
          id: createdEntityId,
        }
        await replaceCachedResourceEntityId(original.resource, original.local_entity_id, nextEntity)
      } else if (original.data) {
        await upsertCachedResourceEntity(original.resource, {
          ...(original.data ?? {}),
          id: createdEntityId,
        })
      }

      if (original.resource === 'workout_plans' && original.local_entity_id != null && original.local_entity_id < 0) {
        trainingFlowService.migratePlanConfig(original.local_entity_id, createdEntityId)
        const sessionRows = await db.entities.where('resource').equals('workout_sessions').toArray()
        for (const row of sessionRows) {
          const workoutPlanId = Number((row.payload as { workout_plan_id?: number | null }).workout_plan_id ?? 0)
          if (workoutPlanId !== original.local_entity_id) continue
          await db.entities.put({
            ...row,
            payload: {
              ...row.payload,
              workout_plan_id: createdEntityId,
            },
            updated_at: new Date().toISOString(),
          })
        }
      }
      if (original.resource === 'exercises' && original.local_entity_id != null && original.local_entity_id < 0) {
        trainingFlowService.migrateExerciseReferences(original.local_entity_id, createdEntityId)
      }
      if (original.resource === 'workout_sessions' && original.local_ref) {
        trainingFlowService.attachRemoteSessionId(original.local_ref, createdEntityId)
      }
    }

    const appliedIds = operations
      .filter((operation) => appliedClientIds.has(operation.client_id))
      .map((operation) => operation.id)
      .filter(Boolean) as number[]

    if (appliedIds.length > 0) {
      await db.operations.bulkDelete(appliedIds)
    }

    return response.data?.data?.server_time ?? null
  },

  async pullChanges(updatedSince?: string) {
    const params = updatedSince ? { updated_since: updatedSince, limit: 200 } : { limit: 200 }
    const response = await apiClient.get('/sync/pull', { params })
    const data = response.data?.data
    if (!data) return null

    for (const resource of resources) {
      const records = data[resource] ?? []
      for (const entity of records) {
        await upsertEntityCache(resource, entity)
      }

      const deletions = data.deletions?.[resource] ?? []
      for (const deletion of deletions) {
        await db.entities.where('[resource+entity_id]').equals([resource, deletion.id]).delete()
      }
    }

    return data.server_time ?? null
  },
}
