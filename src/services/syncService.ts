import { v4 as uuidv4 } from 'uuid'

import { db, type ResourceName, type SyncAction } from '@/db/appDb'
import { apiClient } from '@/services/apiClient'

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

    await db.operations.clear()
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
