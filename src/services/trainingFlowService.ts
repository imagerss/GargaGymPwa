export interface PlanExerciseConfig {
  id: string
  exercise_id: number
  exercise_name: string
  target_sets: number
  target_reps: number
  workout_day_id?: number
  workout_day_exercise_id?: number
}

export interface TrainingPlanConfig {
  plan_id: number
  exercises: PlanExerciseConfig[]
  updated_at: string
}

export interface SessionSetLog {
  set_number: number
  reps_done: number | null
  weight_kg: number | null
}

export interface SessionExerciseLog {
  exercise_id: number
  exercise_name: string
  target_sets: number
  target_reps: number
  sets: SessionSetLog[]
}

export interface SessionLog {
  id: string
  remote_session_id?: number | null
  plan_id: number
  plan_name: string
  started_at: string
  status: 'active' | 'completed'
  exercises: SessionExerciseLog[]
  finished_at?: string
  finish_photo_data_url?: string
  finish_weight_kg?: number | null
  finish_waist_cm?: number | null
}

export interface ServerSessionSnapshot {
  id: number
  started_at: string
  status: string
  workout_plan_id?: number | null
  ended_at?: string | null
  notes?: string | null
}

const PLAN_CONFIGS_KEY = 'training_plan_configs_v1'
const SESSION_LOGS_KEY = 'training_session_logs_v1'
const DIRTY_PLAN_CONFIGS_KEY = 'training_plan_configs_dirty_v1'

const parseJson = <T>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

const getPlanConfigs = (): TrainingPlanConfig[] =>
  parseJson<TrainingPlanConfig[]>(window.localStorage.getItem(PLAN_CONFIGS_KEY), [])

const setPlanConfigs = (configs: TrainingPlanConfig[]) => {
  window.localStorage.setItem(PLAN_CONFIGS_KEY, JSON.stringify(configs))
}

const getSessionLogs = (): SessionLog[] =>
  parseJson<SessionLog[]>(window.localStorage.getItem(SESSION_LOGS_KEY), [])

const setSessionLogs = (sessions: SessionLog[]) => {
  window.localStorage.setItem(SESSION_LOGS_KEY, JSON.stringify(sessions))
}

const getDirtyPlanConfigIds = (): number[] => parseJson<number[]>(window.localStorage.getItem(DIRTY_PLAN_CONFIGS_KEY), [])

const setDirtyPlanConfigIds = (planIds: number[]) => {
  window.localStorage.setItem(DIRTY_PLAN_CONFIGS_KEY, JSON.stringify(Array.from(new Set(planIds))))
}

const parseSnapshotFromNotes = (
  notes?: string | null,
): {
  exercises?: SessionExerciseLog[]
  finish_weight_kg?: number | null
  finish_waist_cm?: number | null
  finish_photo_data_url?: string
} | null => {
  if (!notes || !notes.startsWith('PWA_SNAPSHOT:')) return null
  try {
    const encoded = notes.slice('PWA_SNAPSHOT:'.length)
    const decoded = decodeURIComponent(escape(atob(encoded)))
    return JSON.parse(decoded) as {
      exercises?: SessionExerciseLog[]
      finish_weight_kg?: number | null
      finish_waist_cm?: number | null
      finish_photo_data_url?: string
    }
  } catch {
    return null
  }
}

const buildExercisesFromPlanConfig = (planId: number): SessionExerciseLog[] => {
  const config = getPlanConfigs().find((entry) => entry.plan_id === planId)
  if (!config || config.exercises.length === 0) return []
  return config.exercises.map((item) => ({
    exercise_id: item.exercise_id,
    exercise_name: item.exercise_name,
    target_sets: item.target_sets,
    target_reps: item.target_reps,
    sets: Array.from({ length: item.target_sets }, (_, idx) => ({
      set_number: idx + 1,
      reps_done: null,
      weight_kg: null,
    })),
  }))
}

const resolvePlanName = (
  planId: number | null | undefined,
  planNameById: Record<number, string>,
  existingPlanName?: string,
) => {
  if (planId != null && planId > 0 && planNameById[planId]) {
    return planNameById[planId]
  }

  if (existingPlanName && existingPlanName !== 'Plan #0') {
    return existingPlanName
  }

  if (planId != null && planId > 0) {
    return `Plan #${planId}`
  }

  return 'Plan treningowy'
}

export const trainingFlowService = {
  markPlanConfigDirty(planId: number) {
    const next = new Set(getDirtyPlanConfigIds())
    next.add(planId)
    setDirtyPlanConfigIds(Array.from(next))
  },

  clearPlanConfigDirty(planId: number) {
    setDirtyPlanConfigIds(getDirtyPlanConfigIds().filter((entry) => entry !== planId))
  },

  listDirtyPlanConfigIds(): number[] {
    return getDirtyPlanConfigIds()
  },

  listPlanConfigs(): TrainingPlanConfig[] {
    return getPlanConfigs()
  },

  getPlanConfig(planId: number): TrainingPlanConfig | null {
    return getPlanConfigs().find((entry) => entry.plan_id === planId) ?? null
  },

  prunePlanConfigs(validPlanIds: number[]): TrainingPlanConfig[] {
    const valid = new Set(validPlanIds)
    const filtered = getPlanConfigs().filter((entry) => valid.has(entry.plan_id))
    setPlanConfigs(filtered)
    return filtered
  },

  replacePlanConfigs(configs: TrainingPlanConfig[]): TrainingPlanConfig[] {
    setPlanConfigs(configs)
    return configs
  },

  addExerciseToPlan(
    planId: number,
    exercise: { id: number; name: string },
    targetSets: number,
    targetReps: number,
  ): TrainingPlanConfig {
    const configs = getPlanConfigs()
    const existing = configs.find((entry) => entry.plan_id === planId)
    const newItem: PlanExerciseConfig = {
      id: uid(),
      exercise_id: exercise.id,
      exercise_name: exercise.name,
      target_sets: targetSets,
      target_reps: targetReps,
    }

    if (existing) {
      existing.exercises.push(newItem)
      existing.updated_at = new Date().toISOString()
    } else {
      configs.push({
        plan_id: planId,
        exercises: [newItem],
        updated_at: new Date().toISOString(),
      })
    }

    setPlanConfigs(configs)
    return configs.find((entry) => entry.plan_id === planId)!
  },

  removeExerciseFromPlan(planId: number, itemId: string): TrainingPlanConfig | null {
    const configs = getPlanConfigs()
    const existing = configs.find((entry) => entry.plan_id === planId)
    if (!existing) return null
    existing.exercises = existing.exercises.filter((item) => item.id !== itemId)
    existing.updated_at = new Date().toISOString()
    setPlanConfigs(configs)
    return existing
  },

  removePlanConfig(planId: number) {
    const filtered = getPlanConfigs().filter((entry) => entry.plan_id !== planId)
    setPlanConfigs(filtered)
    this.clearPlanConfigDirty(planId)
  },

  migratePlanConfig(oldPlanId: number, newPlanId: number): TrainingPlanConfig | null {
    const sessions = getSessionLogs()
    let sessionsChanged = false
    for (const session of sessions) {
      if (session.plan_id === oldPlanId) {
        session.plan_id = newPlanId
        sessionsChanged = true
      }
    }
    if (sessionsChanged) {
      setSessionLogs(sessions)
    }

    if (oldPlanId === newPlanId) return this.getPlanConfig(newPlanId)
    const configs = getPlanConfigs()
    const existing = configs.find((entry) => entry.plan_id === oldPlanId)
    if (!existing) return null

    const target = configs.find((entry) => entry.plan_id === newPlanId)
    if (target) {
      target.exercises = [...target.exercises, ...existing.exercises]
      target.updated_at = new Date().toISOString()
      const filtered = configs.filter((entry) => entry.plan_id !== oldPlanId)
      setPlanConfigs(filtered)
      if (getDirtyPlanConfigIds().includes(oldPlanId)) {
        this.clearPlanConfigDirty(oldPlanId)
        this.markPlanConfigDirty(newPlanId)
      }
      return target
    }

    existing.plan_id = newPlanId
    existing.updated_at = new Date().toISOString()
    setPlanConfigs(configs)
    if (getDirtyPlanConfigIds().includes(oldPlanId)) {
      this.clearPlanConfigDirty(oldPlanId)
      this.markPlanConfigDirty(newPlanId)
    }
    return existing
  },

  migrateExerciseReferences(oldExerciseId: number, newExerciseId: number) {
    const configs = getPlanConfigs()
    let didChange = false

    for (const config of configs) {
      for (const exercise of config.exercises) {
        if (exercise.exercise_id === oldExerciseId) {
          exercise.exercise_id = newExerciseId
          didChange = true
        }
      }
    }

    const sessions = getSessionLogs()
    for (const session of sessions) {
      for (const exercise of session.exercises) {
        if (exercise.exercise_id === oldExerciseId) {
          exercise.exercise_id = newExerciseId
          didChange = true
        }
      }
    }

    if (didChange) {
      setPlanConfigs(configs)
      setSessionLogs(sessions)
    }
  },

  attachRemoteSessionId(sessionId: string, remoteSessionId: number) {
    const sessions = getSessionLogs()
    const session = sessions.find((entry) => entry.id === sessionId)
    if (!session) return null
    session.remote_session_id = remoteSessionId
    setSessionLogs(sessions)
    return session
  },

  listSessionLogs(): SessionLog[] {
    return getSessionLogs().sort((a, b) => b.started_at.localeCompare(a.started_at))
  },

  reconcileSessionLogsWithServer(
    serverSessions: ServerSessionSnapshot[],
    planNameById: Record<number, string>,
  ): SessionLog[] {
    const local = getSessionLogs()
    const localByRemoteId = new Map<number, SessionLog>()
    const result: SessionLog[] = []

    for (const entry of local) {
      if (entry.remote_session_id && entry.remote_session_id > 0) {
        localByRemoteId.set(entry.remote_session_id, entry)
      }
    }

    for (const server of serverSessions) {
      const planId = server.workout_plan_id ?? null
      const existing = localByRemoteId.get(server.id)
      const serverStatus: SessionLog['status'] = server.status === 'completed' ? 'completed' : 'active'
      const snapshot = parseSnapshotFromNotes(server.notes)

      if (existing) {
        const hydratedExercises =
          existing.exercises.length > 0
            ? existing.exercises
            : snapshot?.exercises && snapshot.exercises.length > 0
              ? snapshot.exercises
              : buildExercisesFromPlanConfig(planId ?? 0)
        result.push({
          ...existing,
          remote_session_id: server.id,
          plan_id: planId ?? existing.plan_id ?? 0,
          plan_name: resolvePlanName(planId, planNameById, existing.plan_name),
          started_at: server.started_at,
          status: serverStatus,
          exercises: hydratedExercises,
          finished_at: server.ended_at ?? existing.finished_at,
          finish_weight_kg: snapshot?.finish_weight_kg ?? existing.finish_weight_kg ?? null,
          finish_waist_cm: snapshot?.finish_waist_cm ?? existing.finish_waist_cm ?? null,
          finish_photo_data_url: snapshot?.finish_photo_data_url ?? existing.finish_photo_data_url,
          // Server is source of truth: clear local-only completion metadata unless completed on server.
          ...(serverStatus === 'completed'
            ? {}
            : {
                finished_at: undefined,
                finish_photo_data_url: undefined,
                finish_weight_kg: null,
                finish_waist_cm: null,
              }),
        })
      } else {
        const hydratedExercises =
          snapshot?.exercises && snapshot.exercises.length > 0
            ? snapshot.exercises
            : serverStatus === 'active'
              ? buildExercisesFromPlanConfig(planId ?? 0)
              : []
        result.push({
          id: `srv-${server.id}`,
          remote_session_id: server.id,
          plan_id: planId ?? 0,
          plan_name: resolvePlanName(planId, planNameById),
          started_at: server.started_at,
          status: serverStatus,
          exercises: hydratedExercises,
          finished_at: server.ended_at ?? undefined,
          finish_weight_kg: snapshot?.finish_weight_kg ?? null,
          finish_waist_cm: snapshot?.finish_waist_cm ?? null,
          finish_photo_data_url: snapshot?.finish_photo_data_url,
        })
      }
    }

    // Keep unsynced local sessions (active and completed) until they are mapped to a remote ID.
    for (const entry of local) {
      if (!entry.remote_session_id) {
        result.push(entry)
      }
    }

    result.sort((a, b) => b.started_at.localeCompare(a.started_at))
    setSessionLogs(result)
    return result
  },

  createSessionFromPlan(plan: { id: number; name: string }, remoteSessionId?: number | null): SessionLog | null {
    const config = this.getPlanConfig(plan.id)
    if (!config || config.exercises.length === 0) return null

    const session: SessionLog = {
      id: uid(),
      remote_session_id: remoteSessionId ?? null,
      plan_id: plan.id,
      plan_name: plan.name,
      started_at: new Date().toISOString(),
      status: 'active',
      exercises: config.exercises.map((item) => ({
        exercise_id: item.exercise_id,
        exercise_name: item.exercise_name,
        target_sets: item.target_sets,
        target_reps: item.target_reps,
        sets: Array.from({ length: item.target_sets }, (_, idx) => ({
          set_number: idx + 1,
          reps_done: null,
          weight_kg: null,
        })),
      })),
    }

    const sessions = getSessionLogs()
    sessions.unshift(session)
    setSessionLogs(sessions)
    return session
  },

  updateSessionSet(
    sessionId: string,
    exerciseId: number,
    setNumber: number,
    payload: { reps_done?: number | null; weight_kg?: number | null },
  ): SessionLog | null {
    const sessions = getSessionLogs()
    const session = sessions.find((entry) => entry.id === sessionId)
    if (!session) return null
    const exercise = session.exercises.find((entry) => entry.exercise_id === exerciseId)
    if (!exercise) return null
    const set = exercise.sets.find((entry) => entry.set_number === setNumber)
    if (!set) return null

    if (Object.hasOwn(payload, 'reps_done')) {
      set.reps_done = payload.reps_done ?? null
    }
    if (Object.hasOwn(payload, 'weight_kg')) {
      set.weight_kg = payload.weight_kg ?? null
    }
    setSessionLogs(sessions)
    return session
  },

  completeSession(
    sessionId: string,
    payload: {
      finish_photo_data_url?: string
      finish_weight_kg?: number | null
      finish_waist_cm?: number | null
    },
  ): SessionLog | null {
    const sessions = getSessionLogs()
    const session = sessions.find((entry) => entry.id === sessionId)
    if (!session) return null
    session.status = 'completed'
    session.finished_at = new Date().toISOString()
    session.finish_photo_data_url = payload.finish_photo_data_url
    session.finish_weight_kg = payload.finish_weight_kg ?? null
    session.finish_waist_cm = payload.finish_waist_cm ?? null
    setSessionLogs(sessions)
    return session
  },
}
