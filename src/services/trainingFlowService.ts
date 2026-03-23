export interface PlanExerciseConfig {
  id: string
  exercise_id: number
  exercise_name: string
  target_sets: number
  target_reps: number
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
}

const PLAN_CONFIGS_KEY = 'training_plan_configs_v1'
const SESSION_LOGS_KEY = 'training_session_logs_v1'

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

export const trainingFlowService = {
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
      const planId = server.workout_plan_id ?? 0
      const existing = localByRemoteId.get(server.id)
      const serverStatus: SessionLog['status'] = server.status === 'completed' ? 'completed' : 'active'

      if (existing) {
        const hydratedExercises =
          existing.exercises.length > 0 ? existing.exercises : buildExercisesFromPlanConfig(planId)
        result.push({
          ...existing,
          remote_session_id: server.id,
          plan_id: planId,
          plan_name: planNameById[planId] ?? existing.plan_name ?? `Plan #${planId}`,
          started_at: server.started_at,
          status: serverStatus,
          exercises: hydratedExercises,
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
        const hydratedExercises = serverStatus === 'active' ? buildExercisesFromPlanConfig(planId) : []
        result.push({
          id: `srv-${server.id}`,
          remote_session_id: server.id,
          plan_id: planId,
          plan_name: planNameById[planId] ?? `Plan #${planId}`,
          started_at: server.started_at,
          status: serverStatus,
          exercises: hydratedExercises,
        })
      }
    }

    // Keep unsynced drafts only while they are active.
    for (const entry of local) {
      if (!entry.remote_session_id && entry.status === 'active') {
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
