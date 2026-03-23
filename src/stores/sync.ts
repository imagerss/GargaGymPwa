import { ref } from 'vue'
import { defineStore } from 'pinia'

import { db } from '@/db/appDb'
import { syncService } from '@/services/syncService'

export const useSyncStore = defineStore('sync', () => {
  const isSyncing = ref(false)
  const lastSyncAt = ref<string | null>(null)
  const pendingOperations = ref(0)
  const error = ref<string | null>(null)

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
      const pushServerTime = await syncService.pushQueue()
      const pullServerTime = await syncService.pullChanges(lastSyncAt.value ?? undefined)
      const serverTime = pullServerTime ?? pushServerTime

      if (serverTime) {
        lastSyncAt.value = serverTime
        await db.kv.put({ key: 'last_sync_at', value: serverTime })
      }

      pendingOperations.value = await syncService.pendingCount()
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Sync failed'
    } finally {
      isSyncing.value = false
    }
  }

  return { isSyncing, lastSyncAt, pendingOperations, error, loadState, syncNow }
})
