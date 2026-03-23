import { db, type ResourceName } from '@/db/appDb'

export const readCachedResource = async <T>(resource: ResourceName): Promise<T[]> => {
  const rows = await db.entities.where('resource').equals(resource).toArray()
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

export const writeCachedResource = async <T extends { id: number }>(resource: ResourceName, records: T[]) => {
  const nowIso = new Date().toISOString()
  const current = await db.entities.where('resource').equals(resource).toArray()
  const staleRemoteRowIds = current
    .filter((entry) => entry.entity_id > 0)
    .map((entry) => entry.id)
    .filter(Boolean) as number[]

  await db.transaction('rw', db.entities, async () => {
    if (staleRemoteRowIds.length > 0) {
      await db.entities.bulkDelete(staleRemoteRowIds)
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

export const upsertCachedResourceEntity = async <T extends { id: number }>(resource: ResourceName, record: T) => {
  const existing = await db.entities.where('[resource+entity_id]').equals([resource, record.id]).first()
  await db.entities.put({
    id: existing?.id,
    resource,
    entity_id: record.id,
    payload: record as Record<string, unknown>,
    updated_at: new Date().toISOString(),
  })
}

export const removeCachedResourceEntity = async (resource: ResourceName, entityId: number) => {
  await db.entities.where('[resource+entity_id]').equals([resource, entityId]).delete()
}

export const replaceCachedResourceEntityId = async (
  resource: ResourceName,
  previousEntityId: number,
  nextEntity: { id: number },
) => {
  const existing = await db.entities.where('[resource+entity_id]').equals([resource, previousEntityId]).first()
  await db.transaction('rw', db.entities, async () => {
    if (existing?.id) {
      await db.entities.delete(existing.id)
    }
    const duplicate = await db.entities.where('[resource+entity_id]').equals([resource, nextEntity.id]).first()
    await db.entities.put({
      id: duplicate?.id,
      resource,
      entity_id: nextEntity.id,
      payload: nextEntity as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    })
  })
}
