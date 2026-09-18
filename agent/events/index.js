import { TASK_EVENT_SET, EVENT_TO_STEP } from './types.js'
import { publishTaskEvent } from './bus.js'

export { TASK_EVENTS, TASK_EVENT_SET, EVENT_TO_STEP, STUCK_STATES } from './types.js'
export { publishTaskEvent, subscribeTaskEvents } from './bus.js'

export function snapshotAgent(task) {
  if (!task) return null
  const last = (task.ops || []).at(-1) || null
  return {
    prompt: task.prompt || '',
    state: task.state || 'IDLE',
    intent: task.intent || null,
    currentOperation: last?.message || last?.type || '',
    lastEvent: last?.type || null,
    filesChanged: [...(task.filesChanged || [])],
    repairAttempts: task.repairAttempts || 0,
    lastActivity: task.lastActivity || task.startedAt || null,
    build: task.build ? { ok: task.build.ok, message: task.build.message || '' } : null,
    browser: task.browser
      ? { ran: task.browser.ran, skipped: task.browser.skipped, passed: task.browser.passed, message: task.browser.message || '' }
      : null,
    visual: task.design
      ? { mode: task.design.mode, direction: task.design.spec?.direction || task.design.dna?.direction || null }
      : null,
    review: task.review ? { ok: task.review.ok, message: task.review.message || '' } : null,
    error: task.success === false ? task.message : null,
    summary: task.message || '',
    recovered: Boolean(task.recovered),
  }
}

export function record(task, phase, message, extra = {}) {
  const row = {
    at: new Date().toISOString(),
    phase,
    state: task?.state || null,
    role: extra.role || null,
    message: message || '',
    detail: extra.detail || null,
  }
  if (task) {
    task.events.push(row)
    if (phase && task.phases[task.phases.length - 1] !== phase) task.phases.push(phase)
    task.lastActivity = row.at
  }
  return row
}

/**
 * Emit a real operation event. Never called for planned/future work.
 */
export function emitTaskEvent(task, type, message, extra = {}) {
  if (!TASK_EVENT_SET.has(type)) return null
  const event = {
    type,
    at: new Date().toISOString(),
    message: message || type,
    state: task?.state || null,
    path: extra.path || null,
    detail: extra.detail || null,
    cancelled: Boolean(extra.cancelled),
  }
  if (task) {
    task.ops = task.ops || []
    task.ops.push(event)
    task.lastActivity = event.at
    record(task, extra.phase || task.phases?.at(-1) || 'OBSERVE', event.message, extra)
    extra.onEvent?.(event, task)
    task.onEvent?.(event, task)
    if (task.jobId) publishTaskEvent(task.jobId, event)
  }
  return event
}

export function progressFromEvent(event, task) {
  if (!event) return {}
  const pct = {
    TASK_STARTED: 4,
    PROJECT_INSPECTED: 12,
    PLAN_CREATED: 22,
    FILE_READ: 30,
    FILE_CHANGED: 42,
    COMMAND_STARTED: 48,
    BUILD_STARTED: 55,
    BUILD_FAILED: 55,
    BUILD_PASSED: 68,
    COMMAND_FINISHED: 70,
    PREVIEW_STARTED: 78,
    BROWSER_STARTED: 84,
    VISUAL_CHECK_STARTED: 86,
    BROWSER_TEST_PASSED: 92,
    BROWSER_TEST_FAILED: 92,
    REPAIR_STARTED: 50,
    REPAIR_COMPLETED: 60,
    TASK_COMPLETED: 100,
    TASK_FAILED: 100,
  }[event.type]
  return {
    currentStep: EVENT_TO_STEP[event.type] || 'implement',
    ...(pct != null ? { progress: pct } : {}),
    activityEvent: event,
    agent: snapshotAgent(task),
  }
}
