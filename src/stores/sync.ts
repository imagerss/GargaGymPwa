import { ref } from 'vue'
import { defineStore } from 'pinia'

import { db } from '@/db/appDb'
import { syncService } from '@/services/syncService'
import type { ResourceName, SyncAction } from '@/db/appDb'

export const useSyncStore = defineStore('sync', () => {
  const isSyncing = ref(false)
  const lastSyncAt = ref<string | null>(null)
  const pendingOperations = ref(0)
  const error = ref<string | null>(null)
  let lastPullAtMs = 0
  let retryTimer: number | null = null

  const loadState = async () => {
    const entry = await db.kv.get('last_sync_at')
    lastSyncAt.value = entry?.value ?? null
    pendingOperations.value = await syncService.pendingCount()
  }

  const syncNow = async () => {
    if (!navigator.onLine || isSyncing.value) return

    isSyncing.value = true
    error.value = null
    try {
      const pendingBeforeSync = await syncService.pendingCount()
      const pushServerTime = await syncService.pushQueue()
      const shouldPull = pendingBeforeSync > 0 || Date.now() - lastPullAtMs > 2 * 60 * 1000
      const pullServerTime = shouldPull ? await syncService.pullChanges(lastSyncAt.value ?? undefined) : null
      const serverTime = pullServerTime ?? pushServerTime

      if (serverTime) {
        lastSyncAt.value = serverTime
        await db.kv.put({ key: 'last_sync_at', value: serverTime })
      }
      if (shouldPull) {
        lastPullAtMs = Date.now()
      }

      pendingOperations.value = await syncService.pendingCount()
      if (pendingOperations.value === 0 && retryTimer) {
        window.clearTimeout(retryTimer)
        retryTimer = null
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Sync failed'
      if (!retryTimer) {
        retryTimer = window.setTimeout(() => {
          retryTimer = null
          void syncNow()
        }, 5000)
      }
    } finally {
      isSyncing.value = false
    }
  }

  const enqueueOperation = async (payload: {
    resource: ResourceName
    action: SyncAction
    entity_id?: number
    data?: Record<string, unknown>
  }) => {
    await syncService.queueOperation(payload)
    pendingOperations.value = await syncService.pendingCount()

    // Transparent sync: run in background to keep UI responsive.
    if (navigator.onLine) {
      void syncNow()
    }
  }

  const syncIfNeeded = async () => {
    await loadState()
    if (navigator.onLine) {
      await syncNow()
    }
  }

  return { isSyncing, lastSyncAt, pendingOperations, error, loadState, syncNow, enqueueOperation, syncIfNeeded }
})
