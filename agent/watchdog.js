import { STUCK_STATES } from './events/types.js'
import { TERMINAL_STATES } from './state/machine.js'

export const DEFAULT_STUCK_MS = 90_000

export function isStuckState(state) {
  return STUCK_STATES.includes(state)
}

/**
 * Fail IMPLEMENTING/BUILDING/DEBUGGING/REPAIRING if lastActivity stalls.
 * Never leaves those states running with no heartbeat.
 */
export function startStuckWatchdog(task, { stuckMs = DEFAULT_STUCK_MS, intervalMs = 1000, onStuck } = {}) {
  const ms = Number(process.env.AI_TASK_STUCK_MS) > 0 && stuckMs === DEFAULT_STUCK_MS
    ? Number(process.env.AI_TASK_STUCK_MS)
    : Number(stuckMs) > 0
      ? Number(stuckMs)
      : DEFAULT_STUCK_MS
  const every = Number(intervalMs) > 0 ? Number(intervalMs) : 1000
  let fired = false
  const timer = setInterval(() => {
    if (fired || !task || TERMINAL_STATES.includes(task.state)) return
    if (!isStuckState(task.state)) return
    const last = Date.parse(task.lastActivity || task.startedAt || 0)
    if (!Number.isFinite(last)) return
    if (Date.now() - last <= ms) return
    fired = true
    task.recovered = true
    onStuck?.({ state: task.state, idleMs: Date.now() - last })
  }, every)
  return () => clearInterval(timer)
}
