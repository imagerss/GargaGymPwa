import Dexie, { type Table } from 'dexie'

export type ResourceName =
  | 'workout_plans'
  | 'workout_sessions'
  | 'exercises'
  | 'body_measurements'
  | 'progress_photos'
  | 'goals'

export type SyncAction = 'create' | 'update' | 'delete'

export interface OfflineOperation {
  id?: number
  client_id: string
  resource: ResourceName
  action: SyncAction
  entity_id?: number
  data?: Record<string, unknown>
  created_at: string
  failed?: boolean
}

export interface CachedEntity {
  id?: number
  resource: ResourceName
  entity_id: number
  payload: Record<string, unknown>
  updated_at: string
}

export interface KeyValueEntry {
  key: string
  value: string
}

export class AppDb extends Dexie {
  operations!: Table<OfflineOperation, number>
  entities!: Table<CachedEntity, number>
  kv!: Table<KeyValueEntry, string>

  constructor() {
    super('gargagym-db')
    this.version(1).stores({
      operations: '++id, client_id, resource, action, created_at, failed',
      entities: '++id, [resource+entity_id], updated_at',
      kv: 'key',
    })
  }
}

export const db = new AppDb()
